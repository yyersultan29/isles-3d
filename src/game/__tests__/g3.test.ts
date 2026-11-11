// G3: trading, development cards, victory, views over full games, golden replays.
import { describe, expect, it } from 'vitest'
import { apply, legalActions } from '../engine'
import { viewFor, eventsFor } from '../view'
import { ENGINE_VERSION, hashState, replay, type ReplayFile } from '../replay'
import { tradeRate } from '../rules/trade'
import { totalVP } from '../state'
import type { Action, DevCardType, EdgeId, GameEvent, GameState, PlayerId } from '../types'
import { PLAYER_IDS } from '../types'
import { act, assertAwards, assertInvariants, assertLegalSubset, botGame, botMove, concretize, deepFreeze, fixture, newGame } from './helpers'
import { createRng } from '../rng'

const err = (s: GameState, a: Action, p: PlayerId = 'p1') => {
  const r = apply(deepFreeze(s), p, a)
  if (r.ok) throw new Error(`expected an error for ${a.type}`)
  return r.error.code
}
const events = (s: GameState, a: Action, p: PlayerId = 'p1'): [GameState, GameEvent[]] => {
  const r = apply(s, p, a)
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`)
  return [r.state, r.events]
}
const hand = (s: GameState, p: PlayerId) => s.players.find((x) => x.id === p)!.resources
const player = (s: GameState, p: PlayerId) => s.players.find((x) => x.id === p)!

/** Gives `p` a dev card taken from the deck (keeps the 25-card total). */
function giveDev(s: GameState, p: PlayerId, type: DevCardType, boughtOnTurn = 1) {
  const i = s.deck.findIndex((c) => c.type === type)
  const [card] = s.deck.splice(i, 1)
  player(s, p).devCards.push({ ...card, boughtOnTurn })
  return s
}
const devTotal = (s: GameState) => s.deck.length + s.players.reduce((a, p) => a + p.devCards.length, 0)

const port = (s: GameState, kind: string) => s.board.ports.find((p) => p.kind === kind)!

describe('G3.1 bank and port trades', () => {
  it('4:1 without a port, 3:1 generic, 2:1 matching; a city keeps the rate', () => {
    const g = port(fixture(), 'generic').vertices[0]
    const grain = port(fixture(), 'grain').vertices[0]
    expect(tradeRate(fixture(), 'p1', 'grain')).toBe(4)
    expect(tradeRate(fixture({ buildings: [[g, 'p1']] }), 'p1', 'grain')).toBe(3)
    expect(tradeRate(fixture({ buildings: [[g, 'p1'], [grain, 'p1', 'city']] }), 'p1', 'grain')).toBe(2)
    expect(tradeRate(fixture({ buildings: [[grain, 'p1', 'city']] }), 'p1', 'ore')).toBe(4) // specific port only for its resource
    expect(tradeRate(fixture({ buildings: [[g, 'p2']] }), 'p1', 'grain')).toBe(4) // someone else's port
  })

  it('executes at the rate, count multiplies, conservation holds', () => {
    const grain = port(fixture(), 'grain').vertices[0]
    let s = fixture({ hands: { p1: { grain: 4, lumber: 4 } }, buildings: [[grain, 'p1']] })
    s = act(s, { type: 'BANK_TRADE', give: 'grain', get: 'ore', count: 2 })
    expect(hand(s, 'p1')).toMatchObject({ grain: 0, ore: 2 })
    s = act(s, { type: 'BANK_TRADE', give: 'lumber', get: 'wool' })
    expect(hand(s, 'p1')).toMatchObject({ lumber: 0, wool: 1 })
    assertInvariants(s)
  })

  it('rejects same resource, short hand, empty bank stock', () => {
    const s = fixture({ hands: { p1: { grain: 4 }, p2: { ore: 19 } } })
    expect(err(s, { type: 'BANK_TRADE', give: 'grain', get: 'grain' })).toBe('INVALID_TRADE')
    expect(err(s, { type: 'BANK_TRADE', give: 'grain', get: 'wool', count: 2 })).toBe('INSUFFICIENT_RESOURCES')
    expect(err(s, { type: 'BANK_TRADE', give: 'grain', get: 'ore' })).toBe('BANK_EMPTY')
    expect(err(s, { type: 'BANK_TRADE', give: 'grain', get: 'wool' }, 'p2')).toBe('NOT_YOUR_TURN')
    expect(err(fixture({ hands: { p1: { grain: 4 } }, phase: { kind: 'preRoll' } }), { type: 'BANK_TRADE', give: 'grain', get: 'wool' })).toBe('WRONG_PHASE')
  })

  it('legalActions lists only affordable bank trades with stock', () => {
    const s = fixture({ hands: { p1: { grain: 4 }, p2: { ore: 19 } } })
    const bank = legalActions(s, 'p1').filter((a) => a.type === 'BANK_TRADE')
    expect(bank).toHaveLength(3) // grain → lumber, brick, wool (ore is out of stock)
    for (const a of bank) expect(apply(s, 'p1', a as Action).ok).toBe(true)
  })
})

describe('G3.2 player trades', () => {
  const base = () => fixture({ hands: { p1: { lumber: 2 }, p2: { ore: 1 }, p3: { ore: 1 }, p4: { grain: 1 } } })
  const offer: Action = { type: 'PROPOSE_TRADE', offer: { lumber: 2 }, request: { ore: 1 } }

  it('propose → accept → confirm swaps hands exactly once', () => {
    let [s, ev] = events(base(), offer)
    const id = s.trade!.id
    expect(ev[0]).toMatchObject({ type: 'TRADE_PROPOSED' })
    expect(s.trade!.to).toEqual(['p2', 'p3', 'p4'])
    s = act(s, { type: 'RESPOND_TRADE', tradeId: id, accept: true }, 'p2')
    s = act(s, { type: 'RESPOND_TRADE', tradeId: id, accept: false }, 'p4')
    expect(err(s, { type: 'CONFIRM_TRADE', tradeId: id, with: 'p4' })).toBe('TRADE_NOT_ACCEPTED')
    s = act(s, { type: 'CONFIRM_TRADE', tradeId: id, with: 'p2' })
    expect(hand(s, 'p1')).toMatchObject({ lumber: 0, ore: 1 })
    expect(hand(s, 'p2')).toMatchObject({ lumber: 2, ore: 0 })
    expect(s.trade).toBeNull()
    expect(err(s, { type: 'CONFIRM_TRADE', tradeId: id, with: 'p2' })).toBe('NO_OPEN_TRADE')
    assertInvariants(s)
  })

  it('rejects gifts, overlap, non-opponents, missing offer, missing request', () => {
    const s = base()
    expect(err(s, { type: 'PROPOSE_TRADE', offer: { lumber: 1 }, request: {} })).toBe('INVALID_TRADE')
    expect(err(s, { type: 'PROPOSE_TRADE', offer: {}, request: { ore: 1 } })).toBe('INVALID_TRADE')
    expect(err(s, { type: 'PROPOSE_TRADE', offer: { lumber: 1, ore: 0 }, request: { lumber: 1 } })).toBe('INVALID_TRADE')
    expect(err(s, { type: 'PROPOSE_TRADE', offer: { lumber: 1 }, request: { ore: 1 }, to: ['p1'] })).toBe('INVALID_TRADE')
    expect(err(s, { type: 'PROPOSE_TRADE', offer: { lumber: 3 }, request: { ore: 1 } })).toBe('INSUFFICIENT_RESOURCES')
    const t = act(s, offer)
    expect(err(t, { type: 'RESPOND_TRADE', tradeId: t.trade!.id, accept: true }, 'p4')).toBe('INSUFFICIENT_RESOURCES')
    expect(err(t, { type: 'RESPOND_TRADE', tradeId: t.trade!.id, accept: true }, 'p1')).toBe('NOT_ADDRESSED')
    expect(err(t, { type: 'RESPOND_TRADE', tradeId: 999, accept: true }, 'p2')).toBe('NO_OPEN_TRADE')
    const direct = act(s, { ...offer, to: ['p3'] } as Action)
    expect(err(direct, { type: 'RESPOND_TRADE', tradeId: direct.trade!.id, accept: true }, 'p2')).toBe('NOT_ADDRESSED')
  })

  it('TRADE_STALE when a hand no longer covers its side; the proposal stays open', () => {
    let s = act(base(), offer)
    const id = s.trade!.id
    s = act(s, { type: 'RESPOND_TRADE', tradeId: id, accept: true }, 'p2')
    s.players.find((p) => p.id === 'p2')!.resources.ore = 0 // simulate the hand changing (e.g. a steal by someone)
    s.bank.ore += 1
    expect(err(s, { type: 'CONFIRM_TRADE', tradeId: id, with: 'p2' })).toBe('TRADE_STALE')
    expect(s.trade).not.toBeNull()
  })

  it('a hand change by the proposer, a new proposal and END_TURN cancel the open trade', () => {
    const s = withRoadSpot(fixture({ hands: { p1: { lumber: 6, brick: 1 }, p2: { ore: 1 } } }))
    const t = act(s, offer)
    let [, ev] = events(t, { type: 'BUILD_ROAD', edge: roadSpot(t) })
    expect(ev.map((e) => e.type)).toEqual(['TRADE_CANCELLED', 'BUILT'])
    expect(ev[0]).toMatchObject({ reason: 'handChanged' })
    ;[, ev] = events(t, { type: 'BANK_TRADE', give: 'lumber', get: 'wool' })
    expect(ev.at(-1)).toMatchObject({ type: 'TRADE_CANCELLED', reason: 'handChanged' })
    ;[, ev] = events(t, { type: 'PROPOSE_TRADE', offer: { brick: 1 }, request: { ore: 1 } })
    expect(ev[0]).toMatchObject({ type: 'TRADE_CANCELLED', reason: 'replaced' })
    ;[, ev] = events(t, { type: 'END_TURN' })
    expect(ev.some((e) => e.type === 'TRADE_CANCELLED' && e.reason === 'turnEnded')).toBe(true)
    ;[, ev] = events(t, { type: 'CANCEL_TRADE' })
    expect(ev).toEqual([{ type: 'TRADE_CANCELLED', tradeId: t.trade!.id, reason: 'cancelled' }])
    expect(err(s, { type: 'CANCEL_TRADE' })).toBe('NO_OPEN_TRADE')
  })

  it('TRADE_LIMIT on the 21st proposal in a turn; the counter resets next turn', () => {
    let s = base()
    for (let i = 0; i < 20; i++) s = act(s, offer)
    expect(err(s, offer)).toBe('TRADE_LIMIT')
    expect(s.tradesProposedThisTurn).toBe(20)
    s = act(s, { type: 'END_TURN' })
    expect(s.tradesProposedThisTurn).toBe(0)
  })

  it('responders get RESPOND actions; nobody else does', () => {
    const s = act(base(), offer)
    expect(legalActions(s, 'p2')).toEqual([
      { type: 'RESPOND_TRADE', tradeId: s.trade!.id, accept: true },
      { type: 'RESPOND_TRADE', tradeId: s.trade!.id, accept: false },
    ])
    expect(legalActions(s, 'p4')).toEqual([{ type: 'RESPOND_TRADE', tradeId: s.trade!.id, accept: false }])
    expect(legalActions(base(), 'p2')).toEqual([])
  })
})

// a road spot next to a p1 settlement, for the "build cancels trade" check
const SETTLE = '0,0,N' as const
function withRoadSpot(s: GameState) {
  const t = structuredClone(s)
  t.buildings[SETTLE] = { owner: 'p1', type: 'settlement' }
  t.players[0].pieces.settlements -= 1
  return t
}
const roadSpot = (s: GameState): EdgeId => {
  const a = legalActions(s, 'p1').find((x) => x.type === 'BUILD_ROAD')
  if (!a || a.type !== 'BUILD_ROAD') throw new Error('no road spot')
  return a.edge
}

describe('G3.3 development cards', () => {
  const dev = { wool: 1, grain: 1, ore: 1 }

  it('buy takes the top card, costs W+G+O, cancels an open trade, DECK_EMPTY when empty', () => {
    const s = fixture({ hands: { p1: { ...dev, lumber: 1 }, p2: { ore: 1 } } })
    const top = s.deck[0]
    const t = act(s, { type: 'PROPOSE_TRADE', offer: { lumber: 1 }, request: { ore: 1 } })
    const [b, ev] = events(t, { type: 'BUY_DEV' })
    expect(player(b, 'p1').devCards).toEqual([{ ...top, boughtOnTurn: 5 }])
    expect(b.deck).toHaveLength(24)
    expect(ev.map((e) => e.type)).toEqual(['DEV_BOUGHT', 'TRADE_CANCELLED'])
    expect(devTotal(b)).toBe(25)
    const empty = structuredClone(s)
    empty.deck = []
    expect(err(empty, { type: 'BUY_DEV' })).toBe('DECK_EMPTY')
    expect(legalActions(empty, 'p1').some((a) => a.type === 'BUY_DEV')).toBe(false)
    expect(err(fixture({ hands: { p1: { wool: 1, grain: 1 } } }), { type: 'BUY_DEV' })).toBe('INSUFFICIENT_RESOURCES')
  })

  it('a card bought this turn cannot be played; an older copy can; one card per turn', () => {
    const s = giveDev(giveDev(giveDev(fixture(), 'p1', 'monopoly', 5), 'p1', 'knight', 5), 'p1', 'yearOfPlenty', 4)
    expect(err(s, { type: 'PLAY_MONOPOLY', resource: 'ore' })).toBe('CARD_BOUGHT_THIS_TURN')
    expect(err(s, { type: 'PLAY_ROAD_BUILDING' })).toBe('CARD_NOT_HELD')
    const t = act(s, { type: 'PLAY_YEAR_OF_PLENTY', take: ['ore', 'ore'] })
    expect(hand(t, 'p1').ore).toBe(2)
    expect(err(t, { type: 'PLAY_MONOPOLY', resource: 'ore' })).toBe('DEV_ALREADY_PLAYED')
    // next round, the turn-5 cards become playable
    const later = structuredClone(t)
    later.turn = 9
    later.players[0].playedDevThisTurn = false
    expect(apply(later, 'p1', { type: 'PLAY_MONOPOLY', resource: 'ore' }).ok).toBe(true)
  })

  it('cards cannot be played on another player’s turn or during setup/discard', () => {
    const s = giveDev(fixture(), 'p2', 'knight')
    expect(err(s, { type: 'PLAY_KNIGHT' }, 'p2')).toBe('NOT_YOUR_TURN')
    expect(legalActions(s, 'p2')).toEqual([])
    const d = giveDev(fixture({ phase: { kind: 'discard', pending: { p2: 4 } } }), 'p1', 'knight')
    expect(err(d, { type: 'PLAY_KNIGHT' })).toBe('WRONG_PHASE')
  })

  it('Knight before the roll moves the robber, then returns to preRoll; the roll may then be a 7', () => {
    let s = giveDev(fixture({ phase: { kind: 'preRoll' }, buildings: [['0,-1,N', 'p2']], hands: { p2: { ore: 1 } } }), 'p1', 'knight')
    expect(legalActions(s, 'p1').map((a) => a.type)).toEqual(['ROLL', 'PLAY_KNIGHT'])
    s = act(s, { type: 'PLAY_KNIGHT' })
    expect(s.phase).toEqual({ kind: 'moveRobber', source: 'knight', resume: 'preRoll' })
    expect(err(s, { type: 'MOVE_ROBBER', tile: s.robber })).toBe('ROBBER_SAME_TILE')
    s = act(s, { type: 'MOVE_ROBBER', tile: '0,-1' })
    expect(s.phase).toEqual({ kind: 'preRoll' })
    expect(hand(s, 'p1').ore).toBe(1) // single candidate, auto-steal
    expect(player(s, 'p1').playedKnights).toBe(1)
    // force a 7 by searching an rng state: the robber moves a second time this turn
    const seven = findRng(s, 7)
    const r = act({ ...s, rngState: seven }, { type: 'ROLL' })
    expect(r.phase.kind === 'moveRobber' || r.phase.kind === 'discard').toBe(true)
    expect(r.phase.kind === 'moveRobber' && r.phase.source).toBe('seven')
  })

  it('Knight in actions resumes actions; a 3rd knight grants Largest Army', () => {
    let s = giveDev(fixture(), 'p1', 'knight')
    s.players[0].playedKnights = 2
    const [t, ev] = events(s, { type: 'PLAY_KNIGHT' })
    expect(ev).toContainEqual({ type: 'AWARD_CHANGED', award: 'largestArmy', from: null, to: 'p1' })
    expect(t.largestArmy).toBe('p1')
    s = act(t, { type: 'MOVE_ROBBER', tile: '1,1' })
    expect(s.phase).toEqual({ kind: 'actions' })
  })

  it('Road Building: two free roads, then back; ends early with one piece; not playable with no spot', () => {
    let s = giveDev(withRoadSpot(fixture()), 'p1', 'roadBuilding')
    s = act(s, { type: 'PLAY_ROAD_BUILDING' })
    expect(s.phase).toEqual({ kind: 'roadBuilding', remaining: 2, resume: 'actions' })
    expect(legalActions(s, 'p1').every((a) => a.type === 'BUILD_ROAD')).toBe(true)
    s = act(s, { type: 'BUILD_ROAD', edge: roadSpot(s) })
    expect(s.phase).toMatchObject({ remaining: 1 })
    expect(err(s, { type: 'END_TURN' })).toBe('WRONG_PHASE')
    s = act(s, { type: 'BUILD_ROAD', edge: roadSpot(s) })
    expect(s.phase).toEqual({ kind: 'actions' })
    expect(player(s, 'p1').pieces.roads).toBe(13)
    expect(hand(s, 'p1')).toMatchObject({ lumber: 0, brick: 0 })

    let one = giveDev(withRoadSpot(fixture({ phase: { kind: 'preRoll' } })), 'p1', 'roadBuilding')
    one.players[0].pieces.roads = 1
    one = act(one, { type: 'PLAY_ROAD_BUILDING' })
    expect(one.phase).toEqual({ kind: 'roadBuilding', remaining: 1, resume: 'preRoll' })
    one = act(one, { type: 'BUILD_ROAD', edge: roadSpot(one) })
    expect(one.phase).toEqual({ kind: 'preRoll' })

    const none = giveDev(fixture(), 'p1', 'roadBuilding') // no buildings → no legal road
    expect(err(none, { type: 'PLAY_ROAD_BUILDING' })).toBe('CARD_NOT_PLAYABLE')
    expect(player(none, 'p1').devCards).toHaveLength(1)
  })

  it('Year of Plenty: two cards, wrong length rejected, one card when the bank holds one', () => {
    const s = giveDev(fixture(), 'p1', 'yearOfPlenty')
    expect(err(s, { type: 'PLAY_YEAR_OF_PLENTY', take: ['ore'] })).toBe('CARD_NOT_PLAYABLE')
    expect(err(s, { type: 'PLAY_YEAR_OF_PLENTY', take: ['ore', 'ore', 'ore'] })).toBe('MALFORMED_ACTION')
    const low = structuredClone(s)
    for (const r of ['lumber', 'brick', 'wool', 'grain'] as const) { low.players[1].resources[r] += low.bank[r]; low.bank[r] = 0 }
    low.players[1].resources.ore += 18; low.bank.ore = 1
    expect(err(low, { type: 'PLAY_YEAR_OF_PLENTY', take: ['ore', 'ore'] })).toBe('CARD_NOT_PLAYABLE')
    const t = act(low, { type: 'PLAY_YEAR_OF_PLENTY', take: ['ore'] })
    expect(hand(t, 'p1').ore).toBe(1)
    const two = structuredClone(low); two.bank.ore = 2; two.players[1].resources.ore -= 1
    expect(err(two, { type: 'PLAY_YEAR_OF_PLENTY', take: ['ore', 'wool'] })).toBe('BANK_EMPTY')
    assertInvariants(t)
  })

  it('Monopoly takes every copy from all opponents', () => {
    const s = giveDev(fixture({ hands: { p1: { ore: 1 }, p2: { ore: 3 }, p3: { wool: 2 }, p4: { ore: 1 } } }), 'p1', 'monopoly')
    const [t, ev] = events(s, { type: 'PLAY_MONOPOLY', resource: 'ore' })
    expect(hand(t, 'p1').ore).toBe(5)
    expect(ev.at(-1)).toEqual({ type: 'MONOPOLY_RESOLVED', by: 'p1', resource: 'ore', taken: { p2: 3, p4: 1 } })
    expect(player(t, 'p1').devCards).toHaveLength(0)
    assertInvariants(t)
  })

  it('Victory Point cards are never playable', () => {
    const s = giveDev(fixture({ phase: { kind: 'preRoll' } }), 'p1', 'victoryPoint')
    expect(legalActions(s, 'p1')).toEqual([{ type: 'ROLL' }])
    expect(totalVP(s, 'p1')).toBe(1)
  })
})

/** Finds an rngState whose next ROLL gives `sum`. */
function findRng(s: GameState, sum: number): number {
  for (let st = 1; st < 10000; st++) {
    const r = apply({ ...s, rngState: st }, s.order[s.active], { type: 'ROLL' })
    if (r.ok && r.state.dice && r.state.dice[0] + r.state.dice[1] === sum) return st
  }
  throw new Error('no rng state found')
}

describe('G3.4 victory', () => {
  // 4 cities = 8 VP for p1, on spots far apart
  const CITIES = ['-1,-1,S', '-2,2,N', '1,1,N', '2,-2,S'] as const
  const eight = (extra: Parameters<typeof fixture>[0] = {}) =>
    fixture({ ...extra, buildings: [...CITIES.map((v) => [v, 'p1', 'city'] as [typeof v, PlayerId, 'city']), ...(extra.buildings ?? [])] })

  it('a 10th point on your own turn wins at once; GAME_WON reveals VP cards; nothing is legal after', () => {
    let s = giveDev(eight({ hands: { p1: { wool: 1, grain: 1, ore: 1 } } }), 'p1', 'victoryPoint')
    expect(totalVP(s, 'p1')).toBe(9)
    s.deck.unshift({ ...s.deck.splice(s.deck.findIndex((c) => c.type === 'victoryPoint'), 1)[0] })
    const [t, ev] = events(s, { type: 'BUY_DEV' })
    expect(t.phase).toEqual({ kind: 'gameOver', winner: 'p1' })
    const won = ev.at(-1) as Extract<GameEvent, { type: 'GAME_WON' }>
    expect(won).toMatchObject({ type: 'GAME_WON', by: 'p1', vpCards: { p1: 2, p2: 0, p3: 0, p4: 0 } })
    expect(won.totals.p1).toBe(10)
    for (const p of PLAYER_IDS) expect(legalActions(t, p)).toEqual([])
    expect(err(t, { type: 'END_TURN' })).toBe('GAME_OVER')
    // the redacted stream for an opponent still shows the GAME_WON reveal but not which card was bought
    const forP2 = eventsFor(ev, 'p2')
    expect(forP2.find((e) => e.type === 'DEV_BOUGHT')).toMatchObject({ card: null })
    expect(forP2.at(-1)).toEqual(won)
  })

  it('Largest Army via a Knight played before the roll wins in preRoll', () => {
    let s = giveDev(eight({ phase: { kind: 'preRoll' } }), 'p1', 'knight')
    s.players[0].playedKnights = 2
    s = act(s, { type: 'PLAY_KNIGHT' })
    expect(s.phase).toEqual({ kind: 'gameOver', winner: 'p1' })
  })

  it('a point gained off-turn wins only when that player’s turn starts', () => {
    // p2 reaches 10 (4 cities + 2 VP cards) while p1 is active: no win until p2's turn begins
    const s = fixture({ buildings: CITIES.map((v) => [v, 'p2', 'city'] as [typeof v, PlayerId, 'city']) })
    giveDev(s, 'p2', 'victoryPoint'); giveDev(s, 'p2', 'victoryPoint')
    expect(totalVP(s, 'p2')).toBe(10)
    expect(legalActions(s, 'p1').length).toBeGreaterThan(0) // the game goes on during p1's turn
    const [t, ev] = events(s, { type: 'END_TURN' })
    expect(ev.map((e) => e.type)).toEqual(['TURN_ENDED', 'TURN_STARTED', 'GAME_WON'])
    expect(t.phase).toEqual({ kind: 'gameOver', winner: 'p2' })
  })

  it('vpToWin setting is respected', () => {
    const at8 = (vpToWin: number) => {
      const s = eight({ hands: { p1: { grain: 4 } } })
      s.settings.vpToWin = vpToWin
      return act(s, { type: 'BANK_TRADE', give: 'grain', get: 'ore' }).phase.kind
    }
    expect(at8(8)).toBe('gameOver')
    expect(at8(10)).toBe('actions')
  })
})

/** Asserts that a view never contains secrets the viewer shouldn't see. */
function assertNoLeaks(s: GameState) {
  for (const viewer of [...PLAYER_IDS, 'spectator'] as const) {
    const v = viewFor(s, viewer) as unknown as Record<string, unknown>
    expect(v.rngState).toBeUndefined()
    expect(v.deck).toBeUndefined()
    if (s.phase.kind !== 'gameOver') expect((v.settings as { seed?: number }).seed).toBeUndefined()
    for (const p of v.players as { id: PlayerId; resources?: unknown; devCards?: unknown; totalVP?: unknown }[]) {
      const own = p.id === viewer
      if (!own) { expect(p.resources).toBeUndefined(); expect(p.devCards).toBeUndefined() }
      if (!own && s.phase.kind !== 'gameOver') expect(p.totalVP).toBeUndefined()
    }
  }
}

describe('G3.5 full games (random legal bot)', () => {
  // default 25 games; the full G3 run is `VITE_PLAYOUTS=1000 npm test -- g3`
  const N = Number(import.meta.env.VITE_PLAYOUTS ?? 25)
  it(`${N} bot games reach gameOver with invariants and no leaks in views`, () => {
    let finished = 0, capped = 0, turns = 0
    for (let g = 0; g < N; g++) {
      let k = 0, cards = 25
      const s = botGame(1000 + g, { check: (st) => {
        assertInvariants(st)
        assertAwards(st)
        // played cards leave the game: deck + hands never grows, and never drops below the played knights' complement
        if (devTotal(st) > cards || devTotal(st) + st.players.reduce((a, p) => a + p.playedKnights, 0) > 25) throw new Error('dev cards created')
        cards = devTotal(st)
        // the costlier checks on a sample of states (every one in the default run)
        if (N <= 25 || k % 10 === 0) { assertNoLeaks(st); assertLegalSubset(st) }
        k++
      } })
      assertNoLeaks(s)
      turns += s.turn
      if (s.phase.kind === 'gameOver') {
        finished++
        expect(totalVP(s, s.phase.winner)).toBeGreaterThanOrEqual(10)
        expect(s.order[s.active]).toBe(s.phase.winner)
      } else capped++
    }
    console.info(`[G3 playout] games=${N} finished=${finished} capped=${capped} avgTurns=${(turns / N).toFixed(0)}`)
    expect(finished + capped).toBe(N)
    expect(finished).toBeGreaterThan(0)
  }, 60_000 + N * 2_000)

  it('games with player trades keep every invariant', () => {
    // bot + trading: before ending a turn the active player proposes a 1-for-1 trade, every addressee
    // answers with its first legal response, and the proposer confirms the first acceptor
    const rng = createRng(4242)
    let completed = 0
    for (let g = 0; g < 5; g++) {
      let s = newGame(500 + g, { boardPreset: 'random' })
      const br = createRng(g + 1)
      while (s.phase.kind !== 'gameOver' && s.turn < 400) {
        const legal = legalActions(s, s.order[s.active])
        if (s.phase.kind === 'actions' && !s.trade && s.tradesProposedThisTurn === 0 && legal.some((a) => a.type === 'PROPOSE_TRADE') && rng.next() < 0.7) {
          s = act(s, concretize(s, s.order[s.active], { type: 'PROPOSE_TRADE' }))
          for (const p of s.trade!.to) s = act(s, legalActions(s, p)[0] as Action, p)
          const c = legalActions(s, s.order[s.active]).find((a) => a.type === 'CONFIRM_TRADE')
          if (c) { const [t, ev] = events(s, c as Action, s.order[s.active]); s = t; if (ev.some((e) => e.type === 'TRADE_COMPLETED')) completed++ }
          assertInvariants(s)
          continue
        }
        const [p, a] = botMove(s, br)
        s = act(s, a, p)
        assertInvariants(s)
      }
    }
    expect(completed).toBeGreaterThan(20)
  }, 60_000)
})

describe('G3.6 golden replays', () => {
  const files = import.meta.glob('./golden/*.json', { eager: true, import: 'default' }) as Record<string, ReplayFile & { hash: string; finalTurn: number; winner: PlayerId | null }>

  it('there are golden files', () => {
    expect(Object.keys(files).length).toBeGreaterThanOrEqual(3)
  })

  for (const [name, file] of Object.entries(files)) {
    it(`${name} reproduces its stored hash`, () => {
      expect(file.engineVersion).toBe(ENGINE_VERSION)
      const r = replay(file)
      if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`)
      expect(r.state.turn).toBe(file.finalTurn)
      expect(r.state.phase.kind === 'gameOver' ? r.state.phase.winner : null).toBe(file.winner)
      expect(hashState(r.state)).toBe(file.hash)
    })
  }

  it('rejects a replay from another engine major or schema', () => {
    const f: ReplayFile = { schemaVersion: 1, engineVersion: '2.0.0', settings: { ...newGame(1).settings }, actions: [] }
    expect(replay(f)).toMatchObject({ ok: false, error: { code: 'MALFORMED_ACTION' } })
    expect(replay({ ...f, engineVersion: ENGINE_VERSION, schemaVersion: 2 as 1 })).toMatchObject({ ok: false })
    expect(replay({ ...f, engineVersion: ENGINE_VERSION }).ok).toBe(true)
  })

  it('an illegal action in a replay fails with its code', () => {
    const f: ReplayFile = { schemaVersion: 1, engineVersion: ENGINE_VERSION, settings: { ...newGame(1).settings }, actions: [{ player: 'p1', action: { type: 'ROLL' } }] }
    const r = replay(f)
    expect(r.ok).toBe(false)
  })
})
