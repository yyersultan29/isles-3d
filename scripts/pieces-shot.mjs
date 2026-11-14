// Building readability check: one seeded bot game played to a position where every seat has a
// settlement and a city, then the home camera at the given size. Same position and pose every run,
// so before/after shots compare. Usage: node scripts/pieces-shot.mjs width height out.png [minBuildings]
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
const [W, H] = [Number(process.argv[2] ?? 1440), Number(process.argv[3] ?? 900)]
const OUT = process.argv[4] ?? 'shots/pieces.png'; const MIN = Number(process.argv[5] ?? 14)
mkdirSync(OUT.split('/').slice(0, -1).join('/') || '.', { recursive: true })
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
await p.routeWebSocket(/\/\/localhost:5173\//, () => {})
const errors = []
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) })
p.on('pageerror', (e) => errors.push('pageerror ' + e.message))
await p.goto('http://localhost:5173/?seed=2024&nohover', { waitUntil: 'networkidle' }); await p.waitForSelector('canvas'); await p.waitForTimeout(2500)
const pos = await p.evaluate(async (MIN) => {
  const g = await import('/src/game/index.ts')
  const store = window.__islesStore
  const settings = store.getState().settings
  const tried = []
  for (let seed = 1; seed < 200; seed++) {
    let r = 0x9e3779b9 ^ seed
    const rand = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 2 ** 32 }
    let s = g.createGame({ ...settings, seed: settings.seed + seed }).state
    const log = []
    for (let step = 0; step < 6000 && s.phase.kind !== 'gameOver'; step++) {
      const who = s.phase.kind === 'discard' ? s.order.find((x) => s.phase.pending[x]) : s.order[s.active]
      if (s.phase.kind === 'actions' && s.trade == null) {
        const bs = Object.values(s.buildings)
        const ok = s.order.every((id) => bs.some((x) => x.owner === id && x.type === 'city') && bs.some((x) => x.owner === id && x.type === 'settlement'))
        if (ok && bs.length >= MIN) { store.load({ schemaVersion: 1, engineVersion: g.ENGINE_VERSION, settings: s.settings, actions: log }); return { seed, step, buildings: bs.length } }
      }
      const me = s.players.find((x) => x.id === who)
      let legal = g.legalActions(s, who).filter((a) => !['PROPOSE_TRADE', 'RESPOND_TRADE', 'CONFIRM_TRADE', 'CANCEL_TRADE'].includes(a.type) && !a.type.startsWith('PLAY_'))
      let a
      if (s.phase.kind === 'discard') {
        const hand = { ...me.resources }; const cards = {}
        for (let k = 0; k < s.phase.pending[who]; k++) { const rs = Object.keys(hand).filter((x) => hand[x] > 0); const x = rs[Math.floor(rand() * rs.length)]; hand[x]--; cards[x] = (cards[x] ?? 0) + 1 }
        a = { type: 'DISCARD', cards }
      } else if (s.phase.kind === 'actions') {
        // cities first, then settlements, roads now and then: every seat gets both kinds early
        const pick = (t) => { const xs = legal.filter((x) => x.type === t); return xs.length ? xs[Math.floor(rand() * xs.length)] : null }
        const forCity = legal.find((x) => x.type === 'BANK_TRADE' && (x.get === 'ore' || x.get === 'grain') && x.give !== 'ore' && x.give !== 'grain')
        a = pick('BUILD_CITY') ?? pick('BUILD_SETTLEMENT') ?? forCity ?? (rand() < 0.5 ? pick('BUILD_ROAD') : null) ?? legal.find((x) => x.type === 'END_TURN')
      } else a = legal[Math.floor(rand() * legal.length)]
      const res = g.apply(s, who, a)
      if (!res.ok) break
      s = res.state; log.push({ player: who, action: a })
    }
    if (seed < 6) tried.push(s.phase.kind + ' ' + Object.values(s.buildings).map((x) => x.owner + x.type[0]).join(' '))
  }
  return { none: tried }
}, MIN)
await p.waitForTimeout(800)
while (await p.$('[aria-labelledby=pass-title]')) { await p.click('[aria-labelledby=pass-title] button'); await p.waitForTimeout(250) }
await p.mouse.move(2, H - 2); await p.waitForTimeout(2500)
await p.screenshot({ path: OUT })
const veg = await p.evaluate(() => window.__islesVeg ?? null)
writeFileSync(OUT.replace(/\.png$/, '.replay.json'), JSON.stringify(await p.evaluate(() => window.__islesStore.replayFile())))
writeFileSync(OUT.replace(/\.png$/, '.json'), JSON.stringify({ pos, veg, errors }, null, 1))
console.log(JSON.stringify({ pos, veg, errors }))
await b.close()
