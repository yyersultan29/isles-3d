import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { TILES, Tile, tileHeight, hexDist, corner, tileAt, BUILDINGS, ROADS, HARBORS, islandRadius, WATER_Y } from './board'
import { mulberry32, noise2, fbm } from './noise'
import { pineGeometry, bushGeometry, rockGeometry, wheatGeometry, grassTuftGeometry, sheepGeometries } from './models'
import { addWind } from './shaders'
import { oceanTime } from './Ocean'

export interface Inst { x: number; y: number; z: number; s: number; ry: number; sy?: number; tint?: THREE.Color }

// ---------- exclusion: keep props off buildings / roads / harbours ----------
const blockers: [number, number, number][] = []
for (const b of BUILDINGS) {
  const [x, z] = corner(tileAt(...b.tile), b.corner)
  blockers.push([x, z, b.city ? 0.3 : 0.24])
}
for (const r of ROADS) {
  const t = tileAt(...r.tile)
  const a = corner(t, r.edge), b = corner(t, (r.edge + 1) % 6)
  for (let i = 0; i <= 4; i++) blockers.push([a[0] + (b[0] - a[0]) * (i / 4), a[1] + (b[1] - a[1]) * (i / 4), 0.12])
}
for (const h of HARBORS) {
  const t = tileAt(...h.tile)
  const a = corner(t, h.edge), b = corner(t, (h.edge + 1) % 6)
  blockers.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0.3])
}
export const blocked = (x: number, z: number, pad = 0) => blockers.some(([bx, bz, r]) => (x - bx) ** 2 + (z - bz) ** 2 < (r + pad) ** 2)

/** Poisson-ish scatter inside a tile. */
function scatter(t: Tile, n: number, minD: number, opts: { dMax?: number; rMin?: number; seed?: number; accept?: (x: number, z: number) => boolean } = {}) {
  const rnd = mulberry32(t.seed + (opts.seed ?? 0))
  const pts: [number, number][] = []
  const dMax = opts.dMax ?? 0.84
  const rMin = opts.rMin ?? 0.36
  let tries = 0
  while (pts.length < n && tries < n * 40) {
    tries++
    const lx = (rnd() * 2 - 1) * 0.9
    const lz = (rnd() * 2 - 1) * 1.0
    if (hexDist(lx, lz) > dMax) continue
    if (Math.hypot(lx, lz) < rMin) continue
    const x = t.x + lx, z = t.z + lz
    if (blocked(x, z)) continue
    if (opts.accept && !opts.accept(x, z)) continue
    if (pts.some(([px, pz]) => (px - x) ** 2 + (pz - z) ** 2 < minD * minD)) continue
    pts.push([x, z])
  }
  return pts
}

export function useInstances(ref: React.RefObject<THREE.InstancedMesh | null>, items: Inst[], deps: unknown[] = []) {
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const o = new THREE.Object3D()
    items.forEach((it, i) => {
      o.position.set(it.x, it.y, it.z)
      o.rotation.set(0, it.ry, 0)
      o.scale.set(it.s, it.s * (it.sy ?? 1), it.s)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
      if (it.tint) m.setColorAt(i, it.tint)
    })
    m.count = items.length
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    m.computeBoundingSphere()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, ...deps])
}

function windMaterial(strength: number, props: THREE.MeshStandardMaterialParameters = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, ...props })
  m.onBeforeCompile = (s) => addWind(s, oceanTime, strength)
  return m
}

// ---------- Trees ----------
// Varied silhouettes (narrow spruce to broad fir, slight hue shifts) so forests don't read as copies.
const PINE_SHAPES = [
  { slender: 0.78, layers: 6, hue: 0.0 },
  { slender: 0.9, layers: 5, hue: 0.015 },
  { slender: 1.0, layers: 4, hue: -0.01 },
  { slender: 1.12, layers: 5, hue: 0.02 },
  { slender: 0.7, layers: 7, hue: -0.015 },
  { slender: 1.2, layers: 4, hue: 0.03 },
]
const PINE_VARIANTS = PINE_SHAPES.length

function Pines() {
  const geos = useMemo(() => PINE_SHAPES.map((sh, i) => pineGeometry(11 + i * 7, sh)), [])
  const mat = useMemo(() => windMaterial(0.006), [])
  const buckets = useMemo(() => {
    const b: Inst[][] = Array.from({ length: PINE_VARIANTS }, () => [])
    const rnd = mulberry32(5)
    const push = (x: number, z: number, y: number, s: number) => {
      const tint = new THREE.Color().setHSL(0.2 + rnd() * 0.12, 0.25, 0.74 + rnd() * 0.26)
      b[Math.floor(rnd() * PINE_VARIANTS)].push({ x, y: y - 0.01, z, s, ry: rnd() * 6.28, sy: 0.9 + rnd() * 0.45, tint })
    }
    for (const t of TILES) {
      let pts: [number, number][] = []
      let size = [0.28, 0.4]
      if (t.biome === 'forest') {
        // density varies across the tile: a thick core with clearings near the edge
        pts = scatter(t, 70, 0.105, { rMin: 0.4, dMax: 0.86, accept: (x, z) => fbm(x * 2.6 + t.seed, z * 2.6, 2) > -0.35 })
        size = [0.22, 0.5]
      }
      else if (t.biome === 'hills') pts = scatter(t, 6, 0.2, { seed: 3, dMax: 0.8, accept: (x, z) => fbm(x * 2, z * 2) > 0.1 })
      else if (t.biome === 'pasture') { pts = scatter(t, 4, 0.25, { seed: 8, rMin: 0.55 }); size = [0.24, 0.32] }
      else if (t.biome === 'mountain') { pts = scatter(t, 10, 0.12, { seed: 4, rMin: 0.4, accept: (x, z) => tileHeight(t, x, z) < 0.18 }); size = [0.18, 0.26] }
      else if (t.biome === 'wheat') { pts = scatter(t, 2, 0.4, { seed: 9, rMin: 0.7 }); size = [0.24, 0.3] }
      for (const [x, z] of pts) push(x, z, tileHeight(t, x, z), size[0] + rnd() * (size[1] - size[0]))
    }
    // a scattering of pines on the island rim (outside the rails)
    for (let i = 0; i < 70; i++) {
      const th = rnd() * Math.PI * 2
      const r = islandRadius(th) - 0.04 - rnd() * 0.1
      const x = Math.cos(th) * r, z = Math.sin(th) * r
      if (blocked(x, z, 0.1)) continue
      if (noise2(Math.cos(th) * 3, Math.sin(th) * 3) < -0.1) continue
      push(x, z, -0.03, 0.2 + rnd() * 0.12)
    }
    return b
  }, [])
  return (
    <>
      {geos.map((g, i) => (
        <InstGroup key={i} geo={g} mat={mat} items={buckets[i]} />
      ))}
    </>
  )
}

function InstGroup({ geo, mat, items, shadow = true }: { geo: THREE.BufferGeometry; mat: THREE.Material; items: Inst[]; shadow?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useInstances(ref, items)
  return <instancedMesh ref={ref} args={[geo, mat, Math.max(1, items.length)]} castShadow={shadow} receiveShadow frustumCulled={false} />
}

// ---------- Wheat ----------
function Wheat() {
  const geo = useMemo(() => wheatGeometry(), [])
  const mat = useMemo(() => windMaterial(0.012, { roughness: 0.75 }), [])
  const items = useMemo(() => {
    const out: Inst[] = []
    const rnd = mulberry32(77)
    for (const t of TILES.filter((t) => t.biome === 'wheat')) {
      // field patches with rows in varying directions
      const cell = 0.024
      for (let gx = -0.9; gx <= 0.9; gx += cell) {
        for (let gz = -1; gz <= 1; gz += cell * 0.86) {
          const lx = gx + (rnd() - 0.5) * cell * 1.2
          const lz = gz + (rnd() - 0.5) * cell * 1.2
          const d = hexDist(lx, lz)
          if (d > 0.86) continue
          const rc = Math.hypot(lx, lz)
          if (rc < 0.32) continue
          const x = t.x + lx, z = t.z + lz
          if (blocked(x, z, -0.04)) continue
          // furrows between patches
          const patch = noise2(x * 2.4 + 5, z * 2.4)
          const ang = patch * 2.5
          const row = Math.sin((x * Math.cos(ang) + z * Math.sin(ang)) * 46)
          if (row < -0.6) continue
          if (Math.abs(noise2(x * 3.1, z * 3.1)) < 0.05) continue
          const v = noise2(x * 6, z * 6) * 0.5 + 0.5
          const tint = new THREE.Color().setHSL(0.1 + rnd() * 0.03, 0.85, 0.86 + v * 0.08 + rnd() * 0.04)
          out.push({ x, y: tileHeight(t, x, z) - 0.01, z, s: 0.13 + rnd() * 0.04 + v * 0.025, ry: rnd() * 6.28, tint })
        }
      }
    }
    return out
  }, [])
  return <InstGroup geo={geo} mat={mat} items={items} />
}

// ---------- Grass tufts ----------
function Grass() {
  const geo = useMemo(() => grassTuftGeometry(), [])
  const mat = useMemo(() => {
    const m = windMaterial(0.01, { side: THREE.DoubleSide, roughness: 1 })
    return m
  }, [])
  const items = useMemo(() => {
    const out: Inst[] = []
    const rnd = mulberry32(31)
    for (const t of TILES) {
      const n = t.biome === 'pasture' ? 650 : t.biome === 'forest' ? 260 : t.biome === 'hills' ? 120 : t.biome === 'mountain' ? 60 : 0
      for (let i = 0; i < n; i++) {
        const lx = (rnd() * 2 - 1) * 0.9, lz = (rnd() * 2 - 1)
        if (hexDist(lx, lz) > 0.88) continue
        if (Math.hypot(lx, lz) < 0.3) continue
        const x = t.x + lx, z = t.z + lz
        const h = tileHeight(t, x, z)
        if (t.biome === 'mountain' && h > 0.12) continue
        if (t.biome === 'hills' && h > 0.14) continue
        const tint = new THREE.Color().setHSL(0.17 + rnd() * 0.07, 0.2, 0.58 + rnd() * 0.2)
        out.push({ x, y: h - 0.005, z, s: 0.035 + rnd() * 0.035, ry: rnd() * 6.28, tint })
      }
    }
    return out
  }, [])
  return <InstGroup geo={geo} mat={mat} items={items} shadow={false} />
}

// ---------- Bushes & rocks ----------
function Bushes() {
  const geo = useMemo(() => bushGeometry(4), [])
  const mat = useMemo(() => windMaterial(0.004, { flatShading: true }), [])
  const items = useMemo(() => {
    const out: Inst[] = []
    const rnd = mulberry32(12)
    for (const t of TILES) {
      const n = t.biome === 'pasture' ? 7 : t.biome === 'hills' ? 5 : t.biome === 'forest' ? 6 : t.biome === 'desert' ? 2 : 2
      for (const [x, z] of scatter(t, n, 0.16, { seed: 21, rMin: 0.38 })) {
        const tint = new THREE.Color().setHSL(0.22 + rnd() * 0.08, 0.35, 0.7 + rnd() * 0.2)
        out.push({ x, y: tileHeight(t, x, z) - 0.01, z, s: 0.12 + rnd() * 0.1, ry: rnd() * 6.28, tint })
      }
    }
    for (let i = 0; i < 90; i++) {
      const th = rnd() * Math.PI * 2
      const r = islandRadius(th) - 0.02 - rnd() * 0.08
      const x = Math.cos(th) * r, z = Math.sin(th) * r
      if (blocked(x, z, 0.05)) continue
      out.push({ x, y: -0.04, z, s: 0.1 + rnd() * 0.1, ry: rnd() * 6.28, tint: new THREE.Color().setHSL(0.24, 0.35, 0.65 + rnd() * 0.2) })
    }
    return out
  }, [])
  return <InstGroup geo={geo} mat={mat} items={items} />
}

function Rocks() {
  const geos = useMemo(() => [rockGeometry(1), rockGeometry(2)], [])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), [])
  const buckets = useMemo(() => {
    const b: Inst[][] = [[], []]
    const rnd = mulberry32(44)
    for (const t of TILES) {
      const n = t.biome === 'mountain' ? 14 : t.biome === 'hills' ? 12 : t.biome === 'pasture' ? 9 : t.biome === 'desert' ? 8 : t.biome === 'forest' ? 5 : 2
      for (const [x, z] of scatter(t, n, 0.1, { seed: 55, rMin: 0.34 })) {
        const tint = t.biome === 'hills' ? new THREE.Color('#c27a52') : t.biome === 'desert' ? new THREE.Color('#d9bd8f') : new THREE.Color('#ffffff')
        b[i(rnd)].push({ x, y: tileHeight(t, x, z) - 0.01, z, s: 0.03 + rnd() * rnd() * 0.1, ry: rnd() * 6.28, tint })
      }
    }
    // coastal boulders at the waterline
    for (let k = 0; k < 220; k++) {
      const th = rnd() * Math.PI * 2
      const r = islandRadius(th) + 0.12 + rnd() * 0.18
      b[i(rnd)].push({ x: Math.cos(th) * r, y: WATER_Y - rnd() * 0.05, z: Math.sin(th) * r, s: 0.08 + rnd() * 0.16, ry: rnd() * 6.28, tint: new THREE.Color().setHSL(0.08, 0.12, 0.6 + rnd() * 0.3) })
    }
    return b
  }, [])
  return (
    <>
      {geos.map((g, k) => (
        <InstGroup key={k} geo={g} mat={mat} items={buckets[k]} />
      ))}
    </>
  )
}
const i = (rnd: () => number) => (rnd() < 0.5 ? 0 : 1)

// ---------- Sheep ----------
function Sheep() {
  const { wool, dark } = useMemo(() => sheepGeometries(), [])
  const items = useMemo(() => {
    const out: Inst[] = []
    const rnd = mulberry32(64)
    for (const t of TILES.filter((t) => t.biome === 'pasture')) {
      for (const [x, z] of scatter(t, 8, 0.18, { seed: 70, rMin: 0.36, dMax: 0.78 })) {
        out.push({ x, y: tileHeight(t, x, z) - 0.005, z, s: 0.36 + rnd() * 0.08, ry: rnd() * 6.28 })
      }
    }
    return out
  }, [])
  const r1 = useRef<THREE.InstancedMesh>(null)
  const r2 = useRef<THREE.InstancedMesh>(null)
  useInstances(r1, items)
  useInstances(r2, items)
  return (
    <>
      <instancedMesh ref={r1} args={[wool, undefined, items.length]} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={1} />
      </instancedMesh>
      <instancedMesh ref={r2} args={[dark, undefined, items.length]} castShadow>
        <meshStandardMaterial vertexColors roughness={0.7} />
      </instancedMesh>
    </>
  )
}

export function Vegetation() {
  return (
    <group>
      <Pines />
      <Wheat />
      <Grass />
      <Bushes />
      <Rocks />
      <Sheep />
    </group>
  )
}
