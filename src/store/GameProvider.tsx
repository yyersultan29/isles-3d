// React binding for the game store (ROADMAP G4.1). Components read with `useGame(selector)`;
// a selector must return a value that is stable for an unchanged state (a field of the state,
// not a freshly built array). Derived data goes through `useMemo` on `useGame((s) => s)`.

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { GameState, Viewer } from '../game'
import type { OnlineSession, OnlineStore } from './onlineStore'
import { createGameStore, type GameEventListener, type GameStore } from './gameStore'

const StoreContext = createContext<GameStore | null>(null)

/** Seed for a fresh local game: `?seed=` for reproducible sessions, else time-based. */
export function initialSeed(search = typeof location === 'undefined' ? '' : location.search): number {
  const n = Number(new URLSearchParams(search).get('seed'))
  return Number.isInteger(n) && n > 0 ? n >>> 0 : (Date.now() % 2 ** 31) >>> 0
}

export function GameProvider({ store, children }: { store?: GameStore; children: ReactNode }) {
  const [own] = useState(() => store ?? createGameStore({ seed: initialSeed(), boardPreset: 'standard-fixed' }))
  // dev-only handle for browser checks and debugging; absent from production builds
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as { __islesStore?: GameStore }
    w.__islesStore = own
    return () => { delete w.__islesStore }
  }, [own])
  return <StoreContext.Provider value={own}>{children}</StoreContext.Provider>
}

export function useGameStore(): GameStore {
  const s = useContext(StoreContext)
  if (!s) throw new Error('useGameStore must be used inside <GameProvider>')
  return s
}

export function useGame<T>(selector: (s: GameState) => T): T {
  const store = useGameStore()
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()))
}

export const useDispatch = () => useGameStore().dispatch

/** Subscribes to engine events for the component's lifetime; the latest handler is always used. */
export function useGameEvents(handler: GameEventListener) {
  const store = useGameStore()
  const ref = useRef(handler)
  useEffect(() => { ref.current = handler })
  useEffect(() => store.onEvents((e, s) => ref.current(e, s)), [store])
}

/** G5.3b: the online store, or null in a local (hot-seat) game. */
export function useOnline(): OnlineStore | null {
  const s = useGameStore()
  return 'online' in s ? (s as OnlineStore) : null
}

const noSession = () => () => {}
/** The online session (status, seat, lobby), or null in a local game. */
export function useSession(): OnlineSession | null {
  const o = useOnline()
  return useSyncExternalStore(o ? o.onSession : noSession, () => (o ? o.session() : null))
}

/**
 * Whose screen this is: the seat of this connection online (or 'spectator'); null in hot-seat,
 * where the screen belongs to whoever the game waits for.
 */
export function useSeat(): Viewer | null {
  return useSession()?.me ?? null
}
