// What the HUD shows for the current game (ROADMAP G4.4a). Pure functions of GameState so they are
// unit-tested; `useGameView` memoises them per state. Only public information is shown for
// opponents: public VP (never hidden VP cards), hand and dev-card counts, awards.

import { useMemo } from 'react'
import { COSTS, legalActions, RESOURCE_ORDER, tradeRate, type Action, type GameState, type PlayerId, type Resource } from '../game'
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
  const hint: Record<string, [string, string]> = { setup: ['Place on board', 'Place'], discard: ['Discarding…', 'Wait'], moveRobber: ['Move robber', 'Robber'], steal: ['Choose victim', 'Rob'], roadBuilding: ['Place roads', 'Roads'] }
  const [label, short] = hint[s.phase.kind] ?? ['Wait', 'Wait']
  return { label, short, action: null, player }
}

export function useGameView() {
  const s = useGame((x) => x)
  return useMemo(() => ({ seats: seats(s), phase: phaseText(s), primary: primaryAction(s), dice: s.dice, phaseKind: s.phase.kind, hand: handOf(s), build: buildOptions(s), active: s.order[s.active], turn: s.turn, discard: discardPrompt(s), steal: stealPrompt(s), bank: bankView(s) }), [s])
}

// ---------- G4.4b: hand and build menu ----------

export type BuildKind = 'road' | 'settlement' | 'city' | 'dev'
export interface BuildOption { kind: BuildKind; enabled: boolean; reason: string | null; cost: Partial<Record<Resource, number>> }

const RES_NAME: Record<Resource, string> = { lumber: 'wood', brick: 'brick', wool: 'wool', grain: 'grain', ore: 'ore' }
export const costText = (c: Partial<Record<Resource, number>>) =>
  RESOURCE_ORDER.filter((r) => c[r]).map((r) => `${c[r]} ${RES_NAME[r]}`).join(', ')

/** The hand the HUD shows: the active player's (hot-seat privacy comes with G4.8). */
export function handOf(s: GameState): { owner: PlayerId; counts: Record<Resource, number> } {
  const owner = s.phase.kind === 'gameOver' ? s.phase.winner : s.order[s.active]
  return { owner, counts: { ...s.players.find((p) => p.id === owner)!.resources } }
}

/** Build menu rows: enabled exactly when legalActions offers that build; otherwise the first reason that applies. */
export function buildOptions(s: GameState): BuildOption[] {
  const p = s.order[s.active]
  const pl = s.players.find((x) => x.id === p)!
  const legal = s.phase.kind === 'gameOver' ? [] : legalActions(s, p)
  const type: Record<BuildKind, string> = { road: 'BUILD_ROAD', settlement: 'BUILD_SETTLEMENT', city: 'BUILD_CITY', dev: 'BUY_DEV' }
  const pieces: Record<BuildKind, number> = { road: pl.pieces.roads, settlement: pl.pieces.settlements, city: pl.pieces.cities, dev: s.deck.length }
  return (['road', 'settlement', 'city', 'dev'] as BuildKind[]).map((kind) => {
    const cost = COSTS[kind]
    const enabled = legal.some((a) => a.type === type[kind])
    let reason: string | null = null
    if (!enabled) {
      const missing = RESOURCE_ORDER.filter((r) => pl.resources[r] < (cost[r] ?? 0))
      if (s.phase.kind === 'preRoll') reason = 'Roll the dice first'
      else if (s.phase.kind !== 'actions') reason = 'Not now'
      else if (pieces[kind] === 0) reason = kind === 'dev' ? 'The deck is empty' : `No ${kind === 'city' ? 'cities' : kind + 's'} left`
      else if (missing.length) reason = `Need ${missing.map((r) => `${(cost[r] ?? 0) - pl.resources[r]} more ${RES_NAME[r]}`).join(', ')}`
      else reason = 'No legal spot'
    }
    return { kind, enabled, reason, cost }
  })
}

// ---------- G4.4c: discard and steal prompts ----------

export interface DiscardPrompt { player: PlayerId; count: number; hand: Record<Resource, number>; waiting: PlayerId[] }

/** The next player who still owes a discard (turn order), with their hand; null outside `discard`. */
export function discardPrompt(s: GameState): DiscardPrompt | null {
  if (s.phase.kind !== 'discard') return null
  const pending = s.phase.pending
  const waiting = s.order.filter((p) => pending[p])
  if (!waiting.length) return null
  const player = waiting[0]
  return { player, count: pending[player]!, hand: { ...s.players.find((p) => p.id === player)!.resources }, waiting }
}

export interface StealPrompt { player: PlayerId; candidates: { id: PlayerId; name: string; color: string; avatar: number; cards: number }[] }

export function stealPrompt(s: GameState): StealPrompt | null {
  if (s.phase.kind !== 'steal') return null
  return {
    player: s.order[s.active],
    candidates: s.phase.candidates.map((id) => ({ id, ...SEATS[id], cards: count(s.players.find((p) => p.id === id)!.resources) })),
  }
}

// ---------- G4.4d: bank and port trades ----------

export interface BankRow { res: Resource; rate: 2 | 3 | 4; have: number; bank: number; canGive: boolean }
export interface BankView { player: PlayerId; open: boolean; reason: string | null; rows: BankRow[] }

/** The bank-trade panel: the active player's rate per resource (ports included) and what the bank holds. */
export function bankView(s: GameState): BankView {
  const player = s.phase.kind === 'gameOver' ? s.phase.winner : s.order[s.active]
  const pl = s.players.find((p) => p.id === player)!
  const open = s.phase.kind === 'actions'
  const reason = open ? null : s.phase.kind === 'preRoll' ? 'Roll the dice first' : 'Not now'
  const rows = RESOURCE_ORDER.map((res) => {
    const rate = tradeRate(s, player, res)
    return { res, rate, have: pl.resources[res], bank: s.bank[res], canGive: open && pl.resources[res] >= rate }
  })
  return { player, open, reason, rows }
}

/** How many cards of `get` the player can buy with `give` right now (0 if none). */
export function bankMax(v: BankView, give: Resource, get: Resource) {
  if (give === get) return 0
  const g = v.rows.find((r) => r.res === give)!, t = v.rows.find((r) => r.res === get)!
  return Math.min(Math.floor(g.have / g.rate), t.bank)
}
