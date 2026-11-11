// Replay files and state hashing (GAME_DESIGN.md §22). A replay is settings (with seed) plus the
// ordered list of [player, action]; feeding it through createGame + apply must reproduce the game.

import type { Action, GameEvent, GameSettings, GameState, PlayerId, Result } from './types'
import { apply, createGame } from './engine'

/** Bump on any rule change that alters outcomes; replays load only on a matching major version. */
export const ENGINE_VERSION = '1.0.0'

export interface ReplayFile {
  schemaVersion: 1
  engineVersion: string
  settings: GameSettings
  actions: { player: PlayerId; action: Action }[]
}

export function replay(file: ReplayFile): Result {
  if (file.schemaVersion !== 1) return { ok: false, error: { code: 'MALFORMED_ACTION', message: `unsupported schemaVersion ${file.schemaVersion}` } }
  if (file.engineVersion.split('.')[0] !== ENGINE_VERSION.split('.')[0])
    return { ok: false, error: { code: 'MALFORMED_ACTION', message: `replay needs engine ${file.engineVersion}, this is ${ENGINE_VERSION}` } }
  const start = createGame(file.settings)
  if (!start.ok) return start
  let state = start.state
  const events: GameEvent[] = [...start.events]
  for (const { player, action } of file.actions) {
    const r = apply(state, player, action)
    if (!r.ok) return r
    state = r.state
    events.push(...r.events)
  }
  return { ok: true, state, events }
}

/** JSON with object keys sorted, so the hash doesn't depend on property insertion order. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`
  if (v && typeof v === 'object')
    return `{${Object.keys(v).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`).join(',')}}`
  return JSON.stringify(v)
}

/** FNV-1a 32-bit over the canonical JSON of the full state, as 8 hex digits. */
export function hashState(s: GameState): string {
  const str = canonicalJson(s)
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
