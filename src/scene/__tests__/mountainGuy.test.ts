import { describe, expect, it } from 'vitest'
import { TILES, VERTICES, hexDist, tileHeight } from '../board'
import { BOUT_SWINGS, CLICK_LINES, GUY_FOOT, GUY_H, GUY_SPOT, MINE_PERIOD, PICK, ROCK_R, SETTLEMENT_H, guyPose, guyReaction, mineCycle, pickLine, robberClear, spotFree } from '../mountainGuyLogic'
import type { GameEvent, GameState, VertexId } from '../../game'
import { newGame } from '../../game/__tests__/helpers'

describe('mountain guy', () => {
  const s = GUY_SPOT!
  it('stands on a mountain tile', () => {
    expect(s).not.toBeNull()
    expect(s.tile.biome).toBe('mountain')
  })
  it('keeps his whole footprint inside the hex, clear of the rails', () => {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      expect(hexDist(s.x - s.tile.x + Math.cos(a) * GUY_FOOT, s.z - s.tile.z + Math.sin(a) * GUY_FOOT)).toBeLessThan(0.8)
    }
  })
  it('leaves the number token, corners and robber spot free', () => {
    const lx = s.x - s.tile.x, lz = s.z - s.tile.z
    expect(Math.hypot(lx, lz)).toBeGreaterThan(0.36 + GUY_FOOT)
    expect(spotFree(lx, lz)).toBe(true)
    expect(robberClear(s)).toBe(true)
    for (const [x, z] of VERTICES) expect(Math.hypot(s.x - x, s.z - z)).toBeGreaterThan(0.3 + GUY_FOOT)
  })
  it('stands on fairly flat ground with his feet on it', () => {
    const hs = Array.from({ length: 8 }, (_, i) => tileHeight(s.tile, s.x + Math.cos(i) * GUY_FOOT, s.z + Math.sin(i) * GUY_FOOT))
    expect(Math.max(...hs) - Math.min(...hs)).toBeLessThan(0.1)
    expect(s.y).toBeLessThanOrEqual(Math.min(...hs) + 1e-9)
  })
  it('is about 1.2 settlements tall', () => expect(GUY_H / SETTLEMENT_H).toBeCloseTo(1.2))
  it('idles gently and returns to rest after a hop', () => {
    for (let t = 0; t < 20; t += 0.37) {
      const p = guyPose(t)
      expect(Math.abs(p.y)).toBeLessThan(0.01)
      expect(Math.abs(p.yaw)).toBeLessThan(0.4)
    }
    expect(guyPose(3, { mood: 'cheer', s: 0.5 }).y).toBeGreaterThan(0.1)
    expect(guyPose(3, { mood: 'cheer', s: 1 }).y).toBeCloseTo(guyPose(3).y)
    expect(guyPose(3, { mood: 'look', s: 1.5, lookYaw: 1.2 }).yaw).toBeCloseTo(1.2)
    expect(guyPose(3, { mood: 'look', s: 5, lookYaw: 1.2 }).yaw).toBeCloseTo(guyPose(3).yaw)
    expect(guyPose(3, { mood: 'cheer', s: 0.5 }, true).yaw).toBeCloseTo(guyPose(3).yaw) // reduced motion: no spin
  })
  it('has no spot on a board without mountains', async () => {
    const { pickGuySpot } = await import('../mountainGuyLogic')
    expect(pickGuySpot(TILES.filter((t) => t.biome !== 'mountain'))).toBeNull()
  })

  describe('mining', () => {
    it('has its boulder on free ground beside him, on the same quarry ledge', () => {
      const r = s.rock
      expect(spotFree(r.x - s.tile.x, r.z - s.tile.z, ROCK_R)).toBe(true)
      expect(Math.hypot(r.x - s.x, r.z - s.z)).toBeGreaterThan(GUY_FOOT + ROCK_R)
      expect(r.y).toBe(s.y)
      expect(tileHeight(s.tile, r.x, r.z)).toBeCloseTo(s.y, 5)
    })
    it('lands BOUT_SWINGS blows per bout, never counting backwards', () => {
      let last = 0
      for (let t = 0; t < MINE_PERIOD * 3; t += 0.01) { const n = mineCycle(t).strikes; expect(n).toBeGreaterThanOrEqual(last); last = n }
      expect(mineCycle(MINE_PERIOD * 3 - 0.01).strikes).toBe(BOUT_SWINGS * 3)
    })
    it('rests between bouts with the pick on his shoulder, facing his rest direction', () => {
      const m = mineCycle(MINE_PERIOD - 0.5)
      expect(m.face).toBe(0)
      expect(m.pick).toBeCloseTo(PICK.rest)
      const hits = Array.from({ length: 2000 }, (_, i) => mineCycle((i / 2000) * MINE_PERIOD).pick)
      expect(Math.max(...hits)).toBeCloseTo(PICK.hit, 1)
      expect(Math.min(...hits)).toBeCloseTo(PICK.rest, 1)
      // after the first blow, swings run between wound-up and the blow, with a small recoil
      const later = Array.from({ length: 400 }, (_, i) => mineCycle(0.5 + 1.15 * (1 + (i / 400) * 2)).pick)
      expect(Math.min(...later)).toBeCloseTo(PICK.up, 1)
    })
    it('stops working (pick to rest) when work is 0, as during a reaction', () => {
      for (let t = 0; t < MINE_PERIOD; t += 0.3) expect(guyPose(t, undefined, false, false, 0).pick).toBe(PICK.rest)
    })
  })

  describe('reactions', () => {
    const tile = GUY_SPOT!.tile.axial
    const base = (): GameState => ({ ...newGame(1), robber: '0,0' as GameState['robber'] })
    const v = (s: GameState) => s.board.topo.tileVertices[tile][0] as VertexId
    it('cheers when his number is rolled, sad under the robber', () => {
      const s = base(), n = s.board.tiles[tile].token!
      const roll: GameEvent = { type: 'DICE_ROLLED', by: 'p1', dice: [1, n - 1] }
      expect(guyReaction([roll], s, tile)?.mood).toBe('cheer')
      expect(guyReaction([roll], { ...s, robber: tile }, tile)?.mood).toBe('sad')
      expect(guyReaction([{ type: 'DICE_ROLLED', by: 'p1', dice: [6, 6] }], s, tile)).toBeNull()
    })
    it('is scared when the robber comes, relieved when it goes, and that beats a roll', () => {
      const s = base()
      const roll: GameEvent = { type: 'DICE_ROLLED', by: 'p1', dice: [1, s.board.tiles[tile].token! - 1] }
      expect(guyReaction([roll, { type: 'ROBBER_MOVED', by: 'p1', from: '0,0' as never, to: tile }], s, tile)?.mood).toBe('scared')
      expect(guyReaction([{ type: 'ROBBER_MOVED', by: 'p1', from: tile, to: '0,0' as never }], s, tile)?.mood).toBe('relief')
    })
    it('turns to look at a new neighbour, ignores roads and other tiles', () => {
      const s = base()
      const r = guyReaction([{ type: 'SETUP_PLACED', what: 'settlement', at: v(s), by: 'p1' }], s, tile)
      expect(r?.mood).toBe('look')
      expect(r?.lookAt).toHaveLength(2)
      expect(guyReaction([{ type: 'BUILT', what: 'road', at: 'x', by: 'p1', free: false }], s, tile)).toBeNull()
      const far = s.board.topo.vertices.find((x) => !s.board.topo.tileVertices[tile].includes(x))!
      expect(guyReaction([{ type: 'BUILT', what: 'city', at: far, by: 'p1', free: false }], s, tile)).toBeNull()
    })
    it('never repeats the same click line twice in a row', () => {
      const lines = CLICK_LINES()
      let last = -1
      for (let i = 0; i < 200; i++) { const n = pickLine(lines, last); expect(n).not.toBe(last); expect(n).toBeLessThan(lines.length); last = n }
    })
  })
})
