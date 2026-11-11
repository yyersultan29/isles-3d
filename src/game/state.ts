// State helpers shared by the rules modules. `draft` makes the copy that a step may mutate; the
// input state is never touched, and the immutable board is shared by reference.

import type { Building, GameState, PlayerId, PlayerState, Resource, ResourceCounts, VertexId } from './types'
import { RESOURCE_ORDER } from './types'
import { fail } from './errors'

export const emptyCounts = (n = 0): ResourceCounts => ({ lumber: n, brick: n, wool: n, grain: n, ore: n })

export const handSize = (c: ResourceCounts) => RESOURCE_ORDER.reduce((s, r) => s + c[r], 0)

export function draft(s: GameState): GameState {
  return {
    ...s,
    settings: { ...s.settings },
    players: s.players.map((p) => ({ ...p, resources: { ...p.resources }, devCards: p.devCards.map((c) => ({ ...c })), pieces: { ...p.pieces } })),
    buildings: { ...s.buildings },
    roads: { ...s.roads },
    bank: { ...s.bank },
    deck: s.deck.map((c) => ({ ...c })),
    phase: structuredClone(s.phase),
    trade: s.trade ? structuredClone(s.trade) : null,
    dice: s.dice ? [s.dice[0], s.dice[1]] : null,
  }
}

export const activeId = (s: GameState): PlayerId => s.order[s.active]

export function playerOf(s: GameState, id: PlayerId): PlayerState {
  const p = s.players.find((x) => x.id === id)
  if (!p) fail('MALFORMED_ACTION', `unknown player ${id}`)
  return p
}

export const buildingAt = (s: GameState, v: VertexId): Building | undefined => s.buildings[v]

/** Move cards bank → player; the caller has already checked stock. */
export function bankPay(s: GameState, to: PlayerId, res: Resource, n: number) {
  if (n <= 0) return
  if (s.bank[res] < n) throw new Error(`invariant: bank short of ${res}`)
  s.bank[res] -= n
  playerOf(s, to).resources[res] += n
}

export function publicVP(s: GameState, id: PlayerId): number {
  let vp = 0
  for (const b of Object.values(s.buildings)) if (b && b.owner === id) vp += b.type === 'city' ? 2 : 1
  if (s.longestRoad === id) vp += 2
  if (s.largestArmy === id) vp += 2
  return vp
}

export const vpCards = (s: GameState, id: PlayerId) => playerOf(s, id).devCards.filter((c) => c.type === 'victoryPoint').length

export const totalVP = (s: GameState, id: PlayerId) => publicVP(s, id) + vpCards(s, id)

export function addCounts(target: Partial<ResourceCounts>, res: Resource, n: number) {
  target[res] = (target[res] ?? 0) + n
}
