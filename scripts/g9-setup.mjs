// G9.5 setup check: the first-settlement screen (corner values, phase text, build panel, empty hand)
// in both languages, the picker's corner label, and a text-overflow scan.
// Usage: node scripts/g9-setup.mjs <width> <height> <outDir> [tag] (needs npm run dev)
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
const [W, H, O, T = ''] = [Number(process.argv[2] ?? 1440), Number(process.argv[3] ?? 900), process.argv[4] ?? 'shots/g9-setup', process.argv[5]]
mkdirSync(O, { recursive: true })
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const out = { viewport: `${W}x${H}` }
for (const lang of ['en', 'ru']) {
  const p = await (await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage(); const errors = []
  p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)) })
  await p.goto(`http://localhost:5173/?seed=7&lang=${lang}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1800)
  for (let i = 0; i < 4; i++) { const x = await p.$('[aria-labelledby=pass-title] button'); if (!x) break; await x.click(); await p.waitForTimeout(300) }
  const r = { errors }
  r.phase = await p.evaluate(() => document.querySelector('[data-phase-banner], [aria-live] ')?.textContent ?? '')
  r.body = await p.evaluate(() => document.body.innerText.split('\n').filter((l) => l.trim()).slice(0, 40))
  await p.screenshot({ path: `${O}/setup-${lang}-${W}x${H}${T}.png` })
  await p.focus('[data-board-picker]').catch(() => {}); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(300)
  r.pickerLabel = await p.evaluate(() => document.querySelector('[data-board-picker]')?.innerText?.replace(/\s+/g, ' ').slice(0, 160) ?? null)
  r.overflow = await p.evaluate(() => [...document.querySelectorAll('button, h2, h3, p, li, label')].filter((e) => e.getBoundingClientRect().width && e.scrollWidth > e.clientWidth + 1 && !e.classList.contains('truncate') && !e.classList.contains('sr-only')).map((e) => e.textContent.trim().slice(0, 40)).slice(0, 10))
  out[lang] = r
  await p.context().close()
}
console.log(JSON.stringify(out, null, 1))
await b.close()
