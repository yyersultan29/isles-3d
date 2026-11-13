/// <reference types="node" />
// WebSocket transport for rooms (ROADMAP G5.2, GAME_DESIGN §21). A thin layer: each socket gets a
// connection id, its first successful `join` binds it to one room, and every frame is handed to
// that Room, whose outbound messages are delivered to the sockets they name. All game logic and
// every visibility rule stay in Room and the engine.
//
// HTTP:  POST /rooms → {"roomId": "..."}   GET /health → {"ok": true, "rooms": n, "sockets": n}
// WS:    ws://host:port/ws, JSON frames as in src/net/protocol.ts
//
// G5.6 hardening: per-connection frame rate limit (dropped frames get RATE_LIMITED, a flood closes
// the socket with 1008), room creation and handshake limits per address, socket caps per address,
// in total and per room, a join deadline, removal of empty rooms, an optional Origin allowlist,
// structured log entries (never tokens or message bodies), and a failure in one message or one
// room is logged and contained instead of taking the process down.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo, Socket } from 'node:net'
import { WebSocketServer, type WebSocket } from 'ws'
import { Room, cryptoRandom32, type ConnId, type Outbound, type RoomOptions } from './room'
import { Bucket, Buckets, DEFAULT_LIMITS, type Limits } from './limits'
import { parseClientMessage, type ServerMessage } from '../net/protocol'

/** A structured log entry: `ev` names the event; fields never hold tokens or message bodies. */
export interface LogEntry { ev: string; [field: string]: unknown }

export interface ServerOptions {
  port?: number
  /** default 127.0.0.1: local only until hosting is decided (G5.7) */
  host?: string
  room?: Omit<RoomOptions, 'id'>
  log?: (e: LogEntry) => void
  /** G5.4: ping every socket this often; one that missed the previous pong is dropped (default 15 s) */
  heartbeatMs?: number
  /** G5.5: how often rooms advance their turn timers (default 250 ms) */
  tickMs?: number
  /** G5.6: abuse limits (DEFAULT_LIMITS for anything left out) */
  limits?: Partial<Limits>
  /** G5.6: pages allowed to open sockets and create rooms, e.g. ["https://isles.example"]; default any */
  origins?: string[]
  /** G5.6: the server's clock for limits and room cleanup (tests) */
  now?: () => number
  /** G5.7: behind a hosting proxy (Render) every socket comes from the proxy: take the client address
   *  from the last X-Forwarded-For entry, the one the proxy appended (earlier ones can be forged) */
  trustProxy?: boolean
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
  const now = o.now ?? Date.now
  const L: Limits = { ...DEFAULT_LIMITS, ...o.limits }
  const rooms = new Map<string, Room>()
  const sockets = new Map<ConnId, WebSocket>()
  const roomOf = new Map<ConnId, Room>()
  const members = new Map<Room, Set<ConnId>>()
  const emptySince = new Map<Room, number>()
  const addressOf = new Map<ConnId, string>()
  const perAddress = new Map<string, number>()
  const roomCreates = new Buckets(L.roomBurst, L.roomsPerMinute / 60, now)
  const connects = new Buckets(L.connectBurst, L.connectsPerMinute / 60, now)
  let nextConn = 0

  const clientAddress = (req: IncomingMessage) => {
    const xff = o.trustProxy ? req.headers['x-forwarded-for'] : undefined
    const last = (Array.isArray(xff) ? xff.join(',') : xff)?.split(',').map((s) => s.trim()).filter(Boolean).pop()
    return last ?? req.socket.remoteAddress ?? 'unknown'
  }
  const originAllowed = (origin: string | undefined) => !o.origins || (!!origin && o.origins.includes(origin))

  const addRoom = () => {
    let id = newRoomId()
    while (rooms.has(id)) id = newRoomId()
    const room = new Room({ ...o.room, id })
    rooms.set(id, room)
    members.set(room, new Set())
    emptySince.set(room, now())
    log({ ev: 'room.created', room: id, rooms: rooms.size })
    return room
  }
  const removeRoom = (id: string, room: Room, reason: string) => {
    rooms.delete(id)
    for (const c of members.get(room) ?? []) roomOf.delete(c)
    members.delete(room)
    emptySince.delete(room)
    log({ ev: 'room.removed', room: id, reason, rooms: rooms.size })
  }

  const deliver = (out: Outbound[]) => {
    for (const { to, msg, close } of out) {
      const ws = sockets.get(to)
      if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
      if (ws && close) { unbind(to); ws.close(4000, 'replaced') }
    }
  }
  const reply = (ws: WebSocket, msg: ServerMessage) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)) }
  const bind = (conn: ConnId, room: Room) => { roomOf.set(conn, room); members.get(room)?.add(conn); emptySince.delete(room) }
  function unbind(conn: ConnId) {
    const room = roomOf.get(conn)
    roomOf.delete(conn)
    const m = room && members.get(room)
    if (m) { m.delete(conn); if (!m.size) emptySince.set(room!, now()) }
  }

  /** runs a room step; logs game start and end, and contains a failure to that step */
  const guarded = (room: Room, what: string, conn: ConnId | null, step: () => Outbound[]): Outbound[] => {
    const wasStarted = room.started
    const wasOver = room.game?.phase.kind === 'gameOver'
    try {
      const out = step()
      if (!wasStarted && room.started) log({ ev: 'game.started', room: room.id })
      if (!wasOver && room.game?.phase.kind === 'gameOver') log({ ev: 'game.over', room: room.id, turn: room.game.turn })
      return out
    } catch (e) {
      log({ ev: 'error', where: what, room: room.id, conn, message: e instanceof Error ? e.message : String(e) })
      return conn ? [{ to: conn, msg: { type: 'error', code: 'SERVER_ERROR', message: 'the server failed on that message; nothing changed' } }] : []
    }
  }

  const http = createServer((req: IncomingMessage, res: ServerResponse) => {
    const origin = req.headers.origin
    const cors: Record<string, string> = o.origins
      ? (originAllowed(origin) ? { 'access-control-allow-origin': origin!, vary: 'Origin' } : {})
      : { 'access-control-allow-origin': '*' }
    const json = (code: number, body: unknown, extra: Record<string, string> = {}) => {
      res.writeHead(code, { 'content-type': 'application/json', ...cors, ...extra })
      res.end(JSON.stringify(body))
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { ...cors, 'access-control-allow-methods': 'GET, POST' })
      return res.end()
    }
    if (req.method === 'POST' && req.url === '/rooms') {
      if (origin && !originAllowed(origin)) return json(403, { error: 'origin not allowed' })
      if (!roomCreates.take(clientAddress(req))) {
        log({ ev: 'limit', what: 'room.create' })
        return json(429, { error: 'too many rooms created; try again in a minute' }, { 'retry-after': '60' })
      }
      if (rooms.size >= L.maxRooms) {
        log({ ev: 'limit', what: 'rooms.max', rooms: rooms.size })
        return json(503, { error: 'the server is full; try again later' }, { 'retry-after': '60' })
      }
      return json(201, { roomId: addRoom().id })
    }
    if (req.method === 'GET' && req.url === '/health') return json(200, { ok: true, rooms: rooms.size, sockets: sockets.size })
    json(404, { error: 'not found' })
  })

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD })
  // refuse before the upgrade, so a flood of handshakes costs as little as possible
  http.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const refuse = (status: string, what: string) => {
      log({ ev: 'limit', what })
      socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
    }
    const address = clientAddress(req)
    if (new URL(req.url ?? '/', 'http://x').pathname !== '/ws') return refuse('404 Not Found', 'ws.path')
    if (!originAllowed(req.headers.origin)) return refuse('403 Forbidden', 'ws.origin')
    if (!connects.take(address)) return refuse('429 Too Many Requests', 'ws.connect')
    if (sockets.size >= L.maxSockets) return refuse('503 Service Unavailable', 'ws.max')
    if ((perAddress.get(address) ?? 0) >= L.socketsPerAddress) return refuse('429 Too Many Requests', 'ws.address')
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, address))
  })

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

  // G5.5: turn timers and absent players advance here; G5.6: abandoned and long-empty rooms go
  const ticker = setInterval(() => {
    const t = now()
    for (const [id, room] of rooms) {
      deliver(guarded(room, 'tick', null, () => room.tick()))
      if (room.abandoned) removeRoom(id, room, 'abandoned')
      else if (t - (emptySince.get(room) ?? t) > L.emptyRoomMs) removeRoom(id, room, room.started ? (room.game?.phase.kind === 'gameOver' ? 'finished' : 'empty') : 'lobby')
    }
    roomCreates.sweep()
    connects.sweep()
  }, o.tickMs ?? 250)

  function onConnection(ws: WebSocket, address: string) {
    const conn = `c${++nextConn}`
    sockets.set(conn, ws)
    addressOf.set(conn, address)
    perAddress.set(address, (perAddress.get(address) ?? 0) + 1)
    alive.add(ws)
    ws.on('pong', () => alive.add(ws))
    const frames = new Bucket(L.msgBurst, L.msgPerSecond, now)
    const drops = new Bucket(L.dropBurst, L.dropPerSecond, now)
    let joinTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      log({ ev: 'conn.join-timeout', conn })
      ws.close(1008, 'join a room first')
    }, L.joinTimeoutMs)
    log({ ev: 'conn.open', conn, sockets: sockets.size })

    ws.on('message', (data, isBinary) => {
      if (!frames.take()) {
        if (!drops.take()) { log({ ev: 'limit', what: 'conn.flood', conn }); return ws.close(1008, 'too many messages') }
        return reply(ws, { type: 'error', code: 'RATE_LIMITED', message: 'too many messages; slow down' })
      }
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
        if ((members.get(room)?.size ?? 0) >= L.connsPerRoom) {
          log({ ev: 'limit', what: 'room.full', room: room.id })
          return reply(ws, { type: 'error', code: 'ROOM_FULL', message: 'this room has too many connections' })
        }
        bind(conn, room)
        if (joinTimer) { clearTimeout(joinTimer); joinTimer = null }
        const r = room
        const out = guarded(r, 'join', conn, () => r.receive(conn, raw))
        const welcome = out.find((x) => x.to === conn && x.msg.type === 'welcome')?.msg
        log({ ev: 'conn.join', conn, room: r.id, as: welcome?.type === 'welcome' ? welcome.you : null })
        return deliver(out)
      }
      const r = room
      deliver(guarded(r, 'message', conn, () => r.receive(conn, raw)))
    })
    ws.on('close', (code) => {
      if (joinTimer) clearTimeout(joinTimer)
      sockets.delete(conn)
      addressOf.delete(conn)
      const n = (perAddress.get(address) ?? 1) - 1
      if (n > 0) perAddress.set(address, n); else perAddress.delete(address)
      const room = roomOf.get(conn)
      unbind(conn)
      if (room && rooms.has(room.id)) deliver(guarded(room, 'leave', null, () => room.leave(conn)))
      log({ ev: 'conn.close', conn, code, sockets: sockets.size })
    })
    ws.on('error', (e) => log({ ev: 'conn.error', conn, message: e.message }))
  }

  return new Promise((resolve, reject) => {
    http.once('error', (e) => { clearInterval(beat); clearInterval(ticker); reject(e) })
    http.listen(o.port ?? 8787, o.host ?? '127.0.0.1', () => {
      const port = (http.address() as AddressInfo).port
      log({ ev: 'listening', url: `http://${o.host ?? '127.0.0.1'}:${port}`, ws: '/ws' })
      resolve({
        port,
        rooms,
        sockets,
        createRoom: addRoom,
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
