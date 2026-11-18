// Board data and generation (GAME_DESIGN.md §2.1, §2.4, §2.6).

import type { Board, BoardPreset, EdgeId, PortKind, Resource, Terrain, Tile, TileId, Topology } from './types'
import { HEX_DIRS, buildTopology, parseTile, tileId } from './topology'
import { pick, shuffle, type Rng } from './rng'

export const TERRAIN_RESOURCE: Record<Exclude<Terrain, 'desert'>, Resource> = {
  forest: 'lumber',
  pasture: 'wool',
  fields: 'grain',
  hills: 'brick',
  mountains: 'ore',
}
export const resourceOf = (t: Terrain): Resource | null => (t === 'desert' ? null : TERRAIN_RESOURCE[t])

/** Standard multisets (§2.1). */
export const TERRAIN_SET: readonly Terrain[] = [
  ...Array<Terrain>(4).fill('forest'),
  ...Array<Terrain>(4).fill('pasture'),
  ...Array<Terrain>(4).fill('fields'),
  ...Array<Terrain>(3).fill('hills'),
  ...Array<Terrain>(3).fill('mountains'),
  'desert',
]
export const TOKEN_SET: readonly number[] = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]
export const PORT_KIND_SET: readonly PortKind[] = ['generic', 'generic', 'generic', 'generic', 'lumber', 'brick', 'wool', 'grain', 'ore']

/** Probability weight ("pips") of a token. */
export const pips = (n: number | null) => (n == null ? 0 : 6 - Math.abs(7 - n))

/** §2.6: the 9 port edges (clockwise from 0,-2,NW) and their kinds in `standard-fixed`. Copied, not regenerated. */
export const PORT_EDGES: readonly { edge: EdgeId; kind: PortKind }[] = [
  { edge: '0,-2,NW', kind: 'generic' },
  { edge: '1,-2,NE', kind: 'grain' },
  { edge: '3,-2,W', kind: 'ore' },
  { edge: '3,0,W', kind: 'generic' },
  { edge: '1,2,NW', kind: 'wool' },
  { edge: '-1,3,NE', kind: 'generic' },
  { edge: '-3,3,NE', kind: 'generic' },
  { edge: '-2,1,W', kind: 'brick' },
  { edge: '-2,0,NW', kind: 'lumber' },
]

/** §2.6: `standard-fixed` tiles. Copied, not regenerated. */
export const STANDARD_FIXED: Readonly<Record<TileId, [Terrain, number | null]>> = {
  '0,-2': ['hills', 5], '1,-2': ['mountains', 3], '2,-2': ['fields', 8],
  '-1,-1': ['fields', 4], '0,-1': ['forest', 11], '1,-1': ['hills', 9], '2,-1': ['pasture', 10],
  '-2,0': ['mountains', 6], '-1,0': ['hills', 2], '0,0': ['desert', null], '1,0': ['forest', 6], '2,0': ['fields', 12],
  '-2,1': ['forest', 5], '-1,1': ['pasture', 11], '0,1': ['mountains', 4], '1,1': ['pasture', 9],
  '-2,2': ['forest', 10], '-1,2': ['pasture', 3], '0,2': ['fields', 8],
}

/** Board preset for every new game the app or the server starts (B3, docs/BOARD_GEN_PLAN.md). The engine's own default stays `standard-fixed` for tests and replays. */
export const NEW_GAME_BOARD = 'balanced' as const

/** Max token shuffles before falling back to `standard-fixed` (§2.4). */
export const MAX_BOARD_RETRIES = 200

function makeBoard(topo: Topology, layout: Record<TileId, [Terrain, number | null]>, kinds: readonly PortKind[]): Board {
  const tiles: Record<TileId, Tile> = {}
  for (const id of topo.tiles) {
    const [q, r] = parseTile(id)
    const [terrain, token] = layout[id]
    tiles[id] = { id, q, r, terrain, token }
  }
  const ports = PORT_EDGES.map((p, i) => ({ edge: p.edge, vertices: topo.edgeVertices[p.edge], kind: kinds[i] }))
  return { tiles, ports, topo }
}

/** True when no two adjacent land tiles both carry a 6 or 8 (§2.4). */
export function redNumbersSeparated(layout: Record<TileId, [Terrain, number | null]>) {
  for (const [id, [, n]] of Object.entries(layout) as [TileId, [Terrain, number | null]][]) {
    if (n !== 6 && n !== 8) continue
    const [q, r] = parseTile(id)
    for (const [dq, dr] of HEX_DIRS) {
      const o = layout[tileId(q + dq, r + dr)]
      if (o && (o[1] === 6 || o[1] === 8)) return false
    }
  }
  return true
}

/**
 * Deterministic board generation. RNG consumption order is part of the replay format (§11):
 * terrain shuffle, token shuffle (with retries), port-kind shuffle — `random` preset only.
 */
export function generateBoard(rng: Rng, preset: BoardPreset): Board {
  const topo = buildTopology()
  if (preset === 'standard-fixed') return makeBoard(topo, STANDARD_FIXED, PORT_EDGES.map((p) => p.kind))
  if (preset === 'balanced') return balancedBoard(rng, topo)

  const terrains = shuffle(rng, TERRAIN_SET)
  const order = topo.tiles // canonical: by r, then q
  for (let attempt = 0; attempt < MAX_BOARD_RETRIES; attempt++) {
    const tokens = shuffle(rng, TOKEN_SET)
    const layout: Record<TileId, [Terrain, number | null]> = {}
    let k = 0
    order.forEach((id, i) => {
      const t = terrains[i]
      layout[id] = [t, t === 'desert' ? null : tokens[k++]]
    })
    if (redNumbersSeparated(layout)) return makeBoard(topo, layout, shuffle(rng, PORT_KIND_SET))
  }
  return makeBoard(topo, STANDARD_FIXED, PORT_EDGES.map((p) => p.kind))
}

// ---------- `balanced` preset (docs/BOARD_GEN_PLAN.md §4) ----------

type Layout = Record<TileId, [Terrain, number | null]>

/** Candidate boards per `balanced` generation; the lowest score wins. */
export const BALANCED_CANDIDATES = 64

const isRed = (n: number) => n === 6 || n === 8
const isRare = (n: number) => n === 2 || n === 12
/** Hard rule (§2.4 + BOARD_GEN_PLAN F2): two tokens that may not sit on adjacent hexes. */
export const tokensClash = (a: number, b: number) => a === b || (isRed(a) && isRed(b)) || (isRare(a) && isRare(b))

const neighboursOf = (topo: Topology) => {
  const land = new Set(topo.tiles)
  const out: Record<TileId, TileId[]> = {}
  for (const id of topo.tiles) {
    const [q, r] = parseTile(id)
    out[id] = HEX_DIRS.map(([dq, dr]) => tileId(q + dq, r + dr)).filter((n) => land.has(n))
  }
  return out
}

/** True when the layout keeps every hard token rule: no 6/8, 2/12 or equal numbers on adjacent hexes. */
export function tokensSeparated(layout: Layout) {
  for (const [id, [, n]] of Object.entries(layout) as [TileId, [Terrain, number | null]][]) {
    if (n == null) continue
    const [q, r] = parseTile(id)
    for (const [dq, dr] of HEX_DIRS) {
      const o = layout[tileId(q + dq, r + dr)]
      if (o && o[1] != null && tokensClash(n, o[1])) return false
    }
  }
  return true
}

/**
 * Breaks up same-terrain clumps: TERRAIN_SWAPS random swaps of two hexes, each kept only if it lowers
 * the number of adjacent same-terrain pairs. Light-touch on purpose, so boards still differ.
 */
export const TERRAIN_SWAPS = 40
function spreadTerrain(rng: Rng, terrains: Terrain[], topo: Topology, near: Record<TileId, TileId[]>) {
  const index = new Map(topo.tiles.map((id, i) => [id, i]))
  const around = topo.tiles.map((id) => near[id].map((o) => index.get(o)!))
  const same = (i: number, t: Terrain, skip = -1) => (t === 'desert' ? 0 : around[i].filter((o) => o !== skip && terrains[o] === t).length)
  for (let k = 0; k < TERRAIN_SWAPS; k++) {
    const i = pick(rng, terrains.length), j = pick(rng, terrains.length)
    if (terrains[i] === terrains[j]) continue
    const before = same(i, terrains[i]) + same(j, terrains[j])
    const after = same(i, terrains[j], j) + same(j, terrains[i], i)
    if (after < before) { const t = terrains[i]; terrains[i] = terrains[j]; terrains[j] = t }
  }
  return terrains
}

/**
 * Tokens onto the non-desert hexes by backtracking, high-pip tokens first, so the hard rules always
 * hold without blind reshuffles. Null only if the step budget runs out (never seen in tests).
 */
function placeTokens(rng: Rng, hexes: TileId[], near: Record<TileId, TileId[]>): Record<TileId, number> | null {
  const tokens = shuffle(rng, TOKEN_SET).sort((a, b) => pips(b) - pips(a)) // stable: random order within a pip class
  const at: Record<TileId, number> = {}
  let steps = 0
  const go = (i: number): boolean => {
    if (i === tokens.length) return true
    if (++steps > 20000) return false
    const n = tokens[i]
    for (const h of shuffle(rng, hexes)) {
      if (at[h] !== undefined || near[h].some((o) => at[o] !== undefined && tokensClash(n, at[o]))) continue
      at[h] = n
      if (go(i + 1)) return true
      delete at[h]
    }
    return false
  }
  return go(0) ? at : null
}

/** Board quality figures used by the score (and by tests and docs). Lower score = fairer board. */
export function boardBalance(layout: Layout, kinds: readonly PortKind[], topo: Topology = buildTopology()) {
  const near = neighboursOf(topo)
  let clumps = 0
  for (const id of topo.tiles) for (const o of near[id]) if (o > id && layout[id][0] === layout[o][0] && layout[id][0] !== 'desert') clumps++
  const res: Record<string, { pips: number; tiles: number; red: boolean }> = {}
  for (const id of topo.tiles) {
    const [t, n] = layout[id]
    if (t === 'desert') continue
    const r = (res[t] ??= { pips: 0, tiles: 0, red: false })
    r.pips += pips(n); r.tiles++
    if (n != null && isRed(n)) r.red = true
  }
  const rs = Object.values(res)
  const minPips = Math.min(...rs.map((r) => r.pips))
  const perTile = rs.map((r) => r.pips / r.tiles)
  const spread = Math.max(...perTile) - Math.min(...perTile)
  const redResources = rs.filter((r) => r.red).length
  // a 2:1 port whose own resource sits on a 6/8 hex right at that port: too strong an engine
  let hotPorts = 0
  PORT_EDGES.forEach((p, i) => {
    const kind = kinds[i]
    if (kind === 'generic') return
    for (const t of topo.edgeTiles[p.edge]) {
      const [terrain, n] = layout[t]
      if (terrain !== 'desert' && TERRAIN_RESOURCE[terrain] === kind && n != null && isRed(n)) hotPorts++
    }
  })
  const score = 3 * clumps + 4 * Math.max(0, 9 - minPips) + 2 * spread + 2 * Math.max(0, 3 - redResources) + hotPorts
  return { clumps, minPips, spread, redResources, hotPorts, score }
}

/**
 * `balanced`: BALANCED_CANDIDATES candidates (terrain shuffle, backtracked tokens, port-kind shuffle),
 * each scored by boardBalance; the lowest score wins (first one on ties). Deterministic from the RNG.
 */
function balancedBoard(rng: Rng, topo: Topology): Board {
  const near = neighboursOf(topo)
  let best: { layout: Layout; kinds: PortKind[]; score: number } | null = null
  for (let c = 0; c < BALANCED_CANDIDATES; c++) {
    const terrains = spreadTerrain(rng, shuffle(rng, TERRAIN_SET), topo, near)
    const hexes = topo.tiles.filter((_, i) => terrains[i] !== 'desert')
    const at = placeTokens(rng, hexes, near)
    const kinds = shuffle(rng, PORT_KIND_SET)
    if (!at) continue
    const layout: Layout = {}
    topo.tiles.forEach((id, i) => { layout[id] = [terrains[i], terrains[i] === 'desert' ? null : at[id]] })
    const { score } = boardBalance(layout, kinds, topo)
    if (!best || score < best.score) best = { layout, kinds, score }
  }
  return best ? makeBoard(topo, best.layout, best.kinds) : makeBoard(topo, STANDARD_FIXED, PORT_EDGES.map((p) => p.kind))
}

export const desertTile = (board: Board): TileId => {
  const d = Object.values(board.tiles).find((t) => t.terrain === 'desert')
  if (!d) throw new Error('board has no desert')
  return d.id
}
