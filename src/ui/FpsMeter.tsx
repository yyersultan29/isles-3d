import { useEffect, useState } from 'react'
import { stats } from '../scene/frameBudget'

const enabled = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('fps')

/**
 * `?fps` diagnostics (docs/PERF_PLAN.md, P0): frames the scene actually rendered per second, the
 * frame budget's current target, and the display's refresh rate (requestAnimationFrame calls per
 * second; 120 on a ProMotion MacBook). Off unless asked for; reads counters twice a second.
 */
export function FpsMeter() {
  const [v, setV] = useState({ fps: 0, target: 0, display: 0 })
  useEffect(() => {
    if (!enabled) return
    let raf = 0, ticks = 0, frames = stats.frames, t0 = performance.now()
    const loop = () => { ticks++; raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)
    const id = setInterval(() => {
      const t = performance.now(), dt = (t - t0) / 1000
      setV({ fps: Math.round((stats.frames - frames) / dt), target: stats.target, display: Math.round(ticks / dt) })
      frames = stats.frames; ticks = 0; t0 = t
    }, 500)
    return () => { cancelAnimationFrame(raf); clearInterval(id) }
  }, [])
  if (!enabled) return null
  return (
    <div data-fps-meter aria-hidden className="pointer-events-none fixed bottom-2 left-1/2 z-[100] -translate-x-1/2 rounded-[8px] bg-black/75 px-[10px] py-[4px] font-mono text-[12px] text-[#c8f7c5]">
      scene {v.fps} fps · target {v.target} · display {v.display} Hz
    </div>
  )
}
