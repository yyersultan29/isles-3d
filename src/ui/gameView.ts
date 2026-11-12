// What the HUD shows for the current game (ROADMAP G4.4a). Pure functions of GameState so they are
// unit-tested; `useGameView` memoises them per state. Only public information is shown for
// opponents: public VP (never hidden VP cards), hand and dev-card counts, awards.

import { useMemo } from 'react'
import { legalActions, type Action, type GameState, type PlayerId } from '../game'
import { useGame } from '../store/GameProvider'

/** Seat names and colours; colours match the 3D pieces (scene/board.ts PLAYER_COLORS walls). */
export const SEATS: Record<PlayerId, { name: string; color: string; avatar: number }> = {
  p1: { name: 'Red', color: '#d23a2e', avatar: 0 },
  p2: { name: 'Blue', color: '#2f5fe0', avatar: 1 },
  p3: { name: 'White', color: '#c9ccd2', avatar: 3 },
  p4: { name: 'Orange', color: '#e0812f', avatar: 2 },
}

export interface SeatView {
  id: PlayerId
  name: string
  color: string
  avatar: number
  vp: number
  cards: number
  devCards: number
  knights: number
  longestRoad: boolean
  largestArmy: boolean
  active: boolean
}

const count = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)

export function publicVP(s: GameState, id: PlayerId) {
  let vp = 0
  for (const b of Object.values(s.buildings)) if (b?.owner === id) vp += b.type === 'city' ? 2 : 1
  if (s.longestRoad === id) vp += 2
  if (s.largestArmy === id) vp += 2
  return vp
}

export function seats(s: GameState): SeatView[] {
  const active = s.phase.kind === 'gameOver' ? s.phase.winner : s.order[s.active]
  return s.order.map((id) => {
    const p = s.players.find((x) => x.id === id)!
    return {
      id, ...SEATS[id],
      vp: publicVP(s, id),
      cards: count(p.resources),
      devCards: p.devCards.length,
      knights: p.playedKnights,
      longestRoad: s.longestRoad === id,
      largestArmy: s.largestArmy === id,
      active: id === active,
    }
  })
}

/** One line telling everyone what the game is waiting for. */
export function phaseText(s: GameState): string {
  const who = SEATS[s.order[s.active]].name
  switch (s.phase.kind) {
    case 'setup': {
      const round = s.phase.round === 1 ? 'first' : 'second'
      return s.phase.step === 'settlement' ? `${who}: place your ${round} settlement` : `${who}: place a road next to it`
    }
    case 'preRoll': return `${who}: roll the dice`
    case 'actions': return `${who}: build, trade or end your turn`
    case 'discard': {
      const pending = s.phase.pending
      const list = s.order.filter((p) => pending[p]).map((p) => `${SEATS[p].name} ${pending[p]}`).join(', ')
      return `Seven! Discard half: ${list}`
    }
    case 'moveRobber': return `${who}: move the robber`
    case 'steal': return `${who}: choose a player to rob`
    case 'roadBuilding': return `${who}: place ${s.phase.remaining === 2 ? 'two free roads' : 'one free road'}`
    case 'gameOver': return `${SEATS[s.phase.winner].name} wins!`
  }
}

/** The plinth's main button: Roll in preRoll, End Turn in actions, otherwise a disabled hint. */
export function primaryAction(s: GameState): { label: string; short: string; action: Action | null; player: PlayerId | null } {
  if (s.phase.kind === 'gameOver') return { label: 'Game over', short: 'Over', action: null, player: null }
  const player = s.order[s.active]
  const legal = legalActions(s, player)
  if (s.phase.kind === 'preRoll' && legal.some((a) => a.type === 'ROLL')) return { label: 'Roll Dice', short: 'Roll', action: { type: 'ROLL' }, player }
  if (s.phase.kind === 'actions' && legal.some((a) => a.type === 'END_TURN')) return { label: 'End Turn', short: 'End', action: { type: 'END_TURN' }, player }
  // disabled hints: [desktop label, compact label]
  const hint: Record<string, [string, string]> = { setup: ['Place on board', 'Place'], discard: ['Discarding…', 'Discard'], moveRobber: ['Move robber', 'Robber'], steal: ['Choose victim', 'Rob'], roadBuilding: ['Place roads', 'Roads'] }
  const [label, short] = hint[s.phase.kind] ?? ['Wait', 'Wait']
  return { label, short, action: null, player }
}

export function useGameView() {
  const s = useGame((x) => x)
  return useMemo(() => ({ seats: seats(s), phase: phaseText(s), primary: primaryAction(s), dice: s.dice, phaseKind: s.phase.kind }), [s])
}
