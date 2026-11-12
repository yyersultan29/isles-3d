// What the HUD shows for the current game (ROADMAP G4.4a). Pure functions of GameState so they are
// unit-tested; `useGameView` memoises them per state. Only public information is shown for
// opponents: public VP (never hidden VP cards), hand and dev-card counts, awards.

import { useMemo } from 'react'
import { COSTS, legalActions, MAX_PROPOSALS_PER_TURN, RESOURCE_ORDER, tradeRate, type Action, type GameState, type PlayerId, type Resource, type Viewer } from '../game'
import { useGame, useSeat, useSession } from '../store/GameProvider'

/**
 * G5.3b: whose screen it is. `null` is hot-seat (the screen follows whoever the game waits for);
 * online it is this connection's seat, or 'spectator', and only that seat's controls are live.
 */
export type Me = Viewer | null
/** whether `p` may act from this screen */
const mine = (me: Me, p: PlayerId) => me === null || me === p

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
  /** online: the seat's player has no live connection (G5.4) */
  away?: boolean
  /** online: the server plays this seat's decisions until its player acts again (G5.5) */
  auto?: boolean
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
export function primaryAction(s: GameState, me: Me = null): { label: string; short: string; action: Action | null; player: PlayerId | null } {
  if (s.phase.kind === 'gameOver') return { label: 'Game over', short: 'Over', action: null, player: null }
  const player = s.order[s.active]
  if (!mine(me, player)) {
    // online, someone else's move; during a seven this seat may still owe a discard (its dialog)
    const label = s.phase.kind === 'discard' ? 'Discarding…' : `${SEATS[player].name}’s turn`
    return { label, short: 'Wait', action: null, player: null }
  }
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
  const me = useSeat()
  const seatsOnline = useSession()?.seats
  return useMemo(() => {
    const v = gameView(s, me)
    if (!seatsOnline?.length) return v
    const away = new Set(seatsOnline.filter((x) => x.taken && !x.connected).map((x) => x.id))
    const auto = new Set(seatsOnline.filter((x) => x.absent).map((x) => x.id))
    return { ...v, seats: v.seats.map((p) => (away.has(p.id) || auto.has(p.id) ? { ...p, away: away.has(p.id), auto: auto.has(p.id) } : p)) }
  }, [s, me, seatsOnline])
}

/** Everything the HUD shows, from one state and one point of view. */
export function gameView(s: GameState, me: Me = null) {
  const self = me && me !== 'spectator' ? me : s.order[s.active]
  return {
    seats: seats(s), phase: phaseText(s), primary: primaryAction(s, me), dice: s.dice, phaseKind: s.phase.kind, hand: handOf(s, me), build: buildOptions(s, me),
    active: s.order[s.active], turn: s.turn, discard: discardPrompt(s, me), steal: stealPrompt(s, me), bank: bankView(s, me), offer: offerView(s, me), dev: devView(s, me),
    final: finalScores(s), opponents: s.order.filter((p) => p !== self), me,
  }
}

// ---------- G4.4b: hand and build menu ----------

export type BuildKind = 'road' | 'settlement' | 'city' | 'dev'
export interface BuildOption { kind: BuildKind; enabled: boolean; reason: string | null; cost: Partial<Record<Resource, number>> }

const RES_NAME: Record<Resource, string> = { lumber: 'wood', brick: 'brick', wool: 'wool', grain: 'grain', ore: 'ore' }
export const costText = (c: Partial<Record<Resource, number>>) =>
  RESOURCE_ORDER.filter((r) => c[r]).map((r) => `${c[r]} ${RES_NAME[r]}`).join(', ')

// ---------- G4.8a: hot-seat privacy ----------

/**
 * Who is looking at the screen: the player the game waits for. That is the active player, except
 * during a seven's discards, which hot-seat collects one at a time in turn order (§9). Null once
 * the game is over (everything is revealed then).
 */
export function viewerOf(s: GameState): PlayerId | null {
  if (s.phase.kind === 'gameOver') return null
  return discardPrompt(s)?.player ?? s.order[s.active]
}

/** Whether a player holds anything the others must not see: resource cards or development cards. */
export function hasPrivate(s: GameState, p: PlayerId): boolean {
  const pl = s.players.find((x) => x.id === p)!
  return pl.devCards.length > 0 || RESOURCE_ORDER.some((r) => pl.resources[r] > 0)
}

/** The pass-the-device screen is needed when the viewer changes to someone with private cards. */
export const needsPass = (s: GameState, seen: PlayerId | null): boolean => {
  const v = viewerOf(s)
  return !!v && v !== seen && hasPrivate(s, v)
}

/** The hand the HUD shows: the viewer's (the discarding player during a seven), the winner's at the end. */
export function handOf(s: GameState, me: Me = null): { owner: PlayerId; counts: Record<Resource, number> } {
  // online: always this seat's own hand; a spectator sees no hand
  if (me === 'spectator') return { owner: s.order[s.active], counts: { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 } }
  const owner = me ?? (s.phase.kind === 'gameOver' ? s.phase.winner : viewerOf(s)!)
  return { owner, counts: { ...s.players.find((p) => p.id === owner)!.resources } }
}

/** Build menu rows: enabled exactly when legalActions offers that build; otherwise the first reason that applies. */
export function buildOptions(s: GameState, me: Me = null): BuildOption[] {
  const active = s.order[s.active]
  if (!mine(me, active)) {
    const reason = me === 'spectator' ? 'Watching' : 'Wait for your turn'
    return (['road', 'settlement', 'city', 'dev'] as BuildKind[]).map((kind) => ({ kind, enabled: false, reason, cost: COSTS[kind] }))
  }
  const p = active
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
export function discardPrompt(s: GameState, me: Me = null): DiscardPrompt | null {
  if (s.phase.kind !== 'discard') return null
  const pending = s.phase.pending
  const waiting = s.order.filter((p) => pending[p])
  if (!waiting.length) return null
  // hot-seat collects discards one at a time in turn order; online every seat discards at once
  const player = me === null ? waiting[0] : me !== 'spectator' && pending[me] ? me : null
  if (!player) return null
  return { player, count: pending[player]!, hand: { ...s.players.find((p) => p.id === player)!.resources }, waiting }
}

export interface StealPrompt { player: PlayerId; candidates: { id: PlayerId; name: string; color: string; avatar: number; cards: number }[] }

export function stealPrompt(s: GameState, me: Me = null): StealPrompt | null {
  if (s.phase.kind !== 'steal' || !mine(me, s.order[s.active])) return null
  return {
    player: s.order[s.active],
    candidates: s.phase.candidates.map((id) => ({ id, ...SEATS[id], cards: count(s.players.find((p) => p.id === id)!.resources) })),
  }
}

// ---------- G4.4d: bank and port trades ----------

export interface BankRow { res: Resource; rate: 2 | 3 | 4; have: number; bank: number; canGive: boolean }
export interface BankView { player: PlayerId; open: boolean; reason: string | null; rows: BankRow[] }

/** The bank-trade panel: the active player's rate per resource (ports included) and what the bank holds. */
export function bankView(s: GameState, me: Me = null): BankView {
  const active = s.phase.kind === 'gameOver' ? s.phase.winner : s.order[s.active]
  const player = me && me !== 'spectator' ? me : active
  const pl = s.players.find((p) => p.id === player)!
  const myTurn = mine(me, s.order[s.active])
  const open = s.phase.kind === 'actions' && myTurn
  const reason = open ? null : !myTurn ? (me === 'spectator' ? 'Watching' : 'Wait for your turn') : s.phase.kind === 'preRoll' ? 'Roll the dice first' : 'Not now'
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

// ---------- G4.4d2: player-to-player offers ----------

export type Counts = Partial<Record<Resource, number>>
const sum = (c: Counts) => RESOURCE_ORDER.reduce((a, r) => a + (c[r] ?? 0), 0)

/** Why the active player can't propose this offer yet (mirrors rules/trade.ts propose), or null. */
export function proposeCheck(s: GameState, offer: Counts, request: Counts, to: PlayerId[]): string | null {
  if (s.phase.kind !== 'actions') return 'Not now'
  const pl = s.players.find((p) => p.id === s.order[s.active])!
  if (!sum(offer)) return 'Add cards you give'
  if (!sum(request)) return 'Add cards you want'
  if (RESOURCE_ORDER.some((r) => offer[r] && request[r])) return 'A resource can’t be on both sides'
  if (!to.length) return 'Choose at least one player'
  const short = RESOURCE_ORDER.find((r) => (offer[r] ?? 0) > pl.resources[r])
  if (short) return `You have only ${pl.resources[short]} ${RES_NAME[short]}`
  if (s.tradesProposedThisTurn >= MAX_PROPOSALS_PER_TURN) return `At most ${MAX_PROPOSALS_PER_TURN} offers per turn`
  return null
}

export interface OfferRow { id: PlayerId; name: string; color: string; avatar: number; response: 'pending' | 'accept' | 'reject'; canRespond: boolean; canAccept: boolean; canConfirm: boolean; reason: string | null }
/** `canManage`: this screen may confirm or cancel (the proposer's) */
export interface OfferView { id: number; from: PlayerId; offer: Counts; request: Counts; rows: OfferRow[]; canManage: boolean }

/** The open offer and where each addressed player stands; buttons follow legalActions. */
export function offerView(s: GameState, me: Me = null): OfferView | null {
  const t = s.trade
  if (!t || s.phase.kind !== 'actions') return null
  const canManage = mine(me, t.from)
  const confirmable = new Set(canManage ? legalActions(s, t.from).flatMap((a) => (a.type === 'CONFIRM_TRADE' ? [a.with] : [])) : [])
  const rows = t.to.map((id) => {
    // online only the addressed seat answers, and only its own hand is known
    const canRespond = mine(me, id)
    const canAccept = canRespond && legalActions(s, id).some((a) => a.type === 'RESPOND_TRADE' && a.accept)
    const res = s.players.find((p) => p.id === id)!.resources
    const short = RESOURCE_ORDER.filter((r) => res[r] < (t.request[r] ?? 0))
    return {
      id, ...SEATS[id], response: t.responses[id] ?? 'pending', canRespond, canAccept, canConfirm: confirmable.has(id),
      reason: canAccept || !canRespond ? null : short.length ? `Needs ${short.map((r) => `${(t.request[r] ?? 0) - res[r]} more ${RES_NAME[r]}`).join(', ')}` : null,
    } as OfferRow
  })
  return { id: t.id, from: t.from, offer: { ...t.offer }, request: { ...t.request }, rows, canManage }
}

// ---------- G4.4e: development cards ----------

export type DevKind = 'knight' | 'roadBuilding' | 'yearOfPlenty' | 'monopoly' | 'victoryPoint'
export interface DevRow { type: DevKind; count: number; playable: boolean; reason: string | null }
export interface DevView { player: PlayerId; total: number; rows: DevRow[]; yopTake: number; bank: Record<Resource, number>; canOpen: boolean }

const DEV_ORDER: DevKind[] = ['knight', 'roadBuilding', 'yearOfPlenty', 'monopoly', 'victoryPoint']
const PLAY_TYPE: Record<Exclude<DevKind, 'victoryPoint'>, Action['type']> = { knight: 'PLAY_KNIGHT', roadBuilding: 'PLAY_ROAD_BUILDING', yearOfPlenty: 'PLAY_YEAR_OF_PLENTY', monopoly: 'PLAY_MONOPOLY' }

/** The active player's development cards by type; a row is playable exactly when legalActions offers it. */
export function devView(s: GameState, me: Me = null): DevView {
  const player = me && me !== 'spectator' ? me : s.phase.kind === 'gameOver' ? s.phase.winner : s.order[s.active]
  const pl = s.players.find((p) => p.id === player)!
  const legal = s.phase.kind === 'gameOver' || me === 'spectator' ? [] : legalActions(s, player)
  const rows = DEV_ORDER.flatMap((type): DevRow[] => {
    const cards = pl.devCards.filter((c) => c.type === type)
    if (!cards.length) return []
    if (type === 'victoryPoint') return [{ type, count: cards.length, playable: false, reason: 'Counts at the end' }]
    const playable = legal.some((a) => a.type === PLAY_TYPE[type])
    let reason: string | null = null
    if (!playable) {
      if (!mine(me, s.order[s.active])) reason = 'Wait for your turn'
      else if (s.phase.kind !== 'preRoll' && s.phase.kind !== 'actions') reason = 'Not now'
      else if (pl.playedDevThisTurn) reason = 'One card per turn'
      else if (cards.every((c) => c.boughtOnTurn >= s.turn)) reason = 'Bought this turn'
      else if (type === 'roadBuilding') reason = 'No legal road'
      else if (type === 'yearOfPlenty') reason = 'The bank is empty'
      else reason = 'Not now'
    }
    return [{ type, count: cards.length, playable, reason }]
  })
  const bankTotal = RESOURCE_ORDER.reduce((a, r) => a + s.bank[r], 0)
  const canOpen = me !== 'spectator' && (s.phase.kind === 'preRoll' || s.phase.kind === 'actions')
  return { player, total: me === 'spectator' ? 0 : pl.devCards.length, rows: me === 'spectator' ? [] : rows, yopTake: Math.min(2, bankTotal), bank: { ...s.bank }, canOpen }
}

// ---------- G4.5d: final scores ----------

export interface FinalRow { id: PlayerId; name: string; color: string; avatar: number; settlements: number; cities: number; longestRoad: boolean; largestArmy: boolean; vpCards: number; knights: number; total: number; winner: boolean }

/** The end-of-game table (§18): every source of points, hidden VP cards revealed; winner first, then by total. */
export function finalScores(s: GameState): { winner: PlayerId; turn: number; rows: FinalRow[] } | null {
  if (s.phase.kind !== 'gameOver') return null
  const winner = s.phase.winner
  const rows = s.order.map((id) => {
    const pl = s.players.find((p) => p.id === id)!
    let settlements = 0, cities = 0
    for (const b of Object.values(s.buildings)) if (b?.owner === id) { if (b.type === 'city') cities++; else settlements++ }
    const vpCards = pl.devCards.filter((c) => c.type === 'victoryPoint').length
    const longestRoad = s.longestRoad === id, largestArmy = s.largestArmy === id
    return {
      id, ...SEATS[id], settlements, cities, longestRoad, largestArmy, vpCards, knights: pl.playedKnights,
      total: settlements + 2 * cities + (longestRoad ? 2 : 0) + (largestArmy ? 2 : 0) + vpCards, winner: id === winner,
    }
  })
  rows.sort((a, b) => Number(b.winner) - Number(a.winner) || b.total - a.total || s.order.indexOf(a.id) - s.order.indexOf(b.id))
  return { winner, turn: s.turn, rows }
}
