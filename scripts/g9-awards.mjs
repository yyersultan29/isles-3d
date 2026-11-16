// G9.6 player-card awards: a scripted game until Longest Road and Largest Army are held, then the
// cards in both languages, the gap between the player column and the dice, and a text-overflow scan.
// Usage: node scripts/g9-awards.mjs <width> <height> <outDir> (needs npm run dev)
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
const [W, H, O] = [Number(process.argv[2] ?? 1440), Number(process.argv[3] ?? 900), process.argv[4] ?? 'shots/g9-awards']
mkdirSync(O, { recursive: true })
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const out = { viewport: `${W}x${H}` }
for (const lang of ['en', 'ru']) {
  const p = await (await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage(); const errors = []
  p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)) })
  await p.goto(`http://localhost:5173/?seed=11&lang=${lang}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500)
  const game = await p.evaluate(async () => {
    const g = await import('/src/game/index.ts'); const store = window.__islesStore
    let r = 5; const rand = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 2 ** 32 }
    const prefer = ['PLAY_KNIGHT', 'BUILD_ROAD', 'BUY_DEV', 'BUILD_CITY', 'BUILD_SETTLEMENT']
    for (let i = 0; i < 4000; i++) {
      const s = store.getState()
      if (s.phase.kind === 'actions' && s.longestRoad && s.largestArmy) break
      if (s.phase.kind === 'gameOver') break
      const who = s.phase.kind === 'discard' ? s.order.find((x) => s.phase.pending[x]) : s.order[s.active]
      const legal = g.legalActions(s, who).filter((a) => !['PROPOSE_TRADE', 'RESPOND_TRADE', 'CONFIRM_TRADE', 'CANCEL_TRADE'].includes(a.type))
      let a
      if (s.phase.kind === 'discard') { const me = s.players.find((x) => x.id === who); const hand = { ...me.resources }; const cards = {}; for (let k = 0; k < s.phase.pending[who]; k++) { const rs = Object.keys(hand).filter((x) => hand[x] > 0); const x = rs[Math.floor(rand() * rs.length)]; hand[x]--; cards[x] = (cards[x] ?? 0) + 1 } a = { type: 'DISCARD', cards } }
      else if (s.phase.kind === 'actions') {
        for (const t of prefer) { const c = legal.filter((x) => x.type === t); if (c.length) { a = c[Math.floor(rand() * c.length)]; break } }
        a ??= legal.find((x) => x.type === 'BANK_TRADE' && rand() < 0.5) ?? legal.find((x) => x.type === 'END_TURN')
      } else a = legal[Math.floor(rand() * legal.length)]
      if (!a || !store.dispatch(who, a).ok) break
    }
    const s = store.getState(); return { turn: s.turn, phase: s.phase.kind, longestRoad: s.longestRoad, largestArmy: s.largestArmy }
  })
  await p.waitForTimeout(800)
  for (let i = 0; i < 4; i++) { const x = await p.$('[aria-labelledby=pass-title] button'); if (!x) break; await x.click(); await p.waitForTimeout(300) }
  const r = { game, errors }
  r.lines = await p.$$eval('[data-award]', (xs) => xs.map((x) => x.textContent))
  r.layout = await p.evaluate(() => {
    const ul = document.querySelector('ul[aria-label]'); const players = [...document.querySelectorAll('ul')].find((u) => u.querySelector('li[aria-current], li') && u.className.includes('top-[66px]'))
    const dice = document.querySelector('[data-dice-sum]')?.closest('div')
    const pb = players?.getBoundingClientRect().bottom, dt = [...document.querySelectorAll('svg, [data-dice-sum]')].filter(Boolean) && dice?.getBoundingClientRect().top
    return { playersBottom: pb && Math.round(pb), diceTop: dt && Math.round(dt) }
  })
  r.truncated = await p.$$eval('[data-award] .truncate', (xs) => xs.filter((x) => x.scrollWidth > x.clientWidth + 1).map((x) => x.textContent))
  await p.addScriptTag({ url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js' })
  r.axe = await p.evaluate(async () => (await window.axe.run(document.body, { resultTypes: ['violations'] })).violations.map((v) => `${v.id}: ${v.nodes.length} ${v.nodes.slice(0, 2).map((n) => n.html.slice(0, 90)).join(" | ")}`))
  await p.screenshot({ path: `${O}/awards-${lang}-${W}x${H}.png` })
  out[lang] = r
  await p.context().close()
}
console.log(JSON.stringify(out, null, 1))
await b.close()
