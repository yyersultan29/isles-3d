// Test helpers: deterministic setup playouts and invariants.
import { apply, createGame, legalActions } from '../engine'
import type { Action, GameState, PlayerId, Result } from '../types'
import { RESOURCE_ORDER } from '../types'
import { activeId } from '../state'
import { createRng, pick } from '../rng'

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
