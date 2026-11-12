/// <reference types="node" />
// G5.6b: how the online store reports refused, full and rate-limited rooms.
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { startServer, type RunningServer } from '../../server/server'
import { createOnlineStore, type OnlineStore, type SocketLike } from '../onlineStore'

let server: RunningServer | null = null
const stores: OnlineStore[] = []
afterEach(async () => { stores.splice(0).forEach((s) => s.close()); await server?.close(); server = null })

const until = async (ok: () => boolean, what: string, ms = 3000) => {
  const end = Date.now() + ms
  while (!ok()) { if (Date.now() > end) throw new Error(`timeout: ${what}`); await new Promise((r) => setTimeout(r, 5)) }
}

describe('online store errors G5.6b', () => {
  it('a room that could not be created starts closed with its reason and never opens a socket', () => {
    let opened = 0
    const s = createOnlineStore({ connect: () => { opened++; throw new Error('must not connect') }, roomId: 'none', failed: { code: 'CREATE_BUSY', message: 'too many rooms created' } })
    stores.push(s)
    expect(s.session()).toMatchObject({ status: 'closed', errorCode: 'CREATE_BUSY', me: null })
    s.reconnectNow()
    s.start()
    expect(opened).toBe(0)
  })

  it('a full room stops the retries and says ROOM_FULL', async () => {
    server = await startServer({ port: 0, limits: { connsPerRoom: 1 } })
    const room = server.createRoom()
    const connect = () => new WebSocket(`ws://127.0.0.1:${server!.port}/ws`) as unknown as SocketLike
    const first = createOnlineStore({ connect, roomId: room.id, claim: true })
    stores.push(first)
    await until(() => first.session().status === 'lobby', 'first joined')
    const second = createOnlineStore({ connect, roomId: room.id, claim: true, reconnect: { baseMs: 10, maxMs: 10 } })
    stores.push(second)
    await until(() => second.session().status === 'closed' && second.session().errorCode === 'ROOM_FULL', 'full')
    await new Promise((r) => setTimeout(r, 100))
    expect(second.session().status).toBe('closed') // no retry loop
    expect(server.sockets.size).toBe(1)
  })

  it('RATE_LIMITED is a short notice: the connection stays and the notice clears itself', async () => {
    server = await startServer({ port: 0, limits: { msgBurst: 2, msgPerSecond: 0.001, dropBurst: 10 } })
    const room = server.createRoom()
    const s = createOnlineStore({ connect: () => new WebSocket(`ws://127.0.0.1:${server!.port}/ws`) as unknown as SocketLike, roomId: room.id, claim: true, noticeMs: 80 })
    stores.push(s)
    await until(() => s.session().status === 'lobby', 'joined') // frame 1: join
    s.setTimer('fast') // frame 2
    s.setTimer('relaxed') // frame 3: dropped
    await until(() => s.session().errorCode === 'RATE_LIMITED', 'notice')
    expect(s.session().status).toBe('lobby')
    expect(s.session().preset).toBe('fast')
    await until(() => s.session().errorCode === null && s.session().error === null, 'notice cleared', 1000)
    expect(s.session().status).toBe('lobby')
  })
})
