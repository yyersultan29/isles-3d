// Seven, discards, robber and steal (GAME_DESIGN.md §6), including Friendly Robber and the D14 fallback.

import type { GameEvent, GameState, PlayerId, Resource, ResourceCounts, Resume, TileId } from '../types'
import { RESOURCE_ORDER } from '../types'
import { fail } from '../errors'
import { pick, type Rng } from '../rng'
import { activeId, handSize, playerOf, publicVP } from '../state'
import { cancelOnHandChange } from './trade'

/** After a 7: who must discard how many (fixed at roll time). */
export function discardsOwed(s: GameState): Partial<Record<PlayerId, number>> {
  const pending: Partial<Record<PlayerId, number>> = {}
  for (const id of s.order) {
    const n = handSize(playerOf(s, id).resources)
    if (n > s.settings.discardLimit) pending[id] = Math.floor(n / 2)
  }
  return pending
}

export function startSeven(s: GameState, events: GameEvent[]) {
  const pending = discardsOwed(s)
  if (Object.keys(pending).length) {
    events.push({ type: 'DISCARD_REQUIRED', pending })
    s.phase = { kind: 'discard', pending }
  } else s.phase = { kind: 'moveRobber', source: 'seven', resume: 'actions' }
}

export function discard(s: GameState, p: PlayerId, cards: Partial<ResourceCounts>, events: GameEvent[]) {
  if (s.phase.kind !== 'discard') throw new Error('invariant: not discarding')
  const owed = s.phase.pending[p]
  if (!owed) fail('INVALID_DISCARD', `${p} owes no discard`)
  const pl = playerOf(s, p)
  let total = 0
  for (const r of RESOURCE_ORDER) {
    const n = cards[r] ?? 0
    if (n > pl.resources[r]) fail('INVALID_DISCARD', `${p} doesn't hold ${n} ${r}`)
    total += n
  }
  if (total !== owed) fail('INVALID_DISCARD', `must discard exactly ${owed}, got ${total}`)
  for (const r of RESOURCE_ORDER) {
    const n = cards[r] ?? 0
    pl.resources[r] -= n
    s.bank[r] += n
  }
  const clean: Partial<ResourceCounts> = {}
  for (const r of RESOURCE_ORDER) if (cards[r]) clean[r] = cards[r]
  events.push({ type: 'DISCARDED', player: p, cards: clean })
  delete s.phase.pending[p]
  if (Object.keys(s.phase.pending).length === 0) s.phase = { kind: 'moveRobber', source: 'seven', resume: 'actions' }
}

/** Friendly Robber: players with fewer than 3 public VP can't be blocked or robbed. */
const isProtected = (s: GameState, victim: PlayerId) => s.settings.friendlyRobber && publicVP(s, victim) < 3

const ownersOn = (s: GameState, tile: TileId): PlayerId[] => {
  const out: PlayerId[] = []
  for (const v of s.board.topo.tileVertices[tile]) {
    const b = s.buildings[v]
    if (b && !out.includes(b.owner)) out.push(b.owner)
  }
  return out
}

/** Legal robber destinations for `mover` (§6). D14: if none, the current tile is the only target. */
export function robberTargets(s: GameState, mover: PlayerId): TileId[] {
  const ok = s.board.topo.tiles.filter((t) => {
    if (t === s.robber) return false
    if (s.board.tiles[t].terrain === 'desert') return true
    return !ownersOn(s, t).some((o) => o !== mover && isProtected(s, o))
  })
  return ok.length ? ok : [s.robber]
}

export function stealCandidates(s: GameState, mover: PlayerId, tile: TileId): PlayerId[] {
  return ownersOn(s, tile)
    .filter((o) => o !== mover && handSize(playerOf(s, o).resources) > 0 && !isProtected(s, o))
    .sort((a, b) => s.order.indexOf(a) - s.order.indexOf(b))
}

function finish(s: GameState, resume: Resume) {
  s.phase = resume === 'preRoll' ? { kind: 'preRoll' } : { kind: 'actions' }
}

export function moveRobber(s: GameState, p: PlayerId, tile: TileId, rng: Rng, events: GameEvent[]) {
  if (s.phase.kind !== 'moveRobber') throw new Error('invariant: not moving the robber')
  const resume = s.phase.resume
  if (!s.board.tiles[tile]) fail('UNKNOWN_LOCATION', `no tile ${tile}`)
  const targets = robberTargets(s, p)
  if (!targets.includes(tile)) {
    if (tile === s.robber) fail('ROBBER_SAME_TILE', 'the robber must move to a different tile')
    fail('ROBBER_PROTECTED', 'Friendly Robber protects that tile')
  }
  const from = s.robber
  s.robber = tile
  events.push({ type: 'ROBBER_MOVED', by: p, from, to: tile })
  if (tile === from) return finish(s, resume) // D14 fallback: no steal
  const candidates = stealCandidates(s, p, tile)
  if (candidates.length === 0) return finish(s, resume)
  if (candidates.length === 1) { stealFrom(s, p, candidates[0], rng, events); return finish(s, resume) }
  s.phase = { kind: 'steal', tile, candidates, resume }
}

export function steal(s: GameState, p: PlayerId, victim: PlayerId, rng: Rng, events: GameEvent[]) {
  if (s.phase.kind !== 'steal') throw new Error('invariant: not stealing')
  if (!s.phase.candidates.includes(victim)) fail('INVALID_VICTIM', `${victim} can't be robbed here`)
  const resume = s.phase.resume
  stealFrom(s, p, victim, rng, events)
  finish(s, resume)
}

/** Random card weighted by count: lay the hand out in canonical order, take card floor(rng·size). */
function stealFrom(s: GameState, thief: PlayerId, victim: PlayerId, rng: Rng, events: GameEvent[]) {
  const hand = playerOf(s, victim).resources
  let i = pick(rng, handSize(hand))
  let res: Resource = RESOURCE_ORDER[0]
  for (const r of RESOURCE_ORDER) {
    if (i < hand[r]) { res = r; break }
    i -= hand[r]
  }
  hand[res] -= 1
  playerOf(s, thief).resources[res] += 1
  events.push({ type: 'CARD_STOLEN', from: victim, to: thief, resource: res })
  cancelOnHandChange(s, events)
}

/** Players the discard phase is waiting for. */
export const discardWaitingFor = (s: GameState): PlayerId[] =>
  s.phase.kind === 'discard' ? s.order.filter((p) => (s.phase as { pending: Partial<Record<PlayerId, number>> }).pending[p]) : [activeId(s)]
