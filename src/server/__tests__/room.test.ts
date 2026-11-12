import { describe, expect, it } from 'vitest'
import { Room, type Outbound } from '../room'
import { parseClientMessage, type ServerMessage } from '../../net/protocol'
import { botMove } from '../../game/__tests__/helpers'
import { createRng } from '../../game/rng'
import type { PlayerId } from '../../game'

// deterministic "crypto" for tests
const counter = (start = 7) => { let n = start; return () => (n = (Math.imul(n, 1664525) + 1013904223) >>> 0) }
const send = (room: Room, conn: string, m: unknown) => room.receive(conn, JSON.stringify(m))
const to = (out: Outbound[], conn: string) => out.filter((o) => o.to === conn).map((o) => o.msg)
const one = <T extends ServerMessage['type']>(out: Outbound[], conn: string, type: T) =>
  to(out, conn).find((m) => m.type === type) as Extract<ServerMessage, { type: T }>

function fullRoom(settings = {}) {
  const room = new Room({ id: 'r1', random32: counter(), settings: { boardPreset: 'standard-fixed', ...settings } })
  const tokens: Record<string, string> = {}
  const seat: Record<string, PlayerId> = {}
  for (const c of ['a', 'b', 'c', 'd']) {
    const w = one(send(room, c, { type: 'join', roomId: 'r1', claim: true }), c, 'welcome')
    tokens[c] = w.token!
    seat[c] = w.you as PlayerId
  }
  return { room, tokens, seat }
}

describe('protocol envelope', () => {
  it('accepts well-formed messages and rejects the rest', () => {
    expect(parseClientMessage('{"type":"start"}')).toEqual({ type: 'start' })
    expect(parseClientMessage('{"type":"action","clientSeq":3,"action":{"type":"END_TURN"}}')?.type).toBe('action')
    for (const bad of ['nope', '[]', 'null', '{"type":"join","roomId":"a b"}', '{"type":"join","roomId":"r","claim":"yes"}',
      '{"type":"action","clientSeq":-1,"action":{"type":"END_TURN"}}', '{"type":"action","clientSeq":1.5,"action":{"type":"END_TURN"}}',
      '{"type":"action","clientSeq":1,"action":"END_TURN"}', '{"type":"hack"}', 'x'.repeat(9000)])
      expect(parseClientMessage(bad)).toBeNull()
  })
})

describe('Room lobby', () => {
  it('gives each claimer a seat and a token, the first claimer hosts, the fifth is a spectator', () => {
    const { room, tokens, seat } = fullRoom()
    expect(Object.values(seat)).toEqual(['p1', 'p2', 'p3', 'p4'])
    expect(new Set(Object.values(tokens)).size).toBe(4)
    for (const t of Object.values(tokens)) expect(t).toMatch(/^[0-9a-f]{32}$/)
    const out = send(room, 'e', { type: 'join', roomId: 'r1', claim: true })
    const w = one(out, 'e', 'welcome')
    expect(w.you).toBe('spectator')
    expect(w.token).toBeUndefined()
    // everyone in the lobby hears about the newcomer
    expect(one(out, 'a', 'lobby').seats.every((s) => s.taken && s.connected)).toBe(true)
    expect(one(out, 'a', 'lobby').host).toBe('p1')
  })

  it('a token retakes its seat on a new connection; a wrong token joins as spectator', () => {
    const { room, tokens } = fullRoom()
    const left = room.leave('b')
    expect(one(left, 'a', 'lobby').seats.find((s) => s.id === 'p2')).toEqual({ id: 'p2', taken: true, connected: false, absent: false })
    expect(one(send(room, 'b2', { type: 'join', roomId: 'r1', token: tokens.b }), 'b2', 'welcome').you).toBe('p2')
    expect(one(send(room, 'x', { type: 'join', roomId: 'r1', token: 'deadbeef' }), 'x', 'welcome').you).toBe('spectator')
    expect(one(send(room, 'y', { type: 'join', roomId: 'other' }), 'y', 'error').code).toBe('NO_ROOM')
  })

  it('only the host starts, only with every seat taken, only once', () => {
    const room = new Room({ id: 'r1', random32: counter() })
    send(room, 'a', { type: 'join', roomId: 'r1', claim: true })
    send(room, 'b', { type: 'join', roomId: 'r1', claim: true })
    expect(one(send(room, 'z', { type: 'start' }), 'z', 'error').code).toBe('NOT_JOINED')
    expect(one(send(room, 'a', { type: 'start' }), 'a', 'error').code).toBe('NOT_READY')
    send(room, 'c', { type: 'join', roomId: 'r1', claim: true })
    send(room, 'd', { type: 'join', roomId: 'r1', claim: true })
    expect(one(send(room, 'b', { type: 'start' }), 'b', 'error').code).toBe('NOT_HOST')
    expect(one(send(room, 'a', { type: 'action', clientSeq: 0, action: { type: 'END_TURN' } }), 'a', 'error').code).toBe('NOT_STARTED')
    const out = send(room, 'a', { type: 'start' })
    expect(out.map((o) => o.to).sort()).toEqual(['a', 'b', 'c', 'd'])
    expect(out.every((o) => o.msg.type === 'snapshot')).toBe(true)
    expect(one(send(room, 'a', { type: 'start' }), 'a', 'error').code).toBe('ALREADY_STARTED')
    // after the start nobody can claim a seat
    expect(one(send(room, 'e', { type: 'join', roomId: 'r1', claim: true }), 'e', 'welcome').you).toBe('spectator')
  })

  it('the seed comes from the injected cryptographic source', () => {
    const { room } = fullRoom()
    send(room, 'a', { type: 'start' })
    const r2 = fullRoom().room
    send(r2, 'a', { type: 'start' })
    expect(room.game!.settings.seed).toBe(r2.game!.settings.seed) // same source → same seed
    const r3 = new Room({ id: 'r1' }) // default: Web Crypto
    for (const c of 'abcd') send(r3, c, { type: 'join', roomId: 'r1', claim: true })
    send(r3, 'a', { type: 'start' })
    expect(Number.isInteger(r3.game!.settings.seed)).toBe(true)
  })
})

describe('Room actions', () => {
  it('rejects out-of-turn and malformed intents to the sender only, without changing the state', () => {
    const { room, tokens, seat } = fullRoom()
    send(room, 'a', { type: 'start' })
    const s0 = room.game!
    const activeConn = Object.keys(seat).find((c) => seat[c] === s0.order[s0.active])!
    const idle = Object.keys(seat).find((c) => c !== activeConn)!
    const out = send(room, idle, { type: 'action', clientSeq: 0, action: { type: 'END_TURN' } })
    expect(out).toHaveLength(1)
    expect(out[0].to).toBe(idle)
    expect(out[0].msg.type).toBe('rejected')
    const bad = send(room, activeConn, { type: 'action', clientSeq: 0, action: { type: 'BUILD_SETTLEMENT', vertex: 99999 } })
    expect(bad).toHaveLength(1)
    expect(bad[0].msg).toMatchObject({ type: 'rejected', clientSeq: 0 })
    expect(send(room, activeConn, 'garbage' as unknown as object)[0].msg).toMatchObject({ type: 'rejected', clientSeq: null, error: { code: 'MALFORMED_ACTION' } })
    expect(room.game).toBe(s0)
    // a spectator cannot act
    send(room, 's', { type: 'join', roomId: 'r1' })
    expect(one(send(room, 's', { type: 'action', clientSeq: 0, action: { type: 'END_TURN' } }), 's', 'error').code).toBe('SPECTATOR')
    void tokens
  })

  it('a retried clientSeq is applied once; an older one is ignored', () => {
    const { room, seat } = fullRoom()
    send(room, 'a', { type: 'start' })
    const s0 = room.game!
    const conn = Object.keys(seat).find((c) => seat[c] === s0.order[s0.active])!
    const [p, action] = botMove(s0, createRng(5))
    expect(p).toBe(seat[conn])
    const first = send(room, conn, { type: 'action', clientSeq: 4, action })
    expect(first.filter((o) => o.msg.type === 'update')).toHaveLength(4) // all four seats
    const after = room.game!
    const retry = send(room, conn, { type: 'action', clientSeq: 4, action })
    expect(room.game).toBe(after)
    expect(retry).toEqual([{ to: conn, msg: expect.objectContaining({ type: 'snapshot', seq: after.actionCount }) }])
    expect(send(room, conn, { type: 'action', clientSeq: 2, action })).toEqual([])
    expect(room.game).toBe(after)
  })
})

describe('Room full game', () => {
  it('a bot game through room messages reaches gameOver without leaking secrets', () => {
    const { room, seat } = fullRoom()
    send(room, 's', { type: 'join', roomId: 'r1' }) // a spectator watches the whole game
    const conns = ['a', 'b', 'c', 'd', 's']
    const viewerOf: Record<string, string> = { ...seat, s: 'spectator' }
    const connOf = Object.fromEntries(Object.entries(seat).map(([c, p]) => [p, c]))
    const seq: Record<string, number> = { a: 0, b: 0, c: 0, d: 0 }
    const lastSeen: Record<string, number> = {}
    const rng = createRng(12345)
    let stolen = 0, redacted = 0, msgs = 0

    const check = (out: Outbound[]) => {
      for (const { to: c, msg } of out) {
        msgs++
        const json = JSON.stringify(msg)
        expect(json).not.toContain('rngState')
        expect(json).not.toMatch(/"deck":/)
        if (msg.type !== 'snapshot' && msg.type !== 'update') continue
        const v = viewerOf[c]
        expect(msg.view.viewer).toBe(v)
        if (msg.view.phase.kind !== 'gameOver') expect(msg.view.settings.seed).toBeUndefined()
        for (const pl of msg.view.players) if (pl.id !== v) { expect(pl.resources).toBeUndefined(); expect(pl.devCards).toBeUndefined() }
        if (v === 'spectator') expect(msg.legal).toEqual([])
        // seq has no gaps per connection
        if (lastSeen[c] !== undefined && msg.type === 'update') expect(msg.seq).toBe(lastSeen[c] + 1)
        lastSeen[c] = msg.seq
        if (msg.type === 'update') for (const e of msg.events) {
          if (e.type === 'CARD_STOLEN') {
            stolen++
            if (v !== e.from && v !== e.to) { expect(e.resource).toBeNull(); redacted++ } else expect(e.resource).not.toBeNull()
          }
          if (e.type === 'DEV_BOUGHT' && v !== e.by) expect(e.card).toBeNull()
        }
      }
    }

    check(send(room, 'a', { type: 'start' }))
    let steps = 0
    while (room.game!.phase.kind !== 'gameOver' && steps++ < 60000) {
      const [p, action] = botMove(room.game!, rng)
      const c = connOf[p]
      const out = send(room, c, { type: 'action', clientSeq: seq[c]++, action })
      expect(out.some((o) => o.msg.type === 'rejected')).toBe(false)
      expect(out.map((o) => o.to).sort()).toEqual(conns.slice().sort())
        check(out)
    }
    const end = room.game!
    expect(end.phase.kind).toBe('gameOver')
    expect(stolen).toBeGreaterThan(0)
    expect(redacted).toBeGreaterThan(0)
    // the seed is revealed to everyone once the game is over
    const final = to(send(room, 'late', { type: 'join', roomId: 'r1' }), 'late')
    expect(final[1]).toMatchObject({ type: 'snapshot', view: { settings: { seed: end.settings.seed } } })
    expect(msgs).toBeGreaterThan(1000)
  })
})

describe('Room G5.4: presence, takeover, resume numbering', () => {
  it('after the start, leaving and rejoining are broadcast as presence', () => {
    const { room, tokens } = fullRoom()
    send(room, 'a', { type: 'start' })
    const left = room.leave('b')
    expect(one(left, 'a', 'presence').seats.find((s) => s.id === 'p2')).toEqual({ id: 'p2', taken: true, connected: false, absent: false })
    expect(left.some((o) => o.msg.type === 'lobby')).toBe(false)
    const back = send(room, 'b2', { type: 'join', roomId: 'r1', token: tokens.b })
    expect(to(back, 'b2').map((m) => m.type)).toEqual(['welcome', 'snapshot', 'presence'])
    expect(one(back, 'c', 'presence').seats.every((s) => s.connected)).toBe(true)
  })

  it('the same seat on a new connection replaces the old one, which is told and closed', () => {
    const { room, tokens } = fullRoom()
    send(room, 'a', { type: 'start' })
    const out = send(room, 'a2', { type: 'join', roomId: 'r1', token: tokens.a })
    expect(out.find((o) => o.to === 'a')).toEqual({ to: 'a', msg: expect.objectContaining({ type: 'error', code: 'REPLACED' }), close: true })
    expect(one(out, 'a2', 'welcome').you).toBe('p1')
    // the old connection no longer speaks for the seat
    expect(one(send(room, 'a', { type: 'action', clientSeq: 0, action: { type: 'END_TURN' } }), 'a', 'error').code).toBe('NOT_JOINED')
    // presence still shows the seat as connected (through a2)
    expect(one(out, 'b', 'presence').seats[0]).toEqual({ id: 'p1', taken: true, connected: true, absent: false })
  })

  it('a rejoin learns the next clientSeq, so a reloaded client is not mistaken for an old retry', () => {
    const { room, tokens, seat } = fullRoom()
    send(room, 'a', { type: 'start' })
    const rng = createRng(9)
    // play a few actions through whoever acts, numbering per connection
    const seqs: Record<string, number> = { a: 0, b: 0, c: 0, d: 0 }
    const connOf = Object.fromEntries(Object.entries(seat).map(([c, p]) => [p, c]))
    for (let i = 0; i < 12; i++) {
      const [p, action] = botMove(room.game!, rng)
      const c = connOf[p]
      expect(send(room, c, { type: 'action', clientSeq: seqs[c]++, action }).some((o) => o.msg.type === 'update')).toBe(true)
    }
    const p = room.game!.order[room.game!.active]
    const c = connOf[p]
    room.leave(c)
    const w = one(send(room, 'fresh', { type: 'join', roomId: 'r1', token: tokens[c] }), 'fresh', 'welcome')
    expect(w.nextSeq).toBe(seqs[c])
    const before = room.game!.actionCount
    const [, action] = botMove(room.game!, rng)
    // a reloaded client that started again from 0 would be ignored; from nextSeq it is applied
    expect(send(room, 'fresh', { type: 'action', clientSeq: 0, action })).toEqual(seqs[c] > 1 ? [] : expect.anything())
    send(room, 'fresh', { type: 'action', clientSeq: w.nextSeq, action })
    expect(room.game!.actionCount).toBe(before + 1)
  })
})

describe('Room G5.4: resume tokens', () => {
  it('a reopened tab takes back an idle seat it held, never a connected one', () => {
    const { room, tokens } = fullRoom()
    send(room, 'a', { type: 'start' })
    // the browser held a and b; both are connected, so a fresh tab is a spectator
    expect(one(send(room, 'x', { type: 'join', roomId: 'r1', resume: [tokens.a, tokens.b] }), 'x', 'welcome').you).toBe('spectator')
    room.leave('x')
    room.leave('b') // b's tab was closed
    const w = one(send(room, 'y', { type: 'join', roomId: 'r1', resume: [tokens.a, tokens.b] }), 'y', 'welcome')
    expect(w.you).toBe('p2')
    expect(w.token).toBe(tokens.b) // the tab learns the token it now holds
    // nothing was taken from a
    expect(one(send(room, 'a', { type: 'action', clientSeq: 99, action: { type: 'END_TURN' } }), 'a', 'rejected')).toBeTruthy()
  })
})
