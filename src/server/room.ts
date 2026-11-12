// One multiplayer room (ROADMAP G5.1, GAME_DESIGN §21). Transport-free: the WebSocket layer hands
// it raw frames per connection and sends back the messages it returns, so the whole room is
// unit-tested without a network. The room is the single writer of its GameState: actions are
// applied one at a time in the order they are received, by the engine, for the seat bound to the
// connection (never a player named in the message). Every outbound view goes through
// viewFor/eventsFor for its recipient.

import { apply, createGame, eventsFor, legalActions, viewFor } from '../game'
import type { Action, EngineError, GameEvent, GameSettings, GameState, LegalAction, PlayerId, Viewer } from '../game'
import { createRng, type Rng } from '../game/rng'
import { parseClientMessage, type RoomErrorCode, type SeatInfo, type ServerMessage, type TimerInfo, type TimerPreset } from '../net/protocol'
import { decisionOf, extendForTrade, limitFor, timeoutAction, type DecisionKind } from './timeouts'

export type ConnId = string
/** `close`: the transport closes that connection after sending (a seat taken over elsewhere) */
export interface Outbound { to: ConnId; msg: ServerMessage; close?: boolean }

export interface RoomOptions {
  id: string
  settings?: Partial<Omit<GameSettings, 'seed'>>
  /** uniform uint32 from a cryptographic source (injected for tests) */
  random32?: () => number
  /** the clock for turn timers (injected for tests; default Date.now) */
  now?: () => number
  /** turn-timer preset until the host changes it in the lobby (default normal) */
  timer?: TimerPreset
}

/** §20: a dropped connection longer than this makes the seat absent */
export const ABSENT_AFTER_DISCONNECT_MS = 60_000
/** §20: with no present human for this long the room is abandoned */
export const ABANDON_AFTER_MS = 5 * 60_000

interface Clock { kind: DecisionKind; seats: PlayerId[]; turn: number; at: number; started: number; deadline: number | null }

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
  // ---- G5.5 turn timers and absent players (§20)
  private readonly now: () => number
  private preset: TimerPreset
  private clock: Clock | null = null
  /** a separate, non-game RNG for timeout choices: the game's dice sequence never shifts */
  private timeoutRng: Rng | null = null
  private readonly absent = new Set<PlayerId>()
  private readonly streak = new Map<PlayerId, { count: number; turn: number }>()
  private readonly droppedAt = new Map<PlayerId, number>()
  private idleSince: number | null = null
  /** nobody played for ABANDON_AFTER_MS; the server removes the room */
  abandoned = false

  constructor(o: RoomOptions) {
    this.id = o.id
    this.settings = o.settings ?? {}
    this.random32 = o.random32 ?? cryptoRandom32
    this.now = o.now ?? Date.now
    this.preset = o.timer ?? 'normal'
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
    if (m.type === 'settings') return this.setTimer(conn, who, m.timer)
    return this.act(conn, who, m.clientSeq, m.action)
  }

  /** A connection closed. */
  leave(conn: ConnId): Outbound[] {
    const who = this.conns.get(conn)
    if (!this.conns.delete(conn)) return []
    if (who && who !== 'spectator' && ![...this.conns.values()].includes(who)) this.droppedAt.set(who, this.now())
    return this.seatsToAll()
  }

  /**
   * Advance the clocks (the server calls this a few times a second). Marks seats absent, plays at
   * most one automatic action (an expired timer, or an absent seat's decision), and abandons a
   * room nobody plays in. Automatic actions are ordinary engine actions, broadcast like any other.
   */
  tick(): Outbound[] {
    const s = this.state
    if (!s || this.abandoned || s.phase.kind === 'gameOver') return []
    const now = this.now()
    const out: Outbound[] = []
    // a connection gone for over a minute: absent
    let changed = false
    for (const [p, t] of this.droppedAt) if (now - t > ABSENT_AFTER_DISCONNECT_MS && !this.absent.has(p)) { this.absent.add(p); changed = true }
    if (changed) out.push(...this.seatsToAll())
    // nobody present: never auto-play a whole game for nobody; close the room after a while
    const online = new Set(this.conns.values())
    const present = SEATS.filter((p) => online.has(p) && !this.absent.has(p))
    if (!present.length) {
      this.idleSince ??= now
      if (now - this.idleSince > ABANDON_AFTER_MS) {
        this.abandoned = true
        return [...out, ...[...this.conns.keys()].map((c) => this.err(c, 'ABANDONED', 'nobody played for five minutes'))]
      }
      return out
    }
    this.idleSince = null
    // an absent seat's decision resolves at once (and it declines any offer made to it)
    const owing = [...(decisionOf(s)?.seats ?? []), ...(s.trade && s.phase.kind === 'actions' ? s.trade.to.filter((p) => !s.trade!.responses[p]) : [])]
    const auto = owing.find((p) => this.absent.has(p))
    if (auto) return [...out, ...this.autoAct(auto, false)]
    // an expired timer: the first seat that still owes the decision
    const c = this.clock
    if (c?.deadline != null && now >= c.deadline) {
      const p = decisionOf(s)?.seats[0]
      if (p) return [...out, ...this.autoAct(p, true)]
    }
    return out
  }

  /** the timer as clients see it: who, which decision, and the time left now */
  timerInfo(): TimerInfo | null {
    const c = this.clock, s = this.state
    if (!c || c.deadline == null || !s) return null
    const seats = decisionOf(s)?.seats ?? c.seats
    return { seats, kind: c.kind, remainingMs: Math.max(0, c.deadline - this.now()), totalMs: c.deadline - c.started }
  }

  get timerPreset() { return this.preset }

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
    if (you !== 'spectator') { this.droppedAt.delete(you); this.markPresent(you) }
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
    this.timeoutRng = createRng(this.random32() >>> 0)
    this.updateClock([])
    return [...this.conns].map(([c, v]) => this.snapshot(c, v))
  }

  private setTimer(conn: ConnId, who: Viewer, timer: TimerPreset): Outbound[] {
    if (this.state) return [this.err(conn, 'ALREADY_STARTED', 'the game has started')]
    if (who !== this.host) return [this.err(conn, 'NOT_HOST', 'only the host can change settings')]
    this.preset = timer
    return this.seatsToAll()
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
    // the player's own input: present again, and the timeout streak starts over
    const wasAbsent = this.absent.has(who)
    this.markPresent(who)
    return [...this.commit(r.state, r.events), ...(wasAbsent ? this.seatsToAll() : [])]
  }

  /** an automatic action for `p` (§20); `timedOut` counts towards becoming absent */
  private autoAct(p: PlayerId, timedOut: boolean): Outbound[] {
    const s = this.state!
    const a: Action | null = timeoutAction(s, p, this.timeoutRng!)
    const r = a && apply(s, p, a)
    if (!r || !r.ok) {
      // never expected (timeoutAction picks from legalActions); stop the clock rather than spin
      if (this.clock) this.clock.deadline = null
      return []
    }
    const out: Outbound[] = []
    if (timedOut) {
      // two turns in a row with a timeout make the seat absent
      const st = this.streak.get(p)
      const count = st && st.turn === s.turn ? st.count : (st?.count ?? 0) + 1
      this.streak.set(p, { count, turn: s.turn })
      if (count >= 2 && !this.absent.has(p)) { this.absent.add(p); out.push(...this.seatsToAll()) }
    }
    return [...this.commit(r.state, r.events), ...out]
  }

  private markPresent(p: PlayerId) {
    this.absent.delete(p)
    this.streak.delete(p)
  }

  /** apply a new state: move the clock and send each connection its update */
  private commit(s: GameState, events: GameEvent[]): Outbound[] {
    this.state = s
    this.updateClock(events)
    const timer = this.timerInfo()
    return [...this.conns].map(([c, v]) => ({
      to: c,
      msg: { type: 'update', seq: s.actionCount, events: eventsFor(events, v), view: viewFor(s, v), legal: this.legal(v), timer },
    }))
  }

  /**
   * A new decision gets a fresh limit. Two keep theirs: the actions phase of one turn (a knight's
   * robber interlude doesn't refill it; each completed trade adds time up to the cap), and a
   * seven's discards (one window for everyone who owes cards).
   */
  private updateClock(events: readonly GameEvent[]) {
    const s = this.state!
    const d = decisionOf(s)
    const now = this.now()
    if (!d) { this.clock = null; return }
    const c = this.clock
    if (c && c.turn === d.turn && c.kind === d.kind && (d.kind === 'discard' || d.kind === 'actions')) {
      if (d.kind === 'actions' && c.deadline != null && events.some((e) => e.type === 'TRADE_COMPLETED')) c.deadline = extendForTrade(c.started, c.deadline, this.preset)
      c.seats = d.seats
      return
    }
    // back from the robber to the same turn's actions: resume the actions clock
    if (d.kind === 'actions' && this.actionsClock?.turn === d.turn) { this.clock = this.actionsClock; return }
    const limit = limitFor(d.kind, this.preset)
    this.clock = { kind: d.kind, seats: d.seats, turn: d.turn, at: s.actionCount, started: now, deadline: limit == null ? null : now + limit }
    if (d.kind === 'actions') this.actionsClock = this.clock
  }
  private actionsClock: Clock | null = null

  private legal(v: Viewer): LegalAction[] {
    const s = this.state
    if (!s || v === 'spectator' || s.phase.kind === 'gameOver') return []
    return legalActions(s, v)
  }

  // ---------- messages ----------

  private snapshot(conn: ConnId, v: Viewer): Outbound {
    const s = this.state!
    return { to: conn, msg: { type: 'snapshot', seq: s.actionCount, view: viewFor(s, v), legal: this.legal(v), timer: this.timerInfo() } }
  }

  private seatsInfo(): SeatInfo[] {
    const online = new Set(this.conns.values())
    return SEATS.map((id) => ({ id, taken: this.tokens.has(id), connected: online.has(id), absent: this.absent.has(id) }))
  }

  /** seats to everyone: `lobby` before the start, `presence` after */
  private seatsToAll(): Outbound[] {
    const seats = this.seatsInfo()
    return [...this.conns.keys()].map((c): Outbound => ({ to: c, msg: this.state ? { type: 'presence', seats } : { type: 'lobby', seats, host: this.host, timer: this.preset } }))
  }

  private err(conn: ConnId, code: RoomErrorCode, message: string): Outbound {
    return { to: conn, msg: { type: 'error', code, message } }
  }

  private newToken() {
    return Array.from({ length: 4 }, () => this.random32().toString(16).padStart(8, '0')).join('')
  }
}
