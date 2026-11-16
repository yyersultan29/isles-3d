import { useEffect } from 'react'
import { advance as renderFrame, useFrame, useThree } from '@react-three/fiber'
import { advance, budget, due, poke, pokeEvent, stats, targetFps } from './frameBudget'
import { useGameEvents } from '../store/GameProvider'
import { autoStepDown, autoVerdict, graphicsSetting, quality, type AutoSample } from './quality'

/** Ignore this long after load or a preset change: shader compiles and texture uploads stall frames. */
const SETTLE_MS = 4000

/**
 * Drives the canvas (World: frameloop="never") at the frame budget's rate: it renders the frame
 * itself, inside its own requestAnimationFrame callback. (With "demand" + invalidate() R3F draws on
 * the *next* animation frame and then stops its loop, which halves 60 to 30.) Raises the rate on
 * any input, camera motion (OrbitControls' `change` also fires during damping and the
 * camera-reset tween) and game events; drops it when the window loses focus.
 */
export function FrameTicker() {
  const get = useThree((s) => s.get)
  const controls = useThree((s) => s.controls) as unknown as EventTarget & { addEventListener(t: string, f: () => void): void; removeEventListener(t: string, f: () => void): void } | null

  useEffect(() => {
    let id = 0, last = -Infinity
    // PERF P4, Graphics: Auto — full-rate frames only (target 60, gap under 250 ms)
    let prevT = -Infinity, prevFull = false, preset = quality.name, settleUntil = performance.now() + SETTLE_MS
    let sample: AutoSample = { frames: 0, seconds: 0 }
    const judge = (t: number, full: boolean) => {
      if (quality.name !== preset) { preset = quality.name; settleUntil = t + SETTLE_MS; sample = { frames: 0, seconds: 0 } }
      const gap = t - prevT
      if (graphicsSetting() === 'auto' && full && prevFull && t > settleUntil && gap < 250) {
        sample.frames++; sample.seconds += gap / 1000
        const v = autoVerdict(sample)
        if (v !== 'wait') { sample = { frames: 0, seconds: 0 }; if (v === 'down') autoStepDown() }
      }
      prevT = t; prevFull = full
    }
    const loop = (t: number) => {
      id = requestAnimationFrame(loop)
      budget.now = t
      stats.target = targetFps(budget)
      if (!due(t, last, stats.target)) return
      const state = get()
      // R3F's clock runs in seconds in "never" mode; start it one frame back, not at page load
      if (last === -Infinity) state.clock.elapsedTime = t / 1000 - 1 / 60
      last = advance(t, last, stats.target)
      renderFrame(t / 1000, true, state)
      judge(t, stats.target === 60)
    }
    id = requestAnimationFrame(loop)
    const act = () => poke()
    const blur = () => { budget.focused = false }
    const focus = () => { budget.focused = true; poke() }
    const opts = { passive: true, capture: true }
    for (const e of ['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart']) window.addEventListener(e, act, opts)
    window.addEventListener('blur', blur)
    window.addEventListener('focus', focus)
    poke() // the first moments after load run at full rate
    return () => {
      cancelAnimationFrame(id)
      for (const e of ['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart']) window.removeEventListener(e, act, opts)
      window.removeEventListener('blur', blur)
      window.removeEventListener('focus', focus)
    }
  }, [get])

  useEffect(() => {
    if (!controls) return
    const act = () => poke()
    controls.addEventListener('change', act)
    return () => controls.removeEventListener('change', act)
  }, [controls])

  useGameEvents(() => pokeEvent())
  useFrame(() => { stats.frames++ })
  return null
}
