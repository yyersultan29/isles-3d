// Hot-seat autosave (ROADMAP G4.8b, GAME_DESIGN §22): the game's replay file goes to local storage
// after every action, and a page load offers to continue an unfinished game. Storage can be
// missing, full or blocked (private windows), so every access is wrapped and failure only means
// "no save". The saved file is checked like any replay: schema 1, the same engine major version,
// and every action must still apply.

import { replay, type GameState, type ReplayFile } from '../game'
import type { GameStore } from './gameStore'

export const SAVE_KEY = 'isles3d.save.v1'

export type KeyValue = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** localStorage, or null where reading it throws. */
export function localStore(): KeyValue | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

/** The saved replay file if it parses into the right shape; null for none or junk. */
export function readSave(kv: KeyValue | null = localStore()): ReplayFile | null {
  try {
    const raw = kv?.getItem(SAVE_KEY)
    if (!raw) return null
    const f = JSON.parse(raw) as ReplayFile
    if (!f || f.schemaVersion !== 1 || typeof f.engineVersion !== 'string' || !f.settings || !Array.isArray(f.actions)) return null
    return f
  } catch { return null }
}

export function writeSave(file: ReplayFile, kv: KeyValue | null = localStore()): boolean {
  try { kv?.setItem(SAVE_KEY, JSON.stringify(file)); return !!kv } catch { return false }
}

export function clearSave(kv: KeyValue | null = localStore()) {
  try { kv?.removeItem(SAVE_KEY) } catch { /* nothing to clear */ }
}

/** The state a save would continue, when it is worth offering: it replays, has moves and isn't over. */
export function resumable(file: ReplayFile | null): GameState | null {
  if (!file || file.actions.length === 0) return null
  const r = replay(file)
  return r.ok && r.state.phase.kind !== 'gameOver' ? r.state : null
}

/** Save after every state change (actions, new game, load). Returns the unsubscribe function. */
export function startAutosave(store: GameStore, kv: KeyValue | null = localStore()): () => void {
  return store.subscribe(() => { writeSave(store.replayFile(), kv) })
}
