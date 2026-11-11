import { Component, useEffect, useState, type ReactNode } from 'react'
import { useThree } from '@react-three/fiber'

/**
 * WebGL failure handling (V8). The HUD stays usable; only the 3D view is replaced by a notice.
 *  - No WebGL 2 at all (or `?nowebgl` for testing): show the notice instead of mounting the canvas.
 *  - A render-time exception inside the scene: caught by SceneErrorBoundary.
 *  - GPU context loss (driver reset, too many tabs): ContextLossGuard reports it; three.js restores
 *    the context on its own, and the notice offers a reload in case it doesn't come back.
 */

export function hasWebGL2(): boolean {
  if (new URLSearchParams(window.location.search).has('nowebgl')) return false
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2')
    gl?.getExtension('WEBGL_lose_context')?.loseContext() // free the probe context right away
    return !!gl
  } catch {
    return false
  }
}

type Status = 'ok' | 'unsupported' | 'error' | 'lost'
const EVENT = 'isles:scene-status'
const report = (s: Status) => window.dispatchEvent(new CustomEvent<Status>(EVENT, { detail: s }))

export class SceneErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.error('3D scene failed:', error)
    report('error')
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

/** Mounted inside <Canvas>: forwards context loss/restore to the DOM notice. */
export function ContextLossGuard() {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    const el = gl.domElement
    const lost = (e: Event) => { e.preventDefault(); report('lost') } // preventDefault allows restoration
    const restored = () => report('ok')
    el.addEventListener('webglcontextlost', lost)
    el.addEventListener('webglcontextrestored', restored)
    return () => {
      el.removeEventListener('webglcontextlost', lost)
      el.removeEventListener('webglcontextrestored', restored)
    }
  }, [gl])
  return null
}

const TEXT: Record<Exclude<Status, 'ok'>, [string, string]> = {
  unsupported: ['3D view unavailable', 'This browser or device does not support WebGL 2. Try an up-to-date Chrome, Edge, Firefox or Safari, or enable hardware acceleration.'],
  error: ['3D view failed to start', 'Something went wrong while drawing the island. Reloading usually fixes it.'],
  lost: ['Graphics were interrupted', 'The GPU reset the 3D view. It should come back in a moment; if not, reload the page.'],
}

/** DOM notice shown over the (missing or broken) canvas. */
export function SceneStatusNotice({ initial }: { initial: Status }) {
  const [status, setStatus] = useState<Status>(initial)
  useEffect(() => {
    const f = (e: Event) => setStatus((e as CustomEvent<Status>).detail)
    window.addEventListener(EVENT, f)
    return () => window.removeEventListener(EVENT, f)
  }, [])
  if (status === 'ok') return null
  const [title, body] = TEXT[status]
  return (
    <div role="alert" className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_50%_40%,#1d3a52,#0b2236_70%)] p-6 font-ui text-[#f4efe6]">
      <div className="max-w-[420px] rounded-[12px] border border-[#c9a45c]/35 bg-[rgba(12,14,19,0.9)] px-6 py-5 text-center shadow-[0_10px_30px_rgba(0,0,0,0.55)]">
        <h2 className="mb-2 font-display text-[20px] font-semibold">{title}</h2>
        <p className="mb-4 text-[14px] leading-relaxed text-[#d6d2ca]">{body}</p>
        {status !== 'unsupported' && (
          <button
            onClick={() => window.location.reload()}
            className="pointer-events-auto rounded-[9px] border border-[#e0a94a] px-4 py-2 text-[14px] font-semibold text-[#f1d9a8] outline-none hover:bg-white/[0.07] focus-visible:ring-2 focus-visible:ring-[#e0a94a]"
          >
            Reload
          </button>
        )}
      </div>
    </div>
  )
}
