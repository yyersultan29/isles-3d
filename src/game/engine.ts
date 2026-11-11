// Engine API (GAME_DESIGN.md §11): createGame, validate, apply, legalActions.
// Pure and deterministic: all randomness comes from state.rngState; inputs are never mutated.
//
// Implements the full base game: setup, dice and production, seven/discard/robber/steal,
// construction, trades, development cards, awards and victory.

import type { Action, ActionType, Check, DevCard, DevCardType, GameEvent, GameSettings, GameState, LegalAction, PlayerId, Result } from './types'
import { PLAYER_IDS, RESOURCE_ORDER } from './types'
import { RuleError, fail, type ErrorCode } from './errors'
import { createRng, shuffle } from './rng'
import { desertTile, generateBoard } from './board'
import { activeId, draft, emptyCounts, handSize, playerOf } from './state'
import { placeSetupRoad, placeSetupSettlement, setupRoadSpots, setupSettlementSpots } from './rules/setup'
import { endTurn, roll } from './rules/turn'
import { COSTS, buildCity, buildRoad, buildSettlement, canAfford, legalCities, legalRoads, legalSettlements } from './rules/build'
import { discard, discardWaitingFor, moveRobber, robberTargets, steal } from './rules/robber'
import { MAX_PROPOSALS_PER_TURN, bankTrade, cancel, confirm, propose, respond, responders, tradeRate } from './rules/trade'
import { afterFreeRoad, buyDev, canPlayType, playKnight, playMonopoly, playRoadBuilding, playYearOfPlenty } from './rules/devcards'
import { checkVictory } from './rules/victory'

export const DEFAULT_SETTINGS: Omit<GameSettings, 'seed'> = {
  vpToWin: 10,
  discardLimit: 7,
  friendlyRobber: false,
  boardPreset: 'standard-fixed',
}

const DECK_COMPOSITION: [DevCardType, number][] = [['knight', 14], ['roadBuilding', 2], ['yearOfPlenty', 2], ['monopoly', 2], ['victoryPoint', 5]]

const err = (code: ErrorCode, message: string) => ({ ok: false as const, error: { code, message } })
const isInt = (n: unknown, lo: number, hi: number) => typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi

function checkSettings(s: Partial<GameSettings>): string | null {
  if (!isInt(s.vpToWin, 3, 20)) return 'vpToWin must be an integer 3–20'
  if (!isInt(s.discardLimit, 2, 20)) return 'discardLimit must be an integer 2–20'
  if (!isInt(s.seed, 0, 0xffffffff)) return 'seed must be an integer 0–2^32−1'
  if (typeof s.friendlyRobber !== 'boolean') return 'friendlyRobber must be a boolean'
  if (s.boardPreset !== 'standard-fixed' && s.boardPreset !== 'random') return 'unknown boardPreset'
  return null
}

/**
 * New game in setup. RNG consumption order (§11): board (random preset only), seating order, dev deck.
 * Pass a full GameSettings or `{ seed }` plus overrides; missing fields take DEFAULT_SETTINGS.
 */
export function createGame(input: Partial<GameSettings> & { seed: number }): Result {
  const settings = { ...DEFAULT_SETTINGS, ...input } as GameSettings
  const bad = checkSettings(settings)
  if (bad) return err('INVALID_SETTINGS', bad)

  const rng = createRng(settings.seed)
  const board = generateBoard(rng, settings.boardPreset)
  const order = shuffle(rng, PLAYER_IDS)
  let id = 0
  const sorted: DevCard[] = DECK_COMPOSITION.flatMap(([type, n]) => Array.from({ length: n }, () => ({ id: id++, type, boughtOnTurn: -1 })))
  const deck = shuffle(rng, sorted)

  const state: GameState = {
    schemaVersion: 1,
    settings,
    board,
    rngState: rng.state,
    players: PLAYER_IDS.map((pid) => ({
      id: pid,
      resources: emptyCounts(),
      devCards: [],
      playedKnights: 0,
      playedDevThisTurn: false,
      pieces: { roads: 15, settlements: 5, cities: 4 },
    })),
    order,
    active: 0,
    turn: 0,
    phase: { kind: 'setup', round: 1, step: 'settlement' },
    dice: null,
    buildings: {},
    roads: {},
    robber: desertTile(board),
    bank: emptyCounts(19),
    deck,
    longestRoad: null,
    largestArmy: null,
    trade: null,
    tradesProposedThisTurn: 0,
    actionCount: 0,
  }
  return { ok: true, state, events: [{ type: 'GAME_STARTED', order }] }
}

// ---------------------------------------------------------------- schema

const ID = /^-?\d+,-?\d+$/
const VID = /^-?\d+,-?\d+,[NS]$/
const EID = /^-?\d+,-?\d+,(NE|NW|W)$/
const isCounts = (c: unknown) =>
  !!c && typeof c === 'object' && Object.entries(c as object).every(([k, v]) => (RESOURCE_ORDER as string[]).includes(k) && isInt(v, 0, 19))
const isRes = (r: unknown) => (RESOURCE_ORDER as unknown[]).includes(r)
const isPlayer = (p: unknown) => (PLAYER_IDS as unknown[]).includes(p)

/** Shape check only; game rules are checked later. Returns an error message or null. */
function schemaError(a: unknown): string | null {
  if (!a || typeof a !== 'object' || typeof (a as { type?: unknown }).type !== 'string') return 'action must be an object with a type'
  const x = a as Record<string, unknown>
  switch (x.type as ActionType) {
    case 'PLACE_SETTLEMENT': case 'BUILD_SETTLEMENT': case 'BUILD_CITY':
      return typeof x.vertex === 'string' && VID.test(x.vertex) ? null : 'vertex must be a vertex ID'
    case 'PLACE_ROAD': case 'BUILD_ROAD':
      return typeof x.edge === 'string' && EID.test(x.edge) ? null : 'edge must be an edge ID'
    case 'MOVE_ROBBER':
      return typeof x.tile === 'string' && ID.test(x.tile) ? null : 'tile must be a tile ID'
    case 'STEAL':
      return isPlayer(x.victim) ? null : 'victim must be a player ID'
    case 'DISCARD':
      return isCounts(x.cards) ? null : 'cards must be resource counts'
    case 'PLAY_YEAR_OF_PLENTY':
      return Array.isArray(x.take) && x.take.length >= 1 && x.take.length <= 2 && x.take.every(isRes) ? null : 'take must be 1–2 resources'
    case 'PLAY_MONOPOLY':
      return isRes(x.resource) ? null : 'resource must be a resource'
    case 'BANK_TRADE':
      return isRes(x.give) && isRes(x.get) && (x.count === undefined || isInt(x.count, 1, 19)) ? null : 'bad bank trade'
    case 'PROPOSE_TRADE':
      return isCounts(x.offer) && isCounts(x.request) && (x.to === undefined || (Array.isArray(x.to) && x.to.every(isPlayer))) ? null : 'bad trade proposal'
    case 'RESPOND_TRADE':
      return isInt(x.tradeId, 0, Number.MAX_SAFE_INTEGER) && typeof x.accept === 'boolean' ? null : 'bad trade response'
    case 'CONFIRM_TRADE':
      return isInt(x.tradeId, 0, Number.MAX_SAFE_INTEGER) && isPlayer(x.with) ? null : 'bad trade confirmation'
    case 'ROLL': case 'BUY_DEV': case 'PLAY_KNIGHT': case 'PLAY_ROAD_BUILDING': case 'CANCEL_TRADE': case 'END_TURN':
      return null
    default:
      return `unknown action type ${String(x.type)}`
  }
}

// ---------------------------------------------------------------- dispatch

const DEV_PLAYS: ActionType[] = ['PLAY_KNIGHT', 'PLAY_ROAD_BUILDING', 'PLAY_YEAR_OF_PLENTY', 'PLAY_MONOPOLY']

/** Which action types each phase accepts (§4.1 who-may-act table). */
function allowedInPhase(s: GameState): ActionType[] {
  switch (s.phase.kind) {
    case 'setup': return s.phase.step === 'settlement' ? ['PLACE_SETTLEMENT'] : ['PLACE_ROAD']
    case 'preRoll': return ['ROLL', ...DEV_PLAYS]
    case 'discard': return ['DISCARD']
    case 'moveRobber': return ['MOVE_ROBBER']
    case 'steal': return ['STEAL']
    case 'actions': return ['BUILD_ROAD', 'BUILD_SETTLEMENT', 'BUILD_CITY', 'BUY_DEV', ...DEV_PLAYS, 'BANK_TRADE', 'PROPOSE_TRADE', 'RESPOND_TRADE', 'CONFIRM_TRADE', 'CANCEL_TRADE', 'END_TURN']
    case 'roadBuilding': return ['BUILD_ROAD']
    default: return []
  }
}

/** Who the current phase is waiting for. */
const waitingFor = (s: GameState): PlayerId[] => (s.phase.kind === 'discard' ? discardWaitingFor(s) : [activeId(s)])

/** Validates and performs `action` on a draft. Throws RuleError on the first failed check. */
function step(state: GameState, player: PlayerId, action: Action): { state: GameState; events: GameEvent[] } {
  // order: schema → game over → actor/phase → target → resources (§19)
  const shape = schemaError(action)
  if (shape) fail('MALFORMED_ACTION', shape)
  if (!isPlayer(player)) fail('MALFORMED_ACTION', `unknown player ${String(player)}`)
  if (state.phase.kind === 'gameOver') fail('GAME_OVER', 'the game has ended')
  if (!allowedInPhase(state).includes(action.type)) fail('WRONG_PHASE', `${action.type} is not legal in ${state.phase.kind}`)
  // RESPOND_TRADE is the one action a non-active player takes in `actions`; respond() checks the addressee
  if (action.type === 'RESPOND_TRADE') {
    if (player === activeId(state)) fail('NOT_ADDRESSED', "the proposer can't respond to their own trade")
  } else if (!waitingFor(state).includes(player)) fail('NOT_YOUR_TURN', `waiting for ${waitingFor(state).join(', ')}`)

  const s = draft(state)
  const rng = createRng(state.rngState)
  const events: GameEvent[] = []
  switch (action.type) {
    case 'PLACE_SETTLEMENT': placeSetupSettlement(s, player, action.vertex, events); break
    case 'PLACE_ROAD': placeSetupRoad(s, player, action.edge, events); break
    case 'ROLL': roll(s, player, rng, events); break
    case 'DISCARD': discard(s, player, action.cards, events); break
    case 'MOVE_ROBBER': moveRobber(s, player, action.tile, rng, events); break
    case 'STEAL': steal(s, player, action.victim, rng, events); break
    case 'BUILD_ROAD':
      if (s.phase.kind === 'roadBuilding') { buildRoad(s, player, action.edge, true, events); afterFreeRoad(s, player) }
      else buildRoad(s, player, action.edge, false, events)
      break
    case 'BUY_DEV': buyDev(s, player, events); break
    case 'PLAY_KNIGHT': playKnight(s, player, events); break
    case 'PLAY_ROAD_BUILDING': playRoadBuilding(s, player, events); break
    case 'PLAY_YEAR_OF_PLENTY': playYearOfPlenty(s, player, action.take, events); break
    case 'PLAY_MONOPOLY': playMonopoly(s, player, action.resource, events); break
    case 'BANK_TRADE': bankTrade(s, player, action.give, action.get, action.count ?? 1, events); break
    case 'PROPOSE_TRADE': propose(s, player, action.offer, action.request, action.to, events); break
    case 'RESPOND_TRADE': respond(s, player, action.tradeId, action.accept, events); break
    case 'CONFIRM_TRADE': confirm(s, player, action.tradeId, action.with, events); break
    case 'CANCEL_TRADE': cancel(s, events); break
    case 'BUILD_SETTLEMENT': buildSettlement(s, player, action.vertex, events); break
    case 'BUILD_CITY': buildCity(s, player, action.vertex, events); break
    case 'END_TURN': endTurn(s, player, events); break
    default: { const never: never = action; throw new Error(`unhandled action ${JSON.stringify(never)}`) }
  }
  checkVictory(s, events)
  s.rngState = rng.state
  s.actionCount += 1
  return { state: s, events }
}

function wrap<T>(f: () => T): T | { ok: false; error: { code: ErrorCode; message: string } } {
  try {
    return f()
  } catch (e) {
    if (e instanceof RuleError) return err(e.code, e.message)
    throw e // a bug, not bad input
  }
}

/** Never throws on bad input; the input state is never mutated. */
export function apply(state: GameState, player: PlayerId, action: Action): Result {
  return wrap(() => ({ ok: true as const, ...step(state, player, action) }))
}

export function validate(state: GameState, player: PlayerId, action: Action): Check {
  const r = apply(state, player, action)
  return r.ok ? { ok: true } : r
}

/** Every concrete legal action for `player` (§11). Contract: each one passes validate. */
export function legalActions(s: GameState, player: PlayerId): LegalAction[] {
  if (s.phase.kind === 'gameOver') return []
  if (s.phase.kind === 'actions' && player !== activeId(s)) {
    if (!responders(s).includes(player) || !s.trade) return []
    const t = s.trade
    const canPay = RESOURCE_ORDER.every((r) => playerOf(s, player).resources[r] >= (t.request[r] ?? 0))
    return [...(canPay ? [{ type: 'RESPOND_TRADE' as const, tradeId: t.id, accept: true }] : []), { type: 'RESPOND_TRADE' as const, tradeId: t.id, accept: false }]
  }
  if (!waitingFor(s).includes(player)) return []
  switch (s.phase.kind) {
    case 'setup':
      return s.phase.step === 'settlement'
        ? setupSettlementSpots(s).map((vertex) => ({ type: 'PLACE_SETTLEMENT' as const, vertex }))
        : setupRoadSpots(s).map((edge) => ({ type: 'PLACE_ROAD' as const, edge }))
    case 'preRoll': return [{ type: 'ROLL' }, ...devPlays(s, player)]
    case 'discard': return [{ type: 'DISCARD', count: s.phase.pending[player]! }]
    case 'moveRobber': return robberTargets(s, player).map((tile) => ({ type: 'MOVE_ROBBER' as const, tile }))
    case 'steal': return s.phase.candidates.map((victim) => ({ type: 'STEAL' as const, victim }))
    case 'actions': return [
      ...legalRoads(s, player, false).map((edge) => ({ type: 'BUILD_ROAD' as const, edge })),
      ...legalSettlements(s, player).map((vertex) => ({ type: 'BUILD_SETTLEMENT' as const, vertex })),
      ...legalCities(s, player).map((vertex) => ({ type: 'BUILD_CITY' as const, vertex })),
      ...(s.deck.length && canAfford(s, player, COSTS.dev) ? [{ type: 'BUY_DEV' as const }] : []),
      ...devPlays(s, player),
      ...bankTrades(s, player),
      ...(s.tradesProposedThisTurn < MAX_PROPOSALS_PER_TURN && handSize(playerOf(s, player).resources) > 0 ? [{ type: 'PROPOSE_TRADE' as const }] : []),
      ...(s.trade ? [
        ...s.trade.to.filter((p) => s.trade!.responses[p] === 'accept').map((w) => ({ type: 'CONFIRM_TRADE' as const, tradeId: s.trade!.id, with: w })),
        { type: 'CANCEL_TRADE' as const },
      ] : []),
      { type: 'END_TURN' },
    ]
    case 'roadBuilding': return legalRoads(s, player, true).map((edge) => ({ type: 'BUILD_ROAD' as const, edge }))
    default: return []
  }
}

function devPlays(s: GameState, p: PlayerId): LegalAction[] {
  const out: LegalAction[] = []
  if (canPlayType(s, p, 'knight')) out.push({ type: 'PLAY_KNIGHT' })
  if (canPlayType(s, p, 'roadBuilding') && playerOf(s, p).pieces.roads > 0 && legalRoads(s, p, true).length) out.push({ type: 'PLAY_ROAD_BUILDING' })
  if (canPlayType(s, p, 'yearOfPlenty')) {
    const total = RESOURCE_ORDER.reduce((a, r) => a + s.bank[r], 0)
    if (total === 1) out.push({ type: 'PLAY_YEAR_OF_PLENTY', take: [RESOURCE_ORDER.find((r) => s.bank[r] > 0)!] })
    else if (total > 1)
      RESOURCE_ORDER.forEach((a, i) => RESOURCE_ORDER.slice(i).forEach((b) => {
        if (a === b ? s.bank[a] >= 2 : s.bank[a] >= 1 && s.bank[b] >= 1) out.push({ type: 'PLAY_YEAR_OF_PLENTY', take: [a, b] })
      }))
  }
  if (canPlayType(s, p, 'monopoly')) for (const resource of RESOURCE_ORDER) out.push({ type: 'PLAY_MONOPOLY', resource })
  return out
}

function bankTrades(s: GameState, p: PlayerId): LegalAction[] {
  const out: LegalAction[] = []
  const hand = playerOf(s, p).resources
  for (const give of RESOURCE_ORDER) {
    if (hand[give] < tradeRate(s, p, give)) continue
    for (const get of RESOURCE_ORDER) if (get !== give && s.bank[get] > 0) out.push({ type: 'BANK_TRADE', give, get })
  }
  return out
}
