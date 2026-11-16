// Mountain guy close-ups at fixed animation times (debug render with its own camera, no post):
// rest, wound up, mid-swing, the blow; from the side (swing silhouette) and three-quarter front.
// Usage: node scripts/guy-pose.mjs <out.png> [times=8.5,1.19,1.29,1.374]   (needs the dev server)
// A time may be a mood instead (cheer, scared, sad): the shot is taken mid-reaction.
import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'
const [out, times = '8.5,1.19,1.29,1.374'] = process.argv.slice(2)
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await (await b.newContext({ viewport: { width: 900, height: 700 } })).newPage()
const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
await p.goto('http://localhost:5173/?menu=0&nohover', { waitUntil: 'networkidle' }); await p.waitForFunction(() => window.__isles); await p.waitForTimeout(3000)
const hitInfo = await p.evaluate(() => window.__guyHit)
const urls = await p.evaluate(async (times) => {
  const THREE = await import('/node_modules/.vite/deps/three.js')
  const { animTime } = await import('/src/scene/motion.ts')
  const { gl, scene, camera } = window.__isles
  let guy; scene.traverse((o) => { if (o.userData?.piece === 'mountain-guy') guy = o })
  const w = guy.getWorldPosition(new THREE.Vector3())
  const face = new THREE.Vector3(Math.sin(guy.rotation.y), 0, Math.cos(guy.rotation.y))
  const cv = document.createElement('canvas'); const S = 300; const out = []
  for (const t of times) {
    // let the app render one frame at this time (its own loop runs the pose), then shoot at once
    const raf = () => new Promise((ok) => requestAnimationFrame(ok))
    if (typeof t === 'string') { window.__guyReact(t, t); await new Promise((ok) => setTimeout(ok, t === 'sad' ? 1200 : 300)) }
    else for (let i = 0; i < 4; i++) { animTime.value = t; await raf() }
    // he turns to the rock while working: use his body's current facing
    let body; guy.traverse((o) => { if (!body && o !== guy && o.isGroup) body = o })
    const yaw = guy.rotation.y + (body?.rotation.y ?? 0), f = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), side = new THREE.Vector3(f.z, 0, -f.x)
    const row = []
    for (const dir of [side, f.clone().multiplyScalar(0.8).add(side.clone().multiplyScalar(0.6)).normalize()]) {
      const c = camera.clone(); c.fov = 30; c.aspect = 1; c.near = 0.01
      c.position.copy(w).addScaledVector(dir, 1.25).add(new THREE.Vector3(0, 0.35, 0)); c.lookAt(w.x + f.x * 0.08, w.y + 0.2, w.z + f.z * 0.08); c.updateProjectionMatrix()
      const size = gl.getSize(new THREE.Vector2()); gl.setSize(S, S, false); gl.render(scene, c); row.push(gl.domElement.toDataURL()); gl.setSize(size.x, size.y, false)
    }
    out.push(row)
  }
  return out
}, times.split(',').map((x) => (isNaN(+x) ? x : +x)))
// contact sheet
await p.setContent(`<body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(${urls.length},300px)">${urls[0].map((_, r) => urls.map((row) => `<img src="${row[r]}" width=300 height=300>`).join('')).join('')}</body>`)
await p.setViewportSize({ width: 300 * urls.length, height: 600 }); await p.waitForTimeout(300)
await p.screenshot({ path: out })
console.log(JSON.stringify({ errors, hit: hitInfo }))
await b.close()
