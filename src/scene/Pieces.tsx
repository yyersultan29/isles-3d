import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { animTime, motion } from './motion'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { TILES, tileHeight, corner, tileAt, tileByAxial, robberSpot, BOARD_MODE, BUILDINGS, ROADS, PLAYER_COLORS, Player, groundHeight, scenePieces, type Building, type Road } from './board'
import { tokenTexture } from './textures'
import { StaticBatch } from './StaticBatch'
import { mulberry32 } from './noise'
import { useGame, useGameStore } from '../store/GameProvider'
import { buildingKey, roadKey, useArrivals } from './arrivals'

// ---------------- Number tokens ----------------
const TOKEN_R = 0.27

function tokenSideGeometry() {
  // A7: a raised, rounded rim around the face and a soft chamfer at the foot; the face (the number's
  // circle, TOKEN_R × 0.935) keeps its size, the rim sits outside it
  const pts = [
    [0, -0.02], [0.955, -0.02], [0.985, -0.012], [1, 0.004], [1, 0.04], [0.996, 0.05], [0.986, 0.0565],
    [0.97, 0.0592], [0.954, 0.0582], [0.94, 0.0548], [0.928, 0.0522],
  ].map(([r, y]) => new THREE.Vector2(r * TOKEN_R, y))
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
          <group key={t.id} position={[t.x, y, t.z]} rotation-y={0} userData={{ piece: 'token' }}>
            <mesh geometry={side} material={TOKEN_SIDE} castShadow receiveShadow />
            <mesh geometry={top} material={tokenTop(t.number!)} position-y={0.0525} receiveShadow />
          </group>
        )
      })}
    </StaticBatch>
  )
}

// ---------------- Robber ----------------
const BASE_H = 0.035
const MOVE_S = 0.75 // seconds for the hop to a new tile
const HOP = 0.55 // arc height
// A6: a hooded figure in a heavy cloak instead of a pawn; dark charcoal, less lacquer than before
const robberMat = new THREE.MeshPhysicalMaterial({ color: '#2c2b31', roughness: 0.5, metalness: 0.05, clearcoat: 0.3, clearcoatRoughness: 0.5 })
// a pale stone base, like a board-game piece, so the dark figure reads on forest and grass (G4.5b)
const baseMat = new THREE.MeshStandardMaterial({ color: '#e4d9c1', roughness: 0.75 })
/** Cloak profile (radius, height) before the 1.25 scale: flared hem, shoulders, a peaked hood. */
const CLOAK: [number, number][] = [
  [0, 0], [0.128, 0], [0.133, 0.012], [0.12, 0.03], [0.102, 0.08], [0.09, 0.14], [0.084, 0.19], [0.09, 0.218],
  [0.092, 0.24], [0.08, 0.265], [0.074, 0.285], [0.08, 0.315], [0.077, 0.355], [0.061, 0.39], [0.038, 0.418], [0.014, 0.44], [0, 0.446],
]
const FOLD_TOP = 0.26 // folds fade out at the shoulders
const HOOD = { y: 0.33, z: 0.07, rx: 0.042, ry: 0.05, rz: 0.03 } // face opening, front (+z, toward the camera)

function robberGeometry() {
  // phiStart = PI puts the lathe seam at the back, away from the camera
  const body = new THREE.LatheGeometry(CLOAK.map(([x, y]) => new THREE.Vector2(x, y)), 48, Math.PI)
  const pos = body.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const a = Math.atan2(x, z)
    // cloak folds: deepest at the hem, gone at the shoulders
    const k = y < FOLD_TOP ? 1 + 0.1 * Math.sin(a * 7) * (1 - y / FOLD_TOP) : 1
    // the hood's peak leans back a little
    const lean = y > 0.35 ? -(y - 0.35) * 0.35 : 0
    pos.setXYZ(i, x * k, y, z * k + lean)
  }
  body.computeVertexNormals()
  const face = new THREE.SphereGeometry(1, 20, 14)
  face.scale(HOOD.rx, HOOD.ry, HOOD.rz)
  face.translate(0, HOOD.y, HOOD.z)
  // two faint eye glints inside the hood
  const eyes = mergeGeometries([-1, 1].map((s) => new THREE.SphereGeometry(0.0065, 8, 6).translate(s * 0.014, HOOD.y + 0.004, HOOD.z + HOOD.rz * 0.8)))!
  for (const g of [body, face, eyes]) { g.scale(1.25, 1.25, 1.25); g.translate(0, BASE_H, 0) }
  const base = new THREE.CylinderGeometry(0.2, 0.215, BASE_H, 40)
  base.translate(0, BASE_H / 2, 0)
  return { body, face, eyes, base }
}

export function Robber() {
  const geo = useMemo(robberGeometry, [])
  // G4.2: the engine decides where the robber stands; the demo board keeps it on the desert
  const robberTile = useGame((s) => s.robber)
  const t = (BOARD_MODE === 'game' && tileByAxial(robberTile)) || TILES.find((x) => x.biome === 'desert')!
  const [x, z] = robberSpot(t)
  const y = tileHeight(t, x, z) - 0.01

  // G4.5b: hop along an arc when the robber moves; the state is already final, this is only the view
  const ref = useRef<THREE.Group>(null)
  const hop = useRef<{ from: THREE.Vector3; to: THREE.Vector3; t0: number } | null>(null)
  const placed = useRef(false)
  const store = useGameStore()
  const gen = useRef(store.generation())
  useEffect(() => {
    const g = ref.current
    if (!g) return
    const to = new THREE.Vector3(x, y, z)
    // a new or resumed game (G4.8b) puts the robber in place; only a move within a game hops
    const fresh = gen.current !== store.generation()
    gen.current = store.generation()
    if (!placed.current || fresh || motion.reduced || g.position.distanceTo(to) < 1e-3) { g.position.copy(to); hop.current = null; placed.current = true; return }
    hop.current = { from: g.position.clone(), to, t0: performance.now() }
  }, [x, y, z, store])
  useFrame(() => {
    const h = hop.current, g = ref.current
    if (!h || !g) return
    const k = Math.min(1, (performance.now() - h.t0) / 1000 / MOVE_S)
    const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2 // ease in-out
    g.position.lerpVectors(h.from, h.to, e)
    g.position.y += Math.sin(Math.PI * e) * HOP
    if (k >= 1) { g.position.copy(h.to); hop.current = null }
  })
  useEffect(() => () => { for (const g of Object.values(geo)) g.dispose() }, [geo])

  return (
    <group ref={ref} userData={{ piece: 'robber' }}>
      <mesh geometry={geo.base} material={baseMat} castShadow receiveShadow />
      <mesh geometry={geo.body} material={robberMat} castShadow receiveShadow />
      <mesh geometry={geo.face} material={BASE_EDGE} />
      <mesh geometry={geo.eyes} material={GLOW} />
    </group>
  )
}

// ---------------- Buildings ----------------

/**
 * Gabled house; footprint ~ w × d, origin at ground centre. Returns body and roof parts.
 * `eave` is how far the roof runs past the walls down the slope, `gable` past each gable end.
 */
function houseParts(w: number, d: number, wallH: number, roofH: number, eave = 0.03, gable = 0.025) {
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
  const L = slope + eave, D = d + 2 * gable
  for (const s of [-1, 1]) {
    const slab = new THREE.BoxGeometry(L, 0.022, D)
    slab.translate((s * L) / 2, 0.011, 0)
    slab.rotateZ(s * -ang)
    slab.translate(0, wallH + roofH + 0.004, 0)
    // the slab pivot is the ridge; rotate already handled
    roofParts.push(slab.toNonIndexed())
  }
  const roof = mergeGeometries(roofParts)!
  // light bargeboards along the eaves and both gable rakes, a little proud of the slabs, so the roof
  // keeps a pale outline over clay, fields and forest whatever the player's colour
  const trimParts: THREE.BufferGeometry[] = []
  const board = (g: THREE.BoxGeometry, s: number) => { g.rotateZ(s * -ang); g.translate(0, wallH + roofH + 0.004, 0); trimParts.push(g.toNonIndexed()) }
  for (const s of [-1, 1]) {
    const eaveBoard = new THREE.BoxGeometry(0.014, 0.028, D + 0.012)
    eaveBoard.translate(s * L, 0.008, 0)
    board(eaveBoard, s)
    for (const sz of [-1, 1]) {
      const rake = new THREE.BoxGeometry(L, 0.028, 0.01)
      rake.translate((s * L) / 2, 0.008, (sz * D) / 2)
      board(rake, s)
    }
  }
  for (const t of trimParts) t.deleteAttribute('uv')
  const trim = mergeGeometries(trimParts)!
  return { body, roof, trim }
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
// pale limewash for roof trim and the building base: one light tone that separates every player
// colour from clay, wheat and forest without glowing
const TRIM = new THREE.MeshStandardMaterial({ color: '#efe4cc', roughness: 0.7 })
const BASE_EDGE = new THREE.MeshStandardMaterial({ color: '#2b211a', roughness: 0.9 })

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

function House({ w, d, wallH, roofH, wall, roof, eave, gable = 0.025, step = false }: { w: number; d: number; wallH: number; roofH: number; wall: THREE.Material; roof: THREE.Material; eave?: number; gable?: number; step?: boolean }) {
  const g = useMemo(() => {
    const h = houseParts(w, d, wallH, roofH, eave, gable)
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
  }, [w, d, wallH, roofH, eave, gable])
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
        <mesh geometry={g.trim} material={TRIM} castShadow />
        {/* ridge cap: pale like the trim, so the roof line reads from the board camera */}
        <mesh position-y={wallH + roofH + 0.016} rotation-z={Math.PI / 4} material={TRIM} castShadow>
          <boxGeometry args={[0.02, 0.02, d + 2 * gable + 0.01]} />
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
        {/* a stone step in front of the door */}
        {step && (
          <mesh position={[0, 0.004, d / 2 + 0.016]} material={STONE} castShadow receiveShadow>
            <boxGeometry args={[0.06, 0.012, 0.03]} />
          </mesh>
        )}
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


/** One material set per player, shared by every house and road of that colour (lets StaticBatch merge them). */
const playerMatCache = new Map<Player, { wall: THREE.MeshStandardMaterial; roof: THREE.MeshStandardMaterial; ring: THREE.MeshStandardMaterial; flag: THREE.MeshStandardMaterial; road: THREE.MeshStandardMaterial; roadEdge: THREE.MeshStandardMaterial }>()
function playerMats(player: Player) {
  let m = playerMatCache.get(player)
  if (!m) {
    const pc = PLAYER_COLORS[player]
    m = {
      wall: new THREE.MeshStandardMaterial({ color: pc.wall, map: plasterTex, roughness: 0.7 }),
      roof: new THREE.MeshStandardMaterial({ color: new THREE.Color(pc.roof).multiplyScalar(1.12), map: shingleTex, roughness: 0.62 }),
      ring: new THREE.MeshStandardMaterial({ color: pc.wall, roughness: 0.6 }),
      flag: new THREE.MeshStandardMaterial({ color: pc.wall, roughness: 0.75, side: THREE.DoubleSide }),
      road: new THREE.MeshStandardMaterial({ color: pc.wall, roughness: 0.5, emissive: pc.wall, emissiveIntensity: 0.12 }),
      roadEdge: new THREE.MeshStandardMaterial({ color: pc.roof, roughness: 0.7 }),
    }
    playerMatCache.set(player, m)
  }
  return m
}

/** Pennant: a swallow-tailed flag hanging off the pole top, double-sided. */
const PENNANT = (() => {
  const sh = new THREE.Shape()
  sh.moveTo(0, 0); sh.lineTo(0.085, -0.004); sh.lineTo(0.06, -0.024); sh.lineTo(0.085, -0.044); sh.lineTo(0, -0.048); sh.closePath()
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.004, bevelEnabled: false })
  g.deleteAttribute('uv')
  g.translate(0.004, 0.084, -0.002)
  g.scale(1.25, 1.25, 1.25)
  return g
})()

// ---------------- City: a small walled castle ----------------
// Local units, before BuildingPiece's ×1.38; +z is the front (gate and hall door). The hall keeps the
// old city hall's size, so Vegetation's ROOF_MID and the chimney smoke stay valid.
const CW = { hx: 0.165, hz: 0.15, h: 0.085, t: 0.026, gate: 0.064 } // curtain wall
const TOWER = { r: 0.042, front: 0.13, back: 0.15, roofR: 0.054, roofH: 0.075 }
const KEEP = { x: -0.07, z: -0.06, r: 0.05, h: 0.27, roofR: 0.066, roofH: 0.115 }
const HALL = { x: 0.05, z: 0, w: 0.14, d: 0.18, wallH: 0.13, roofH: 0.085 }
const UV_UNIT = 0.12 // one repeat of the masonry texture, in local units

/** Masonry blocks in running bond, near-neutral so the stone keeps one tone under the warm sun. */
const masonryTex = (() => {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#7b7368'
  g.fillRect(0, 0, 128, 128)
  const rnd = mulberry32(11)
  const rows = 5, rh = 128 / rows
  for (let r = 0; r < rows; r++) {
    const bw = 128 / 3, off = (r % 2) * bw * 0.5
    for (let k = -1; k < 4; k++) {
      const v = 200 + Math.floor(rnd() * 45)
      g.fillStyle = `rgb(${v},${v - 4},${v - 10})`
      g.fillRect(k * bw + off + 2, r * rh + 2, bw - 4, rh - 4)
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  return t
})()
const MASONRY = new THREE.MeshStandardMaterial({ color: '#b3aa9b', map: masonryTex, roughness: 0.9 })

/** Box-projected UVs in local units, so every wall piece shows blocks of the same size. */
function boxUV(geo: THREE.BufferGeometry) {
  const pos = geo.attributes.position, nor = geo.attributes.normal
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i))
    const [u, v] = ay > ax && ay > az ? [pos.getX(i), pos.getZ(i)] : ax > az ? [pos.getZ(i), pos.getY(i)] : [pos.getX(i), pos.getY(i)]
    uv[i * 2] = u / UV_UNIT; uv[i * 2 + 1] = v / UV_UNIT
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return geo
}

/** Curtain wall with merlons and a lintel over the gate, one merged mesh. */
const CASTLE_WALL = (() => {
  const { hx, hz, h, t, gate } = CW
  const parts: THREE.BufferGeometry[] = []
  const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
    const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed()
    g.translate(x, y, z)
    parts.push(g)
  }
  const side = (len: number, along: 'x' | 'z', fixed: number, from = -len / 2, to = len / 2) => {
    const l = to - from, c = (from + to) / 2
    if (along === 'x') box(l, h, t, c, h / 2, fixed); else box(t, h, l, fixed, h / 2, c)
  }
  side(2 * hx, 'x', -hz)
  side(2 * hz, 'z', -hx)
  side(2 * hz, 'z', hx)
  side(2 * hx, 'x', hz, -hx, -gate / 2)
  side(2 * hx, 'x', hz, gate / 2, hx)
  box(gate, 0.024, t, 0, h - 0.012, hz) // lintel
  // merlons, kept clear of the corner towers
  const mer = (len: number, put: (a: number) => void) => {
    const n = Math.floor((len - 2 * (TOWER.r + 0.02)) / 0.044)
    for (let i = 0; i <= n; i++) put(-(n * 0.044) / 2 + i * 0.044)
  }
  const my = h + 0.011
  mer(2 * hx, (a) => { box(0.02, 0.022, t + 0.004, a, my, -hz); box(0.02, 0.022, t + 0.004, a, my, hz) })
  mer(2 * hz, (a) => { box(t + 0.004, 0.022, 0.02, -hx, my, a); box(t + 0.004, 0.022, 0.02, hx, my, a) })
  for (const p of parts) p.deleteAttribute('uv')
  return boxUV(mergeGeometries(parts)!)
})()

/** Tower shaft (open-ended cylinder) with UVs in local units. */
function towerShaft(r: number, h: number) {
  const g = new THREE.CylinderGeometry(r, r * 1.04, h, 12, 1, true)
  g.translate(0, h / 2, 0)
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * 2 * Math.PI * r) / UV_UNIT, (uv.getY(i) * h) / UV_UNIT)
  return g
}

/**
 * Conical roof on the shared shingle material. The whole slope samples the lit part of a single
 * shingle row (u 0.09–0.16), so a small cone gets a soft tip-to-eave gradient and seams
 * around it instead of six hard bands; v runs around the cone.
 */
function coneRoof(r: number, h: number) {
  const g = new THREE.ConeGeometry(r, h, 12, 1, true)
  g.translate(0, h / 2, 0)
  const uv = g.attributes.uv
  // the shingle texture clamps (no repeat), so v stays in 0–1: seven tiles once around the cone
  for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, 0.09 + (1 - v) * 0.07, 0.01 + u * 0.98) }
  return g
}

const CORNER_SHAFT = { front: towerShaft(TOWER.r, TOWER.front), back: towerShaft(TOWER.r, TOWER.back) }
const CORNER_ROOF = coneRoof(TOWER.roofR, TOWER.roofH)
const KEEP_SHAFT = (() => {
  const g = new THREE.CylinderGeometry(KEEP.r, KEEP.r * 1.05, KEEP.h, 14, 1, true)
  g.translate(0, KEEP.h / 2, 0)
  return g
})()
const KEEP_ROOF = coneRoof(KEEP.roofR, KEEP.roofH)
/** Pale band under every cone roof: the same outline the house roofs get from their bargeboards. */
const roofBand = (r: number) => { const g = new THREE.CylinderGeometry(r, r, 0.012, 12); g.deleteAttribute('uv'); return g }
const CORNER_BAND = roofBand(TOWER.roofR + 0.004)
const KEEP_BAND = roofBand(KEEP.roofR + 0.004)
/** Two lit windows and their frames on the keep's front. */
const KEEP_WINDOWS = (() => {
  const win: THREE.BufferGeometry[] = [], frame: THREE.BufferGeometry[] = []
  for (const y of [0.16, 0.215]) {
    const w = new THREE.PlaneGeometry(0.022, 0.032); w.translate(0, y, KEEP.r + 0.003); win.push(w)
    const f = new THREE.PlaneGeometry(0.032, 0.042); f.translate(0, y, KEEP.r + 0.0015); f.deleteAttribute('uv'); frame.push(f)
  }
  return { win: mergeGeometries(win)!, frame: mergeGeometries(frame)! }
})()

function Castle({ wall, roof, flag }: { wall: THREE.Material; roof: THREE.Material; flag: THREE.Material }) {
  const { hx, hz, h, gate } = CW
  const corners: [number, number, 'front' | 'back'][] = [[-hx, hz, 'front'], [hx, hz, 'front'], [-hx, -hz, 'back'], [hx, -hz, 'back']]
  return (
    <group>
      <mesh geometry={CASTLE_WALL} material={MASONRY} castShadow receiveShadow />
      {/* the gate: a dark wooden door set into the opening */}
      <mesh position={[0, (h - 0.024) / 2, hz + 0.001]} material={DOOR}>
        <planeGeometry args={[gate, h - 0.024]} />
      </mesh>
      {corners.map(([x, z, k]) => {
        const th = TOWER[k]
        return (
          <group key={`${x}${z}`} position={[x, 0, z]}>
            <mesh geometry={CORNER_SHAFT[k]} material={MASONRY} castShadow receiveShadow />
            <mesh geometry={CORNER_BAND} material={TRIM} position-y={th} castShadow />
            <mesh geometry={CORNER_ROOF} material={roof} position-y={th + 0.004} castShadow receiveShadow />
          </group>
        )
      })}
      <group position={[HALL.x, 0, HALL.z]}>
        <House w={HALL.w} d={HALL.d} wallH={HALL.wallH} roofH={HALL.roofH} wall={wall} roof={roof} />
      </group>
      <Chimney x={CITY_CHIMNEY[0]} y={CITY_CHIMNEY[1]} z={CITY_CHIMNEY[2]} />
      {/* the keep: the tallest part, in the owner's colour, with the pennant on its roof */}
      <group position={[KEEP.x, 0, KEEP.z]}>
        <mesh geometry={KEEP_SHAFT} material={wall} castShadow receiveShadow />
        <mesh geometry={KEEP_WINDOWS.frame} material={WOOD} />
        <mesh geometry={KEEP_WINDOWS.win} material={GLOW} />
        <mesh geometry={KEEP_BAND} material={TRIM} position-y={KEEP.h} castShadow />
        <mesh geometry={KEEP_ROOF} material={roof} position-y={KEEP.h + 0.004} castShadow receiveShadow />
        <group position-y={KEEP.h + KEEP.roofH - 0.012}>
          <mesh position-y={0.054} material={WOOD} castShadow>
            <cylinderGeometry args={[0.006, 0.007, 0.108, 6]} />
          </mesh>
          <mesh geometry={PENNANT} material={flag} castShadow />
        </group>
      </group>
    </group>
  )
}

// chimney positions inside the settlement group (x, chimney origin y, z); chimneyTops reads them too
const SETTLEMENT_CHIMNEY = [0.035, 0.016 + 0.11 + 0.035, -0.05] as const
const CITY_CHIMNEY = [HALL.x + 0.035, 0.016 + HALL.wallH + 0.04, HALL.z - 0.04] as const

function Settlement({ player, city }: { player: Player; city: boolean }) {
  const { wall, roof, ring, flag } = playerMats(player)
  const pad = city ? 0.26 : 0.18
  return (
    <group>
      {/* base: a dark hairline, a ring in the owner's colour and a pale stone top, so the piece and
          its owner read on any terrain; then the warm light pool */}
      <mesh position-y={0.005} material={BASE_EDGE} receiveShadow>
        <cylinderGeometry args={[pad + 0.012, pad + 0.016, 0.01, 24]} />
      </mesh>
      <mesh position-y={0.008} material={ring} castShadow receiveShadow>
        <cylinderGeometry args={[pad, pad + 0.006, 0.014, 24]} />
      </mesh>
      <mesh position-y={0.011} material={TRIM} receiveShadow>
        <cylinderGeometry args={[pad * 0.8, pad * 0.82, 0.014, 24]} />
      </mesh>
      <mesh position-y={0.016} rotation-x={-Math.PI / 2} material={GROUND_GLOW}>
        <planeGeometry args={[pad * 2.6, pad * 2.6]} />
      </mesh>
      {!city ? (
        <group position-y={0.012}>
          {/* deeper eaves and a door step give the cottage a fuller silhouette from the board camera */}
          <House w={0.15} d={0.2} wallH={0.11} roofH={0.085} wall={wall} roof={roof} eave={0.042} gable={0.032} step />
          <Chimney x={SETTLEMENT_CHIMNEY[0]} y={SETTLEMENT_CHIMNEY[1]} z={SETTLEMENT_CHIMNEY[2]} />
        </group>
      ) : (
        <group position-y={0.012}>
          <Castle wall={wall} roof={roof} flag={flag} />
        </group>
      )}
    </group>
  )
}

const DEMO_PIECES = { buildings: BUILDINGS.map((b, i) => ({ ...b, turn: i % 2 })), roads: ROADS }

/**
 * The pieces on the board (G4.2c): engine state in a game, the showcase set on `?board=demo`.
 * Recomputed only when the engine replaces `buildings` or `roads` (on an action, never per frame).
 */
export function usePieces(): { buildings: Building[]; roads: Road[] } {
  const buildings = useGame((s) => s.buildings)
  const roads = useGame((s) => s.roads)
  return useMemo(() => (BOARD_MODE === 'demo' ? DEMO_PIECES : scenePieces(buildings, roads)), [buildings, roads])
}

/** Stable key of a piece set: StaticBatch re-merges when it changes. */
const piecesKey = ({ buildings, roads }: { buildings: Building[]; roads: Road[] }) =>
  buildings.map((b) => `${b.tile}:${b.corner}:${b.player}:${b.city ? 'c' : 's'}`).join('|') + '/' + roads.map((r) => `${r.tile}:${r.edge}:${r.player}`).join('|')

const buildingYaw = (b: Building, x: number, z: number) => Math.atan2(x, z) + Math.PI / 2 + (b.turn ?? 0) * 0.3

/** One building at its corner, facing roughly toward the board centre. Shared with the drop animation. */
export function BuildingPiece({ b }: { b: Building }) {
  const t = tileAt(...b.tile)
  const [x, z] = corner(t, b.corner)
  return (
    <group position={[x, 0.02, z]} rotation-y={buildingYaw(b, x, z)} scale={b.city ? 1.38 : 1.6} userData={{ piece: b.city ? 'city' : 'settlement' }}>
      <Settlement player={b.player} city={b.city} />
    </group>
  )
}

export function Buildings() {
  const all = usePieces()
  // G4.5c: a piece that is still dropping in is drawn by Feedback.tsx and rejoins the batch after
  const arriving = useArrivals()
  const pieces = useMemo(() => arriving.size
    ? { buildings: all.buildings.filter((b) => !arriving.has(buildingKey(b))), roads: all.roads.filter((r) => !arriving.has(roadKey(r))) }
    : all, [all, arriving])
  // a new key remounts the batch, so the merged meshes always match the current pieces
  return (
    <StaticBatch key={piecesKey(pieces)}>
      {pieces.buildings.map((b, i) => <BuildingPiece key={i} b={b} />)}
      <Roads roads={pieces.roads} />
      <Lanterns buildings={pieces.buildings} />
    </StaticBatch>
  )
}

/**
 * World positions of the chimney tops. This mirrors the transforms in Buildings, Settlement and
 * Chimney above, so keep the numbers in sync when those change.
 */
export function chimneyTops(buildings: Building[]): [number, number, number][] {
  return buildings.map((b) => {
    const t = tileAt(...b.tile)
    const [x, z] = corner(t, b.corner)
    const ry = buildingYaw(b, x, z)
    const S = b.city ? 1.38 : 1.6
    // local chimney-top position inside the settlement group (cap sits 0.089 above the chimney origin)
    const [cx, cy, cz] = b.city ? CITY_CHIMNEY : SETTLEMENT_CHIMNEY
    const [lx, ly, lz] = [cx, 0.012 + cy + 0.09, cz]
    const c = Math.cos(ry), s = Math.sin(ry)
    return [x + (lx * c + lz * s) * S, 0.02 + ly * S, z + (-lx * s + lz * c) * S]
  })
}

// ---------------- Roads: a bundle of three logs ----------------
const LOG_R = 0.024
const LOG_BASE = 0.027 // top of the dark plinth

/**
 * Geometry of one road along +x, built once per edge length: three logs (two below, one on top,
 * ends a little staggered), their pale end grain, and two dark bindings. Logs end within ±0.36 of
 * the edge length, like the old blocks, so they never reach the corners where buildings stand.
 */
const bundleCache = new Map<string, { logs: THREE.BufferGeometry; ends: THREE.BufferGeometry; bands: THREE.BufferGeometry }>()
function roadBundle(len: number) {
  const key = len.toFixed(3)
  let b = bundleCache.get(key)
  if (b) return b
  const yLow = LOG_BASE + LOG_R, yTop = yLow + LOG_R * 1.732
  const logs: [number, number, number, number][] = [ // z, y, x offset, length factor
    [-LOG_R * 1.02, yLow, -0.012, 0.7],
    [LOG_R * 1.02, yLow, 0.01, 0.69],
    [0, yTop, 0, 0.66],
  ]
  const logParts: THREE.BufferGeometry[] = [], endParts: THREE.BufferGeometry[] = [], bandParts: THREE.BufferGeometry[] = []
  for (const [z, y, dx, f] of logs) {
    const L = len * f, x0 = dx * len
    const log = new THREE.CylinderGeometry(LOG_R, LOG_R, L, 8, 1, true)
    log.rotateZ(Math.PI / 2); log.translate(x0, y, z)
    logParts.push(log)
    for (const sx of [-1, 1]) {
      const end = new THREE.CircleGeometry(LOG_R * 0.98, 8)
      end.rotateY(sx * Math.PI / 2); end.translate(x0 + (sx * L) / 2, y, z)
      end.deleteAttribute('uv')
      endParts.push(end)
    }
    for (const bx of [-0.2, 0.2]) {
      const band = new THREE.CylinderGeometry(LOG_R * 1.1, LOG_R * 1.1, 0.012, 8, 1, true)
      band.rotateZ(Math.PI / 2); band.translate(bx * len, y, z)
      band.deleteAttribute('uv')
      bandParts.push(band)
    }
  }
  b = { logs: mergeGeometries(logParts)!, ends: mergeGeometries(endParts)!, bands: mergeGeometries(bandParts)! }
  bundleCache.set(key, b)
  return b
}

export function Roads({ roads }: { roads: Road[] }) {
  const items = useMemo(
    () =>
      roads.map((r) => {
        const t = tileAt(...r.tile)
        const a = corner(t, r.edge), b = corner(t, (r.edge + 1) % 6)
        return { a, b, mats: playerMats(r.player) }
      }),
    [roads],
  )
  return (
    <group>
      {items.map(({ a, b, mats }, i) => {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1])
        const ang = -Math.atan2(b[1] - a[1], b[0] - a[0])
        const g = roadBundle(len)
        return (
          <group key={i} position={[(a[0] + b[0]) / 2, 0.03, (a[1] + b[1]) / 2]} rotation-y={ang} userData={{ piece: 'road' }}>
            {/* darker plinth along the rail keeps the road's footprint readable on any terrain */}
            <mesh position-y={0.012} material={mats.roadEdge} castShadow receiveShadow>
              <boxGeometry args={[len * 0.74, 0.03, 0.135]} />
            </mesh>
            <mesh geometry={g.logs} material={mats.road} castShadow receiveShadow />
            <mesh geometry={g.ends} material={TRIM} />
            <mesh geometry={g.bands} material={WOOD} castShadow />
          </group>
        )
      })}
    </group>
  )
}

const LANTERN_POST = new THREE.MeshStandardMaterial({ color: '#2c2622' })

/** Small lantern posts next to cities; flickering warm light. */
function Lanterns({ buildings }: { buildings: Building[] }) {
  const spots = useMemo(
    () =>
      buildings.filter((b) => b.city).map((b) => {
        const [x, z] = corner(tileAt(...b.tile), b.corner)
        const ox = x + 0.2, oz = z + 0.12
        return [ox, groundHeight(ox, oz), oz] as const
      }),
    [buildings],
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
