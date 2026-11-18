// B3: the board for new hot-seat games (start menu, "New game" on the victory card), remembered
// per device. Storage may be blocked: then the choice lasts only for this page.

import { NEW_GAME_BOARD } from '../game'
import { localStore, type KeyValue } from './autosave'

export const BOARD_KEY = 'isles3d.board.v1'
export const BOARD_CHOICES = ['balanced', 'standard-fixed'] as const
export type BoardChoice = (typeof BOARD_CHOICES)[number]

let pageChoice: BoardChoice | null = null

export function readBoardChoice(kv: KeyValue | null = localStore()): BoardChoice {
  let v: string | null = null
  try { v = kv?.getItem(BOARD_KEY) ?? null } catch { /* blocked */ }
  return BOARD_CHOICES.find((c) => c === v) ?? pageChoice ?? NEW_GAME_BOARD
}

export function writeBoardChoice(c: BoardChoice, kv: KeyValue | null = localStore()) {
  pageChoice = c
  try { kv?.setItem(BOARD_KEY, c) } catch { /* not remembered */ }
}
