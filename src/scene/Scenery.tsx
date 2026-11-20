import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { WATER_Y } from './board'
import { fbm, mulberry32, noise2, smoothstep } from './noise'
import { pineGeometry, bushGeometry } from './models'
import { SIMPLEX_GLSL, addWind } from './shaders'
import { oceanTime } from './Ocean'
import { animTime, motion } from './motion'

/** Large sea-cliff mass with a grassy top, smooth-shaded and painted like the island's own cliff (Island.tsx). */
let sphere: THREE.BufferGeometry | null = null // the same welded sphere under every cliff: built once
function cliffGeometry(seed: number, sx: number, sy: number, sz: number) {
  if (!sphere) {
    sphere = new THREE.IcosahedronGeometry(1, 26)
    sphere.deleteAttribute('normal')
    sphere.deleteAttribute('uv')
    sphere = mergeVertices(sphere)
  }
  const g = sphere.clone()
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const n = fbm(x * 1.6 + seed, z * 1.6 + y * 1.3, 5)
    const ang = Math.atan2(z, x)
    // vertical columns, boulder bulges and soft strata ledges (each band leans out a little at its top)
    const cols = noise2(ang * 9 + seed, y * 3) * 0.07 + noise2(ang * 22 + seed, y * 2) * 0.03
    const band = ((y * 7 + noise2(ang * 3, seed) * 0.6) % 1 + 1) % 1
    const ledge = smoothstep(0.75, 1, band) * 0.035 * smoothstep(0.9, 0.2, Math.abs(y))
    const f = 1 + n * 0.32 + cols + ledge
    x *= f * sx
    z *= f * sz
    // flat-ish top plateau, steep sides
    y = y > 0 ? Math.pow(y, 0.45) * sy * (0.85 + 0.15 * n) : y * sy * 0.6
    p.setXYZ(i, x, y, z)
  }
  g.computeVertexNormals()
  const nn = g.attributes.normal as THREE.BufferAttribute
  const col = new Float32Array(p.count * 3)
  const rock = new THREE.Color('#8a8073'), dark = new THREE.Color('#463d36'), light = new THREE.Color('#b9ad99')
  const grass = new THREE.Color('#4c6a24'), grassLight = new THREE.Color('#7f8f3c'), moss = new THREE.Color('#465e22'), wet = new THREE.Color('#2f2b28')
  const c = new THREE.Color()
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ny = nn.getY(i)
    const n = noise2(x * 4, z * 4 + y * 3) * 0.5 + 0.5
    const strata = Math.sin(y * 18 + noise2(x * 2, z * 2) * 2.5) * 0.5 + 0.5
    c.lerpColors(dark, rock, Math.min(1, n * 0.7 + strata * 0.35))
    c.lerp(light, smoothstep(0.7, 0.95, strata) * 0.45 * (0.6 + n * 0.4)) // pale beds
    c.lerp(moss, smoothstep(0.35, 0.7, ny) * 0.5) // ledges catch moss
    c.lerp(grass, smoothstep(0.62, 0.85, ny) * smoothstep(sy * 0.5, sy * 0.75, y))
    c.lerp(grassLight, smoothstep(0.85, 0.98, ny) * smoothstep(sy * 0.6, sy * 0.85, y) * n * 0.6)
    c.lerp(wet, smoothstep(0.15, -0.05, y))
    c.toArray(col, i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}

const CLIFFS = [
  // framing masses at the corners, kept clear of the harbours and away from the board
  { p: [-7.9, WATER_Y - 0.1, -5.6], s: [2.0, 2.4, 1.6], seed: 1, ry: 0.3 },
  { p: [-6.0, WATER_Y - 0.1, -7.6], s: [1.4, 1.6, 1.1], seed: 5, ry: 0.9 },
  { p: [-7.6, WATER_Y - 0.1, 1.5], s: [1.2, 0.9, 1.5], seed: 2, ry: -0.2 },
  { p: [-6.4, WATER_Y - 0.1, 5.0], s: [1.6, 1.5, 1.3], seed: 3, ry: 0.6 },
  { p: [8.6, WATER_Y - 0.1, -6.6], s: [1.6, 1.3, 1.4], seed: 4, ry: 0.1 },
  { p: [7.4, WATER_Y - 0.1, 5.4], s: [1.1, 0.8, 1.0], seed: 6, ry: 1.2 },
] as const

function Waterfall({ position }: { position: [number, number, number] }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uTime: oceanTime },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float uTime; varying vec2 vUv; ${SIMPLEX_GLSL}
          void main(){
            float n = snoise(vec2(vUv.x * 12.0, vUv.y * 3.0 + uTime * 2.2)) * 0.5 + 0.5;
            float n2 = snoise(vec2(vUv.x * 30.0, vUv.y * 6.0 + uTime * 3.5)) * 0.5 + 0.5;
            float edge = smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
            float a = edge * (0.55 + 0.45 * n) * (0.7 + 0.3 * n2);
            vec3 c = mix(vec3(0.55, 0.72, 0.8), vec3(0.95, 0.98, 1.0), n2);
            gl_FragColor = vec4(c * 1.2, a);
          }`,
      }),
    [],
  )
  return (
    <group position={position}>
      <mesh material={mat} rotation-y={0.5}>
        <planeGeometry args={[0.45, 2.3, 1, 1]} />
      </mesh>
      {/* mist at the bottom */}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[(i - 1.5) * 0.18, -1.12, 0.1]}>
          <sphereGeometry args={[0.18 + i * 0.02, 20, 14]} />
          <meshStandardMaterial color="#e8f2f6" transparent opacity={0.35} roughness={1} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

function Birds() {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.12, 0.03, -0.05, -0.02, 0, 0.02, 0, 0, 0, 0.12, 0.03, -0.05, 0.02, 0, 0.02], 3))
    g.computeVertexNormals()
    return g
  }, [])
  const refs = useRef<(THREE.Mesh | null)[]>([])
  const birds = useMemo(() => {
    const r = mulberry32(8)
    return Array.from({ length: 6 }, (_, i) => ({ cx: (r() - 0.5) * 10, cz: -4 + r() * 8, rad: 1 + r() * 2, h: 2.4 + r() * 1.2, sp: 0.15 + r() * 0.15, ph: i * 1.3 }))
  }, [])
  const group = useRef<THREE.Group>(null)
  useFrame(() => {
    if (group.current) group.current.visible = !motion.reduced
    const t = animTime.value
    birds.forEach((b, i) => {
      const m = refs.current[i]
      if (!m) return
      const a = t * b.sp + b.ph
      m.position.set(b.cx + Math.cos(a) * b.rad, b.h + Math.sin(t * 0.7 + i) * 0.1, b.cz + Math.sin(a) * b.rad)
      m.rotation.set(0, -a, 0)
      m.scale.set(0.55, 0.55 * (1 + Math.sin(t * 7 + i) * 0.8), 0.55)
    })
  })
  return (
    <group ref={group}>
      {birds.map((_, i) => (
        <mesh key={i} ref={(m) => { refs.current[i] = m }} geometry={geo} castShadow>
          <meshStandardMaterial color="#f5f5f2" side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  )
}

/** Foreground foliage framing the bottom corners. */
function Foreground() {
  const geo = useMemo(() => bushGeometry(17, 3), [])
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })
    m.onBeforeCompile = (s) => addWind(s, oceanTime, 0.01)
    return m
  }, [])
  const clumps = useMemo(() => {
    const r = mulberry32(3)
    const out: { p: [number, number, number]; s: number; ry: number }[] = []
    const add = (cx: number, cy: number, cz: number, n: number, spread: number, base: number) => {
      for (let i = 0; i < n; i++) out.push({ p: [cx + (r() - 0.5) * spread, cy + r() * 0.3, cz + (r() - 0.5) * spread], s: base * (0.7 + r() * 0.6), ry: r() * 6 })
    }
    add(-4.9, 0.0, 4.9, 10, 1.4, 0.75)
    add(-5.9, 0.6, 3.6, 7, 1.2, 0.6)
    add(4.9, -0.1, 4.9, 9, 1.5, 0.7)
    return out
  }, [])
  const ref = (m: THREE.InstancedMesh | null) => {
    if (!m) return
    const o = new THREE.Object3D()
    clumps.forEach((c, i) => {
      o.position.set(...c.p)
      o.rotation.set(0, c.ry, 0)
      o.scale.setScalar(c.s)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  }
  return <instancedMesh ref={ref} args={[geo, mat, clumps.length]} castShadow receiveShadow frustumCulled={false} />
}

function CliffTrees() {
  const geo = useMemo(() => pineGeometry(91), [])
  const items = useMemo(() => {
    const r = mulberry32(19)
    const out: [number, number, number, number][] = []
    for (const c of CLIFFS) {
      for (let i = 0; i < 10; i++) {
        const a = r() * 6.28, rr = r() * 0.6
        out.push([c.p[0] + Math.cos(a) * c.s[0] * rr, c.p[1] + c.s[1] * 0.9, c.p[2] + Math.sin(a) * c.s[2] * rr, 0.45 + r() * 0.35])
      }
    }
    return out
  }, [])
  const ref = (m: THREE.InstancedMesh | null) => {
    if (!m) return
    const o = new THREE.Object3D()
    items.forEach(([x, y, z, s], i) => {
      o.position.set(x, y, z)
      o.scale.setScalar(s)
      o.rotation.set(0, i, 0)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  }
  return (
    <instancedMesh ref={ref} args={[geo, undefined, items.length]} castShadow frustumCulled={false}>
      <meshStandardMaterial vertexColors roughness={0.9} />
    </instancedMesh>
  )
}

export function Scenery() {
  const geos = useMemo(() => CLIFFS.map((c) => cliffGeometry(c.seed, c.s[0], c.s[1], c.s[2])), [])
  return (
    <group>
      {CLIFFS.map((c, i) => (
        <mesh key={i} geometry={geos[i]} position={c.p as unknown as [number, number, number]} rotation-y={c.ry} castShadow receiveShadow>
          <meshStandardMaterial vertexColors roughness={0.95} />
        </mesh>
      ))}
      <CliffTrees />
      <Waterfall position={[-6.45, WATER_Y + 1.15, -4.8]} />
      <Foreground />
      <Birds />
    </group>
  )
}
