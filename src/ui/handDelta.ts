// G7.2: what changed in the shown hand, for the "+2" / "−1" badges on the cards, and the once-per-device
// hint that clicking a card puts it in a trade. Pure helpers; the hooks live in HUD.tsx.

import { RESOURCE_ORDER, type Resource } from '../game'

export type HandCounts = Record<Resource, number>

/** Per-resource change from `prev` to `next`, only the kinds that changed; null when nothing did. */
export function handDiff(prev: HandCounts, next: HandCounts): Partial<HandCounts> | null {
  const d: Partial<HandCounts> = {}
  let any = false
  for (const r of RESOURCE_ORDER) {
    const x = next[r] - prev[r]
    if (x) { d[r] = x; any = true }
  }
  return any ? d : null
}

/** "+2" / "−1" (a real minus sign). */
export const deltaText = (n: number) => (n > 0 ? `+${n}` : `−${-n}`)

const HINT_KEY = 'isles.hint.handTrade'
const store = () => { try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null } }
/** Whether this device has already shown the hand-trade hint (storage that throws counts as not shown). */
export function hintSeen(): boolean { try { return store()?.getItem(HINT_KEY) === '1' } catch { return false } }
export function markHintSeen() { try { store()?.setItem(HINT_KEY, '1') } catch { /* private mode: shown again next time */ } }
