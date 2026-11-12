// Which tiles produced on a roll (ROADMAP G4.5c), for the floating "+N" tags. Mirrors the engine's
// produce() (rules/production.ts) on public state: a tile whose token matches the roll, not under
// the robber, pays 1 per adjacent settlement and 2 per city. Resources the bank couldn't cover
// (the event's `shortfall`) get no tag, even when a single player received the remainder.

import { RESOURCE_ORDER, resourceOf, type GameState, type Resource, type TileId } from '../game'

export interface ProductionTag { tile: TileId; res: Resource; n: number }

export function productionTags(s: GameState, roll: number, shortfall: readonly Resource[]): ProductionTag[] {
  const out: ProductionTag[] = []
  for (const id of s.board.topo.tiles) {
    const tile = s.board.tiles[id]
    if (tile.token !== roll || id === s.robber) continue
    const res = resourceOf(tile.terrain)
    if (!res || shortfall.includes(res)) continue
    let n = 0
    for (const v of s.board.topo.tileVertices[id]) { const b = s.buildings[v]; if (b) n += b.type === 'city' ? 2 : 1 }
    if (n) out.push({ tile: id, res, n })
  }
  return out.sort((a, b) => RESOURCE_ORDER.indexOf(a.res) - RESOURCE_ORDER.indexOf(b.res))
}
