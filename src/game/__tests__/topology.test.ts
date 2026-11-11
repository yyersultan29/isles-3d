// G1.4 + G1.10: topology counts, corner/side tables against the scene, scene adapter round trips.
import { describe, expect, it } from 'vitest'
import { axialToScene, buildTopology, hexCorners, hexSides, isCoastalEdge, parseTile, sceneToAxial } from '../topology'
import { BUILDINGS, HARBORS, ROADS, TILES, corner, tileAt } from '../../scene/board'
import type { VertexId } from '../types'

const topo = buildTopology()
const S3 = Math.sqrt(3)
const hexPos = (q: number, r: number) => [S3 * (q + r / 2), 1.5 * r] as const
const vertexPos = (v: VertexId) => { const [q, r, c] = v.split(','); const [x, z] = hexPos(+q, +r); return [x, z + (c === 'N' ? -1 : 1)] as const }
const near = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9

describe('topology', () => {
  it('has 19 tiles, 54 vertices, 72 edges, 30 coastal edges and vertices', () => {
    expect(topo.tiles).toHaveLength(19)
    expect(topo.vertices).toHaveLength(54)
    expect(topo.edges).toHaveLength(72)
    expect(topo.edges.filter((e) => isCoastalEdge(topo, e))).toHaveLength(30)
    expect(topo.vertices.filter((v) => topo.vertexTiles[v].length < 3)).toHaveLength(30)
  })
  it('every edge has 2 distinct vertices; vertex degree is 2–3; tiles per vertex 1–3', () => {
    for (const e of topo.edges) expect(new Set(topo.edgeVertices[e]).size).toBe(2)
    for (const v of topo.vertices) {
      expect(topo.vertexEdges[v].length).toBeGreaterThanOrEqual(2)
      expect(topo.vertexEdges[v].length).toBeLessThanOrEqual(3)
      expect(topo.vertexTiles[v].length).toBeGreaterThanOrEqual(1)
      expect(topo.vertexNeighbors[v]).toHaveLength(topo.vertexEdges[v].length)
    }
  })
  it('tiles are in canonical order (by r, then q)', () => {
    const sorted = [...topo.tiles].sort((a, b) => { const [qa, ra] = parseTile(a), [qb, rb] = parseTile(b); return ra - rb || qa - qb })
    expect(topo.tiles).toEqual(sorted)
  })
  it('corner table matches the scene corner(k) positions', () => {
    for (const t of TILES) {
      const [q, r] = sceneToAxial(t.row, t.col)
      hexCorners(q, r).forEach((v, k) => expect(near(vertexPos(v), corner(t, k))).toBe(true))
    }
  })
  it('side k joins corners k and k+1 (scene edge numbering)', () => {
    for (const id of topo.tiles) {
      const [q, r] = parseTile(id)
      const cs = hexCorners(q, r)
      hexSides(q, r).forEach((e, k) => expect([...topo.edgeVertices[e]].sort()).toEqual([cs[k], cs[(k + 1) % 6]].sort()))
    }
  })
  it('scene (row, col) ↔ axial round-trips and matches world positions', () => {
    for (const t of TILES) {
      const [q, r] = sceneToAxial(t.row, t.col)
      expect(Number.isInteger(q)).toBe(true)
      expect(axialToScene(q, r)).toEqual([t.row, t.col])
      expect(near(hexPos(q, r), [t.x, t.z])).toBe(true)
    }
  })
  it('maps every scene building, road and harbour to an engine ID and back (G1.10)', () => {
    const vOf = (tile: [number, number], k: number) => { const t = tileAt(...tile); const [q, r] = sceneToAxial(t.row, t.col); return hexCorners(q, r)[k] }
    const eOf = (tile: [number, number], k: number) => { const t = tileAt(...tile); const [q, r] = sceneToAxial(t.row, t.col); return hexSides(q, r)[k] }
    for (const b of BUILDINGS) {
      const v = vOf(b.tile, b.corner)
      expect(topo.vertexTiles[v]).toBeDefined()
      expect(near(vertexPos(v), corner(tileAt(...b.tile), b.corner))).toBe(true)
      // back: some land tile lists this vertex at some corner index
      expect(topo.vertexTiles[v].some((t) => topo.tileVertices[t].includes(v))).toBe(true)
    }
    for (const x of [...ROADS, ...HARBORS]) {
      const e = eOf(x.tile, x.edge)
      const [a, b] = topo.edgeVertices[e].map(vertexPos)
      const t = tileAt(...x.tile)
      const sa = corner(t, x.edge), sb = corner(t, (x.edge + 1) % 6)
      expect((near(a, sa) && near(b, sb)) || (near(a, sb) && near(b, sa))).toBe(true)
    }
  })
})
