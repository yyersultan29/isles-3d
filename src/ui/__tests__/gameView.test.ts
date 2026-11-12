// G4.4a: HUD data is derived from state and shows only public information for everyone.
import { describe, expect, it } from 'vitest'
import { act, fixture, newGame, playSetup } from '../../game/__tests__/helpers'
import { buildOptions, costText, handOf, phaseText, primaryAction, seats, SEATS } from '../gameView'
import { COSTS, legalActions } from '../../game'

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

  it('G4.4b: the hand is the active player\'s; costs come from the engine (a city is 2 grain + 3 ore)', () => {
    const s = fixture({ hands: { p1: { ore: 2 }, p2: { wool: 5 } } })
    expect(handOf(s)).toEqual({ owner: 'p1', counts: { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 2 } })
    expect(costText(COSTS.city)).toBe('2 grain, 3 ore')
  })

  it('G4.4b: a build row is enabled exactly when legalActions offers it, with a reason otherwise', () => {
    const rich = fixture({ hands: { p1: { lumber: 2, brick: 2, wool: 2, grain: 3, ore: 3 } }, buildings: [['0,0,N', 'p1']], roads: [['0,0,NE', 'p1'], ['1,-1,W', 'p1']] })
    const legal = new Set(legalActions(rich, 'p1').map((a) => a.type))
    for (const o of buildOptions(rich)) {
      const t = { road: 'BUILD_ROAD', settlement: 'BUILD_SETTLEMENT', city: 'BUILD_CITY', dev: 'BUY_DEV' }[o.kind]
      expect(o.enabled).toBe(legal.has(t as never))
      if (!o.enabled) expect(o.reason).toBeTruthy()
    }
    expect(buildOptions(rich).find((o) => o.kind === 'city')!.enabled).toBe(true)
    const poor = buildOptions(fixture({ hands: { p1: { grain: 1, ore: 1 } }, buildings: [['0,0,N', 'p1']] }))
    expect(poor.find((o) => o.kind === 'city')!.reason).toBe('Need 1 more grain, 2 more ore')
    expect(buildOptions(fixture({ phase: { kind: 'preRoll' } })).every((o) => o.reason === 'Roll the dice first')).toBe(true)
    const noRoads = fixture({ hands: { p1: { lumber: 1, brick: 1 } }, buildings: [['0,0,N', 'p1']] })
    noRoads.players[0].pieces.roads = 0
    expect(buildOptions(noRoads).find((o) => o.kind === 'road')!.reason).toBe('No roads left')
    const empty = fixture({ hands: { p1: { wool: 1, grain: 1, ore: 1 } } })
    empty.deck = []
    expect(buildOptions(empty).find((o) => o.kind === 'dev')!.reason).toBe('The deck is empty')
  })
})
