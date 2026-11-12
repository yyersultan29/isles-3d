import { fbm, noise2, ridged, smoothstep, clamp, mulberry32 } from './noise'
import { PORT_EDGES, STANDARD_FIXED, axialToScene, buildTopology, hexSides, sceneToAxial, type EdgeId, type PortKind, type Terrain, type TileId } from '../game'

export type Biome = 'forest' | 'wheat' | 'mountain' | 'pasture' | 'hills' | 'desert'
export type Player = 'red' | 'blue' | 'white' | 'orange'

export const HEX_R = 1 // circumradius of a pointy-top tile
export const SQRT3 = Math.sqrt(3)
export const WATER_Y = -0.4

export interface Tile {
  id: number
  /** canonical engine tile id `q,r` (G1.10 adapter) */
  axial: TileId
  row: number
  col: number
  biome: Biome
  number: number | null
  x: number
  z: number
  seed: number
}

/**
 * Which board the scene draws (G4.2): `game` (default) is the engine's `standard-fixed` board;
 * `?board=demo` keeps the showcase layout from the visual milestones.
 */
export type BoardMode = 'game' | 'demo'
export const BOARD_MODE: BoardMode =
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('board') === 'demo' ? 'demo' : 'game'

// Showcase layout, top (north, -z) to bottom.
const DEMO_LAYOUT: [Biome, number | null][][] = [
  [['mountain', 5], ['pasture', 2], ['wheat', 9]],
  [['pasture', 10], ['hills', 10], ['mountain', 3], ['forest', 4]],
  [['forest', 8], ['wheat', 11], ['desert', null], ['pasture', 11], ['hills', 6]],
  [['pasture', 12], ['forest', 5], ['forest', 10], ['wheat', 3]],
  [['mountain', 5], ['pasture', 4], ['hills', 8]],
]

export const TERRAIN_BIOME: Record<Terrain, Biome> = {
  forest: 'forest', pasture: 'pasture', fields: 'wheat', hills: 'hills', mountains: 'mountain', desert: 'desert',
}

/** The engine's `standard-fixed` board in scene rows (3–4–5–4–3), via the axial adapter. */
export function engineLayout(tiles: Readonly<Record<TileId, readonly [Terrain, number | null]>>): [Biome, number | null][][] {
  const rows: [Biome, number | null][][] = [[], [], [], [], []]
  for (const [id, [terrain, token]] of Object.entries(tiles) as [TileId, readonly [Terrain, number | null]][]) {
    const [q, r] = id.split(',').map(Number)
    const [row, col] = axialToScene(q, r)
    rows[row][col] = [TERRAIN_BIOME[terrain], token]
  }
  return rows
}

const LAYOUT = BOARD_MODE === 'demo' ? DEMO_LAYOUT : engineLayout(STANDARD_FIXED)

export const TILES: Tile[] = []
LAYOUT.forEach((row, r) => {
  row.forEach(([biome, number], c) => {
    const [q, ar] = sceneToAxial(r, c)
    TILES.push({
      id: TILES.length,
      axial: `${q},${ar}`,
      row: r,
      col: c,
      biome,
      number,
      x: (c - (row.length - 1) / 2) * SQRT3 * HEX_R,
      z: (r - 2) * 1.5 * HEX_R,
      seed: 17 + TILES.length * 101,
    })
  })
})

export const tileAt = (row: number, col: number) => TILES.find((t) => t.row === row && t.col === col)!
export const tileByAxial = (id: TileId) => TILES.find((t) => t.axial === id)

/** Corner k of a pointy-top hex. k=5 top, k=0 upper-right, k=1 lower-right, k=2 bottom, k=3 lower-left, k=4 upper-left. */
export function corner(t: { x: number; z: number }, k: number, r = HEX_R): [number, number] {
  const a = ((60 * k - 30) * Math.PI) / 180
  return [t.x + r * Math.cos(a), t.z + r * Math.sin(a)]
}

/** Normalised hex distance (1 on the tile edge) for a pointy-top hex. */
export function hexDist(dx: number, dz: number, r = HEX_R) {
  const ax = Math.abs(dx)
  const az = Math.abs(dz)
  // edges: vertical sides at x = ±(√3/2)r; slanted sides
  const d1 = ax / ((SQRT3 / 2) * r)
  const d2 = (ax * 0.5 + az * (SQRT3 / 2)) / ((SQRT3 / 2) * r)
  return Math.max(d1, d2)
}

export function findTile(x: number, z: number): Tile | null {
  let best: Tile | null = null
  let bd = Infinity
  for (const t of TILES) {
    const d = hexDist(x - t.x, z - t.z)
    if (d < bd) { bd = d; best = t }
  }
  return bd <= 1.001 ? best : null
}

// ---------- terrain height per biome (world coords, local to tile) ----------

/**
 * Mountain layout per tile: 2–3 broad massifs (capsules = elongated ridges), placed behind and beside the
 * token so the number stays visible from the camera (+z), plus a connecting saddle ridge.
 */
interface Massif { ax: number; az: number; bx: number; bz: number; h: number; r: number }
const MOUNTAIN_MASSIFS = new Map<number, Massif[]>()
function massifsFor(t: Tile) {
  let m = MOUNTAIN_MASSIFS.get(t.id)
  if (!m) {
    const rnd = mulberry32(t.seed)
    const flip = rnd() < 0.5 ? -1 : 1 // mirror layouts so the three mountain tiles differ
    const j = () => (rnd() - 0.5) * 0.12
    m = [
      // main massif: a short ridge behind the token, tallest point toward one side
      { ax: flip * -0.42 + j(), az: -0.5 + j(), bx: flip * 0.12 + j(), bz: -0.6 + j(), h: 0.74 + rnd() * 0.1, r: 0.42 },
      // secondary peak on the flank
      { ax: flip * 0.52 + j(), az: -0.16 + j(), bx: flip * 0.58 + j(), bz: 0.1 + j(), h: 0.5 + rnd() * 0.1, r: 0.34 },
      // lower foothill on the opposite front flank
      { ax: flip * -0.56 + j(), az: 0.22 + j(), bx: flip * -0.5 + j(), bz: 0.4 + j(), h: 0.28 + rnd() * 0.08, r: 0.3 },
    ]
    MOUNTAIN_MASSIFS.set(t.id, m)
  }
  return m
}

/** Distance from p to segment ab, plus the segment parameter (0..1). */
function segDist(px: number, pz: number, m: Massif) {
  const dx = m.bx - m.ax, dz = m.bz - m.az
  const k = clamp(((px - m.ax) * dx + (pz - m.az) * dz) / (dx * dx + dz * dz))
  return [Math.hypot(px - (m.ax + dx * k), pz - (m.az + dz * k)), k] as const
}

function mountainHeight(t: Tile, lx: number, lz: number, x: number, z: number, s: number) {
  const ms = massifsFor(t)
  let m = 0
  let crestAngle = 0
  for (let i = 0; i < ms.length; i++) {
    const q = ms[i]
    // slight domain warp so ridges aren't perfectly straight
    const wx = lx + 0.06 * noise2(x * 2.3 + i, z * 2.3)
    const wz = lz + 0.06 * noise2(x * 2.3, z * 2.3 - i)
    const [d, k] = segDist(wx, wz, q)
    const u = d / q.r
    if (u >= 1) continue
    // broad shoulders, steeper near the crest; the peak height varies along the ridge
    const along = 0.82 + 0.18 * Math.sin(k * Math.PI + i)
    const prof = Math.pow(1 - u * u, 1.6) * (1 - 0.35 * u)
    const v = q.h * along * prof
    if (v > m) { m = v; crestAngle = Math.atan2(wz - (q.az + (q.bz - q.az) * k), wx - (q.ax + (q.bx - q.ax) * k)) }
  }
  // saddle between main and secondary massifs
  {
    const a = ms[0], b = ms[1]
    const sad: Massif = { ax: a.bx, az: a.bz, bx: b.ax, bz: b.az, h: 0, r: 0.22 }
    const [d] = segDist(lx, lz, sad)
    if (d < sad.r) m = Math.max(m, 0.34 * Math.pow(1 - (d / sad.r) ** 2, 1.5))
  }
  if (m > 0.01) {
    // erosion gullies running down from the crests (radial streak noise), deeper mid-slope
    const radial = Math.hypot(lx, lz)
    const gully = Math.abs(noise2(crestAngle * 3.2 + s, radial * 2.2 + x * 0.8))
    const mid = smoothstep(0.06, 0.25, m) * (1 - smoothstep(0.55, 0.8, m))
    m *= 1 - 0.22 * (1 - smoothstep(0.0, 0.35, gully)) * mid
    // restrained rock breakup instead of the old high-frequency "saw"
    const rg = ridged(x * 2.2 + s, z * 2.2, 3)
    m += (rg - 0.4) * 0.1 * clamp(m * 2.5)
    // mid-frequency rock buttresses and ledges: breaks the smooth "dough" look without a saw silhouette
    const rk = ridged(x * 4.6 - s, z * 4.6 + s, 2)
    m += (rk - 0.45) * 0.07 * smoothstep(0.08, 0.3, m)
    const step = 0.055
    const q = m / step
    const f = q - Math.floor(q)
    m += (smoothstep(0.55, 0.9, f) - f) * step * 0.35 * smoothstep(0.1, 0.25, m) // soft strata ledges
    m += 0.012 * noise2(x * 9, z * 9) * clamp(m * 4)
  }
  return Math.max(0, m) + 0.05 + 0.025 * fbm(x * 4, z * 4, 2)
}

/** Height above the tile plane for a world point inside tile t. */
export function tileHeight(t: Tile, x: number, z: number): number {
  const lx = x - t.x
  const lz = z - t.z
  const d = hexDist(lx, lz)
  const fall = smoothstep(0.98, 0.78, d) // 0 at border
  const rc = Math.hypot(lx, lz)
  const centre = smoothstep(0.2, 0.36, rc) // flat plateau for the number token
  const s = t.seed * 0.013
  let h = 0
  switch (t.biome) {
    case 'pasture':
      h = 0.05 + 0.05 * fbm(x * 1.6 + s, z * 1.6, 3) + 0.03 * noise2(x * 5, z * 5)
      h = h * centre + 0.05 * (1 - centre)
      break
    case 'forest':
      h = 0.06 + 0.05 * fbm(x * 1.5 + s, z * 1.5, 3)
      h = h * centre + 0.06 * (1 - centre)
      break
    case 'wheat':
      h = 0.05 + 0.02 * fbm(x * 2 + s, z * 2, 2)
      break
    case 'desert': {
      const dune = 0.04 * Math.sin(x * 6 + z * 3 + fbm(x, z, 2) * 2) + 0.03 * fbm(x * 2.5 + s, z * 2.5, 3)
      const mound = 0.16 * Math.exp(-(rc * rc) / 0.06)
      h = 0.06 + dune * smoothstep(0.15, 0.4, rc) + mound
      break
    }
    case 'hills': {
      const r = ridged(x * 2.2 + s, z * 2.2 + s, 4)
      const mounds = 0.18 * smoothstep(0.1, 0.9, fbm(x * 1.4 + s, z * 1.4 - s, 3) * 0.5 + 0.55)
      h = 0.06 + mounds + 0.16 * r * r
      h = h * centre + 0.12 * (1 - centre)
      break
    }
    case 'mountain': {
      h = mountainHeight(t, lx, lz, x, z, s) * (0.25 + 0.75 * centre)
      break
    }
  }
  return h * fall // border is flat at 0
}

export function groundHeight(x: number, z: number) {
  const t = findTile(x, z)
  return t ? tileHeight(t, x, z) : 0
}

// ---------- edges / vertices helpers ----------

export interface Edge { a: [number, number]; b: [number, number]; outer: boolean }

const key = (p: [number, number]) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`

export const EDGES: Edge[] = (() => {
  const map = new Map<string, Edge & { count: number }>()
  for (const t of TILES) {
    for (let k = 0; k < 6; k++) {
      const a = corner(t, k)
      const b = corner(t, (k + 1) % 6)
      const kk = [key(a), key(b)].sort().join('|')
      const e = map.get(kk)
      if (e) e.count++
      else map.set(kk, { a, b, outer: true, count: 1 })
    }
  }
  return [...map.values()].map((e) => ({ a: e.a, b: e.b, outer: e.count === 1 }))
})()

export const VERTICES: [number, number][] = (() => {
  const m = new Map<string, [number, number]>()
  for (const t of TILES) for (let k = 0; k < 6; k++) { const c = corner(t, k); m.set(key(c), c) }
  return [...m.values()]
})()

// ---------- players ----------

export interface Building { player: Player; tile: [number, number]; corner: number; city: boolean }
export interface Road { player: Player; tile: [number, number]; edge: number }

export const BUILDINGS: Building[] = [
  { player: 'red', tile: [1, 0], corner: 5, city: true },
  { player: 'red', tile: [1, 1], corner: 5, city: false },
  { player: 'red', tile: [1, 0], corner: 2, city: false },
  { player: 'blue', tile: [1, 2], corner: 1, city: true },
  { player: 'blue', tile: [2, 3], corner: 1, city: true },
  { player: 'blue', tile: [3, 3], corner: 0, city: false },
  { player: 'white', tile: [3, 0], corner: 5, city: true },
  { player: 'white', tile: [3, 0], corner: 4, city: false },
  { player: 'orange', tile: [4, 1], corner: 5, city: false },
  { player: 'orange', tile: [3, 3], corner: 3, city: true },
]

export const ROADS: Road[] = [
  { player: 'red', tile: [1, 1], edge: 4 },
  { player: 'red', tile: [1, 0], edge: 5 },
  { player: 'red', tile: [1, 0], edge: 0 },
  { player: 'red', tile: [1, 0], edge: 1 },
  { player: 'blue', tile: [2, 3], edge: 5 },
  { player: 'blue', tile: [2, 3], edge: 0 },
  { player: 'blue', tile: [3, 3], edge: 5 },
  { player: 'blue', tile: [1, 3], edge: 2 },
  { player: 'white', tile: [3, 0], edge: 4 },
  { player: 'white', tile: [2, 0], edge: 1 },
  { player: 'orange', tile: [4, 1], edge: 4 },
  { player: 'orange', tile: [4, 1], edge: 5 },
  { player: 'orange', tile: [3, 2], edge: 1 },
]

export const PLAYER_COLORS: Record<Player, { wall: string; roof: string }> = {
  red: { wall: '#c8302a', roof: '#8e1b17' },
  blue: { wall: '#2850c8', roof: '#1a318a' },
  white: { wall: '#eef0f2', roof: '#b8bec6' },
  orange: { wall: '#e0782a', roof: '#a8501a' },
}

// ---------- harbours ----------

/** `sheep3` is the showcase's generic sign (kept for `?board=demo`); games use `generic`. */
export type HarborKind = 'sheep3' | 'generic' | 'wood' | 'brick' | 'wheat' | 'sheep' | 'ore'
export interface Harbor { tile: [number, number]; edge: number; kind: HarborKind; ratio: string }

const DEMO_HARBORS: Harbor[] = [
  { tile: [0, 0], edge: 5, kind: 'sheep3', ratio: '3:1' },
  { tile: [0, 2], edge: 5, kind: 'sheep3', ratio: '3:1' },
  { tile: [1, 3], edge: 0, kind: 'sheep3', ratio: '3:1' },
  { tile: [1, 0], edge: 4, kind: 'wood', ratio: '2:1' },
  { tile: [3, 0], edge: 3, kind: 'brick', ratio: '2:1' },
  { tile: [3, 3], edge: 0, kind: 'wheat', ratio: '2:1' },
  { tile: [4, 1], edge: 2, kind: 'sheep', ratio: '2:1' },
]

export const PORT_HARBOR_KIND: Record<PortKind, HarborKind> = {
  generic: 'generic', lumber: 'wood', brick: 'brick', wool: 'sheep', grain: 'wheat', ore: 'ore',
}

/** Engine port edges → scene (tile row/col, side k). The coastal edge touches exactly one land hex. */
export function engineHarbors(ports: readonly { edge: EdgeId; kind: PortKind }[]): Harbor[] {
  const topo = buildTopology()
  return ports.map(({ edge, kind }) => {
    const [tile] = topo.edgeTiles[edge]
    if (!tile || topo.edgeTiles[edge].length !== 1) throw new Error(`port edge ${edge} is not coastal`)
    const [q, r] = tile.split(',').map(Number)
    const k = hexSides(q, r).indexOf(edge)
    return { tile: axialToScene(q, r), edge: k, kind: PORT_HARBOR_KIND[kind], ratio: kind === 'generic' ? '3:1' : '2:1' }
  })
}

export const HARBORS: Harbor[] = BOARD_MODE === 'demo' ? DEMO_HARBORS : engineHarbors(PORT_EDGES)

// ---------- island outline ----------

/** Radius of the island plateau in direction theta (flat-top big hexagon, rounded). */
export const ISLAND_APOTHEM = 4.1
export function islandRadius(theta: number) {
  const seg = Math.PI / 3
  const t = (((theta % seg) + seg) % seg) - seg / 2
  const hex = ISLAND_APOTHEM / Math.cos(t)
  const round = Math.min(hex, ISLAND_APOTHEM * 1.1)
  return round + 0.06 * noise2(Math.cos(theta) * 2.2, Math.sin(theta) * 2.2) + 0.04 * noise2(theta * 9, 3.1)
}
