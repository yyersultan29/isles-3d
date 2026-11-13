// G7.0 baseline (ROADMAP G7): the current resource, trade and development-card flows through the UI,
// and the hover-only audit (reasons for disabled controls that are only in title / aria-label, not in
// visible text). No app changes; G7 steps rerun it. Usage: node scripts/g7-baseline.mjs width height outDir
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
const [W, H] = [Number(process.argv[2] ?? 1440), Number(process.argv[3] ?? 900)]
const D = process.argv[4] ?? 'shots/g7-baseline'; mkdirSync(D, { recursive: true })
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
const errors = []
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) })
p.on('pageerror', (e) => errors.push('pageerror ' + e.message))
await p.goto('http://localhost:5173/?seed=2024', { waitUntil: 'networkidle' }); await p.waitForSelector('canvas'); await p.waitForTimeout(3000)
const compact = W < 700 || H < 500
const out = { viewport: `${W}x${H}`, compact, hoverOnly: {}, flows: {}, placeholders: null, errors }

async function position(cond) {
  return p.evaluate(async (condSrc) => {
    const g = await import('/src/game/index.ts')
    const tp = await import('/src/ui/tradePlan.ts')
    const cond = new Function('g', 's', 'p', 'me', 'tp', `return (${condSrc})(g, s, p, me, tp)`)
    const store = window.__islesStore
    const settings = store.getState().settings
    for (let seed = 1; seed < 400; seed++) {
      let r = 0x9e3779b9 ^ seed
      const rand = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 2 ** 32 }
      let s = g.createGame({ ...settings }).state
      const log = []
      for (let step = 0; step < 3000 && s.phase.kind !== 'gameOver'; step++) {
        const who = s.phase.kind === 'discard' ? s.order.find((x) => s.phase.pending[x]) : s.order[s.active]
        const me = s.players.find((x) => x.id === who)
        if (s.phase.kind === 'actions' && cond(g, s, who, me, tp)) {
          store.load({ schemaVersion: 1, engineVersion: g.ENGINE_VERSION, settings: s.settings, actions: log })
          return { seed, step, who, res: me.resources }
        }
        let legal = g.legalActions(s, who).filter((a) => !['PROPOSE_TRADE', 'RESPOND_TRADE', 'CONFIRM_TRADE', 'CANCEL_TRADE', 'BANK_TRADE'].includes(a.type) && !a.type.startsWith('PLAY_'))
        let a
        if (s.phase.kind === 'discard') {
          const hand = { ...me.resources }; const cards = {}
          for (let k = 0; k < s.phase.pending[who]; k++) { const rs = Object.keys(hand).filter((x) => hand[x] > 0); const x = rs[Math.floor(rand() * rs.length)]; hand[x]--; cards[x] = (cards[x] ?? 0) + 1 }
          a = { type: 'DISCARD', cards }
        } else if (s.phase.kind === 'actions') {
          // hoard: mostly end the turn, so hands grow
          const builds = legal.filter((x) => x.type === 'BUILD_SETTLEMENT' || x.type === 'BUILD_CITY' || x.type === 'BUY_DEV')
          a = builds.length && rand() < 0.5 ? builds[Math.floor(rand() * builds.length)] : legal.find((x) => x.type === 'END_TURN')
        } else a = legal[Math.floor(rand() * legal.length)]
        const res = g.apply(s, who, a)
        if (!res.ok) break
        s = res.state; log.push({ player: who, action: a })
      }
    }
    return null
  }, cond.toString())
}

const unpass = async () => { while (await p.$('[aria-labelledby=pass-title]')) { await p.click('[aria-labelledby=pass-title] button'); await p.waitForTimeout(250) } }
let clicks = 0
const begin = async (cond) => { const r = await position(cond); if (!r) return null; await p.waitForTimeout(600); await unpass(); clicks = 0; return r }
const tap = async (sel) => { const el = await p.waitForSelector(sel + ':not([disabled])', { timeout: 4000 }); await el.click(); clicks++; await p.waitForTimeout(150) }
const place = async () => { await p.waitForSelector('[data-board-picker]', { timeout: 4000 }); await p.focus('[data-board-picker]'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(60); await p.keyboard.press('Enter'); clicks++; await p.waitForTimeout(250) }
const shot = (name) => p.screenshot({ path: `${D}/${name}.png` })
const n = () => p.evaluate(() => window.__islesStore.replayFile().actions.length)
const phase = () => p.evaluate(() => window.__islesStore.getState().phase.kind)
const notices = () => p.$$eval('[aria-live] , [role=status]', (els) => els.map((e) => e.textContent.trim()).filter((t) => t && t.length < 160))
const openBuild = async () => { if (compact && !(await p.$('#compact-build'))) await tap('[data-build-toggle]') }
const handDelta = () => p.evaluate(() => [...document.querySelectorAll('[aria-label$="resources"] *')].some((e) => /^[+−-]\d+$/.test(e.textContent.trim())))

/** reasons a player can only find by hovering: in title / aria-label of a visible control, not in visible text near it */
async function hoverAudit(name) {
  out.hoverOnly[name] = await p.evaluate(() => {
    const vis = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
    const found = []
    for (const el of document.querySelectorAll('button, li[title], [title]')) {
      if (!vis(el) || el.closest('canvas')) continue
      const disabled = el.disabled || el.getAttribute('aria-disabled') === 'true' || el.tagName === 'LI'
      if (!disabled) continue
      for (const lab of [el.getAttribute('aria-label'), el.getAttribute('title')]) {
        const m = lab && lab.match(/\((.*)\)\s*$/)
        if (!m) continue
        const reason = m[1].split(';')[0].trim()
        if (/chosen|you have|bank has|can pay for|^\d/.test(reason)) continue
        const near = ((el.innerText ?? '') + ' ' + ((el.closest('li') ?? el.parentElement)?.innerText ?? '')).replace(/\s+/g, ' ')
        if (!near.includes(reason)) found.push(`${(lab.split(':')[0].split('(')[0]).trim()} — ${reason}`)
      }
    }
    return [...new Set(found)]
  })
}

// ---- hover-only audit in common states
await p.evaluate(() => { const s = window.__islesStore; s.load({ ...s.replayFile(), actions: s.replayFile().actions.slice(0, 2) }) })
await p.waitForTimeout(500); await unpass(); await openBuild()
await hoverAudit('setup'); await shot('a-setup')
if (await begin((g, s, p, me) => s.phase.kind === 'actions' && g.legalActions(s, p).some((a) => a.type === 'BUILD_ROAD') && !g.legalActions(s, p).some((a) => a.type === 'BUILD_CITY'))) {
  await openBuild(); await hoverAudit('actions'); await shot('a-actions')
  await tap('button[data-trade-button]'); await tap('button[aria-label^="Give one ' + 'wool"]').catch(() => {})
  await hoverAudit('trade-open'); await shot('a-trade'); await p.keyboard.press('Escape'); await p.waitForTimeout(150)
}

// ---- 1. roll: what the player sees about their resources (a start of turn whose roll pays this player)
{
  await begin((g, s, p, me) => s.turn > 12)
  const found = await p.evaluate(async () => {
    const g = await import('/src/game/index.ts')
    const st = window.__islesStore; const f = st.replayFile()
    for (let k = f.actions.length; k > 0; k--) {
      const r = g.replay({ ...f, actions: f.actions.slice(0, k) })
      if (!r.ok || r.state.phase.kind !== 'preRoll') continue
      const p = r.state.order[r.state.active]
      const t = g.apply(r.state, p, { type: 'ROLL' })
      if (t.ok && t.state.phase.kind === 'actions' && g.RESOURCE_ORDER.some((x) => t.state.players.find((y) => y.id === p).resources[x] > r.state.players.find((y) => y.id === p).resources[x])) {
        st.load({ ...f, actions: f.actions.slice(0, k) }); return k
      }
    }
    return null
  })
  await p.waitForTimeout(500); await unpass(); clicks = 0
  out.flows.roll = { found: !!found, phase: await phase() }
  const before = await p.evaluate(() => { const s = window.__islesStore.getState(); return { ...s.players.find((x) => x.id === s.order[s.active]).resources } })
  await tap('[data-primary-action]'); await p.waitForTimeout(500)
  await shot('1-after-roll')
  const after = await p.evaluate(() => { const s = window.__islesStore.getState(); return { ...s.players.find((x) => x.id === s.order[s.active]).resources } })
  out.flows.roll.gained = Object.fromEntries(Object.keys(after).filter((r) => after[r] !== before[r]).map((r) => [r, after[r] - before[r]]))
  out.flows.roll.noticeAt05s = await notices()
  out.flows.roll.handDeltaOnCards = await handDelta()
  await p.waitForTimeout(4000); out.flows.roll.noticeAt45s = await notices()
}

// ---- 2. bank 4:1 and a port trade
for (const [name, rate] of [['bank4', 4], ['port', 3], ['port2', 2]]) {
  // the condition runs in the page, so the rate is written into its source
  const cond = eval(`(g, s, p, me) => g.RESOURCE_ORDER.some((r) => g.tradeRate(s, p, r) === ${rate} && me.resources[r] >= ${rate}) && g.RESOURCE_ORDER.some((r) => me.resources[r] === 0 && s.bank[r] > 0)`)
  const pos = await begin(cond)
  if (!pos) { out.flows[name] = 'no position'; continue }
  const want = Object.entries(pos.res).find(([, v]) => v === 0)[0]
  const NAME = { lumber: 'wood', brick: 'brick', wool: 'wool', grain: 'grain', ore: 'ore' }
  const n0 = await n()
  await tap('button[data-trade-button]'); await tap(`button[aria-label^="Want one ${NAME[want]}"]`)
  const options = await p.$$eval('[aria-label="Pay the bank"] button', (els) => els.map((e) => e.textContent.trim()))
  await shot(`2-${name}-options`)
  const pick = await p.$(`[aria-label="Pay the bank"] button:has-text("${rate === 4 ? '' : '(port)'}")`)
  if (pick) { await pick.click(); clicks++; await p.waitForTimeout(250) }
  out.flows[name] = { clicks, options, ok: (await n()) === n0 + 1 }
}

// ---- 3. buy a card, then see it (refused: bought this turn)
{
  const pos = await begin((g, s, p) => g.legalActions(s, p).some((a) => a.type === 'BUY_DEV') && !s.players.find((x) => x.id === p).devCards?.length)
  if (pos) {
    const n0 = await n()
    await openBuild(); await tap('button[aria-label^="Buy Development card"]')
    await p.waitForTimeout(300); await shot('3-after-buy')
    const after = await notices()
    await tap('button[aria-label^="Development cards"]'); await p.waitForTimeout(200)
    const rows = await p.$$eval('[aria-labelledby=dev-title] li', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()))
    await hoverAudit('dev-panel'); await shot('3-dev-panel')
    out.flows.buyDev = { clicks, ok: (await n()) === n0 + 1, noticesAfterBuy: after, devRows: rows }
    await p.keyboard.press('Escape'); await p.waitForTimeout(150)
  } else out.flows.buyDev = 'no position'
}

// ---- 4. each card type through the UI
const playCard = async (type, label, steps) => {
  const pos = await begin(eval(`(g, s, p) => g.legalActions(s, p).some((a) => a.type === '${type}')`))
  if (!pos) { out.flows[label] = 'no position'; return }
  const n0 = await n()
  await tap('button[aria-label^="Development cards"]'); await tap(`button[aria-label^="Play ${label}"]`)
  await shot(`4-${label.replace(/ /g, '')}-1`)
  const texts = [await p.evaluate(() => document.querySelector('[aria-labelledby=dev-title]')?.innerText.replace(/\s+/g, ' ').slice(0, 200) ?? null), (await notices()).slice(-2)]
  await steps()
  await shot(`4-${label.replace(/ /g, '')}-2`)
  out.flows[label] = { clicks, actions: (await n()) - n0, phase: await phase(), firstScreen: texts }
}
await playCard('PLAY_KNIGHT', 'Knight', async () => {
  await place() // robber
  if (await phase() === 'steal') await tap('button[aria-label^="Rob "]')
})
await playCard('PLAY_ROAD_BUILDING', 'Road Building', async () => { await place(); if (await phase() === 'roadBuilding') await place() })
await playCard('PLAY_YEAR_OF_PLENTY', 'Year of Plenty', async () => {
  for (let i = 0; i < 2; i++) { const t = await p.$('[aria-labelledby=dev-title] button[aria-label^="Take one "]:not([disabled])'); if (t) { await t.click(); clicks++; await p.waitForTimeout(100) } }
  await tap('[aria-labelledby=dev-title] button[aria-label="Play Year of Plenty"]')
})
await playCard('PLAY_MONOPOLY', 'Monopoly', async () => {
  await tap('[aria-labelledby=dev-title] button[aria-label^="Monopoly on "]')
  await tap('[aria-labelledby=dev-title] button[aria-label="Play Monopoly"]')
})

// ---- placeholders: visible controls that do nothing (known from the source: no handler)
out.placeholders = await p.evaluate(() => {
  const vis = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
  const names = ['Home', 'Game', 'Stats', 'Settings', 'Undo', 'Chat (new messages)', 'Fullscreen', 'Menu']
  return [...document.querySelectorAll('button')].filter(vis).map((b) => b.getAttribute('aria-label') ?? b.textContent.trim()).filter((t) => names.includes(t))
})

writeFileSync(`${D}/g7-baseline.json`, JSON.stringify(out, null, 1))
console.log(JSON.stringify(out, null, 1))
await b.close()
