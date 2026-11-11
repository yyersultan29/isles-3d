// Construction (GAME_DESIGN.md §7): costs, piece supply, placement validation.

import type { EdgeId, GameEvent, GameState, PlayerId, Resource, ResourceCounts, VertexId } from '../types'
import { RESOURCE_ORDER } from '../types'
import { RuleError, fail } from '../errors'
import { playerOf } from '../state'
import { checkSettlementSpot } from './setup'
import { updateLongestRoad } from './awards'
import { cancelOnHandChange } from './trade'

export const COSTS: Record<'road' | 'settlement' | 'city' | 'dev', Partial<ResourceCounts>> = {
  road: { lumber: 1, brick: 1 },
  settlement: { lumber: 1, brick: 1, wool: 1, grain: 1 },
  city: { grain: 2, ore: 3 },
  dev: { wool: 1, grain: 1, ore: 1 },
}

export const canAfford = (s: GameState, p: PlayerId, cost: Partial<ResourceCounts>) =>
  RESOURCE_ORDER.every((r) => playerOf(s, p).resources[r] >= (cost[r] ?? 0))

/** Player → bank. Validation (canAfford) must have happened first. */
export function pay(s: GameState, p: PlayerId, cost: Partial<ResourceCounts>) {
  const pl = playerOf(s, p)
  for (const r of RESOURCE_ORDER) {
    const n = cost[r] ?? 0
    if (!n) continue
    if (pl.resources[r] < n) throw new Error(`invariant: ${p} can't pay ${r}`)
    pl.resources[r] -= n
    s.bank[r as Resource] += n
  }
}

/** Road connectivity: `ok`, or the error code explaining why not. */
export function roadConnection(s: GameState, p: PlayerId, e: EdgeId): 'ok' | 'NOT_CONNECTED' | 'BLOCKED_BY_OPPONENT' {
  const topo = s.board.topo
  let blocked = false
  for (const v of topo.edgeVertices[e]) {
    const b = s.buildings[v]
    if (b && b.owner === p) return 'ok'
    const ownRoad = topo.vertexEdges[v].some((x) => x !== e && s.roads[x] === p)
    if (!ownRoad) continue
    if (b) blocked = true // own road reaches this vertex, but an opponent's building sits on it
    else return 'ok'
  }
  return blocked ? 'BLOCKED_BY_OPPONENT' : 'NOT_CONNECTED'
}

export function checkRoad(s: GameState, p: PlayerId, e: EdgeId, free: boolean) {
  if (!s.board.topo.edgeVertices[e]) fail('UNKNOWN_LOCATION', `no edge ${e}`)
  if (s.roads[e]) fail('OCCUPIED', `edge ${e} is occupied`)
  const c = roadConnection(s, p, e)
  if (c !== 'ok') fail(c, c === 'BLOCKED_BY_OPPONENT' ? "the only connection runs through an opponent's building" : 'road is not connected to your network')
  if (playerOf(s, p).pieces.roads <= 0) fail('NO_PIECES_LEFT', 'no roads left')
  if (!free && !canAfford(s, p, COSTS.road)) fail('INSUFFICIENT_RESOURCES', 'a road costs lumber + brick')
}

export function buildRoad(s: GameState, p: PlayerId, e: EdgeId, free: boolean, events: GameEvent[]) {
  checkRoad(s, p, e, free)
  if (!free) { pay(s, p, COSTS.road); cancelOnHandChange(s, events) }
  s.roads[e] = p
  playerOf(s, p).pieces.roads -= 1
  events.push({ type: 'BUILT', what: 'road', at: e, by: p, free })
  updateLongestRoad(s, events)
}

export function checkSettlement(s: GameState, p: PlayerId, v: VertexId) {
  checkSettlementSpot(s, v) // UNKNOWN_LOCATION, OCCUPIED, DISTANCE_RULE
  if (!s.board.topo.vertexEdges[v].some((e) => s.roads[e] === p)) fail('NOT_CONNECTED', 'a settlement must touch your own road')
  if (playerOf(s, p).pieces.settlements <= 0) fail('NO_PIECES_LEFT', 'no settlements left (upgrade one to a city first)')
  if (!canAfford(s, p, COSTS.settlement)) fail('INSUFFICIENT_RESOURCES', 'a settlement costs lumber + brick + wool + grain')
}

export function buildSettlement(s: GameState, p: PlayerId, v: VertexId, events: GameEvent[]) {
  checkSettlement(s, p, v)
  pay(s, p, COSTS.settlement)
  cancelOnHandChange(s, events)
  s.buildings[v] = { owner: p, type: 'settlement' }
  playerOf(s, p).pieces.settlements -= 1
  events.push({ type: 'BUILT', what: 'settlement', at: v, by: p, free: false })
  updateLongestRoad(s, events) // a settlement can break an opponent's road
}

export function checkCity(s: GameState, p: PlayerId, v: VertexId) {
  if (!s.board.topo.vertexTiles[v]) fail('UNKNOWN_LOCATION', `no vertex ${v}`)
  const b = s.buildings[v]
  if (!b || b.owner !== p || b.type !== 'settlement') fail('NOT_YOUR_SETTLEMENT', 'a city replaces one of your settlements')
  if (playerOf(s, p).pieces.cities <= 0) fail('NO_PIECES_LEFT', 'no cities left')
  if (!canAfford(s, p, COSTS.city)) fail('INSUFFICIENT_RESOURCES', 'a city costs 2 grain + 3 ore')
}

export function buildCity(s: GameState, p: PlayerId, v: VertexId, events: GameEvent[]) {
  checkCity(s, p, v)
  pay(s, p, COSTS.city)
  cancelOnHandChange(s, events)
  s.buildings[v] = { owner: p, type: 'city' }
  const pl = playerOf(s, p)
  pl.pieces.cities -= 1
  pl.pieces.settlements += 1 // the settlement piece returns to supply
  events.push({ type: 'BUILT', what: 'city', at: v, by: p, free: false })
}

const passes = (f: () => void) => {
  try { f(); return true } catch (e) { if (e instanceof RuleError) return false; throw e }
}

export const legalRoads = (s: GameState, p: PlayerId, free: boolean) => s.board.topo.edges.filter((e) => passes(() => checkRoad(s, p, e, free)))
export const legalSettlements = (s: GameState, p: PlayerId) => s.board.topo.vertices.filter((v) => passes(() => checkSettlement(s, p, v)))
export const legalCities = (s: GameState, p: PlayerId) =>
  (Object.keys(s.buildings) as VertexId[]).filter((v) => passes(() => checkCity(s, p, v)))
