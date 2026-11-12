/// <reference types="node" />
// WebSocket transport for rooms (ROADMAP G5.2, GAME_DESIGN §21). A thin layer: each socket gets a
// connection id, its first successful `join` binds it to one room, and every frame is handed to
// that Room, whose outbound messages are delivered to the sockets they name. All game logic and
// every visibility rule stay in Room and the engine.
//
// HTTP:  POST /rooms → {"roomId": "..."}   GET /health → {"ok": true, "rooms": n}
// WS:    ws://host:port/ws, JSON frames as in src/net/protocol.ts

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { WebSocketServer, type WebSocket } from 'ws'
import { Room, cryptoRandom32, type ConnId, type Outbound, type RoomOptions } from './room'
import { parseClientMessage, type ServerMessage } from '../net/protocol'

export interface ServerOptions {
  port?: number
  /** default 127.0.0.1: local only until hosting is decided (G5.7) */
  host?: string
  room?: Omit<RoomOptions, 'id'>
  log?: (line: string) => void
  /** G5.4: ping every socket this often; one that missed the previous pong is dropped (default 15 s) */
  heartbeatMs?: number
  /** G5.5: how often rooms advance their turn timers (default 250 ms) */
  tickMs?: number
}

export interface RunningServer {
  port: number
  rooms: Map<string, Room>
  /** open sockets by connection id (for tests and diagnostics) */
  sockets: Map<ConnId, WebSocket>
  createRoom(): Room
  close(): Promise<void>
}

/** frames above this are dropped by ws itself (and Room rejects >8 KB too) */
const MAX_PAYLOAD = 16 * 1024

const newRoomId = () => Array.from({ length: 2 }, () => cryptoRandom32().toString(36)).join('').slice(0, 10)

export function startServer(o: ServerOptions = {}): Promise<RunningServer> {
  const log = o.log ?? (() => {})
  const rooms = new Map<string, Room>()
  const sockets = new Map<ConnId, WebSocket>()
  const roomOf = new Map<ConnId, Room>()
  let nextConn = 0

  const createRoom = () => {
    let id = newRoomId()
    while (rooms.has(id)) id = newRoomId()
    const room = new Room({ ...o.room, id })
    rooms.set(id, room)
    log(`room ${id} created`)
    return room
  }

  const deliver = (out: Outbound[]) => {
    for (const { to, msg, close } of out) {
      const ws = sockets.get(to)
      if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
      if (ws && close) { roomOf.delete(to); ws.close(4000, 'replaced') }
    }
  }
  const reply = (ws: WebSocket, msg: ServerMessage) => ws.send(JSON.stringify(msg))

  const http = createServer((req: IncomingMessage, res: ServerResponse) => {
    const json = (code: number, body: unknown) => {
      res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*' })
      res.end(JSON.stringify(body))
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST' })
      return res.end()
    }
    if (req.method === 'POST' && req.url === '/rooms') return json(201, { roomId: createRoom().id })
    if (req.method === 'GET' && req.url === '/health') return json(200, { ok: true, rooms: rooms.size })
    json(404, { error: 'not found' })
  })

  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: MAX_PAYLOAD })
  // a socket that vanished without a close (sleep, lost network) is found by the heartbeat; its
  // close then frees the seat's presence like any other
  const alive = new WeakSet<WebSocket>()
  const beat = setInterval(() => {
    for (const ws of sockets.values()) {
      if (!alive.has(ws)) { ws.terminate(); continue }
      alive.delete(ws)
      ws.ping()
    }
  }, o.heartbeatMs ?? 15000)

  // G5.5: turn timers and absent players advance here; an abandoned room is dropped
  const ticker = setInterval(() => {
    for (const [id, room] of rooms) {
      deliver(room.tick())
      if (room.abandoned) { rooms.delete(id); log(`room ${id} abandoned`) }
    }
  }, o.tickMs ?? 250)

  wss.on('connection', (ws) => {
    const conn = `c${++nextConn}`
    sockets.set(conn, ws)
    alive.add(ws)
    ws.on('pong', () => alive.add(ws))
    log(`${conn} connected`)
    ws.on('message', (data, isBinary) => {
      if (isBinary) return reply(ws, { type: 'rejected', clientSeq: null, error: { code: 'MALFORMED_ACTION', message: 'text frames only' } })
      const raw = data.toString()
      let room = roomOf.get(conn)
      if (!room) {
        // the first join picks the room; until then nothing else is accepted
        const m = parseClientMessage(raw)
        if (!m) return reply(ws, { type: 'rejected', clientSeq: null, error: { code: 'MALFORMED_ACTION', message: 'malformed message' } })
        if (m.type !== 'join') return reply(ws, { type: 'error', code: 'NOT_JOINED', message: 'join a room first' })
        room = rooms.get(m.roomId)
        if (!room) return reply(ws, { type: 'error', code: 'NO_ROOM', message: `no room ${m.roomId}` })
        roomOf.set(conn, room)
      }
      deliver(room.receive(conn, raw))
    })
    ws.on('close', () => {
      sockets.delete(conn)
      const room = roomOf.get(conn)
      roomOf.delete(conn)
      if (room) deliver(room.leave(conn))
      log(`${conn} closed`)
    })
    ws.on('error', (e) => log(`${conn} error ${e.message}`))
  })

  return new Promise((resolve, reject) => {
    http.once('error', (e) => { clearInterval(beat); clearInterval(ticker); reject(e) })
    http.listen(o.port ?? 8787, o.host ?? '127.0.0.1', () => {
      const port = (http.address() as AddressInfo).port
      log(`listening on http://${o.host ?? '127.0.0.1'}:${port} (ws path /ws)`)
      resolve({
        port,
        rooms,
        sockets,
        createRoom,
        close: () => new Promise<void>((done) => {
          clearInterval(beat)
          clearInterval(ticker)
          for (const ws of sockets.values()) ws.terminate()
          wss.close(() => http.close(() => done()))
        }),
      })
    })
  })
}
