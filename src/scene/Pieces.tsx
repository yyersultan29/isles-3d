import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { animTime } from './motion'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { TILES, tileHeight, corner, tileAt, tileByAxial, BOARD_MODE, BUILDINGS, ROADS, PLAYER_COLORS, Player, groundHeight } from './board'
import { tokenTexture } from './textures'
import { StaticBatch } from './StaticBatch'
import { mulberry32 } from './noise'
import { useGame } from '../store/GameProvider'

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

const TOKEN_SIDE = new THREE.MeshStandardMaterial({ color: '#d9c296', roughness: 0.6 })
const tokenTopMats = new Map<number, THREE.MeshStandardMaterial>()
const tokenTop = (n: number) => {
  let m = tokenTopMats.get(n)
  if (!m) tokenTopMats.set(n, (m = new THREE.MeshStandardMaterial({ map: tokenTexture(n), roughness: 0.55 })))
  return m
}

export function Tokens() {
  const side = useMemo(() => tokenSideGeometry(), [])
  const top = useMemo(() => {
    const g = new THREE.CircleGeometry(TOKEN_R * 0.935, 48)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])
  return (
    <StaticBatch>
      {TILES.filter((t) => t.number).map((t) => {
        let y = 0
        for (let a = 0; a < 8; a++) {
          const r = TOKEN_R * 0.9
          y = Math.max(y, tileHeight(t, t.x + Math.cos(a) * r, t.z + Math.sin(a) * r))
        }
        y = Math.max(y, tileHeight(t, t.x, t.z)) + 0.04
        return (
          <group key={t.id} position={[t.x, y, t.z]} rotation-y={0}>
            <mesh geometry={side} material={TOKEN_SIDE} castShadow receiveShadow />
            <mesh geometry={top} material={tokenTop(t.number!)} position-y={0.0525} receiveShadow />
          </group>
        )
      })}
    </StaticBatch>
  )
}

// ---------------- Robber ----------------
const ROBBER_ASIDE = 0.5
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
  // G4.2: the engine decides where the robber stands; the demo board keeps it on the desert
  const robberTile = useGame((s) => s.robber)
  const t = (BOARD_MODE === 'game' && tileByAxial(robberTile)) || TILES.find((x) => x.biome === 'desert')!
  // on a numbered tile, step aside so the token stays readable
  const x = t.number ? t.x - ROBBER_ASIDE : t.x
  return (
    <mesh geometry={geo} position={[x, tileHeight(t, x, t.z) - 0.01, t.z]} castShadow receiveShadow>
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

function windowGeometry(w: number, d: number, wallH: number, sw = 0.03, sh = 0.04, inset = 0.002) {
  const parts: THREE.BufferGeometry[] = []
  const win = (x: number, y: number, z: number, ry: number) => {
    const g = new THREE.PlaneGeometry(sw, sh)
    g.rotateY(ry)
    g.translate(x, y, z)
    parts.push(g)
  }
  for (const zz of [-d / 4, d / 4]) {
    win(w / 2 + inset, wallH * 0.55, zz, Math.PI / 2)
    win(-w / 2 - inset, wallH * 0.55, zz, -Math.PI / 2)
  }
  win(0, wallH * 0.95, d / 2 + inset, 0)
  win(0, wallH * 0.95, -d / 2 - inset, Math.PI)
  return mergeGeometries(parts)!
}

/** Pairs of open shutters flanking each side window. */
function shutterGeometry(w: number, d: number, wallH: number) {
  const parts: THREE.BufferGeometry[] = []
  for (const sx of [-1, 1]) for (const zz of [-d / 4, d / 4]) for (const side of [-1, 1]) {
    const g = new THREE.BoxGeometry(0.004, 0.05, 0.016)
    g.translate((sx * w) / 2 + sx * 0.003, wallH * 0.55, zz + side * 0.028)
    parts.push(g.toNonIndexed())
  }
  for (const p of parts) for (const k of Object.keys(p.attributes)) if (k !== 'position' && k !== 'normal') p.deleteAttribute(k)
  return mergeGeometries(parts)!
}

/** Half-timber frame: corner posts, wall-plate beams and a gable tie beam, merged into one mesh. */
function timberGeometry(w: number, d: number, wallH: number) {
  const parts: THREE.BufferGeometry[] = []
  const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
    const g = new THREE.BoxGeometry(sx, sy, sz)
    g.translate(x, y, z)
    parts.push(g.toNonIndexed())
  }
  const t = 0.013
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(t, wallH, t, (sx * w) / 2, wallH / 2, (sz * d) / 2)
  for (const sx of [-1, 1]) box(t, t, d + t, (sx * w) / 2, wallH - t / 2, 0)
  for (const sz of [-1, 1]) box(w + t, t, t, 0, wallH - t / 2, (sz * d) / 2)
  for (const sx of [-1, 1]) box(t * 0.9, t * 0.9, d, (sx * w) / 2 + 0.001, wallH * 0.12, 0) // sill beam
  return mergeGeometries(parts)!
}

/**
 * Greyscale roof shingles, multiplied by the player's roof colour.
 * Box-slab UVs run u = down the slope, v = along the ridge, so rows are columns in canvas x.
 */
const shingleTex = (() => {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const rows = 6
  const rw = 256 / rows
  const rnd = mulberry32(7)
  for (let r = 0; r < rows; r++) {
    const x0 = r * rw
    const tiles = 7
    const th = 256 / tiles
    const off = (r % 2) * th * 0.5
    for (let k = -1; k <= tiles; k++) {
      const y0 = k * th + off
      const l = 205 + Math.floor(rnd() * 40)
      // each shingle: lighter at its exposed lower edge, shaded where the next row overlaps
      const grd = g.createLinearGradient(x0, 0, x0 + rw, 0)
      grd.addColorStop(0, `rgb(${l - 60},${l - 60},${l - 60})`)
      grd.addColorStop(0.25, `rgb(${l - 15},${l - 15},${l - 15})`)
      grd.addColorStop(1, `rgb(${l},${l},${l})`)
      g.fillStyle = grd
      g.fillRect(x0, y0 + 1.5, rw, th - 3)
    }
    g.fillStyle = 'rgba(0,0,0,0.45)'
    g.fillRect(x0, 0, 2, 256)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
})()

/** Very subtle plaster speckle for walls (near-white, so player colours stay true). */
const plasterTex = (() => {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#f4f4f4'
  g.fillRect(0, 0, 128, 128)
  const rnd = mulberry32(3)
  for (let i = 0; i < 900; i++) {
    const v = 215 + Math.floor(rnd() * 40)
    g.fillStyle = `rgb(${v},${v},${v})`
    g.fillRect(rnd() * 128, rnd() * 128, 1 + rnd() * 2, 1 + rnd() * 2)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(6, 6)
  return t
})()

const WOOD = new THREE.MeshStandardMaterial({ color: '#3b2a1c', roughness: 0.85 })
const STONE = new THREE.MeshStandardMaterial({ color: '#8d8478', roughness: 0.92 })
const DOOR = new THREE.MeshStandardMaterial({ color: '#4a2e18', roughness: 0.8 })
const GLOW = new THREE.MeshStandardMaterial({ color: '#ffd08a', emissive: '#ffa840', emissiveIntensity: 3.6 })

/** Soft warm pool of window light on the ground (additive decal, no real light cost). */
const glowTex = (() => {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64)
  grd.addColorStop(0, 'rgba(255,190,110,0.9)')
  grd.addColorStop(0.45, 'rgba(255,160,70,0.35)')
  grd.addColorStop(1, 'rgba(255,140,50,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
})()
const GROUND_GLOW = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.45, toneMapped: false })

function House({ w, d, wallH, roofH, wall, roof, ridge }: { w: number; d: number; wallH: number; roofH: number; wall: THREE.Material; roof: THREE.Material; ridge: THREE.Material }) {
  const g = useMemo(() => {
    const h = houseParts(w, d, wallH, roofH)
    return {
      ...h,
      win: windowGeometry(w, d, wallH),
      frame: (() => {
        const f = windowGeometry(w, d, wallH, 0.042, 0.052, 0.0015).toNonIndexed()
        f.deleteAttribute('uv')
        return mergeGeometries([f, shutterGeometry(w, d, wallH)])!
      })(),
      timber: timberGeometry(w, d, wallH),
    }
  }, [w, d, wallH, roofH])
  return (
    <group>
      {/* stone plinth */}
      <mesh position-y={0.008} material={STONE} castShadow receiveShadow>
        <boxGeometry args={[w + 0.024, 0.02, d + 0.024]} />
      </mesh>
      <group position-y={0.016}>
        <mesh geometry={g.body} material={wall} castShadow receiveShadow />
        <mesh geometry={g.timber} material={WOOD} castShadow />
        <mesh geometry={g.roof} material={roof} castShadow receiveShadow />
        {/* ridge cap */}
        <mesh position-y={wallH + roofH + 0.016} rotation-z={Math.PI / 4} material={ridge} castShadow>
          <boxGeometry args={[0.02, 0.02, d + 0.06]} />
        </mesh>
        <mesh geometry={g.frame} material={WOOD} />
        <mesh geometry={g.win} material={GLOW} />
        {/* door with frame on the front gable */}
        <mesh position={[0, 0.034, d / 2 + 0.0015]} material={WOOD}>
          <planeGeometry args={[0.046, 0.07]} />
        </mesh>
        <mesh position={[0, 0.031, d / 2 + 0.003]} material={DOOR}>
          <planeGeometry args={[0.034, 0.062]} />
        </mesh>
      </group>
    </group>
  )
}

function Chimney({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <group position={[x, y, z]}>
      <mesh position-y={0.04} material={STONE} castShadow>
        <boxGeometry args={[0.028, 0.08, 0.028]} />
      </mesh>
      <mesh position-y={0.084} material={WOOD} castShadow>
        <boxGeometry args={[0.036, 0.01, 0.036]} />
      </mesh>
    </group>
  )
}

const PAD = new THREE.MeshStandardMaterial({ color: '#7d6a55', roughness: 0.95 })

/** One material set per player, shared by every house and road of that colour (lets StaticBatch merge them). */
const playerMatCache = new Map<Player, { wall: THREE.MeshStandardMaterial; roof: THREE.MeshStandardMaterial; ridge: THREE.MeshStandardMaterial; road: THREE.MeshStandardMaterial; roadEdge: THREE.MeshStandardMaterial }>()
function playerMats(player: Player) {
  let m = playerMatCache.get(player)
  if (!m) {
    const pc = PLAYER_COLORS[player]
    m = {
      wall: new THREE.MeshStandardMaterial({ color: pc.wall, map: plasterTex, roughness: 0.7 }),
      roof: new THREE.MeshStandardMaterial({ color: new THREE.Color(pc.roof).multiplyScalar(1.12), map: shingleTex, roughness: 0.62 }),
      ridge: new THREE.MeshStandardMaterial({ color: new THREE.Color(pc.roof).multiplyScalar(0.65), roughness: 0.6 }),
      road: new THREE.MeshStandardMaterial({ color: pc.wall, roughness: 0.5, emissive: pc.wall, emissiveIntensity: 0.12 }),
      roadEdge: new THREE.MeshStandardMaterial({ color: pc.roof, roughness: 0.7 }),
    }
    playerMatCache.set(player, m)
  }
  return m
}

function Settlement({ player, city }: { player: Player; city: boolean }) {
  const { wall, roof, ridge } = playerMats(player)
  const pad = city ? 0.26 : 0.18
  return (
    <group>
      {/* trodden earth pad + warm light pool */}
      <mesh position-y={0.006} material={PAD} castShadow receiveShadow>
        <cylinderGeometry args={[pad * 0.92, pad, 0.016, 10]} />
      </mesh>
      <mesh position-y={0.016} rotation-x={-Math.PI / 2} material={GROUND_GLOW}>
        <planeGeometry args={[pad * 2.6, pad * 2.6]} />
      </mesh>
      {!city ? (
        <group position-y={0.012}>
          <House w={0.15} d={0.2} wallH={0.11} roofH={0.08} wall={wall} roof={roof} ridge={ridge} />
          <Chimney x={0.035} y={0.016 + 0.11 + 0.035} z={-0.05} />
        </group>
      ) : (
        <group position-y={0.012}>
          <group position-x={-0.05}>
            <House w={0.2} d={0.26} wallH={0.13} roofH={0.09} wall={wall} roof={roof} ridge={ridge} />
            <Chimney x={-0.045} y={0.016 + 0.13 + 0.04} z={0.06} />
          </group>
          <group position={[0.11, 0, -0.03]}>
            <House w={0.12} d={0.12} wallH={0.26} roofH={0.11} wall={wall} roof={roof} ridge={ridge} />
          </group>
        </group>
      )}
    </group>
  )
}

export function Buildings() {
  return (
    <StaticBatch>
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
    </StaticBatch>
  )
}

/**
 * World positions of the chimney tops. This mirrors the transforms in Buildings, Settlement and
 * Chimney above, so keep the numbers in sync when those change.
 */
export function chimneyTops(): [number, number, number][] {
  return BUILDINGS.map((b, i) => {
    const t = tileAt(...b.tile)
    const [x, z] = corner(t, b.corner)
    const ry = Math.atan2(x, z) + Math.PI / 2 + (i % 2) * 0.3
    const S = b.city ? 1.38 : 1.6
    // local chimney-top position inside the settlement group (cap sits 0.089 above the chimney origin)
    const [lx, ly, lz] = b.city ? [-0.05 - 0.045, 0.012 + 0.016 + 0.13 + 0.04 + 0.09, 0.06] : [0.035, 0.012 + 0.016 + 0.11 + 0.035 + 0.09, -0.05]
    const c = Math.cos(ry), s = Math.sin(ry)
    return [x + (lx * c + lz * s) * S, 0.02 + ly * S, z + (-lx * s + lz * c) * S]
  })
}

function Roads() {
  const items = useMemo(
    () =>
      ROADS.map((r) => {
        const t = tileAt(...r.tile)
        const a = corner(t, r.edge), b = corner(t, (r.edge + 1) % 6)
        return { a, b, mats: playerMats(r.player) }
      }),
    [],
  )
  return (
    <group>
      {items.map(({ a, b, mats }, i) => {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1])
        const ang = -Math.atan2(b[1] - a[1], b[0] - a[0])
        return (
          <group key={i} position={[(a[0] + b[0]) / 2, 0.03, (a[1] + b[1]) / 2]} rotation-y={ang}>
            {/* darker plinth along the rail, then two chunky painted blocks on top */}
            <mesh position-y={0.012} material={mats.roadEdge} castShadow receiveShadow>
              <boxGeometry args={[len * 0.74, 0.03, 0.135]} />
            </mesh>
            {[-0.19, 0.19].map((f, k) => (
              <mesh key={k} position={[f * len, 0.05, 0]} material={mats.road} castShadow receiveShadow>
                <boxGeometry args={[len * 0.355, 0.06, 0.11]} />
              </mesh>
            ))}
          </group>
        )
      })}
    </group>
  )
}

const LANTERN_POST = new THREE.MeshStandardMaterial({ color: '#2c2622' })

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
  useFrame(() => {
    const t = animTime.value
    mats.current.forEach((m, i) => {
      if (m) m.emissiveIntensity = 5 + Math.sin(t * 2.6 + i * 3) * 0.35 + Math.sin(t * 6.7 + i) * 0.2
    })
  })
  return (
    <group>
      {spots.map(([x, y, z], i) => (
        <group key={i} position={[x, y, z]}>
          <mesh position-y={0.08} material={LANTERN_POST} castShadow>
            <cylinderGeometry args={[0.008, 0.01, 0.16, 6]} />
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
