// Keyboard cursor over the board's placement targets (ROADMAP G4.6a). The HUD's BoardPicker owns
// the keys; the scene's Placement draws the cursor with its hover marker and registers a projector
// so arrow keys can move in screen space. Nothing here runs per frame or touches React state per
// frame: the cursor is a tiny external store read by useFrame through getCursor().

import { useSyncExternalStore } from 'react'
import { resourceOf } from '../game'
import type { Action, GameState, PlayerId, TileId, VertexId } from '../game'
import { L, count } from '../ui/locale'
import { cornerPips } from './placement'
import { resName } from '../ui/words'
import { SEATS } from '../ui/gameView'

export type Dir = 'up' | 'down' | 'left' | 'right'
export type Point = [number, number]

// ---------- pure helpers ----------

// G9.4: words in the current language; names as the players set them (G9.3)
const NAMES = new Proxy({} as Record<PlayerId, string>, { get: (_, p: string) => SEATS[p as PlayerId]?.name ?? p })

/** "6 grain", "desert". */
export function tileText(s: GameState, t: TileId): string {
  const tile = s.board.tiles[t]
  const r = resourceOf(tile.terrain)
  return r ? L(`${tile.token} ${resName(r)}`, `${resName(r)} ${tile.token}`) : L('desert', 'пустыня')
}

function portText(s: GameState, v: VertexId): string | null {
  const p = s.board.ports.find((x) => x.vertices.includes(v))
  return p ? (p.kind === 'generic' ? L('3:1 port', 'гавань 3:1') : L(`2:1 ${resName(p.kind)} port`, `гавань 2:1 (${resName(p.kind)})`)) : null
}

/** Board order of tiles: top row first, west to east (screen order at the default camera). */
const byBoard = (s: GameState, ts: TileId[]) => [...ts].sort((a, b) => s.board.tiles[a].r - s.board.tiles[b].r || s.board.tiles[a].q - s.board.tiles[b].q)

/** What a placement target means, in words, for the picker and screen readers. */
export function spotLabel(s: GameState, action: Action): string {
  const topo = s.board.topo
  switch (action.type) {
    case 'PLACE_SETTLEMENT':
    case 'BUILD_SETTLEMENT':
    case 'BUILD_CITY': {
      const v = action.vertex
      const tiles = byBoard(s, topo.vertexTiles[v]).map((t) => tileText(s, t))
      const port = portText(s, v)
      const what = action.type === 'BUILD_CITY' ? L('City', 'Город') : L('Settlement', 'Поселение')
      // G9.5: a new settlement's corner says its value, as the ring size shows it
      const value = action.type === 'BUILD_CITY' ? '' : ` · ${count(cornerPips(s, v), 'dot', 'dots', 'точка', 'точки', 'точек')}`
      return `${what}: ${[...tiles, ...(port ? [port] : [])].join(', ')}${value}`
    }
    case 'PLACE_ROAD':
    case 'BUILD_ROAD': {
      const tiles = byBoard(s, topo.edgeTiles[action.edge]).map((t) => tileText(s, t))
      return tiles.length === 2 ? L(`Road between ${tiles[0]} and ${tiles[1]}`, `Дорога между ${tiles[0]} и ${tiles[1]}`) : L(`Road on the coast of ${tiles[0]}`, `Дорога на берегу у ${tiles[0]}`)
    }
    case 'MOVE_ROBBER': {
      const t = action.tile
      const owners = new Set<PlayerId>()
      for (const v of topo.tileVertices[t]) { const b = s.buildings[v]; if (b) owners.add(b.owner) }
      const who = s.order.filter((p) => owners.has(p)).map((p) => NAMES[p])
      return `${L('Robber to', 'Разбойник на')} ${tileText(s, t)}${who.length ? ` (${who.join(', ')})` : ''}`
    }
    default: return ''
  }
}

const VEC: Record<Dir, Point> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }

/**
 * Index of the point to move to from `from` in direction `dir` (screen coordinates, y down), or
 * `from` itself when nothing lies that way. Candidates must sit within 60° of the direction;
 * the score favours points straight ahead over closer ones off to the side.
 */
export function step(points: Point[], from: number, dir: Dir): number {
  const c = points[from]
  if (!c) return from
  const [dx, dy] = VEC[dir]
  let best = from, bs = Infinity
  points.forEach((p, i) => {
    if (i === from) return
    const vx = p[0] - c[0], vy = p[1] - c[1]
    const along = vx * dx + vy * dy
    const perp = Math.abs(vx * dy - vy * dx)
    if (along <= 0.5 || perp > along * Math.tan(Math.PI / 3)) return
    const score = along + 2 * perp
    if (score < bs) { bs = score; best = i }
  })
  return best
}

/** Index of the point nearest to `p` (ties: first). */
export function nearest(points: Point[], p: Point): number {
  let best = 0, bd = Infinity
  points.forEach((q, i) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = i } })
  return best
}

// ---------- store ----------

/** The cursor is the target id (`at`: a vertex, edge or tile id) or null when the picker is idle. */
let cursor: string | null = null
const listeners = new Set<() => void>()

export function setCursor(at: string | null) {
  if (at === cursor) return
  cursor = at
  for (const l of [...listeners]) l()
}
export const getCursor = () => cursor
export const useCursor = () => useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, () => cursor)

/** Screen position (CSS px, viewport) of a placement action; registered by the scene. */
type Projector = (action: Action) => Point | null
let projector: Projector | null = null
export const setProjector = (p: Projector | null) => { projector = p }
export const project = (a: Action): Point | null => projector?.(a) ?? null
