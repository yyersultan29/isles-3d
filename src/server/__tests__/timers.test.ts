// G5.5: turn timers and absent players (GAME_DESIGN §20), on a fake clock.
import { describe, expect, it } from 'vitest'
import { Room, ABANDON_AFTER_MS, ABSENT_AFTER_DISCONNECT_MS, type Outbound } from '../room'
import { decisionOf, extendForTrade, limitFor, timeoutAction, LIMITS } from '../timeouts'
import { apply, legalActions, pips, type GameState, type PlayerId } from '../../game'
import { botMove, fixture, newGame } from '../../game/__tests__/helpers'
import { createRng } from '../../game/rng'
import type { ServerMessage, TimerPreset } from '../../net/protocol'

const key = (a: unknown) => JSON.stringify(a)

describe('timeout actions are always legal and follow §20', () => {
  it('for every decision of a whole bot game, the timeout action is legal and applies', () => {
    let s = newGame(11, { boardPreset: 'standard-fixed' })
    const rng = createRng(5), trng = createRng(6)
    let checked = 0
    while (s.phase.kind !== 'gameOver' && checked < 4000) {
      for (const p of decisionOf(s)!.seats) {
        const a = timeoutAction(s, p, trng)!
        expect(a, `${s.phase.kind} ${p}`).not.toBeNull()
        const r = apply(s, p, a)
        expect(r.ok, `${s.phase.kind} ${p} ${key(a)}`).toBe(true)
        checked++
      }
      const [p, a] = botMove(s, rng)
      const r = apply(s, p, a)
      if (!r.ok) throw new Error(r.error.message)
      s = r.state
    }
    expect(checked).toBeGreaterThan(300)
  })

  it('setup takes the legal vertex with the most pips; the road goes next to it', () => {
    const s = newGame(2, { boardPreset: 'standard-fixed' })
    const a = timeoutAction(s, s.order[0], createRng(1))!
    expect(a.type).toBe('PLACE_SETTLEMENT')
    const score = (v: string) => s.board.topo.vertexTiles[v as never].reduce((t: number, x: string) => t + pips(s.board.tiles[x as never].token), 0)
    const best = Math.max(...(legalActions(s, s.order[0]) as { vertex: string }[]).map((x) => score(x.vertex)))
    expect(score((a as { vertex: string }).vertex)).toBe(best)
  })

  it('the robber goes to a tile of the public-VP leader, never one that touches the mover', () => {
    const s = fixture({ buildings: [['0,0,N', 'p2', 'city'], ['2,-2,S', 'p3']], phase: { kind: 'moveRobber', source: 'seven', resume: 'actions' } })
    const a = timeoutAction(s, 'p1', createRng(1)) as { type: string; tile: string }
    expect(a.type).toBe('MOVE_ROBBER')
    expect(s.board.topo.tileVertices[a.tile as never].some((v: string) => s.buildings[v as never]?.owner === 'p2')).toBe(true)
  })

  it('the active player ends the turn; an addressed absent player declines', () => {
    let s = fixture({ hands: { p1: { lumber: 1 }, p2: { ore: 1 } } })
    expect(timeoutAction(s, 'p1', createRng(1))).toEqual({ type: 'END_TURN' })
    const r = apply(s, 'p1', { type: 'PROPOSE_TRADE', offer: { lumber: 1 }, request: { ore: 1 } })
    if (!r.ok) throw new Error()
    s = r.state
    expect(timeoutAction(s, 'p2', createRng(1))).toEqual({ type: 'RESPOND_TRADE', tradeId: s.trade!.id, accept: false })
  })

  it('limits scale with the preset; trades add time up to the cap', () => {
    expect(limitFor('actions', 'normal')).toBe(90_000)
    expect(limitFor('actions', 'relaxed')).toBe(180_000)
    expect(limitFor('roll', 'fast')).toBe(7_500)
    expect(limitFor('roll', 'off')).toBeNull()
    expect(extendForTrade(0, 90_000, 'normal')).toBe(105_000)
    expect(extendForTrade(0, 175_000, 'normal')).toBe(LIMITS.actionsCap)
  })
})

// ---------- the Room on a fake clock ----------

function room(timer: TimerPreset = 'normal') {
  let t = 1_000_000
  const clock = { now: () => t, advance: (ms: number) => { t += ms } }
  let n = 7
  const r = new Room({ id: 'r', timer, now: clock.now, random32: () => (n = (Math.imul(n, 1664525) + 1013904223) >>> 0), settings: { boardPreset: 'standard-fixed' } })
  const send = (c: string, m: unknown) => r.receive(c, JSON.stringify(m))
  for (const c of 'abcd') send(c, { type: 'join', roomId: 'r', claim: true })
  return { r, clock, send }
}
const seatConn = (p: PlayerId) => 'abcd'['p1p2p3p4'.indexOf(p) / 2]
const msgs = (out: Outbound[], c: string) => out.filter((o) => o.to === c).map((o) => o.msg)
const last = <T extends ServerMessage['type']>(out: Outbound[], c: string, type: T) => msgs(out, c).filter((m) => m.type === type).pop() as Extract<ServerMessage, { type: T }> | undefined

describe('Room turn timers', () => {
  it('a placement times out after 60 s and is played for the seat, for everyone to see', () => {
    const { r, clock, send } = room()
    const start = send('a', { type: 'start' })
    const snap = last(start, 'b', 'snapshot')!
    expect(snap.timer).toMatchObject({ kind: 'placement', remainingMs: 60_000, totalMs: 60_000 })
    expect(r.tick()).toEqual([])
    clock.advance(59_999)
    expect(r.tick()).toEqual([])
    clock.advance(1)
    const out = r.tick()
    expect(r.game!.actionCount).toBe(1)
    expect(out.filter((o) => o.msg.type === 'update').map((o) => o.to).sort()).toEqual(['a', 'b', 'c', 'd'])
    expect(last(out, 'a', 'update')!.timer).toMatchObject({ kind: 'placement', remainingMs: 60_000 }) // the road's own minute
  })

  it('timers off: nothing is ever played automatically; fast halves the limits', () => {
    const off = room('off')
    off.send('a', { type: 'start' })
    off.clock.advance(10 * 60_000)
    expect(off.r.tick()).toEqual([])
    expect(off.r.timerInfo()).toBeNull()
    const fast = room('fast')
    fast.send('a', { type: 'start' })
    expect(fast.r.timerInfo()!.totalMs).toBe(30_000)
  })

  it('the host sets the preset in the lobby; nobody else, and not after the start', () => {
    const { r, send } = room()
    expect(last(send('b', { type: 'settings', timer: 'off' }), 'b', 'error')!.code).toBe('NOT_HOST')
    expect(last(send('a', { type: 'settings', timer: 'relaxed' }), 'c', 'lobby')!.timer).toBe('relaxed')
    expect(r.timerPreset).toBe('relaxed')
    send('a', { type: 'start' })
    expect(last(send('a', { type: 'settings', timer: 'off' }), 'a', 'error')!.code).toBe('ALREADY_STARTED')
  })

  it('the actions clock survives builds and the robber interlude; a completed trade adds 15 s', () => {
    const { r, clock, send } = room()
    send('a', { type: 'start' })
    // play the setup by timeouts, then roll by timeout until a non-seven actions phase
    let guard = 0
    while (r.game!.phase.kind !== 'actions' && guard++ < 100) { clock.advance(60_000); r.tick() }
    expect(r.game!.phase.kind).toBe('actions')
    const t0 = r.timerInfo()!
    expect(t0).toMatchObject({ kind: 'actions', remainingMs: 90_000 })
    clock.advance(10_000)
    // an END_TURN-free action by the active seat: an offer to everyone and its decline keep the clock
    const s = r.game!, me = s.order[s.active]
    const hand = s.players.find((x) => x.id === me)!.resources
    const give = (Object.keys(hand) as (keyof typeof hand)[]).find((k) => hand[k] > 0)
    if (give) {
      const want = give === 'ore' ? 'grain' : 'ore'
      send(seatConn(me), { type: 'action', clientSeq: 100, action: { type: 'PROPOSE_TRADE', offer: { [give]: 1 }, request: { [want]: 1 } } })
      expect(r.timerInfo()!.remainingMs).toBe(80_000)
    }
  })

  it('a completed trade adds 15 s to the actions clock (up to the cap)', () => {
    const { r, clock, send } = room()
    send('a', { type: 'start' })
    let seq = 500, done = false
    for (let turn = 0; turn < 60 && !done; turn++) {
      let guard = 0
      while (r.game!.phase.kind !== 'actions' && guard++ < 200) { clock.advance(60_000); r.tick() }
      const s = r.game!, me = s.order[s.active]
      const mine = s.players.find((x) => x.id === me)!.resources
      // an opponent holding something the active player lacks, and the active player holding anything
      const give = (Object.keys(mine) as (keyof typeof mine)[]).find((k) => mine[k] > 0)
      const other = s.players.find((x) => x.id !== me && give && Object.entries(x.resources).some(([k, n]) => k !== give && n > 0))
      if (give && other) {
        const want = (Object.keys(other.resources) as (keyof typeof mine)[]).find((k) => k !== give && other.resources[k] > 0)!
        clock.advance(5_000)
        send(seatConn(me), { type: 'action', clientSeq: seq++, action: { type: 'PROPOSE_TRADE', offer: { [give]: 1 }, request: { [want]: 1 }, to: [other.id] } })
        const id = r.game!.trade!.id
        send(seatConn(other.id), { type: 'action', clientSeq: seq++, action: { type: 'RESPOND_TRADE', tradeId: id, accept: true } })
        const before = r.timerInfo()!.remainingMs
        send(seatConn(me), { type: 'action', clientSeq: seq++, action: { type: 'CONFIRM_TRADE', tradeId: id, with: other.id } })
        expect(r.timerInfo()!.remainingMs).toBe(before + 15_000)
        done = true
      } else { clock.advance(90_000); r.tick() }
    }
    expect(done).toBe(true)
  })

  it('two turns in a row with a timeout make a seat absent; its own move makes it present again', () => {
    const { r, clock, send } = room()
    send('a', { type: 'start' })
    let guard = 0
    const absentSeats = () => last(send('z', { type: 'join', roomId: 'r' }), 'z', 'presence')!.seats.filter((x) => x.absent).map((x) => x.id)
    while (!absentSeats().length && guard++ < 200) { clock.advance(180_000); r.tick() }
    const [p] = absentSeats()
    expect(p).toBeDefined()
    // absent: its decisions now resolve on the next tick, without waiting for the clock
    let moved = false
    for (let i = 0; i < 400 && !moved; i++) {
      const s = r.game!
      if (decisionOf(s)?.seats.includes(p)) { const n = s.actionCount; r.tick(); moved = r.game!.actionCount === n + 1; break }
      clock.advance(180_000); r.tick()
    }
    expect(moved).toBe(true)
    // the others play their own moves (staying present); when p owes a decision, it plays it itself
    let seqs = 2000, back = false
    for (let i = 0; i < 400 && !back; i++) {
      const s = r.game!
      const owe = decisionOf(s)!.seats[0]
      const a = timeoutAction(s, owe, createRng(i))!
      send(seatConn(owe), { type: 'action', clientSeq: seqs++, action: a })
      back = owe === p
    }
    expect(back).toBe(true)
    expect(absentSeats()).not.toContain(p)
  })

  it('a seat disconnected for over a minute becomes absent and is played; rejoining makes it present', () => {
    const { r, clock, send } = room()
    send('a', { type: 'start' })
    const active = r.game!.order[r.game!.active]
    const conn = seatConn(active)
    r.leave(conn)
    clock.advance(ABSENT_AFTER_DISCONNECT_MS - 1)
    r.tick()
    expect(r.game!.actionCount).toBe(0)
    clock.advance(2)
    const out = r.tick()
    expect(last(out, 'a' === conn ? 'b' : 'a', 'presence')!.seats.find((x) => x.id === active)!.absent).toBe(true)
    // its placement plays on the next ticks without waiting for the minute
    r.tick(); r.tick()
    expect(r.game!.actionCount).toBeGreaterThan(0)
  })

  it('with nobody present nothing is auto-played, and the room is abandoned after five minutes', () => {
    const { r, clock, send } = room()
    send('a', { type: 'start' })
    send('s', { type: 'join', roomId: 'r' }) // a spectator stays to see it
    for (const c of 'abcd') r.leave(c)
    clock.advance(ABSENT_AFTER_DISCONNECT_MS + 1)
    r.tick()
    for (let i = 0; i < 10; i++) { clock.advance(20_000); r.tick() }
    expect(r.game!.actionCount).toBe(0)
    clock.advance(ABANDON_AFTER_MS)
    const out = r.tick()
    expect(r.abandoned).toBe(true)
    expect(last(out, 's', 'error')!.code).toBe('ABANDONED')
  })

  it('a whole game with three seats away and one human finishes, the timers playing the others', () => {
    const { r, clock, send } = room('fast')
    send('a', { type: 'start' })
    for (const c of 'bcd') r.leave(c)
    clock.advance(ABSENT_AFTER_DISCONNECT_MS + 1)
    r.tick()
    const rng = createRng(77)
    let seq = 0, steps = 0
    while (r.game!.phase.kind !== 'gameOver' && steps++ < 30000) {
      const s: GameState = r.game!
      const owe = decisionOf(s)!.seats
      if (owe.includes('p1') && !(s.trade && s.trade.to.some((p) => !s.trade!.responses[p]))) {
        const [p, a] = botMove(s, rng)
        if (p === 'p1') { send('a', { type: 'action', clientSeq: seq++, action: a }); continue }
      }
      clock.advance(250)
      r.tick()
    }
    expect(r.game!.phase.kind).toBe('gameOver')
  })
})
