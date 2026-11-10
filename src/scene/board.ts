import { fbm, noise2, ridged, smoothstep, clamp, mulberry32 } from './noise'

export type Biome = 'forest' | 'wheat' | 'mountain' | 'pasture' | 'hills' | 'desert'
export type Player = 'red' | 'blue' | 'white' | 'orange'

export const HEX_R = 1 // circumradius of a pointy-top tile
export const SQRT3 = Math.sqrt(3)
export const WATER_Y = -0.4

export interface Tile {
  id: number
  row: number
  col: number
  biome: Biome
  number: number | null
  x: number
  z: number
  seed: number
}

// Reference layout, top (north, -z) to bottom.
const LAYOUT: [Biome, number | null][][] = [
  [['mountain', 5], ['pasture', 2], ['wheat', 9]],
  [['pasture', 10], ['hills', 10], ['mountain', 3], ['forest', 4]],
  [['forest', 8], ['wheat', 11], ['desert', null], ['pasture', 11], ['hills', 6]],
  [['pasture', 12], ['forest', 5], ['forest', 10], ['wheat', 3]],
  [['mountain', 5], ['pasture', 4], ['hills', 8]],
]

export const TILES: Tile[] = []
LAYOUT.forEach((row, r) => {
  row.forEach(([biome, number], c) => {
    TILES.push({
      id: TILES.length,
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

const MOUNTAIN_PEAKS = new Map<number, { x: number; z: number; h: number; r: number }[]>()
function peaksFor(t: Tile) {
  let p = MOUNTAIN_PEAKS.get(t.id)
  if (!p) {
    const rnd = mulberry32(t.seed)
    p = []
    const n = 6
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.6 + t.id
      const rr = 0.5 + rnd() * 0.18
      // taller peaks toward the back (north) so the token stays readable
      const back = Math.sin(a) < 0 ? 1 : 0.62
      p.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr, h: (0.45 + rnd() * 0.35) * back, r: 0.44 + rnd() * 0.14 })
    }
    p.push({ x: (rnd() - 0.5) * 0.2, z: -0.6, h: 0.78, r: 0.52 })
    MOUNTAIN_PEAKS.set(t.id, p)
  }
  return p
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
      let m = 0
      for (const p of peaksFor(t)) {
        const dd = Math.hypot(lx - p.x, lz - p.z) / p.r
        if (dd < 1) m = Math.max(m, p.h * Math.pow(1 - dd, 1.1))
      }
      const rg = ridged(x * 3.1 + s, z * 3.1, 4)
      m += m > 0.02 ? (rg - 0.35) * 0.27 * clamp(m * 2) : 0
      m += 0.05 + 0.03 * fbm(x * 4, z * 4, 2)
      h = m * (0.25 + 0.75 * centre)
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

export type HarborKind = 'sheep3' | 'wood' | 'brick' | 'wheat' | 'sheep'
export interface Harbor { tile: [number, number]; edge: number; kind: HarborKind; ratio: string }

export const HARBORS: Harbor[] = [
  { tile: [0, 0], edge: 5, kind: 'sheep3', ratio: '3:1' },
  { tile: [0, 2], edge: 5, kind: 'sheep3', ratio: '3:1' },
  { tile: [1, 3], edge: 0, kind: 'sheep3', ratio: '3:1' },
  { tile: [1, 0], edge: 4, kind: 'wood', ratio: '2:1' },
  { tile: [3, 0], edge: 3, kind: 'brick', ratio: '2:1' },
  { tile: [3, 3], edge: 0, kind: 'wheat', ratio: '2:1' },
  { tile: [4, 1], edge: 2, kind: 'sheep', ratio: '2:1' },
]

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
