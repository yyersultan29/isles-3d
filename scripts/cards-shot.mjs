// Resource card check (ASSET_DESIGN A3): the same seeded positions every run, so before/after shots
// compare. Shots: the hand with four kinds held and one empty pile, the trade panel opened from a
// hand card, and the discard dialog after a seven; element crops plus full frames, axe on each.
// Usage: node scripts/cards-shot.mjs width height outDir   (needs `npm run dev`)
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
const [W, H] = [Number(process.argv[2] ?? 1440), Number(process.argv[3] ?? 900)]
const D = process.argv[4] ?? 'shots/cards'; mkdirSync(D, { recursive: true })
const AXE = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js'
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 })
await p.routeWebSocket(/\/\/localhost:5173\//, () => {})
const errors = []
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) })
p.on('pageerror', (e) => errors.push('pageerror ' + e.message))
await p.goto('http://localhost:5173/?seed=2024&nohover', { waitUntil: 'networkidle' }); await p.waitForSelector('canvas'); await p.waitForTimeout(3000)

/** Plays seeded bot games in the page until `cond(s, who, me)` holds, then loads that game. */
async function position(cond) {
  return p.evaluate(async (condSrc) => {
    const g = await import('/src/game/index.ts')
    const cond = new Function('s', 'who', 'me', `return (${condSrc})(s, who, me)`)
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
        if (cond(s, who, me)) {
          store.load({ schemaVersion: 1, engineVersion: g.ENGINE_VERSION, settings: s.settings, actions: log })
          return { seed, step, who, phase: s.phase.kind, res: me.resources }
        }
        const legal = g.legalActions(s, who).filter((a) => !['PROPOSE_TRADE', 'RESPOND_TRADE', 'CONFIRM_TRADE', 'CANCEL_TRADE', 'BANK_TRADE'].includes(a.type) && !a.type.startsWith('PLAY_'))
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
const axe = async (sel) => {
  if (!(await p.evaluate(() => !!window.axe))) await p.addScriptTag({ url: AXE })
  return p.evaluate(async (sel) => (await window.axe.run(sel, { runOnly: ['wcag2a', 'wcag2aa'] })).violations.map((v) => `${v.id} (${v.nodes.length})`), sel)
}
const out = { errors }

// 1. the hand: four kinds held, one empty pile
out.hand = await position((s, who, me) => s.phase.kind === 'actions' && Object.values(me.resources).filter((n) => n === 0).length === 1 && Object.values(me.resources).reduce((a, n) => a + n, 0) >= 6)
await p.waitForTimeout(600); await unpass(); await p.mouse.move(2, 2); await p.waitForTimeout(1200)
const hand = p.locator('[aria-label$="resources"]').first()
await hand.screenshot({ path: `${D}/hand.png` })
await p.screenshot({ path: `${D}/hand-full.png` })
out.handAxe = await axe('[aria-label$="resources"]')

// 2. the trade panel, opened from the first card that can be traded
await p.locator('[data-hand-card]:not([disabled])').first().click()
await p.waitForTimeout(500)
await p.locator('[role=dialog][aria-labelledby=trade-title]').screenshot({ path: `${D}/trade.png` })
out.tradeAxe = await axe('[role=dialog][aria-labelledby=trade-title]')
await p.keyboard.press('Escape'); await p.waitForTimeout(300)

// 3. the discard dialog: a player with eight or more cards after a seven
out.discard = await position((s, who, me) => s.phase.kind === 'discard' && Object.values(me.resources).reduce((a, n) => a + n, 0) >= 9)
await p.waitForTimeout(600); await unpass(); await p.waitForTimeout(800)
const dlg = p.locator('[role=dialog][aria-labelledby=discard-title]')
await dlg.screenshot({ path: `${D}/discard.png` })
await p.screenshot({ path: `${D}/discard-full.png` })
out.discardAxe = await axe('[role=dialog][aria-labelledby=discard-title]')

writeFileSync(`${D}/cards.json`, JSON.stringify(out, null, 1))
console.log(JSON.stringify(out))
await b.close()
