// Shared animation clock and motion preferences for all ambient (non-essential) animation.
//
// - Every ambient animation reads `animTime.value` instead of the R3F clock, so one place
//   controls speed. The step is clamped, so returning to a hidden tab (browsers pause
//   requestAnimationFrame there) resumes smoothly instead of jumping.
// - `prefers-reduced-motion: reduce` (or `?reducedmotion` in the URL) slows ambient motion
//   to a near standstill and hides purely decorative movers (smoke, birds).

const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
const forced = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('reducedmotion')

export const motion = { reduced: forced || (mq?.matches ?? false) }
mq?.addEventListener('change', (e) => {
  motion.reduced = forced || e.matches
})

/** Seconds of ambient animation time; also bound as the `uTime` uniform of the water, foam and wind shaders. */
export const animTime = { value: 0 }

/** Advance the shared clock; call once per frame. */
export function stepAnimTime(dt: number) {
  animTime.value += Math.min(dt, 0.05) * (motion.reduced ? 0.12 : 1)
}
