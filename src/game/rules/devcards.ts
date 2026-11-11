// Development cards (GAME_DESIGN.md §8): buy, play limits, effects.

import type { DevCardType, GameEvent, GameState, PlayerId, Resource, ResourceCounts, Resume } from '../types'
import { RESOURCE_ORDER } from '../types'
import { fail } from '../errors'
import { playerOf } from '../state'
import { COSTS, canAfford, legalRoads, pay } from './build'
import { updateLargestArmy } from './awards'
import { cancelOnHandChange } from './trade'

export function buyDev(s: GameState, p: PlayerId, events: GameEvent[]) {
  if (s.deck.length === 0) fail('DECK_EMPTY', 'the development deck is empty')
  if (!canAfford(s, p, COSTS.dev)) fail('INSUFFICIENT_RESOURCES', 'a development card costs wool + grain + ore')
  pay(s, p, COSTS.dev)
  const card = s.deck.shift()!
  card.boughtOnTurn = s.turn
  playerOf(s, p).devCards.push(card)
  events.push({ type: 'DEV_BOUGHT', by: p, card: card.type })
  cancelOnHandChange(s, events)
}

type Playable = Exclude<DevCardType, 'victoryPoint'>

/** Checks the one-card-per-turn and purchase-turn rules; returns the index of the card to play (oldest first). */
function playableIndex(s: GameState, p: PlayerId, type: Playable): number {
  const pl = playerOf(s, p)
  if (pl.playedDevThisTurn) fail('DEV_ALREADY_PLAYED', 'only one development card per turn')
  const held = pl.devCards.map((c, i) => [c, i] as const).filter(([c]) => c.type === type)
  if (!held.length) fail('CARD_NOT_HELD', `no ${type} card in hand`)
  const old = held.filter(([c]) => c.boughtOnTurn < s.turn).sort((a, b) => a[0].boughtOnTurn - b[0].boughtOnTurn || a[0].id - b[0].id)
  if (!old.length) fail('CARD_BOUGHT_THIS_TURN', "a card can't be played on the turn it was bought")
  return old[0][1]
}

function consume(s: GameState, p: PlayerId, index: number, type: Playable, events: GameEvent[]) {
  const pl = playerOf(s, p)
  pl.devCards.splice(index, 1) // played cards leave the game
  pl.playedDevThisTurn = true
  events.push({ type: 'DEV_PLAYED', by: p, card: type })
}

const resumeOf = (s: GameState): Resume => (s.phase.kind === 'preRoll' ? 'preRoll' : 'actions')

export function playKnight(s: GameState, p: PlayerId, events: GameEvent[]) {
  const i = playableIndex(s, p, 'knight')
  const resume = resumeOf(s)
  consume(s, p, i, 'knight', events)
  playerOf(s, p).playedKnights += 1
  updateLargestArmy(s, p, events) // before the robber moves
  s.phase = { kind: 'moveRobber', source: 'knight', resume }
}

export function playRoadBuilding(s: GameState, p: PlayerId, events: GameEvent[]) {
  const i = playableIndex(s, p, 'roadBuilding')
  const pieces = playerOf(s, p).pieces.roads
  if (pieces === 0 || legalRoads(s, p, true).length === 0) fail('CARD_NOT_PLAYABLE', 'no legal place for a free road')
  const resume = resumeOf(s)
  consume(s, p, i, 'roadBuilding', events)
  s.phase = { kind: 'roadBuilding', remaining: pieces >= 2 ? 2 : 1, resume }
}

/** After each free road: continue, or end early when no road or no legal edge remains. */
export function afterFreeRoad(s: GameState, p: PlayerId) {
  if (s.phase.kind !== 'roadBuilding') throw new Error('invariant: not road building')
  const { remaining, resume } = s.phase
  if (remaining === 2 && playerOf(s, p).pieces.roads > 0 && legalRoads(s, p, true).length > 0) s.phase = { kind: 'roadBuilding', remaining: 1, resume }
  else s.phase = resume === 'preRoll' ? { kind: 'preRoll' } : { kind: 'actions' }
}

export function playYearOfPlenty(s: GameState, p: PlayerId, take: Resource[], events: GameEvent[]) {
  const i = playableIndex(s, p, 'yearOfPlenty')
  const bankTotal = RESOURCE_ORDER.reduce((a, r) => a + s.bank[r], 0)
  if (bankTotal === 0) fail('CARD_NOT_PLAYABLE', 'the bank is empty')
  if (take.length !== Math.min(2, bankTotal)) fail('CARD_NOT_PLAYABLE', `take ${Math.min(2, bankTotal)} card(s)`)
  const want: Partial<ResourceCounts> = {}
  for (const r of take) want[r] = (want[r] ?? 0) + 1
  for (const r of RESOURCE_ORDER) if ((want[r] ?? 0) > s.bank[r]) fail('BANK_EMPTY', `the bank has only ${s.bank[r]} ${r}`)
  consume(s, p, i, 'yearOfPlenty', events)
  for (const r of RESOURCE_ORDER) {
    const n = want[r] ?? 0
    s.bank[r] -= n
    playerOf(s, p).resources[r] += n
  }
  events.push({ type: 'YEAR_OF_PLENTY_TAKEN', by: p, cards: want })
  cancelOnHandChange(s, events)
}

export function playMonopoly(s: GameState, p: PlayerId, res: Resource, events: GameEvent[]) {
  const i = playableIndex(s, p, 'monopoly')
  consume(s, p, i, 'monopoly', events)
  const taken: Partial<Record<PlayerId, number>> = {}
  const me = playerOf(s, p)
  for (const id of s.order) {
    if (id === p) continue
    const n = playerOf(s, id).resources[res]
    if (!n) continue
    playerOf(s, id).resources[res] = 0
    me.resources[res] += n
    taken[id] = n
  }
  events.push({ type: 'MONOPOLY_RESOLVED', by: p, resource: res, taken })
  cancelOnHandChange(s, events)
}

/** Whether a card of this type could be played now (ignoring effect-specific checks). */
export function canPlayType(s: GameState, p: PlayerId, type: Playable) {
  const pl = playerOf(s, p)
  return !pl.playedDevThisTurn && pl.devCards.some((c) => c.type === type && c.boughtOnTurn < s.turn)
}
