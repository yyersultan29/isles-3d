// Seeded mulberry32 (GAME_DESIGN.md §11). The generator state is a uint32 stored in GameState, so a
// seed plus an action log replays a game exactly. No Math.random or Date.now anywhere in src/game.

export interface Rng {
  /** float in [0, 1) */
  next(): number
  /** current uint32 state, to write back into GameState */
  readonly state: number
}

export function createRng(state: number): Rng {
  let a = state >>> 0
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
    get state() {
      return a
    },
  }
}

/** integer in [0, n) */
export const pick = (rng: Rng, n: number) => Math.floor(rng.next() * n)

export const d6 = (rng: Rng) => 1 + pick(rng, 6)

/** Fisher–Yates; returns a new array and consumes exactly length−1 draws. */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const a = items.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = pick(rng, i + 1)
    const t = a[i]
    a[i] = a[j]
    a[j] = t
  }
  return a
}
