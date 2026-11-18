// Which engine board the 3D scene shows (B2, docs/BOARD_GEN_PLAN.md). The scene modules build their
// board data once at load from `standard-fixed`; syncSceneBoard repoints them at the game's board and
// returns a signature that World uses as a React key, so the board-dependent meshes rebuild.

import { PORT_EDGES, STANDARD_FIXED, type Board } from '../game'
import { BOARD_MODE, applySceneBoard } from './board'
import { refreshGuySpot } from './mountainGuyLogic'
import { refreshCharacterSpots } from './characters'

type Layout = Readonly<Record<string, { terrain: string; token: number | null }>>
const signature = (tiles: Layout, kinds: readonly string[]) =>
  Object.keys(tiles).sort().map((id) => `${id}:${tiles[id].terrain}:${tiles[id].token ?? '-'}`).join('|') + '#' + kinds.join(',')

/** Other modules' board-derived caches (Vegetation's blockers): rebuilt after every switch. Registered at their load, so this module needs no DOM imports. */
const hooks: (() => void)[] = []
export const onSceneBoard = (rebuild: () => void) => { hooks.push(rebuild) }

let current = signature(Object.fromEntries(Object.entries(STANDARD_FIXED).map(([id, [terrain, token]]) => [id, { terrain, token }])), PORT_EDGES.map((p) => p.kind))

/** Repoints the scene at `board` if it differs from the one shown; returns the shown board's signature. */
export function syncSceneBoard(board: Board): string {
  if (BOARD_MODE === 'demo') return 'demo'
  const sig = signature(board.tiles, board.ports.map((p) => p.kind))
  if (sig === current) return sig
  applySceneBoard(board.tiles, board.ports)
  refreshGuySpot()
  refreshCharacterSpots()
  for (const h of hooks) h()
  current = sig
  return sig
}
