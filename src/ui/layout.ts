// Viewport classification shared by the HUD and the camera auto-framing, so both agree on
// which layout is active and which screen area the board may use.

import { useEffect, useState } from 'react'

/** Narrow or portrait screens use the compact HUD (top bar + bottom dock) instead of the side columns. */
export function isCompact(w: number, h: number) {
  return w < 900 || h > w
}

/** Compact HUD reserved areas in CSS px: keep in sync with CompactHUD.tsx. */
export const COMPACT_SAFE = { top: 62, bottom: 146, side: 8 }

export function useViewport() {
  const read = () => ({ w: window.innerWidth, h: window.innerHeight })
  const [vp, setVp] = useState(read)
  useEffect(() => {
    const f = () => setVp(read())
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])
  return { ...vp, compact: isCompact(vp.w, vp.h) }
}
