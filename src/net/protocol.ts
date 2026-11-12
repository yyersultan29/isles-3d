// Multiplayer protocol (ROADMAP G5, GAME_DESIGN §21): JSON messages over a WebSocket. Shared by the
// server and the client, so it imports only engine types and has no DOM or Node dependencies.
// The server is authoritative: a client sends intents and renders the view it is given. Every
// message a client receives is built from viewFor/eventsFor, so it never carries rngState, the
// deck, another player's hand or the seed before the game is over (§17).

import type { Action, EngineError, GameEvent, LegalAction, PlayerId, PublicGameState, Viewer } from '../game'

// ---------- client → server ----------

export type ClientMessage =
  /**
   * attach to a room: with a seat token to (re)take that seat, with `claim` to take a free seat, else
   * as a spectator. `resume` (G5.4): seat tokens this browser held in the room; the first whose seat
   * has no live connection is taken back (a closed tab reopened), connected seats are skipped (other
   * tabs of the same browser keep theirs)
   */
  | { type: 'join'; roomId: string; token?: string; claim?: boolean; resume?: string[] }
  /** the host starts the game once every seat is taken */
  | { type: 'start' }
  /** G5.5: the host picks the turn-timer preset before the start */
  | { type: 'settings'; timer: TimerPreset }
  /** an intent; `clientSeq` (strictly increasing per seat) makes retries idempotent */
  | { type: 'action'; clientSeq: number; action: Action }

// ---------- server → client ----------

/**
 * `absent` (G5.5, §20): two turns timed out in a row or disconnected for over a minute; the
 * server plays that seat's decisions at once with the timeout defaults until its player acts again
 */
export interface SeatInfo { id: PlayerId; taken: boolean; connected: boolean; absent: boolean }

/** Turn-timer presets (§20): relaxed ×2, normal ×1, fast ×0.5, off */
export type TimerPreset = 'relaxed' | 'normal' | 'fast' | 'off'

/** The running turn timer: who owes the decision and the time left when the message was sent. */
export interface TimerInfo { seats: PlayerId[]; kind: 'placement' | 'roll' | 'discard' | 'robber' | 'actions'; remainingMs: number; totalMs: number }

export type ServerMessage =
  /**
   * reply to `join`: who you are; `token` is sent once, when a seat is claimed, to rejoin later.
   * `nextSeq`: the lowest `clientSeq` the server will still apply for this seat (G5.4: a reloaded
   * client starts counting there, or its first intents would be taken for old retries)
   */
  | { type: 'welcome'; roomId: string; you: Viewer; token?: string; host: boolean; nextSeq: number }
  /** seats before the game starts (and on every change while in the lobby) */
  | { type: 'lobby'; seats: SeatInfo[]; host: PlayerId | null; timer: TimerPreset }
  /** G5.4: who is connected, after the start (on every join and leave) */
  | { type: 'presence'; seats: SeatInfo[] }
  /** the full view on start, join and reconnect */
  | { type: 'snapshot'; seq: number; view: PublicGameState; legal: LegalAction[]; timer: TimerInfo | null }
  /** after each applied action; `seq` = actionCount, so a gap means resync */
  | { type: 'update'; seq: number; events: GameEvent[]; view: PublicGameState; legal: LegalAction[]; timer: TimerInfo | null }
  /** an intent the engine refused (or a malformed message); nothing changed */
  | { type: 'rejected'; clientSeq: number | null; error: EngineError }
  /** lobby or room errors outside the engine (unknown room, not the host, game not started) */
  | { type: 'error'; code: RoomErrorCode; message: string }

/** REPLACED: the same seat joined from another connection; this one is closed (G5.4) */
/** ABANDONED: nobody played for five minutes; the room is closed (G5.5, §20) */
export type RoomErrorCode = 'NO_ROOM' | 'NOT_JOINED' | 'NOT_HOST' | 'NOT_READY' | 'ALREADY_STARTED' | 'NOT_STARTED' | 'SPECTATOR' | 'REPLACED' | 'ABANDONED'

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
      if (m.resume !== undefined && (!Array.isArray(m.resume) || m.resume.length > 4 || !m.resume.every((t) => isId(t, 128)))) return null
      return { type: 'join', roomId: m.roomId, token: m.token as string | undefined, claim: m.claim as boolean | undefined, resume: m.resume as string[] | undefined }
    case 'start':
      return { type: 'start' }
    case 'settings':
      if (m.timer !== 'relaxed' && m.timer !== 'normal' && m.timer !== 'fast' && m.timer !== 'off') return null
      return { type: 'settings', timer: m.timer }
    case 'action':
      if (!Number.isSafeInteger(m.clientSeq) || (m.clientSeq as number) < 0) return null
      if (!isObj(m.action) || typeof m.action.type !== 'string') return null
      return { type: 'action', clientSeq: m.clientSeq as number, action: m.action as unknown as Action }
    default:
      return null
  }
}
