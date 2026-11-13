// Trade and build flows measured through the UI (ROADMAP G6.0 baseline, rerun at G6.7).
// Usage: node scripts/ux-flows.mjs [width] [height] [outDir]   (needs `npm run dev`)
//
// For each flow a real game position is found first: the engine plays a seeded bot game in the page
// until the active player holds the hand the flow needs, and the store loads that game as a replay.
// The flow is then done with real clicks on the HUD and the board (the keyboard board picker stands
// in for one click on the spot). Reported per flow: the clicks the acting player needs, other
// players' clicks (hot-seat answers), the panels it opens, and whether the game state changed as
// intended. The flows are written against the current UI; G6 steps update them alongside the UI.
// G6.3: one trade panel (want a card, pay the bank in one click; offers start from the hand), and
// the phone build popover opens over an open trade panel instead of under it.
// G6.4: a build row short of cards opens the trade with the missing cards filled in; the bank trade
// then starts the placement. Position conditions also get the trade planner (`tp`).
// G6.5: the build mode stays on while another of the same build is affordable and legal.
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
const [W, H] = [Number(process.argv[2] ?? 1440), Number(process.argv[3] ?? 900)]
const D = process.argv[4] ?? 'shots/ux-flows'
mkdirSync(D, { recursive: true })
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
const errors = []
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) })
p.on('pageerror', (e) => errors.push('pageerror ' + e.message))
await p.goto('http://localhost:5173/?seed=2024', { waitUntil: 'networkidle' }); await p.waitForSelector('canvas'); await p.waitForTimeout(3000)
const compact = W < 700 || H < 500
const out = { viewport: `${W}x${H}`, flows: {}, errors }

/** Finds a position where `cond` holds for the active player in `actions`, and loads it. */
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
          const builds = legal.filter((x) => x.type === 'BUILD_SETTLEMENT' || x.type === 'BUILD_CITY')
          a = builds.length && rand() < 0.5 ? builds[0] : legal.find((x) => x.type === 'END_TURN')
        } else a = legal[Math.floor(rand() * legal.length)]
        const res = g.apply(s, who, a)
        if (!res.ok) break
        s = res.state; log.push({ player: who, action: a })
      }
    }
    return null
  }, cond.toString())
}

const snap = () => p.evaluate(() => { const s = window.__islesStore.getState(); const who = s.order[s.active]; return { who, res: { ...s.players.find((x) => x.id === who).resources }, roads: Object.values(s.roads ?? {}).filter((o) => o === who).length, actions: window.__islesStore.replayFile().actions.length, trade: !!s.trade } })
let clicks = 0, others = 0
const panels = new Set()
const tap = async (sel, who = 'me') => {
  const el = await p.waitForSelector(sel + ':not([disabled])', { timeout: 4000 })
  await el.click(); await p.waitForTimeout(120)
  if (who === 'me') clicks++; else others++
  for (const [k, q] of [['trade', '[aria-labelledby=trade-title]'], ['build popover', '#compact-build']]) if (await p.$(q)) panels.add(k)
}
const place = async () => { // one click on a highlighted spot
  await p.waitForSelector('[data-board-picker]', { timeout: 4000 })
  await p.focus('[data-board-picker]'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(60); await p.keyboard.press('Enter'); await p.waitForTimeout(200)
  clicks++
}
const unpass = async () => { while (await p.$('[aria-labelledby=pass-title]')) { await p.click('[aria-labelledby=pass-title] button'); await p.waitForTimeout(250) } }
const buildRow = async (prefix) => {
  if (compact && !(await p.$('#compact-build'))) await tap('[data-build-toggle]')
  await tap(`button[aria-label^="${prefix}"]`)
}
/** the build row's shortfall button (G6.4): on a phone the build popover opens first */
const shortRow = async (prefix) => { if (compact && !(await p.$('#compact-build'))) await tap('[data-build-toggle]'); await tap(`button[data-trade-for][aria-label^="${prefix}"]`) }
const openTrade = () => tap('button[aria-label^="Trade with the bank"]')
const begin = async (cond) => { const pos = await position(cond); if (!pos) throw new Error('no position'); await p.waitForTimeout(600); await unpass(); clicks = 0; others = 0; panels.clear(); return pos }

// ---- 1. trade 4 wood for a brick at the bank, then build a road
{
  const pos = await begin((g, s, p, me) => me.resources.lumber >= 5 && me.resources.brick === 0 && s.bank.brick > 0 && g.tradeRate(s, p, 'lumber') === 4 &&
    (() => { const t = g.apply(s, p, { type: 'BANK_TRADE', give: 'lumber', get: 'brick', count: 1 }); return t.ok && g.legalActions(t.state, p).some((a) => a.type === 'BUILD_ROAD') })())
  const before = await snap()
  await p.screenshot({ path: `${D}/1-start.png` })
  await shortRow('Build Road') // opens the trade with 4 wood → 1 brick filled in
  await p.screenshot({ path: `${D}/1-trade-for-road.png` })
  await tap('button[aria-label^="Bank trade, then build the road"]') // the trade starts the road placement
  out.placingAfterTrade = !!(await p.$('[data-board-picker]'))
  await place()
  const after = await snap()
  out.flows.bankThenRoad = { clicks, others, panels: [...panels], ok: after.res.lumber === before.res.lumber - 5 && after.res.brick === 0 && after.actions === before.actions + 2, position: pos }
}

// ---- 1b. a city paid with two bank trades from the build row (G6.4)
{
  const pos = await begin((g, s, p, me, tp) => { const f = tp.shortfall(s, 'city'); return f.covered && f.trades.length >= 2 })
  const before = await snap()
  await shortRow('Build City')
  await p.screenshot({ path: `${D}/1b-trade-for-city.png` })
  out.cityPlanText = await p.$eval('#trade-body [aria-live]', (e) => e.textContent)
  await tap('button[aria-label^="Bank trade, then build the city"]')
  await place()
  const after = await snap()
  out.flows.cityTwoTrades = { clicks, panels: [...panels], ok: after.actions >= before.actions + 3 && !after.trade, position: pos }
}

// ---- 2. two roads in a row
{
  const pos = await begin((g, s, p, me) => me.resources.lumber >= 2 && me.resources.brick >= 2 && g.legalActions(s, p).some((a) => a.type === 'BUILD_ROAD') &&
    (() => { const a = g.legalActions(s, p).find((x) => x.type === 'BUILD_ROAD'); const t = g.apply(s, p, a); return t.ok && g.legalActions(t.state, p).some((x) => x.type === 'BUILD_ROAD') })())
  const before = await snap()
  await p.screenshot({ path: `${D}/2-start.png` }) // build rows with ×N
  await buildRow('Build Road'); await place()
  const first = clicks
  out.keptRoadMode = !!(await p.$('[data-board-picker]')) // G6.5: still placing roads
  await place()
  const after = await snap()
  // the mode is on exactly while another road is legal
  out.modeMatchesLegal = await p.evaluate(async () => {
    const g = await import('/src/game/index.ts'); const s = window.__islesStore.getState()
    return !!document.querySelector('[data-board-picker]') === g.legalActions(s, s.order[s.active]).some((a) => a.type === 'BUILD_ROAD')
  })
  await p.screenshot({ path: `${D}/2-after-two-roads.png` })
  out.flows.twoRoads = { clicks, firstRoad: first, secondRoad: clicks - first, panels: [...panels], ok: after.actions === before.actions + 2, position: pos }
}

// ---- 3. offer 1 wool for 1 ore to everyone; one player accepts; trade with them
{
  const pos = await begin((g, s, p, me) => me.resources.wool >= 1 && me.resources.ore === 0 && s.players.some((o) => o.id !== p && o.resources.ore >= 1))
  const before = await snap()
  await tap('button[aria-label^="Trade one wool"]') // the hand card opens the panel with the wool given
  await tap('button[aria-label^="Want one ore"]')
  await p.screenshot({ path: `${D}/3-compose.png` })
  await tap('button[aria-label="Offer to players"]')
  await p.screenshot({ path: `${D}/3-offer.png` })
  // hot-seat: the others answer on this screen (counted apart); the first who can accepts
  for (let i = 0; i < 3; i++) {
    const acc = await p.$('button[aria-label$=": accept"]:not([disabled])')
    if (acc) { await acc.click(); others++; await p.waitForTimeout(120); break }
    const dec = await p.$('button[aria-label$=": decline"]'); if (dec) { await dec.click(); others++; await p.waitForTimeout(120) }
  }
  await tap('[aria-labelledby=trade-title] button[aria-label^="Trade with "]')
  const after = await snap()
  const stillOpen = !!(await p.$('[aria-labelledby=trade-title]'))
  out.flows.playerTrade = { clicks, others, panelStillOpenAfter: stillOpen, panels: [...panels], ok: after.res.ore === before.res.ore + 1 && after.res.wool === before.res.wool - 1, position: pos }
  await p.screenshot({ path: `${D}/3-after.png` })
}

// ---- 4. phone: the build popover over an open trade panel is tappable (the G6.0 bug)
if (compact) {
  await begin((g, s, p, me) => g.legalActions(s, p).some((a) => a.type === 'BUILD_ROAD'))
  await openTrade(); await tap('[data-build-toggle]')
  out.buildOverTrade = await p.evaluate(() => {
    const row = document.querySelector('#compact-build button[aria-label^="Build Road"]'); const b = row.getBoundingClientRect()
    return { tradeOpen: !!document.querySelector('[aria-labelledby=trade-title]'), hitIsRow: row.contains(document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)) }
  })
  await p.screenshot({ path: `${D}/4-build-over-trade.png` })
}

writeFileSync(`${D}/ux-flows.json`, JSON.stringify(out, null, 1))
console.log(JSON.stringify(out, null, 1))
await b.close()
