// G9.3: hot-seat player names, stored per device next to the autosave (a separate key, so saves
// from before G9.3 still load and the replay format is unchanged). Storage may be blocked: then
// the names last only for this page.

import type { PlayerId } from '../game'
import { localStore, type KeyValue } from './autosave'

export const NAMES_KEY = 'isles3d.names.v1'
export type Names = Partial<Record<PlayerId, string>>

export function readNames(kv: KeyValue | null = localStore()): Names {
  try {
    const raw = kv?.getItem(NAMES_KEY)
    const v = raw ? JSON.parse(raw) : null
    if (!v || typeof v !== 'object') return {}
    const out: Names = {}
    for (const id of ['p1', 'p2', 'p3', 'p4'] as PlayerId[]) if (typeof v[id] === 'string') out[id] = v[id]
    return out
  } catch { return {} }
}

export function writeNames(names: Names, kv: KeyValue | null = localStore()) {
  try { kv?.setItem(NAMES_KEY, JSON.stringify(names)) } catch { /* not remembered */ }
}
