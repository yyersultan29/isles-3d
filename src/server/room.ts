// One multiplayer room (ROADMAP G5.1, GAME_DESIGN §21). Transport-free: the WebSocket layer hands
// it raw frames per connection and sends back the messages it returns, so the whole room is
// unit-tested without a network. The room is the single writer of its GameState: actions are
// applied one at a time in the order they are received, by the engine, for the seat bound to the
// connection (never a player named in the message). Every outbound view goes through
// viewFor/eventsFor for its recipient.

import { apply, createGame, eventsFor, legalActions, viewFor } from '../game'
import type { EngineError, GameSettings, GameState, LegalAction, PlayerId, Viewer } from '../game'
import { parseClientMessage, type RoomErrorCode, type SeatInfo, type ServerMessage } from '../net/protocol'

export type ConnId = string
/** `close`: the transport closes that connection after sending (a seat taken over elsewhere) */
export interface Outbound { to: ConnId; msg: ServerMessage; close?: boolean }

export interface RoomOptions {
  id: string
  settings?: Partial<Omit<GameSettings, 'seed'>>
  /** uniform uint32 from a cryptographic source (injected for tests) */
  random32?: () => number
}

const SEATS: PlayerId[] = ['p1', 'p2', 'p3', 'p4']

/** Cryptographic randomness: Web Crypto exists in browsers and in Node 20+. */
export const cryptoRandom32 = () => globalThis.crypto.getRandomValues(new Uint32Array(1))[0]

const malformed: EngineError = { code: 'MALFORMED_ACTION', message: 'malformed message' }

export class Room {
  readonly id: string
  private readonly settings: Partial<Omit<GameSettings, 'seed'>>
  private readonly random32: () => number
  private readonly conns = new Map<ConnId, Viewer>()
  private readonly tokens = new Map<PlayerId, string>()
  private readonly lastSeq = new Map<PlayerId, number>()
  private host: PlayerId | null = null
  private state: GameState | null = null

  constructor(o: RoomOptions) {
    this.id = o.id
    this.settings = o.settings ?? {}
    this.random32 = o.random32 ?? cryptoRandom32
  }

  get started() { return this.state !== null }
  /** the authoritative state (server-side only: never send it as is) */
  get game(): GameState | null { return this.state }

  /** Handle one inbound frame from a connection. */
  receive(conn: ConnId, raw: string): Outbound[] {
    const m = parseClientMessage(raw)
    if (!m) return [{ to: conn, msg: { type: 'rejected', clientSeq: null, error: malformed } }]
    if (m.type === 'join') return this.join(conn, m.roomId, m.token, m.claim, m.resume)
    const who = this.conns.get(conn)
    if (!who) return [this.err(conn, 'NOT_JOINED', 'join the room first')]
    if (m.type === 'start') return this.start(conn, who)
    return this.act(conn, who, m.clientSeq, m.action)
  }

  /** A connection closed. */
  leave(conn: ConnId): Outbound[] {
    if (!this.conns.delete(conn)) return []
    return this.seatsToAll()
  }

  // ---------- lobby ----------

  private join(conn: ConnId, roomId: string, token?: string, claim?: boolean, resume: string[] = []): Outbound[] {
    if (roomId !== this.id) return [this.err(conn, 'NO_ROOM', `no room ${roomId}`)]
    let you: Viewer = 'spectator'
    let newToken: string | undefined
    const out: Outbound[] = []
    const online = new Set(this.conns.values())
    const bySeat = token ? SEATS.find((p) => this.tokens.get(p) === token) : undefined
    const byResume = bySeat ? undefined : SEATS.find((p) => !online.has(p) && resume.includes(this.tokens.get(p) ?? '\0'))
    if (byResume) you = byResume
    else if (bySeat) {
      you = bySeat
      // one live connection per seat: the newest wins (a reload, a new device); the old one is told and closed
      for (const [c, v] of this.conns) if (v === bySeat && c !== conn) {
        this.conns.delete(c)
        out.push({ to: c, msg: { type: 'error', code: 'REPLACED', message: 'this seat was opened on another connection' }, close: true })
      }
    }
    else if (claim && !this.started) {
      const free = SEATS.find((p) => !this.tokens.has(p))
      if (free) {
        newToken = this.newToken()
        this.tokens.set(free, newToken)
        this.host ??= free
        you = free
      }
    }
    this.conns.set(conn, you)
    const nextSeq = you === 'spectator' ? 0 : (this.lastSeq.get(you) ?? -1) + 1
    // a resumed seat gets its token again: this tab didn't have it
    if (byResume) newToken = this.tokens.get(byResume)
    out.push({ to: conn, msg: { type: 'welcome', roomId: this.id, you, token: newToken, host: you !== 'spectator' && you === this.host, nextSeq } })
    if (this.state) out.push(this.snapshot(conn, you))
    out.push(...this.seatsToAll())
    return out
  }

  private start(conn: ConnId, who: Viewer): Outbound[] {
    if (this.state) return [this.err(conn, 'ALREADY_STARTED', 'the game has started')]
    if (who !== this.host) return [this.err(conn, 'NOT_HOST', 'only the host can start')]
    if (this.tokens.size < SEATS.length) return [this.err(conn, 'NOT_READY', 'every seat must be taken')]
    // §21: the seed comes from the server's cryptographic source and is revealed only at gameOver
    const r = createGame({ ...this.settings, seed: this.random32() >>> 0 })
    if (!r.ok) return [this.err(conn, 'NOT_READY', r.error.message)]
    this.state = r.state
    return [...this.conns].map(([c, v]) => this.snapshot(c, v))
  }

  // ---------- game ----------

  private act(conn: ConnId, who: Viewer, clientSeq: number, action: unknown): Outbound[] {
    if (!this.state) return [this.err(conn, 'NOT_STARTED', 'the game has not started')]
    if (who === 'spectator') return [this.err(conn, 'SPECTATOR', 'spectators cannot act')]
    const last = this.lastSeq.get(who) ?? -1
    // a retry of the last intent: its result already went out; resend the current view
    if (clientSeq === last) return [this.snapshot(conn, who)]
    if (clientSeq < last) return []
    this.lastSeq.set(who, clientSeq)
    const r = apply(this.state, who, action as Parameters<typeof apply>[2])
    if (!r.ok) return [{ to: conn, msg: { type: 'rejected', clientSeq, error: r.error } }]
    this.state = r.state
    const s = r.state
    return [...this.conns].map(([c, v]) => ({
      to: c,
      msg: { type: 'update', seq: s.actionCount, events: eventsFor(r.events, v), view: viewFor(s, v), legal: this.legal(v) },
    }))
  }

  private legal(v: Viewer): LegalAction[] {
    const s = this.state
    if (!s || v === 'spectator' || s.phase.kind === 'gameOver') return []
    return legalActions(s, v)
  }

  // ---------- messages ----------

  private snapshot(conn: ConnId, v: Viewer): Outbound {
    const s = this.state!
    return { to: conn, msg: { type: 'snapshot', seq: s.actionCount, view: viewFor(s, v), legal: this.legal(v) } }
  }

  private seatsInfo(): SeatInfo[] {
    const online = new Set(this.conns.values())
    return SEATS.map((id) => ({ id, taken: this.tokens.has(id), connected: online.has(id) }))
  }

  /** seats to everyone: `lobby` before the start, `presence` after */
  private seatsToAll(): Outbound[] {
    const seats = this.seatsInfo()
    return [...this.conns.keys()].map((c): Outbound => ({ to: c, msg: this.state ? { type: 'presence', seats } : { type: 'lobby', seats, host: this.host } }))
  }

  private err(conn: ConnId, code: RoomErrorCode, message: string): Outbound {
    return { to: conn, msg: { type: 'error', code, message } }
  }

  private newToken() {
    return Array.from({ length: 4 }, () => this.random32().toString(16).padStart(8, '0')).join('')
  }
}
