// Captures the running app with the system Chrome (WebGL via Metal/ANGLE).
// Usage: node scripts/screenshot.mjs [url] [out.png] [width] [height]   (env: WAIT=ms, DPR=device pixel ratio, default 1)
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const url = process.argv[2] ?? 'http://localhost:5173/'
const out = process.argv[3] ?? 'shots/latest.png'
const width = Number(process.argv[4] ?? 1600)
const height = Number(process.argv[5] ?? 904)
mkdirSync(out.split('/').slice(0, -1).join('/') || '.', { recursive: true })

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'],
})
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: Number(process.env.DPR ?? 1) })
const logs = []
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`) })
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
const t0 = Date.now()
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForSelector('canvas', { timeout: 30000 })
await page.waitForTimeout(Number(process.env.WAIT ?? 6000))
const fps = await page.evaluate(() => new Promise((res) => {
  let n = 0; const s = performance.now()
  const f = () => { n++; if (performance.now() - s < 2000) requestAnimationFrame(f); else res(n / ((performance.now() - s) / 1000)) }
  requestAnimationFrame(f)
}))
const info = await page.evaluate(() => {
  const c = document.querySelector('canvas')
  return c ? `canvas buffer ${c.width}x${c.height}, css ${c.clientWidth}x${c.clientHeight}, devicePixelRatio ${window.devicePixelRatio}` : 'no canvas'
})
console.log(info)
await page.screenshot({ path: out })
console.log(`saved ${out} in ${Date.now() - t0}ms, ~${fps.toFixed(1)} fps (headless)`)
if (logs.length) console.log(logs.filter((l) => !l.includes("toNonIndexed")).slice(0, 20).join('\n'))
await browser.close()
