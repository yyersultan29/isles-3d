// PERF P4 check: the Graphics setting switches presets live (buffer size, shadow map, AO), Auto steps
// down when High can't hold 60 while the player acts, the choice survives a reload, no errors or leaks.
// Usage: node scripts/graphics-check.mjs [outDir]   (needs the dev server on :5173)
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
const out = process.argv[2] ?? 'screenshots/milestones/perf'
mkdirSync(out, { recursive: true })
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext({ viewport: { width: 1512, height: 945 }, deviceScaleFactor: 2 })
const p = await ctx.newPage()
const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) })
const state = () => p.evaluate(async () => {
  const q = await import('/src/scene/quality.ts'); const { gl } = window.__isles
  const sun = []; window.__isles.scene.traverse((o) => { if (o.isDirectionalLight && o.castShadow) sun.push(o.shadow.map?.width ?? null) })
  return { setting: q.graphicsSetting(), preset: q.quality.name, buffer: `${gl.domElement.width}x${gl.domElement.height}`, shadowMap: sun[0], programs: gl.info.programs.length, textures: gl.info.memory.textures, geometries: gl.info.memory.geometries }
})
const orbit = async (ms) => { const t0 = Date.now(); await p.mouse.move(700, 500); await p.mouse.down(); let i = 0; while (Date.now() - t0 < ms) { await p.mouse.move(600 + (i++ % 40) * 6, 500); await p.waitForTimeout(30) } await p.mouse.up() }
const r = { errors }
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' }); await p.waitForSelector('[data-start-menu]'); await p.waitForTimeout(2500)
await p.screenshot({ path: `${out}/menu-graphics-en-1512.png` })
r.default = await state()
await p.click('[data-graphics="medium"]'); await p.waitForTimeout(2500); r.medium = await state()
await p.click('[data-graphics="low"]'); await p.waitForTimeout(2500); r.low = await state()
await p.click('[data-graphics="high"]'); await p.waitForTimeout(2500); r.highAgain = await state()
for (let i = 0; i < 3; i++) { await p.click('[data-graphics="medium"]'); await p.waitForTimeout(800); await p.click('[data-graphics="high"]'); await p.waitForTimeout(800) }
await p.waitForTimeout(1500); r.afterToggles = await state()
// Auto: start the game, act (orbit) long enough to judge
await p.click('[data-graphics="auto"]'); await p.waitForTimeout(300)
r.autoNote = await p.textContent('[data-graphics-note]')
await p.keyboard.press('Escape'); await p.waitForTimeout(300)
const start = await p.$('[data-start-menu] button:has-text("Start game"), [data-start-menu] button:has-text("New game")'); if (start) await start.click()
await p.waitForTimeout(5000) // settle window
await orbit(6000); await p.waitForTimeout(500); r.autoAfterOrbit = await state()
await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(2500); r.afterReload = await state()
// Russian menu, phone width
await p.evaluate(() => localStorage.setItem('isles.graphics', 'high'))
const m = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage()
await m.goto('http://localhost:5173/?lang=ru', { waitUntil: 'networkidle' }); await m.waitForSelector('[data-start-menu]'); await m.waitForTimeout(2000)
await m.screenshot({ path: `${out}/menu-graphics-ru-390.png` })
r.phoneOverflow = await m.evaluate(() => document.documentElement.scrollWidth > innerWidth)
console.log(JSON.stringify(r, null, 1))
await b.close()
