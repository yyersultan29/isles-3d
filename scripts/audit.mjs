// Scene audit: draw-call sources, lights, materials, triangles. Usage: node scripts/audit.mjs [url]
import { chromium } from 'playwright-core'
const url = process.argv[2] ?? 'http://localhost:5173/'
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(Number(process.env.WAIT ?? 9000))
const r = await page.evaluate(() => {
  const { gl, scene } = window.__isles
  let meshes = 0, inst = 0, instances = 0, tris = 0, lights = { point: 0, dir: 0, other: 0 }, transparent = 0
  const mats = new Set(), geos = new Set(), byName = {}
  scene.traverseVisible((o) => {
    if (o.isLight) { if (o.isPointLight) lights.point++; else if (o.isDirectionalLight) lights.dir++; else lights.other++ }
    if (!o.isMesh) return
    meshes++
    const ms = Array.isArray(o.material) ? o.material : [o.material]
    ms.forEach((m) => { mats.add(m); if (m.transparent) transparent++ })
    geos.add(o.geometry)
    const g = o.geometry
    const t = (g.index ? g.index.count : g.attributes.position.count) / 3
    const n = o.isInstancedMesh ? o.count : 1
    if (o.isInstancedMesh) { inst++; instances += n }
    tris += t * n
    // attribute meshes to their top-level component group for a rough breakdown
    let p = o; while (p.parent && p.parent !== scene && p.parent.parent !== scene) p = p.parent
    const key = (p.parent === scene ? p : p.parent).uuid.slice(0, 4) + ':' + (o.isInstancedMesh ? 'inst' : 'mesh')
    byName[key] = (byName[key] || 0) + 1
  })
  const top = Object.entries(byName).sort((a, b) => b[1] - a[1]).slice(0, 8)
  return { meshes, instancedMeshes: inst, instances, triangles: Math.round(tris), materials: mats.size, geometries: geos.size, transparent, lights, textures: gl.info.memory.textures, programs: gl.info.programs.length, topGroups: top }
})
console.log(JSON.stringify(r, null, 1))
await browser.close()
