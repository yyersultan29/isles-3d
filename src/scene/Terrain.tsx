import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { TILES, Tile, tileHeight, hexDist, corner, EDGES, VERTICES, HEX_R } from './board'
import { fbm, noise2, smoothstep, clamp } from './noise'

const C = (hex: string) => new THREE.Color(hex)
const PAL = {
  grass: C('#4f7624'), grassLight: C('#7f963a'), grassDark: C('#324d18'), meadow: C('#6f7f30'),
  forest: C('#3d5a20'), forestDark: C('#263813'),
  wheat: C('#c48a24'), wheatLight: C('#e6b444'),
  sand: C('#d8b47a'), sandLight: C('#efd6a4'), sandDark: C('#b08752'),
  clay: C('#a24a2a'), clayLight: C('#c8783f'), clayDark: C('#61291a'), clayGreen: C('#66762c'),
  rock: C('#776f66'), rockDark: C('#423c37'), rockLight: C('#9d958a'), snow: C('#f4f6f8'), snowShade: C('#cfd8e2'),
  dirt: C('#9b744a'), dirtDark: C('#6e5032'),
}

const tmp = new THREE.Color()

function biomeColor(t: Tile, x: number, z: number, h: number, ny: number, out: THREE.Color) {
  /* eslint-disable no-param-reassign */
  const n1 = fbm(x * 3 + t.seed, z * 3, 3) * 0.5 + 0.5
  const n2 = noise2(x * 14, z * 14) * 0.5 + 0.5
  switch (t.biome) {
    case 'pasture':
      out.lerpColors(PAL.grassDark, PAL.grass, clamp(n1 * 1.3))
      out.lerp(PAL.grassLight, smoothstep(0.55, 0.9, n2 * 0.6 + n1 * 0.5) * 0.55)
      // drier meadow patches and darker clover clumps break up the green
      out.lerp(PAL.meadow, smoothstep(0.6, 0.85, fbm(x * 1.7 - t.seed, z * 1.7, 2) * 0.5 + 0.5) * 0.5)
      out.lerp(PAL.grassDark, smoothstep(0.72, 0.95, noise2(x * 22, z * 22) * 0.5 + 0.5) * 0.35)
      break
    case 'forest':
      out.lerpColors(PAL.forestDark, PAL.forest, n1)
      out.lerp(PAL.grassDark, n2 * 0.3)
      out.multiplyScalar(0.8)
      break
    case 'wheat':
      out.lerpColors(PAL.wheat, PAL.wheatLight, n1 * 0.7 + n2 * 0.3)
      // furrows between the field patches
      out.multiplyScalar(0.82 + 0.18 * smoothstep(-0.6, 0.4, Math.sin((x + z * 0.4) * 38 + n1 * 4)))
      break
    case 'desert':
      out.lerpColors(PAL.sandDark, PAL.sand, clamp(ny * ny * 1.1 + (n1 - 0.5) * 0.4))
      out.lerp(PAL.sandLight, smoothstep(0.6, 1, n2 * 0.5 + h * 3) * 0.6)
      break
    case 'hills': {
      const crev = smoothstep(0.95, 0.55, ny)
      out.lerpColors(PAL.clay, PAL.clayLight, clamp(h * 2.5 + (n1 - 0.5) * 0.6))
      out.lerp(PAL.clayDark, crev * 0.8)
      out.lerp(PAL.clayGreen, smoothstep(0.62, 0.8, n1) * smoothstep(0.12, 0.05, h) * 0.8)
      break
    }
    case 'mountain': {
      // large-scale slope (finite differences over a wide footprint) so snow and shading form
      // coherent caps instead of flickering per facet
      const e = 0.06
      const gx = (tileHeight(t, x + e, z) - tileHeight(t, x - e, z)) / (2 * e)
      const gz = (tileHeight(t, x, z + e) - tileHeight(t, x, z - e)) / (2 * e)
      const nys = 1 / Math.sqrt(1 + gx * gx + gz * gz)
      ny = ny * 0.3 + nys * 0.7
      // curvature (Laplacian): >0 in gullies/hollows, <0 on ridges and crests
      const c0 = tileHeight(t, x, z)
      const lap = (tileHeight(t, x + e, z) + tileHeight(t, x - e, z) + tileHeight(t, x, z + e) + tileHeight(t, x, z - e) - 4 * c0) / (e * e)
      const hollow = smoothstep(0.4, 3, lap)
      const ridge = smoothstep(0.4, 3, -lap)
      const steep = smoothstep(0.85, 0.45, ny)
      // horizontal strata give the rock a layered, carved look
      const strata = Math.sin(h * 70 + noise2(x * 5, z * 5) * 3) * 0.5 + 0.5
      out.lerpColors(PAL.rockLight, PAL.rock, clamp(0.35 + n1 * 0.5 + n2 * 0.1 + steep * 0.45))
      out.lerp(PAL.rockDark, steep * 0.5 + strata * 0.24)
      out.lerp(PAL.rockLight, smoothstep(0.78, 0.95, noise2(x * 9, h * 40)) * 0.22) // pale stone bands
      out.lerp(PAL.rockLight, ridge * 0.12) // sunlit, weathered crests
      out.lerp(PAL.rockDark, hollow * 0.35 * (1 - smoothstep(0.3, 0.45, h))) // shadowed lower gullies
      // snow: caps on gentle upper slopes, plus streaks that collect in gullies below the snow line
      const snowLine = 0.36 + fbm(x * 1.5, z * 1.5, 2) * 0.08
      const cap = smoothstep(snowLine, snowLine + 0.05, h) * smoothstep(0.45, 0.65, ny)
      const streak = smoothstep(0.3, 0.6, hollow) * smoothstep(snowLine - 0.2, snowLine - 0.06, h) * smoothstep(0.25, 0.5, ny)
      const snow = Math.max(cap, streak)
      tmp.lerpColors(PAL.snowShade, PAL.snow, clamp(ny * 1.4 - 0.3))
      out.lerp(tmp, snow)
      out.lerp(PAL.grassDark, smoothstep(0.1, 0.04, h) * 0.7)
      break
    }
  }
  // dirt band just inside the rails
  const d = hexDist(x - t.x, z - t.z)
  const band = smoothstep(0.84, 0.95, d + (n2 - 0.5) * 0.06)
  tmp.lerpColors(PAL.dirt, PAL.dirtDark, n2 * 0.6)
  out.lerp(tmp, band * 0.85)
}

/** Subdivided pointy-top hex surface displaced by the tile height function. */
export function buildTileGeometry(t: Tile, N: number, flat = false) {
  const pos: number[] = []
  const R = HEX_R * 0.995
  for (let k = 0; k < 6; k++) {
    const [ax, az] = corner({ x: 0, z: 0 }, k, R)
    const [bx, bz] = corner({ x: 0, z: 0 }, (k + 1) % 6, R)
    const P = (i: number, j: number): [number, number] => {
      // barycentric on triangle (0, A, B)
      const u = i / N, v = j / N
      return [ax * u + bx * v, az * u + bz * v]
    }
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N - i; j++) {
        const p0 = P(i, j), p1 = P(i + 1, j), p2 = P(i, j + 1)
        pos.push(p0[0], 0, p0[1], p2[0], 0, p2[1], p1[0], 0, p1[1])
        if (j < N - i - 1) {
          const p3 = P(i + 1, j + 1)
          pos.push(p1[0], 0, p1[1], p2[0], 0, p2[1], p3[0], 0, p3[1])
        }
      }
    }
  }
  let g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g = mergeVertices(g, 1e-4)
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + t.x, z = p.getZ(i) + t.z
    p.setY(i, tileHeight(t, x, z))
  }
  if (flat) g = g.toNonIndexed()
  g.computeVertexNormals()
  const pp = g.attributes.position as THREE.BufferAttribute
  const nn = g.attributes.normal as THREE.BufferAttribute
  const col = new Float32Array(pp.count * 3)
  const c = new THREE.Color()
  if (flat) {
    // one colour per face for a faceted, carved-stone look
    for (let i = 0; i < pp.count; i += 3) {
      const x = (pp.getX(i) + pp.getX(i + 1) + pp.getX(i + 2)) / 3 + t.x
      const z = (pp.getZ(i) + pp.getZ(i + 1) + pp.getZ(i + 2)) / 3 + t.z
      const y = (pp.getY(i) + pp.getY(i + 1) + pp.getY(i + 2)) / 3
      biomeColor(t, x, z, y, nn.getY(i), c)
      for (let k = 0; k < 3; k++) c.toArray(col, (i + k) * 3)
    }
  } else {
    for (let i = 0; i < pp.count; i++) {
      biomeColor(t, pp.getX(i) + t.x, pp.getZ(i) + t.z, pp.getY(i), nn.getY(i), c)
      c.toArray(col, i * 3)
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}

function TileMesh({ t }: { t: Tile }) {
  const geo = useMemo(() => {
    // smooth-shaded, finer meshes: organic rock and clay instead of sharp low-poly facets
    return buildTileGeometry(t, t.biome === 'mountain' ? 72 : t.biome === 'hills' ? 48 : 30, false)
  }, [t])
  return (
    <mesh geometry={geo} position={[t.x, 0, t.z]} castShadow receiveShadow>
      <meshStandardMaterial
        vertexColors
        roughness={t.biome === 'mountain' ? 0.86 : 0.95}
        metalness={0}
      />
    </mesh>
  )
}

/** Wooden rails along every hex edge + brass rivets at vertices. */
function Rails() {
  const { railGeo, rivets } = useMemo(() => {
    const g = new THREE.BoxGeometry(1, 1, 1)
    g.translate(0, 0.5, 0)
    return { railGeo: g, rivets: VERTICES }
  }, [])
  const railRef = (m: THREE.InstancedMesh | null) => {
    if (!m) return
    const o = new THREE.Object3D()
    EDGES.forEach((e, i) => {
      const [ax, az] = e.a, [bx, bz] = e.b
      const len = Math.hypot(bx - ax, bz - az)
      o.position.set((ax + bx) / 2, -0.01, (az + bz) / 2)
      o.rotation.set(0, -Math.atan2(bz - az, bx - ax), 0)
      o.scale.set(len * 0.98, 0.05, e.outer ? 0.09 : 0.075)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  }
  const rivRef = (m: THREE.InstancedMesh | null) => {
    if (!m) return
    const o = new THREE.Object3D()
    rivets.forEach(([x, z], i) => {
      o.position.set(x, 0.045, z)
      o.scale.setScalar(1)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  }
  return (
    <group>
      <instancedMesh ref={railRef} args={[railGeo, undefined, EDGES.length]} castShadow receiveShadow>
        <meshStandardMaterial color="#8a5e36" roughness={0.78} />
      </instancedMesh>
      <instancedMesh ref={rivRef} args={[undefined, undefined, rivets.length]} castShadow>
        <cylinderGeometry args={[0.05, 0.06, 0.035, 12]} />
        <meshStandardMaterial color="#c8b07a" roughness={0.35} metalness={0.7} />
      </instancedMesh>
    </group>
  )
}

export function Terrain() {
  return (
    <group>
      {TILES.map((t) => (
        <TileMesh key={t.id} t={t} />
      ))}
      <Rails />
    </group>
  )
}
