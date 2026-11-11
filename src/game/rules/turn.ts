// Turn skeleton (GAME_DESIGN.md §4.1, §4.3): ROLL in preRoll, END_TURN in actions.

import type { GameEvent, GameState, PlayerId } from '../types'
import { RESOURCE_ORDER } from '../types'
import { d6, type Rng } from '../rng'
import { activeId, bankPay } from '../state'
import { produce } from './production'
import { startSeven } from './robber'

export function roll(s: GameState, player: PlayerId, rng: Rng, events: GameEvent[]) {
  const dice: [number, number] = [d6(rng), d6(rng)] // d1 then d2: part of the replay format
  s.dice = dice
  events.push({ type: 'DICE_ROLLED', by: player, dice })
  const sum = dice[0] + dice[1]
  if (sum === 7) return startSeven(s, events) // discards → robber → steal (§6)
  const { gains, shortfall } = produce(s, sum)
  for (const p of s.order) {
    const g = gains[p]
    if (g) for (const res of RESOURCE_ORDER) if (g[res]) bankPay(s, p, res, g[res]!)
  }
  events.push({ type: 'RESOURCES_PRODUCED', gains, shortfall })
  s.phase = { kind: 'actions' }
}

export function endTurn(s: GameState, player: PlayerId, events: GameEvent[]) {
  if (s.trade) {
    events.push({ type: 'TRADE_CANCELLED', tradeId: s.trade.id, reason: 'turnEnded' })
    s.trade = null
  }
  events.push({ type: 'TURN_ENDED', player })
  for (const p of s.players) p.playedDevThisTurn = false
  s.active = (s.active + 1) % s.order.length
  s.turn += 1
  s.dice = null
  s.tradesProposedThisTurn = 0
  s.phase = { kind: 'preRoll' }
  events.push({ type: 'TURN_STARTED', player: activeId(s), turn: s.turn })
}
