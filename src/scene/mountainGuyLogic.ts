// "Mountain guy": a decorative character (the author's friend) standing on a mountain tile.
// Pure logic only: where he stands and how he idles. MountainGuy.tsx draws him; Vegetation keeps
// trees and rocks off his spot. No game state is involved: he never affects the rules.

import type { Ray } from 'three'
import { LEDGES, TILES, corner, groundHeight, hexDist, robberSpot, tileAt, tileHeight, vertexToScene, type Tile } from './board'
import type { GameEvent, GameState, TileId, VertexId } from '../game'
import { L } from '../ui/locale'

/** Model file under public/ (built from src/models/mountain-guy by scripts/build-mountain-guy.mjs). */
export const GUY_MODEL = 'models/mountain-guy.glb'

/** World height of a settlement (base ≈ 0.028 + walls 0.11 + roof 0.085, ×1.6 in BuildingPiece). */
export const SETTLEMENT_H = 0.36
/** He is ~1.2× a settlement. */
export const GUY_H = SETTLEMENT_H * 1.2
/** Radius of his footprint on the ground (model is ~0.57 × 0.53 of its height across). */
export const GUY_FOOT = 0.13

/** The ore boulder beside him (scenery): its centre and ground height, and the yaw that faces it (relative to his rest yaw). */
export interface GuyRock { x: number; z: number; y: number; faceYaw: number }
export interface GuySpot { tile: Tile; x: number; z: number; y: number; yaw: number; score: number; rock: GuyRock }

/** Boulder footprint radius and its distance from his centre. */
export const ROCK_R = 0.075
export const ROCK_D = 0.22

/**
 * Local (to the tile centre) spot test. Keeps the whole footprint:
 *  - inside the hex and clear of the rails and roads (hex distance ≤ 0.8 at the far edge),
 *  - off the number token's plateau and out of its sightline toward the camera (+z),
 *  - off every corner, where settlements and cities go,
 *  - off the robber's spot and the strip in front of it (the robber can visit any tile).
 */
export function spotFree(lx: number, lz: number, r = GUY_FOOT): boolean {
  if (hexDist(lx, lz) > 0.8 - r * 1.15) return false
  if (Math.hypot(lx, lz) < 0.36 + r) return false
  if (lz > -r && lz < 0.62 + r && Math.abs(lx) < 0.3 + r + Math.max(0, lz) * 0.15) return false
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 180) * (60 * k - 30)
    if (Math.hypot(lx - Math.cos(a), lz - Math.sin(a)) < 0.3 + r) return false
  }
  const rx = -0.5 // robberSpot: ROBBER_ASIDE to the west of the centre
  for (const [bx, bz, br] of [[rx, 0, 0.22], [rx, 0.24, 0.2], [rx, 0.42, 0.16]]) if (Math.hypot(lx - bx, lz - bz) < br + r) return false
  return true
}

/**
 * Share of the sight line from (x, y, z) toward the default camera that the ground blocks. The
 * line aims at the camera's home position (the auto-framed pose at 1440×900, measured), not along
 * its 43° view axis: perspective makes the far tiles' angle flatter.
 */
const EYE = [0.42, 10.37, 12.5] as const
export function hidden(x: number, z: number, y: number) {
  const dx = EYE[0] - x, dy = EYE[1] - y, dz = EYE[2] - z, len = Math.hypot(dx, dy, dz)
  let n = 0
  for (let d = 0.05; d <= 1.2; d += 0.05) if (groundHeight(x + (dx / len) * d, z + (dz / len) * d) > y + (dy / len) * d) n++
  return n / 24
}

function wrap(a: number) { return Math.atan2(Math.sin(a), Math.cos(a)) }

/** Ground relief under the footprint: max − min height (flat ground scores low). */
function relief(t: Tile, x: number, z: number, r = GUY_FOOT) {
  let lo = Infinity, hi = -Infinity
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI * 2, k = i === 8 ? 0 : r
    const h = tileHeight(t, x + Math.cos(a) * k, z + Math.sin(a) * k)
    lo = Math.min(lo, h); hi = Math.max(hi, h)
  }
  return [lo, hi] as const
}

/**
 * Best spot on one tile: flattest, lowest free ground, preferring the camera side (+z) so the
 * mountain doesn't hide him. Feet go on the lowest point under the footprint (no floating toes).
 */
export function bestSpot(t: Tile): GuySpot | null {
  let best: GuySpot | null = null, bs = Infinity
  for (let lz = -0.8; lz <= 0.8; lz += 0.02) {
    for (let lx = -0.8; lx <= 0.8; lx += 0.02) {
      if (!spotFree(lx, lz)) continue
      const x = t.x + lx, z = t.z + lz
      const [lo, hi] = relief(t, x, z)
      // the quarry ledge flattens his ground, so relief only sets how deep the cut is
      const base = (hi - lo) * 1.5 + lo + Math.max(0, -lz) * 0.3
      if (base >= bs) continue
      // the boulder beside him: free ground at the same level, best off to his side (as the camera
      // sees it, world ±x) so his swing shows in profile, a little toward the camera
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2, dx = Math.cos(a) * ROCK_D, dz = Math.sin(a) * ROCK_D
        if (!spotFree(lx + dx, lz + dz, ROCK_R)) continue
        const [rlo, rhi] = relief(t, x + dx, z + dz, ROCK_R)
        // behind him (−z) the camera would see his back and not the swing; ahead or to the side is fine
        const score = base + (rhi - rlo) * 0.5 + Math.abs(rlo - lo) * 1 + Math.max(0, -Math.sin(a)) * 0.6 + (1 - Math.abs(Math.cos(a))) * 0.05
          + hidden(x, z, lo + 0.2) * 0.5 + hidden(x, z, lo + 0.005) * 3 + hidden(x, z, lo + 0.05) * 3 + hidden(x + dx, z + dz, rlo + 0.05) * 0.5
        if (score >= bs) continue
        bs = score
        // at rest he faces the camera, turned a little toward the token so he "looks" at his tile
        const yaw = Math.atan2(-lx, -lz) * 0.25
        best = { tile: t, x, z, y: lo, yaw, score, rock: { x: x + dx, z: z + dz, y: tileHeight(t, x + dx, z + dz), faceYaw: wrap(Math.atan2(dx, dz) - yaw) } }
      }
    }
  }
  return best
}

/**
 * His spot on the board: the best spot over the mountain tiles, tiles nearer the camera (+z)
 * preferred so he isn't a speck at the far edge; null if the board has no mountains.
 */
export function pickGuySpot(tiles: Tile[] = TILES): GuySpot | null {
  let best: GuySpot | null = null, bs = Infinity
  for (const t of tiles.filter((t) => t.biome === 'mountain')) {
    const s = bestSpot(t)
    if (s && s.score - t.z * 0.12 < bs) { bs = s.score - t.z * 0.12; best = s }
  }
  return best
}

export let GUY_SPOT: GuySpot | null = null
/**
 * (Re)picks his spot for the current TILES and cuts his little quarry: a flat ledge under him and the
 * boulder, at his feet' height. Runs at load and again when the scene switches boards (sceneBoard.ts).
 */
export function refreshGuySpot() {
  LEDGES.length = 0 // the ledges are his alone; the spot search must see the natural ground
  GUY_SPOT = pickGuySpot()
  if (GUY_SPOT) {
    const { x, z, y, rock } = GUY_SPOT
    rock.y = y
    LEDGES.push({ x, z, r: GUY_FOOT + 0.02, y }, { x: rock.x, z: rock.z, r: ROCK_R + 0.03, y })
  }
}
refreshGuySpot()

/** Robber spot check used by tests: he never stands where the robber does. */
export const robberClear = (s: GuySpot) => { const [rx, rz] = robberSpot(s.tile); return Math.hypot(s.x - rx, s.z - rz) > 0.22 + GUY_FOOT }

// ---------- reactions and lines (bubble text in the current language) ----------

export type GuyMood = 'click' | 'cheer' | 'sad' | 'scared' | 'relief' | 'look'
export interface GuyReaction { mood: GuyMood; say: string; lookAt?: [number, number] }

/** What he says when clicked. */
export const CLICK_LINES = () => [
  L("Ore won't mine itself!", 'Руда сама себя не добудет!'),
  L('Great view from up here.', 'Отсюда отличный вид.'),
  L('The mountains are calling!', 'Горы зовут!'),
  L('Build next to me, get ore.', 'Строй рядом со мной — будет руда.'),
  L('No ore, no city.', 'Без руды города не построишь.'),
  L("Careful, I'm on a cliff!", 'Осторожно, я на скале!'),
  L('Great view from up here.', 'Отсюда отличный вид.'),
  L('The mountains are my home.', 'Горы — мой дом.'),
]

/** A random line other than the last one (index), so two clicks never repeat. */
export function pickLine(lines: string[], last: number, rnd: () => number = Math.random): number {
  if (lines.length < 2) return 0
  const i = Math.floor(rnd() * (lines.length - 1))
  return i >= last && last >= 0 ? i + 1 : i
}

const MOOD_RANK: Record<GuyMood, number> = { scared: 5, relief: 4, sad: 3, cheer: 3, look: 2, click: 1 }

/**
 * His reaction to one batch of game events, or null. Only things on his own tile count:
 *  - the robber arrives (scared) or leaves (relief);
 *  - his number is rolled: a cheer, or a sad line when the robber sits on the tile;
 *  - a settlement or city goes up on one of his tile's corners: he turns to look at it;
 *  - someone wins: a cheer.
 * The strongest reaction in the batch wins (a roll of 7 and a robber move arrive together).
 */
export function guyReaction(events: readonly GameEvent[], s: GameState, tile: TileId): GuyReaction | null {
  const token = s.board.tiles[tile]?.token
  const corners = new Set<string>(s.board.topo.tileVertices[tile] ?? [])
  let best: GuyReaction | null = null
  const offer = (r: GuyReaction) => { if (!best || MOOD_RANK[r.mood] > MOOD_RANK[best.mood]) best = r }
  for (const e of events) {
    if (e.type === 'ROBBER_MOVED' && e.to === tile) offer({ mood: 'scared', say: L('Hey! This is my mountain!', 'Эй! Это моя гора!') })
    else if (e.type === 'ROBBER_MOVED' && e.from === tile) offer({ mood: 'relief', say: L("He's gone. Phew.", 'Ушёл. Фух.') })
    else if (e.type === 'DICE_ROLLED' && e.dice[0] + e.dice[1] === token) {
      const n = e.dice[0] + e.dice[1]
      const homes = [...corners].filter((v) => s.buildings[v as VertexId]).length
      if (s.robber === tile) offer({ mood: 'sad', say: L(`${n}, my number… but the robber is here.`, `${n} — моё число… но тут разбойник.`) })
      else if (homes) offer({ mood: 'cheer', say: L(`${n}! Ore for my neighbours!`, `${n}! Соседям — руда!`) })
      else offer({ mood: 'cheer', say: L(`${n}! Pity nobody lives here yet.`, `${n}! Жаль, рядом никто не живёт.`) })
    } else if ((e.type === 'BUILT' || e.type === 'SETUP_PLACED') && e.what !== 'road' && corners.has(e.at)) {
      const { tile: tt, corner: k } = vertexToScene(e.at as VertexId)
      const lookAt = corner(tileAt(...tt), k)
      offer(e.what === 'city'
        ? { mood: 'look', say: L("A city! That's what ore is for.", 'Город! Вот зачем нужна руда.'), lookAt }
        : { mood: 'look', say: L('Oh, neighbours!', 'О, соседи!'), lookAt })
    } else if (e.type === 'GAME_WON') offer({ mood: 'cheer', say: L('Well played!', 'Отличная игра!') })
  }
  return best
}

/** Seconds each reaction drives the pose. */
export const MOOD_S: Record<GuyMood, number> = { click: 0.5, cheer: 1.0, sad: 2.6, scared: 0.5, relief: 0.5, look: 3.2 }

const smooth = (x: number) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k) }
/** 0 → 1 over `rise` s, held, back to 0 over the last `rise` s of `len`. */
const envelope = (s: number, rise: number, len: number) => smooth(s / rise) * smooth((len - s) / rise)

export interface GuyAct { mood: GuyMood | null; s: number; lookYaw?: number }

/**
 * Pose at ambient time t (seconds), no skeleton needed. Idle: he shifts his weight from foot to foot
 * (a slow side-to-side sway: `x` and `lean`), turns a little to look around, and breathes (a small
 * bob). On top, the current reaction (`act.s` seconds after it started): cheer = a jump with a full
 * turn (no turn when `calm`, reduced motion); click and relief = a small hop; scared = a hop back with
 * a lean away; sad = a slump; look = turn to `lookYaw` (relative to his rest facing). `shiver` (robber
 * on his tile) adds a fast tremble.
 */
export function guyPose(t: number, act: GuyAct = { mood: null, s: 0 }, calm = false, shiver = false) {
  const { mood, s } = act
  const live = mood !== null && s >= 0 && s < MOOD_S[mood]
  const k = live ? s / MOOD_S[mood!] : 0
  const sway = Math.sin(t * 1.1) // weight shift, about one step every 3 s
  const x = sway * 0.007
  const lean = sway * 0.045
  let yaw = Math.sin(t * 0.45) * 0.35 + Math.sin(t * 1.3) * 0.05
  let y = Math.abs(Math.cos(t * 1.1)) * 0.004 + (Math.sin(t * 1.8) * 0.5 + 0.5) * 0.003 // lifts a little between steps
  let pitch = 0, squash = 1 + Math.sin(t * 1.8) * 0.012
  if (live) {
    const arc = Math.sin(Math.PI * k)
    if (mood === 'cheer') { y += arc * 0.14; if (!calm) yaw += k * Math.PI * 2 }
    else if (mood === 'click' || mood === 'relief') y += arc * 0.05
    else if (mood === 'scared') { y += arc * 0.07; pitch -= 0.3 * Math.exp(-s * 4) }
    else if (mood === 'sad') { const e = envelope(s, 0.3, MOOD_S.sad); pitch += 0.18 * e; squash *= 1 - 0.04 * e }
    else if (mood === 'look' && act.lookYaw !== undefined) yaw += wrap(act.lookYaw - yaw) * envelope(s, 0.4, MOOD_S.look)
  }
  if (shiver) yaw += Math.sin(t * 40) * (calm ? 0.008 : 0.03)
  return { x, y, yaw, pitch, lean, squash }
}

// ---------- click target, shared with board picking ----------
// Placement picks targets where the pointer ray meets the ground plane; a click on his head would
// land behind him, maybe on a corner or edge. The scene registers a test against his click proxy
// so Placement ignores clicks that hit him (works for touch too: no hover needed).
let hitTest: ((ray: Ray) => boolean) | null = null
export const setGuyHitTest = (f: ((ray: Ray) => boolean) | null) => { hitTest = f }
export const hitsGuy = (ray: Ray) => hitTest?.(ray) ?? false
