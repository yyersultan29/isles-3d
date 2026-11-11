// G1.5: standard-fixed equals §2.6; random boards obey the multisets and constraints; determinism.
import { describe, expect, it } from 'vitest'
import { PORT_EDGES, STANDARD_FIXED, TERRAIN_SET, TOKEN_SET, generateBoard, pips, redNumbersSeparated } from '../board'
import { createRng } from '../rng'
import { isCoastalEdge } from '../topology'
import type { Board, Terrain, TileId } from '../types'

const counts = <T,>(xs: T[]) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<T, number>())
const layoutOf = (b: Board) => Object.fromEntries(Object.values(b.tiles).map((t) => [t.id, [t.terrain, t.token]])) as Record<TileId, [Terrain, number | null]>

describe('standard-fixed board', () => {
  const b = generateBoard(createRng(1), 'standard-fixed')
  it('matches GAME_DESIGN §2.6 tile by tile', () => {
    for (const [id, [terrain, token]] of Object.entries(STANDARD_FIXED)) expect(b.tiles[id as TileId]).toMatchObject({ terrain, token })
    expect(Object.keys(b.tiles)).toHaveLength(19)
  })
  it('has the §2.6 port vertices and kinds', () => {
    const doc: Record<string, string[]> = {
      '0,-2,NW': ['0,-3,S', '0,-2,N'], '1,-2,NE': ['1,-2,N', '2,-3,S'], '3,-2,W': ['3,-3,S', '2,-1,N'],
      '3,0,W': ['3,-1,S', '2,1,N'], '1,2,NW': ['1,2,N', '1,1,S'], '-1,3,NE': ['0,2,S', '-1,3,N'],
      '-3,3,NE': ['-2,2,S', '-3,3,N'], '-2,1,W': ['-3,2,N', '-2,0,S'], '-2,0,NW': ['-2,-1,S', '-2,0,N'],
    }
    expect(b.ports.map((p) => p.kind)).toEqual(PORT_EDGES.map((p) => p.kind))
    const seen = new Set<string>()
    for (const p of b.ports) {
      expect(isCoastalEdge(b.topo, p.edge)).toBe(true)
      expect([...p.vertices].sort()).toEqual([...doc[p.edge]].sort())
      for (const v of p.vertices) { expect(seen.has(v)).toBe(false); seen.add(v) }
    }
  })
  it('has the checked properties: separated 6/8, no equal neighbours, pip totals', () => {
    expect(redNumbersSeparated(STANDARD_FIXED)).toBe(true)
    const perRes: Record<string, number> = {}
    for (const t of Object.values(b.tiles)) perRes[t.terrain] = (perRes[t.terrain] ?? 0) + pips(t.token)
    expect(perRes).toMatchObject({ forest: 14, fields: 14, pasture: 11, mountains: 10, hills: 9 })
    let maxVertex = 0
    for (const v of b.topo.vertices) maxVertex = Math.max(maxVertex, b.topo.vertexTiles[v].reduce((s, t) => s + pips(b.tiles[t].token), 0))
    expect(maxVertex).toBe(12)
  })
})

describe('random boards', () => {
  it('1,000 seeds: standard multisets, desert without token, 6/8 never adjacent', () => {
    for (let seed = 0; seed < 1000; seed++) {
      const b = generateBoard(createRng(seed), 'random')
      const tiles = Object.values(b.tiles)
      expect(counts(tiles.map((t) => t.terrain))).toEqual(counts([...TERRAIN_SET]))
      expect(counts(tiles.filter((t) => t.token != null).map((t) => t.token))).toEqual(counts([...TOKEN_SET]))
      expect(tiles.find((t) => t.terrain === 'desert')!.token).toBeNull()
      expect(redNumbersSeparated(layoutOf(b))).toBe(true)
      expect(counts(b.ports.map((p) => p.kind))).toEqual(counts(PORT_EDGES.map((p) => p.kind)))
    }
  })
  it('the same seed gives the same board, different seeds differ', () => {
    expect(layoutOf(generateBoard(createRng(5), 'random'))).toEqual(layoutOf(generateBoard(createRng(5), 'random')))
    expect(layoutOf(generateBoard(createRng(5), 'random'))).not.toEqual(layoutOf(generateBoard(createRng(6), 'random')))
  })
})
