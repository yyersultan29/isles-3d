import { describe, expect, it } from 'vitest'
import { FPS, advance, due, targetFps } from '../frameBudget'

describe('frame budget', () => {
  const s = (o: Partial<Parameters<typeof targetFps>[0]>) => ({ now: 1000, activeUntil: 0, eventUntil: 0, focused: true, ...o })
  it('watches at 30, acts at 60', () => {
    expect(targetFps(s({}))).toBe(FPS.idle)
    expect(targetFps(s({ activeUntil: 1500 }))).toBe(FPS.active)
    expect(targetFps(s({ eventUntil: 1500 }))).toBe(FPS.active)
    expect(targetFps(s({ activeUntil: 900 }))).toBe(FPS.idle)
  })
  it('is nearly still when unfocused, but shows game events at 30', () => {
    expect(targetFps(s({ focused: false, activeUntil: 2000 }))).toBe(FPS.blurred)
    expect(targetFps(s({ focused: false, eventUntil: 2000 }))).toBe(FPS.idle)
  })
  it('never draws more than the target on 60 and 120 Hz displays', () => {
    for (const hz of [60, 120]) {
      for (const fps of [60, 30, 4]) {
        let last = -Infinity, n = 0
        for (let i = 0; i < hz * 10; i++) { const t = (i * 1000) / hz + (i % 3) * 0.6; if (due(t, last, fps)) { last = advance(t, last, fps); n++ } }
        expect(n / 10).toBeLessThanOrEqual(fps + 0.5)
        expect(n / 10).toBeGreaterThanOrEqual(Math.min(fps, hz) * 0.9)
      }
    }
  })
})
