// UI-only state that isn't part of the game (ROADMAP G4.3): which placement the player is choosing
// during their `actions` phase. Set by the build menu (G4.4); `?place=road|settlement|city` for dev checks.

import { useSyncExternalStore } from 'react'

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
  for (const l of [...listeners]) l()
}

export const getPlacementMode = () => mode

export function usePlacementMode(): PlacementMode {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l) } },
    () => mode,
  )
}
