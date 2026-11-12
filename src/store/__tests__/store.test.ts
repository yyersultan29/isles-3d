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

  it('a rejected dispatch changes nothing and only tells rejection listeners', () => {
    const st = createGameStore({ seed: 3 })
    let n = 0
    const rejected: string[] = []
    st.subscribe(() => n++)
    st.onEvents(() => n++)
    const offR = st.onRejected((e, p) => rejected.push(`${p}:${e.code}`))
    const before = st.getState()
    const wrong = st.getState().order[1]
    const r = st.dispatch(wrong, firstLegal(st))
    expect(r).toMatchObject({ ok: false, error: { code: 'NOT_YOUR_TURN' } })
    expect(st.getState()).toBe(before)
    expect(n).toBe(0)
    expect(rejected).toEqual([`${wrong}:NOT_YOUR_TURN`])
    offR()
    st.dispatch(wrong, firstLegal(st))
    expect(rejected).toHaveLength(1)
    expect(st.replayFile().actions).toHaveLength(0)
    st.onRejected((e) => rejected.push(e.code))
    st.dispatch(st.getState().order[0], firstLegal(st))
    expect(rejected).toHaveLength(1) // successful actions are not rejections
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

describe('G4.8b load and autosave', async () => {
  const { readSave, writeSave, clearSave, resumable, startAutosave, SAVE_KEY } = await import('../autosave')
  const files = import.meta.glob('../../game/__tests__/golden/*.json', { eager: true, import: 'default' }) as Record<string, import('../../game').ReplayFile>
  const golden = Object.entries(files).find(([k]) => k.includes('standard-fixed-seed7'))![1]
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, removeItem: (k: string) => { m.delete(k) }, m } }

  it('load replays silently: state listeners once, no events, history kept for saving', () => {
    const st = createGameStore({ seed: 1 })
    const half = { ...golden, actions: golden.actions.slice(0, 300) }
    const calls: string[] = []
    st.subscribe(() => calls.push('state'))
    st.onEvents(() => calls.push('events'))
    const g0 = st.generation()
    const r = st.load(half)
    expect(r.ok).toBe(true)
    expect(calls).toEqual(['state'])
    expect(st.generation()).toBe(g0 + 1)
    const ref = replay(half)
    expect(ref.ok && hashState(st.getState())).toBe(ref.ok && hashState(ref.state))
    expect(st.replayFile().actions).toEqual(half.actions)
    // play on from the loaded game: the log continues
    const next = golden.actions[300]
    expect(st.dispatch(next.player, next.action).ok).toBe(true)
    expect(st.replayFile().actions).toHaveLength(301)
  })

  it('a file that does not replay is rejected and the current game is kept', () => {
    const st = createGameStore({ seed: 1 })
    const before = st.getState()
    expect(st.load({ ...golden, engineVersion: '9.0.0' }).ok).toBe(false)
    const bad = { ...golden, actions: [golden.actions[1], ...golden.actions] }
    expect(st.load(bad).ok).toBe(false)
    expect(st.getState()).toBe(before)
  })

  it('autosave writes after every change; saves are read back, checked and offered only when unfinished', () => {
    const kv = mem()
    const st = createGameStore({ seed: 5, boardPreset: 'standard-fixed' })
    const stop = startAutosave(st, kv)
    expect(readSave(kv)).toBeNull()
    st.dispatch(active(st), firstLegal(st))
    expect(readSave(kv)!.actions).toHaveLength(1)
    expect(resumable(readSave(kv))!.turn).toBe(st.getState().turn)
    stop()
    st.dispatch(active(st), firstLegal(st))
    expect(readSave(kv)!.actions).toHaveLength(1) // stopped
    expect(resumable(golden)).toBeNull() // a finished game isn't offered
    expect(resumable({ ...golden, actions: [] })).toBeNull()
    kv.setItem(SAVE_KEY, '{not json')
    expect(readSave(kv)).toBeNull()
    expect(writeSave(golden, { getItem: () => null, setItem: () => { throw new Error('quota') }, removeItem: () => {} })).toBe(false)
    clearSave(kv)
    expect(kv.m.size).toBe(0)
    expect(readSave(null)).toBeNull()
  })
})
