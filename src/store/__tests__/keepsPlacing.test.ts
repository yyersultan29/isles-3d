// G6.5: the build mode stays on while the same build is still legal after placing one.
import { describe, expect, it } from 'vitest'
import { fixture } from '../../game/__tests__/helpers'
import { legalActions, type Action, type VertexId } from '../../game'
import { keepsPlacing } from '../placement'

const HOME = '0,0,N' as VertexId
const first = (s: ReturnType<typeof fixture>, type: Action['type']) => legalActions(s, 'p1').find((a) => a.type === type) as Action

describe('keepsPlacing', () => {
  it('stays on while cards, pieces and a spot are left for another', () => {
    const two = fixture({ buildings: [[HOME, 'p1']], hands: { p1: { lumber: 2, brick: 2 } } })
    expect(keepsPlacing(two, 'p1', first(two, 'BUILD_ROAD'))).toBe(true)
    const one = fixture({ buildings: [[HOME, 'p1']], hands: { p1: { lumber: 2, brick: 1 } } })
    expect(keepsPlacing(one, 'p1', first(one, 'BUILD_ROAD'))).toBe(false)
    const lastPiece = fixture({ buildings: [[HOME, 'p1']], hands: { p1: { lumber: 2, brick: 2 } } })
    lastPiece.players[0].pieces.roads = 1
    expect(keepsPlacing(lastPiece, 'p1', first(lastPiece, 'BUILD_ROAD'))).toBe(false)
  })

  it('ends after the only settlement that could become a city', () => {
    const s = fixture({ buildings: [[HOME, 'p1']], hands: { p1: { ore: 6, grain: 4 } } })
    expect(keepsPlacing(s, 'p1', first(s, 'BUILD_CITY'))).toBe(false)
  })

  it('is off outside the actions phase and for a refused action', () => {
    const s = fixture({ buildings: [[HOME, 'p1']], hands: { p1: { lumber: 2, brick: 2 } } })
    const a = first(s, 'BUILD_ROAD')
    expect(keepsPlacing({ ...s, phase: { kind: 'preRoll' } }, 'p1', a)).toBe(false)
    expect(keepsPlacing(s, 'p2', a)).toBe(false)
  })
})
