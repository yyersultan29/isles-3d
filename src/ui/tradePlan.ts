// Trade and build planning for the fast trade and build UI (ROADMAP G6.1). Pure functions of
// GameState (no React), unit-tested against the engine: whatever they call possible is an action
// the engine accepts, and they never invent rules. The engine still validates every action.
//
//  - bankQuote:  is a give/want draft one legal bank trade, and at what rate?
//  - payOptions: every way to pay the bank for a wanted card, cheapest first
//  - shortfall:  the cards a build lacks, and bank trades that would cover them
//  - affordable: how many of a build the hand pays for right now

import { COSTS, RESOURCE_ORDER, apply, legalActions, tradeRate, type Action, type GameState, type PlayerId, type Resource } from '../game'
import type { BuildKind, Counts, Me } from './gameView'

const NAME: Record<Resource, string> = { lumber: 'wood', brick: 'brick', wool: 'wool', grain: 'grain', ore: 'ore' }
const kinds = (c: Counts) => RESOURCE_ORDER.filter((r) => (c[r] ?? 0) > 0)
const total = (c: Counts) => RESOURCE_ORDER.reduce((a, r) => a + (c[r] ?? 0), 0)

type BankTrade = Extract<Action, { type: 'BANK_TRADE' }> & { count: number }
const BUILD_ACTION: Record<BuildKind, Action['type']> = { road: 'BUILD_ROAD', settlement: 'BUILD_SETTLEMENT', city: 'BUILD_CITY', dev: 'BUY_DEV' }

/** The player whose turn it is, if this screen may act for them in `actions`; otherwise why not. */
function trader(s: GameState, me: Me): { player: PlayerId } | { reason: string } {
  const active = s.order[s.active]
  if (me === 'spectator') return { reason: 'Watching' }
  if (me !== null && me !== active) return { reason: 'Wait for your turn' }
  if (s.phase.kind === 'preRoll') return { reason: 'Roll the dice first' }
  if (s.phase.kind !== 'actions') return { reason: 'Not now' }
  return { player: active }
}

export type BankQuote =
  | { ok: true; action: BankTrade; rate: 2 | 3 | 4; text: string }
  | { ok: false; reason: string }

/**
 * Whether the draft (`give` → `want`) is exactly one bank trade the engine accepts: one kind of card
 * given, at the player's rate for it, for one other kind. The reason says what to change otherwise.
 */
export function bankQuote(s: GameState, give: Counts, want: Counts, me: Me = null): BankQuote {
  const t = trader(s, me)
  if ('reason' in t) return { ok: false, reason: t.reason }
  const g = kinds(give), w = kinds(want)
  if (!g.length || !w.length) return { ok: false, reason: !g.length ? 'Add cards you give' : 'Add cards you want' }
  if (g.length > 1 || w.length > 1) return { ok: false, reason: 'The bank trades one kind for one kind' }
  const [r] = g, [x] = w
  if (r === x) return { ok: false, reason: 'A resource can’t be on both sides' }
  const rate = tradeRate(s, t.player, r)
  const n = want[x]!, cost = give[r]!
  const have = s.players.find((p) => p.id === t.player)!.resources[r]
  if (cost > have) return { ok: false, reason: `You have only ${have} ${NAME[r]}` }
  if (cost !== n * rate) return { ok: false, reason: `The bank takes ${rate} ${NAME[r]} per card (${rate}:1)` }
  if (s.bank[x] < n) return { ok: false, reason: `The bank has only ${s.bank[x]} ${NAME[x]}` }
  return { ok: true, action: { type: 'BANK_TRADE', give: r, get: x, count: n }, rate, text: `${cost} ${NAME[r]} → ${n} ${NAME[x]} (${rate}:1)` }
}

export interface PayOption { give: Resource; cost: number; rate: 2 | 3 | 4; action: BankTrade; text: string }

/**
 * Every way to buy `count` of `want` from the bank with one kind of card, cheapest rate first, then
 * the kind the player holds most of (spending surplus), then the usual resource order.
 */
export function payOptions(s: GameState, want: Resource, count = 1, me: Me = null): PayOption[] {
  const t = trader(s, me)
  if ('reason' in t || s.bank[want] < count) return []
  const pl = s.players.find((p) => p.id === t.player)!
  return RESOURCE_ORDER.filter((r) => r !== want)
    .map((r) => ({ r, rate: tradeRate(s, t.player, r) }))
    .filter(({ r, rate }) => pl.resources[r] >= rate * count)
    .sort((a, b) => a.rate - b.rate || pl.resources[b.r] - pl.resources[a.r] || RESOURCE_ORDER.indexOf(a.r) - RESOURCE_ORDER.indexOf(b.r))
    .map(({ r, rate }) => ({
      give: r, cost: rate * count, rate,
      action: { type: 'BANK_TRADE' as const, give: r, get: want, count },
      text: `${rate * count} ${NAME[r]}${rate < 4 ? ' (port)' : ''}`,
    }))
}

/** G7.8: why a wanted card has no way to pay the bank, as visible text (null when there is a way) */
export function noPayReason(s: GameState, want: Resource, count = 1, me: Me = null): string | null {
  if (payOptions(s, want, count, me).length) return null
  const t = trader(s, me)
  if ('reason' in t) return t.reason
  if (s.bank[want] < count) return `The bank has only ${s.bank[want]} ${NAME[want]}`
  // the player's own rates: a generic port makes every kind 3, a special port one kind 2
  const rates = RESOURCE_ORDER.filter((r) => r !== want).map((r) => ({ r, rate: tradeRate(s, t.player, r) }))
  const low = Math.min(...rates.map((x) => x.rate)), high = Math.max(...rates.map((x) => x.rate))
  if (low === high) return `Can't pay the bank: you need ${low * count} of one kind`
  const cheap = rates.filter((x) => x.rate === low).map((x) => NAME[x.r]).join(' or ')
  return `Can't pay the bank: you need ${low * count} ${cheap} or ${high * count} of another kind`
}

export interface Shortfall {
  /** cards the build still needs (empty when the hand already pays) */
  missing: Counts
  /** bank trades, in order, that cover `missing` without touching the cards the build itself needs */
  trades: BankTrade[]
  /** the trades cover it and the build is legal afterwards (there is a spot, a piece, a card) */
  covered: boolean
  /** the same trades as one give/want draft for the trade panel (G6.4 fills it in) */
  draft: { give: Counts; want: Counts }
}

/**
 * What a build lacks and how the bank could cover it. Trades are chosen greedily, one missing card
 * at a time: the cheapest rate first, paid from the kind with the most cards to spare (cards the
 * build needs are never spent). `covered` is checked by applying the trades and asking the engine.
 */
export function shortfall(s: GameState, kind: BuildKind, me: Me = null): Shortfall {
  const empty: Shortfall = { missing: {}, trades: [], covered: false, draft: { give: {}, want: {} } }
  const t = trader(s, me)
  if ('reason' in t) return empty
  const p = t.player
  const cost = COSTS[kind] as Counts
  const hand = { ...s.players.find((x) => x.id === p)!.resources }
  const missing: Counts = {}
  for (const r of RESOURCE_ORDER) { const m = (cost[r] ?? 0) - hand[r]; if (m > 0) missing[r] = m }
  if (!total(missing)) {
    const legal = legalActions(s, p).some((a) => a.type === BUILD_ACTION[kind])
    return { ...empty, covered: legal }
  }
  // spare = what is left after the build's own cost is set aside
  const spare = Object.fromEntries(RESOURCE_ORDER.map((r) => [r, Math.max(0, hand[r] - (cost[r] ?? 0))])) as Record<Resource, number>
  const bank = { ...s.bank }
  const plan = new Map<string, BankTrade>()
  let ok = true
  for (const want of RESOURCE_ORDER) {
    for (let k = 0; k < (missing[want] ?? 0); k++) {
      const pay = RESOURCE_ORDER.filter((r) => !missing[r] && r !== want)
        .map((r) => ({ r, rate: tradeRate(s, p, r) }))
        .filter(({ r, rate }) => spare[r] >= rate)
        .sort((a, b) => a.rate - b.rate || spare[b.r] - spare[a.r] || RESOURCE_ORDER.indexOf(a.r) - RESOURCE_ORDER.indexOf(b.r))[0]
      if (!pay || bank[want] < 1) { ok = false; break }
      spare[pay.r] -= pay.rate
      bank[want] -= 1
      const key = `${pay.r}>${want}`
      const prev = plan.get(key)
      plan.set(key, { type: 'BANK_TRADE', give: pay.r, get: want, count: (prev?.count ?? 0) + 1 })
    }
    if (!ok) break
  }
  const trades = ok ? [...plan.values()] : []
  const draft = { give: {} as Counts, want: {} as Counts }
  for (const tr of trades) {
    draft.give[tr.give] = (draft.give[tr.give] ?? 0) + tr.count * tradeRate(s, p, tr.give)
    draft.want[tr.get] = (draft.want[tr.get] ?? 0) + tr.count
  }
  // ask the engine: every trade in turn, then the build itself
  let covered = ok
  if (ok) {
    let cur = s
    for (const tr of trades) { const r = apply(cur, p, tr); if (!r.ok) { covered = false; break } cur = r.state }
    if (covered) covered = legalActions(cur, p).some((a) => a.type === BUILD_ACTION[kind])
  }
  return { missing, trades, covered, draft }
}

/** How many of a build the hand pays for now, capped by the pieces left (the deck for cards). */
export function affordable(s: GameState, kind: BuildKind, p: PlayerId): number {
  const pl = s.players.find((x) => x.id === p)!
  const cost = COSTS[kind] as Counts
  const byCards = Math.min(...RESOURCE_ORDER.filter((r) => cost[r]).map((r) => Math.floor(pl.resources[r] / cost[r]!)))
  const pieces = kind === 'road' ? pl.pieces.roads : kind === 'settlement' ? pl.pieces.settlements : kind === 'city' ? pl.pieces.cities : s.deck.length
  return Math.max(0, Math.min(byCards, pieces))
}

/** "4 wood → 1 brick" for each trade of a plan, at the player's rates. */
export function tradesText(s: GameState, p: PlayerId, trades: BankTrade[]): string {
  return trades.map((t) => `${t.count * tradeRate(s, p, t.give)} ${NAME[t.give]} → ${t.count} ${NAME[t.get]}`).join(', ')
}

/** Whether two drafts hold the same cards on each side. */
export function sameDraft(a: { give: Counts; want: Counts }, b: { give: Counts; want: Counts }): boolean {
  return RESOURCE_ORDER.every((r) => (a.give[r] ?? 0) === (b.give[r] ?? 0) && (a.want[r] ?? 0) === (b.want[r] ?? 0))
}
