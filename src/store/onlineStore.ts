// Online game store (ROADMAP G5.3a). The same GameStore contract as the local store, so the scene
// and HUD bind to it unchanged, but the server owns the game: `dispatch` sends an intent and the
// state changes only when the server's update arrives.
//
// The server sends a PublicGameState (viewFor this seat). The UI and the local engine read a full
// GameState, so the view is turned into a *shadow* state: everything public is copied as is, this
// seat's hand and cards are real, and the hidden parts (other hands, other dev cards, the deck,
// the RNG) are opaque fillers with the right counts. Rules for this seat's own actions read only
// public data and this seat's hand, so the engine's validate/legalActions on the shadow agree with
// the server's; the one exception (confirming a trade reads the responder's hand) is covered by
// giving an accepted responder a shadow hand that holds the request, which the server checked
// when they accepted and which can't change before the confirm. The server re-validates anyway.

import { ENGINE_VERSION, RESOURCE_ORDER, createGame, validate } from '../game'
import type { Action, EngineError, GameEvent, GameState, LegalAction, PlayerId, PlayerState, PublicGameState, ReplayFile, Result, ResourceCounts, Viewer } from '../game'
import type { ClientMessage, SeatInfo, ServerMessage } from '../net/protocol'
import type { GameEventListener, GameStore, RejectionListener } from './gameStore'

/** The part of WebSocket the store uses: the browser's WebSocket and `ws` both fit. */
export interface SocketLike {
  readonly readyState: number
  send(data: string): void
  close(): void
  addEventListener(type: 'open' | 'close' | 'error', listener: () => void): void
  addEventListener(type: 'message', listener: (e: { data: unknown }) => void): void
}

/** reconnecting: the game was joined and the connection dropped; the store is retrying */
export type OnlineStatus = 'connecting' | 'lobby' | 'playing' | 'reconnecting' | 'closed'

export interface OnlineSession {
  status: OnlineStatus
  roomId: string
  /** this connection's seat, or spectator; null until welcomed */
  me: Viewer | null
  host: boolean
  /** the seat token: keep it to rejoin (G5.4) */
  token: string | null
  seats: SeatInfo[]
  /** legal actions the server lists for this seat */
  legal: LegalAction[]
  /** the last room-level error (NO_ROOM, NOT_HOST, …) */
  error: string | null
}

export interface OnlineStore extends GameStore {
  readonly online: true
  session(): OnlineSession
  onSession(listener: () => void): () => void
  /** the host starts the game */
  start(): void
  close(): void
  /** skip the wait before the next reconnect attempt (a "Retry now" button) */
  reconnectNow(): void
}

export interface OnlineOptions {
  connect: () => SocketLike
  roomId: string
  token?: string
  claim?: boolean
  /** seat tokens this browser held in the room (G5.4): the server gives back one whose seat is idle */
  resume?: string[]
  /** pause before reconnect attempt n: min(maxMs, baseMs · 2^n) (defaults 500 ms, 5 s) */
  reconnect?: { baseMs?: number; maxMs?: number }
}

const OPEN = 1
const zero = (): ResourceCounts => ({ lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 })

/** an opaque hand of `n` cards; holds `must` first when it is known to (an accepted trade) */
function fillerHand(n: number, must: Partial<ResourceCounts> = {}): ResourceCounts {
  const h = zero()
  let left = n
  for (const r of RESOURCE_ORDER) { const k = Math.min(left, must[r] ?? 0); h[r] += k; left -= k }
  for (let i = 0; left > 0; i++, left--) h[RESOURCE_ORDER[i % RESOURCE_ORDER.length]] += 1
  return h
}

/** PublicGameState → a GameState the UI and the engine can read (see the header). */
export function shadowState(v: PublicGameState): GameState {
  const t = v.trade
  const players: PlayerState[] = v.players.map((p) => ({
    id: p.id,
    resources: p.resources ? { ...p.resources } : fillerHand(p.resourceCount, t && t.responses[p.id] === 'accept' ? t.request : {}),
    // hidden cards: bought this turn so nothing treats them as playable, never VP until gameOver
    // at gameOver the totals are public: the gap to the public points is that player's VP cards
    devCards: p.devCards ? p.devCards.map((c) => ({ ...c })) : Array.from({ length: p.devCardCount }, (_, i) => ({
      id: -1 - i, type: i < (p.totalVP ?? p.publicVP) - p.publicVP ? 'victoryPoint' as const : 'knight' as const, boughtOnTurn: v.turn,
    })),
    playedKnights: p.playedKnights,
    playedDevThisTurn: p.playedDevThisTurn,
    pieces: { ...p.pieces },
  }))
  const { deckCount, viewer: _viewer, settings, ...pub } = v
  void _viewer
  return {
    ...structuredClone(pub),
    settings: { ...settings, seed: settings.seed ?? 0 },
    players,
    deck: Array.from({ length: deckCount }, (_, i) => ({ id: -100 - i, type: 'knight' as const, boughtOnTurn: -1 })),
    rngState: 0,
  } as GameState
}

export function createOnlineStore(o: OnlineOptions): OnlineStore {
  // until the game starts the scene shows the standard board, empty
  const blank = createGame({ seed: 1, boardPreset: 'standard-fixed' })
  if (!blank.ok) throw new Error(blank.error.message)
  let state: GameState = blank.state
  let gen = 0
  let seq = -1
  let clientSeq = 0
  const sent = new Map<number, Action>()
  const session: OnlineSession = { status: 'connecting', roomId: o.roomId, me: null, host: false, token: o.token ?? null, seats: [], legal: [], error: null }
  let sessionSnap = { ...session }
  const listeners = new Set<() => void>()
  const eventListeners = new Set<GameEventListener>()
  const rejectionListeners = new Set<RejectionListener>()
  const sessionListeners = new Set<() => void>()

  const sessionChanged = () => { sessionSnap = { ...session }; for (const l of [...sessionListeners]) l() }
  const reject = (error: EngineError, player: PlayerId, action: Action) => { for (const l of [...rejectionListeners]) l(error, player, action) }
  const notify = (events: readonly GameEvent[] | null) => {
    if (events) for (const l of [...eventListeners]) l(events, state)
    for (const l of [...listeners]) l()
  }

  // ---- the connection (G5.4): reconnects by itself with a growing pause, rejoining with the seat
  // token; the server answers a rejoin with a full snapshot, so nothing needs replaying here
  let ws: SocketLike
  let stopped = false // close() was called, or this seat was opened elsewhere
  let attempt = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  const base = o.reconnect?.baseMs ?? 500, max = o.reconnect?.maxMs ?? 5000
  const send = (m: ClientMessage) => { if (ws.readyState === OPEN) ws.send(JSON.stringify(m)) }

  const onMessage = (e: { data: unknown }) => {
    let m: ServerMessage
    try { m = JSON.parse(String(e.data)) } catch { return }
    switch (m.type) {
      case 'welcome':
        attempt = 0
        session.me = m.you
        session.host = m.host
        if (m.token) session.token = m.token
        session.error = null
        // after a reload the server still remembers this seat's last intent number
        clientSeq = Math.max(clientSeq, m.nextSeq)
        sessionChanged()
        return
      case 'lobby':
        session.status = 'lobby'
        session.seats = m.seats
        session.host = !!session.me && session.me === m.host
        sessionChanged()
        return
      case 'presence':
        session.seats = m.seats
        sessionChanged()
        return
      case 'snapshot':
        // a fresh view (start, rejoin): views snap to it instead of animating
        state = shadowState(m.view)
        seq = m.seq
        gen++
        session.status = 'playing'
        session.legal = m.legal
        sessionChanged()
        notify(null)
        return
      case 'update': {
        if (m.seq <= seq) return // already covered by a newer snapshot
        // every update carries the full view, so a gap needs no round trip: the state is exact,
        // only the missed events (animations, notices) are skipped, and views snap
        const inOrder = m.seq === seq + 1
        if (!inOrder) gen++
        seq = m.seq
        state = shadowState(m.view)
        session.legal = m.legal
        sessionChanged()
        notify(inOrder ? m.events : null)
        return
      }
      case 'rejected': {
        const action = m.clientSeq === null ? undefined : sent.get(m.clientSeq)
        if (action && session.me && session.me !== 'spectator') reject(m.error, session.me, action)
        return
      }
      case 'error':
        session.error = `${m.code}: ${m.message}`
        // two tabs must not take the seat back and forth; a room the server no longer has (it
        // restarted: rooms live in memory) won't come back by retrying
        if (m.code === 'REPLACED' || m.code === 'NO_ROOM') { stopped = true; ws.close() }
        sessionChanged()
        return
    }
  }

  const connect = () => {
    timer = null
    ws = o.connect()
    ws.addEventListener('open', () => {
      // a seat token rejoins its seat; without one, claim a seat as asked
      const token = session.token ?? undefined
      send({ type: 'join', roomId: o.roomId, token, claim: token ? undefined : o.claim, resume: token || !o.resume?.length ? undefined : o.resume.slice(-4) })
    })
    ws.addEventListener('message', onMessage)
    // a failed connect reports an error and then a close; the close handles it (and Node's `ws`
    // would throw an error event nobody listens to)
    ws.addEventListener('error', () => {})
    ws.addEventListener('close', () => {
      if (stopped) { session.status = 'closed'; sessionChanged(); return }
      // joined before: say so and keep the game on screen; never reached: the server isn't there
      session.status = session.me !== null ? 'reconnecting' : 'closed'
      sessionChanged()
      timer = setTimeout(connect, Math.min(max, base * 2 ** attempt++))
    })
  }
  connect()

  const notSeated: EngineError = { code: 'NOT_YOUR_TURN', message: 'you are not seated in this game' }

  return {
    online: true,
    getState: () => state,
    subscribe(l) { listeners.add(l); return () => { listeners.delete(l) } },
    onEvents(l) { eventListeners.add(l); return () => { eventListeners.delete(l) } },
    onRejected(l) { rejectionListeners.add(l); return () => { rejectionListeners.delete(l) } },
    dispatch(player, action): Result {
      const me = session.me
      if (session.status !== 'playing' || !me || me === 'spectator' || player !== me) {
        reject(notSeated, player, action)
        return { ok: false, error: notSeated }
      }
      // the shadow state answers exactly for this seat's actions; a local refusal never leaves
      const check = validate(state, me, action)
      if (!check.ok) { reject(check.error, me, action); return check }
      const n = clientSeq++
      sent.set(n, action)
      if (sent.size > 64) sent.delete(sent.keys().next().value!)
      send({ type: 'action', clientSeq: n, action })
      // accepted for sending: the state changes when the server's update arrives
      return { ok: true, state, events: [] }
    },
    reset() { /* a server game can't be reset from a client */ },
    load(): Result { return { ok: false, error: { code: 'MALFORMED_ACTION', message: 'an online game is not loaded from a save' } } },
    generation: () => gen,
    replayFile: (): ReplayFile => ({ schemaVersion: 1, engineVersion: ENGINE_VERSION, settings: { ...state.settings }, actions: [] }),
    session: () => sessionSnap,
    onSession(l) { sessionListeners.add(l); return () => { sessionListeners.delete(l) } },
    start: () => send({ type: 'start' }),
    close: () => { stopped = true; if (timer) clearTimeout(timer); ws.close() },
    reconnectNow: () => { if (timer) { clearTimeout(timer); connect() } },
  }
}
