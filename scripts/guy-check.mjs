// Mountain guy check: model loads with no errors, size on screen, close-ups, click proxy (hop,
// pointer cursor, no board placement under him), draw calls and GPU memory with and without him.
// Usage: node scripts/guy-check.mjs [outDir]   (needs `npm run dev`)
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
const D = process.argv[2] ?? 'shots/guy'; mkdirSync(D, { recursive: true })
const APP = 'http://localhost:5173/'
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const errors = []
const page = async (q, w = 1440, h = 900, dpr = 1) => {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr })
  const p = await ctx.newPage()
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) })
  p.on('pageerror', (e) => errors.push('pageerror ' + e.message))
  await p.goto(APP + q, { waitUntil: 'networkidle' })
  await p.waitForFunction(() => window.__isles, null, { timeout: 20000 })
  await p.waitForTimeout(2500)
  return p
}
const guyInfo = (p) => p.evaluate(() => {
  const { scene, camera, gl } = window.__isles
  let g = null; scene.traverse((o) => { if (o.userData.piece === 'mountain-guy') g = o })
  if (!g) return null
  const v = g.getWorldPosition(g.position.clone())
  const top = v.clone(); top.y += 0.43
  const px = (x) => { const q = x.clone().project(camera); return [(q.x * 0.5 + 0.5) * innerWidth, (-q.y * 0.5 + 0.5) * innerHeight] }
  const [fx, fy] = px(v), [tx, ty] = px(top)
  let mesh = null; g.traverse((o) => { if (!mesh && (o.isSkinnedMesh || (o.isMesh && o.material?.map))) mesh = o })
  const m = mesh.material
  return {
    world: [v.x, v.y, v.z].map((n) => +n.toFixed(3)), feetPx: [Math.round(fx), Math.round(fy)], heightPx: Math.round(fy - ty), headPx: [Math.round(tx), Math.round(ty)],
    tris: mesh.geometry.index.count / 3, skinned: !!mesh.isSkinnedMesh, bones: mesh.skeleton?.bones.length ?? 0, mat: m.type, maps: { map: m.map?.colorSpace, normal: m.normalMap?.colorSpace, rough: m.roughnessMap?.colorSpace, metal: m.metalnessMap?.colorSpace },
    shadow: [mesh.castShadow, mesh.receiveShadow], calls: gl.info.render.calls, mem: { ...gl.info.memory },
  }
})
const out = { errors }

// 1. default view at 1440x900: where he is and how big
let p = await page('?menu=0')
out.view = await guyInfo(p)
await p.screenshot({ path: `${D}/1-board-1440.png` })
const [hx, hy] = out.view.headPx, [fx, fy] = out.view.feetPx
await p.screenshot({ path: `${D}/2-board-crop.png`, clip: { x: fx - 120, y: hy - 60, width: 240, height: fy - hy + 100 } })
// 2. click: hop starts, cursor is a pointer, the board took no action
const mid = [Math.round((hx + fx) / 2), Math.round((hy + fy) / 2)]
await p.mouse.move(mid[0] - 30, mid[1] + 60); await p.mouse.move(mid[0], mid[1], { steps: 4 })
out.cursor = await p.evaluate(() => window.__isles.gl.domElement.style.cursor)
const pieces = () => p.evaluate(() => { let n = 0; window.__isles.scene.traverse((o) => { if (o.userData.piece === 'settlement') n++ }); return n })
const before = await pieces()
// where a click on his head would land on the board without the proxy test: the ground plane behind him
out.headRayHitsTarget = await p.evaluate(([x, y]) => {
  const { camera } = window.__isles, T = camera.position.constructor
  const d = new T((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1, 0.5).unproject(camera).sub(camera.position).normalize()
  const k = (0.08 - camera.position.y) / d.y
  return [camera.position.x + d.x * k, camera.position.z + d.z * k].map((n) => +n.toFixed(2))
}, [hx, hy + 4])
await p.mouse.click(hx, hy + 4); await p.waitForTimeout(150)
await p.mouse.click(mid[0], mid[1]); await p.waitForTimeout(400)
out.hopY = await p.evaluate(() => { let g; window.__isles.scene.traverse((o) => { if (o.userData.piece === 'mountain-guy') g = o }); return +g.children[0].position.y.toFixed(3) })
await p.screenshot({ path: `${D}/3-hop-crop.png`, clip: { x: fx - 120, y: hy - 100, width: 240, height: fy - hy + 140 } })
await p.waitForTimeout(1200)
out.restY = await p.evaluate(() => { let g; window.__isles.scene.traverse((o) => { if (o.userData.piece === 'mountain-guy') g = o }); return +g.children[0].position.y.toFixed(3) })
out.settlementsBeforeAfterClicks = [before, await pieces()]
// 3. memory stays flat over time (no per-frame allocations of GPU objects)
const m0 = await p.evaluate(() => ({ ...window.__isles.gl.info.memory }))
await p.waitForTimeout(3000)
out.memStable = JSON.stringify(m0) === JSON.stringify(await p.evaluate(() => ({ ...window.__isles.gl.info.memory })))
await p.context().close()

// 4. without him (?off=guy): draw calls and GPU memory difference
p = await page('?menu=0&off=guy')
out.without = await p.evaluate(() => ({ calls: window.__isles.gl.info.render.calls, mem: { ...window.__isles.gl.info.memory } }))
await p.context().close()

// 5. close-ups (debug camera override only): front, side, back; DPR 2
const w = out.view.world
const cams = { front: [w[0], w[1] + 0.32, w[2] + 0.75], side: [w[0] + 0.75, w[1] + 0.3, w[2] + 0.1], back: [w[0] - 0.2, w[1] + 0.35, w[2] - 0.75] }
for (const [k, c] of Object.entries(cams)) {
  p = await page(`?menu=0&nohover&reducedmotion&cam=${c.join(',')}&tgt=${w[0]},${w[1] + 0.22},${w[2]}`, 800, 800, 2)
  await p.screenshot({ path: `${D}/4-close-${k}.png` })
  await p.context().close()
}
console.log(JSON.stringify(out, null, 1))
await b.close()
