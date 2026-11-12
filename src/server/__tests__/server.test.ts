/// <reference types="node" />
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { startServer, type RunningServer } from '../server'
import type { ServerMessage } from '../../net/protocol'
import { botMove } from '../../game/__tests__/helpers'
import { createRng } from '../../game/rng'
import type { PlayerId } from '../../game'

/** a test client: queues every message; `next` waits for the next one of a type */
class Client {
  readonly got: ServerMessage[] = []
  private waiters: (() => void)[] = []
  private read = 0
  readonly ws: WebSocket
  constructor(url: string) {
    this.ws = new WebSocket(url)
    this.ws.on('message', (d) => { this.got.push(JSON.parse(d.toString())); this.waiters.splice(0).forEach((w) => w()) })
  }
  open() { return new Promise<void>((ok, bad) => { this.ws.once('open', () => ok()); this.ws.once('error', bad) }) }
  send(m: unknown) { this.ws.send(typeof m === 'string' ? m : JSON.stringify(m)) }
  async next<T extends ServerMessage['type']>(type?: T, ms = 2000): Promise<Extract<ServerMessage, { type: T }>> {
    const deadline = Date.now() + ms
    for (;;) {
      while (this.read < this.got.length) {
        const m = this.got[this.read++]
        if (!type || m.type === type) return m as Extract<ServerMessage, { type: T }>
      }
      if (Date.now() > deadline) throw new Error(`timeout waiting for ${type}`)
      await new Promise<void>((w) => { this.waiters.push(w); setTimeout(w, 50) })
    }
  }
  close() { this.ws.close() }
}

let server: RunningServer | null = null
afterEach(async () => { await server?.close(); server = null })

const boot = async () => {
  server = await startServer({ port: 0, room: { settings: { boardPreset: 'standard-fixed' } } })
  const base = `http://127.0.0.1:${server.port}`
  const url = `ws://127.0.0.1:${server.port}/ws`
  return { base, url }
}
const connect = async (url: string) => { const c = new Client(url); await c.open(); return c }

describe('WebSocket server', () => {
  it('serves health and creates rooms over HTTP', async () => {
    const { base } = await boot()
    expect(await (await fetch(`${base}/health`)).json()).toEqual({ ok: true, rooms: 0 })
    const r = await fetch(`${base}/rooms`, { method: 'POST' })
    expect(r.status).toBe(201)
    const { roomId } = await r.json() as { roomId: string }
    expect(roomId).toMatch(/^[a-z0-9]{1,10}$/)
    expect(server!.rooms.has(roomId)).toBe(true)
    expect((await fetch(`${base}/nope`)).status).toBe(404)
  })

  it('needs a join to a known room first; rejects junk and binary frames', async () => {
    const { url } = await boot()
    const c = await connect(url)
    c.send({ type: 'start' })
    expect((await c.next('error')).code).toBe('NOT_JOINED')
    c.send({ type: 'join', roomId: 'missing' })
    expect((await c.next('error')).code).toBe('NO_ROOM')
    c.send('{not json')
    expect((await c.next('rejected')).error.code).toBe('MALFORMED_ACTION')
    c.ws.send(Buffer.from([1, 2, 3]))
    expect((await c.next('rejected')).error.code).toBe('MALFORMED_ACTION')
    // an oversized frame closes the socket (ws maxPayload)
    const closed = new Promise<number>((ok) => c.ws.once('close', (code) => ok(code)))
    c.send('x'.repeat(20000))
    expect(await closed).toBe(1009)
  })

  it('reconnecting with the seat token in the lobby retakes the seat; closing updates presence', async () => {
    const { url } = await boot()
    const room = server!.createRoom()
    const a = await connect(url), b = await connect(url)
    a.send({ type: 'join', roomId: room.id, claim: true })
    const wa = await a.next('welcome')
    expect(wa).toMatchObject({ you: 'p1', host: true })
    b.send({ type: 'join', roomId: room.id, claim: true })
    const wb = await b.next('welcome')
    b.close()
    // a hears p2 go offline
    for (;;) { const l = await a.next('lobby'); if (l.seats[1].taken && !l.seats[1].connected) break }
    const b2 = await connect(url)
    b2.send({ type: 'join', roomId: room.id, token: wb.token })
    expect(await b2.next('welcome')).toMatchObject({ you: 'p2', host: false })
    a.close(); b2.close()
  })

  it('plays a full game over real sockets to gameOver, each socket seeing only its own view', async () => {
    const { url } = await boot()
    const room = server!.createRoom()
    const clients: Client[] = []
    const seatOf = new Map<Client, PlayerId>()
    for (let i = 0; i < 4; i++) {
      const c = await connect(url)
      c.send({ type: 'join', roomId: room.id, claim: true })
      seatOf.set(c, (await c.next('welcome')).you as PlayerId)
      clients.push(c)
    }
    const spectator = await connect(url)
    spectator.send({ type: 'join', roomId: room.id })
    expect((await spectator.next('welcome')).you).toBe('spectator')

    clients[0].send({ type: 'start' })
    for (const c of [...clients, spectator]) expect((await c.next('snapshot')).seq).toBe(0)
    const bySeat = new Map([...seatOf].map(([c, p]) => [p, c]))
    const seq = new Map(clients.map((c) => [c, 0]))
    const rng = createRng(777)
    let steps = 0
    while (room.game!.phase.kind !== 'gameOver' && steps++ < 60000) {
      const expected = room.game!.actionCount + 1
      const [p, action] = botMove(room.game!, rng)
      const c = bySeat.get(p)!
      c.send({ type: 'action', clientSeq: seq.get(c)!, action })
      seq.set(c, seq.get(c)! + 1)
      // the actor's queue also holds updates from other seats' moves; wait for this one
      for (;;) {
        const m = await c.next()
        expect(m.type).toBe('update')
        if (m.type === 'update' && m.seq === expected) break
        if (m.type === 'update') expect(m.seq).toBeLessThan(expected)
      }
    }
    const end = room.game!
    expect(end.phase.kind).toBe('gameOver')
    // every socket got every update in order, with only its own hand, and the seed at the end
    await new Promise((w) => setTimeout(w, 100))
    for (const c of [...clients, spectator]) {
      const ups = c.got.filter((m) => m.type === 'update')
      expect(ups.map((m) => m.seq)).toEqual(Array.from({ length: end.actionCount }, (_, i) => i + 1))
      const me = seatOf.get(c) ?? 'spectator'
      for (const m of ups) {
        expect(m.view.viewer).toBe(me)
        for (const pl of m.view.players) if (pl.id !== me) expect(pl.resources).toBeUndefined()
      }
      const last = ups[ups.length - 1]
      expect(last.view.settings.seed).toBe(end.settings.seed)
      expect(ups.slice(0, -1).every((m) => m.view.settings.seed === undefined)).toBe(true)
      expect(c.got.some((m) => m.type === 'rejected' || m.type === 'error')).toBe(false)
    }
    for (const c of [...clients, spectator]) c.close()
  }, 60000)
})

describe('WebSocket server G5.4', () => {
  it('the heartbeat drops a socket that stopped answering, and the room sees it go away', async () => {
    server = await startServer({ port: 0, heartbeatMs: 40 })
    const url = `ws://127.0.0.1:${server.port}/ws`
    const room = server.createRoom()
    const a = await connect(url), b = await connect(url)
    a.send({ type: 'join', roomId: room.id, claim: true }); await a.next('welcome')
    b.send({ type: 'join', roomId: room.id, claim: true }); await b.next('welcome')
    // b's machine goes to sleep: its socket stops reading, so no pong comes back
    ;(b.ws as unknown as { _socket: { pause(): void } })._socket.pause()
    for (;;) { const l = await a.next('lobby', 2000); if (l.seats[1].taken && !l.seats[1].connected) break }
    expect(server.sockets.size).toBe(1)
    a.close()
  })

  it('a replaced connection is closed with code 4000', async () => {
    const { url } = await boot()
    const room = server!.createRoom()
    const a = await connect(url)
    a.send({ type: 'join', roomId: room.id, claim: true })
    const { token } = await a.next('welcome')
    const closed = new Promise<number>((ok) => a.ws.once('close', (code) => ok(code)))
    const a2 = await connect(url)
    a2.send({ type: 'join', roomId: room.id, token })
    expect((await a2.next('welcome')).you).toBe('p1')
    expect((await a.next('error')).code).toBe('REPLACED')
    expect(await closed).toBe(4000)
    a2.close()
  })
})
