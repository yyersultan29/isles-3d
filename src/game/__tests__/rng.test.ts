import { describe, expect, it } from 'vitest'
import { createRng, d6, pick, shuffle } from '../rng'

describe('rng', () => {
  it('is deterministic for a seed and resumable from its state', () => {
    const a = createRng(42), b = createRng(42)
    const xs = Array.from({ length: 5 }, () => a.next())
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(xs)
    const c = createRng(42); c.next(); c.next()
    const d = createRng(c.state)
    expect(d.next()).toBe(xs[2])
  })
  it('d6 is roughly uniform', () => {
    const r = createRng(7), n = 60000, counts = [0, 0, 0, 0, 0, 0]
    for (let i = 0; i < n; i++) counts[d6(r) - 1]++
    for (const c of counts) expect(Math.abs(c / n - 1 / 6)).toBeLessThan(0.01)
  })
  it('shuffle is a permutation and consumes length−1 draws', () => {
    const r = createRng(3)
    const out = shuffle(r, [1, 2, 3, 4, 5, 6, 7])
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5, 6, 7])
    const r2 = createRng(3); for (let i = 0; i < 6; i++) pick(r2, 2)
    expect(r2.state).toBe(r.state)
  })
})
