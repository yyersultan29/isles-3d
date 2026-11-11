// Test helpers: deterministic setup playouts and invariants.
import { apply, createGame, legalActions } from '../engine'
import type { Action, GameState, LegalAction, PlayerId, Resource, Result } from '../types'
import { RESOURCE_ORDER } from '../types'
import { activeId } from '../state'
import { createRng, pick, type Rng } from '../rng'

export function newGame(seed = 1, extra: Partial<Parameters<typeof createGame>[0]> = {}): GameState {
  const r = createGame({ seed, ...extra })
  if (!r.ok) throw new Error(r.error.message)
  return r.state
}

export function must(r: Result): Extract<Result, { ok: true }> {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`)
  return r
}

export const act = (s: GameState, a: Action, p: PlayerId = activeId(s)) => must(apply(s, p, a)).state

/** Plays the whole setup with legal moves chosen by a separate seeded RNG. */
export function playSetup(s: GameState, choiceSeed = 99): GameState {
  const rng = createRng(choiceSeed)
  while (s.phase.kind === 'setup') {
    const legal = legalActions(s, activeId(s)) as Action[]
    s = act(s, legal[pick(rng, legal.length)])
  }
  return s
}

/** Resource conservation and non-negativity (§5, §13). */
export function assertInvariants(s: GameState) {
  for (const r of RESOURCE_ORDER) {
    const total = s.bank[r] + s.players.reduce((a, p) => a + p.resources[r], 0)
    if (total !== 19) throw new Error(`conservation broken for ${r}: ${total}`)
    if (s.bank[r] < 0 || s.players.some((p) => p.resources[r] < 0)) throw new Error(`negative ${r}`)
  }
  for (const p of s.players) {
    const onBoardS = Object.values(s.buildings).filter((b) => b?.owner === p.id && b.type === 'settlement').length
    const onBoardC = Object.values(s.buildings).filter((b) => b?.owner === p.id && b.type === 'city').length
    const onBoardR = Object.values(s.roads).filter((o) => o === p.id).length
    if (onBoardS + p.pieces.settlements !== 5) throw new Error(`settlement pieces broken for ${p.id}`)
    if (onBoardC + p.pieces.cities !== 4) throw new Error(`city pieces broken for ${p.id}`)
    if (onBoardR + p.pieces.roads !== 15) throw new Error(`road pieces broken for ${p.id}`)
  }
}

/** Recursively freezes a value so any accidental mutation of an engine input throws in tests. */
export function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    for (const v of Object.values(o as object)) deepFreeze(v)
  }
  return o
}

/** Players the game is waiting for right now (the active player, or everyone who owes a discard). */
export function waiting(s: GameState): PlayerId[] {
  if (s.phase.kind === 'discard') return s.order.filter((p) => (s.phase as { pending: Partial<Record<PlayerId, number>> }).pending[p])
  return s.phase.kind === 'gameOver' ? [] : [activeId(s)]
}

/** Turns a legal-action marker into a concrete action: DISCARD takes cards in canonical order (or randomly with rng). */
export function concretize(s: GameState, p: PlayerId, a: LegalAction, rng?: Rng): Action {
  if (a.type === 'DISCARD' && 'count' in a) {
    const hand = { ...s.players.find((x) => x.id === p)!.resources }
    const cards: Partial<Record<Resource, number>> = {}
    for (let k = 0; k < a.count; k++) {
      const avail = RESOURCE_ORDER.filter((r) => hand[r] > 0)
      const r = rng ? avail[pick(rng, avail.length)] : avail[0]
      hand[r] -= 1
      cards[r] = (cards[r] ?? 0) + 1
    }
    return { type: 'DISCARD', cards }
  }
  return a as Action
}

/** Resolves discard / robber / steal with the first legal choice; optionally records [player, action]. */
export function resolvePending(s: GameState, log?: [PlayerId, Action][]): GameState {
  while (s.phase.kind === 'discard' || s.phase.kind === 'moveRobber' || s.phase.kind === 'steal') {
    const p = waiting(s)[0]
    const a = concretize(s, p, legalActions(s, p)[0])
    log?.push([p, a])
    s = act(s, a, p)
  }
  return s
}

/** ROLL, resolve any seven, END_TURN. */
export function playTurn(s: GameState, log?: [PlayerId, Action][]): GameState {
  for (const a of [{ type: 'ROLL' }] as Action[]) { log?.push([activeId(s), a]); s = act(s, a) }
  s = resolvePending(s, log)
  if (s.phase.kind !== 'actions') return s
  log?.push([activeId(s), { type: 'END_TURN' }])
  return act(s, { type: 'END_TURN' })
}
