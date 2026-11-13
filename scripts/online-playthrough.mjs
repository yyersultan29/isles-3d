// Online UI playthrough (G5.3b): one full game in four tabs plus a spectator, against the local game
// server. Each tab's own (shadow) state decides; every action is a click or key in the tab whose seat
// acts. Needs `npm run dev` and `npm run server`.
// Usage: node scripts/online-playthrough.mjs [width] [height] [seed] [outDir]   (default 1440 900 7)
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { writeFileSync } from 'node:fs'
const D = process.argv[5] ?? 'shots/online-playthrough'
mkdirSync(D, { recursive: true })
const [W, H, SEED] = [Number(process.argv[2] ?? 1440), Number(process.argv[3] ?? 900), Number(process.argv[4] ?? 7)]
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
const errors = []
const open = async (url) => {
  const p = await ctx.newPage()
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) }); p.on('pageerror', (e) => errors.push('pageerror ' + e.message))
  await p.goto(url, { waitUntil: 'networkidle' }); await p.waitForSelector('#lobby-title')
  await p.evaluate(() => { window.__rej = []; window.__islesStore.onRejected((e, _p, a) => window.__rej.push(e.code + ' ' + a.type)) })
  return p
}
const host = await open('http://localhost:5173/?online'); await host.waitForTimeout(1500)
const link = await host.inputValue('[aria-label="Invite link"]')
const tabs = [host]; for (let i = 0; i < 3; i++) tabs.push(await open(link))
const spec = await open(link)
await host.waitForTimeout(500); await host.click('button:text-is("Start game")'); await host.waitForTimeout(3000)
const seatOf = new Map(); for (const t of tabs) seatOf.set(await t.evaluate(() => window.__islesStore.session().me), t)
let rng = SEED; const rand = () => ((rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648)
const NAME = { lumber: 'wood', brick: 'brick', wool: 'wool', grain: 'grain', ore: 'ore' }
const CAP = { lumber: 'Wood', brick: 'Brick', wool: 'Wool', grain: 'Grain', ore: 'Ore' }
const SEAT = { p1: 'Red', p2: 'Blue', p3: 'White', p4: 'Orange' }
const RES = ['lumber', 'brick', 'wool', 'grain', 'ore']
const info = (p) => p.evaluate(async () => {
  const g = await import('/src/game/index.ts'); const st = window.__islesStore; const s = st.getState(); const me = st.session().me
  const pending = s.phase.kind === 'discard' ? s.order.filter((x) => s.phase.pending[x]) : []
  const legal = s.phase.kind === 'gameOver' ? [] : g.legalActions(s, me).map((a) => a.type)
  const pl = s.players.find((x) => x.id === me)
  return { me, kind: s.phase.kind, turn: s.turn, active: s.order[s.active], pending, legal: [...new Set(legal)], res: pl.resources, bank: s.bank, n: s.actionCount, trade: s.trade }
})
const count = () => host.evaluate(() => window.__islesStore.getState().actionCount)
const settle = async (before) => {
  for (let i = 0; i < 150; i++) {
    const ns = await Promise.all([...tabs, spec].map((t) => t.evaluate(() => window.__islesStore.getState().actionCount)))
    if (ns[0] > before && ns.every((n) => n === ns[0])) return true
    await host.waitForTimeout(20)
  }
  return false
}
const stats = { ui: {}, steps: 0, handMismatch: 0, otherHandsShown: 0, notMyTurnEnabled: 0 }
const did = (k) => { stats.ui[k] = (stats.ui[k] ?? 0) + 1 }
const exists = (p, sel) => p.$(sel).then((x) => !!x)
const click = async (p, sel, t = 3000) => { const el = await p.waitForSelector(sel + ':not([disabled])', { timeout: t }); await el.click(); await p.waitForTimeout(40) }
const boardPick = async (p) => {
  await p.waitForSelector('[data-board-picker]', { timeout: 3000 }); await p.focus('[data-board-picker]')
  const n = Math.floor(rand() * 5); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(30)
  for (let i = 0; i < n; i++) { await p.keyboard.press(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'][Math.floor(rand() * 4)]); await p.waitForTimeout(10) }
  await p.keyboard.press('Enter')
}
// G6.5: the build mode stays on after a build while another is affordable: no need to choose it again
const MODE = { 'Build Road': 'road', 'Build Settlement': 'settlement', 'Build City': 'city' }
const buildRow = async (p, prefix) => { if (MODE[prefix] && await p.evaluate(async (m) => window.__islesUi.getPlacementMode() === m, MODE[prefix])) { did('keptMode'); return } if (await exists(p, '[data-build-toggle]')) { await p.click('[data-build-toggle]'); await p.waitForTimeout(50) } await p.focus(`button[aria-label^="${prefix}"]`); await p.keyboard.press('Enter'); await p.waitForTimeout(50) }
// every tab shows only its own hand, matching its seat; idle tabs have no live controls
const hook = () => { if (!window.__rej) { window.__rej = []; window.__reloads = (window.__reloads ?? 0) + 1; window.__islesStore.onRejected((e, _p, a) => window.__rej.push(e.code + ' ' + a.type)) } }
const audit = async () => {
  for (const t of [...tabs, spec]) await t.evaluate(hook)
  for (const t of tabs) {
    const r = await t.evaluate(() => {
      const s = window.__islesStore.getState(); const me = window.__islesStore.session().me; const pl = s.players.find((x) => x.id === me)
      const shown = Object.fromEntries([...document.querySelectorAll('li[aria-label]')].map((x) => x.getAttribute('aria-label')).filter((t) => /^(Wood|Brick|Wool|Grain|Ore): \d+$/.test(t)).map((t) => t.split(': ')))
      const label = document.querySelector('ul[aria-label$="resources"]')?.getAttribute('aria-label')
      const myTurn = s.phase.kind !== 'gameOver' && s.order[s.active] === me
      const live = myTurn ? 0 : document.querySelectorAll('[data-primary-action]:not([disabled]), button[aria-label^="Build "]:not([disabled]), button[aria-label^="Buy "]:not([disabled]), [data-board-picker]').length
      return { ok: ['lumber', 'brick', 'wool', 'grain', 'ore'].every((k, i) => Number(shown[['Wood', 'Brick', 'Wool', 'Grain', 'Ore'][i]]) === pl.resources[k]), label, me, live }
    })
    if (!r.ok) stats.handMismatch++
    if (!r.label?.startsWith({ p1: 'Red', p2: 'Blue', p3: 'White', p4: 'Orange' }[r.me])) stats.otherHandsShown++
    if (r.live) stats.notMyTurnEnabled++
  }
}
const turnMemo = { turn: -1, bank: 0, p2p: 0, roads: 0 }
const t0 = Date.now(); let stuck = 0; const shots = new Set()
while (stats.steps++ < 20000) {
  const s0 = await info(host)
  if (s0.kind === 'gameOver') break
  if (s0.turn !== turnMemo.turn) { Object.assign(turnMemo, { turn: s0.turn, bank: 0, p2p: 0, roads: 0 }); await audit() }
  if (s0.turn > 600) { console.log('turn cap'); break }
  for (const t of [20, 100]) if (s0.turn >= t && !shots.has(t)) { shots.add(t); const a = seatOf.get(s0.active); await a.screenshot({ path: `${D}/turn${t}-active.png` }); await tabs.find((x) => x !== a).screenshot({ path: `${D}/turn${t}-idle.png` }); await spec.screenshot({ path: `${D}/turn${t}-spectator.png` }) }
  const before = s0.n
  try {
    if (s0.kind === 'discard') {
      // online every seat that owes cards discards at once, each in its own tab
      const who = s0.pending[0]; const p = seatOf.get(who); const s = await info(p)
      const order = RES.filter((r) => s.res[r] > 0).sort((a, b) => s.res[b] - s.res[a])
      for (let i = 0; i < 12; i++) {
        if (await exists(p, 'section[aria-labelledby=discard-title] button:not([disabled]):text-is("Discard")')) break
        let c = false; for (const x of order) { const el = await p.$(`button[aria-label^="Discard one more ${CAP[x]}"]:not([disabled])`); if (el) { await el.click(); c = true; break } }
        if (!c) break
      }
      await click(p, 'section[aria-labelledby=discard-title] button:text-is("Discard")'); did('discard')
    } else {
      const p = seatOf.get(s0.active); const s = await info(p)
      if (s.kind === 'setup' || s.kind === 'roadBuilding' || s.kind === 'moveRobber') { await boardPick(p); did(s.kind) }
      else if (s.kind === 'steal') { await click(p, 'button[aria-label^="Rob "]'); did('steal') }
      else if (s.kind === 'preRoll') {
        if (s.legal.includes('PLAY_KNIGHT') && rand() < 0.5) { await click(p, 'button[aria-label^="My development cards"]'); await click(p, 'button[aria-label^="Play Knight"]'); did('knight') }
        else { await click(p, '[data-primary-action]'); did('roll') }
      } else if (s.kind === 'actions') {
        if (s.trade) {
          // the offer is answered in the addressed players' own tabs, then confirmed in the proposer's
          const pend = s.trade.to.filter((x) => !s.trade.responses[x])
          if (pend.length) {
            const q = seatOf.get(pend[0]); const name = SEAT[pend[0]]
            const acc = await q.$(`button[aria-label^="${name}: accept"]:not([disabled])`)
            if (acc) { await acc.click(); did('accept') } else { await click(q, `button[aria-label="${name}: decline"]`); did('decline') }
          } else {
            const tw = await p.$('[aria-labelledby=trade-title] button[aria-label^="Confirm trade with "]:not([disabled])')
            if (tw) { await tw.click(); did('p2pTrade') } else { await click(p, 'button[aria-label="Cancel offer"]'); did('cancelOffer') }
          }
        } else if (await exists(p, '[aria-labelledby=trade-title]')) { await click(p, 'button[aria-label="Close trade"]'); continue }
        else if (await exists(p, '[aria-labelledby=dev-title]')) { await click(p, 'button[aria-label="Close development cards"]'); continue }
        else {
          const L = s.legal
          if (L.includes('BUILD_CITY')) { await buildRow(p, 'Build City'); await boardPick(p); did('city') }
          else if (L.includes('BUILD_SETTLEMENT')) { await buildRow(p, 'Build Settlement'); await boardPick(p); did('settlement') }
          else if (L.includes('BUY_DEV') && rand() < 0.6) { await buildRow(p, 'Buy Development card'); did('buyDev') }
          else if (L.includes('PLAY_ROAD_BUILDING') && rand() < 0.5) { await click(p, 'button[aria-label^="My development cards"]'); await click(p, 'button[aria-label^="Play Road Building"]'); did('roadBuildingCard') }
          else if (L.includes('PLAY_KNIGHT') && rand() < 0.4) { await click(p, 'button[aria-label^="My development cards"]'); await click(p, 'button[aria-label^="Play Knight"]'); did('knight') }
          else if (L.includes('BUILD_ROAD') && turnMemo.roads < 1 && rand() < 0.8) { turnMemo.roads++; await buildRow(p, 'Build Road'); await boardPick(p); did('road') }
          else if (L.includes('PROPOSE_TRADE') && turnMemo.p2p < 1 && rand() < 0.35) {
            turnMemo.p2p++
            const give = RES.filter((r) => s.res[r] > 0).sort((a, b) => s.res[b] - s.res[a])[0]; const want = RES.filter((r) => r !== give)[Math.floor(rand() * 4)]
            await click(p, 'button[data-trade-button]'); await click(p, '[data-trade-mode=players]')
            await click(p, `button[aria-label^="Give one ${NAME[give]}"]`); await click(p, `button[aria-label^="Want one ${NAME[want]}"]`); await click(p, 'button[aria-label^="Offer trade"]'); did('propose')
          } else if (L.includes('BANK_TRADE') && turnMemo.bank < 1 && await exists(p, 'button[data-trade-for="city"], button[data-trade-for="settlement"]')) {
            // G6.4: a build row short of cards opens the trade with them filled in; the bank trade
            // (one or more trades, sent back to back) starts the placement
            turnMemo.bank++
            if (await exists(p, '[data-build-toggle]')) { await p.click('[data-build-toggle]'); await p.waitForTimeout(50) }
            await click(p, 'button[data-trade-for="city"], button[data-trade-for="settlement"]')
            await click(p, 'button[aria-label^="Trade with the bank, then build the"]'); await boardPick(p); did('tradeThenBuild')
          } else if (L.includes('BANK_TRADE') && turnMemo.bank < 1) {
            turnMemo.bank++
            const give = RES.filter((r) => s.res[r] >= 2).sort((a, b) => s.res[b] - s.res[a])[0]
            const need = ['ore', 'grain', 'brick', 'lumber', 'wool'].filter((r) => r !== give && s.res[r] < 2 && s.bank[r] > 0)
            const el = give && need.length && await p.$('button[data-trade-button]:not([disabled])')
            if (el) {
              await el.click(); await p.waitForTimeout(40)
              await click(p, `button[aria-label^="Want one ${NAME[need[0]]}"]`)
              const g = await p.$(`[aria-label="Pay the bank"] button[aria-label*=" ${NAME[give]} for "]`)
              if (g) { await g.click(); did('bankTrade') } // a completed trade closes the panel
              else { await click(p, `button[aria-label="Want one less ${NAME[need[0]]}"]`); await click(p, 'button[aria-label="Close trade"]') }
            }
            continue
          } else { await click(p, '[data-primary-action]'); did('endTurn') }
        }
      }
    }
  } catch (e) { stats.lastError = String(e).slice(0, 200); for (const t of tabs) await t.keyboard.press('Escape') }
  if (!(await settle(before))) { if (++stuck > 20) { console.log('STUCK', JSON.stringify(await info(host))); break } } else stuck = 0
}
await host.waitForTimeout(1200)
for (const [i, t] of tabs.entries()) await t.screenshot({ path: `${D}/victory-tab${i + 1}.png` })
await spec.screenshot({ path: `${D}/victory-spectator.png` })
const victory = await Promise.all([...tabs, spec].map((t) => t.evaluate(() => document.querySelector('[aria-labelledby=victory-title]')?.innerText.replace(/\s+/g, ' ').slice(0, 220) ?? null)))
const rejections = await Promise.all([...tabs, spec].map((t) => t.evaluate(() => window.__rej ?? 'listener lost')))
const alerts = await Promise.all([...tabs, spec].map((t) => t.evaluate(() => document.querySelectorAll('[role=alert]').length)))
const fin = await info(host)
const out = { seed: SEED, viewport: `${W}x${H}`, minutes: +((Date.now() - t0) / 60000).toFixed(1), final: { kind: fin.kind, turn: fin.turn, actions: fin.n }, sameVictoryEverywhere: new Set(victory).size === 1, victory: victory[0], rejections, alertsAtEnd: alerts, ...stats, errors: errors.slice(0, 10) }
writeFileSync(`${D}/result-${W}x${H}-${SEED}.json`, JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1)); await b.close()
