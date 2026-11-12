// UI-only state that isn't part of the game (ROADMAP G4.3): which placement the player is choosing
// during their `actions` phase. Set by the build menu (G4.4); `?place=road|settlement|city` for dev checks.

import { useSyncExternalStore } from 'react'
import type { PlayerId } from '../game'

export type PlacementMode = 'road' | 'settlement' | 'city' | null

const fromQuery = (): PlacementMode => {
  if (typeof location === 'undefined') return null
  const v = new URLSearchParams(location.search).get('place')
  return v === 'road' || v === 'settlement' || v === 'city' ? v : null
}

let mode: PlacementMode = fromQuery()
const listeners = new Set<() => void>()

export function setPlacementMode(m: PlacementMode) {
  if (m === mode) return
  mode = m
  if (m) setPanel(null)
  for (const l of [...listeners]) l()
}

export const getPlacementMode = () => mode

export function usePlacementMode(): PlacementMode {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l) } },
    () => mode,
  )
}

// ---------- G4.4d/e: which HUD panel is open (trade or development cards; one at a time) ----------

export type Panel = 'trade' | 'dev' | null
let panel: Panel = null
const panelListeners = new Set<() => void>()

export function setPanel(v: Panel) {
  if (v === panel) return
  panel = v
  if (v) setPlacementMode(null) // a board choice and a panel never compete
  for (const l of [...panelListeners]) l()
}

export const getPanel = () => panel

export function usePanel(): Panel {
  return useSyncExternalStore(
    (l) => { panelListeners.add(l); return () => { panelListeners.delete(l) } },
    () => panel,
  )
}

export const setTradeOpen = (v: boolean) => setPanel(v ? 'trade' : panel === 'trade' ? null : panel)
export const getTradeOpen = () => panel === 'trade'
export const useTradeOpen = () => usePanel() === 'trade'
export const setDevOpen = (v: boolean) => setPanel(v ? 'dev' : panel === 'dev' ? null : panel)
export const useDevOpen = () => usePanel() === 'dev'

// ---------- G4.8a: hot-seat — whose private view has been revealed on this device ----------

let seen: PlayerId | null = null
const seenListeners = new Set<() => void>()

/** Mark `p` as the player now looking at the screen (after the pass-the-device screen). */
export function setSeen(p: PlayerId | null) {
  if (p === seen) return
  seen = p
  for (const l of [...seenListeners]) l()
}
export const getSeen = () => seen
export function useSeen(): PlayerId | null {
  return useSyncExternalStore(
    (l) => { seenListeners.add(l); return () => { seenListeners.delete(l) } },
    () => seen,
  )
}
