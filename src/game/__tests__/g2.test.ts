// G2: construction, seven/robber, Friendly Robber, Longest Road, Largest Army, fuzzer (GAME_DESIGN.md §6, §7, §10, §13).
import { describe, expect, it } from 'vitest'
import { apply, legalActions, validate } from '../engine'
import { draft, publicVP } from '../state'
import { longestRoad, resolveLargestArmy, resolveLongestRoad } from '../rules/awards'
import { createRng, pick } from '../rng'
import type { Action, EdgeId, GameState, PlayerId, ResourceCounts, TileId, VertexId } from '../types'
import { PLAYER_IDS, RESOURCE_ORDER } from '../types'
import { act, assertInvariants, concretize, must, newGame, playSetup, resolvePending, waiting } from './helpers'

const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? 'OK' : r.error!.code)

/** Empty board in `actions`, order p1..p4, p1 active, with optional hands, buildings and roads. */
function fixture(opts: {
  hands?: Partial<Record<PlayerId, Partial<ResourceCounts>>>
  buildings?: [VertexId, PlayerId, ('settlement' | 'city')?][]
  roads?: [EdgeId, PlayerId][]
  friendly?: boolean
  phase?: GameState['phase']
} = {}): GameState {
  const s = draft(newGame(1, { friendlyRobber: !!opts.friendly }))
  s.order = [...PLAYER_IDS]
  s.active = 0
  s.turn = 5
  s.phase = opts.phase ?? { kind: 'actions' }
  for (const [p, h] of Object.entries(opts.hands ?? {}) as [PlayerId, Partial<ResourceCounts>][]) {
    const pl = s.players.find((x) => x.id === p)!
    for (const r of RESOURCE_ORDER) { const n = h[r] ?? 0; pl.resources[r] += n; s.bank[r] -= n }
  }
  for (const [v, p, t] of opts.buildings ?? []) {
    s.buildings[v] = { owner: p, type: t ?? 'settlement' }
    const pl = s.players.find((x) => x.id === p)!
    if (t === 'city') pl.pieces.cities -= 1
    else pl.pieces.settlements -= 1
  }
  for (const [e, p] of opts.roads ?? []) { s.roads[e] = p; s.players.find((x) => x.id === p)!.pieces.roads -= 1 }
  assertInvariants(s)
  return s
}

const topo = newGame(1).board.topo
const lots = { lumber: 5, brick: 5, wool: 5, grain: 5, ore: 5 }
const hand = (s: GameState, p: PlayerId) => s.players.find((x) => x.id === p)!.resources
const pieces = (s: GameState, p: PlayerId) => s.players.find((x) => x.id === p)!.pieces

/** A simple path of n edges starting at vertex v (deterministic, avoids revisiting vertices). */
function path(v: VertexId, n: number): EdgeId[] {
  const out: EdgeId[] = []
  const seen = new Set<VertexId>([v])
  const go = (at: VertexId): boolean => {
    if (out.length === n) return true
    for (const e of topo.vertexEdges[at]) {
      const [a, b] = topo.edgeVertices[e]
      const nx = a === at ? b : a
      if (seen.has(nx)) continue
      seen.add(nx); out.push(e)
      if (go(nx)) return true
      seen.delete(nx); out.pop()
    }
    return false
  }
  if (!go(v)) throw new Error('no path')
  return out
}
const pathVertices = (start: VertexId, edges: EdgeId[]) => {
  const vs = [start]
  for (const e of edges) { const [a, b] = topo.edgeVertices[e]; vs.push(a === vs[vs.length - 1] ? b : a) }
  return vs
}

describe('construction (G2.1, G2.2)', () => {
  const home = '0,-1,N' as VertexId
  const [e1, e2] = path(home, 2)
  const base = () => fixture({ hands: { p1: lots }, buildings: [[home, 'p1']], roads: [[e1, 'p1']] })

  it('deducts exact costs to the bank and updates supply', () => {
    let s = base()
    s = act(s, { type: 'BUILD_ROAD', edge: e2 })
    expect(hand(s, 'p1')).toMatchObject({ lumber: 4, brick: 4 })
    expect(pieces(s, 'p1').roads).toBe(13)
    s = act(s, { type: 'BUILD_CITY', vertex: home })
    expect(hand(s, 'p1')).toMatchObject({ grain: 3, ore: 2 })
    expect(pieces(s, 'p1')).toMatchObject({ cities: 3, settlements: 5 }) // the settlement piece came back
    expect(s.buildings[home]).toEqual({ owner: 'p1', type: 'city' })
    assertInvariants(s)
  })
  it('settlement must touch own road and respect distance; costs 4 cards', () => {
    let s = base()
    const end = pathVertices(home, [e1, e2])
    expect(code(apply(s, 'p1', { type: 'BUILD_SETTLEMENT', vertex: end[1] }))).toBe('DISTANCE_RULE')
    s = act(s, { type: 'BUILD_ROAD', edge: e2 })
    s = act(s, { type: 'BUILD_SETTLEMENT', vertex: end[2] })
    expect(hand(s, 'p1')).toEqual({ lumber: 3, brick: 3, wool: 4, grain: 4, ore: 5 })
    const far = topo.vertices.find((v) => !topo.vertexEdges[v].some((e) => s.roads[e]) && !s.buildings[v] && !topo.vertexNeighbors[v].some((n) => s.buildings[n]))!
    expect(code(apply(s, 'p1', { type: 'BUILD_SETTLEMENT', vertex: far }))).toBe('NOT_CONNECTED')
  })
  it('rejects insufficient resources, unknown and occupied locations, disconnected roads', () => {
    const poor = fixture({ buildings: [[home, 'p1']], roads: [[e1, 'p1']] })
    expect(code(apply(poor, 'p1', { type: 'BUILD_ROAD', edge: e2 }))).toBe('INSUFFICIENT_RESOURCES')
    expect(code(apply(poor, 'p1', { type: 'BUILD_CITY', vertex: home }))).toBe('INSUFFICIENT_RESOURCES')
    const s = base()
    expect(code(apply(s, 'p1', { type: 'BUILD_ROAD', edge: e1 }))).toBe('OCCUPIED')
    expect(code(apply(s, 'p1', { type: 'BUILD_ROAD', edge: '9,9,W' }))).toBe('UNKNOWN_LOCATION')
    const far = topo.edges.find((e) => !topo.edgeVertices[e].some((v) => topo.vertexEdges[v].some((x) => s.roads[x]) || s.buildings[v]))!
    expect(code(apply(s, 'p1', { type: 'BUILD_ROAD', edge: far }))).toBe('NOT_CONNECTED')
  })
  it("city only on your own settlement", () => {
    const other = topo.vertices.find((v) => v !== '0,-1,N' && !topo.vertexNeighbors['0,-1,N'].includes(v))!
    const s = fixture({ hands: { p1: lots }, buildings: [['0,-1,N', 'p1'], [other, 'p2']] })
    expect(code(apply(s, 'p1', { type: 'BUILD_CITY', vertex: other }))).toBe('NOT_YOUR_SETTLEMENT')
    const empty = topo.vertices.find((v) => !s.buildings[v])!
    expect(code(apply(s, 'p1', { type: 'BUILD_CITY', vertex: empty }))).toBe('NOT_YOUR_SETTLEMENT')
  })
  it("a road can't extend through an opponent's building", () => {
    const vs = pathVertices(home, [e1, e2])
    const s = fixture({ hands: { p1: lots }, buildings: [[home, 'p1'], [vs[1], 'p2']], roads: [[e1, 'p1']] })
    expect(code(apply(s, 'p1', { type: 'BUILD_ROAD', edge: e2 }))).toBe('BLOCKED_BY_OPPONENT')
  })
  it('enforces piece limits: 16th road, 6th settlement, 5th city', () => {
    const s = base()
    s.players[0].pieces.roads = 0
    expect(code(apply(s, 'p1', { type: 'BUILD_ROAD', edge: e2 }))).toBe('NO_PIECES_LEFT')
    const s2 = base(); s2.players[0].pieces.cities = 0
    expect(code(apply(s2, 'p1', { type: 'BUILD_CITY', vertex: home }))).toBe('NO_PIECES_LEFT')
    const s3 = act(base(), { type: 'BUILD_ROAD', edge: e2 })
    s3.players[0].pieces.settlements = 0
    expect(code(apply(s3, 'p1', { type: 'BUILD_SETTLEMENT', vertex: pathVertices(home, [e1, e2])[2] }))).toBe('NO_PIECES_LEFT')
  })
  it('legal build actions are exactly the ones that validate', () => {
    const s = base()
    const legal = legalActions(s, 'p1')
    expect(legal.some((a) => a.type === 'BUILD_ROAD')).toBe(true)
    expect(legal).toContainEqual({ type: 'BUILD_CITY', vertex: home })
    for (const a of legal) expect(validate(s, 'p1', a as Action).ok).toBe(true)
    const roadsLegal = new Set(legal.filter((a) => a.type === 'BUILD_ROAD').map((a) => (a as { edge: EdgeId }).edge))
    for (const e of topo.edges) expect(validate(s, 'p1', { type: 'BUILD_ROAD', edge: e }).ok).toBe(roadsLegal.has(e))
  })
})

describe('seven, discard, robber (G2.3)', () => {
  const rolled7 = (hands: Partial<Record<PlayerId, Partial<ResourceCounts>>>, extra: Parameters<typeof fixture>[0] = {}) => {
    // find an rngState whose next roll is a 7, so the roll path itself is exercised
    const s = fixture({ ...extra, hands, phase: { kind: 'preRoll' } })
    for (let seed = 0; ; seed++) {
      const r = createRng(seed); const a = 1 + pick(r, 6), b = 1 + pick(r, 6)
      if (a + b === 7) { s.rngState = seed; break }
    }
    return act(s, { type: 'ROLL' })
  }
  it('hands of 7 keep all; 8 and 9 discard 4; the roller discards too', () => {
    const s = rolled7({ p1: { ore: 9 }, p2: { lumber: 8 }, p3: { wool: 7 } })
    expect(s.phase).toEqual({ kind: 'discard', pending: { p1: 4, p2: 4 } })
    expect(legalActions(s, 'p3')).toEqual([])
    expect(legalActions(s, 'p2')).toEqual([{ type: 'DISCARD', count: 4 }])
  })
  it('discard must be exact, from held cards, by an owing player; then the robber moves', () => {
    let s = rolled7({ p1: { ore: 9 }, p2: { lumber: 8 } })
    expect(code(apply(s, 'p2', { type: 'DISCARD', cards: { lumber: 3 } }))).toBe('INVALID_DISCARD')
    expect(code(apply(s, 'p2', { type: 'DISCARD', cards: { ore: 4 } }))).toBe('INVALID_DISCARD')
    expect(code(apply(s, 'p3', { type: 'DISCARD', cards: {} }))).toBe('NOT_YOUR_TURN')
    s = act(s, { type: 'DISCARD', cards: { lumber: 4 } }, 'p2') // order doesn't matter
    expect(code(apply(s, 'p1', { type: 'MOVE_ROBBER', tile: '1,0' }))).toBe('WRONG_PHASE')
    s = act(s, { type: 'DISCARD', cards: { ore: 4 } }, 'p1')
    expect(s.phase).toMatchObject({ kind: 'moveRobber', source: 'seven', resume: 'actions' })
    expect(hand(s, 'p1').ore).toBe(5)
    assertInvariants(s)
  })
  it('no discards → straight to the robber; no production on 7', () => {
    const s = rolled7({ p1: { ore: 2 } })
    expect(s.phase.kind).toBe('moveRobber')
  })
  it('robber must move to a different tile; desert allowed; unknown tile rejected', () => {
    const s = rolled7({})
    expect(code(apply(s, 'p1', { type: 'MOVE_ROBBER', tile: s.robber }))).toBe('ROBBER_SAME_TILE')
    expect(code(apply(s, 'p1', { type: 'MOVE_ROBBER', tile: '7,7' as TileId }))).toBe('UNKNOWN_LOCATION')
    expect(legalActions(s, 'p1')).toHaveLength(18)
    const moved = act(s, { type: 'MOVE_ROBBER', tile: '1,0' })
    expect(moved.robber).toBe('1,0')
    expect(act(moved, { type: 'END_TURN' }).phase.kind).toBe('preRoll') // the robber can return to the desert later
  })
  const t = '1,-1' as TileId // hills 9 in standard-fixed
  const [vA, , vC] = topo.tileVertices[t] // NE and S corners: not adjacent
  it('no candidates → no steal; one candidate → automatic steal; 0-card owners are skipped', () => {
    let s = rolled7({ p2: {} }, { buildings: [[vA, 'p2']] })
    s = act(s, { type: 'MOVE_ROBBER', tile: t })
    expect(s.phase.kind).toBe('actions')
    let s2 = rolled7({ p2: { wool: 2 } }, { buildings: [[vA, 'p2']] })
    const r = must(apply(s2, 'p1', { type: 'MOVE_ROBBER', tile: t }))
    s2 = r.state
    expect(s2.phase.kind).toBe('actions')
    expect(hand(s2, 'p1').wool).toBe(1)
    expect(r.events.find((e) => e.type === 'CARD_STOLEN')).toMatchObject({ from: 'p2', to: 'p1', resource: 'wool' })
  })
  it('two candidates → choose; invalid victim rejected; own building never a candidate', () => {
    let s = rolled7({ p2: { wool: 1 }, p3: { ore: 1 } }, { buildings: [[vA, 'p2'], [vC, 'p3']] })
    s = act(s, { type: 'MOVE_ROBBER', tile: t })
    expect(s.phase).toMatchObject({ kind: 'steal', candidates: ['p2', 'p3'] })
    expect(code(apply(s, 'p1', { type: 'STEAL', victim: 'p4' }))).toBe('INVALID_VICTIM')
    expect(code(apply(s, 'p1', { type: 'STEAL', victim: 'p1' }))).toBe('INVALID_VICTIM')
    s = act(s, { type: 'STEAL', victim: 'p3' })
    expect(hand(s, 'p1').ore).toBe(1)
    expect(s.phase.kind).toBe('actions')
  })
  it('the stolen card follows hand weights (statistical, fixed seeds)', () => {
    let ore = 0
    const N = 3000
    for (let i = 0; i < N; i++) {
      const s = rolled7({ p2: { ore: 3, wool: 1 } }, { buildings: [[vA, 'p2']] })
      s.rngState = i * 7919 + 1
      const r = act(s, { type: 'MOVE_ROBBER', tile: t })
      if (hand(r, 'p1').ore === 1) ore++
    }
    expect(Math.abs(ore / N - 0.75)).toBeLessThan(0.03)
  })
})

describe('Friendly Robber (G2.4)', () => {
  const t = '1,-1' as TileId
  const [vA] = topo.tileVertices[t]
  const robberPhase = { kind: 'moveRobber' as const, source: 'seven' as const, resume: 'actions' as const }
  it('protects tiles touching a player under 3 public VP, even with a VP card in hand', () => {
    const s = fixture({ friendly: true, buildings: [[vA, 'p2']], hands: { p2: { ore: 2 } }, phase: robberPhase })
    s.players[1].devCards.push({ id: 99, type: 'victoryPoint', boughtOnTurn: 1 })
    expect(publicVP(s, 'p2')).toBe(1)
    expect(code(apply(s, 'p1', { type: 'MOVE_ROBBER', tile: t }))).toBe('ROBBER_PROTECTED')
    expect(legalActions(s, 'p1').some((a) => (a as { tile?: string }).tile === t)).toBe(false)
  })
  it('a player with 3+ public VP can be blocked and robbed', () => {
    const others = topo.vertices.filter((v) => !topo.tileVertices[t].includes(v) && !topo.vertexNeighbors[vA].includes(v)).slice(0, 40)
    const far = others.filter((v, i) => others.slice(0, i).every((u) => !topo.vertexNeighbors[u].includes(v)))
    const s = fixture({ friendly: true, buildings: [[vA, 'p2'], [far[0], 'p2', 'city']], hands: { p2: { ore: 2 } }, phase: robberPhase })
    expect(publicVP(s, 'p2')).toBe(3)
    expect(apply(s, 'p1', { type: 'MOVE_ROBBER', tile: t }).ok).toBe(true)
  })
  it("the mover's own buildings don't protect a tile; the desert is always allowed", () => {
    const s = fixture({ friendly: true, buildings: [[vA, 'p1']], phase: robberPhase })
    s.robber = '1,0'
    expect(apply(s, 'p1', { type: 'MOVE_ROBBER', tile: t }).ok).toBe(true)
    expect(apply(s, 'p1', { type: 'MOVE_ROBBER', tile: '0,0' }).ok).toBe(true)
  })
  it('D14: robber on the desert and every other tile protected → it stays, no steal', () => {
    // six vertices that exactly cover the 18 non-desert tiles; three opponents with 2 settlements (2 VP) each
    const cover: [VertexId, PlayerId][] = [['-1,-1,S', 'p2'], ['-2,2,N', 'p2'], ['0,-1,N', 'p3'], ['0,1,S', 'p3'], ['1,1,N', 'p4'], ['2,-2,S', 'p4']]
    const s = fixture({ friendly: true, buildings: cover, hands: { p2: { ore: 2 } }, phase: robberPhase })
    expect(s.robber).toBe('0,0')
    expect(legalActions(s, 'p1')).toEqual([{ type: 'MOVE_ROBBER', tile: '0,0' }])
    const r = must(apply(s, 'p1', { type: 'MOVE_ROBBER', tile: '0,0' }))
    expect(r.state.robber).toBe('0,0')
    expect(r.state.phase.kind).toBe('actions')
    expect(r.events.some((e) => e.type === 'CARD_STOLEN')).toBe(false)
    // without Friendly Robber the same move is illegal
    const off = draft(s); off.settings.friendlyRobber = false
    expect(code(apply(off, 'p1', { type: 'MOVE_ROBBER', tile: '0,0' }))).toBe('ROBBER_SAME_TILE')
  })
})

describe('Longest Road (G2.5)', () => {
  it('counts a loop of 6 as 6 and a fork by its longest branch', () => {
    const ring = topo.tileEdges['0,0']
    const s = fixture({ roads: ring.map((e) => [e, 'p1'] as [EdgeId, PlayerId]) })
    expect(longestRoad(s, 'p1')).toBe(6)
    const start = topo.tileVertices['0,0'][0]
    const out = topo.vertexEdges[start].find((e) => !ring.includes(e))!
    s.roads[out] = 'p1'
    expect(longestRoad(s, 'p1')).toBe(7) // loop + spur: a trail can go around and out
  })
  it('first to 5 takes it; a 5-vs-5 tie keeps the holder; strictly more steals it', () => {
    expect(resolveLongestRoad(null, { p1: 5, p2: 4, p3: 0, p4: 0 }, PLAYER_IDS)).toBe('p1')
    expect(resolveLongestRoad('p1', { p1: 5, p2: 5, p3: 0, p4: 0 }, PLAYER_IDS)).toBe('p1')
    expect(resolveLongestRoad('p1', { p1: 5, p2: 6, p3: 0, p4: 0 }, PLAYER_IDS)).toBe('p2')
    expect(resolveLongestRoad(null, { p1: 4, p2: 4, p3: 0, p4: 0 }, PLAYER_IDS)).toBeNull()
  })
  it('broken road: unique leader takes it, a tie sets it aside, below 5 nobody holds it', () => {
    expect(resolveLongestRoad('p1', { p1: 4, p2: 6, p3: 6, p4: 0 }, PLAYER_IDS)).toBeNull()
    expect(resolveLongestRoad('p1', { p1: 4, p2: 6, p3: 5, p4: 0 }, PLAYER_IDS)).toBe('p2')
    expect(resolveLongestRoad('p1', { p1: 3, p2: 4, p3: 0, p4: 0 }, PLAYER_IDS)).toBeNull()
  })
  it("an opponent's settlement splits 7 into 3 + 4 and takes the award away; own settlement doesn't", () => {
    const start = '0,-2,N' as VertexId
    const edges = path(start, 7)
    const vs = pathVertices(start, edges)
    let s = fixture({ roads: edges.map((e) => [e, 'p1'] as [EdgeId, PlayerId]) })
    s.longestRoad = 'p1'
    expect(longestRoad(s, 'p1')).toBe(7)
    const own = draft(s); own.buildings[vs[3]] = { owner: 'p1', type: 'settlement' }
    expect(longestRoad(own, 'p1')).toBe(7)
    // p2 builds a settlement on the 4th vertex, connected via its own road
    const spur = topo.vertexEdges[vs[3]].find((e) => !edges.includes(e))!
    s.roads[spur] = 'p2'; s.players[1].pieces.roads -= 1
    s.players[1].resources = { lumber: 1, brick: 1, wool: 1, grain: 1, ore: 0 }
    s.bank = { lumber: 18, brick: 18, wool: 18, grain: 18, ore: 19 }
    s.active = 1
    const r = must(apply(s, 'p2', { type: 'BUILD_SETTLEMENT', vertex: vs[3] }))
    expect(longestRoad(r.state, 'p1')).toBe(4)
    expect(r.state.longestRoad).toBeNull()
    expect(r.events).toContainEqual({ type: 'AWARD_CHANGED', award: 'longestRoad', from: 'p1', to: null })
  })
  it('building the 5th road awards it and adds 2 VP', () => {
    const start = '0,-2,N' as VertexId
    const edges = path(start, 5)
    const s = fixture({ hands: { p1: lots }, buildings: [[start, 'p1']], roads: edges.slice(0, 4).map((e) => [e, 'p1'] as [EdgeId, PlayerId]) })
    const vp0 = publicVP(s, 'p1')
    const r = must(apply(s, 'p1', { type: 'BUILD_ROAD', edge: edges[4] }))
    expect(r.state.longestRoad).toBe('p1')
    expect(publicVP(r.state, 'p1')).toBe(vp0 + 2)
  })
})

describe('Largest Army (G2.6)', () => {
  it('3 knights takes it; a tie keeps the holder; strictly more steals it', () => {
    expect(resolveLargestArmy(null, { p1: 2, p2: 0, p3: 0, p4: 0 }, 'p1')).toBeNull()
    expect(resolveLargestArmy(null, { p1: 3, p2: 0, p3: 0, p4: 0 }, 'p1')).toBe('p1')
    expect(resolveLargestArmy('p1', { p1: 3, p2: 3, p3: 0, p4: 0 }, 'p2')).toBe('p1')
    expect(resolveLargestArmy('p1', { p1: 3, p2: 4, p3: 0, p4: 0 }, 'p2')).toBe('p2')
  })
})

describe('G2 exit: random legal fuzzer', () => {
  it('150 seeded games × 60 turns: invariants, award consistency, legal ⊆ validate', () => {
    let builds = 0, sevens = 0
    for (let g = 0; g < 150; g++) {
      const rng = createRng(1000 + g)
      let s = playSetup(newGame(g, { boardPreset: g % 2 ? 'random' : 'standard-fixed' }), g)
      let steps = 0
      while (s.turn < 60 && s.phase.kind !== 'gameOver' && steps++ < 20000) {
        const p = waiting(s)[0]
        const legal = legalActions(s, p)
        // bias: build when possible, otherwise end the turn
        const builds_ = legal.filter((a) => a.type.startsWith('BUILD_'))
        const a = concretize(s, p, builds_.length && rng.next() < 0.8 ? builds_[pick(rng, builds_.length)] : legal[pick(rng, legal.length)], rng)
        if (g < 30) expect(validate(s, p, a).ok).toBe(true)
        if (a.type.startsWith('BUILD_')) builds++
        if (a.type === 'MOVE_ROBBER') sevens++
        s = act(s, a, p)
        assertInvariants(s)
        // award consistency: recomputing from scratch leaves the holder unchanged
        const len = {} as Record<PlayerId, number>
        for (const id of s.order) len[id] = longestRoad(s, id)
        expect(resolveLongestRoad(s.longestRoad, len, s.order)).toBe(s.longestRoad)
      }
    }
    expect(builds).toBeGreaterThan(500)
    expect(sevens).toBeGreaterThan(50)
  }, 30000)
})


describe('engine speed (§23.1 target: apply < 1 ms, legalActions < 5 ms)', () => {
  it('measures a mid-game position', () => {
    const rng = createRng(5)
    let s = playSetup(newGame(5), 5)
    while (s.turn < 40) {
      const p = waiting(s)[0]
      const legal = legalActions(s, p)
      const b = legal.filter((a) => a.type.startsWith('BUILD_'))
      s = act(s, concretize(s, p, b.length ? b[0] : legal[pick(rng, legal.length)], rng), p)
    }
    if (s.phase.kind === 'preRoll') s = act(s, { type: 'ROLL' })
    s = resolvePending(s)
    expect(s.phase.kind).toBe('actions')
    const p0 = s.players.find((x) => x.id === waiting(s)[0])!
    for (const r of RESOURCE_ORDER) { const n = Math.min(3, s.bank[r]); p0.resources[r] += n; s.bank[r] -= n } // enough to enumerate builds
    expect(legalActions(s, p0.id).length).toBeGreaterThan(3)
    const N = 300
    let t0 = performance.now()
    for (let i = 0; i < N; i++) legalActions(s, waiting(s)[0])
    const legalMs = (performance.now() - t0) / N
    const a = concretize(s, waiting(s)[0], legalActions(s, waiting(s)[0])[0])
    t0 = performance.now()
    for (let i = 0; i < N; i++) apply(s, waiting(s)[0], a)
    const applyMs = (performance.now() - t0) / N
    console.info(`legalActions ${legalMs.toFixed(3)} ms, apply ${applyMs.toFixed(3)} ms (desktop)`)
    expect(legalMs).toBeLessThan(5)
    expect(applyMs).toBeLessThan(1)
  })
})
