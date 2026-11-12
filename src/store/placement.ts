// Which board spots are clickable right now (ROADMAP G4.3). Pure: derived from the engine's
// legalActions, never from scene geometry, so the highlights can't disagree with the rules.

import { legalActions } from '../game'
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
