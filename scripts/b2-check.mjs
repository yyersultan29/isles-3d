// B2 check (docs/BOARD_GEN_PLAN.md §6): balanced boards drawn by the scene at the standard pose,
// 10 new games in a row without GPU/JS memory growth, idle fps vs the classic board, console errors.
// Usage: node scripts/b2-check.mjs [outDir]   (needs `npm run dev`)
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
const D = process.argv[2] ?? 'screenshots/milestones/b2'; mkdirSync(D, { recursive: true })
const APP = 'http://localhost:5173/'
const SEEDS = [1, 7, 42, 1234, 99999, 31337]
const b = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'],
})
const errors = []
const page = async (q, dpr = 1) => {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr })
  const p = await ctx.newPage()
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`${q}: ${m.text().slice(0, 160)}`) })
  p.on('pageerror', (e) => errors.push(`${q}: pageerror ${e.message}`))
  await p.goto(APP + q, { waitUntil: 'load' })
  await p.waitForFunction(() => window.__isles && window.__islesStore, null, { timeout: 20000 })
  await p.waitForTimeout(3000)
  return p
}
const info = (p) => p.evaluate(() => {
  const { scene, gl } = window.__isles
  let guy = false; scene.traverse((o) => { if (o.userData.piece === 'mountain-guy') guy = true })
  const s = window.__islesStore.getState()
  return {
    preset: s.settings.boardPreset, guy, trees: window.__islesVeg?.trees, calls: gl.info.render.calls, mem: { ...gl.info.memory },
    board: Object.values(s.board.tiles).map((t) => `${t.terrain[0]}${t.token ?? ''}`).join(' '),
  }
})
const fps = (p) => p.evaluate(() => new Promise((res) => {
  let n = 0; const s = performance.now()
  const f = () => { n++; if (performance.now() - s < 4000) requestAnimationFrame(f); else res(+(n / ((performance.now() - s) / 1000)).toFixed(1)) }
  requestAnimationFrame(f)
}))
const out = { seeds: {}, errors }

// 1. classic baseline and 6 balanced seeds at the default pose
let p = await page('?menu=0&seed=1&preset=standard-fixed')
out.classic = await info(p); await p.screenshot({ path: `${D}/classic-seed1.png` }); await p.context().close()
for (const seed of SEEDS) {
  p = await page(`?menu=0&seed=${seed}`)
  out.seeds[seed] = await info(p)
  await p.screenshot({ path: `${D}/balanced-seed${seed}.png` })
  await p.context().close()
}

// 2. ten new games in one page: memory must not grow
p = await page('?menu=0&seed=1')
const sample = () => p.evaluate(async () => {
  window.gc?.(); await new Promise((r) => setTimeout(r, 300))
  return { heapMB: +(performance.memory.usedJSHeapSize / 2 ** 20).toFixed(1), ...window.__isles.gl.info.memory }
})
out.games = [await sample()]
for (let i = 0; i < 10; i++) {
  await p.evaluate((seed) => window.__islesStore.reset({ seed, boardPreset: 'balanced' }), 500 + i)
  await p.waitForTimeout(2000)
  out.games.push(await sample())
}
out.afterGames = await info(p)
await p.screenshot({ path: `${D}/after-10-games.png` })
await p.context().close()

// 3. idle fps, every display frame rendered, DPR 2: classic vs balanced (two runs each)
for (const [k, q] of [['classic', '?menu=0&seed=1&preset=standard-fixed&alwaysrender'], ['balanced', '?menu=0&seed=42&alwaysrender']]) {
  p = await page(q, 2)
  out[`fps_${k}`] = [await fps(p), await fps(p)]
  await p.context().close()
}

writeFileSync(`${D}/b2-check.json`, JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
await b.close()
