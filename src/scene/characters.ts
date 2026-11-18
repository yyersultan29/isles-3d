// Decorative characters on the board (owner's request 2026-11-18): one per biome listed below, plus
// the robber's model. Pure config and spot logic; CharacterFigures.tsx draws them, characterModel.ts loads
// the GLBs (built by scripts/build-character.mjs), Vegetation keeps trees and rocks off their spots.
// They never touch the game state.

import { TILES, hexDist, tileHeight, type Biome, type Tile } from './board'
import { GUY_H, hidden, spotFree } from './mountainGuyLogic'

export interface CharacterDef {
  id: string
  /** File under public/. */
  model: string
  /** World height after the fit (feet on y=0, centred on x/z). */
  targetHeight: number
  /** Footprint radius on the ground: the spot search, the decor clearing and the click proxy use it. */
  foot: number
  /** Local shift after the fit. */
  offset: [number, number, number]
  /** Extra turn; 0 = the model's own front (+z), which faces the camera. */
  yaw: number
  castShadow: boolean
  receiveShadow: boolean
  /** Tile types it may stand on; it stands on one of them per board. */
  biomes: Biome[]
  /** Spot rule: the flattest free ground the camera can see, outside the token, corners and robber
   * spot; between tiles, `frontBias` per world unit prefers tiles nearer the camera (+z). */
  frontBias: number
  enabled: boolean
}

const H = GUY_H * 1.1 // a little taller than the mountain guy

export const CHARACTERS: CharacterDef[] = [
  { id: 'fermer', model: 'models/fermer.glb', targetHeight: H, foot: 0.15, offset: [0, 0, 0], yaw: 0, castShadow: true, receiveShadow: true, biomes: ['wheat'], frontBias: 0.12, enabled: true },
  { id: 'postuh', model: 'models/postuh.glb', targetHeight: H, foot: 0.14, offset: [0, 0, 0], yaw: 0, castShadow: true, receiveShadow: true, biomes: ['pasture'], frontBias: 0.12, enabled: true },
  // shortcut: src/models/glina is a byte-for-byte copy of fermer, so it is off; give it its own GLB and enable it when a real model arrives
  { id: 'glina', model: 'models/fermer.glb', targetHeight: H, foot: 0.15, offset: [0, 0, 0], yaw: 0, castShadow: true, receiveShadow: true, biomes: ['hills'], frontBias: 0.12, enabled: false },
]

/** The robber's figure: stands on its base disc (Pieces.tsx), where the game puts the robber; `rim` is a
 * fresnel edge light so the dark cloak reads on forest and desert alike. */
export const ROBBER_FIGURE = { model: 'models/robber.glb', targetHeight: 0.5, rim: '#f3e7c6', rimStrength: 0.9 }

export interface CharacterSpot { def: CharacterDef; tile: Tile; x: number; z: number; y: number; yaw: number }

/** Lowest and highest ground under a footprint. */
function relief(t: Tile, x: number, z: number, r: number) {
  let lo = Infinity, hi = -Infinity
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI * 2, k = i === 8 ? 0 : r
    const h = tileHeight(t, x + Math.cos(a) * k, z + Math.sin(a) * k)
    lo = Math.min(lo, h); hi = Math.max(hi, h)
  }
  return [lo, hi] as const
}

/** Best spot on one tile (score: lower is better), or null when nothing is free. */
export function characterSpot(def: CharacterDef, t: Tile): (CharacterSpot & { score: number }) | null {
  let best: (CharacterSpot & { score: number }) | null = null
  for (let lz = -0.8; lz <= 0.8; lz += 0.02) {
    for (let lx = -0.8; lx <= 0.8; lx += 0.02) {
      if (!spotFree(lx, lz, def.foot)) continue
      const x = t.x + lx, z = t.z + lz
      const [lo, hi] = relief(t, x, z, def.foot)
      const score = (hi - lo) * 3 + Math.max(0, -lz) * 0.3 + hidden(x, z, lo + 0.05) * 3 + hidden(x, z, lo + def.targetHeight * 0.5)
      if (best && score >= best.score) continue
      // faces the camera, turned a little toward the token so it "looks" at its tile
      best = { def, tile: t, x, z, y: lo, yaw: Math.atan2(-lx, -lz) * 0.25, score }
    }
  }
  return best
}

export function pickCharacterSpots(tiles: Tile[] = TILES): CharacterSpot[] {
  const out: CharacterSpot[] = []
  for (const def of CHARACTERS) {
    if (!def.enabled) continue
    let best: CharacterSpot | null = null, bs = Infinity
    for (const t of tiles) {
      if (!def.biomes.includes(t.biome)) continue
      const s = characterSpot(def, t)
      if (s && s.score - t.z * def.frontBias < bs) { bs = s.score - t.z * def.frontBias; best = s }
    }
    if (best) out.push(best)
  }
  return out
}

export let CHARACTER_SPOTS: CharacterSpot[] = []
/** Runs at load and when the scene switches boards (sceneBoard.ts), before Vegetation rebuilds its blockers. */
export function refreshCharacterSpots() { CHARACTER_SPOTS = pickCharacterSpots() }
refreshCharacterSpots()

/** The footprint stays inside its hex (used by tests). */
export const insideHex = (s: CharacterSpot) => hexDist(s.x - s.tile.x, s.z - s.tile.z) <= 0.8
