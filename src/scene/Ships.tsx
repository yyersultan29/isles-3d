import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { animTime } from './motion'
import * as THREE from 'three'
import { WATER_Y } from './board'

/** Lofted wooden hull: stations along x, U-shaped cross-sections. Length ≈ 1. */
function hullGeometry() {
  const ST = 24, PR = 9
  const pos: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= ST; i++) {
    const u = i / ST // 0 stern → 1 bow
    const x = u - 0.5
    const beam = 0.17 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.85 + 0.12)), 0.7) + 0.01
    const sheer = 0.13 + 0.06 * Math.pow(Math.abs(u - 0.45) * 2, 2)
    const keel = -0.08 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.95 + 0.04)), 0.5)
    for (let j = 0; j <= PR; j++) {
      const a = (j / PR) * Math.PI // 0 port gunwale → π starboard gunwale
      const cx = Math.cos(a)
      const sy = Math.sin(a)
      pos.push(x, sheer + (keel - sheer) * Math.pow(sy, 0.8), beam * cx * (0.55 + 0.45 * Math.pow(1 - sy, 0.3)))
    }
  }
  for (let i = 0; i < ST; i++)
    for (let j = 0; j < PR; j++) {
      const a = i * (PR + 1) + j, b = a + PR + 1
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  // planks: darker stripes
  const p = g.attributes.position as THREE.BufferAttribute
  const col = new Float32Array(p.count * 3)
  const c1 = new THREE.Color('#7a4a26'), c2 = new THREE.Color('#5a341a'), trim = new THREE.Color('#3b2412')
  const wale = new THREE.Color('#b8955a'), bottom = new THREE.Color('#3a2219')
  const c = new THREE.Color()
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i)
    // narrow strakes with a thin dark seam between them
    const k = (y + 0.1) * 90
    c.copy(Math.floor(k) % 2 ? c1 : c2)
    if (k % 1 < 0.12) c.multiplyScalar(0.7)
    if (y > 0.088 && y < 0.1) c.copy(wale)
    if (y < -0.03) c.copy(bottom)
    if (y > 0.12) c.copy(trim)
    c.toArray(col, i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}

function sailGeometry(w: number, h: number, tri = false) {
  const g = new THREE.PlaneGeometry(w, h, 10, 10)
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i)
    const y = p.getY(i)
    const v = (y + h / 2) / h
    // taper toward the top-left without collapsing vertices (degenerate tris → NaN normals)
    if (tri) x = x + (-w / 2 + (x + w / 2) * 0.06 - x) * v * 0.97
    p.setX(i, x)
  }
  g.computeVertexNormals()
  // cloth panels: vertical seams, a darker bolt rope at the edges, two reef bands, soft dirt at the foot
  const uv = g.attributes.uv as THREE.BufferAttribute
  const col = new Float32Array(p.count * 3)
  const cloth = new THREE.Color('#efe3c6'), seam = new THREE.Color('#c9b78f'), c = new THREE.Color()
  for (let i = 0; i < p.count; i++) {
    const u = uv.getX(i), v = uv.getY(i)
    c.copy(cloth)
    if (Math.abs(((u * 5) % 1) - 0.5) > 0.42) c.lerp(seam, 0.6)
    if (Math.abs(v - 0.62) < 0.02 || Math.abs(v - 0.78) < 0.02) c.lerp(seam, 0.5)
    if (u < 0.04 || u > 0.96 || v < 0.04 || v > 0.97) c.lerp(seam, 0.8)
    c.lerp(seam, (1 - v) * 0.25)
    c.toArray(col, i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}

/** Shrouds, stays and the gaff's peak halyard, in ship space (mast at x 0.02, bowsprit tip at x 0.66). */
const rigging = (() => {
  const top: [number, number, number] = [0.02, 0.87, 0]
  const ends: [number, number, number][] = [
    [-0.06, 0.15, 0.15], [0.1, 0.15, 0.15], [-0.06, 0.15, -0.15], [0.1, 0.15, -0.15], // shrouds
    [0.66, 0.22, 0], // forestay
    [-0.48, 0.2, 0], // backstay
  ]
  const pos: number[] = []
  for (const e of ends) pos.push(...top, ...e)
  pos.push(0.02, 0.8, 0, -0.38, 0.72, 0) // peak halyard to the gaff end
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  return g
})()
const ropeMat = new THREE.LineBasicMaterial({ color: '#2a1d14', transparent: true, opacity: 0.75 })
const glowMat = new THREE.MeshStandardMaterial({ color: '#3a2412', emissive: '#ffb45a', emissiveIntensity: 1.4 })

const sailMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide })
sailMat.onBeforeCompile = (s) => {
  s.uniforms.uTime = shipTime
  s.vertexShader = s.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float uTime;')
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float bx = (uv.x - 0.5) * 2.0; float by = (uv.y - 0.5) * 2.0;
      transformed.z += (1.0 - bx*bx) * (1.0 - by*by*0.6) * (0.05 + 0.008 * sin(uTime * 2.3 + uv.y * 4.0));`,
    )
}
const shipTime = { value: 0 }

function Ship({ scale = 1, flagColor = '#c8302a' }: { scale?: number; flagColor?: string }) {
  const hull = useMemo(() => hullGeometry(), [])
  const main = useMemo(() => sailGeometry(0.42, 0.5), [])
  const jib = useMemo(() => sailGeometry(0.3, 0.46, true), [])
  return (
    <group scale={scale}>
      <mesh geometry={hull} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.75} side={THREE.DoubleSide} />
      </mesh>
      {/* deck */}
      <mesh position={[0.02, 0.12, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[0.78, 0.25]} />
        <meshStandardMaterial color="#a5774a" roughness={0.9} />
      </mesh>
      {/* cabin */}
      <mesh position={[-0.3, 0.17, 0]} castShadow>
        <boxGeometry args={[0.16, 0.1, 0.18]} />
        <meshStandardMaterial color="#6e4322" roughness={0.8} />
      </mesh>
      {/* masts */}
      <mesh position={[0.02, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.009, 0.013, 0.78, 6]} />
        <meshStandardMaterial color="#4a2e18" />
      </mesh>
      <mesh position={[-0.12, 0.2, 0]} rotation-z={Math.PI / 2} castShadow>
        <cylinderGeometry args={[0.006, 0.006, 0.34, 5]} />
        <meshStandardMaterial color="#4a2e18" />
      </mesh>
      {/* gaff at the head of the mainsail */}
      <mesh position={[-0.17, 0.72, 0]} rotation-z={Math.PI / 2 - 0.08} castShadow>
        <cylinderGeometry args={[0.005, 0.006, 0.44, 5]} />
        <meshStandardMaterial color="#4a2e18" />
      </mesh>
      {/* lit cabin windows (a thin band through the cabin shows on both sides) and the stern lantern */}
      <mesh position={[-0.3, 0.185, 0]} material={glowMat}>
        <boxGeometry args={[0.1, 0.022, 0.184]} />
      </mesh>
      <mesh position={[-0.5, 0.26, 0]} material={glowMat}>
        <boxGeometry args={[0.025, 0.035, 0.025]} />
      </mesh>
      <lineSegments geometry={rigging} material={ropeMat} />
      <mesh geometry={main} material={sailMat} position={[-0.17, 0.47, 0]} rotation-y={0.18} castShadow />
      <mesh geometry={jib} material={sailMat} position={[0.2, 0.4, 0]} rotation-y={-0.12} castShadow />
      <mesh position={[0.05, 0.9, 0]}>
        <planeGeometry args={[0.09, 0.04]} />
        <meshStandardMaterial color={flagColor} side={THREE.DoubleSide} />
      </mesh>
      {/* bowsprit */}
      <mesh position={[0.56, 0.18, 0]} rotation-z={-1.2}>
        <cylinderGeometry args={[0.006, 0.008, 0.22, 5]} />
        <meshStandardMaterial color="#4a2e18" />
      </mesh>
    </group>
  )
}

const SHIPS = [
  { x: -6.0, z: -0.6, ry: 0.4, s: 1.1, r: 0.35, sp: 0.05, flag: '#c8302a' },
  { x: -6.1, z: 2.9, ry: -0.3, s: 1.0, r: 0.3, sp: 0.04, flag: '#2850c8' },
  { x: 6.3, z: -4.5, ry: 2.7, s: 0.95, r: 0.3, sp: 0.045, flag: '#e0782a' },
  { x: 6.6, z: 3.6, ry: -2.4, s: 1.05, r: 0.35, sp: 0.05, flag: '#eeeeee' },
]

export function Ships() {
  const refs = useRef<(THREE.Group | null)[]>([])
  useFrame(() => {
    const t = animTime.value
    shipTime.value = t
    SHIPS.forEach((s, i) => {
      const g = refs.current[i]
      if (!g) return
      const a = t * s.sp + i * 2
      g.position.set(s.x + Math.cos(a) * s.r, WATER_Y + 0.02 + Math.sin(t * 1.3 + i) * 0.012, s.z + Math.sin(a) * s.r * 0.6)
      g.rotation.set(Math.sin(t * 1.1 + i) * 0.04, s.ry + Math.sin(a) * 0.1, Math.sin(t * 0.9 + i * 2) * 0.05)
    })
  })
  return (
    <group>
      {SHIPS.map((s, i) => (
        <group key={i} ref={(g) => { refs.current[i] = g }}>
          <Ship scale={s.s} flagColor={s.flag} />
        </group>
      ))}
    </group>
  )
}
