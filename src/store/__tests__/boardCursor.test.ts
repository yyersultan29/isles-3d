// G4.6a: keyboard placement — spot descriptions and directional cursor movement.
import { describe, expect, it } from 'vitest'
import { act, newGame } from '../../game/__tests__/helpers'
import { placementTargets } from '../placement'
import { nearest, spotLabel, step, type Point } from '../boardCursor'
import { SEATS } from '../../ui/gameView'

describe('G4.6a board cursor', () => {
  const s = newGame(1, { boardPreset: 'standard-fixed' })

  it('describes settlement, road and robber spots from the board', () => {
    expect(spotLabel(s, { type: 'PLACE_SETTLEMENT', vertex: '0,0,N' })).toBe('Settlement: 11 wood, 9 brick, desert')
    expect(spotLabel(s, { type: 'BUILD_CITY', vertex: '0,0,N' })).toMatch(/^City: /)
    expect(spotLabel(s, { type: 'PLACE_ROAD', edge: '0,0,NE' })).toBe('Road between 9 brick and desert')
    // a coastal corner with a port names the port
    const port = s.board.ports[0]
    expect(spotLabel(s, { type: 'PLACE_SETTLEMENT', vertex: port.vertices[0] })).toMatch(/port$/)
    expect(spotLabel(s, { type: 'BUILD_ROAD', edge: port.edge })).toMatch(/^Road on the coast of \d+ \w+$/)
  })

  it('names the players a robber move would hit', () => {
    const p = s.order[s.active]
    const t = act(s, { type: 'PLACE_SETTLEMENT', vertex: '0,0,N' }, p)
    expect(spotLabel(t, { type: 'MOVE_ROBBER', tile: '1,-1' })).toBe(`Robber to 9 brick (${SEATS[p].name})`)
    expect(spotLabel(t, { type: 'MOVE_ROBBER', tile: '0,2' })).toBe('Robber to 8 grain')
  })

  it('every setup target has a non-empty label', () => {
    for (const v of placementTargets(s, null).vertices) expect(spotLabel(s, v.action)).toMatch(/^Settlement: .+/)
  })

  it('steps to the target straight ahead, not one off to the side', () => {
    const pts: Point[] = [[100, 100], [160, 100], [130, 40], [100, 180], [40, 104], [101, 300]]
    expect(step(pts, 0, 'right')).toBe(1)
    expect(step(pts, 0, 'up')).toBe(2)
    expect(step(pts, 0, 'down')).toBe(3)
    expect(step(pts, 0, 'left')).toBe(4)
    expect(step(pts, 1, 'right')).toBe(1) // nothing that way: stay
    expect(step(pts, 3, 'down')).toBe(5)
    expect(nearest(pts, [150, 95])).toBe(1)
  })
})
