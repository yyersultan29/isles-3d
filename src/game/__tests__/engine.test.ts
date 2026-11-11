// G1.6–G1.9 + G1.11: game creation, setup, turn skeleton, production, errors, views, determinism.
import { describe, expect, it } from 'vitest'
import { apply, createGame, legalActions, validate } from '../engine'
import { eventsFor, viewFor } from '../view'
import { produce } from '../rules/production'
import { activeId, draft } from '../state'
import type { Action, EdgeId, GameEvent, GameState, PlayerId, VertexId } from '../types'
import { PLAYER_IDS } from '../types'
import { act, assertInvariants, deepFreeze, must, newGame, playSetup } from './helpers'

const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? 'OK' : r.error!.code)

describe('createGame (G1.6)', () => {
  it('starts in setup with bank 19×5, 25-card deck, 15/5/4 pieces, robber on the desert', () => {
    const s = newGame(1)
    expect(s.phase).toEqual({ kind: 'setup', round: 1, step: 'settlement' })
    expect(Object.values(s.bank)).toEqual([19, 19, 19, 19, 19])
    expect(s.deck).toHaveLength(25)
    const byType = s.deck.reduce<Record<string, number>>((m, c) => ({ ...m, [c.type]: (m[c.type] ?? 0) + 1 }), {})
    expect(byType).toEqual({ knight: 14, roadBuilding: 2, yearOfPlenty: 2, monopoly: 2, victoryPoint: 5 })
    for (const p of s.players) expect(p.pieces).toEqual({ roads: 15, settlements: 5, cities: 4 })
    expect(s.board.tiles[s.robber].terrain).toBe('desert')
    expect([...s.order].sort()).toEqual([...PLAYER_IDS])
    expect(s.turn).toBe(0)
  })
  it('is deterministic per seed and seats players by seeded shuffle', () => {
    expect(newGame(7)).toEqual(newGame(7))
    const orders = new Set(Array.from({ length: 40 }, (_, i) => newGame(i).order.join()))
    expect(orders.size).toBeGreaterThan(10)
  })
  it('validates settings', () => {
    for (const bad of [{ vpToWin: 2 }, { vpToWin: 10.5 }, { discardLimit: 1 }, { seed: -1 }, { seed: 2 ** 32 }, { boardPreset: 'huge' as never }, { friendlyRobber: 'yes' as never }])
      expect(code(createGame({ seed: 1, ...bad }))).toBe('INVALID_SETTINGS')
    expect(createGame({ seed: 0, boardPreset: 'random', vpToWin: 15, discardLimit: 9, friendlyRobber: true }).ok).toBe(true)
  })
})

describe('setup (G1.7)', () => {
  it('follows the snake order: forward then reverse', () => {
    let s = newGame(3)
    const seen: PlayerId[] = []
    while (s.phase.kind === 'setup') {
      if (s.phase.step === 'settlement') seen.push(activeId(s))
      s = act(s, legalActions(s, activeId(s))[0] as Action)
    }
    const o = newGame(3).order
    expect(seen).toEqual([o[0], o[1], o[2], o[3], o[3], o[2], o[1], o[0]])
    expect(s.phase).toEqual({ kind: 'preRoll' })
    expect(s.turn).toBe(1)
    expect(activeId(s)).toBe(o[0])
  })
  it('enforces the distance rule and occupancy', () => {
    let s = newGame(1)
    const v = '0,-1,N' as VertexId
    s = act(s, { type: 'PLACE_SETTLEMENT', vertex: v })
    s = act(s, { type: 'PLACE_ROAD', edge: s.board.topo.vertexEdges[v][0] })
    const neighbour = s.board.topo.vertexNeighbors[v][0]
    expect(code(apply(s, activeId(s), { type: 'PLACE_SETTLEMENT', vertex: neighbour }))).toBe('DISTANCE_RULE')
    expect(code(apply(s, activeId(s), { type: 'PLACE_SETTLEMENT', vertex: v }))).toBe('OCCUPIED')
    expect(code(apply(s, activeId(s), { type: 'PLACE_SETTLEMENT', vertex: '9,9,N' }))).toBe('UNKNOWN_LOCATION')
  })
  it('requires the setup road to touch the settlement just placed', () => {
    let s = newGame(1)
    s = act(s, { type: 'PLACE_SETTLEMENT', vertex: '0,-1,N' })
    const far = s.board.topo.edges.find((e) => !s.board.topo.edgeVertices[e].includes('0,-1,N'))!
    expect(code(apply(s, activeId(s), { type: 'PLACE_ROAD', edge: far }))).toBe('NOT_CONNECTED')
    expect(legalActions(s, activeId(s)).every((a) => a.type === 'PLACE_ROAD' && s.board.topo.edgeVertices[(a as { edge: EdgeId }).edge].includes('0,-1,N'))).toBe(true)
  })
  it('gives one resource per adjacent producing tile for the 2nd settlement only, none for the desert', () => {
    let s = newGame(1)
    // round 1: four settlements far from the desert corner '0,0,N'
    for (let i = 0; i < 4; i++) {
      const v = legalActions(s, activeId(s)).map((a) => (a as { vertex: VertexId }).vertex).find((x) => !s.board.topo.vertexTiles[x].includes('0,0'))!
      s = act(s, { type: 'PLACE_SETTLEMENT', vertex: v })
      s = act(s, legalActions(s, activeId(s))[0] as Action)
    }
    expect(s.players.every((p) => Object.values(p.resources).every((n) => n === 0))).toBe(true)
    // round 2, first placer: the desert's N corner touches the desert and two producing tiles
    const p = activeId(s)
    const r = must(apply(s, p, { type: 'PLACE_SETTLEMENT', vertex: '0,0,N' }))
    const gained = Object.values(r.state.players.find((x) => x.id === p)!.resources).reduce((a, b) => a + b, 0)
    const producing = r.state.board.topo.vertexTiles['0,0,N'].filter((t) => r.state.board.tiles[t].terrain !== 'desert').length
    expect(gained).toBe(producing)
    expect(r.events.some((e) => e.type === 'SETUP_RESOURCES')).toBe(true)
    assertInvariants(r.state)
  })
  it('rejects ROLL, END_TURN and other players during setup', () => {
    const s = newGame(1)
    expect(code(apply(s, activeId(s), { type: 'ROLL' }))).toBe('WRONG_PHASE')
    expect(code(apply(s, activeId(s), { type: 'BUY_DEV' }))).toBe('WRONG_PHASE')
    const other = s.order[1]
    expect(code(apply(s, other, { type: 'PLACE_SETTLEMENT', vertex: '0,-1,N' }))).toBe('NOT_YOUR_TURN')
  })
})

describe('turns and dice (G1.8)', () => {
  it('ROLL → actions → END_TURN advances the player and the turn counter', () => {
    let s = playSetup(newGame(4))
    const first = activeId(s)
    const r = must(apply(s, first, { type: 'ROLL' }))
    expect(r.state.dice).not.toBeNull()
    expect(r.state.phase.kind).toBe('actions')
    expect(code(apply(r.state, first, { type: 'ROLL' }))).toBe('WRONG_PHASE')
    s = act(r.state, { type: 'END_TURN' })
    expect(s.turn).toBe(2)
    expect(activeId(s)).toBe(s.order[1])
    expect(s.phase).toEqual({ kind: 'preRoll' })
    expect(s.dice).toBeNull()
  })
  it('dice are two d6 in order and sums cover 2–12', () => {
    let s = playSetup(newGame(5))
    const sums = new Set<number>()
    for (let i = 0; i < 300; i++) {
      const r = must(apply(s, activeId(s), { type: 'ROLL' }))
      const [a, b] = r.state.dice!
      expect(a).toBeGreaterThanOrEqual(1); expect(b).toBeLessThanOrEqual(6)
      sums.add(a + b)
      s = act(r.state, { type: 'END_TURN' })
    }
    expect(sums.size).toBe(11)
  })
  it('never mutates its input and leaves state unchanged on errors', () => {
    const s = deepFreeze(playSetup(newGame(6)))
    const copy = structuredClone(s)
    expect(apply(s, activeId(s), { type: 'ROLL' }).ok).toBe(true)
    expect(code(apply(s, activeId(s), { type: 'END_TURN' }))).toBe('WRONG_PHASE')
    expect(s).toEqual(copy)
  })
  it('rejects malformed actions and unknown players', () => {
    const s = playSetup(newGame(6))
    expect(code(apply(s, activeId(s), { type: 'NOPE' } as never))).toBe('MALFORMED_ACTION')
    expect(code(apply(s, activeId(s), { type: 'PLACE_ROAD', edge: 'x' } as never))).toBe('MALFORMED_ACTION')
    expect(code(apply(s, 'p9' as PlayerId, { type: 'ROLL' }))).toBe('MALFORMED_ACTION')
    expect(code(apply(s, activeId(s), null as never))).toBe('MALFORMED_ACTION')
  })
  it('validation order: schema before phase before actor', () => {
    const s = playSetup(newGame(6))
    const other = s.order[2]
    expect(code(apply(s, other, { type: 'BOGUS' } as never))).toBe('MALFORMED_ACTION')
    expect(code(apply(s, other, { type: 'END_TURN' }))).toBe('WRONG_PHASE')
    expect(code(apply(s, other, { type: 'ROLL' }))).toBe('NOT_YOUR_TURN')
  })
  it('rejects every action after game over', () => {
    const s = draft(playSetup(newGame(6)))
    s.phase = { kind: 'gameOver', winner: 'p1' }
    expect(code(apply(s, activeId(s), { type: 'ROLL' }))).toBe('GAME_OVER')
    expect(legalActions(s, activeId(s))).toEqual([])
  })
})

describe('production (G1.9)', () => {
  // standard-fixed: tile 1,-1 is hills 9; its N corner is '1,-1,N'
  function withBuildings(list: [VertexId, PlayerId, 'settlement' | 'city'][], bank?: Partial<GameState['bank']>): GameState {
    const s = draft(newGame(1))
    s.phase = { kind: 'actions' }
    for (const [v, owner, type] of list) s.buildings[v] = { owner, type }
    Object.assign(s.bank, bank)
    return s
  }
  const hills9N = '1,-1,N' as VertexId
  const hills9S = '1,-1,S' as VertexId
  it('settlement yields 1, city 2, other numbers nothing', () => {
    const s = withBuildings([[hills9N, 'p1', 'settlement'], [hills9S, 'p2', 'city']])
    expect(produce(s, 9).gains).toEqual({ p1: { brick: 1 }, p2: { brick: 2 } })
    expect(produce(s, 8).gains.p1?.brick).toBeUndefined()
  })
  it('the robber blocks only its tile', () => {
    const s = withBuildings([[hills9N, 'p1', 'settlement']])
    s.robber = '1,-1'
    expect(produce(s, 9).gains).toEqual({})
  })
  it('two tiles with the same number both produce; one vertex on two of them sums', () => {
    // tokens 8: 2,-2 (fields) and 0,2 (fields)
    const s = withBuildings([['2,-2,N', 'p1', 'settlement'], ['0,2,S', 'p2', 'settlement']])
    expect(produce(s, 8).gains).toEqual({ p1: { grain: 1 }, p2: { grain: 1 } })
  })
  it('bank shortage: single recipient takes what is left; several get nothing; other resources still pay', () => {
    const one = withBuildings([[hills9N, 'p1', 'city']], { brick: 1 })
    expect(produce(one, 9)).toEqual({ gains: { p1: { brick: 1 } }, shortfall: ['brick'] })
    const two = withBuildings([[hills9N, 'p1', 'settlement'], [hills9S, 'p2', 'settlement']], { brick: 1 })
    expect(produce(two, 9)).toEqual({ gains: {}, shortfall: ['brick'] })
    const empty = withBuildings([[hills9N, 'p1', 'settlement']], { brick: 0 })
    expect(produce(empty, 9).gains).toEqual({})
    // 9 hits hills 1,-1 and pasture 1,1: brick is short for two players, wool still pays
    const mixed = withBuildings([[hills9N, 'p1', 'settlement'], [hills9S, 'p2', 'settlement'], ['1,1,S', 'p3', 'settlement']], { brick: 1 })
    expect(produce(mixed, 9)).toEqual({ gains: { p3: { wool: 1 } }, shortfall: ['brick'] })
  })
})

describe('legalActions contract, views and determinism (G1.8, G1.11)', () => {
  it('every legal action validates, through setup and 50 turns', () => {
    let s = newGame(11, { boardPreset: 'random' })
    let steps = 0
    while (s.turn < 50 && steps++ < 1000) {
      const legal = legalActions(s, activeId(s)) as Action[]
      for (const a of legal) expect(validate(s, activeId(s), a).ok).toBe(true)
      for (const p of PLAYER_IDS) if (p !== activeId(s)) expect(legalActions(s, p)).toEqual([])
      s = act(s, legal[0])
      assertInvariants(s)
    }
    expect(s.turn).toBe(50)
  })
  it('views never contain secrets; own hand is visible only to its owner', () => {
    let s = playSetup(newGame(12))
    s = act(s, { type: 'ROLL' })
    for (const viewer of [...PLAYER_IDS, 'spectator' as const]) {
      const v = viewFor(s, viewer)
      const json = JSON.stringify(v)
      expect(json).not.toContain('rngState')
      expect(json).not.toMatch(/"deck"/)
      expect(v.settings.seed).toBeUndefined()
      for (const p of v.players) {
        expect(p.resources !== undefined).toBe(p.id === viewer)
        expect(p.devCards !== undefined).toBe(p.id === viewer)
      }
    }
    const over = draft(s); over.phase = { kind: 'gameOver', winner: 'p1' }
    expect(viewFor(over, 'spectator').settings.seed).toBe(12)
  })
  it('eventsFor redacts stolen resources and bought cards', () => {
    const evs: GameEvent[] = [
      { type: 'CARD_STOLEN', from: 'p1', to: 'p2', resource: 'ore' },
      { type: 'DEV_BOUGHT', by: 'p3', card: 'knight' },
    ]
    expect(eventsFor(evs, 'p1')[0]).toMatchObject({ resource: 'ore' })
    expect(eventsFor(evs, 'p4')[0]).toMatchObject({ resource: null })
    expect(eventsFor(evs, 'p3')[1]).toMatchObject({ card: 'knight' })
    expect(eventsFor(evs, 'spectator')[1]).toMatchObject({ card: null })
  })
  it('replay: seed + action log reproduces the final state exactly', () => {
    let s = newGame(21, { boardPreset: 'random' })
    const log: [PlayerId, Action][] = []
    s = playSetup(s, 5)
    // rebuild the setup log by replaying choices deterministically
    let r = newGame(21, { boardPreset: 'random' })
    while (r.phase.kind === 'setup') {
      const next = Object.keys(s.buildings).find((v) => !r.buildings[v as VertexId] && s.buildings[v as VertexId]!.owner === activeId(r) && legalActions(r, activeId(r)).some((a) => (a as { vertex?: string }).vertex === v))
      const a: Action = r.phase.step === 'settlement'
        ? { type: 'PLACE_SETTLEMENT', vertex: next as VertexId }
        : { type: 'PLACE_ROAD', edge: (Object.keys(s.roads) as EdgeId[]).find((e) => !r.roads[e] && s.roads[e] === activeId(r) && legalActions(r, activeId(r)).some((x) => (x as { edge?: string }).edge === e))! }
      log.push([activeId(r), a]); r = act(r, a)
    }
    for (let i = 0; i < 40; i++) {
      for (const a of [{ type: 'ROLL' }, { type: 'END_TURN' }] as Action[]) { log.push([activeId(r), a]); r = act(r, a) }
    }
    let replay = newGame(21, { boardPreset: 'random' })
    for (const [p, a] of log) replay = must(apply(replay, p, a)).state
    expect(replay).toEqual(r)
    expect(r.actionCount).toBe(log.length)
  })
})

describe('G1 exit: headless seeded playout', () => {
  it('plays setup and 200 rolled turns on 20 seeds with invariants holding', () => {
    for (let seed = 100; seed < 120; seed++) {
      let s = playSetup(newGame(seed, { boardPreset: 'random' }), seed)
      for (let t = 0; t < 200; t++) {
        s = act(s, { type: 'ROLL' }); assertInvariants(s)
        s = act(s, { type: 'END_TURN' })
      }
      expect(s.turn).toBe(201)
      // production happened
      expect(s.players.some((p) => Object.values(p.resources).some((n) => n > 0))).toBe(true)
    }
  })
})
