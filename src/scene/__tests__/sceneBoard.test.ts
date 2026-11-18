import { describe, expect, it } from 'vitest'
import { createGame, type Board } from '../../game'
import { HARBORS, TILES, TERRAIN_BIOME, tileHeight } from '../board'
import { syncSceneBoard } from '../sceneBoard'
import * as guy from '../mountainGuyLogic'

const boardOf = (seed: number, preset: 'balanced' | 'standard-fixed' = 'balanced'): Board => {
  const r = createGame({ seed, boardPreset: preset })
  if (!r.ok) throw new Error(r.error.message)
  return r.state.board
}

describe('scene board switching (B2)', () => {
  it('repoints tiles, harbours and the mountain guy at a new board, and back', () => {
    const fixed = boardOf(1, 'standard-fixed')
    const sigFixed = syncSceneBoard(fixed)
    for (const seed of [3, 11, 2026]) {
      const b = boardOf(seed)
      const sig = syncSceneBoard(b)
      expect(sig).not.toBe(sigFixed)
      for (const t of TILES) {
        expect(t.biome).toBe(TERRAIN_BIOME[b.tiles[t.axial].terrain])
        expect(t.number).toBe(b.tiles[t.axial].token)
      }
      expect(HARBORS.map((h) => h.kind)).toHaveLength(9)
      const s = guy.GUY_SPOT
      if (s) {
        expect(s.tile.biome).toBe('mountain')
        expect(guy.robberClear(s)).toBe(true)
        expect(tileHeight(s.tile, s.x, s.z)).toBeCloseTo(s.y, 5) // his quarry ledge was cut for this board
      }
    }
    expect(syncSceneBoard(fixed)).toBe(sigFixed)
    expect(syncSceneBoard(fixed)).toBe(sigFixed) // same board: no change
  })
})
