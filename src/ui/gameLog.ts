// The game log (ROADMAP G9.1, docs/G9_PLAN.md): every public event of the game as a short line, kept
// for the whole game, so a player who looked away can see what happened. `logLines` is a pure function
// of the events (unit-tested); `gameLogFor(store)` keeps one log per game store, appends on every
// dispatch and rebuilds the history after a silent load (a resumed save) by re-running the engine over
// the saved actions. Hidden information never reaches a line: the device may be shared (hot-seat), so
// a stolen card's resource and a bought card's type are never read here, whoever the viewer is.

import { useSyncExternalStore } from 'react'
import { RESOURCE_ORDER, apply, createGame, type GameEvent, type PlayerId, type Resource, type ResourceCounts, type Tile, type TileId } from '../game'
import type { GameStore } from '../store/gameStore'
import { SEATS } from './gameView'
import { L, count, onLocale } from './locale'
import { awardName, cardName, resGains, resList, resName, terrainName } from './words'

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

const name = (p: PlayerId) => SEATS[p].name
const total = (c: Partial<Record<Resource, number>>) => RESOURCE_ORDER.reduce((a, r) => a + (c[r] ?? 0), 0)

/** "fields 8": a tile by its terrain and number token, the way players name it at the table. */
export function tileName(tiles: Record<TileId, Tile> | undefined, id: TileId) {
  const t = tiles?.[id]
  if (!t) return L('another tile', 'другой гекс')
  return t.token ? `${terrainName(t.terrain)} ${t.token}` : terrainName(t.terrain)
}

const PIECE_RU = { road: 'дорогу', settlement: 'поселение', city: 'город' } as const

/** Log lines for one dispatch's events, in order, in the current language. `tiles` names the robber's tile. */
export function logLines(events: readonly GameEvent[], tiles?: Record<TileId, Tile>): LogLine[] {
  const out: LogLine[] = []
  for (const e of events) {
    switch (e.type) {
      case 'GAME_STARTED':
        out.push({ kind: 'start', text: `${L('New game', 'Новая игра')}: ${e.order.map(name).join(', ')}` })
        break
      case 'SETUP_PLACED':
        out.push({ kind: 'build', player: e.by, text: L(`${name(e.by)} placed a ${e.what}`, `${name(e.by)} ставит ${PIECE_RU[e.what]}`) })
        break
      case 'SETUP_RESOURCES':
        if (total(e.gains)) {
          const lead = L(`${name(e.player)} starts with`, `${name(e.player)} получает на старте`)
          out.push({ kind: 'gain', player: e.player, gains: e.gains, lead, text: `${lead} ${resGains(e.gains)}` })
        }
        break
      case 'TURN_STARTED':
        out.push({ kind: 'turn', player: e.player, turn: e.turn, text: `${L('Turn', 'Ход')} ${e.turn}: ${name(e.player)}` })
        break
      case 'DICE_ROLLED': {
        const t = e.dice[0] + e.dice[1]
        out.push({ kind: 'roll', player: e.by, dice: e.dice, text: L(`${name(e.by)} rolled ${t}${t === 7 ? ': the robber moves' : ''}`, `${name(e.by)}: выпало ${t}${t === 7 ? ', ходит разбойник' : ''}`) })
        break
      }
      case 'RESOURCES_PRODUCED': {
        const got = (Object.entries(e.gains) as [PlayerId, Partial<ResourceCounts>][]).filter(([, g]) => total(g))
        if (!got.length) out.push({ kind: 'none', text: L('No one produced anything', 'Никто ничего не получил') })
        for (const [p, g] of got) {
          const lead = L(`${name(p)} got`, `${name(p)} получает`)
          out.push({ kind: 'gain', player: p, gains: g, lead, text: `${lead} ${resGains(g)}` })
        }
        if (e.shortfall.length) {
          const list = e.shortfall.map(resName).join(', ')
          out.push({ kind: 'none', text: L(`The bank is short of ${list}: nobody gets it`, `В банке не хватает: ${list}, никто не получает`) })
        }
        break
      }
      case 'DISCARDED':
        out.push({ kind: 'discard', player: e.player, text: L(`${name(e.player)} discarded ${total(e.cards)}: ${resList(e.cards)}`, `${name(e.player)} сбрасывает ${total(e.cards)}: ${resList(e.cards)}`) })
        break
      case 'ROBBER_MOVED':
        out.push({ kind: 'robber', player: e.by, text: L(`${name(e.by)} moved the robber to ${tileName(tiles, e.to)}`, `${name(e.by)} ставит разбойника: ${tileName(tiles, e.to)}`) })
        break
      case 'CARD_STOLEN': // never which resource: the device may be shared
        out.push({ kind: 'steal', player: e.to, text: L(`${name(e.to)} stole a card from ${name(e.from)}`, `${name(e.to)} крадёт карту у ${name(e.from)}`) })
        break
      case 'BUILT':
        out.push({
          kind: 'build', player: e.by,
          text: e.what === 'city'
            ? L(`${name(e.by)} upgraded a settlement to a city`, `${name(e.by)} улучшает поселение до города`)
            : L(`${name(e.by)} built a ${e.what}${e.free ? ' (free)' : ''}`, `${name(e.by)} строит ${PIECE_RU[e.what]}${e.free ? ' (бесплатно)' : ''}`),
        })
        break
      case 'DEV_BOUGHT': // never which card
        out.push({ kind: 'card', player: e.by, text: L(`${name(e.by)} bought a development card`, `${name(e.by)} покупает карту развития`) })
        break
      case 'DEV_PLAYED':
        if (e.card !== 'yearOfPlenty' && e.card !== 'monopoly') out.push({ kind: 'card', player: e.by, text: L(`${name(e.by)} played ${e.card === 'knight' ? 'a Knight' : cardName(e.card)}`, `${name(e.by)} играет карту «${cardName(e.card)}»`) })
        break
      case 'YEAR_OF_PLENTY_TAKEN': {
        const lead = L(`${name(e.by)} played Year of Plenty:`, `${name(e.by)} играет «${cardName('yearOfPlenty')}»:`)
        out.push({ kind: 'card', player: e.by, gains: e.cards, lead, text: `${lead} ${resGains(e.cards)}` })
        break
      }
      case 'MONOPOLY_RESOLVED': {
        const n = Object.values(e.taken).reduce((a, b) => a + (b ?? 0), 0)
        out.push({ kind: 'card', player: e.by, text: L(`${name(e.by)} played Monopoly on ${resName(e.resource)}: took ${n}`, `${name(e.by)} играет «${cardName('monopoly')}» на ${resName(e.resource)}: забирает ${n}`) })
        break
      }
      case 'BANK_TRADED':
        out.push({ kind: 'trade', player: e.by, text: L(`${name(e.by)} traded ${resList(e.gave)} for ${resList(e.got)} with the bank`, `${name(e.by)} меняет с банком ${resList(e.gave)} на ${resList(e.got)}`) })
        break
      case 'TRADE_COMPLETED':
        out.push({ kind: 'trade', player: e.from, text: L(`${name(e.from)} gave ${resList(e.gave)} to ${name(e.with)} for ${resList(e.got)}`, `${name(e.from)} отдаёт ${name(e.with)} ${resList(e.gave)} за ${resList(e.got)}`) })
        break
      case 'AWARD_CHANGED':
        if (e.to) out.push({ kind: 'award', player: e.to, text: L(`${name(e.to)} takes ${awardName(e.award)}${e.from ? ` from ${name(e.from)}` : ''} (+2 points)`, `${name(e.to)} получает «${awardName(e.award)}»${e.from ? ` (было у ${name(e.from)})` : ''}: +2 очка`) })
        else if (e.from) out.push({ kind: 'award', player: e.from, text: L(`${name(e.from)} loses ${awardName(e.award)}`, `${name(e.from)} теряет «${awardName(e.award)}»`) })
        break
      case 'GAME_WON':
        out.push({ kind: 'win', player: e.by, text: L(`${name(e.by)} wins with ${e.totals[e.by]} points`, `${name(e.by)} побеждает: ${count(e.totals[e.by], '', '', 'очко', 'очка', 'очков')}`) })
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

type Batch = { events: readonly GameEvent[]; tiles?: Record<TileId, Tile> } | 'gap'
interface Feed { entries: LogEntry[]; batches: Batch[]; listeners: Set<() => void> }
const feeds = new WeakMap<GameStore, Feed>()
let nextId = 1

const stamp = (lines: LogLine[]): LogEntry[] => lines.map((l) => ({ ...l, id: nextId++ }))
const linesOf = (b: Batch): LogLine[] => (b === 'gap' ? [{ kind: 'gap', text: L('Some events were missed while reconnecting', 'Часть событий пропущена при переподключении') }] : logLines(b.events, b.tiles))

function feedFor(store: GameStore): Feed {
  let f = feeds.get(store)
  if (f) return f
  const feed: Feed = { entries: [], batches: [], listeners: new Set() }
  feeds.set(store, feed)
  const online = 'online' in store
  let gen = store.generation()
  const notify = () => { for (const l of [...feed.listeners]) l() }
  const append = (b: Batch) => {
    feed.batches.push(b)
    feed.entries = [...feed.entries, ...stamp(linesOf(b))].slice(-LOG_MAX)
    notify()
  }
  // G9.4: every line again in the new language, from the kept events
  const rewrite = () => { feed.entries = stamp(feed.batches.flatMap(linesOf)).slice(-LOG_MAX); notify() }
  // a local store has the whole action log: rebuild from it. The online client only has what it has
  // seen since it joined, and a snap to a new snapshot (a reconnect) says that some lines are missing.
  const rebuild = () => {
    if (!online) {
      const h = historyEvents(store.replayFile())
      feed.batches = [{ events: h.events, tiles: h.tiles }]
      rewrite()
    } else if (feed.batches.length) append('gap')
  }
  rebuild()
  store.onEvents((events, state) => {
    if (store.generation() !== gen) { gen = store.generation(); rebuild(); return } // a new game: its events are in the rebuild
    append({ events, tiles: state.board.tiles })
  })
  store.subscribe(() => {
    if (store.generation() !== gen) { gen = store.generation(); rebuild() } // a silent load
  })
  onLocale(rewrite)
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
