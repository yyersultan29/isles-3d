// UI playthrough (G4 exit check): one full 4-player hot-seat game driven through the UI only. The
// engine state is read (dev handle) to decide what to do; every action goes through a HUD control
// or the keyboard board picker. Needs the dev server.
// Usage: node scripts/playthrough.mjs [width] [height] [seed] [outDir]   (default 1440 900 2024 shots/playthrough)
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
const D = process.argv[5] ?? 'shots/playthrough'
mkdirSync(D, { recursive: true })
const [W, H, SEED] = [Number(process.argv[2] ?? 1440), Number(process.argv[3] ?? 900), Number(process.argv[4] ?? 2024)]
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
const errors = []; p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) }); p.on('pageerror', (e) => errors.push('pageerror ' + e.message))
await p.goto(`http://localhost:5173/?seed=${SEED}`, { waitUntil: 'networkidle' }); await p.waitForSelector('canvas'); await p.waitForTimeout(4000)
let rng = SEED; const rand = () => ((rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648)
const NAME = { lumber: 'wood', brick: 'brick', wool: 'wool', grain: 'grain', ore: 'ore' }
const CAP = { lumber: 'Wood', brick: 'Brick', wool: 'Wool', grain: 'Grain', ore: 'Ore' }
const RES = ['lumber', 'brick', 'wool', 'grain', 'ore']
const info = () => p.evaluate(async () => {
  const g = await import('/src/game/index.ts'); const s = window.__islesStore.getState()
  const who = s.phase.kind === 'discard' ? s.order.find((x) => s.phase.pending[x]) : s.order[s.active]
  const legal = s.phase.kind === 'gameOver' ? [] : g.legalActions(s, who).map((a) => a.type)
  const me = s.players.find((x) => x.id === who)
  return { kind: s.phase.kind, turn: s.turn, who, legal: [...new Set(legal)], res: me.resources, dev: me.devCards.map((d) => d.type), log: window.__islesStore.replayFile().actions.length, bank: s.bank }
})
const stats = { ui: {}, rejections: 0, handMismatch: 0, passScreens: 0, steps: 0 }
const did = (k) => { stats.ui[k] = (stats.ui[k] ?? 0) + 1 }
const exists = (sel) => p.$(sel).then((x) => !!x)
const click = async (sel, t = 3000) => { const el = await p.waitForSelector(sel + ':not([disabled])', { timeout: t }); await el.click(); await p.waitForTimeout(60) }
const boardPick = async () => {
  await p.waitForSelector('[data-board-picker]', { timeout: 3000 })
  await p.focus('[data-board-picker]')
  const n = Math.floor(rand() * 5)
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(40)
  for (let i = 0; i < n; i++) { await p.keyboard.press(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'][Math.floor(rand() * 4)]); await p.waitForTimeout(15) }
  await p.keyboard.press('Enter'); await p.waitForTimeout(90)
  // G6.5: the build mode now stays on while another is affordable; this driver ends it after each
  // build (Escape), as the old one-shot mode did, so the seed 2024 game replays the same actions
  if (await p.evaluate(async () => window.__islesUi.getPlacementMode())) { await p.keyboard.press('Escape'); await p.waitForTimeout(60) }
}
const buildRow = async (prefix) => {
  if (await exists('[data-build-toggle]')) { await p.click('[data-build-toggle]'); await p.waitForTimeout(60) }
  await p.focus(`button[aria-label^="${prefix}"]`); await p.keyboard.press('Enter'); await p.waitForTimeout(80)
}
const turnMemo = { turn: -1, bank: 0, p2p: 0, roads: 0 }
const checkHand = async () => {
  const st = await info()
  const shown = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('li[aria-label]')].map((x) => x.getAttribute('aria-label')).filter((t) => /^(Wood|Brick|Wool|Grain|Ore): \d+$/.test(t)).map((t) => t.split(': '))))
  if (RES.some((r) => Number(shown[CAP[r]]) !== st.res[r])) stats.handMismatch++
}
const t0 = Date.now(); let last = -1, stuck = 0
const shots = new Set()
while (stats.steps++ < 20000) {
  stats.rejections = await p.evaluate(() => document.querySelectorAll('[role=alert]').length) > 0 ? stats.rejections + 1 : stats.rejections
  if (await exists('#victory-title')) break
  if (await exists('[aria-labelledby=pass-title]')) { await click('[aria-labelledby=pass-title] button'); stats.passScreens++; did('pass'); await p.waitForTimeout(80); await checkHand(); continue }
  const s = await info()
  if (s.log === last) { if (++stuck > 25) { console.log('STUCK', JSON.stringify(s)); break } } else { stuck = 0; last = s.log }
  if (s.turn !== turnMemo.turn) Object.assign(turnMemo, { turn: s.turn, bank: 0, p2p: 0, roads: 0 })
  if (s.turn > 600) { console.log('turn cap'); break }
  for (const t of [30, 120]) if (s.turn >= t && !shots.has(t)) { shots.add(t); await p.screenshot({ path: `${D}/turn${t}.png` }) }
  try {
    if (s.kind === 'setup' || s.kind === 'roadBuilding' || s.kind === 'moveRobber') { await boardPick(); did(s.kind); continue }
    if (s.kind === 'discard') {
      const order = RES.filter((r) => s.res[r] > 0).sort((a, b) => s.res[b] - s.res[a])
      for (let i = 0; i < 12; i++) {
        if (await exists('section[aria-labelledby=discard-title] button:not([disabled]):text-is("Discard")')) break
        const r = order.find((x) => 1) ; let clicked = false
        for (const x of order) { const el = await p.$(`button[aria-label^="Discard one more ${CAP[x]}"]:not([disabled])`); if (el) { await el.click(); clicked = true; break } }
        if (!clicked) break
      }
      await click('section[aria-labelledby=discard-title] button:text-is("Discard")'); did('discard'); continue
    }
    if (s.kind === 'steal') { await click('button[aria-label^="Rob "]'); did('steal'); continue }
    const playDev = async (type, label) => {
      await click('button[aria-label^="Development cards"]')
      await click(`button[aria-label^="Play ${label}"]`)
      if (type === 'PLAY_YEAR_OF_PLENTY') {
        for (let i = 0; i < 2; i++) { const r = RES.filter((x) => s.bank[x] > 1)[Math.floor(rand() * 3)] ?? 'ore'; const el = await p.$(`button[aria-label^="Take one ${NAME[r]}"]:not([disabled])`); if (el) await el.click() }
        await click('button[aria-label="Play Year of Plenty"]')
      } else if (type === 'PLAY_MONOPOLY') { await click(`button[aria-label^="Monopoly on ${NAME[RES[Math.floor(rand() * 5)]]}"]`); await click('button[aria-label="Play Monopoly"]') }
      did(type)
    }
    if (s.kind === 'preRoll') {
      if (s.legal.includes('PLAY_KNIGHT') && rand() < 0.5) { await playDev('PLAY_KNIGHT', 'Knight'); continue }
      await click('[data-primary-action]'); did('roll'); continue
    }
    if (s.kind === 'actions') {
      if (await exists('[aria-labelledby=trade-title] button[aria-label="Cancel offer"]')) {
        // answer an open offer: each responder accepts if able, else declines; then trade or cancel
        const acc = await p.$$('button[aria-label$=": accept"]:not([disabled])')
        if (acc.length) { await acc[0].click(); did('accept'); continue }
        const dec = await p.$$('button[aria-label$=": decline"]')
        if (dec.length) { await dec[0].click(); did('decline'); continue }
        const tw = await p.$('[aria-labelledby=trade-title] button[aria-label^="Confirm trade with "]:not([disabled])')
        if (tw) { await tw.click(); did('p2pTrade'); continue }
        await click('button[aria-label="Cancel offer"]'); did('cancelOffer'); continue
      }
      if (await exists('[aria-labelledby=trade-title]')) { await click('button[aria-label="Close trade"]'); continue }
      if (await exists('[aria-labelledby=dev-title]')) { await click('button[aria-label="Close development cards"]'); continue }
      const L = s.legal
      if (L.includes('BUILD_CITY')) { await buildRow('Build City'); await boardPick(); did('city'); continue }
      if (L.includes('BUILD_SETTLEMENT')) { await buildRow('Build Settlement'); await boardPick(); did('settlement'); continue }
      for (const [t, l] of [['PLAY_YEAR_OF_PLENTY', 'Year of Plenty'], ['PLAY_MONOPOLY', 'Monopoly'], ['PLAY_ROAD_BUILDING', 'Road Building'], ['PLAY_KNIGHT', 'Knight']]) if (L.includes(t) && rand() < 0.6) { await playDev(t, l); break }
      if ((await info()).kind !== 'actions' || (await exists('[aria-labelledby=dev-title]'))) continue
      if (L.includes('BUY_DEV') && rand() < 0.7) { await buildRow('Buy Development card'); did('buyDev'); continue }
      if (L.includes('BUILD_ROAD') && turnMemo.roads < 1 && rand() < 0.8) { turnMemo.roads++; await buildRow('Build Road'); await boardPick(); did('road'); continue }
      if (L.includes('PROPOSE_TRADE') && turnMemo.p2p < 1 && rand() < 0.25) {
        turnMemo.p2p++
        const give = RES.filter((r) => s.res[r] > 0).sort((a, b) => s.res[b] - s.res[a])[0]; const want = RES.filter((r) => r !== give)[Math.floor(rand() * 4)]
        await click('button[data-trade-button]'); await click('[data-trade-mode=players]')
        await click(`button[aria-label^="Give one ${NAME[give]}"]`); await click(`button[aria-label^="Want one ${NAME[want]}"]`); await click('button[aria-label^="Offer trade"]'); did('propose'); continue
      }
      if (L.includes('BANK_TRADE') && turnMemo.bank < 2) {
        turnMemo.bank++
        const give = RES.filter((r) => s.res[r] >= 2).sort((a, b) => s.res[b] - s.res[a])[0]
        const need = ['ore', 'grain', 'brick', 'lumber', 'wool'].filter((r) => r !== give && s.res[r] < 2 && s.bank[r] > 0)
        const el = give && await p.$('button[data-trade-button]:not([disabled])')
        if (el && need.length) {
          await el.click(); await p.waitForTimeout(60)
          await click(`button[aria-label^="Want one ${NAME[need[0]]}"]`)
          const g = await p.$(`[aria-label="Pay the bank"] button[aria-label*=" ${NAME[give]} for "]`)
          if (g) { await g.click(); did('bankTrade') } // a completed trade closes the panel
          else { await click(`button[aria-label="Want one less ${NAME[need[0]]}"]`); await click('button[aria-label="Close trade"]') }; continue
        }
      }
      await click('[data-primary-action]'); did('endTurn'); continue
    }
  } catch (e) { stats.lastError = String(e).slice(0, 200); await p.keyboard.press('Escape'); await p.waitForTimeout(100) }
}
const fin = await info()
await p.waitForTimeout(800); await p.screenshot({ path: `${D}/victory.png` })
const victory = await p.evaluate(() => document.querySelector('[aria-labelledby=victory-title]')?.innerText.replace(/\s+/g, ' ').slice(0, 200) ?? null)
const out = { seed: SEED, minutes: +((Date.now() - t0) / 60000).toFixed(1), final: { kind: fin.kind, turn: fin.turn, actions: fin.log }, victory, ...stats, errors: errors.slice(0, 10) }
writeFileSync(`${D}/result-${SEED}.json`, JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1)); await b.close()
