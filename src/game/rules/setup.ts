// Initial placement (GAME_DESIGN.md §4.2): snake order, settlement then road, distance rule,
// the road touches the settlement just placed, starting resources from the 2nd settlement.

import type { EdgeId, GameEvent, GameState, PlayerId, Resource, VertexId } from '../types'
import { fail } from '../errors'
import { activeId, addCounts, bankPay, playerOf } from '../state'
import { resourceOf } from '../board'
import { updateLongestRoad } from './awards'

export function checkSettlementSpot(s: GameState, v: VertexId) {
  const topo = s.board.topo
  if (!topo.vertexTiles[v]) fail('UNKNOWN_LOCATION', `no vertex ${v}`)
  if (s.buildings[v]) fail('OCCUPIED', `vertex ${v} is occupied`)
  if (topo.vertexNeighbors[v].some((n) => s.buildings[n])) fail('DISTANCE_RULE', `a neighbour of ${v} has a building`)
}

export function placeSetupSettlement(s: GameState, player: PlayerId, v: VertexId, events: GameEvent[]) {
  checkSettlementSpot(s, v)
  const p = playerOf(s, player)
  if (p.pieces.settlements <= 0) fail('NO_PIECES_LEFT', 'no settlements left')
  if (s.phase.kind !== 'setup') throw new Error('invariant: not in setup')

  s.buildings[v] = { owner: player, type: 'settlement' }
  p.pieces.settlements -= 1
  events.push({ type: 'SETUP_PLACED', what: 'settlement', at: v, by: player })

  if (s.phase.round === 2) {
    const gains: Partial<Record<Resource, number>> = {}
    for (const t of s.board.topo.vertexTiles[v]) {
      const res = resourceOf(s.board.tiles[t].terrain)
      if (res && s.bank[res] > 0) {
        bankPay(s, player, res, 1)
        addCounts(gains, res, 1)
      }
    }
    events.push({ type: 'SETUP_RESOURCES', player, gains })
  }
  s.phase = { kind: 'setup', round: s.phase.round, step: 'road', lastSettlement: v }
}

export function placeSetupRoad(s: GameState, player: PlayerId, e: EdgeId, events: GameEvent[]) {
  const topo = s.board.topo
  if (s.phase.kind !== 'setup' || !s.phase.lastSettlement) throw new Error('invariant: no settlement to attach to')
  if (!topo.edgeVertices[e]) fail('UNKNOWN_LOCATION', `no edge ${e}`)
  if (s.roads[e]) fail('OCCUPIED', `edge ${e} is occupied`)
  if (!topo.edgeVertices[e].includes(s.phase.lastSettlement)) fail('NOT_CONNECTED', 'the setup road must touch the settlement just placed')
  const p = playerOf(s, player)
  if (p.pieces.roads <= 0) fail('NO_PIECES_LEFT', 'no roads left')

  s.roads[e] = player
  p.pieces.roads -= 1
  events.push({ type: 'SETUP_PLACED', what: 'road', at: e, by: player })
  updateLongestRoad(s, events)

  // advance the snake: round 1 forward, round 2 reverse, then the first turn starts
  const last = s.order.length - 1
  if (s.phase.round === 1) {
    if (s.active < last) { s.active += 1; s.phase = { kind: 'setup', round: 1, step: 'settlement' } }
    else s.phase = { kind: 'setup', round: 2, step: 'settlement' }
  } else if (s.active > 0) {
    s.active -= 1
    s.phase = { kind: 'setup', round: 2, step: 'settlement' }
  } else {
    s.active = 0
    s.turn = 1
    s.phase = { kind: 'preRoll' }
    events.push({ type: 'TURN_STARTED', player: activeId(s), turn: s.turn })
  }
}

/** Legal setup targets for the active player (drives legalActions). */
export function setupSettlementSpots(s: GameState): VertexId[] {
  const topo = s.board.topo
  return topo.vertices.filter((v) => !s.buildings[v] && !topo.vertexNeighbors[v].some((n) => s.buildings[n]))
}

export function setupRoadSpots(s: GameState): EdgeId[] {
  if (s.phase.kind !== 'setup' || !s.phase.lastSettlement) return []
  return s.board.topo.vertexEdges[s.phase.lastSettlement].filter((e) => !s.roads[e])
}
