// Procedural mesh builders for props. Each returns a merged, vertex-coloured BufferGeometry
// so it can be drawn as a single InstancedMesh.
import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { mulberry32, noise2 } from './noise'

function paint(g: THREE.BufferGeometry, fn: (p: THREE.Vector3, out: THREE.Color) => void) {
  const p = g.attributes.position as THREE.BufferAttribute
  const col = new Float32Array(p.count * 3)
  const v = new THREE.Vector3()
  const c = new THREE.Color()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    fn(v, c)
    c.toArray(col, i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}

const solid = (hex: string) => {
  const c = new THREE.Color(hex)
  return (_: THREE.Vector3, out: THREE.Color) => out.copy(c)
}

function clean(g: THREE.BufferGeometry) {
  // strip attributes so geometries can merge
  const n = g.index ? g.toNonIndexed() : g
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') n.deleteAttribute(k)
  return n
}

/**
 * Layered conifer. Each tier is an irregular skirt with 5–7 drooping branch lobes, a slight random tilt
 * and jagged needle edges, so the silhouette stops reading as a stack of perfect cones.
 * Colours: dark shaded underside, mid body and sunlit tips. Height ≈ 1.
 */
export function pineGeometry(seed: number, shape: { slender?: number; layers?: number; hue?: number } = {}) {
  const rnd = mulberry32(seed)
  const parts: THREE.BufferGeometry[] = []
  const slender = shape.slender ?? 1 // <1 = narrow spruce, >1 = broad fir
  const trunk = new THREE.CylinderGeometry(0.03, 0.05, 0.34, 7)
  trunk.translate(0, 0.17, 0)
  parts.push(paint(clean(trunk), solid('#4a2f1c')))
  const layers = shape.layers ?? 4 + Math.floor(rnd() * 2)
  const hue = shape.hue ?? 0
  const under = new THREE.Color('#183a1c').offsetHSL(hue, 0, 0)
  const dark = new THREE.Color('#22481f').offsetHSL(hue, 0, 0)
  const mid = new THREE.Color('#3b6f2e').offsetHSL(hue, 0, 0)
  const tip = new THREE.Color('#86ae4e').offsetHSL(hue, -0.05, 0)
  const span = 0.7 // vertical extent of the foliage
  for (let l = 0; l < layers; l++) {
    const t = l / (layers - 1)
    const r = 0.37 * slender * (1 - t * 0.76) * (0.88 + rnd() * 0.24)
    const h = ((0.34 * (1 - t * 0.3) * 4.5) / Math.max(4, layers)) / Math.sqrt(slender)
    const y0 = 0.15 + t * span * (layers > 5 ? 1.12 : 1)
    const lobes = 5 + Math.floor(rnd() * 3)
    const phase = rnd() * Math.PI * 2
    const cone = new THREE.ConeGeometry(r, h, 18, 4, true)
    const p = cone.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
      const a = Math.atan2(z, x)
      const rim = -y / h + 0.5 // 0 at top, 1 at rim
      const lobe = Math.pow(Math.abs(Math.cos(((a + phase) * lobes) / 2)), 1.5) // 1 at branch, 0 between
      const jag = 1 + (0.28 * lobe - 0.1) * rim + 0.09 * Math.sin(a * 23 + l * 3) * rim * rim + 0.07 * noise2(a * 2 + l, seed) * rim
      const droop = rim * rim * (0.05 + 0.07 * lobe)
      p.setXYZ(i, x * jag, y - droop, z * jag)
    }
    // slight per-tier tilt and twist
    cone.rotateY(rnd() * Math.PI)
    cone.rotateX((rnd() - 0.5) * 0.12)
    cone.rotateZ((rnd() - 0.5) * 0.12)
    cone.translate(0, y0 + h / 2, 0)
    cone.computeVertexNormals()
    parts.push(
      paint(clean(cone), (v, out) => {
        const k = (v.y - y0) / h // 0 bottom of skirt, 1 top
        const radial = Math.min(1, Math.hypot(v.x, v.z) / Math.max(0.01, r))
        out.lerpColors(under, dark, Math.min(1, k * 2.2))
        out.lerp(mid, Math.min(1, Math.max(0, k - 0.25) * 1.6))
        // sunlit outer needle tips (sun from -x/-z), more on upper tiers
        const sun = Math.max(0, (-v.x - v.z) / Math.max(0.01, r) * 0.7 + 0.3)
        out.lerp(tip, Math.max(0, radial - 0.55) * 1.4 * (0.45 + 0.55 * t) * sun)
      }),
    )
  }
  const g = mergeGeometries(parts)!
  g.computeBoundingSphere()
  return g
}

/** Broadleaf tree: short trunk and branches with 4–6 lumpy crown masses. Height ≈ 1. */
export function broadleafGeometry(seed: number) {
  const rnd = mulberry32(seed)
  const parts: THREE.BufferGeometry[] = []
  const trunk = new THREE.CylinderGeometry(0.035, 0.06, 0.42, 7)
  trunk.translate(0, 0.21, 0)
  parts.push(paint(clean(trunk), solid('#53361f')))
  for (let b = 0; b < 3; b++) {
    const br = new THREE.CylinderGeometry(0.014, 0.025, 0.22, 5)
    br.translate(0, 0.11, 0)
    br.rotateZ(0.7)
    br.rotateY((b / 3) * Math.PI * 2 + rnd())
    br.translate(0, 0.3, 0)
    parts.push(paint(clean(br), solid('#53361f')))
  }
  const crowns = 4 + Math.floor(rnd() * 3)
  const lo = new THREE.Color('#25431a'), mid = new THREE.Color('#446f27'), hi = new THREE.Color('#87a849')
  for (let c = 0; c < crowns; c++) {
    const rad = 0.17 + rnd() * 0.09
    const s = new THREE.IcosahedronGeometry(rad, 2)
    const p = s.attributes.position as THREE.BufferAttribute
    for (let k = 0; k < p.count; k++) {
      const f = 1 + 0.16 * noise2(p.getX(k) * 11 + c * 3, p.getZ(k) * 11 + p.getY(k) * 7) + 0.06 * noise2(p.getX(k) * 30, p.getY(k) * 30)
      p.setXYZ(k, p.getX(k) * f, p.getY(k) * f * 0.82, p.getZ(k) * f)
    }
    const a = (c / crowns) * Math.PI * 2 + rnd()
    const rr = c === 0 ? 0 : 0.13 + rnd() * 0.07
    const cy = c === 0 ? 0.68 : 0.5 + rnd() * 0.16
    s.translate(Math.cos(a) * rr, cy, Math.sin(a) * rr)
    s.computeVertexNormals()
    parts.push(
      paint(clean(s), (v, out) => {
        const k = Math.min(1, Math.max(0, (v.y - 0.35) / 0.5))
        out.lerpColors(lo, mid, k)
        out.lerp(hi, Math.max(0, k - 0.6) * 1.6 * Math.max(0, 0.5 - v.x - v.z))
      }),
    )
  }
  const g = mergeGeometries(parts)!
  g.computeBoundingSphere()
  return g
}

/** Round broadleaf bush / deciduous tree crown. */
export function bushGeometry(seed: number) {
  const rnd = mulberry32(seed)
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 4; i++) {
    const s = new THREE.IcosahedronGeometry(0.22 + rnd() * 0.1, 1)
    const p = s.attributes.position as THREE.BufferAttribute
    for (let k = 0; k < p.count; k++) {
      const f = 1 + 0.18 * noise2(p.getX(k) * 9 + i, p.getZ(k) * 9 + p.getY(k) * 5)
      p.setXYZ(k, p.getX(k) * f, p.getY(k) * f * 0.85, p.getZ(k) * f)
    }
    s.translate((rnd() - 0.5) * 0.3, 0.2 + rnd() * 0.12, (rnd() - 0.5) * 0.3)
    parts.push(clean(s))
  }
  let g = mergeGeometries(parts)!
  g = mergeVertices(g)
  g.computeVertexNormals()
  const lo = new THREE.Color('#2d4f1d'), hi = new THREE.Color('#77a23e')
  paint(g, (v, out) => out.lerpColors(lo, hi, Math.min(1, Math.max(0, v.y * 1.8 - 0.2))))
  return g.toNonIndexed()
}

/** Weathered boulder: rounded mass with flattened bedding planes and soft shading. */
export function rockGeometry(seed: number) {
  const rnd = mulberry32(seed)
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(0.5, 2)
  g.deleteAttribute('normal')
  g.deleteAttribute('uv')
  g = mergeVertices(g)
  const p = g.attributes.position as THREE.BufferAttribute
  const sx = 0.85 + rnd() * 0.45, sy = 0.5 + rnd() * 0.3, sz = 0.8 + rnd() * 0.4
  const tilt = (rnd() - 0.5) * 0.5
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const f = 1 + 0.22 * noise2(x * 2.6 + seed, z * 2.6 + y * 2) + 0.07 * noise2(x * 7, y * 7 + z * 3)
    x *= f * sx; y *= f * sy; z *= f * sz
    // a few planar cuts (bedding/fracture planes) give it a rock rather than a potato silhouette
    const plane = y + x * tilt
    if (plane > 0.16) y -= (plane - 0.16) * 0.7
    if (x > 0.36 * sx) x -= (x - 0.36 * sx) * 0.6
    y = Math.max(-0.08, y)
    p.setXYZ(i, x, y, z)
  }
  g.computeVertexNormals()
  const lo = new THREE.Color('#57524c'), hi = new THREE.Color('#a8a196'), moss = new THREE.Color('#5d6b33')
  return paint(g, (v, out) => {
    out.lerpColors(lo, hi, Math.min(1, Math.max(0, v.y * 1.6 + 0.45 + noise2(v.x * 9, v.z * 9) * 0.15)))
    out.multiplyScalar(0.92 + 0.12 * Math.sin(v.y * 60 + v.x * 6)) // faint bedding lines
    out.lerp(moss, Math.max(0, v.y * 2 - 0.1) * Math.max(0, noise2(v.x * 6 + seed, v.z * 6)) * 0.7)
  })
}

/** Single wheat stalk with bearded ear; height ≈ 1. */
export function wheatGeometry() {
  const parts: THREE.BufferGeometry[] = []
  const stem = new THREE.CylinderGeometry(0.014, 0.02, 0.72, 3)
  stem.translate(0, 0.36, 0)
  parts.push(paint(clean(stem), solid('#cf8f22')))
  const ear = new THREE.OctahedronGeometry(0.085, 0)
  ear.scale(0.75, 2.8, 0.75)
  ear.translate(0, 0.84, 0)
  parts.push(paint(clean(ear), (v, out) => out.set('#eda21c').lerp(new THREE.Color('#ffd36a'), Math.max(0, (v.y - 0.78) * 3.5))))
  const leaf = new THREE.PlaneGeometry(0.05, 0.36, 1, 2)
  const lp = leaf.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < lp.count; i++) lp.setZ(i, Math.pow(lp.getY(i) + 0.18, 2) * 0.6)
  leaf.rotateY(0.7)
  leaf.translate(0.02, 0.34, 0)
  parts.push(paint(clean(leaf), solid('#c4952c')))
  const g = mergeGeometries(parts)!
  g.computeVertexNormals()
  return g
}

/** Small grass tuft of crossed blades; height ≈ 1. */
export function grassTuftGeometry() {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 5; i++) {
    const b = new THREE.BufferGeometry()
    const w = 0.09
    b.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, 0, 1, 0.18], 3))
    b.computeVertexNormals()
    b.rotateY((i / 5) * Math.PI * 2)
    b.rotateZ((i - 2) * 0.12)
    parts.push(b)
  }
  const g = mergeGeometries(parts)!
  const lo = new THREE.Color('#34561b'), hi = new THREE.Color('#7a9a3a')
  paint(g, (v, out) => out.lerpColors(lo, hi, v.y))
  // point normals up for soft grass shading
  const n = g.attributes.normal as THREE.BufferAttribute
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0)
  return g
}

/** Fluffy sheep. Returns wool + dark (head/legs) parts that share instance transforms. */
export function sheepGeometries() {
  const rnd = mulberry32(99)
  const wool: THREE.BufferGeometry[] = []
  const body = [
    [0, 0.2, 0, 0.14], [0.1, 0.21, 0, 0.12], [-0.1, 0.2, 0, 0.12], [0.02, 0.27, 0.04, 0.1],
    [-0.05, 0.27, -0.05, 0.1], [0.08, 0.24, 0.07, 0.09], [-0.08, 0.24, 0.07, 0.09], [0.06, 0.25, -0.07, 0.09],
  ]
  for (const [x, y, z, r] of body) {
    const s = new THREE.IcosahedronGeometry(r, 1)
    const p = s.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const f = 1 + 0.12 * (rnd() - 0.5)
      p.setXYZ(i, p.getX(i) * f, p.getY(i) * f, p.getZ(i) * f)
    }
    s.translate(x, y, z)
    wool.push(clean(s))
  }
  const woolG = mergeGeometries(wool)!
  woolG.computeVertexNormals()
  paint(woolG, (v, out) => out.set('#f2efe6').lerp(new THREE.Color('#cfc8b8'), Math.max(0, 0.25 - v.y) * 3))

  const dark: THREE.BufferGeometry[] = []
  const head = new THREE.SphereGeometry(0.07, 8, 6)
  head.scale(1.25, 0.9, 0.85)
  head.translate(0.21, 0.26, 0)
  dark.push(clean(head))
  for (const [ex, ez] of [[0.2, 0.06], [0.2, -0.06]]) {
    const ear = new THREE.SphereGeometry(0.03, 5, 4)
    ear.scale(1.6, 0.5, 0.9)
    ear.translate(ex, 0.3, ez)
    dark.push(clean(ear))
  }
  for (const [lx, lz] of [[0.09, 0.06], [0.09, -0.06], [-0.09, 0.06], [-0.09, -0.06]]) {
    const leg = new THREE.CylinderGeometry(0.018, 0.016, 0.14, 5)
    leg.translate(lx, 0.07, lz)
    dark.push(clean(leg))
  }
  const darkG = mergeGeometries(dark)!
  darkG.computeVertexNormals()
  paint(darkG, solid('#2a2523'))
  return { wool: woolG, dark: darkG }
}
