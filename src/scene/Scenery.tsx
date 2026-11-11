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

/** Large faceted sea-cliff mass with grassy top. */
function cliffGeometry(seed: number, sx: number, sy: number, sz: number) {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 26)
  g.deleteAttribute('normal')
  g.deleteAttribute('uv')
  g = mergeVertices(g)
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const n = fbm(x * 1.6 + seed, z * 1.6 + y * 1.3, 5)
    const ang = Math.atan2(z, x)
    const strata = noise2(ang * 9 + seed, y * 10) * 0.08 + noise2(ang * 30 + seed, y * 4) * 0.05 + noise2(x * 9 + seed, z * 9 + y * 9) * 0.04 + Math.abs(noise2(ang * 16, y * 26)) * 0.05
    const f = 1 + n * 0.35 + strata
    x *= f * sx
    z *= f * sz
    // flat-ish top plateau, steep sides
    y = y > 0 ? Math.pow(y, 0.45) * sy * (0.85 + 0.15 * n) : y * sy * 0.6
    p.setXYZ(i, x, y, z)
  }
  g = g.toNonIndexed()
  g.computeVertexNormals()
  const pp = g.attributes.position as THREE.BufferAttribute
  const nn = g.attributes.normal as THREE.BufferAttribute
  const col = new Float32Array(pp.count * 3)
  const rock = new THREE.Color('#7f7466'), dark = new THREE.Color('#3b342e'), light = new THREE.Color('#ab9f8d')
  const grass = new THREE.Color('#5c7f2a'), wet = new THREE.Color('#1f1d1c')
  const c = new THREE.Color()
  for (let i = 0; i < pp.count; i += 3) {
    const y = (pp.getY(i) + pp.getY(i + 1) + pp.getY(i + 2)) / 3
    const ny = nn.getY(i)
    const n = noise2(pp.getX(i) * 4, pp.getZ(i) * 4 + y * 3) * 0.5 + 0.5
    c.lerpColors(dark, rock, n)
    c.lerp(light, smoothstep(0.7, 0.95, n) * 0.6)
    c.lerp(grass, smoothstep(0.72, 0.9, ny) * smoothstep(sy * 0.55, sy * 0.8, y) * (0.5 + n * 0.5))
    c.lerp(wet, smoothstep(0.15, -0.05, y + 0.0))
    for (let k = 0; k < 3; k++) c.toArray(col, (i + k) * 3)
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
          <sphereGeometry args={[0.18 + i * 0.02, 10, 8]} />
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

/** Out-of-focus foreground foliage framing the bottom corners. */
function Foreground() {
  const geo = useMemo(() => bushGeometry(17), [])
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true })
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
          <meshStandardMaterial vertexColors roughness={0.95} flatShading />
        </mesh>
      ))}
      <CliffTrees />
      <Waterfall position={[-6.45, WATER_Y + 1.15, -4.8]} />
      <Foreground />
      <Birds />
    </group>
  )
}
