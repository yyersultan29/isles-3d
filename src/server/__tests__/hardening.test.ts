/// <reference types="node" />
// G5.6: abuse limits, room cleanup, Origin allowlist, contained failures and log hygiene.
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { startServer, type LogEntry, type RunningServer, type ServerOptions } from '../server'
import { Bucket, Buckets } from '../limits'
import type { ServerMessage } from '../../net/protocol'

class Client {
  readonly got: ServerMessage[] = []
  readonly ws: WebSocket
  readonly closed: Promise<number>
  constructor(url: string, origin?: string, headers?: Record<string, string>) {
    this.ws = new WebSocket(url, { ...(origin ? { origin } : {}), ...(headers ? { headers } : {}) })
    this.ws.on('message', (d) => this.got.push(JSON.parse(d.toString())))
    this.closed = new Promise((ok) => this.ws.once('close', (code) => ok(code)))
  }
  /** resolves on open, rejects with the HTTP status of a refused handshake */
  open() {
    return new Promise<void>((ok, bad) => {
      this.ws.once('open', () => ok())
      this.ws.once('unexpected-response', (_req, res) => bad(new Error(String(res.statusCode))))
      this.ws.once('error', bad)
    })
  }
  send(m: unknown) { this.ws.send(typeof m === 'string' ? m : JSON.stringify(m)) }
  async wait(ok: (m: ServerMessage) => boolean, ms = 2000) {
    const end = Date.now() + ms
    for (;;) {
      const m = this.got.find(ok)
      if (m) return m
      if (Date.now() > end) throw new Error('timeout')
      await new Promise((r) => setTimeout(r, 10))
    }
  }
}

let server: RunningServer | null = null
const clients: Client[] = []
afterEach(async () => {
  for (const c of clients.splice(0)) c.ws.terminate()
  await server?.close()
  server = null
})

const boot = async (o: ServerOptions = {}) => {
  server = await startServer({ port: 0, ...o })
  return { base: `http://127.0.0.1:${server.port}`, url: `ws://127.0.0.1:${server.port}/ws` }
}
const client = (url: string, origin?: string) => { const c = new Client(url, origin); clients.push(c); return c }
const connect = async (url: string, origin?: string) => { const c = client(url, origin); await c.open(); return c }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('limits', () => {
  it('a bucket spends its burst, then refills at its rate; idle keys are forgotten', () => {
    let t = 0
    const b = new Bucket(3, 2, () => t)
    expect([b.take(), b.take(), b.take(), b.take()]).toEqual([true, true, true, false])
    t = 499
    expect(b.take()).toBe(false)
    t = 500
    expect(b.take()).toBe(true)
    const keyed = new Buckets(1, 1, () => t)
    expect([keyed.take('a'), keyed.take('a'), keyed.take('b')]).toEqual([true, false, true])
    keyed.sweep()
    expect(keyed.size).toBe(2)
    t += 1000
    keyed.sweep()
    expect(keyed.size).toBe(0)
  })
})

describe('server hardening G5.6', () => {
  it('frames over the rate get RATE_LIMITED; a flood closes the socket with 1008', async () => {
    const { url } = await boot({ limits: { msgBurst: 3, msgPerSecond: 0.001, dropBurst: 2, dropPerSecond: 0.001 } })
    const room = server!.createRoom()
    const a = await connect(url)
    a.send({ type: 'join', roomId: room.id, claim: true })
    await a.wait((m) => m.type === 'welcome')
    a.send('junk'); a.send('junk') // frames 2 and 3: answered normally
    a.send('junk'); a.send('junk') // dropped twice: RATE_LIMITED
    a.send('junk') // a third drop: closed
    expect(await a.closed).toBe(1008)
    expect(a.got.filter((m) => m.type === 'rejected')).toHaveLength(2)
    expect(a.got.filter((m) => m.type === 'error' && m.code === 'RATE_LIMITED')).toHaveLength(2)
  })

  it('room creation is limited per address (429) and in total (503)', async () => {
    const { base } = await boot({ limits: { roomBurst: 2, roomsPerMinute: 0.001, maxRooms: 100 } })
    const post = () => fetch(`${base}/rooms`, { method: 'POST' })
    expect((await post()).status).toBe(201)
    expect((await post()).status).toBe(201)
    const r = await post()
    expect(r.status).toBe(429)
    expect(r.headers.get('retry-after')).toBe('60')
    await server!.close()
    const second = await boot({ limits: { maxRooms: 1 } })
    expect((await fetch(`${second.base}/rooms`, { method: 'POST' })).status).toBe(201)
    expect((await fetch(`${second.base}/rooms`, { method: 'POST' })).status).toBe(503)
  })

  it('handshakes are refused over the per-address socket cap and the connect rate', async () => {
    const { url } = await boot({ limits: { socketsPerAddress: 2 } })
    await connect(url); await connect(url)
    await expect(connect(url)).rejects.toThrow('429')
    expect(server!.sockets.size).toBe(2)
    await server!.close()
    const second = await boot({ limits: { connectBurst: 1, connectsPerMinute: 0.001 } })
    const one = await connect(second.url)
    one.ws.close(); await one.closed
    await expect(connect(second.url)).rejects.toThrow('429')
    // any other path is not a game socket
    await expect(connect(second.url.replace('/ws', '/other'))).rejects.toThrow('404')
  })

  it('a room takes a limited number of connections (ROOM_FULL)', async () => {
    const { url } = await boot({ limits: { connsPerRoom: 2 } })
    const room = server!.createRoom()
    for (let i = 0; i < 2; i++) {
      const c = await connect(url)
      c.send({ type: 'join', roomId: room.id, claim: true })
      await c.wait((m) => m.type === 'welcome')
    }
    const third = await connect(url)
    third.send({ type: 'join', roomId: room.id, claim: true })
    expect(await third.wait((m) => m.type === 'error')).toMatchObject({ code: 'ROOM_FULL' })
    expect(third.got.some((m) => m.type === 'welcome')).toBe(false)
  })

  it('a socket that never joins is closed after the join deadline', async () => {
    const { url } = await boot({ limits: { joinTimeoutMs: 60 } })
    const idle = await connect(url)
    expect(await idle.closed).toBe(1008)
    for (let i = 0; i < 50 && server!.sockets.size; i++) await sleep(10)
    expect(server!.sockets.size).toBe(0)
  })

  it('rooms left without a connection are removed; a room in use stays', async () => {
    let t = 0
    const log: LogEntry[] = []
    const { url } = await boot({ now: () => t, tickMs: 10, limits: { emptyRoomMs: 1000 }, log: (e) => log.push(e) })
    const unused = server!.createRoom()
    const used = server!.createRoom()
    const left = server!.createRoom()
    const a = await connect(url)
    a.send({ type: 'join', roomId: used.id, claim: true })
    await a.wait((m) => m.type === 'welcome')
    const b = await connect(url)
    b.send({ type: 'join', roomId: left.id, claim: true })
    await b.wait((m) => m.type === 'welcome')
    t = 900
    b.ws.close(); await b.closed
    await sleep(30)
    t = 1500 // unused: empty since 0; left: empty since 900
    await sleep(40)
    expect([...server!.rooms.keys()].sort()).toEqual([left.id, used.id].sort())
    t = 2000
    await sleep(40)
    expect([...server!.rooms.keys()]).toEqual([used.id])
    expect(log.filter((e) => e.ev === 'room.removed').map((e) => [e.room, e.reason])).toEqual([[unused.id, 'lobby'], [left.id, 'lobby']])
    // a page still pointing at a removed room hears that it is gone
    const late = await connect(url)
    late.send({ type: 'join', roomId: left.id })
    expect(await late.wait((m) => m.type === 'error')).toMatchObject({ code: 'NO_ROOM' })
  })

  it('with an Origin allowlist, other pages can neither connect nor create rooms', async () => {
    const { base, url } = await boot({ origins: ['http://good.test'] })
    await expect(connect(url, 'http://evil.test')).rejects.toThrow('403')
    await expect(connect(url)).rejects.toThrow('403') // no Origin at all: not a browser page we know
    await connect(url, 'http://good.test')
    const bad = await fetch(`${base}/rooms`, { method: 'POST', headers: { origin: 'http://evil.test' } })
    expect(bad.status).toBe(403)
    const good = await fetch(`${base}/rooms`, { method: 'POST', headers: { origin: 'http://good.test' } })
    expect(good.status).toBe(201)
    expect(good.headers.get('access-control-allow-origin')).toBe('http://good.test')
  })

  it('a failure inside one room is answered with SERVER_ERROR and logged; the server and other rooms go on', async () => {
    const log: LogEntry[] = []
    const { url } = await boot({ tickMs: 10, log: (e) => log.push(e) })
    const broken = server!.createRoom()
    const fine = server!.createRoom()
    const a = await connect(url)
    a.send({ type: 'join', roomId: broken.id, claim: true })
    await a.wait((m) => m.type === 'welcome')
    broken.receive = () => { throw new Error('boom') }
    broken.tick = () => { throw new Error('tick boom') }
    a.send({ type: 'start' })
    expect(await a.wait((m) => m.type === 'error')).toMatchObject({ code: 'SERVER_ERROR' })
    await sleep(40)
    const b = await connect(url)
    b.send({ type: 'join', roomId: fine.id, claim: true })
    expect(await b.wait((m) => m.type === 'welcome')).toMatchObject({ you: 'p1' })
    expect(log.some((e) => e.ev === 'error' && e.where === 'message' && e.message === 'boom')).toBe(true)
    expect(log.some((e) => e.ev === 'error' && e.where === 'tick' && e.message === 'tick boom')).toBe(true)
  })

  it('behind a trusted proxy the address is the last X-Forwarded-For entry, which a client cannot forge', async () => {
    const { url } = await boot({ trustProxy: true, limits: { socketsPerAddress: 1 } })
    const open = (xff: string) => { const c = new Client(url, undefined, { 'x-forwarded-for': xff }); clients.push(c); return c.open() }
    await open('10.0.0.1')
    await open('6.6.6.6, 10.0.0.2') // another client
    await expect(open('7.7.7.7, 10.0.0.1')).rejects.toThrow('429') // a forged first entry doesn't help
  })

  it('a keep-alive ping gets no reply and changes nothing', async () => {
    const { url } = await boot()
    const room = server!.createRoom()
    const a = await connect(url)
    a.send({ type: 'join', roomId: room.id, claim: true })
    await a.wait((m) => m.type === 'welcome')
    const before = a.got.length
    a.send({ type: 'ping' })
    a.send({ type: 'ping' })
    await sleep(80)
    expect(a.got.length).toBe(before)
  })

  it('log entries name events, rooms and seats but never a seat token', async () => {
    const log: LogEntry[] = []
    const { url } = await boot({ log: (e) => log.push(e), room: { settings: { boardPreset: 'standard-fixed' } } })
    const room = server!.createRoom()
    const tokens: string[] = []
    for (let i = 0; i < 4; i++) {
      const c = await connect(url)
      c.send({ type: 'join', roomId: room.id, claim: true })
      const w = await c.wait((m) => m.type === 'welcome')
      if (w.type === 'welcome' && w.token) tokens.push(w.token)
    }
    clients[0].send({ type: 'start' })
    await clients[0].wait((m) => m.type === 'snapshot')
    expect(tokens).toHaveLength(4)
    const text = JSON.stringify(log)
    for (const t of tokens) expect(text).not.toContain(t)
    expect(log.filter((e) => e.ev === 'conn.join').map((e) => e.as)).toEqual(['p1', 'p2', 'p3', 'p4'])
    expect(log.some((e) => e.ev === 'game.started' && e.room === room.id)).toBe(true)
  })
})
