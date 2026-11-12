// Pieces that are still dropping into place (ROADMAP G4.5c). Buildings leave them out of the
// static batch while Feedback.tsx animates its own copy; when the drop ends the piece rejoins the
// batch. A tiny external store: React re-renders only when a piece starts or finishes arriving.

import { useSyncExternalStore } from 'react'

export const DROP_MS = 620
let arriving: ReadonlySet<string> = new Set()
const starts = new Map<string, number>()
const listeners = new Set<() => void>()
const notify = () => { for (const l of [...listeners]) l() }

/** Keys are scene keys: `b:<tile>:<corner>` for buildings, `r:<tile>:<edge>` for roads. */
export function arrive(key: string) {
  starts.set(key, performance.now())
  arriving = new Set([...arriving, key])
  notify()
  setTimeout(() => {
    if (performance.now() - (starts.get(key) ?? 0) < DROP_MS - 5) return // re-armed meanwhile
    starts.delete(key)
    arriving = new Set([...arriving].filter((k) => k !== key))
    notify()
  }, DROP_MS)
}

export const arrivalStart = (key: string) => starts.get(key) ?? 0

export function useArrivals(): ReadonlySet<string> {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l) } },
    () => arriving,
  )
}

export const buildingKey = (b: { tile: [number, number]; corner: number }) => `b:${b.tile.join(',')}:${b.corner}`
export const roadKey = (r: { tile: [number, number]; edge: number }) => `r:${r.tile.join(',')}:${r.edge}`

export const isArriving = (key: string) => arriving.has(key)

// dev-only handle for browser checks (like window.__islesStore)
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __islesArrivals: unknown }).__islesArrivals = { isArriving, buildingKey, roadKey }
