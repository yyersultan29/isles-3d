// G6 exit audit (ROADMAP G6.7): axe and on-screen fit for every new panel (build rows with ×N and
// trade-for-build rows, the trade panel for a build, pay options, an open offer, Help), then the three
// G6 flows by keyboard only: Tab, Space, Enter, arrows and the shortcuts, no mouse and no scripted focus.
// Usage: node scripts/g6-audit.mjs width height outDir   (needs `npm run dev`)
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
const [W, H] = [Number(process.argv[2] ?? 1440), Number(process.argv[3] ?? 900)]
const D = process.argv[4] ?? 'shots/g6-audit'; mkdirSync(D, { recursive: true })
const AXE = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js'
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
const errors = []
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) })
p.on('pageerror', (e) => errors.push('pageerror ' + e.message))
await p.goto('http://localhost:5173/?seed=2024', { waitUntil: 'networkidle' }); await p.waitForSelector('canvas'); await p.waitForTimeout(3000)
await p.addScriptTag({ url: AXE })
const compact = W < 700 || H < 500
const out = { viewport: `${W}x${H}`, compact, panels: {}, keyboard: {}, errors }

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

const unpass = async () => { while (await p.$('[aria-labelledby=pass-title]')) { await p.click('[aria-labelledby=pass-title] button'); await p.waitForTimeout(250) } }
const begin = async (cond) => { const r = await position(cond); if (!r) throw new Error('no position'); await p.waitForTimeout(600); await unpass(); await p.evaluate(() => document.activeElement?.blur()); return r }
const n = () => p.evaluate(() => window.__islesStore.replayFile().actions.length)
const state = () => p.evaluate(() => { const s = window.__islesStore.getState(); const who = s.order[s.active]; return { who, res: { ...s.players.find((x) => x.id === who).resources }, trade: !!s.trade } })
/** axe on one region, and whether it lies fully inside the viewport */
async function audit(name, sel) {
  const r = await p.evaluate(async ([sel, W, H]) => {
    const el = document.querySelector(sel); if (!el) return { missing: true }
    const b = el.getBoundingClientRect()
    const v = (await window.axe.run({ include: [[sel]] }, { resultTypes: ['violations'] })).violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length}, ${v.nodes[0].target}`)
    return { axe: v, fits: b.left >= 0 && b.top >= 0 && b.right <= W + 0.5 && b.bottom <= H + 0.5, box: [b.left, b.top, b.right, b.bottom].map(Math.round) }
  }, [sel, W, H])
  out.panels[name] = r
  await p.screenshot({ path: `${D}/${name}.png` })
}
const buildSel = () => (compact ? '#compact-build' : '[aria-labelledby=build-title]')
const openBuild = async () => { if (compact && !(await p.$('#compact-build'))) { await p.click('[data-build-toggle]'); await p.waitForTimeout(150) } }

// ---- panels
await begin((g, s, p, me, tp) => g.legalActions(s, p).some((a) => a.type === 'BUILD_ROAD') && ['settlement', 'city', 'dev'].some((k) => { const f = tp.shortfall(s, k); return f.covered && f.trades.length }))
await openBuild(); await audit('build-rows', buildSel())
await p.click('button[data-trade-for]'); await p.waitForTimeout(250)
await audit('trade-for-build', '[aria-labelledby=trade-title]')
await p.keyboard.press('Escape'); await p.waitForTimeout(150)

await begin((g, s, p, me) => me.resources.wool >= 4 && me.resources.ore === 0 && s.players.some((o) => o.id !== p && o.resources.ore >= 1))
await p.click('button[data-trade-button]'); await p.waitForTimeout(200)
await p.click('button[aria-label^="Want one ore"]'); await p.waitForTimeout(150)
await audit('pay-options', '[aria-labelledby=trade-title]')
await p.click('button[aria-label="Want one less ore"]'); await p.click('button[aria-label^="Give one wool"]'); await p.click('button[aria-label^="Want one ore"]'); await p.waitForTimeout(100)
await p.click('[data-trade-mode=players]'); await p.click('button[aria-label^="Offer trade"]'); await p.waitForTimeout(250)
await audit('open-offer', '[aria-labelledby=trade-title]')
await p.click('button[aria-label="Cancel offer"]'); await p.waitForTimeout(150)
await p.keyboard.press('Escape'); await p.waitForTimeout(150)
await p.click('button[aria-label="Help"]'); await p.waitForTimeout(150)
await audit('help', '#help-panel')
await p.keyboard.press('Escape'); await p.waitForTimeout(150)

// ---- keyboard only
let keys = 0
const press = async (k) => { await p.keyboard.press(k); keys++; await p.waitForTimeout(140) }
const focused = () => p.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName)
/** Tab (counted) until the focused control's label starts with `prefix` */
async function tabTo(prefix, max = 60) {
  for (let i = 0; i < max; i++) { const f = await focused(); if (f?.startsWith(prefix)) return true; await press('Tab') }
  return false
}
const placeByKeys = async () => { await p.waitForSelector('[data-board-picker]', { timeout: 4000 }); await press('ArrowRight'); await press('Enter'); await p.waitForTimeout(150) }

// K1: R on a road short of a brick → Enter (Bank, focused) → arrow + Enter on the board
{
  await begin((g, s, p, me, tp) => { const f = tp.shortfall(s, 'road'); return f.covered && f.trades.length === 1 && !g.legalActions(s, p).some((a) => a.type === 'BUILD_ROAD') })
  keys = 0; const n0 = await n()
  await press('r'); const bankFocus = await focused()
  await press('Enter')
  const pickerFocused = await p.evaluate(() => document.activeElement?.hasAttribute('data-board-picker'))
  await placeByKeys()
  out.keyboard.bankThenRoad = { keys, ok: (await n()) === n0 + 2, bankFocus, pickerFocused }
}
// K2: two roads: R, then arrow + Enter twice (the mode stays on)
{
  await begin((g, s, p, me) => me.resources.lumber >= 2 && me.resources.brick >= 2 && (() => { const a = g.legalActions(s, p).find((x) => x.type === 'BUILD_ROAD'); if (!a) return false; const t = g.apply(s, p, a); return t.ok && g.legalActions(t.state, p).some((x) => x.type === 'BUILD_ROAD') })())
  keys = 0; const n0 = await n()
  await press('r'); await placeByKeys(); const first = keys
  await placeByKeys()
  out.keyboard.twoRoads = { keys, firstRoad: first, secondRoad: keys - first, ok: (await n()) === n0 + 2 }
}
// K3: offer 1 wool for 1 ore by keys: T (opens Bank / ports, focus on the first card), Shift+Tab to "Players", Space, Tab to the wool tile, Space, Tab to the ore wish, Space, Enter (offer); the other player answers; Tab to "Confirm trade with", Enter
{
  await begin((g, s, p, me) => me.resources.wool >= 1 && me.resources.ore === 0 && s.players.some((o) => o.id !== p && o.resources.ore >= 1))
  keys = 0; const before = await state()
  await press('t'); await press('Shift+Tab')
  const onPlayers = await p.evaluate(() => document.activeElement?.getAttribute('data-trade-mode')); await press('Space')
  const gotGive = await tabTo('Give one wool'); await press('Space')
  const gotWant = await tabTo('Want one ore'); await press('Space')
  await press('Enter') // on a card: the panel's main action, the offer here
  const offered = (await state()).trade
  // hot-seat: the other players answer on this screen (not counted); the first who can accepts
  let others = 0
  for (let i = 0; i < 3; i++) {
    const acc = await p.$('button[aria-label$=": accept"]:not([disabled])')
    if (acc) { await acc.press('Enter'); others++; await p.waitForTimeout(150); break }
    const dec = await p.$('button[aria-label$=": decline"]'); if (dec) { await dec.press('Enter'); others++; await p.waitForTimeout(150) }
  }
  const gotConfirm = await tabTo('Confirm trade with ')
  await press('Enter'); await p.waitForTimeout(200)
  const after = await state()
  out.keyboard.playerTrade = { keys, others, ok: after.res.ore === before.res.ore + 1 && after.res.wool === before.res.wool - 1, panelClosed: !(await p.$('[aria-labelledby=trade-title]')), reached: { onPlayers, gotGive, gotWant, offered, gotConfirm } }
}

writeFileSync(`${D}/g6-audit.json`, JSON.stringify(out, null, 1))
console.log(JSON.stringify(out, null, 1))
await b.close()
