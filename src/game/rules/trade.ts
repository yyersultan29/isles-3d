// Trading (GAME_DESIGN.md §9): bank and ports, player-to-player proposals.

import type { GameEvent, GameState, PlayerId, Resource, ResourceCounts } from '../types'
import { RESOURCE_ORDER } from '../types'
import { fail } from '../errors'
import { activeId, playerOf } from '../state'

/** Best rate for giving `res`: 2 with a matching port, 3 with a generic port, else 4 (settlement or city). */
export function tradeRate(s: GameState, p: PlayerId, res: Resource): 2 | 3 | 4 {
  let rate: 2 | 3 | 4 = 4
  for (const port of s.board.ports) {
    if (!port.vertices.some((v) => s.buildings[v]?.owner === p)) continue
    if (port.kind === res) return 2
    if (port.kind === 'generic') rate = 3
  }
  return rate
}

/** Any action by the active player that changes their hand cancels the open proposal. */
export function cancelOnHandChange(s: GameState, events: GameEvent[]) {
  if (!s.trade) return
  events.push({ type: 'TRADE_CANCELLED', tradeId: s.trade.id, reason: 'handChanged' })
  s.trade = null
}

export function bankTrade(s: GameState, p: PlayerId, give: Resource, get: Resource, count: number, events: GameEvent[]) {
  if (give === get) fail('INVALID_TRADE', 'give and get must differ')
  const rate = tradeRate(s, p, give)
  const cost = rate * count
  const pl = playerOf(s, p)
  if (pl.resources[give] < cost) fail('INSUFFICIENT_RESOURCES', `needs ${cost} ${give} at ${rate}:1`)
  if (s.bank[get] < count) fail('BANK_EMPTY', `the bank has only ${s.bank[get]} ${get}`)
  pl.resources[give] -= cost
  s.bank[give] += cost
  s.bank[get] -= count
  pl.resources[get] += count
  events.push({ type: 'BANK_TRADED', by: p, gave: { [give]: cost }, got: { [get]: count } })
  cancelOnHandChange(s, events)
}

const holds = (s: GameState, p: PlayerId, c: Partial<ResourceCounts>) => RESOURCE_ORDER.every((r) => playerOf(s, p).resources[r] >= (c[r] ?? 0))
const clean = (c: Partial<ResourceCounts>) => {
  const out: Partial<ResourceCounts> = {}
  for (const r of RESOURCE_ORDER) if (c[r]) out[r] = c[r]
  return out
}

export const MAX_PROPOSALS_PER_TURN = 20

export function propose(s: GameState, p: PlayerId, offer: Partial<ResourceCounts>, request: Partial<ResourceCounts>, to: PlayerId[] | undefined, events: GameEvent[]) {
  const o = clean(offer), q = clean(request)
  if (!Object.keys(o).length || !Object.keys(q).length) fail('INVALID_TRADE', 'both sides must be non-empty (no gifts)')
  if (RESOURCE_ORDER.some((r) => o[r] && q[r])) fail('INVALID_TRADE', 'the same resource can’t be on both sides')
  const opponents = s.order.filter((x) => x !== p)
  const recipients = to ? [...new Set(to)] : opponents
  if (!recipients.length || recipients.some((x) => !opponents.includes(x))) fail('INVALID_TRADE', 'recipients must be opponents')
  if (s.tradesProposedThisTurn >= MAX_PROPOSALS_PER_TURN) fail('TRADE_LIMIT', `at most ${MAX_PROPOSALS_PER_TURN} proposals per turn`)
  if (!holds(s, p, o)) fail('INSUFFICIENT_RESOURCES', 'you must hold the whole offer')
  if (s.trade) events.push({ type: 'TRADE_CANCELLED', tradeId: s.trade.id, reason: 'replaced' })
  s.trade = { id: s.actionCount, from: p, offer: o, request: q, to: recipients.sort((a, b) => s.order.indexOf(a) - s.order.indexOf(b)), responses: {} }
  s.tradesProposedThisTurn += 1
  events.push({ type: 'TRADE_PROPOSED', trade: structuredClone(s.trade) })
}

export function openTrade(s: GameState, tradeId: number) {
  if (!s.trade || s.trade.id !== tradeId) fail('NO_OPEN_TRADE', `no open trade ${tradeId}`)
  return s.trade
}

export function respond(s: GameState, p: PlayerId, tradeId: number, accept: boolean, events: GameEvent[]) {
  const t = openTrade(s, tradeId)
  if (!t.to.includes(p)) fail('NOT_ADDRESSED', `${p} isn't addressed by this trade`)
  if (accept && !holds(s, p, t.request)) fail('INSUFFICIENT_RESOURCES', 'you must hold what is requested to accept')
  t.responses[p] = accept ? 'accept' : 'reject'
  events.push({ type: 'TRADE_RESPONDED', tradeId, player: p, accept })
}

export function confirm(s: GameState, p: PlayerId, tradeId: number, withP: PlayerId, events: GameEvent[]) {
  const t = openTrade(s, tradeId)
  if (t.responses[withP] !== 'accept') fail('TRADE_NOT_ACCEPTED', `${withP} hasn't accepted`)
  if (!holds(s, p, t.offer) || !holds(s, withP, t.request)) fail('TRADE_STALE', 'a hand no longer covers its side')
  const a = playerOf(s, p).resources, b = playerOf(s, withP).resources
  for (const r of RESOURCE_ORDER) {
    const give = t.offer[r] ?? 0, get = t.request[r] ?? 0
    a[r] += get - give
    b[r] += give - get
  }
  events.push({ type: 'TRADE_COMPLETED', tradeId, from: p, with: withP, gave: t.offer, got: t.request })
  s.trade = null
}

export function cancel(s: GameState, events: GameEvent[]) {
  if (!s.trade) fail('NO_OPEN_TRADE', 'there is no open trade')
  events.push({ type: 'TRADE_CANCELLED', tradeId: s.trade.id, reason: 'cancelled' })
  s.trade = null
}

/** Players addressed by the open trade who may respond now (not the active player). */
export const responders = (s: GameState): PlayerId[] => (s.phase.kind === 'actions' && s.trade ? s.trade.to.filter((p) => p !== activeId(s)) : [])
