// Render quality presets (V8). They change only rendering cost, never game logic or layout.
//
//   ?quality=high    default: the signed-off look (DPR up to 2, 4096² sun shadows, N8AO, bloom)
//   ?quality=medium  DPR up to 1.5, 2048² shadows, cheaper AO denoise
//   ?quality=low     DPR 1, 2048² shadows, no AO; for integrated GPUs and older laptops
//
// Measured costs and the rationale are recorded in screenshots/milestones/v8/PERF.md.

export type QualityName = 'low' | 'medium' | 'high'

export interface Quality {
  name: QualityName
  /** Canvas device-pixel-ratio range. Never below 1, so the canvas is never upscaled (no blur). */
  dpr: [number, number]
  shadowMapSize: number
  /** N8AO quality mode, or null to skip ambient occlusion. */
  ao: 'low' | 'medium' | null
  bloom: boolean
  /**
   * Re-render the sun's shadow map every N frames instead of every frame. Shadow casters are
   * static except ships, sheep and birds, which move slowly; wind sway is vertex-shader only and
   * doesn't affect the depth pass. One frame of lag on those is not visible.
   */
  shadowEvery: number
}

const PRESETS: Record<QualityName, Quality> = {
  high: { name: 'high', dpr: [1, 2], shadowMapSize: 4096, ao: 'medium', bloom: true, shadowEvery: 2 },
  medium: { name: 'medium', dpr: [1, 1.5], shadowMapSize: 2048, ao: 'low', bloom: true, shadowEvery: 2 },
  low: { name: 'low', dpr: [1, 1], shadowMapSize: 2048, ao: null, bloom: true, shadowEvery: 3 },
}

function pick(): Quality {
  const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('quality') : null
  return q && q in PRESETS ? PRESETS[q as QualityName] : PRESETS.high
}

export const quality: Quality = pick()
