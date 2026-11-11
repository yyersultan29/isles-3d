// G4.1: the game store owns state, applies actions through the engine and notifies listeners.
import { describe, expect, it } from 'vitest'
import { hashState, legalActions, replay, type Action, type GameEvent } from '../../game'
import { createGameStore } from '../gameStore'
import { initialSeed } from '../GameProvider'

const active = (st: ReturnType<typeof createGameStore>) => { const s = st.getState(); return s.order[s.active] }
const firstLegal = (st: ReturnType<typeof createGameStore>) => legalActions(st.getState(), active(st))[0] as Action

describe('G4.1 game store', () => {
  it('starts a standard-fixed game in setup', () => {
    const st = createGameStore({ seed: 3, boardPreset: 'standard-fixed' })
    expect(st.getState().phase.kind).toBe('setup')
    expect(st.getState().settings.boardPreset).toBe('standard-fixed')
  })

  it('a legal dispatch replaces the state, notifies once, and passes events before state', () => {
    const st = createGameStore({ seed: 3 })
    const calls: string[] = []
    let got: readonly GameEvent[] = []
    st.subscribe(() => calls.push('state'))
    st.onEvents((e) => { calls.push('events'); got = e })
    const before = st.getState()
    const r = st.dispatch(active(st), firstLegal(st))
    expect(r.ok).toBe(true)
    expect(st.getState()).not.toBe(before)
    expect(calls).toEqual(['events', 'state'])
    expect(got[0]).toMatchObject({ type: 'SETUP_PLACED' })
  })

  it('a rejected dispatch changes nothing and notifies nobody', () => {
    const st = createGameStore({ seed: 3 })
    let n = 0
    st.subscribe(() => n++)
    st.onEvents(() => n++)
    const before = st.getState()
    const wrong = st.getState().order[1]
    const r = st.dispatch(wrong, firstLegal(st))
    expect(r).toMatchObject({ ok: false, error: { code: 'NOT_YOUR_TURN' } })
    expect(st.getState()).toBe(before)
    expect(n).toBe(0)
    expect(st.replayFile().actions).toHaveLength(0)
  })

  it('unsubscribe stops notifications', () => {
    const st = createGameStore({ seed: 3 })
    let n = 0
    const off = st.subscribe(() => n++)
    const offE = st.onEvents(() => n++)
    off(); offE()
    st.dispatch(active(st), firstLegal(st))
    expect(n).toBe(0)
  })

  it('the replay file reproduces the store state exactly', () => {
    const st = createGameStore({ seed: 11, boardPreset: 'standard-fixed' })
    while (st.getState().phase.kind === 'setup') st.dispatch(active(st), firstLegal(st))
    st.dispatch(active(st), { type: 'ROLL' })
    const r = replay(st.replayFile())
    expect(r.ok).toBe(true)
    if (r.ok) expect(hashState(r.state)).toBe(hashState(st.getState()))
  })

  it('reset starts a new game, clears the log and emits GAME_STARTED', () => {
    const st = createGameStore({ seed: 3 })
    st.dispatch(active(st), firstLegal(st))
    let ev: readonly GameEvent[] = []
    st.onEvents((e) => { ev = e })
    st.reset({ seed: 4 })
    expect(st.getState().settings.seed).toBe(4)
    expect(st.replayFile().actions).toHaveLength(0)
    expect(ev.some((e) => e.type === 'GAME_STARTED')).toBe(true)
  })

  it('initialSeed reads ?seed= and falls back to a positive integer', () => {
    expect(initialSeed('?seed=42')).toBe(42)
    for (const q of ['', '?seed=abc', '?seed=-1', '?seed=1.5']) {
      const n = initialSeed(q)
      expect(Number.isInteger(n) && n >= 0).toBe(true)
    }
  })
})
