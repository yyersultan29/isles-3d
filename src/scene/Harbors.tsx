import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { animTime } from './motion'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { HARBORS, corner, tileAt, WATER_Y, islandRadius, type HarborKind } from './board'
import { signTexture } from './textures'
import { StaticBatch } from './StaticBatch'

const wood = new THREE.MeshStandardMaterial({ color: '#8b5a32', roughness: 0.85 })
const woodDark = new THREE.MeshStandardMaterial({ color: '#5a3a20', roughness: 0.9 })
const rope = new THREE.MeshStandardMaterial({ color: '#c9a66b', roughness: 1 })

// ---------- cargo on the pier (ASSET_DESIGN A4) ----------
// Crates are pale planed wood and logs dark, so neither melts into the brown deck.
// A small load that says what the harbour trades, readable from the board camera: logs, bricks,
// grain sacks, wool bales, a crate of ore, or crates and a barrel at a 3:1 harbour. Drawn at ×1.5 and
// kept low (about 0.1), on the shore end of the deck opposite the sign. On harbours whose sign stands
// between the camera and the pier (west and south-west) the sign still covers it; the sign says the type.
const brickMat = new THREE.MeshStandardMaterial({ color: '#b5492c', roughness: 0.85 })
const woolMat = new THREE.MeshStandardMaterial({ color: '#f1ebdd', roughness: 1 })
const oreMat = new THREE.MeshStandardMaterial({ color: '#8b9097', roughness: 0.75, flatShading: true })

type Part = [THREE.BufferGeometry, THREE.Material]
const at = (g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0) => { g.rotateY(ry); g.translate(x, y, z); return g }
const merged = (gs: THREE.BufferGeometry[]) => {
  const ns = gs.map((g) => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n })
  return mergeGeometries(ns)!
}
const log = (x: number, y: number, z: number) => { const g = new THREE.CylinderGeometry(0.02, 0.02, 0.14, 7); g.rotateZ(Math.PI / 2); return at(g, x, y, z) }
const logEnd = (x: number, y: number, z: number, sx: number) => { const g = new THREE.CircleGeometry(0.019, 7); g.rotateY(sx * Math.PI / 2); return at(g, x + sx * 0.0701, y, z) }
const box = (w: number, h: number, d: number, x: number, z: number, y = h / 2, ry = 0) => at(new THREE.BoxGeometry(w, h, d), x, y, z, ry)
const sack = (x: number, z: number, ry: number) => { const g = new THREE.SphereGeometry(0.04, 9, 6); g.scale(1, 1.15, 0.85); return at(g, x, 0.044, z, ry) }

const CARGO: Record<'wood' | 'brick' | 'wheat' | 'sheep' | 'ore' | 'generic', Part[]> = {
  wood: [
    [merged([log(0, 0.02, -0.022), log(0, 0.02, 0.022), log(0.006, 0.055, 0)]), woodDark],
    [merged([-1, 1].flatMap((sx) => [logEnd(0, 0.02, -0.022, sx), logEnd(0, 0.02, 0.022, sx), logEnd(0.006, 0.055, 0, sx)])), rope],
  ],
  brick: [
    [merged([...[-0.054, 0, 0.054].map((x) => box(0.05, 0.026, 0.07, x, 0, 0.013)), ...[-0.027, 0.027].map((x) => box(0.05, 0.026, 0.07, x, 0.004, 0.04, 0.06))]), brickMat],
  ],
  wheat: [[merged([sack(-0.03, 0, 0.3), sack(0.04, 0.012, -0.4)]), rope]],
  sheep: [[merged([0, 1].map((i) => { const g = new THREE.SphereGeometry(0.05, 8, 6); g.scale(1.2, 0.8, 0.9); return at(g, i ? 0.05 : -0.04, 0.04, i ? 0.01 : -0.006, i * 0.5) })), woolMat]],
  ore: [
    [box(0.11, 0.045, 0.08, 0, 0), rope],
    [merged([[-0.03, -0.012], [0.02, 0.014], [0.034, -0.018], [-0.006, 0.02]].map(([x, z], i) => at(new THREE.DodecahedronGeometry(0.024 - i * 0.002), x, 0.05, z, i))), oreMat],
  ],
  generic: [
    [merged([box(0.075, 0.07, 0.075, -0.03, 0, 0.035, 0.2), box(0.06, 0.05, 0.06, 0.05, 0.02, 0.025, -0.3)]), rope],
    [merged([at(new THREE.CylinderGeometry(0.03, 0.026, 0.075, 10), 0.012, 0.0375, -0.065)]), woodDark],
  ],
}
const cargoOf = (k: HarborKind) => CARGO[k === 'sheep3' ? 'generic' : k]

function Cargo({ kind }: { kind: HarborKind }) {
  return <group>{cargoOf(kind).map(([g, m], i) => <mesh key={i} geometry={g} material={m} castShadow receiveShadow />)}</group>
}

function Pier({ length }: { length: number }) {
  // planks run across the pier; pier extends along +z (outward)
  const planks = Math.floor(length / 0.06)
  return (
    <group>
      {Array.from({ length: planks }, (_, i) => (
        <mesh key={i} position={[((i * 37) % 5) * 0.002, 0, 0.03 + i * 0.06]} rotation-y={((i * 13) % 7 - 3) * 0.01} material={i % 3 ? wood : woodDark} castShadow receiveShadow>
          <boxGeometry args={[0.3, 0.018, 0.052]} />
        </mesh>
      ))}
      {/* stringers */}
      {[-0.11, 0.11].map((x) => (
        <mesh key={x} position={[x, -0.025, length / 2]} material={woodDark} castShadow>
          <boxGeometry args={[0.03, 0.03, length]} />
        </mesh>
      ))}
      {/* posts */}
      {Array.from({ length: Math.ceil(length / 0.28) + 1 }, (_, i) =>
        [-0.15, 0.15].map((x) => (
          <mesh key={`${i}${x}`} position={[x, -0.16, Math.min(i * 0.28, length - 0.02)]} material={woodDark} castShadow>
            <cylinderGeometry args={[0.018, 0.02, 0.42, 6]} />
          </mesh>
        )),
      )}
      {/* rail rope */}
      {[-0.15, 0.15].map((x) => (
        <mesh key={x} position={[x, 0.07, length / 2]} rotation-x={Math.PI / 2} material={rope}>
          <cylinderGeometry args={[0.005, 0.005, length, 4]} />
        </mesh>
      ))}
      {Array.from({ length: Math.ceil(length / 0.28) + 1 }, (_, i) =>
        [-0.15, 0.15].map((x) => (
          <mesh key={`r${i}${x}`} position={[x, 0.04, Math.min(i * 0.28, length - 0.02)]} material={woodDark}>
            <cylinderGeometry args={[0.012, 0.012, 0.08, 5]} />
          </mesh>
        )),
      )}
    </group>
  )
}

function Sign({ kind, ratio }: { kind: (typeof HARBORS)[number]['kind']; ratio: string }) {
  const tex = useMemo(() => signTexture(kind, ratio), [kind, ratio])
  return (
    <group>
      {[-0.2, 0.2].map((x) => (
        <mesh key={x} position={[x, 0.22, 0]} material={woodDark} castShadow>
          <cylinderGeometry args={[0.016, 0.02, 0.5, 6]} />
        </mesh>
      ))}
      <mesh position={[0, 0.42, 0]} material={woodDark} castShadow>
        <boxGeometry args={[0.5, 0.025, 0.03]} />
      </mesh>
      <mesh position={[0, 0.33, 0.012]} castShadow>
        <boxGeometry args={[0.44, 0.26, 0.015]} />
        <meshStandardMaterial attach="material-0" color="#5a3a20" />
        <meshStandardMaterial attach="material-1" color="#5a3a20" />
        <meshStandardMaterial attach="material-2" color="#5a3a20" />
        <meshStandardMaterial attach="material-3" color="#5a3a20" />
        <meshStandardMaterial attach="material-4" map={tex} roughness={0.8} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={0.12} />
        <meshStandardMaterial attach="material-5" map={tex} roughness={0.8} />
      </mesh>
    </group>
  )
}

const LANTERN_POOL = (() => {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 32)
  grd.addColorStop(0, 'rgba(255,180,90,0.9)')
  grd.addColorStop(0.5, 'rgba(255,150,60,0.3)')
  grd.addColorStop(1, 'rgba(255,140,50,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5, toneMapped: false })
})()

function Lantern({ phase }: { phase: number }) {
  const mat = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(() => {
    const t = animTime.value
    // restrained candle flicker: slow breathing plus a faint quicker waver
    const f = 1 + Math.sin(t * 2.3 + phase) * 0.06 + Math.sin(t * 6.1 + phase * 2) * 0.035
    if (mat.current) mat.current.emissiveIntensity = 6 * f
  })
  return (
    <group>
      <mesh position-y={0.16} material={woodDark} castShadow>
        <cylinderGeometry args={[0.01, 0.012, 0.32, 6]} />
      </mesh>
      <mesh position={[0.03, 0.31, 0]} material={woodDark}>
        <boxGeometry args={[0.07, 0.01, 0.01]} />
      </mesh>
      <mesh position={[0.06, 0.28, 0]}>
        <boxGeometry args={[0.032, 0.042, 0.032]} />
        <meshStandardMaterial ref={mat} color="#ffd38a" emissive="#ff9933" emissiveIntensity={6} />
      </mesh>
      {/* warm light pool on the planks, replacing a point light */}
      <mesh position={[0.06, 0.012, 0]} rotation-x={-Math.PI / 2} material={LANTERN_POOL} renderOrder={3}>
        <planeGeometry args={[0.5, 0.5]} />
      </mesh>
    </group>
  )
}

export const SIGN_SCALE = 1.5
const DECK_Y = WATER_Y + 0.13
const PIER_LEN = 0.46

function dockLayout() {
  return HARBORS.map((h, i) => {
    const t = tileAt(...h.tile)
    const a = corner(t, h.edge), b = corner(t, (h.edge + 1) % 6)
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2
    const out = Math.atan2(mz - t.z, mx - t.x) // outward direction
    const start = Math.hypot(mx, mz)
    const ramp = Math.max(0.3, islandRadius(out) - start + 0.12)
    return { h, i, mx, mz, out, ramp }
  })
}

/** World positions of the top edge of every harbour sign (used by the camera framing). */
export function harborSignTops(): [number, number, number][] {
  return dockLayout().map(({ mx, mz, out, ramp }) => {
    const along = ramp + 0.04 + PIER_LEN * 0.35
    const side = 0.28
    // local +z = outward, local +x = (sin out, -cos out)
    return [mx + Math.cos(out) * along + Math.sin(out) * side, DECK_Y + 0.47 * SIGN_SCALE, mz + Math.sin(out) * along - Math.cos(out) * side]
  })
}

export function Harbors() {
  const docks = useMemo(dockLayout, [])
  return (
    <StaticBatch>
      {docks.map(({ h, i, mx, mz, out, ramp }) => {
        const drop = -DECK_Y
        const ang = Math.atan2(drop, ramp)
        const rampLen = Math.hypot(drop, ramp)
        const pierLen = PIER_LEN
        return (
          <group key={i} position={[mx, 0, mz]} rotation-y={Math.PI / 2 - out} userData={{ piece: 'harbor', kind: h.kind }}>
            <group position={[0, 0.0, 0.04]} rotation-x={ang}>
              <Pier length={rampLen} />
            </group>
            <group position={[0, DECK_Y, ramp + 0.04]}>
              <Pier length={pierLen} />
              <group position={[0.28, 0.0, pierLen * 0.35]} rotation-y={-(Math.PI / 2 - out)} scale={SIGN_SCALE}>
                <Sign kind={h.kind} ratio={h.ratio} />
              </group>
              <group position={[-0.17, 0, pierLen * 0.9]}>
                <Lantern phase={i * 1.7} />
              </group>
              {/* the cargo sits on the shore end of the deck, opposite the sign */}
              <group position={[-0.06, 0.009, 0.1]} scale={1.5}>
                <Cargo kind={h.kind} />
              </group>
              <mesh position={[0.1, 0.04, pierLen * 0.95]} material={woodDark} castShadow>
                <cylinderGeometry args={[0.035, 0.035, 0.07, 10]} />
              </mesh>
            </group>
          </group>
        )
      })}
    </StaticBatch>
  )
}
