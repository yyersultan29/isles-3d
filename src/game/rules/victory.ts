// Victory check (GAME_DESIGN.md §10.4): runs at the end of every successful apply and when a turn
// starts. Only the active player's total is tested, so an off-turn 10th point wins at the start of
// that player's next turn.

import type { GameEvent, GameState, PlayerId } from '../types'
import { activeId, totalVP, vpCards } from '../state'

export function checkVictory(s: GameState, events: GameEvent[]) {
  if (s.phase.kind === 'setup' || s.phase.kind === 'gameOver') return
  const p = activeId(s)
  if (totalVP(s, p) < s.settings.vpToWin) return
  if (s.trade) {
    events.push({ type: 'TRADE_CANCELLED', tradeId: s.trade.id, reason: 'cancelled' })
    s.trade = null
  }
  s.phase = { kind: 'gameOver', winner: p }
  const totals = {} as Record<PlayerId, number>
  const cards = {} as Record<PlayerId, number>
  for (const id of s.order) { totals[id] = totalVP(s, id); cards[id] = vpCards(s, id) }
  events.push({ type: 'GAME_WON', by: p, totals, vpCards: cards })
}
