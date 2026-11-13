import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../../game'
import { deltaText, handDiff } from '../handDelta'
import { boughtNotice, ownRollNotice } from '../noticeQueue'

const H = (o: Partial<Record<'lumber' | 'brick' | 'wool' | 'grain' | 'ore', number>> = {}) => ({ lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0, ...o })

describe('G7.2 hand deltas', () => {
  it('reports only the kinds that changed', () => {
    expect(handDiff(H({ wool: 4 }), H({ brick: 1 }))).toEqual({ brick: 1, wool: -4 })
    expect(handDiff(H({ ore: 2 }), H({ ore: 2 }))).toBeNull()
  })
  it('writes a real minus sign', () => {
    expect(deltaText(2)).toBe('+2')
    expect(deltaText(-1)).toBe('−1')
  })
})

describe('G7.2 own roll with nothing gained', () => {
  const roll = (by: 'p1' | 'p2', dice: [number, number]): GameEvent => ({ type: 'DICE_ROLLED', by, dice } as GameEvent)
  const made = (gains: Record<string, Record<string, number>>): GameEvent => ({ type: 'RESOURCES_PRODUCED', gains, shortfall: [] } as unknown as GameEvent)
  it('says so when the viewer rolled and got nothing', () => {
    const n = ownRollNotice([roll('p1', [3, 5]), made({ p2: { grain: 1 } })], 'p1')
    expect(n?.text).toMatch(/no resources this roll/)
  })
  it('stays quiet when the viewer gained, did not roll, rolled a seven, or is a spectator', () => {
    expect(ownRollNotice([roll('p1', [3, 5]), made({ p1: { grain: 1 } })], 'p1')).toBeNull()
    expect(ownRollNotice([roll('p2', [3, 5]), made({})], 'p1')).toBeNull()
    expect(ownRollNotice([roll('p1', [3, 4])], 'p1')).toBeNull()
    expect(ownRollNotice([roll('p1', [3, 5]), made({ p2: { ore: 1 } })], null)).toBeNull()
    expect(ownRollNotice([roll('p1', [3, 5]), made({})], 'p1')).toBeNull() // "No one produced anything." says it
  })
})

describe('G7.4 the buyer sees the card', () => {
  const bought = (by: 'p1' | 'p2', card: string | null): GameEvent => ({ type: 'DEV_BOUGHT', by, card } as GameEvent)
  it('names the card and when it plays, only for the buyer', () => {
    expect(boughtNotice([bought('p1', 'knight')], 'p1')?.text).toMatch(/you got a Knight: playable from your next turn/)
    expect(boughtNotice([bought('p1', 'victoryPoint')], 'p1')?.text).toMatch(/Victory Point: \+1 point, hidden/)
    expect(boughtNotice([bought('p2', null)], 'p1')).toBeNull()
    expect(boughtNotice([bought('p1', 'knight')], null)).toBeNull()
  })
})
