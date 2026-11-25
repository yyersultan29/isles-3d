// LogPanel: the game log panel (ROADMAP G9.1). Desktop: a panel in the bottom-left corner, where the event
// notices used to appear, showing the last lines and expanding to the whole game. Compact: a button in
// the top bar opening the same list as a sheet. Lines come from gameLog.ts; the panel is `role="log"`
// without live announcements, since the existing notices and announcer already speak each event.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { RESOURCE_ORDER, type Resource } from '../game'
import { useGameStore } from '../store/GameProvider'
import { useGameLog, type LogEntry } from './gameLog'
import { SEATS } from './gameView'
import { Brick, Logs, Ore, SheepIcon, WheatIcon } from './icons'
import { focusRing, panel } from './tokens'
import { L } from './locale'
import { resName } from './words'

const ICON: Record<Resource, (p: { className?: string }) => React.ReactElement> = { lumber: Logs, brick: Brick, wool: SheepIcon, grain: WheatIcon, ore: Ore }
const WORD = (r: Resource) => resName(r)
const LOG = () => L('Game log', 'Журнал')
const COLLAPSED_LINES = 5
const OPEN_KEY = 'isles3d.logOpen'

function readOpen() {
  try { return localStorage.getItem(OPEN_KEY) === '1' } catch { return false }
}
function saveOpen(v: boolean) {
  try { localStorage.setItem(OPEN_KEY, v ? '1' : '0') } catch { /* private window: not remembered */ }
}

function Line({ e }: { e: LogEntry }) {
  if (e.kind === 'turn') {
    return (
      <li className="mt-[4px] flex items-center gap-[6px] pt-[2px] text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[#c9b48a] first:mt-0">
        <span aria-hidden className="h-px flex-1 bg-[#c9a45c]/30" />
        <span>{e.text}</span>
        <span aria-hidden className="h-px flex-1 bg-[#c9a45c]/30" />
      </li>
    )
  }
  const color = e.player ? SEATS[e.player].color : '#8d8a84'
  const strong = e.kind === 'win' || e.kind === 'award' || e.kind === 'roll'
  return (
    <li className="flex items-start gap-[7px] text-[13.5px] leading-[1.3] text-[#ece8e0] motion-safe:animate-[notice-in_.22s_ease-out]">
      <span aria-hidden className="mt-[5px] h-[8px] w-[8px] shrink-0 rounded-full" style={{ background: color }} />
      {e.gains
        ? <span className="flex flex-wrap items-center gap-x-[5px]">
            <span className="sr-only">{e.text}</span>
            <span aria-hidden>{e.lead}</span>
            {RESOURCE_ORDER.filter((r) => e.gains![r]).map((r) => {
              const I = ICON[r]
              return <span key={r} aria-hidden className="inline-flex items-center gap-[3px]"><b className="font-semibold text-[#f2cf84]">+{e.gains![r]}</b><I className="h-[16px] w-[20px]" />{WORD(r)}</span>
            })}
          </span>
        : <span className={strong ? 'font-semibold' : ''}>
            {e.text}
            {e.dice && <span className="ml-[5px] font-normal text-[#a9a49a]">({e.dice[0]} + {e.dice[1]})</span>}
          </span>}
    </li>
  )
}

/** The list itself; `all` shows every line in a scroller kept at the newest line. */
function LogList({ entries, all, className = '' }: { entries: readonly LogEntry[]; all: boolean; className?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const shown = all ? entries : entries.slice(-COLLAPSED_LINES)
  useLayoutEffect(() => {
    const el = box.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [shown, all])
  return (
    // the log role sits on a wrapper: on the <ol> itself it would hide the list from its items (axe: listitem)
    <div ref={box} role="log" aria-live="off" aria-label={LOG()} tabIndex={all ? 0 : undefined}
      onScroll={(ev) => { const el = ev.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24 }}
      className={`${all ? `overflow-y-auto overscroll-contain rounded-[6px] pr-[4px] ${focusRing}` : 'overflow-hidden'} ${className}`}>
      <ol className="flex flex-col gap-[3px]">
        {shown.length ? shown.map((e) => <Line key={e.id} e={e} />) : <li className="text-[13px] text-[#a9a49a]">{L('Nothing has happened yet', 'Пока ничего не произошло')}</li>}
      </ol>
    </div>
  )
}

const Chevron = ({ up }: { up: boolean }) => (
  <svg aria-hidden viewBox="0 0 24 24" className={`h-[15px] w-[15px] transition-transform ${up ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 15l6-6 6 6" /></svg>
)

/** Desktop: the panel in the bottom-left corner. */
export function GameLog({ className = '' }: { className?: string }) {
  const entries = useGameLog(useGameStore())
  const [open, setOpen] = useState(readOpen)
  const toggle = () => setOpen((v) => { saveOpen(!v); return !v })
  return (
    <section aria-labelledby="log-title" data-game-log className={`pointer-events-auto rounded-[12px] px-[12px] pb-[10px] pt-[6px] ${panel} ${className}`}>
      <div className="flex items-center justify-between">
        <h2 id="log-title" className="font-display text-[15px] font-semibold text-[#f4efe6]">{LOG()}</h2>
        <button onClick={toggle} aria-expanded={open} aria-controls="game-log-list" data-log-toggle
          className={`-mr-[6px] flex items-center gap-[4px] rounded-[7px] px-[7px] py-[3px] text-[12.5px] font-medium text-[#d6d2ca] hover:bg-white/10 ${focusRing}`}>
          {open ? L('Show less', 'Свернуть') : L('Show all', 'Показать всё')}<Chevron up={!open} />
        </button>
      </div>
      <div id="game-log-list" className="mt-[4px]">
        <LogList entries={entries} all={open} className={open ? 'max-h-[260px]' : ''} />
      </div>
    </section>
  )
}

const LogIco = () => (
  <svg aria-hidden viewBox="0 0 24 24" className="h-[20px] w-[20px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="18" r="1" fill="currentColor" /></svg>
)

/** Compact: a top-bar button that opens the whole log as a sheet under the top bar. */
export function CompactLogButton({ className = '', sheetTop }: { className?: string; sheetTop: number }) {
  const entries = useGameLog(useGameStore())
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus() } }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [open])
  return (
    <>
      <button ref={btn} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="compact-log" aria-label={LOG()} title={LOG()} data-log-toggle
        className={`grid shrink-0 place-items-center rounded-[9px] text-[#ece8e0] ${open ? 'ring-2 ring-[#f2b544]' : ''} ${focusRing} ${panel} ${className}`}>
        <LogIco />
      </button>
      {open && (
        <section id="compact-log" aria-label={LOG()} data-game-log className={`pointer-events-auto fixed inset-x-[8px] z-[3] rounded-[12px] px-[12px] pb-[10px] pt-[8px] ${panel}`} style={{ top: sheetTop }}>
          <div className="mb-[4px] flex items-center justify-between">
            <h2 className="font-display text-[15px] font-semibold">{LOG()}</h2>
            <button onClick={() => { setOpen(false); btn.current?.focus() }} className={`rounded-[7px] px-[8px] py-[3px] text-[13px] text-[#d6d2ca] hover:bg-white/10 ${focusRing}`}>{L('Close', 'Закрыть')}</button>
          </div>
          <LogList entries={entries} all className="max-h-[45dvh]" />
        </section>
      )}
    </>
  )
}
