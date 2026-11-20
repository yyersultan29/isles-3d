// Solo-play bot (ROADMAP G10.5a, docs/G10_5_BOTS_PLAN.md). Pure and deterministic: `botAction`
// picks one action for a seat from `legalActions`, so it can never break a rule, and the runner
// calls it again for the next one. It reads only what a player could know: its own hand, the
// board, public scores and hand sizes; never another player's cards or the deck.
//
// One level of play: score the options with simple rules (dots, resource variety, ports, the
// leader as the robber's target) and save toward one goal. Bank trades only when they complete
// that goal this turn, so a turn can't loop.

import { legalActions } from './engine'
import { pips, resourceOf } from './board'
import { COSTS } from './rules/build'
import { tradeRate } from './rules/trade'
import { handSize, playerOf, publicVP } from './state'
import { RESOURCE_ORDER } from './types'
import type { Action, EdgeId, GameState, LegalAction, PlayerId, Resource, ResourceCounts, TileId, VertexId } from './types'

type Goal = 'city' | 'settlement' | 'road' | 'dev'
type Counts = Partial<ResourceCounts>

const tilePips = (s: GameState, t: TileId) => pips(s.board.tiles[t].token)
const tileRes = (s: GameState, t: TileId) => resourceOf(s.board.tiles[t].terrain)

/** Dots per resource from a player's buildings (a city counts twice); the robber's tile gives nothing. */
function production(s: GameState, p: PlayerId): ResourceCounts {
  const out: ResourceCounts = { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 }
  for (const [v, b] of Object.entries(s.buildings) as [VertexId, { owner: PlayerId; type: string }][]) {
    if (b.owner !== p) continue
    for (const t of s.board.topo.vertexTiles[v]) {
      const r = tileRes(s, t)
      if (r && t !== s.robber) out[r] += tilePips(s, t) * (b.type === 'city' ? 2 : 1)
    }
  }
  return out
}

/** What a settlement at `v` is worth to `p`: dots, new resources, a port it can use. */
function spotValue(s: GameState, p: PlayerId, v: VertexId, prod = production(s, p)): number {
  let value = 0
  const gains: Partial<Record<Resource, number>> = {}
  for (const t of s.board.topo.vertexTiles[v]) {
    const r = tileRes(s, t)
    if (!r) continue
    const d = tilePips(s, t) * (t === s.robber ? 0.5 : 1)
    value += d
    gains[r] = (gains[r] ?? 0) + d
  }
  for (const r of RESOURCE_ORDER) if (gains[r] && !prod[r]) value += 2 // a resource the player lacks
  const port = s.board.ports.find((x) => x.vertices.includes(v))
  if (port) value += port.kind === 'generic' ? 1.5 : (prod[port.kind] + (gains[port.kind] ?? 0)) >= 5 ? 3 : 0.5
  return value
}

/** A vertex where a settlement could stand (free, and no neighbour built). */
const freeSpot = (s: GameState, v: VertexId) => !s.buildings[v] && !s.board.topo.vertexNeighbors[v].some((n) => s.buildings[n])

/** How much a road on `e` helps reach a new settlement spot (0 = not at all). */
function roadValue(s: GameState, p: PlayerId, e: EdgeId, prod: ResourceCounts): number {
  const topo = s.board.topo
  let best = 0
  for (const w of topo.edgeVertices[e]) {
    // the far end: not already reached by our network
    if (s.buildings[w]?.owner === p || topo.vertexEdges[w].some((x) => x !== e && s.roads[x] === p)) continue
    if (s.buildings[w]) continue // an opponent sits there: a dead end
    if (freeSpot(s, w)) best = Math.max(best, spotValue(s, p, w, prod))
    for (const x of topo.vertexNeighbors[w]) if (freeSpot(s, x)) best = Math.max(best, 0.6 * spotValue(s, p, x, prod))
  }
  return best
}

const bestBy = <T>(items: T[], score: (x: T) => number): T | undefined => {
  let best: T | undefined, top = -Infinity
  for (const x of items) { const v = score(x); if (v > top) { top = v; best = x } }
  return best
}

/** Cards still missing for `cost` with this hand. */
const deficit = (hand: ResourceCounts, cost: Counts) => RESOURCE_ORDER.reduce((a, r) => a + Math.max(0, (cost[r] ?? 0) - hand[r]), 0)

/** The goal the bot saves for: the best value per missing card. */
function goalOf(s: GameState, p: PlayerId): Goal | null {
  const pl = playerOf(s, p)
  const prod = production(s, p)
  const mine = (Object.keys(s.buildings) as VertexId[]).filter((v) => s.buildings[v]!.owner === p)
  const hasSpot = pl.pieces.settlements > 0 && s.board.topo.vertices.some((v) => freeSpot(s, v) && s.board.topo.vertexEdges[v].some((e) => s.roads[e] === p))
  const options: [Goal, number][] = []
  if (hasSpot) options.push(['settlement', 3.2])
  if (pl.pieces.cities > 0 && mine.some((v) => s.buildings[v]!.type === 'settlement')) options.push(['city', 3])
  if (!hasSpot && pl.pieces.settlements > 0 && pl.pieces.roads > 0 && s.board.topo.edges.some((e) => !s.roads[e] && roadValue(s, p, e, prod) > 0 && connected(s, p, e))) options.push(['road', 2])
  if (s.deck.length) options.push(['dev', 1.2])
  return bestBy(options, ([g, v]) => v / (1 + deficit(pl.resources, COSTS[g])))?.[0] ?? null
}

/** Road connectivity, ignoring cost and pieces (same rule as the engine's roadConnection). */
function connected(s: GameState, p: PlayerId, e: EdgeId) {
  const topo = s.board.topo
  return topo.edgeVertices[e].some((v) => {
    const b = s.buildings[v]
    if (b) return b.owner === p
    return topo.vertexEdges[v].some((x) => x !== e && s.roads[x] === p)
  })
}

const leaderScore = (s: GameState, p: PlayerId) => publicVP(s, p) * 10 + handSize(playerOf(s, p).resources)

/** The action `p` takes now, or null when the game owes nothing from `p`. */
export function botAction(s: GameState, p: PlayerId): Action | null {
  const legal = legalActions(s, p)
  if (!legal.length) return null
  const of = <T extends LegalAction['type']>(t: T) => legal.filter((a): a is Extract<LegalAction, { type: T }> => a.type === t)
  const pl = playerOf(s, p)
  const prod = production(s, p)
  const others = s.order.filter((x) => x !== p)

  switch (s.phase.kind) {
    case 'setup': {
      const spots = of('PLACE_SETTLEMENT')
      if (spots.length) return bestBy(spots, (a) => spotValue(s, p, a.vertex, prod))!
      return bestBy(of('PLACE_ROAD'), (a) => roadValue(s, p, a.edge, prod)) ?? (legal[0] as Action)
    }
    case 'roadBuilding': return bestBy(of('BUILD_ROAD'), (a) => roadValue(s, p, a.edge, prod))!
    case 'preRoll': {
      const blocked = s.board.topo.tileVertices[s.robber].some((v) => s.buildings[v]?.owner === p)
      if (blocked && of('PLAY_KNIGHT').length) return { type: 'PLAY_KNIGHT' }
      return { type: 'ROLL' }
    }
    case 'discard': {
      const count = (s.phase.pending[p] ?? 0)
      const goal = goalOf(s, p)
      const need = goal ? COSTS[goal] : {}
      const hand = { ...pl.resources }
      const cards: Counts = {}
      for (let k = 0; k < count; k++) {
        // drop the card furthest beyond what the goal needs
        const r = bestBy(RESOURCE_ORDER.filter((x) => hand[x] > 0), (x) => hand[x] - (need[x] ?? 0) * 2)!
        hand[r] -= 1
        cards[r] = (cards[r] ?? 0) + 1
      }
      return { type: 'DISCARD', cards }
    }
    case 'moveRobber': {
      const lead = new Map(others.map((x) => [x, 1 + publicVP(s, x)]))
      return bestBy(of('MOVE_ROBBER'), (a) => {
        let score = 0
        for (const v of s.board.topo.tileVertices[a.tile]) {
          const b = s.buildings[v]
          if (!b) continue
          const w = b.type === 'city' ? 2 : 1
          score += b.owner === p ? -100 * w : lead.get(b.owner)! * w * tilePips(s, a.tile)
        }
        return score
      })!
    }
    case 'steal': return bestBy(of('STEAL'), (a) => leaderScore(s, a.victim))!
    case 'actions': break
    default: return legal[0] as Action
  }

  // a trade offered to this bot: accept when it brings the goal closer and doesn't feed a near-winner
  if (p !== s.order[s.active]) {
    const t = s.trade
    const yes = legal.find((a) => a.type === 'RESPOND_TRADE' && a.accept) as Action | undefined
    const no = legal.find((a) => a.type === 'RESPOND_TRADE' && !a.accept) as Action
    if (!t || !yes || publicVP(s, t.from) >= s.settings.vpToWin - 2) return no
    const goal = goalOf(s, p)
    if (!goal) return no
    const after = { ...pl.resources }
    for (const r of RESOURCE_ORDER) after[r] += (t.offer[r] ?? 0) - (t.request[r] ?? 0)
    return deficit(after, COSTS[goal]) < deficit(pl.resources, COSTS[goal]) && handSize(after) >= handSize(pl.resources) - 1 ? yes : no
  }

  const goal = goalOf(s, p)
  const need = goal ? COSTS[goal] : {}
  const spare = (cost: Counts) => RESOURCE_ORDER.every((r) => pl.resources[r] - (need[r] ?? 0) >= (cost[r] ?? 0))

  // development cards (one per turn; the engine checks that)
  if (of('PLAY_KNIGHT').length) return { type: 'PLAY_KNIGHT' }
  if (goal && deficit(pl.resources, need) > 0) {
    const yop = bestBy(of('PLAY_YEAR_OF_PLENTY'), (a) => {
      const h = { ...pl.resources }
      for (const r of a.take) h[r] += 1
      return -deficit(h, need)
    })
    if (yop) return yop
    const missing = RESOURCE_ORDER.filter((r) => pl.resources[r] < (need[r] ?? 0))
    const mono = bestBy(of('PLAY_MONOPOLY').filter((a) => missing.includes(a.resource)), (a) => others.reduce((n, x) => n + production(s, x)[a.resource], 0))
    if (mono) return mono
  }
  const roads = of('BUILD_ROAD').filter((a) => roadValue(s, p, a.edge, prod) > 0)
  if (of('PLAY_ROAD_BUILDING').length && (goal === 'road' || roads.length)) return { type: 'PLAY_ROAD_BUILDING' }

  // builds: the best first, then anything the goal can spare
  const city = bestBy(of('BUILD_CITY'), (a) => spotValue(s, p, a.vertex, prod))
  if (city) return city
  const settle = bestBy(of('BUILD_SETTLEMENT'), (a) => spotValue(s, p, a.vertex, prod))
  if (settle) return settle
  const road = bestBy(roads, (a) => roadValue(s, p, a.edge, prod))
  if (road && (goal === 'road' || spare(COSTS.road))) return road
  if (of('BUY_DEV').length && (goal === 'dev' || spare(COSTS.dev))) return { type: 'BUY_DEV' }

  // bank: only when trades of what the goal doesn't need finish it this turn
  if (goal) {
    const short = deficit(pl.resources, need)
    const extra = (r: Resource) => Math.floor((pl.resources[r] - (need[r] ?? 0)) / tradeRate(s, p, r))
    if (short > 0 && RESOURCE_ORDER.reduce((n, r) => n + Math.max(0, extra(r)), 0) >= short) {
      const get = RESOURCE_ORDER.find((r) => pl.resources[r] < (need[r] ?? 0) && s.bank[r] > 0)
      const give = bestBy(RESOURCE_ORDER.filter((r) => extra(r) > 0), (r) => pl.resources[r] - (need[r] ?? 0))
      const trade = get && give && of('BANK_TRADE').find((a) => a.give === give && a.get === get)
      if (trade) return trade
    }
  }

  // too many cards for a seven: spend on something useful rather than lose them
  if (handSize(pl.resources) > s.settings.discardLimit) {
    if (of('BUY_DEV').length) return { type: 'BUY_DEV' }
    if (road) return road
  }
  return { type: 'END_TURN' }
}
