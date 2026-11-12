// Timers and absent players (ROADMAP G5.5, GAME_DESIGN §20). Pure: what the game is waiting for,
// how long it may take, and the ordinary action submitted for a player whose time ran out (or who
// is absent). The engine knows nothing of clocks; the Room applies these actions through `apply`
// like any other, so they are logged and replay deterministically. Random choices use a separate,
// non-game RNG, so a timeout never shifts the game's dice sequence.

import { legalActions, pips, RESOURCE_ORDER } from '../game'
import type { Action, GameState, PlayerId, Resource, TileId } from '../game'
import type { Rng } from '../game/rng'
import { pick } from '../game/rng'

import type { TimerPreset } from '../net/protocol'
export type { TimerPreset }
export const TIMER_PRESETS: readonly TimerPreset[] = ['relaxed', 'normal', 'fast', 'off']
const SCALE: Record<Exclude<TimerPreset, 'off'>, number> = { relaxed: 2, normal: 1, fast: 0.5 }

/** §20 limits at `normal`, in ms */
export const LIMITS = { placement: 60_000, roll: 15_000, discard: 30_000, robber: 30_000, actions: 90_000, perTrade: 15_000, actionsCap: 180_000 }

export type DecisionKind = 'placement' | 'roll' | 'discard' | 'robber' | 'actions'

/** The decision the game waits for: its kind and the seats that owe it (several only for discards). */
export interface Decision { kind: DecisionKind; seats: PlayerId[]; turn: number }

export function decisionOf(s: GameState): Decision | null {
  const active = s.order[s.active]
  switch (s.phase.kind) {
    case 'setup': case 'roadBuilding': return { kind: 'placement', seats: [active], turn: s.turn }
    case 'preRoll': return { kind: 'roll', seats: [active], turn: s.turn }
    case 'discard': { const p = s.phase.pending; return { kind: 'discard', seats: s.order.filter((x) => p[x]), turn: s.turn } }
    case 'moveRobber': case 'steal': return { kind: 'robber', seats: [active], turn: s.turn }
    case 'actions': return { kind: 'actions', seats: [active], turn: s.turn }
    case 'gameOver': return null
  }
}

/** The time a new decision gets, scaled by the preset; null with timers off. */
export function limitFor(kind: DecisionKind, preset: TimerPreset): number | null {
  if (preset === 'off') return null
  return LIMITS[kind] * SCALE[preset]
}

/** A completed trade buys the active player more time, up to the cap (§20). */
export function extendForTrade(started: number, deadline: number, preset: TimerPreset): number {
  if (preset === 'off') return deadline
  return Math.min(deadline + LIMITS.perTrade * SCALE[preset], started + LIMITS.actionsCap * SCALE[preset])
}

const tilePips = (s: GameState, t: TileId) => (t === s.robber ? 0 : pips(s.board.tiles[t].token))
const vertexPips = (s: GameState, v: string) => s.board.topo.vertexTiles[v as keyof typeof s.board.topo.vertexTiles].reduce((a, t) => a + pips(s.board.tiles[t].token), 0)

/** Public VP (never hidden cards): the leader is chosen on what everyone can see. */
function publicVP(s: GameState, p: PlayerId) {
  let vp = 0
  for (const b of Object.values(s.buildings)) if (b?.owner === p) vp += b.type === 'city' ? 2 : 1
  if (s.longestRoad === p) vp += 2
  if (s.largestArmy === p) vp += 2
  return vp
}

/**
 * The action submitted for `p` when its time is up (or it is absent). Always one of
 * `legalActions(s, p)`, or null when `p` owes nothing.
 */
export function timeoutAction(s: GameState, p: PlayerId, rng: Rng): Action | null {
  const legal = legalActions(s, p) as Action[]
  if (!legal.length) return null
  const of = <T extends Action['type']>(t: T) => legal.filter((a): a is Extract<Action, { type: T }> => a.type === t)
  switch (s.phase.kind) {
    case 'setup': {
      // the legal vertex with the highest pip total; ties keep the engine's canonical order
      const spots = of('PLACE_SETTLEMENT')
      if (spots.length) return spots.reduce((best, a) => (vertexPips(s, a.vertex) > vertexPips(s, best.vertex) ? a : best))
      return of('PLACE_ROAD')[0] ?? legal[0]
    }
    case 'roadBuilding': return of('BUILD_ROAD')[0] ?? legal[0]
    case 'preRoll': return of('ROLL')[0] ?? legal[0]
    case 'discard': {
      const d = legal.find((a) => a.type === 'DISCARD') as unknown as { count?: number } | undefined
      const pending = (s.phase as { pending: Partial<Record<PlayerId, number>> }).pending[p] ?? d?.count ?? 0
      const hand = { ...s.players.find((x) => x.id === p)!.resources }
      const cards: Partial<Record<Resource, number>> = {}
      for (let k = 0; k < pending; k++) {
        const avail = RESOURCE_ORDER.filter((r) => hand[r] > 0)
        const r = avail[pick(rng, avail.length)]
        hand[r] -= 1
        cards[r] = (cards[r] ?? 0) + 1
      }
      return { type: 'DISCARD', cards }
    }
    case 'moveRobber': {
      // hurt the public-VP leader among the others: the best tile touching their buildings
      const moves = of('MOVE_ROBBER')
      const others = s.order.filter((x) => x !== p).sort((a, b) => publicVP(s, b) - publicVP(s, a) || s.order.indexOf(a) - s.order.indexOf(b))
      for (const leader of others) {
        const hits = moves.filter((m) => s.board.topo.tileVertices[m.tile].some((v) => s.buildings[v]?.owner === leader && !s.board.topo.tileVertices[m.tile].some((w) => s.buildings[w]?.owner === p)))
        if (hits.length) return hits.reduce((best, m) => (tilePips(s, m.tile) > tilePips(s, best.tile) ? m : best))
      }
      return moves[0] ?? legal[0]
    }
    case 'steal': { const v = of('STEAL'); return v.length ? v[pick(rng, v.length)] : legal[0] }
    case 'actions': {
      // the active player ends the turn; an addressed player who is absent declines
      if (p === s.order[s.active]) return of('END_TURN')[0] ?? null
      return legal.find((a) => a.type === 'RESPOND_TRADE' && !a.accept) ?? null
    }
    case 'gameOver': return null
  }
}
