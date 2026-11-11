// Board data and generation (GAME_DESIGN.md §2.1, §2.4, §2.6).

import type { Board, EdgeId, PortKind, Resource, Terrain, Tile, TileId, Topology } from './types'
import { HEX_DIRS, buildTopology, parseTile, tileId } from './topology'
import { shuffle, type Rng } from './rng'

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
export function generateBoard(rng: Rng, preset: 'standard-fixed' | 'random'): Board {
  const topo = buildTopology()
  if (preset === 'standard-fixed') return makeBoard(topo, STANDARD_FIXED, PORT_EDGES.map((p) => p.kind))

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

export const desertTile = (board: Board): TileId => {
  const d = Object.values(board.tiles).find((t) => t.terrain === 'desert')
  if (!d) throw new Error('board has no desert')
  return d.id
}
