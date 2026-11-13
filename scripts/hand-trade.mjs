// G6.2 check: the clickable hand fills the trade draft (desktop and compact), the draft survives
// closing the panel, the "−" takes a card back, axe on the hand and the panel, the draft clears at
// the end of the turn. G6.3: one panel; with only a wanted card it lists the ways to pay the bank,
// and a bank trade closes the panel. Usage: node scripts/hand-trade.mjs width height outDir   (needs `npm run dev`)
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
const [W, H] = [Number(process.argv[2]), Number(process.argv[3])]
const D = process.argv[4]; mkdirSync(D, { recursive: true })
const AXE = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js'
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
const errors = []
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) })
p.on('pageerror', (e) => errors.push('pageerror ' + e.message))
await p.goto('http://localhost:5173/?seed=2024', { waitUntil: 'networkidle' }); await p.waitForSelector('canvas'); await p.waitForTimeout(3000)
async function position(cond) {
  return p.evaluate(async (condSrc) => {
    const g = await import('/src/game/index.ts')
    const cond = new Function('g', 's', 'p', 'me', `return (${condSrc})(g, s, p, me)`)
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
        if (s.phase.kind === 'actions' && cond(g, s, who, me)) {
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
const out = { errors }
const labels = () => p.$$eval('[aria-label$="resources"] li', (els) => els.map((li) => { const b = li.querySelector('button'); return b ? b.getAttribute('aria-label') + (b.disabled ? ' [disabled]' : '') : li.getAttribute('title') }))
// pre-roll: plain cards with a reason
await p.evaluate(async () => { const s = window.__islesStore; s.load({ ...s.replayFile(), actions: s.replayFile().actions.slice(0, 40) }) })
await p.waitForTimeout(500); await unpass()
out.phase0 = await p.evaluate(() => window.__islesStore.getState().phase.kind)
out.plain = await labels()
// a position in actions with 3+ wool and some wood
out.pos = await position((g, s, p, me) => me.resources.wool >= 3 && me.resources.lumber >= 1 && me.resources.ore === 0)
await p.waitForTimeout(600); await unpass()
out.before = await labels()
await p.screenshot({ path: D + '/0-hand.png' })
await p.click('button[aria-label^="Trade one wool"]'); await p.waitForTimeout(150)
out.focusAfterFirst = await p.evaluate(() => document.activeElement?.getAttribute('aria-label'))
await p.click('button[aria-label^="Trade one wool"]'); await p.waitForTimeout(150)
await p.click('button[aria-label^="Trade one wood"]'); await p.waitForTimeout(150)
out.panel = !!(await p.$('[aria-labelledby=trade-title]'))
out.composer = await p.$$eval('#trade-body button[aria-label^="Give one"]', (els) => els.map((e) => e.getAttribute('aria-label')))
out.status = await p.$eval('#trade-body [aria-live]', (e) => e.textContent)
await p.screenshot({ path: D + '/1-picked.png' })
await p.click('button[aria-label="Take back one wood"]'); await p.waitForTimeout(150)
out.afterMinus = await labels()
// survives closing and switching panels
await p.click('button[aria-label="Close trade"]'); await p.waitForTimeout(150)
await p.click('button[aria-label^="Trade with the bank"]'); await p.waitForTimeout(150)
out.reopenStatus = await p.$eval('#trade-body [aria-live]', (e) => e.textContent)
await p.click('button[aria-label^="Want one ore"]'); await p.waitForTimeout(150)
out.status2 = await p.$eval('#trade-body [aria-live]', (e) => e.textContent)
out.bankButton = await p.$eval('button[aria-label^="Bank trade"]', (e) => e.getAttribute('aria-label'))
out.offerButton = await p.$eval('button[aria-label^="Offer to players"]', (e) => e.getAttribute('aria-label') + (e.disabled ? ' [disabled]' : ''))
await p.screenshot({ path: D + '/2-want.png' })
// give nothing, want one ore: the ways to pay the bank, one click each
await p.click('button[aria-label="Take back one wool"]'); await p.click('button[aria-label="Take back one wool"]'); await p.waitForTimeout(150)
out.payOptions = await p.$$eval('[aria-label="Pay the bank"] button', (els) => els.map((e) => e.getAttribute('aria-label')))
out.status3 = await p.$eval('#trade-body [aria-live]', (e) => e.textContent)
if (!(await p.$('#axe'))) await p.addScriptTag({ url: AXE })
out.axe = await p.evaluate(async () => (await window.axe.run({ include: [['[aria-labelledby=trade-title]'], ['[aria-label$="resources"]']] }, { resultTypes: ['violations'] })).violations.map((v) => v.id + ' ' + v.impact + ' ' + v.nodes.length + ' ' + v.nodes[0].target))
await p.screenshot({ path: D + '/3-pay.png' })
const ore0 = await p.evaluate(() => { const s = window.__islesStore.getState(); return s.players.find((x) => x.id === s.order[s.active]).resources.ore })
await p.click('[aria-label="Pay the bank"] button'); await p.waitForTimeout(300)
out.afterPay = { panelOpen: !!(await p.$('[aria-labelledby=trade-title]')), oreGained: (await p.evaluate(() => { const s = window.__islesStore.getState(); return s.players.find((x) => x.id === s.order[s.active]).resources.ore })) - ore0, focus: await p.evaluate(() => document.activeElement?.getAttribute('aria-label')) }
// end of turn clears the draft: put a card in it first (it survives closing the panel)
await p.click('button[aria-label^="Trade one"]:not([disabled])'); await p.waitForTimeout(150)
await p.click('button[aria-label="Close trade"]'); await p.waitForTimeout(150)
out.draftBeforeEnd = await p.evaluate(() => window.__islesUi.getDraft())
await p.click('[data-primary-action], button:has-text("End turn")').catch(() => {})
await p.waitForTimeout(500)
out.draftAfterEnd = await p.evaluate(async () => window.__islesUi.getDraft())
out.turnMoved = await p.evaluate(() => window.__islesStore.getState().order[window.__islesStore.getState().active])
writeFileSync(D + '/hand-check.json', JSON.stringify(out, null, 1))
console.log(JSON.stringify(out, null, 1))
await b.close()
