// Short notices for game events and rejected actions (ROADMAP G4.5a; UI in Notices.tsx). `eventNotices` is a pure
// function of the events (unit-tested); the notice queue below is a tiny external store with its
// own timers, so React only re-renders when a notice appears or expires (never per frame).
// Hidden information stays hidden: a stolen card's resource and bought card types are not shown.

import { useSyncExternalStore } from 'react'
import { RESOURCE_ORDER, type GameEvent, type PlayerId, type Resource } from '../game'
import { SEATS } from './gameView'
import { L, count } from './locale'
import { awardName, cardName, resGains, resList, resName } from './words'

export type NoticeKind = 'info' | 'good' | 'warn' | 'error'
export interface Notice { id: number; kind: NoticeKind; text: string; color?: string }

const name = (p: PlayerId) => SEATS[p].name
const counts = resList
const gains = resGains
const has = (c: Partial<Record<Resource, number>>) => RESOURCE_ORDER.some((r) => c[r])
const card = (c: Parameters<typeof cardName>[0]) => (c === 'knight' ? L('a Knight', cardName(c)) : cardName(c))

/** Notices worth showing for one dispatch's events (in order), in the current language. Routine events give none. */
export function eventNotices(events: readonly GameEvent[]): Omit<Notice, 'id'>[] {
  const out: Omit<Notice, 'id'>[] = []
  for (const e of events) {
    switch (e.type) {
      case 'DICE_ROLLED': {
        const t = e.dice[0] + e.dice[1]
        if (t === 7) out.push({ kind: 'warn', text: L(`${name(e.by)} rolled a seven!`, `${name(e.by)}: выпала семёрка!`), color: SEATS[e.by].color })
        break
      }
      case 'RESOURCES_PRODUCED': {
        const parts = (Object.entries(e.gains) as [PlayerId, Partial<Record<Resource, number>>][])
          .filter(([, g]) => has(g)).map(([p, g]) => `${name(p)} ${gains(g)}`)
        out.push(parts.length ? { kind: 'info', text: parts.join(' · ') } : { kind: 'info', text: L('No one produced anything.', 'Никто ничего не получил.') })
        if (e.shortfall.length) {
          const list = e.shortfall.map(resName).join(', ')
          out.push({ kind: 'warn', text: L(`The bank is short of ${list}: nobody gets it.`, `В банке не хватает: ${list}, никто не получает.`) })
        }
        break
      }
      case 'CARD_STOLEN':
        out.push({ kind: 'warn', text: L(`${name(e.to)} stole a card from ${name(e.from)}.`, `${name(e.to)} крадёт карту у игрока ${name(e.from)}.`), color: SEATS[e.to].color }) // never which one
        break
      case 'AWARD_CHANGED':
        if (e.to) out.push({ kind: 'good', text: L(`${name(e.to)} takes ${awardName(e.award)}${e.from ? ` from ${name(e.from)}` : ''}!`, `${name(e.to)} получает «${awardName(e.award)}»${e.from ? ` (раньше — ${name(e.from)})` : ''}!`), color: SEATS[e.to].color })
        else if (e.from) out.push({ kind: 'warn', text: L(`${name(e.from)} loses ${awardName(e.award)}.`, `${name(e.from)} теряет «${awardName(e.award)}».`), color: SEATS[e.from].color })
        break
      case 'DEV_PLAYED':
        if (e.card !== 'yearOfPlenty' && e.card !== 'monopoly') out.push({ kind: 'info', text: L(`${name(e.by)} played ${card(e.card)}.`, `${name(e.by)} играет карту «${cardName(e.card)}».`), color: SEATS[e.by].color })
        break
      case 'YEAR_OF_PLENTY_TAKEN':
        out.push({ kind: 'info', text: L(`${name(e.by)} played Year of Plenty: ${gains(e.cards)}.`, `${name(e.by)} играет «${cardName('yearOfPlenty')}»: ${gains(e.cards)}.`), color: SEATS[e.by].color })
        break
      case 'MONOPOLY_RESOLVED': {
        const n = Object.values(e.taken).reduce((a, b) => a + (b ?? 0), 0)
        out.push({ kind: 'info', text: L(`${name(e.by)} played Monopoly on ${resName(e.resource)}: took ${n}.`, `${name(e.by)} играет «${cardName('monopoly')}» на ${resName(e.resource)}: забирает ${n}.`), color: SEATS[e.by].color })
        break
      }
      case 'DEV_BOUGHT':
        out.push({ kind: 'info', text: L(`${name(e.by)} bought a development card.`, `${name(e.by)} покупает карту развития.`), color: SEATS[e.by].color })
        break
      case 'BANK_TRADED':
        out.push({ kind: 'info', text: L(`${name(e.by)} traded ${counts(e.gave)} for ${counts(e.got)} with the bank.`, `${name(e.by)} меняет с банком ${counts(e.gave)} на ${counts(e.got)}.`), color: SEATS[e.by].color })
        break
      case 'TRADE_COMPLETED':
        out.push({ kind: 'good', text: L(`${name(e.from)} traded ${counts(e.gave)} to ${name(e.with)} for ${counts(e.got)}.`, `${name(e.from)} отдаёт игроку ${name(e.with)} ${counts(e.gave)} за ${counts(e.got)}.`), color: SEATS[e.from].color })
        break
      case 'GAME_WON':
        out.push({ kind: 'good', text: L(`${name(e.by)} wins with ${e.totals[e.by]} points!`, `${name(e.by)} побеждает: ${count(e.totals[e.by], '', '', 'очко', 'очка', 'очков')}!`), color: SEATS[e.by].color })
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
  if (has(made.gains[viewer] ?? {})) return null
  // nobody produced: "No one produced anything." already says it
  if (!Object.values(made.gains).some((g) => g && has(g))) return null
  return { kind: 'info', text: L(`${name(viewer)}: no resources this roll`, `${name(viewer)}: в этот бросок ничего`), color: SEATS[viewer].color }
}

/**
 * G7.4: the viewer's own purchase, with the card they got and when it can be played. Only for the
 * buyer: the engine's view already hides the card from everyone else (`card: null`), and the
 * caller passes no viewer behind the pass screen or for a spectator.
 */
export function boughtNotice(events: readonly GameEvent[], viewer: PlayerId | null): Omit<Notice, 'id'> | null {
  const e = events.find((x) => x.type === 'DEV_BOUGHT')
  if (!viewer || !e || e.by !== viewer || !e.card) return null
  const vp = e.card === 'victoryPoint'
  return {
    kind: 'good', color: SEATS[viewer].color,
    text: L(
      `${name(viewer)}, you got ${vp ? 'a Victory Point' : card(e.card)}: ${vp ? '+1 point, hidden from the others until the end' : 'playable from your next turn'}.`,
      `${name(viewer)}, вам досталась карта «${cardName(e.card)}»: ${vp ? '+1 очко, скрыто от других до конца игры' : 'можно сыграть со следующего хода'}.`,
    ),
  }
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
