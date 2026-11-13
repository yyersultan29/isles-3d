// G6.6 check: keyboard shortcuts through the real UI (desktop and compact). R/S/C/D/T do what their
// buttons do and only when those are enabled; R on a road short of cards opens the trade for it and
// Enter on a card makes that trade (the placement follows); nothing happens behind the pass screen;
// Help lists the keys (axe, Esc returns focus). Usage: node scripts/shortcuts.mjs width height outDir
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
const [W, H] = [Number(process.argv[2] ?? 1440), Number(process.argv[3] ?? 900)]
const D = process.argv[4] ?? 'shots/shortcuts'; mkdirSync(D, { recursive: true })
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
const mode = () => p.evaluate(async () => window.__islesUi.getPlacementMode())
const tradeOpen = async () => !!(await p.$('[aria-labelledby=trade-title]'))
const n = () => p.evaluate(() => window.__islesStore.replayFile().actions.length)
const key = async (k) => { await p.evaluate(() => document.activeElement?.blur()); await p.keyboard.press(k); await p.waitForTimeout(200) }
const out = { errors }

// 1. behind the pass screen and in setup: nothing
await p.evaluate(() => { const s = window.__islesStore; s.load({ ...s.replayFile(), actions: s.replayFile().actions.slice(0, 30) }) })
await p.waitForTimeout(400)
out.passScreen = !!(await p.$('[aria-labelledby=pass-title]'))
await key('r'); await key('t'); await key('d')
out.behindPassOrSetup = { mode: await mode(), trade: await tradeOpen() }

// 2. R toggles the road mode, Esc ends it, T opens and closes trade, S/C do nothing when disabled
await position((g, s, p, me) => me.resources.lumber >= 2 && me.resources.brick >= 2 && g.legalActions(s, p).some((a) => a.type === 'BUILD_ROAD') && !g.legalActions(s, p).some((a) => a.type === 'BUILD_CITY'))
await p.waitForTimeout(600)
out.passScreen2 = !!(await p.$('[aria-labelledby=pass-title]'))
await key('t'); out.tBehindPass = await tradeOpen()
await unpass()
await key('r'); out.r1 = await mode()
await key('r'); out.r2 = await mode()
await key('r'); await p.keyboard.press('Escape'); await p.waitForTimeout(150); out.esc = await mode()
await key('c'); out.cDisabled = await mode()
await key('t'); out.t1 = await tradeOpen()
await key('t'); out.t2 = await tradeOpen()

// 3. R on a road short of cards: the trade for it opens with Bank focused; Enter on a card makes the trade, then the road placement starts
const pos3 = await position((g, s, p, me, tp) => { const f = tp.shortfall(s, 'road'); return f.covered && f.trades.length === 1 && !g.legalActions(s, p).some((a) => a.type === 'BUILD_ROAD') })
await p.waitForTimeout(600); await unpass()
const n0 = await n()
await key('r')
out.shortRoad = { trade: await tradeOpen(), focus: await p.evaluate(() => document.activeElement?.getAttribute('aria-label')) }
await p.screenshot({ path: `${D}/1-r-short-road.png` })
const before = await p.evaluate(() => [...document.querySelectorAll('#trade-body [data-tile][aria-pressed=true]')].map((e) => e.getAttribute('aria-label')))
await p.focus('#trade-body [data-tile]'); await p.keyboard.press('Enter'); await p.waitForTimeout(300)
out.enterOnCard = { actions: (await n()) - n0, mode: await mode(), trade: await tradeOpen(), chosenBefore: before.length, position: pos3?.res }

// 4. D buys a card when the row is enabled
await position((g, s, p) => g.legalActions(s, p).some((a) => a.type === 'BUY_DEV'))
await p.waitForTimeout(600); await unpass()
const n1 = await n(); await key('d'); out.dBuys = (await n()) - n1

// 5. Help lists the keys
await p.click('button[aria-label="Help"]'); await p.waitForTimeout(200)
out.help = await p.$$eval('#help-panel dt kbd', (els) => els.map((e) => e.textContent))
await p.addScriptTag({ url: AXE })
out.axe = await p.evaluate(async () => (await window.axe.run({ include: [['#help-panel'], ['[aria-label$="resources"]']] }, { resultTypes: ['violations'] })).violations.map((v) => v.id + ' ' + v.impact + ' ' + v.nodes.length))
await p.screenshot({ path: `${D}/2-help.png` })
await p.keyboard.press('Escape'); await p.waitForTimeout(150)
out.helpClosed = { open: !!(await p.$('#help-panel')), focus: await p.evaluate(() => document.activeElement?.getAttribute('aria-label')) }

writeFileSync(`${D}/shortcuts.json`, JSON.stringify(out, null, 1))
console.log(JSON.stringify(out, null, 1))
await b.close()
