// Game store (ROADMAP G4.1): the single owner of the current GameState for the UI and scene.
// Plain TypeScript, no React, so it is unit-tested without a DOM. React binds to it through
// `useSyncExternalStore` in GameProvider.tsx; animations subscribe to events, never to frames.

import { ENGINE_VERSION, apply, createGame, replay } from '../game'
import type { Action, EngineError, GameEvent, GameSettings, GameState, PlayerId, ReplayFile, Result } from '../game'

export type GameEventListener = (events: readonly GameEvent[], state: GameState) => void
export type RejectionListener = (error: EngineError, player: PlayerId, action: Action) => void

export interface GameStore {
  getState(): GameState
  /** state listeners (for useSyncExternalStore); called once per successful dispatch */
  subscribe(listener: () => void): () => void
  /** event listeners (for animations, sounds, announcements); called before state listeners */
  onEvents(listener: GameEventListener): () => void
  /** rejected actions (G4.5: the HUD shows the message for the error code); state is unchanged */
  onRejected(listener: RejectionListener): () => void
  /** validate and apply; a rejected action changes nothing and notifies only rejection listeners */
  dispatch(player: PlayerId, action: Action): Result
  /** start over with new settings (seed etc.) */
  reset(settings: Partial<GameSettings> & { seed: number }): void
  /** the game so far as a replay file (§22), for autosave in G4.8 */
  replayFile(): ReplayFile
  /**
   * G4.8b: continue a saved game. The replay runs silently: event listeners hear nothing (no
   * animations, tags or notices for history), state listeners are told once. A file that doesn't
   * replay (version, an illegal action) is rejected and the current game is kept.
   */
  load(file: ReplayFile): Result
  /** bumps on every reset and load: views snap to a new game instead of animating into it */
  generation(): number
}

export function createGameStore(settings: Partial<GameSettings> & { seed: number }): GameStore {
  let state: GameState
  let log: ReplayFile['actions'] = []
  let gen = 0
  const listeners = new Set<() => void>()
  const eventListeners = new Set<GameEventListener>()
  const rejectionListeners = new Set<RejectionListener>()

  const start = (s: Partial<GameSettings> & { seed: number }) => {
    const r = createGame(s)
    if (!r.ok) throw new Error(`createGame: ${r.error.code}: ${r.error.message}`)
    state = r.state
    log = []
    gen++
    return r.events
  }
  start(settings)

  const emit = (events: readonly GameEvent[]) => {
    for (const l of [...eventListeners]) l(events, state)
    for (const l of [...listeners]) l()
  }

  return {
    getState: () => state,
    subscribe(l) {
      listeners.add(l)
      return () => { listeners.delete(l) }
    },
    onEvents(l) {
      eventListeners.add(l)
      return () => { eventListeners.delete(l) }
    },
    onRejected(l) {
      rejectionListeners.add(l)
      return () => { rejectionListeners.delete(l) }
    },
    dispatch(player, action) {
      const r = apply(state, player, action)
      if (!r.ok) {
        for (const l of [...rejectionListeners]) l(r.error, player, action)
        return r
      }
      state = r.state
      log.push({ player, action })
      emit(r.events)
      return r
    },
    reset(s) {
      emit(start(s))
    },
    load(file) {
      const r = replay(file)
      if (!r.ok) return r
      state = r.state
      log = file.actions.map((a) => ({ ...a }))
      gen++
      for (const l of [...listeners]) l()
      return { ok: true, state, events: [] }
    },
    generation: () => gen,
    replayFile: () => ({ schemaVersion: 1, engineVersion: ENGINE_VERSION, settings: { ...state.settings }, actions: [...log] }),
  }
}
