// The game log (ROADMAP G9.1, docs/G9_PLAN.md): every public event of the game as a short line, kept
// for the whole game, so a player who looked away can see what happened. `logLines` is a pure function
// of the events (unit-tested); `gameLogFor(store)` keeps one log per game store, appends on every
// dispatch and rebuilds the history after a silent load (a resumed save) by re-running the engine over
// the saved actions. Hidden information never reaches a line: the device may be shared (hot-seat), so
// a stolen card's resource and a bought card's type are never read here, whoever the viewer is.

import { useSyncExternalStore } from 'react'
import { RESOURCE_ORDER, apply, createGame, type GameEvent, type PlayerId, type Resource, type ResourceCounts, type Terrain, type Tile, type TileId } from '../game'
import type { GameStore } from '../store/gameStore'
import { SEATS } from './gameView'

export type LogKind = 'start' | 'turn' | 'roll' | 'gain' | 'none' | 'build' | 'robber' | 'steal' | 'discard' | 'card' | 'trade' | 'award' | 'win' | 'gap'

export interface LogLine {
  kind: LogKind
  /** the player the line is about (its colour dot), if any */
  player?: PlayerId
  /** the full sentence: shown as is, and the accessible text of lines drawn with icons */
  text: string
  /** resource changes drawn as icons (production, starting resources, Year of Plenty), after `lead` */
  gains?: Partial<ResourceCounts>
  /** the words before the icons, when `gains` is set ("Red got") */
  lead?: string
  dice?: [number, number]
  turn?: number
}

export interface LogEntry extends LogLine { id: number }

const RES: Record<Resource, string> = { lumber: 'wood', brick: 'brick', wool: 'wool', grain: 'grain', ore: 'ore' }
const TERRAIN: Record<Terrain, string> = { forest: 'forest', pasture: 'pasture', fields: 'fields', hills: 'hills', mountains: 'mountains', desert: 'desert' }
const CARD: Record<string, string> = { knight: 'a Knight', roadBuilding: 'Road Building', yearOfPlenty: 'Year of Plenty', monopoly: 'Monopoly' }
const AWARD = { longestRoad: 'Longest Road', largestArmy: 'Largest Army' }
const name = (p: PlayerId) => SEATS[p].name
const total = (c: Partial<Record<Resource, number>>) => RESOURCE_ORDER.reduce((a, r) => a + (c[r] ?? 0), 0)
const counts = (c: Partial<Record<Resource, number>>) =>
  RESOURCE_ORDER.filter((r) => c[r]).map((r) => `${c[r]} ${RES[r]}`).join(', ')
const plus = (c: Partial<Record<Resource, number>>) =>
  RESOURCE_ORDER.filter((r) => c[r]).map((r) => `+${c[r]} ${RES[r]}`).join(' ')

/** "fields 8": a tile by its terrain and number token, the way players name it at the table. */
export function tileName(tiles: Record<TileId, Tile> | undefined, id: TileId) {
  const t = tiles?.[id]
  if (!t) return 'another tile'
  return t.token ? `${TERRAIN[t.terrain]} ${t.token}` : TERRAIN[t.terrain]
}

/** Log lines for one dispatch's events, in order. `tiles` names the robber's tile. */
export function logLines(events: readonly GameEvent[], tiles?: Record<TileId, Tile>): LogLine[] {
  const out: LogLine[] = []
  for (const e of events) {
    switch (e.type) {
      case 'GAME_STARTED':
        out.push({ kind: 'start', text: `New game: ${e.order.map(name).join(', ')}` })
        break
      case 'SETUP_PLACED':
        out.push({ kind: 'build', player: e.by, text: `${name(e.by)} placed a ${e.what}` })
        break
      case 'SETUP_RESOURCES':
        if (total(e.gains)) out.push({ kind: 'gain', player: e.player, gains: e.gains, lead: `${name(e.player)} starts with`, text: `${name(e.player)} starts with ${plus(e.gains)}` })
        break
      case 'TURN_STARTED':
        out.push({ kind: 'turn', player: e.player, turn: e.turn, text: `Turn ${e.turn}: ${name(e.player)}` })
        break
      case 'DICE_ROLLED': {
        const t = e.dice[0] + e.dice[1]
        out.push({ kind: 'roll', player: e.by, dice: e.dice, text: `${name(e.by)} rolled ${t}${t === 7 ? ': the robber moves' : ''}` })
        break
      }
      case 'RESOURCES_PRODUCED': {
        const got = (Object.entries(e.gains) as [PlayerId, Partial<ResourceCounts>][]).filter(([, g]) => total(g))
        if (!got.length) out.push({ kind: 'none', text: 'No one produced anything' })
        for (const [p, g] of got) out.push({ kind: 'gain', player: p, gains: g, lead: `${name(p)} got`, text: `${name(p)} got ${plus(g)}` })
        if (e.shortfall.length) out.push({ kind: 'none', text: `The bank is short of ${e.shortfall.map((r) => RES[r]).join(', ')}: nobody gets it` })
        break
      }
      case 'DISCARDED':
        out.push({ kind: 'discard', player: e.player, text: `${name(e.player)} discarded ${total(e.cards)}: ${counts(e.cards)}` })
        break
      case 'ROBBER_MOVED':
        out.push({ kind: 'robber', player: e.by, text: `${name(e.by)} moved the robber to ${tileName(tiles, e.to)}` })
        break
      case 'CARD_STOLEN': // never which resource: the device may be shared
        out.push({ kind: 'steal', player: e.to, text: `${name(e.to)} stole a card from ${name(e.from)}` })
        break
      case 'BUILT':
        out.push({
          kind: 'build', player: e.by,
          text: e.what === 'city' ? `${name(e.by)} upgraded a settlement to a city` : `${name(e.by)} built a ${e.what}${e.free ? ' (free)' : ''}`,
        })
        break
      case 'DEV_BOUGHT': // never which card
        out.push({ kind: 'card', player: e.by, text: `${name(e.by)} bought a development card` })
        break
      case 'DEV_PLAYED':
        if (e.card !== 'yearOfPlenty' && e.card !== 'monopoly') out.push({ kind: 'card', player: e.by, text: `${name(e.by)} played ${CARD[e.card]}` })
        break
      case 'YEAR_OF_PLENTY_TAKEN':
        out.push({ kind: 'card', player: e.by, gains: e.cards, lead: `${name(e.by)} played Year of Plenty:`, text: `${name(e.by)} played Year of Plenty: ${plus(e.cards)}` })
        break
      case 'MONOPOLY_RESOLVED': {
        const n = Object.values(e.taken).reduce((a, b) => a + (b ?? 0), 0)
        out.push({ kind: 'card', player: e.by, text: `${name(e.by)} played Monopoly on ${RES[e.resource]}: took ${n}` })
        break
      }
      case 'BANK_TRADED':
        out.push({ kind: 'trade', player: e.by, text: `${name(e.by)} traded ${counts(e.gave)} for ${counts(e.got)} with the bank` })
        break
      case 'TRADE_COMPLETED':
        out.push({ kind: 'trade', player: e.from, text: `${name(e.from)} gave ${counts(e.gave)} to ${name(e.with)} for ${counts(e.got)}` })
        break
      case 'AWARD_CHANGED':
        if (e.to) out.push({ kind: 'award', player: e.to, text: `${name(e.to)} takes ${AWARD[e.award]}${e.from ? ` from ${name(e.from)}` : ''} (+2 points)` })
        else if (e.from) out.push({ kind: 'award', player: e.from, text: `${name(e.from)} loses ${AWARD[e.award]}` })
        break
      case 'GAME_WON':
        out.push({ kind: 'win', player: e.by, text: `${name(e.by)} wins with ${e.totals[e.by]} points` })
        break
      // proposals, answers, cancellations, discard requests and turn ends: the lines above already
      // say what changed hands, and the HUD shows open offers and pending discards
    }
  }
  return out
}

/** Events of a whole saved game, by re-running the engine over its actions (the store's load is silent). */
export function historyEvents(file: ReturnType<GameStore['replayFile']>): { events: GameEvent[]; tiles?: Record<TileId, Tile> } {
  const c = createGame(file.settings)
  if (!c.ok) return { events: [] }
  let s = c.state
  const events: GameEvent[] = [...c.events]
  for (const { player, action } of file.actions) {
    const r = apply(s, player, action)
    if (!r.ok) break
    s = r.state
    events.push(...r.events)
  }
  return { events, tiles: s.board.tiles }
}

// ---------------------------------------------------------------- one log per store

export const LOG_MAX = 200

interface Feed { entries: LogEntry[]; listeners: Set<() => void> }
const feeds = new WeakMap<GameStore, Feed>()
let nextId = 1

const stamp = (lines: LogLine[]): LogEntry[] => lines.map((l) => ({ ...l, id: nextId++ }))

function feedFor(store: GameStore): Feed {
  let f = feeds.get(store)
  if (f) return f
  const feed: Feed = { entries: [], listeners: new Set() }
  feeds.set(store, feed)
  const online = 'online' in store
  let gen = store.generation()
  const set = (entries: LogEntry[]) => {
    feed.entries = entries.slice(-LOG_MAX)
    for (const l of [...feed.listeners]) l()
  }
  // a local store has the whole action log: rebuild from it. The online client only has what it has
  // seen since it joined, and a snap to a new snapshot (a reconnect) says that some lines are missing.
  const rebuild = () => {
    if (!online) {
      const h = historyEvents(store.replayFile())
      set(stamp(logLines(h.events, h.tiles)))
    } else if (feed.entries.length) {
      set([...feed.entries, ...stamp([{ kind: 'gap', text: 'Some events were missed while reconnecting' }])])
    }
  }
  rebuild()
  store.onEvents((events, state) => {
    if (store.generation() !== gen) { gen = store.generation(); rebuild(); return } // a new game: its events are in the rebuild
    set([...feed.entries, ...stamp(logLines(events, state.board.tiles))])
  })
  store.subscribe(() => {
    if (store.generation() !== gen) { gen = store.generation(); rebuild() } // a silent load
  })
  return feed
}

export const gameLogFor = (store: GameStore): readonly LogEntry[] => feedFor(store).entries

export function useGameLog(store: GameStore): readonly LogEntry[] {
  const f = feedFor(store)
  return useSyncExternalStore(
    (l) => { f.listeners.add(l); return () => { f.listeners.delete(l) } },
    () => f.entries,
  )
}
