// Multiplayer protocol (ROADMAP G5, GAME_DESIGN §21): JSON messages over a WebSocket. Shared by the
// server and the client, so it imports only engine types and has no DOM or Node dependencies.
// The server is authoritative: a client sends intents and renders the view it is given. Every
// message a client receives is built from viewFor/eventsFor, so it never carries rngState, the
// deck, another player's hand or the seed before the game is over (§17).

import type { Action, EngineError, GameEvent, LegalAction, PlayerId, PublicGameState, Viewer } from '../game'

// ---------- client → server ----------

export type ClientMessage =
  /** attach to a room: with a seat token to (re)take that seat, with `claim` to take a free seat, else as a spectator */
  | { type: 'join'; roomId: string; token?: string; claim?: boolean }
  /** the host starts the game once every seat is taken */
  | { type: 'start' }
  /** an intent; `clientSeq` (strictly increasing per seat) makes retries idempotent */
  | { type: 'action'; clientSeq: number; action: Action }

// ---------- server → client ----------

export interface SeatInfo { id: PlayerId; taken: boolean; connected: boolean }

export type ServerMessage =
  /** reply to `join`: who you are; `token` is sent once, when a seat is claimed, to rejoin later */
  | { type: 'welcome'; roomId: string; you: Viewer; token?: string; host: boolean }
  /** seats before the game starts (and on every change while in the lobby) */
  | { type: 'lobby'; seats: SeatInfo[]; host: PlayerId | null }
  /** the full view on start, join and reconnect */
  | { type: 'snapshot'; seq: number; view: PublicGameState; legal: LegalAction[] }
  /** after each applied action; `seq` = actionCount, so a gap means resync */
  | { type: 'update'; seq: number; events: GameEvent[]; view: PublicGameState; legal: LegalAction[] }
  /** an intent the engine refused (or a malformed message); nothing changed */
  | { type: 'rejected'; clientSeq: number | null; error: EngineError }
  /** lobby or room errors outside the engine (unknown room, not the host, game not started) */
  | { type: 'error'; code: RoomErrorCode; message: string }

export type RoomErrorCode = 'NO_ROOM' | 'NOT_JOINED' | 'NOT_HOST' | 'NOT_READY' | 'ALREADY_STARTED' | 'NOT_STARTED' | 'SPECTATOR'

// ---------- validation of untrusted input ----------

const MAX_MESSAGE_BYTES = 8 * 1024

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isId = (v: unknown, max = 64): v is string => typeof v === 'string' && v.length > 0 && v.length <= max && /^[A-Za-z0-9_-]+$/.test(v)

/**
 * Parse one inbound frame. Only the envelope is checked here; the action payload is validated by
 * the engine itself (MALFORMED_ACTION), which also decides legality. Returns null for anything
 * that isn't a well-formed client message.
 */
export function parseClientMessage(raw: string): ClientMessage | null {
  if (raw.length > MAX_MESSAGE_BYTES) return null
  let m: unknown
  try { m = JSON.parse(raw) } catch { return null }
  if (!isObj(m) || typeof m.type !== 'string') return null
  switch (m.type) {
    case 'join':
      if (!isId(m.roomId)) return null
      if (m.token !== undefined && !isId(m.token, 128)) return null
      if (m.claim !== undefined && typeof m.claim !== 'boolean') return null
      return { type: 'join', roomId: m.roomId, token: m.token as string | undefined, claim: m.claim as boolean | undefined }
    case 'start':
      return { type: 'start' }
    case 'action':
      if (!Number.isSafeInteger(m.clientSeq) || (m.clientSeq as number) < 0) return null
      if (!isObj(m.action) || typeof m.action.type !== 'string') return null
      return { type: 'action', clientSeq: m.clientSeq as number, action: m.action as unknown as Action }
    default:
      return null
  }
}
