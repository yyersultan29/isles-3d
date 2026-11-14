// Asset probe (ASSET_DESIGN A0): per-piece triangles, meshes and materials, whole-frame draw calls and
// triangles, steady FPS, and close-up shots of each player's city at the board camera's angle.
// Runs on a fixed position: the replay that scripts/pieces-shot.mjs writes next to its screenshot.
// Usage: node scripts/assets-probe.mjs replay.json outDir [w h dpr]   (needs the dev server on :5173)
// env CLOSE=harbor: close-ups of the seven harbours instead of cities and a settlement
import { chromium } from 'playwright-core'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
const [REPLAY, OUT = 'shots/assets-probe', W = '1440', H = '900', DPR = '2'] = process.argv.slice(2)
if (!REPLAY) { console.error('usage: node scripts/assets-probe.mjs replay.json outDir [w h dpr]'); process.exit(1) }
mkdirSync(OUT, { recursive: true })
const replay = JSON.parse(readFileSync(REPLAY, 'utf8'))
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: +W, height: +H }, deviceScaleFactor: +DPR })
await p.routeWebSocket(/\/\/localhost:5173\//, () => {})
const errors = []
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) })
p.on('pageerror', (e) => errors.push('pageerror ' + e.message))
await p.goto('http://localhost:5173/?seed=2024&nohover', { waitUntil: 'networkidle' }); await p.waitForSelector('canvas'); await p.waitForTimeout(2500)
await p.evaluate((f) => window.__islesStore.load(f), replay)
await p.waitForTimeout(800)
while (await p.$('[aria-labelledby=pass-title]')) { await p.click('[aria-labelledby=pass-title] button'); await p.waitForTimeout(250) }
await p.mouse.move(2, +H - 2); await p.waitForTimeout(4000)

const stats = await p.evaluate(async () => {
  const { gl, scene } = window.__isles
  // per piece: the original meshes stay under their group (StaticBatch only hides them)
  const per = {}
  scene.traverse((o) => {
    const kind = o.userData?.piece
    if (!kind) return
    let tris = 0, meshes = 0; const mats = new Set()
    o.traverse((m) => {
      if (!m.isMesh || m.userData?.batched) return
      const g = m.geometry
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3
      meshes++; mats.add(m.material.uuid)
    })
    ;(per[kind] ??= []).push({ tris, meshes, mats: mats.size })
  })
  const summary = Object.fromEntries(Object.entries(per).map(([k, xs]) => [k, {
    count: xs.length,
    tris: Math.max(...xs.map((x) => x.tris)),
    meshes: Math.max(...xs.map((x) => x.meshes)),
    materials: Math.max(...xs.map((x) => x.mats)),
  }]))
  // the sun's shadow map is redrawn every few frames, so sample 12 frames: min = without, max = with it
  gl.info.autoReset = false
  const calls = [], trisF = []
  await new Promise((ok) => requestAnimationFrame(ok))
  for (let i = 0; i < 12; i++) {
    gl.info.reset()
    await new Promise((ok) => requestAnimationFrame(ok))
    calls.push(gl.info.render.calls); trisF.push(gl.info.render.triangles)
  }
  gl.info.autoReset = true
  const frame = { callsMin: Math.min(...calls), callsMax: Math.max(...calls), trisMin: Math.min(...trisF), trisMax: Math.max(...trisF) }
  let n = 0; const t0 = performance.now()
  await new Promise((ok) => { const f = () => { n++; if (performance.now() - t0 < 5000) requestAnimationFrame(f); else ok() }; requestAnimationFrame(f) })
  frame.fps = +(n / ((performance.now() - t0) / 1000)).toFixed(1)
  return { pieces: summary, frame, veg: window.__islesVeg ?? null }
})
await p.screenshot({ path: `${OUT}/board_${W}x${H}.png` })

// close-ups: each player's first city (or settlement), same view direction as the board camera
const spots = await p.evaluate(() => {
  const { scene } = window.__isles
  const out = []
  scene.traverse((o) => { if (['city', 'settlement', 'harbor'].includes(o.userData?.piece)) { const v = o.userData.piece === 'harbor' ? o.localToWorld(o.position.clone().set(0.05, 0.1, 0.75)) : o.getWorldPosition(o.position.clone()); out.push({ kind: o.userData.kind ? `${o.userData.piece}-${o.userData.kind}` : o.userData.piece, x: v.x, y: v.y, z: v.z }) } })
  return out
})
// close-ups show the scene only: hide the HUD (visibility is inherited, so the canvas can opt back in)
await p.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' })
const cities = spots.filter((s) => s.kind === 'city').sort((a, b) => a.x - b.x)
// CLOSE=harbor: one close-up per harbour (pier, cargo and sign) instead of the pieces
const picks = process.env.CLOSE === 'harbor'
  ? spots.filter((s) => s.kind.startsWith('harbor')).sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x))
  : [...cities.slice(0, 3), ...spots.filter((s) => s.kind === 'settlement').sort((a, b) => a.z - b.z).slice(0, 1)]
for (const [i, s] of picks.entries()) {
  await p.evaluate(({ x, y, z }) => {
    const I = window.__isles
    // controls off: their pan clamp and minDistance would pull the close-up back to the home view
    window.__probeDir ??= I.camera.position.clone().sub(I.controls.target).normalize()
    I.controls.enabled = false
    I.camera.position.set(x, y + 0.12, z).addScaledVector(window.__probeDir, 2.6)
    I.camera.lookAt(x, y + 0.12, z)
  }, s)
  await p.waitForTimeout(700)
  await p.screenshot({ path: `${OUT}/close_${i}_${s.kind}.png` })
}
const res = { ...stats, viewport: `${W}x${H}@${DPR}`, closeups: picks.length, errors }
writeFileSync(`${OUT}/probe.json`, JSON.stringify(res, null, 1))
console.log(JSON.stringify(res, null, 1))
await b.close()
