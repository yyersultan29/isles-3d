// Frame budget check (docs/PERF_PLAN.md P1–P3): frames the scene renders per second while idle,
// while the pointer moves and orbits the camera, after a game event, and with the window
// unfocused; plus main-thread busy %. Usage: node scripts/perf-budget.mjs [url] (needs a server)
import { chromium } from 'playwright-core'
const url = process.argv[2] ?? 'http://localhost:5173/?menu=0&fps'
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await (await b.newContext({ viewport: { width: 1512, height: 945 }, deviceScaleFactor: 2 })).newPage()
const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) })
await p.goto(url, { waitUntil: 'networkidle' }); await p.waitForSelector('[data-fps-meter]'); await p.waitForTimeout(4000)
const cdp = await p.context().newCDPSession(p); await cdp.send('Performance.enable')
const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]))
// count rendered frames over `ms` while `during` runs
const measure = async (ms, during) => {
  const m0 = await metrics(); const f0 = await p.evaluate(() => window.__frames?.() ?? null)
  const t0 = Date.now(); const meter = []
  const job = during ? during() : Promise.resolve()
  while (Date.now() - t0 < ms) { await p.waitForTimeout(500); meter.push(await p.textContent('[data-fps-meter]')) }
  await job
  const m1 = await metrics()
  const fps = meter.slice(1).map((s) => Number(/scene (\d+)/.exec(s)[1]))
  return { sceneFps: Math.round(fps.reduce((a, x) => a + x, 0) / fps.length), display: /display (\d+)/.exec(meter.at(-1))[1], mainThreadPct: +(((m1.TaskDuration - m0.TaskDuration) / ((Date.now() - t0) / 1000)) * 100).toFixed(1) }
}
const out = { errors }
out.idle = await measure(5000)
out.pointer = await measure(3000, async () => { for (let i = 0; i < 60; i++) { await p.mouse.move(600 + (i % 20) * 10, 400 + (i % 7) * 8); await p.waitForTimeout(40) } })
await p.waitForTimeout(2000)
out.orbit = await measure(3000, async () => { await p.mouse.move(700, 500); await p.mouse.down(); for (let i = 0; i < 40; i++) { await p.mouse.move(700 + i * 4, 500); await p.waitForTimeout(40) } await p.mouse.up() })
await p.waitForTimeout(2500)
out.idleAgain = await measure(4000)
out.blurred = await measure(4000, async () => { await p.evaluate(() => window.dispatchEvent(new Event('blur'))) })
out.blurredGameEvent = await measure(2000, async () => {
  await p.evaluate(async () => { const g = await import('/src/game/index.ts'); const st = window.__islesStore; const s = st.getState(); const who = s.order[s.active]; st.dispatch(who, g.legalActions(s, who).find((a) => a.type === 'PLACE_SETTLEMENT')) })
})
await p.evaluate(() => window.dispatchEvent(new Event('focus'))); await p.waitForTimeout(3000)
out.focusedIdle = await measure(4000)
console.log(JSON.stringify(out, null, 1))
await b.close()
