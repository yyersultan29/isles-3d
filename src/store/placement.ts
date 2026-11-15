// Which board spots are clickable right now (ROADMAP G4.3). Pure: derived from the engine's
// legalActions, never from scene geometry, so the highlights can't disagree with the rules.

import { apply, legalActions, pips } from '../game'
import type { Action, EdgeId, GameState, PlayerId, TileId, VertexId, Viewer } from '../game'
import type { PlacementMode } from './ui'

export interface PlacementTargets {
  player: PlayerId | null
  vertices: { at: VertexId; action: Action }[]
  edges: { at: EdgeId; action: Action }[]
  tiles: { at: TileId; action: Action }[]
}

const NONE: PlacementTargets = { player: null, vertices: [], edges: [], tiles: [] }

/** `me`: null in hot-seat (the active player places); online only this seat's own placements show. */
export function placementTargets(s: GameState, mode: PlacementMode, me: Viewer | null = null): PlacementTargets {
  const kind = s.phase.kind
  if (kind !== 'setup' && kind !== 'roadBuilding' && kind !== 'moveRobber' && kind !== 'actions') return NONE
  const player = s.order[s.active]
  if (me !== null && me !== player) return NONE
  const legal = legalActions(s, player) as Action[]
  const out: PlacementTargets = { player, vertices: [], edges: [], tiles: [] }
  // in `actions` only the chosen build shows; the other phases have exactly one kind of placement
  const want = kind === 'actions'
    ? mode === 'road' ? 'BUILD_ROAD' : mode === 'settlement' ? 'BUILD_SETTLEMENT' : mode === 'city' ? 'BUILD_CITY' : null
    : null
  for (const a of legal) {
    if (kind === 'actions' && a.type !== want) continue
    if (a.type === 'PLACE_SETTLEMENT' || a.type === 'BUILD_SETTLEMENT' || a.type === 'BUILD_CITY') out.vertices.push({ at: a.vertex, action: a })
    else if (a.type === 'PLACE_ROAD' || a.type === 'BUILD_ROAD') out.edges.push({ at: a.edge, action: a })
    else if (a.type === 'MOVE_ROBBER') out.tiles.push({ at: a.tile, action: a })
  }
  return out.vertices.length || out.edges.length || out.tiles.length ? out : { ...NONE, player }
}

/**
 * G6.5: whether the placement mode stays on after `action` (a build in `actions`): the same build is
 * still legal once it is placed (cards, a piece and a spot left). Decided on the state before the
 * dispatch with the local engine, so it answers at once online too, before the server's update.
 */
export function keepsPlacing(s: GameState, player: PlayerId, action: Action): boolean {
  if (s.phase.kind !== 'actions') return false
  const r = apply(s, player, action)
  return r.ok && r.state.phase.kind === 'actions' && legalActions(r.state, player).some((a) => a.type === action.type)
}

// ---------------------------------------------------------------- corner value (G9.5)

/** How much a corner produces: the dots ("pips") of the tokens around it (2 and 12 have 1, 6 and 8 have 5). */
export function cornerPips(s: GameState, v: VertexId): number {
  return (s.board.topo.vertexTiles[v] ?? []).reduce((n, t) => n + pips(s.board.tiles[t]?.token ?? null), 0)
}

/** Corner value bands for the setup markers: a small dim ring, a plain ring, a large gold ring. */
export type CornerBand = 'low' | 'mid' | 'high'
export const cornerBand = (p: number): CornerBand => (p >= 10 ? 'high' : p <= 4 ? 'low' : 'mid')
