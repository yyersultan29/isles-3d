// Short notices for game events and rejected actions (ROADMAP G4.5a; UI in Notices.tsx). `eventNotices` is a pure
// function of the events (unit-tested); the notice queue below is a tiny external store with its
// own timers, so React only re-renders when a notice appears or expires (never per frame).
// Hidden information stays hidden: a stolen card's resource and bought card types are not shown.

import { useSyncExternalStore } from 'react'
import { RESOURCE_ORDER, type GameEvent, type PlayerId, type Resource } from '../game'
import { SEATS } from './gameView'

export type NoticeKind = 'info' | 'good' | 'warn' | 'error'
export interface Notice { id: number; kind: NoticeKind; text: string; color?: string }

const RES: Record<Resource, string> = { lumber: 'wood', brick: 'brick', wool: 'wool', grain: 'grain', ore: 'ore' }
const name = (p: PlayerId) => SEATS[p].name
const counts = (c: Partial<Record<Resource, number>>) =>
  RESOURCE_ORDER.filter((r) => c[r]).map((r) => `${c[r]} ${RES[r]}`).join(', ')
const gains = (c: Partial<Record<Resource, number>>) =>
  RESOURCE_ORDER.filter((r) => c[r]).map((r) => `+${c[r]} ${RES[r]}`).join(' ')
const CARD: Record<string, string> = { knight: 'a Knight', roadBuilding: 'Road Building', yearOfPlenty: 'Year of Plenty', monopoly: 'Monopoly' }
const AWARD = { longestRoad: 'Longest Road', largestArmy: 'Largest Army' }

/** Notices worth showing for one dispatch's events (in order). Routine events give none. */
export function eventNotices(events: readonly GameEvent[]): Omit<Notice, 'id'>[] {
  const out: Omit<Notice, 'id'>[] = []
  for (const e of events) {
    switch (e.type) {
      case 'DICE_ROLLED': {
        const t = e.dice[0] + e.dice[1]
        if (t === 7) out.push({ kind: 'warn', text: `${name(e.by)} rolled a seven!`, color: SEATS[e.by].color })
        break
      }
      case 'RESOURCES_PRODUCED': {
        const parts = (Object.entries(e.gains) as [PlayerId, Partial<Record<Resource, number>>][])
          .filter(([, g]) => gains(g)).map(([p, g]) => `${name(p)} ${gains(g)}`)
        out.push(parts.length ? { kind: 'info', text: parts.join(' · ') } : { kind: 'info', text: 'No one produced anything.' })
        if (e.shortfall.length) out.push({ kind: 'warn', text: `The bank is short of ${e.shortfall.map((r) => RES[r]).join(', ')}: nobody gets it.` })
        break
      }
      case 'CARD_STOLEN':
        out.push({ kind: 'warn', text: `${name(e.to)} stole a card from ${name(e.from)}.`, color: SEATS[e.to].color }) // never which one
        break
      case 'AWARD_CHANGED':
        if (e.to) out.push({ kind: 'good', text: `${name(e.to)} takes ${AWARD[e.award]}${e.from ? ` from ${name(e.from)}` : ''}!`, color: SEATS[e.to].color })
        else if (e.from) out.push({ kind: 'warn', text: `${name(e.from)} loses ${AWARD[e.award]}.`, color: SEATS[e.from].color })
        break
      case 'DEV_PLAYED':
        if (e.card !== 'yearOfPlenty' && e.card !== 'monopoly') out.push({ kind: 'info', text: `${name(e.by)} played ${CARD[e.card]}.`, color: SEATS[e.by].color })
        break
      case 'YEAR_OF_PLENTY_TAKEN':
        out.push({ kind: 'info', text: `${name(e.by)} played Year of Plenty: ${gains(e.cards)}.`, color: SEATS[e.by].color })
        break
      case 'MONOPOLY_RESOLVED': {
        const n = Object.values(e.taken).reduce((a, b) => a + (b ?? 0), 0)
        out.push({ kind: 'info', text: `${name(e.by)} played Monopoly on ${RES[e.resource]}: took ${n}.`, color: SEATS[e.by].color })
        break
      }
      case 'DEV_BOUGHT':
        out.push({ kind: 'info', text: `${name(e.by)} bought a development card.`, color: SEATS[e.by].color })
        break
      case 'BANK_TRADED':
        out.push({ kind: 'info', text: `${name(e.by)} traded ${counts(e.gave)} for ${counts(e.got)} with the bank.`, color: SEATS[e.by].color })
        break
      case 'TRADE_COMPLETED':
        out.push({ kind: 'good', text: `${name(e.from)} traded ${counts(e.gave)} to ${name(e.with)} for ${counts(e.got)}.`, color: SEATS[e.from].color })
        break
      case 'GAME_WON':
        out.push({ kind: 'good', text: `${name(e.by)} wins with ${e.totals[e.by]} points!`, color: SEATS[e.by].color })
        break
    }
  }
  return out
}

/**
 * G7.2: when the viewer rolls (not a seven) and gets nothing, say so briefly. `viewer` is the seat
 * whose hand is shown (null for a spectator or behind the pass screen). Production is public, so
 * this tells nobody anything new.
 */
export function ownRollNotice(events: readonly GameEvent[], viewer: PlayerId | null): Omit<Notice, 'id'> | null {
  if (!viewer) return null
  const roll = events.find((e) => e.type === 'DICE_ROLLED')
  const made = events.find((e) => e.type === 'RESOURCES_PRODUCED')
  if (!roll || roll.by !== viewer || !made) return null
  if (gains(made.gains[viewer] ?? {})) return null
  // nobody produced: "No one produced anything." already says it
  if (!Object.values(made.gains).some((g) => g && gains(g))) return null
  return { kind: 'info', text: `${name(viewer)}: no resources this roll`, color: SEATS[viewer].color }
}

// ---------------------------------------------------------------- queue

const MAX = 3
const LIFE: Record<NoticeKind, number> = { info: 4000, good: 5000, warn: 5000, error: 5000 }
let list: Notice[] = []
let nextId = 1
const listeners = new Set<() => void>()
const notify = () => { for (const l of [...listeners]) l() }

export function pushNotice(n: Omit<Notice, 'id'>) {
  const notice = { ...n, id: nextId++ }
  list = [...list, notice].slice(-MAX)
  notify()
  setTimeout(() => dismissNotice(notice.id), LIFE[n.kind])
}

export function dismissNotice(id: number) {
  if (!list.some((n) => n.id === id)) return
  list = list.filter((n) => n.id !== id)
  notify()
}

export function clearNotices() { list = []; notify() }

export function useNotices(): Notice[] {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l) } },
    () => list,
  )
}
