// G4.2a: the scene draws exactly the engine's standard-fixed board.
import { describe, expect, it } from 'vitest'
import { apply, buildTopology, createGame, legalActions, type Action, hexCorners, sceneToAxial, PORT_EDGES, STANDARD_FIXED, type TileId } from '../../game'
import { BOARD_MODE, HARBORS, PLAYER_COLOR_OF, corner, edgeToScene, scenePieces, tileAt, vertexToScene, PORT_HARBOR_KIND, TERRAIN_BIOME, TILES, engineLayout, tileByAxial } from '../board'

describe('G4.2a scene board from the engine', () => {
  it('defaults to the game board outside a browser query', () => {
    expect(BOARD_MODE).toBe('game')
  })

  it('every scene tile matches the engine board (terrain and token) through the adapter', () => {
    const r = createGame({ seed: 1, boardPreset: 'standard-fixed' })
    if (!r.ok) throw new Error(r.error.message)
    const board = r.state.board
    expect(TILES).toHaveLength(19)
    for (const t of TILES) {
      const e = board.tiles[t.axial]
      expect(e, t.axial).toBeDefined()
      expect(t.biome).toBe(TERRAIN_BIOME[e.terrain])
      expect(t.number).toBe(e.token)
    }
    expect(new Set(TILES.map((t) => t.axial)).size).toBe(19)
  })

  it('the robber starts on the scene desert', () => {
    const r = createGame({ seed: 1 })
    if (!r.ok) throw new Error(r.error.message)
    expect(tileByAxial(r.state.robber)?.biome).toBe('desert')
  })

  it('engineLayout puts 3-4-5-4-3 rows in scene order', () => {
    const rows = engineLayout(STANDARD_FIXED)
    expect(rows.map((r) => r.length)).toEqual([3, 4, 5, 4, 3])
    expect(rows[2][2]).toEqual(['desert', null]) // centre
    expect(rows[0][0]).toEqual([TERRAIN_BIOME[STANDARD_FIXED['0,-2' as TileId][0]], 5])
  })

  it('G4.2b: the scene harbours are the 9 engine ports, on the same edge and with the same kind', () => {
    const topo = buildTopology()
    const r = createGame({ seed: 1, boardPreset: 'standard-fixed' })
    if (!r.ok) throw new Error(r.error.message)
    expect(HARBORS).toHaveLength(9)
    HARBORS.forEach((h, i) => {
      const [q, ar] = sceneToAxial(...h.tile)
      const cs = hexCorners(q, ar)
      const pair = [cs[h.edge], cs[(h.edge + 1) % 6]].sort()
      const port = r.state.board.ports[i]
      expect(pair).toEqual([...topo.edgeVertices[port.edge]])
      expect(port.vertices).toEqual(topo.edgeVertices[PORT_EDGES[i].edge])
      expect(h.kind).toBe(PORT_HARBOR_KIND[port.kind])
      expect(h.ratio).toBe(port.kind === 'generic' ? '3:1' : '2:1')
    })
  })

  it('G4.2c: every engine vertex and edge lands on the same scene point from any hex that has it', () => {
    const topo = buildTopology()
    const near = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9
    for (const v of topo.vertices) {
      const { tile, corner: k } = vertexToScene(v)
      const p = corner(tileAt(...tile), k)
      for (const t of topo.vertexTiles[v]) {
        const [q, r] = t.split(',').map(Number)
        const other = tileByAxial(t as TileId)!
        expect(near(corner(other, hexCorners(q, r).indexOf(v)), p)).toBe(true)
      }
    }
    for (const e of topo.edges) {
      const { tile, edge: k } = edgeToScene(e)
      const t = tileAt(...tile)
      const ends = [corner(t, k), corner(t, (k + 1) % 6)]
      const [va, vb] = topo.edgeVertices[e].map((v) => { const s = vertexToScene(v); return corner(tileAt(...s.tile), s.corner) })
      expect((near(ends[0], va) && near(ends[1], vb)) || (near(ends[0], vb) && near(ends[1], va))).toBe(true)
    }
  })

  it('G4.2c: pieces after a full setup convert to scene pieces with seat colours', () => {
    const r = createGame({ seed: 5 })
    if (!r.ok) throw new Error(r.error.message)
    let s = r.state
    while (s.phase.kind === 'setup') {
      const p = s.order[s.active]
      const res = apply(s, p, legalActions(s, p)[0] as Action)
      if (!res.ok) throw new Error(res.error.code)
      s = res.state
    }
    const pieces = scenePieces(s.buildings, s.roads)
    expect(pieces.buildings).toHaveLength(8)
    expect(pieces.roads).toHaveLength(8)
    for (const b of pieces.buildings) expect(b.city).toBe(false)
    const colours = new Set(Object.values(s.buildings).map((b) => PLAYER_COLOR_OF[b!.owner]))
    expect(new Set(pieces.buildings.map((b) => b.player))).toEqual(colours)
    expect(scenePieces({}, {})).toEqual({ buildings: [], roads: [] })
  })
})
