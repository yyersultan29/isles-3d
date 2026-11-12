// G4.3: placement targets come straight from legalActions for the current phase and mode.
import { describe, expect, it } from 'vitest'
import { legalActions, type Action } from '../../game'
import { act, fixture, newGame } from '../../game/__tests__/helpers'
import { placementTargets } from '../placement'

describe('G4.3 placement targets', () => {
  it('setup: settlement spots first, then roads touching the new settlement', () => {
    let s = newGame(3)
    const p = s.order[s.active]
    const t1 = placementTargets(s, null)
    expect(t1.player).toBe(p)
    expect(t1.vertices).toHaveLength(54)
    expect(t1.edges).toHaveLength(0)
    s = act(s, t1.vertices[0].action, p)
    const t2 = placementTargets(s, 'city') // the mode is ignored outside `actions`
    expect(t2.vertices).toHaveLength(0)
    expect(t2.edges.map((e) => e.action)).toEqual(legalActions(s, p))
  })

  it('actions: nothing without a mode; each mode shows only its build', () => {
    const s = fixture({
      hands: { p1: { lumber: 3, brick: 3, wool: 1, grain: 3, ore: 3 } },
      buildings: [['0,0,N', 'p1']],
      roads: [['0,0,NE', 'p1'], ['1,-1,W', 'p1']],
    })
    expect(placementTargets(s, null)).toMatchObject({ vertices: [], edges: [], tiles: [] })
    const legal = legalActions(s, 'p1') as Action[]
    const only = (t: string) => legal.filter((a) => a.type === t)
    expect(placementTargets(s, 'road').edges.map((e) => e.action)).toEqual(only('BUILD_ROAD'))
    expect(placementTargets(s, 'settlement').vertices.map((v) => v.action)).toEqual(only('BUILD_SETTLEMENT'))
    expect(placementTargets(s, 'city').vertices.map((v) => v.action)).toEqual([{ type: 'BUILD_CITY', vertex: '0,0,N' }])
    expect(only('BUILD_ROAD').length).toBeGreaterThan(0)
  })

  it('moveRobber: every legal tile and nothing else', () => {
    const s = fixture({ phase: { kind: 'moveRobber', source: 'seven', resume: 'actions' } })
    const t = placementTargets(s, null)
    expect(t.tiles).toHaveLength(18)
    expect(t.tiles.some((x) => x.at === s.robber)).toBe(false)
  })

  it('roadBuilding shows free roads; discard and preRoll show nothing', () => {
    const rb = fixture({ buildings: [['0,0,N', 'p1']], phase: { kind: 'roadBuilding', remaining: 2, resume: 'actions' } })
    expect(placementTargets(rb, null).edges.length).toBeGreaterThan(0)
    expect(placementTargets(fixture({ phase: { kind: 'preRoll' } }), 'road').edges).toHaveLength(0)
    expect(placementTargets(fixture({ hands: { p2: { ore: 8 } }, phase: { kind: 'discard', pending: { p2: 4 } } }), null).player).toBeNull()
  })
})
