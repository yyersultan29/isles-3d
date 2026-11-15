// G9.4 Russian check: the menu, setup, play, trade and dev-card screens with ?lang=ru, plus a text-overflow scan.
// Usage: node scripts/g9-ru.mjs <width> <height> <outDir> (needs npm run dev)
import { chromium } from 'playwright-core'
const [W, H, O] = [Number(process.argv[2]), Number(process.argv[3]), process.argv[4]]
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
const p = await ctx.newPage(); const errors = []
p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)) })
const tag = `${W}x${H}`
// overflow check: text elements whose content is wider than their box
const overflow = () => p.evaluate(() => [...document.querySelectorAll('button, h2, h3, p, span, li, label')].filter((e) => {
  const r = e.getBoundingClientRect(); if (!r.width || getComputedStyle(e).overflow === 'visible' && e.scrollWidth <= e.clientWidth + 1) return false
  return e.scrollWidth > e.clientWidth + 1 && !e.classList.contains('truncate') && !e.classList.contains('sr-only')
}).map((e) => e.textContent.trim().slice(0, 50)).slice(0, 12))
const out = { tag, errors }
// 1. menu in Russian (plain URL + stored lang)
await p.goto('http://localhost:5173/'); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('isles3d.lang', 'ru') })
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' }); await p.waitForSelector('[data-start-menu]'); await p.waitForTimeout(1500)
out.menuLang = await p.evaluate(() => document.documentElement.lang); out.menuOverflow = await overflow()
await p.screenshot({ path: `${O}/1-menu-ru-${tag}.png` })
await p.click('[data-menu-new]'); await p.waitForTimeout(800)
for (let i = 0; i < 4; i++) { const x = await p.$('[aria-labelledby=pass-title] button'); if (!x) break; await x.click(); await p.waitForTimeout(300) }
out.setupOverflow = await overflow(); await p.screenshot({ path: `${O}/2-setup-ru-${tag}.png` })
// 2. action phase: script setup and some turns
await p.goto('http://localhost:5173/?seed=7&lang=ru', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500)
await p.evaluate(async () => {
  const g = await import('/src/game/index.ts'); const store = window.__islesStore
  let r = 3; const rand = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 2 ** 32 }
  for (let i = 0; i < 140; i++) {
    const s = store.getState(); if (s.phase.kind === 'actions' && s.turn >= 12) break
    const who = s.phase.kind === 'discard' ? s.order.find((x) => s.phase.pending[x]) : s.order[s.active]
    const legal = g.legalActions(s, who).filter((a) => !['PROPOSE_TRADE', 'RESPOND_TRADE', 'CONFIRM_TRADE', 'CANCEL_TRADE'].includes(a.type) && !a.type.startsWith('PLAY_'))
    let a
    if (s.phase.kind === 'discard') { const me = s.players.find((x) => x.id === who); const hand = { ...me.resources }; const cards = {}; for (let k = 0; k < s.phase.pending[who]; k++) { const rs = Object.keys(hand).filter((x) => hand[x] > 0); const x = rs[Math.floor(rand() * rs.length)]; hand[x]--; cards[x] = (cards[x] ?? 0) + 1 } a = { type: 'DISCARD', cards } }
    else if (s.phase.kind === 'actions') a = legal.find((x) => x.type === 'BUILD_ROAD' || x.type === 'BUILD_SETTLEMENT') ?? legal.find((x) => x.type === 'END_TURN')
    else a = legal[Math.floor(rand() * legal.length)]
    if (!a || !store.dispatch(who, a).ok) break
  }
})
await p.waitForTimeout(800)
for (let i = 0; i < 4; i++) { const x = await p.$('[aria-labelledby=pass-title] button'); if (!x) break; await x.click(); await p.waitForTimeout(300) }
out.phase = await p.evaluate(() => window.__islesStore.getState().phase.kind)
out.actionsOverflow = await overflow(); await p.screenshot({ path: `${O}/3-play-ru-${tag}.png` })
const t = await p.$('[data-trade-button]'); if (t && await t.isVisible()) { await t.click(); await p.waitForTimeout(500); out.tradeOverflow = await overflow(); await p.screenshot({ path: `${O}/4-trade-ru-${tag}.png` }); await p.keyboard.press('Escape'); await p.waitForTimeout(300) }
const d = await p.$('[data-dev-button]'); if (d && await d.isVisible()) { await d.click(); await p.waitForTimeout(500); out.devOverflow = await overflow(); await p.screenshot({ path: `${O}/5-dev-ru-${tag}.png` }); await p.keyboard.press('Escape') }
console.log(JSON.stringify(out))
await b.close()
