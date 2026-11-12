// G4.4a: HUD data is derived from state and shows only public information for everyone.
import { describe, expect, it } from 'vitest'
import { act, fixture, newGame, playSetup } from '../../game/__tests__/helpers'
import { bankMax, bankView, offerView, proposeCheck, buildOptions, costText, discardPrompt, handOf, stealPrompt, phaseText, primaryAction, seats, SEATS } from '../gameView'
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

  it('G4.4c: discard prompts go one player at a time in turn order; steal lists candidates', () => {
    const s = fixture({ hands: { p2: { ore: 8 }, p4: { wool: 9 } }, phase: { kind: 'discard', pending: { p4: 4, p2: 4 } } })
    expect(discardPrompt(s)).toMatchObject({ player: 'p2', count: 4, waiting: ['p2', 'p4'] })
    const after = act(s, { type: 'DISCARD', cards: { ore: 4 } }, 'p2')
    expect(discardPrompt(after)).toMatchObject({ player: 'p4', count: 4, waiting: ['p4'] })
    expect(discardPrompt(fixture())).toBeNull()
    const st = fixture({ hands: { p2: { ore: 2 }, p3: { wool: 1 } }, phase: { kind: 'steal', tile: '0,0', candidates: ['p2', 'p3'], resume: 'actions' } })
    expect(stealPrompt(st)).toEqual({ player: 'p1', candidates: [
      { id: 'p2', name: 'Blue', color: SEATS.p2.color, avatar: SEATS.p2.avatar, cards: 2 },
      { id: 'p3', name: 'White', color: SEATS.p3.color, avatar: SEATS.p3.avatar, cards: 1 },
    ] })
  })

  it('G4.4d: bank rates follow ports and the engine; max respects hand and bank', () => {
    const plain = fixture({ hands: { p1: { lumber: 9, ore: 3 } }, buildings: [['0,0,N', 'p1']] })
    const v = bankView(plain)
    expect(v).toMatchObject({ player: 'p1', open: true, reason: null })
    expect(v.rows.map((r) => r.rate)).toEqual([4, 4, 4, 4, 4])
    expect(v.rows.find((r) => r.res === 'lumber')).toMatchObject({ have: 9, canGive: true })
    expect(v.rows.find((r) => r.res === 'ore')).toMatchObject({ have: 3, canGive: false })
    expect(bankMax(v, 'lumber', 'brick')).toBe(2)
    expect(bankMax(v, 'lumber', 'lumber')).toBe(0)
    // every give the panel allows is one the engine offers, and vice versa
    const legal = new Set(legalActions(plain, 'p1').filter((a) => a.type === 'BANK_TRADE').map((a) => (a as { give: string }).give))
    expect(new Set(v.rows.filter((r) => r.canGive).map((r) => r.res))).toEqual(legal)

    // a settlement on a port: 2:1 for its resource, or 3:1 for every resource on a generic port
    for (const port of plain.board.ports) {
      const s = fixture({ hands: { p1: { wool: 3 } }, buildings: [[port.vertices[0], 'p1']] })
      const rows = bankView(s).rows
      if (port.kind === 'generic') expect(rows.every((r) => r.rate === 3)).toBe(true)
      else expect(rows.find((r) => r.res === port.kind)!.rate).toBe(2)
    }
    const empty = fixture({ hands: { p1: { lumber: 8 } } })
    empty.bank.brick = 1
    expect(bankMax(bankView(empty), 'lumber', 'brick')).toBe(1)
    expect(bankView(fixture({ phase: { kind: 'preRoll' } }))).toMatchObject({ open: false, reason: 'Roll the dice first' })
  })

  it('G4.4d2: propose checks mirror the engine; the offer view follows responses and legalActions', () => {
    const s = fixture({ hands: { p1: { lumber: 2, wool: 1 }, p2: { ore: 1 }, p3: { grain: 2 } } })
    const all = ['p2', 'p3', 'p4'] as const
    expect(proposeCheck(s, {}, { ore: 1 }, [...all])).toBe('Add cards you give')
    expect(proposeCheck(s, { lumber: 1 }, {}, [...all])).toBe('Add cards you want')
    expect(proposeCheck(s, { lumber: 1 }, { lumber: 1 }, [...all])).toBe('A resource can’t be on both sides')
    expect(proposeCheck(s, { lumber: 1 }, { ore: 1 }, [])).toBe('Choose at least one player')
    expect(proposeCheck(s, { lumber: 3 }, { ore: 1 }, [...all])).toBe('You have only 2 wood')
    expect(proposeCheck(s, { lumber: 2 }, { ore: 1 }, [...all])).toBeNull()
    expect(proposeCheck(fixture({ phase: { kind: 'preRoll' } }), { lumber: 1 }, { ore: 1 }, [...all])).toBe('Not now')

    let t = act(s, { type: 'PROPOSE_TRADE', offer: { lumber: 2 }, request: { ore: 1 } })
    let v = offerView(t)!
    expect(v).toMatchObject({ from: 'p1', offer: { lumber: 2 }, request: { ore: 1 } })
    expect(v.rows.map((r) => [r.id, r.response, r.canAccept, r.canConfirm])).toEqual([
      ['p2', 'pending', true, false], ['p3', 'pending', false, false], ['p4', 'pending', false, false]])
    expect(v.rows[1].reason).toBe('Needs 1 more ore')
    t = act(t, { type: 'RESPOND_TRADE', tradeId: v.id, accept: true }, 'p2')
    t = act(t, { type: 'RESPOND_TRADE', tradeId: v.id, accept: false }, 'p3')
    v = offerView(t)!
    expect(v.rows.map((r) => [r.id, r.response, r.canConfirm])).toEqual([['p2', 'accept', true], ['p3', 'reject', false], ['p4', 'pending', false]])
    t = act(t, { type: 'CONFIRM_TRADE', tradeId: v.id, with: 'p2' })
    expect(offerView(t)).toBeNull()
    expect(t.players[0].resources).toMatchObject({ lumber: 0, ore: 1 })
  })
})
