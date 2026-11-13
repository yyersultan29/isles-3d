// UI-only state that isn't part of the game (ROADMAP G4.3): which placement the player is choosing
// during their `actions` phase. Set by the build menu (G4.4); `?place=road|settlement|city` for dev checks.

import { useSyncExternalStore } from 'react'
import type { PlayerId, Resource } from '../game'

export type PlacementMode = 'road' | 'settlement' | 'city' | null

const fromQuery = (): PlacementMode => {
  if (typeof location === 'undefined') return null
  const v = new URLSearchParams(location.search).get('place')
  return v === 'road' || v === 'settlement' || v === 'city' ? v : null
}

let mode: PlacementMode = fromQuery()
const listeners = new Set<() => void>()

export function setPlacementMode(m: PlacementMode) {
  if (m === mode) return
  mode = m
  if (m) setPanel(null)
  for (const l of [...listeners]) l()
}

export const getPlacementMode = () => mode

export function usePlacementMode(): PlacementMode {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l) } },
    () => mode,
  )
}

// ---------- G4.4d/e: which HUD panel is open (trade or development cards; one at a time) ----------

export type Panel = 'trade' | 'dev' | null
let panel: Panel = null
const panelListeners = new Set<() => void>()

export function setPanel(v: Panel) {
  if (v === panel) return
  panel = v
  if (v) setPlacementMode(null) // a board choice and a panel never compete
  for (const l of [...panelListeners]) l()
}

export const getPanel = () => panel

export function usePanel(): Panel {
  return useSyncExternalStore(
    (l) => { panelListeners.add(l); return () => { panelListeners.delete(l) } },
    () => panel,
  )
}

export const setTradeOpen = (v: boolean) => setPanel(v ? 'trade' : panel === 'trade' ? null : panel)
export const getTradeOpen = () => panel === 'trade'
export const useTradeOpen = () => usePanel() === 'trade'
export const setDevOpen = (v: boolean) => setPanel(v ? 'dev' : panel === 'dev' ? null : panel)
export const useDevOpen = () => usePanel() === 'dev'

// ---------- G4.8a: hot-seat — whose private view has been revealed on this device ----------

let seen: PlayerId | null = null
const seenListeners = new Set<() => void>()

/** Mark `p` as the player now looking at the screen (after the pass-the-device screen). */
export function setSeen(p: PlayerId | null) {
  if (p === seen) return
  seen = p
  for (const l of [...seenListeners]) l()
}
export const getSeen = () => seen
export function useSeen(): PlayerId | null {
  return useSyncExternalStore(
    (l) => { seenListeners.add(l); return () => { seenListeners.delete(l) } },
    () => seen,
  )
}

// ---------- G6.2: the trade draft, filled from the hand; survives switching panels ----------

type Cards = Partial<Record<Resource, number>>
export interface TradeDraft { give: Cards; want: Cards }
export type TradeTab = 'bank' | 'players'
const EMPTY: TradeDraft = { give: {}, want: {} }

/**
 * `d` with `n` more (or fewer) of `r` on `side`, never below 0 nor above `max`. A resource sits on
 * one side only: adding it to one side takes it off the other. Returns `d` itself when nothing changes.
 */
export function draftAdd(d: TradeDraft, side: 'give' | 'want', r: Resource, n: number, max = Infinity): TradeDraft {
  const other = side === 'give' ? 'want' : 'give'
  const cur = d[side][r] ?? 0
  const next = Math.max(0, Math.min(max, cur + n))
  const clearOther = n > 0 && (d[other][r] ?? 0) > 0
  if (next === cur && !clearOther) return d
  const set = (c: Cards, v: number) => { const x = { ...c }; if (v) x[r] = v; else delete x[r]; return x }
  return { ...d, [side]: set(d[side], next), [other]: clearOther ? set(d[other], 0) : d[other] } as TradeDraft
}

/** Whether `hand` still holds every card the draft gives. */
export const draftCovered = (d: TradeDraft, hand: Record<Resource, number>) =>
  (Object.keys(d.give) as Resource[]).every((r) => (d.give[r] ?? 0) <= hand[r])

export const draftEmpty = (d: TradeDraft) => !Object.keys(d.give).length && !Object.keys(d.want).length

let draft: TradeDraft = EMPTY
let tab: TradeTab = 'bank'
const draftListeners = new Set<() => void>()
const emitDraft = () => { for (const l of [...draftListeners]) l() }

export function setDraft(d: TradeDraft) { if (d !== draft) { draft = d; emitDraft() } }
export const clearDraft = () => setDraft(EMPTY)
export const getDraft = () => draft
export const changeDraft = (side: 'give' | 'want', r: Resource, n: number, max?: number) => setDraft(draftAdd(draft, side, r, n, max))
export function setTradeTab(t: TradeTab) { if (t !== tab) { tab = t; emitDraft() } }
export const getTradeTab = () => tab

const subscribeDraft = (l: () => void) => { draftListeners.add(l); return () => { draftListeners.delete(l) } }
export const useTradeDraft = (): TradeDraft => useSyncExternalStore(subscribeDraft, () => draft)
export const useTradeTab = (): TradeTab => useSyncExternalStore(subscribeDraft, () => tab)
