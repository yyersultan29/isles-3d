import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { TILES, tileHeight, corner, tileAt, BUILDINGS, ROADS, PLAYER_COLORS, Player, groundHeight } from './board'
import { tokenTexture } from './textures'

// ---------------- Number tokens ----------------
const TOKEN_R = 0.27

function tokenSideGeometry() {
  const pts = [
    new THREE.Vector2(0, -0.02),
    new THREE.Vector2(TOKEN_R * 0.96, -0.02),
    new THREE.Vector2(TOKEN_R, 0.0),
    new THREE.Vector2(TOKEN_R, 0.035),
    new THREE.Vector2(TOKEN_R * 0.97, 0.05),
    new THREE.Vector2(TOKEN_R * 0.93, 0.052),
  ]
  return new THREE.LatheGeometry(pts, 48)
}

export function Tokens() {
  const side = useMemo(() => tokenSideGeometry(), [])
  const top = useMemo(() => {
    const g = new THREE.CircleGeometry(TOKEN_R * 0.935, 48)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])
  return (
    <group>
      {TILES.filter((t) => t.number).map((t) => {
        let y = 0
        for (let a = 0; a < 8; a++) {
          const r = TOKEN_R * 0.9
          y = Math.max(y, tileHeight(t, t.x + Math.cos(a) * r, t.z + Math.sin(a) * r))
        }
        y = Math.max(y, tileHeight(t, t.x, t.z)) + 0.04
        return (
          <group key={t.id} position={[t.x, y, t.z]} rotation-y={0}>
            <mesh geometry={side} castShadow receiveShadow>
              <meshStandardMaterial color="#d9c296" roughness={0.6} />
            </mesh>
            <mesh geometry={top} position-y={0.0525} receiveShadow>
              <meshStandardMaterial map={tokenTexture(t.number!)} roughness={0.55} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

// ---------------- Robber ----------------
export function Robber() {
  const geo = useMemo(() => {
    const p = [
      [0, 0], [0.13, 0], [0.135, 0.02], [0.11, 0.04], [0.085, 0.07], [0.07, 0.14], [0.065, 0.2],
      [0.09, 0.225], [0.095, 0.24], [0.06, 0.255], [0.075, 0.29], [0.09, 0.33], [0.085, 0.37], [0.06, 0.4], [0.02, 0.415], [0, 0.415],
    ].map(([x, y]) => new THREE.Vector2(x, y))
    const g = new THREE.LatheGeometry(p, 40)
    g.scale(1.25, 1.25, 1.25)
    return g
  }, [])
  const desert = TILES.find((t) => t.biome === 'desert')!
  return (
    <mesh geometry={geo} position={[desert.x, tileHeight(desert, desert.x, desert.z) - 0.01, desert.z]} castShadow receiveShadow>
      <meshPhysicalMaterial color="#1b1a1c" roughness={0.32} metalness={0.15} clearcoat={0.6} clearcoatRoughness={0.3} />
    </mesh>
  )
}

// ---------------- Buildings ----------------

/** Gabled house; footprint ~ w × d, origin at ground centre. Returns body and roof parts. */
function houseParts(w: number, d: number, wallH: number, roofH: number) {
  const shape = new THREE.Shape()
  shape.moveTo(-w / 2, 0)
  shape.lineTo(w / 2, 0)
  shape.lineTo(w / 2, wallH)
  shape.lineTo(0, wallH + roofH)
  shape.lineTo(-w / 2, wallH)
  shape.closePath()
  const body = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false })
  body.translate(0, 0, -d / 2)
  // roof: two slabs overhanging
  const slope = Math.hypot(w / 2, roofH)
  const ang = Math.atan2(roofH, w / 2)
  const roofParts: THREE.BufferGeometry[] = []
  for (const s of [-1, 1]) {
    const slab = new THREE.BoxGeometry(slope + 0.03, 0.022, d + 0.05)
    slab.translate((s * (slope + 0.03)) / 2, 0.011, 0)
    slab.rotateZ(s * -ang)
    slab.translate(0, wallH + roofH + 0.004, 0)
    // the slab pivot is the ridge; rotate already handled
    roofParts.push(slab.toNonIndexed())
  }
  const roof = mergeGeometries(roofParts)!
  return { body, roof }
}

function windowGeometry(w: number, d: number, wallH: number) {
  const parts: THREE.BufferGeometry[] = []
  const win = (x: number, y: number, z: number, ry: number) => {
    const g = new THREE.PlaneGeometry(0.03, 0.04)
    g.rotateY(ry)
    g.translate(x, y, z)
    parts.push(g)
  }
  for (const zz of [-d / 4, d / 4]) {
    win(w / 2 + 0.002, wallH * 0.55, zz, Math.PI / 2)
    win(-w / 2 - 0.002, wallH * 0.55, zz, -Math.PI / 2)
  }
  win(0, wallH * 0.95, d / 2 + 0.002, 0)
  win(0, wallH * 0.95, -d / 2 - 0.002, Math.PI)
  return mergeGeometries(parts)!
}

function Settlement({ player, city }: { player: Player; city: boolean }) {
  const pc = PLAYER_COLORS[player]
  const geos = useMemo(() => {
    if (!city) {
      const h = houseParts(0.15, 0.2, 0.11, 0.08)
      return { main: h, win: windowGeometry(0.15, 0.2, 0.11), tower: null as null | ReturnType<typeof houseParts> }
    }
    const h = houseParts(0.2, 0.26, 0.13, 0.09)
    const tower = houseParts(0.12, 0.12, 0.26, 0.11)
    return { main: h, win: windowGeometry(0.2, 0.26, 0.13), tower }
  }, [city])
  const wall = useMemo(() => new THREE.MeshStandardMaterial({ color: pc.wall, roughness: 0.65 }), [pc])
  const roof = useMemo(() => new THREE.MeshStandardMaterial({ color: pc.roof, roughness: 0.55 }), [pc])
  const glow = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffcf7a', emissive: '#ffae42', emissiveIntensity: 4 }), [])
  const base = useMemo(() => new THREE.MeshStandardMaterial({ color: '#7d6a55', roughness: 0.9 }), [])
  const door = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3a2416', roughness: 0.8 }), [])
  return (
    <group>
      <mesh position-y={0.012} castShadow receiveShadow material={base}>
        <cylinderGeometry args={[city ? 0.24 : 0.16, city ? 0.26 : 0.18, 0.03, 8]} />
      </mesh>
      <group position={[city ? -0.04 : 0, 0.025, 0]}>
        <mesh geometry={geos.main.body} material={wall} castShadow receiveShadow />
        <mesh geometry={geos.main.roof} material={roof} castShadow />
        <mesh geometry={geos.win} material={glow} />
        {/* door on the gable end */}
        <mesh position={[0, 0.03, (city ? 0.13 : 0.1) + 0.003]} material={door}>
          <planeGeometry args={[0.035, 0.06]} />
        </mesh>
        <mesh position={[0.04, city ? 0.2 : 0.17, 0.05]} material={roof} castShadow>
          <boxGeometry args={[0.025, 0.06, 0.025]} />
        </mesh>
      </group>
      {geos.tower && (
        <group position={[0.11, 0.025, -0.02]}>
          <mesh geometry={geos.tower.body} material={wall} castShadow receiveShadow />
          <mesh geometry={geos.tower.roof} material={roof} castShadow />
          <mesh position={[0.061, 0.18, 0]} rotation-y={Math.PI / 2} material={glow}>
            <planeGeometry args={[0.03, 0.05]} />
          </mesh>
          <mesh position={[0, 0.18, 0.061]} material={glow}>
            <planeGeometry args={[0.03, 0.05]} />
          </mesh>
        </group>
      )}
    </group>
  )
}

export function Buildings() {
  return (
    <group>
      {BUILDINGS.map((b, i) => {
        const t = tileAt(...b.tile)
        const [x, z] = corner(t, b.corner)
        // face roughly toward the board centre for a pleasing composition
        const ry = Math.atan2(x, z) + Math.PI / 2 + (i % 2) * 0.3
        return (
          <group key={i} position={[x, 0.02, z]} rotation-y={ry} scale={b.city ? 1.38 : 1.6}>
            <Settlement player={b.player} city={b.city} />
          </group>
        )
      })}
      <Roads />
      <Lanterns />
    </group>
  )
}

function Roads() {
  const items = useMemo(
    () =>
      ROADS.map((r) => {
        const t = tileAt(...r.tile)
        const a = corner(t, r.edge), b = corner(t, (r.edge + 1) % 6)
        return { a, b, color: PLAYER_COLORS[r.player].wall, edge: PLAYER_COLORS[r.player].roof }
      }),
    [],
  )
  return (
    <group>
      {items.map(({ a, b, color, edge }, i) => {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1])
        const ang = -Math.atan2(b[1] - a[1], b[0] - a[0])
        return (
          <group key={i} position={[(a[0] + b[0]) / 2, 0.03, (a[1] + b[1]) / 2]} rotation-y={ang}>
            {/* darker plinth along the rail, then two chunky painted blocks on top */}
            <mesh position-y={0.012} castShadow receiveShadow>
              <boxGeometry args={[len * 0.74, 0.03, 0.135]} />
              <meshStandardMaterial color={edge} roughness={0.7} />
            </mesh>
            {[-0.19, 0.19].map((f, k) => (
              <mesh key={k} position={[f * len, 0.05, 0]} castShadow receiveShadow>
                <boxGeometry args={[len * 0.355, 0.06, 0.11]} />
                <meshStandardMaterial color={color} roughness={0.5} emissive={color} emissiveIntensity={0.12} />
              </mesh>
            ))}
          </group>
        )
      })}
    </group>
  )
}

/** Small lantern posts next to cities; flickering warm light. */
function Lanterns() {
  const spots = useMemo(
    () =>
      BUILDINGS.filter((b) => b.city).map((b) => {
        const [x, z] = corner(tileAt(...b.tile), b.corner)
        const ox = x + 0.2, oz = z + 0.12
        return [ox, groundHeight(ox, oz), oz] as const
      }),
    [],
  )
  const mats = useRef<THREE.MeshStandardMaterial[]>([])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    mats.current.forEach((m, i) => {
      if (m) m.emissiveIntensity = 5 + Math.sin(t * 9 + i * 3) * 0.8 + Math.sin(t * 23 + i) * 0.5
    })
  })
  return (
    <group>
      {spots.map(([x, y, z], i) => (
        <group key={i} position={[x, y, z]}>
          <mesh position-y={0.08} castShadow>
            <cylinderGeometry args={[0.008, 0.01, 0.16, 6]} />
            <meshStandardMaterial color="#2c2622" />
          </mesh>
          <mesh position-y={0.17}>
            <boxGeometry args={[0.03, 0.035, 0.03]} />
            <meshStandardMaterial ref={(m) => { if (m) mats.current[i] = m }} color="#ffd080" emissive="#ff9a2e" emissiveIntensity={5} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
