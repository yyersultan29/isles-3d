// Hex-grid topology (GAME_DESIGN.md §2.2–2.3): axial pointy-top hexes, canonical vertex and edge IDs.
// All rule decisions use these string IDs and integer math, never floating-point positions.

import type { EdgeId, TileId, Topology, VertexId } from './types'

export const tileId = (q: number, r: number): TileId => `${q},${r}`
export const vertexId = (q: number, r: number, c: 'N' | 'S'): VertexId => `${q},${r},${c}`
export const edgeId = (q: number, r: number, s: 'NE' | 'NW' | 'W'): EdgeId => `${q},${r},${s}`

export function parseTile(id: TileId): [number, number] {
  const [q, r] = id.split(',')
  return [Number(q), Number(r)]
}

/** Board radius 2 → 19 land hexes. */
export function isLandHex(q: number, r: number, radius = 2) {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= radius
}

/** Corners of hex (q,r), indexed like the scene's corner(k): k=5 N, 0 NE, 1 SE, 2 S, 3 SW, 4 NW. */
export function hexCorners(q: number, r: number): VertexId[] {
  return [
    vertexId(q + 1, r - 1, 'S'), // 0 NE
    vertexId(q, r + 1, 'N'), // 1 SE
    vertexId(q, r, 'S'), // 2 S
    vertexId(q - 1, r + 1, 'N'), // 3 SW
    vertexId(q, r - 1, 'S'), // 4 NW
    vertexId(q, r, 'N'), // 5 N
  ]
}

/** Sides of hex (q,r), indexed like the scene's edge k (between corner k and k+1). */
export function hexSides(q: number, r: number): EdgeId[] {
  return [
    edgeId(q + 1, r, 'W'), // 0 E   (NE–SE)
    edgeId(q, r + 1, 'NW'), // 1 SE  (SE–S)
    edgeId(q - 1, r + 1, 'NE'), // 2 SW  (S–SW)
    edgeId(q, r, 'W'), // 3 W   (SW–NW)
    edgeId(q, r, 'NW'), // 4 NW  (NW–N)
    edgeId(q, r, 'NE'), // 5 NE  (N–NE)
  ]
}

/** Neighbour offsets (pointy-top): E, W, NE, NW, SE, SW. */
export const HEX_DIRS: readonly [number, number][] = [[1, 0], [-1, 0], [1, -1], [0, -1], [0, 1], [-1, 1]]

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

export function buildTopology(radius = 2): Topology {
  const tiles: TileId[] = []
  for (let r = -radius; r <= radius; r++) for (let q = -radius; q <= radius; q++) if (isLandHex(q, r, radius)) tiles.push(tileId(q, r))

  const tileVertices: Record<TileId, VertexId[]> = {}
  const tileEdges: Record<TileId, EdgeId[]> = {}
  const vertexTiles: Record<VertexId, TileId[]> = {}
  const edgeTiles: Record<EdgeId, TileId[]> = {}
  const edgeVertices: Record<EdgeId, [VertexId, VertexId]> = {}

  for (const t of tiles) {
    const [q, r] = parseTile(t)
    const cs = hexCorners(q, r)
    const ss = hexSides(q, r)
    tileVertices[t] = cs
    tileEdges[t] = ss
    for (const v of cs) (vertexTiles[v] ??= []).push(t)
    ss.forEach((e, k) => {
      ;(edgeTiles[e] ??= []).push(t)
      edgeVertices[e] = [cs[k], cs[(k + 1) % 6]].sort(byId) as [VertexId, VertexId]
    })
  }

  const vertices = (Object.keys(vertexTiles) as VertexId[]).sort(byId)
  const edges = (Object.keys(edgeVertices) as EdgeId[]).sort(byId)
  const vertexEdges: Record<VertexId, EdgeId[]> = {}
  const vertexNeighbors: Record<VertexId, VertexId[]> = {}
  for (const e of edges) {
    const [a, b] = edgeVertices[e]
    ;(vertexEdges[a] ??= []).push(e)
    ;(vertexEdges[b] ??= []).push(e)
    ;(vertexNeighbors[a] ??= []).push(b)
    ;(vertexNeighbors[b] ??= []).push(a)
  }
  for (const v of vertices) {
    vertexTiles[v].sort(byId)
    vertexEdges[v].sort(byId)
    vertexNeighbors[v].sort(byId)
  }
  for (const e of edges) edgeTiles[e].sort(byId)

  return { tiles, vertices, edges, tileVertices, tileEdges, vertexTiles, vertexEdges, vertexNeighbors, edgeVertices, edgeTiles }
}

/** Coastal = touches exactly one land hex. */
export const isCoastalEdge = (topo: Topology, e: EdgeId) => topo.edgeTiles[e].length === 1

/** Scene adapter (§2.3, G1.10): scene (row, col) of the 3–4–5–4–3 layout → axial. */
export function sceneToAxial(row: number, col: number, radius = 2): [number, number] {
  const r = row - radius
  const rowLength = 2 * radius + 1 - Math.abs(r)
  const q = col - (rowLength - 1) / 2 - r / 2
  return [q, r]
}

/** Inverse of sceneToAxial. */
export function axialToScene(q: number, r: number, radius = 2): [number, number] {
  const rowLength = 2 * radius + 1 - Math.abs(r)
  return [r + radius, q + (rowLength - 1) / 2 + r / 2]
}
