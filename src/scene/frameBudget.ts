// Frame budget (docs/PERF_PLAN.md, P1–P2). The canvas renders on demand; FrameTicker asks for a
// frame at the rate chosen here:
//   - 60 fps while the player acts (input, camera motion, a game event's animations), and for a
//     moment after;
//   - 30 fps while they only watch (ambient water, wind, smoke, the mountain guy);
//   - 4 fps while the window is unfocused (another app is in front), 30 when a game event arrives.
// Never above 60, whatever the display (a 120 Hz screen would otherwise draw every frame twice).
// Ambient animation advances by real time (motion.ts), so only how often it's sampled changes.

export const FPS = { active: 60, idle: 30, blurred: 4 } as const
/** How long one input or camera move keeps the loop at full rate (covers orbit damping, ~1 s). */
export const ACTIVE_MS = 1500
/** How long a game event keeps it there (piece drop, robber hop, dice, the guy's reaction). */
export const EVENT_MS = 2600

export interface BudgetState { now: number; activeUntil: number; eventUntil: number; focused: boolean }

/** Target frames per second for a state (pure). */
export function targetFps(s: BudgetState): number {
  const event = s.now < s.eventUntil
  if (!s.focused) return event ? FPS.idle : FPS.blurred
  return event || s.now < s.activeUntil ? FPS.active : FPS.idle
}

/**
 * Should a display frame at `t` (ms) be drawn, given the last drawn one at `last` and a target
 * fps? A small tolerance absorbs rAF jitter, so 60 on a 60 Hz screen draws every frame and 30
 * draws every second one; on 120 Hz, 60 draws every second frame.
 */
export const due = (t: number, last: number, fps: number) => t - last >= (1000 / fps) * 0.85
/** The new `last` after drawing at `t`: on the ideal grid, so the average rate is exactly `fps` (catching up after a stall). */
export const advance = (t: number, last: number, fps: number) => Math.max(last + 1000 / fps, t - 1000 / fps)

// ---------- shared state (set by input/event listeners, read by the ticker and the ?fps meter) ----------

export const budget: BudgetState = { now: 0, activeUntil: 0, eventUntil: 0, focused: true }
export const stats = { frames: 0, target: FPS.idle as number }

export function poke(ms = ACTIVE_MS) { budget.activeUntil = Math.max(budget.activeUntil, performance.now() + ms) }
export function pokeEvent(ms = EVENT_MS) { budget.eventUntil = Math.max(budget.eventUntil, performance.now() + ms) }
