// G4.2a: the scene draws exactly the engine's standard-fixed board.
import { describe, expect, it } from 'vitest'
import { createGame, STANDARD_FIXED, type TileId } from '../../game'
import { BOARD_MODE, TERRAIN_BIOME, TILES, engineLayout, tileByAxial } from '../board'

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
})
