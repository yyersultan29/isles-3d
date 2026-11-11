// Performance probe (V8): FPS, frame pacing, React commits, draw calls, memory, load and shader-compile time.
// Usage: node scripts/perf.mjs [url] [w] [h] [dpr]   env: UNCAP=1 (no vsync cap), WAIT=ms, PRE='js to run before measuring'
// Draw-call and memory fields need the dev server (window.__isles hook); FPS/load work on 'vite preview' too.
import { chromium } from 'playwright-core'
const [url='http://localhost:5173/', w='1440', h='900', dpr='2'] = process.argv.slice(2)
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist','--enable-precise-memory-info',...(process.env.UNCAP?['--disable-gpu-vsync','--disable-frame-rate-limit']:[])] })
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr })
const errors = []
page.on('console', (m) => { if (m.type() === 'error' || m.type()==='warning') errors.push(m.text().slice(0,160)) })
page.on('pageerror', (e) => errors.push('PAGEERR ' + e.message))
await page.addInitScript(() => {
  window.__commits = 0; window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { isDisabled: false, supportsFiber: true, renderers: new Map(), inject() { return 1 }, onCommitFiberRoot() { window.__commits++ }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, checkDCE() {} }
  window.__perf = { frames: [], first: 0 }
  const loop = (t) => { if (!window.__perf.first && document.querySelector('canvas')) window.__perf.first = t; window.__perf.frames.push(t); requestAnimationFrame(loop) }
  requestAnimationFrame(loop)
  // time spent in shader compile/link (sync getProgramParameter blocks on link)
  const P = WebGL2RenderingContext.prototype
  const wrap = (n) => { const o = P[n]; P[n] = function (...a) { const s = performance.now(); const r = o.apply(this, a); window.__perf.gl = (window.__perf.gl||0) + performance.now() - s; return r } }
  ;['compileShader','linkProgram','getProgramParameter','getShaderParameter','getProgramInfoLog','getShaderInfoLog'].forEach(wrap)
})
const t0 = Date.now()
await page.goto(url, { waitUntil: 'load' })
const loadMs = Date.now() - t0
// wait for the scene to become visible (first frame after canvas plus stable)
await page.waitForFunction(() => window.__perf.first > 0, null, { timeout: 30000 })
await page.waitForTimeout(Number(process.env.WAIT ?? 8000))
if (process.env.PRE) await page.evaluate(process.env.PRE); await page.waitForTimeout(500)
const r = await page.evaluate(async () => {
  const p = window.__perf
  const nav = performance.getEntriesByType('navigation')[0]
  const res = performance.getEntriesByType('resource')
  const bytes = res.reduce((a, e) => a + (e.transferSize || e.encodedBodySize || 0), 0)
  // long frames during startup
  const fr = p.frames
  let worst = 0; for (let i = 1; i < fr.length; i++) worst = Math.max(worst, fr[i] - fr[i-1])
  // steady fps over 5 s
  const c0 = window.__commits; const s = fr.length; const ts = performance.now()
  await new Promise((ok) => setTimeout(ok, 5000))
  const n = p.frames.length - s; const dt = (performance.now() - ts) / 1000
  const st = p.frames.slice(s); let jank = 0, mx = 0; for (let i=1;i<st.length;i++){const d=st[i]-st[i-1]; mx=Math.max(mx,d); if(d>34) jank++}
  const out = { reactCommitsTotal: window.__commits, reactCommitsIn5s: window.__commits - c0, fps: +(n/dt).toFixed(1), maxFrameMs: +mx.toFixed(1), framesOver34ms: jank, firstCanvasFrameMs: Math.round(p.first), startupWorstFrameMs: Math.round(worst), glCompileMs: Math.round(p.gl||0), domContentLoaded: Math.round(nav.domContentLoadedEventEnd), transferKB: Math.round(bytes/1024), heapMB: performance.memory ? +(performance.memory.usedJSHeapSize/1048576).toFixed(1) : null }
  const I = window.__isles
  if (I) {
    const { gl, scene } = I
    gl.info.autoReset = false; gl.info.reset()
    await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)))
    gl.info.reset()
    await new Promise((ok) => requestAnimationFrame(ok))
    out.callsPerFrame = gl.info.render.calls; out.trisPerFrame = gl.info.render.triangles
    gl.info.autoReset = true
    out.programs = gl.info.programs.length; out.textures = gl.info.memory.textures; out.geometries = gl.info.memory.geometries
    // GPU memory estimate
    let geoB = 0; const seen = new Set()
    scene.traverse((o) => { const g = o.geometry; if (!g || seen.has(g)) return; seen.add(g); for (const a of Object.values(g.attributes)) geoB += a.array.byteLength; if (g.index) geoB += g.index.array.byteLength; if (o.isInstancedMesh) { geoB += o.instanceMatrix.array.byteLength; if (o.instanceColor) geoB += o.instanceColor.array.byteLength } })
    let texB = 0; const ts2 = new Set()
    scene.traverse((o) => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) for (const v of Object.values(m)) if (v && v.isTexture && !ts2.has(v)) { ts2.add(v); const im = v.image; if (im && im.width) texB += im.width * im.height * 4 * (v.generateMipmaps ? 1.33 : 1) } })
    out.geomMB = +(geoB/1048576).toFixed(1); out.matTexMB = +(texB/1048576).toFixed(1); out.uniqueMatTextures = ts2.size
    const size = gl.getDrawingBufferSize(new (scene.position.constructor)()); out.buffer = `${size.x}x${size.y}`
  }
  return out
})
r.loadEvent = loadMs; r.errors = errors.slice(0, 6)
console.log(JSON.stringify(r))
await browser.close()
