import { describe, expect, it } from 'vitest'
import { createGame } from '../../game'
import { VERTICES, hexDist } from '../board'
import { syncSceneBoard } from '../sceneBoard'
import { robberSpot } from '../board'
import * as chars from '../characters'

const check = () => {
  const spots = chars.CHARACTER_SPOTS
  expect(spots.map((s) => s.def.id).sort()).toEqual(chars.CHARACTERS.filter((d) => d.enabled).map((d) => d.id).sort())
  for (const s of spots) {
    const { def, tile } = s
    expect(def.biomes).toContain(tile.biome)
    const lx = s.x - tile.x, lz = s.z - tile.z
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; expect(hexDist(lx + Math.cos(a) * def.foot, lz + Math.sin(a) * def.foot)).toBeLessThan(0.8) }
    expect(Math.hypot(lx, lz)).toBeGreaterThan(0.36 + def.foot) // off the token
    const [rx, rz] = robberSpot(tile)
    expect(Math.hypot(s.x - rx, s.z - rz)).toBeGreaterThan(0.22 + def.foot)
    for (const [x, z] of VERTICES) expect(Math.hypot(s.x - x, s.z - z)).toBeGreaterThan(0.3 + def.foot)
  }
}

describe('characters', () => {
  it('stand one per type on their tiles, inside the hex, off the token, corners and robber spot', () => check())
  it('pick a random tile of their type', () => {
    const tile = (r: number) => chars.pickCharacterSpots(undefined, () => r).map((s) => s.tile)
    expect(tile(0)).not.toEqual(tile(0.999))
  })
  it('are re-placed on every board', () => {
    for (const seed of [3, 11, 2026, 77]) {
      const r = createGame({ seed, boardPreset: 'balanced' })
      if (!r.ok) throw new Error(r.error.message)
      syncSceneBoard(r.state.board)
      check()
    }
  })
})
