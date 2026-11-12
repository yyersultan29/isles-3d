// G4.4a: HUD data is derived from state and shows only public information for everyone.
import { describe, expect, it } from 'vitest'
import { act, fixture, newGame, playSetup } from '../../game/__tests__/helpers'
import { phaseText, primaryAction, seats, SEATS } from '../gameView'

describe('G4.4a HUD view', () => {
  it('seats follow turn order, mark the active player and count public VP only', () => {
    const s = fixture({ buildings: [['0,0,N', 'p1', 'city'], ['2,-2,S', 'p2']], hands: { p2: { ore: 3, wool: 1 } } })
    s.longestRoad = 'p2'
    s.players[0].devCards.push({ id: 99, type: 'victoryPoint', boughtOnTurn: 1 }) // hidden: never counted
    const v = seats(s)
    expect(v.map((x) => x.id)).toEqual(s.order)
    expect(v[0]).toMatchObject({ id: 'p1', active: true, vp: 2, devCards: 1, name: 'Red' })
    expect(v[1]).toMatchObject({ id: 'p2', active: false, vp: 3, cards: 4, longestRoad: true })
  })

  it('phase text names who acts and what to do', () => {
    let s = newGame(2)
    const first = SEATS[s.order[0]].name
    expect(phaseText(s)).toBe(`${first}: place your first settlement`)
    s = playSetup(s)
    expect(phaseText(s)).toBe(`${SEATS[s.order[0]].name}: roll the dice`)
    expect(phaseText(fixture({ phase: { kind: 'discard', pending: { p2: 4, p4: 5 } } }))).toBe('Seven! Discard half: Blue 4, Orange 5')
    expect(phaseText(fixture({ phase: { kind: 'gameOver', winner: 'p3' } }))).toBe('White wins!')
  })

  it('the main button rolls in preRoll, ends the turn in actions, and is disabled otherwise', () => {
    const pre = fixture({ phase: { kind: 'preRoll' } })
    expect(primaryAction(pre)).toEqual({ label: 'Roll Dice', short: 'Roll', action: { type: 'ROLL' }, player: 'p1' })
    expect(primaryAction(fixture())).toMatchObject({ label: 'End Turn', action: { type: 'END_TURN' } })
    expect(primaryAction(newGame(1)).action).toBeNull()
    expect(primaryAction(fixture({ phase: { kind: 'moveRobber', source: 'seven', resume: 'actions' } })).action).toBeNull()
    // the button's action is always legal
    const after = act(pre, primaryAction(pre).action!, 'p1')
    expect(after.dice).not.toBeNull()
  })
})
