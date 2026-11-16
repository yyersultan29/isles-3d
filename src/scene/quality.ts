// Render quality presets (V8) and the Graphics setting (PERF P4). They change only rendering cost,
// never game logic or layout.
//
//   high    default: the signed-off look (DPR up to 2, 4096² sun shadows, N8AO, bloom)
//   medium  DPR up to 1.5, 2048² shadows, cheaper AO denoise
//   low     DPR 1, 2048² shadows, no AO; for integrated GPUs and older laptops
//   auto    starts at high; steps down to medium if high can't hold 60 fps while the player acts
//
// The player picks one in the start menu or the help panel (saved in localStorage). `?quality=`
// overrides it for tests and screenshots. Measured costs: screenshots/milestones/v8/PERF.md and
// screenshots/milestones/perf/PERF.md.
import { useSyncExternalStore } from 'react'

export type QualityName = 'low' | 'medium' | 'high'
export type GraphicsSetting = QualityName | 'auto'

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

export const PRESETS: Record<QualityName, Quality> = {
  high: { name: 'high', dpr: [1, 2], shadowMapSize: 4096, ao: 'medium', bloom: true, shadowEvery: 2 },
  medium: { name: 'medium', dpr: [1, 1.5], shadowMapSize: 2048, ao: 'low', bloom: true, shadowEvery: 2 },
  low: { name: 'low', dpr: [1, 1], shadowMapSize: 2048, ao: null, bloom: true, shadowEvery: 3 },
}

/** The setting a first-time player gets. 'high' keeps the signed-off look; 'auto' would favour quiet laptops. */
export const DEFAULT_SETTING: GraphicsSetting = 'high'
export const GRAPHICS_SETTINGS: GraphicsSetting[] = ['auto', 'high', 'medium', 'low']
const KEY = 'isles.graphics'

const isSetting = (v: unknown): v is GraphicsSetting => typeof v === 'string' && (GRAPHICS_SETTINGS as string[]).includes(v)
const urlQuality = (() => {
  const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('quality') : null
  return q && q in PRESETS ? (q as QualityName) : null
})()
function stored(): GraphicsSetting {
  try { const v = localStorage.getItem(KEY); return isSetting(v) ? v : DEFAULT_SETTING } catch { return DEFAULT_SETTING }
}

// ---------- state: the chosen setting and, for 'auto', the level it settled on ----------

let setting: GraphicsSetting = urlQuality ?? stored()
let autoLevel: QualityName = 'high'
const listeners = new Set<() => void>()
const emit = () => { quality = current(); listeners.forEach((l) => l()) }
const current = (): Quality => PRESETS[setting === 'auto' ? autoLevel : setting]

/** The active preset. Read it in frame loops; subscribe with useQuality() in components. */
export let quality: Quality = current()

export const graphicsSetting = () => setting
export function setGraphics(s: GraphicsSetting) {
  if (s === setting) return
  setting = s
  autoLevel = 'high' // re-picking Auto measures again
  try { localStorage.setItem(KEY, s) } catch { /* private mode: the choice lasts this visit */ }
  emit()
}
/** Auto steps down one level (never up within a visit, so the picture doesn't flip back and forth). */
export function autoStepDown() {
  if (setting !== 'auto' || autoLevel !== 'high') return false
  autoLevel = 'medium'
  emit()
  return true
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export const useQuality = () => useSyncExternalStore(subscribe, () => quality)
export const useGraphicsSetting = () => useSyncExternalStore(subscribe, () => setting)

// ---------- Auto: does this preset hold 60 fps while the player acts? (pure, tested) ----------

/** Seconds of full-rate (60 fps target) time Auto needs before judging. */
export const AUTO_SAMPLE_S = 3
/** Below this many rendered fps at a 60 target the preset is too heavy for this screen and GPU. */
export const AUTO_MIN_FPS = 54

/** Running sample of full-rate frames: add frame gaps while the target is 60; judge when there's enough. */
export interface AutoSample { frames: number; seconds: number }
export function autoVerdict(s: AutoSample): 'wait' | 'ok' | 'down' {
  if (s.seconds < AUTO_SAMPLE_S) return 'wait'
  return s.frames / s.seconds < AUTO_MIN_FPS ? 'down' : 'ok'
}
