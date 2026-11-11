// Dice and resource production (GAME_DESIGN.md §5), including the per-resource bank shortage rule
// [BLOG-RULES]: a single entitled player takes what is left; several entitled players get nothing.

import type { GameState, PlayerId, Resource, ResourceCounts } from '../types'
import { RESOURCE_ORDER } from '../types'
import { resourceOf } from '../board'
import { addCounts } from '../state'

export interface Production {
  gains: Partial<Record<PlayerId, Partial<ResourceCounts>>>
  /** resources that were owed but not (fully) paid because the bank ran short */
  shortfall: Resource[]
}

export function produce(s: GameState, roll: number): Production {
  const owed = new Map<Resource, Map<PlayerId, number>>()
  for (const id of s.board.topo.tiles) {
    const tile = s.board.tiles[id]
    if (tile.token !== roll || id === s.robber) continue // the desert has no token, so it never matches
    const res = resourceOf(tile.terrain)
    if (!res) continue
    for (const v of s.board.topo.tileVertices[id]) {
      const b = s.buildings[v]
      if (!b) continue
      let m = owed.get(res)
      if (!m) owed.set(res, (m = new Map()))
      m.set(b.owner, (m.get(b.owner) ?? 0) + (b.type === 'city' ? 2 : 1))
    }
  }

  const gains: Production['gains'] = {}
  const shortfall: Resource[] = []
  const pay = (p: PlayerId, res: Resource, n: number) => addCounts((gains[p] ??= {}), res, n)
  for (const res of RESOURCE_ORDER) {
    const perPlayer = owed.get(res)
    if (!perPlayer) continue
    let total = 0
    for (const n of perPlayer.values()) total += n
    const stock = s.bank[res]
    if (total <= stock) {
      for (const p of s.order) { const n = perPlayer.get(p); if (n) pay(p, res, n) }
    } else {
      shortfall.push(res)
      if (perPlayer.size === 1 && stock > 0) {
        const [p] = perPlayer.keys()
        pay(p, res, stock)
      }
    }
  }
  return { gains, shortfall }
}
