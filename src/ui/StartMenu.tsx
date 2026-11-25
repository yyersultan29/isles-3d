// Start menu (ROADMAP G9.3, docs/G9_PLAN.md): the first screen of a hot-seat page load, and the Menu
// button's screen during a game. Continue (the saved game at load, or back to the live game), a new
// game on this device with optional names, and online play through the existing `?online` flow
// (create a room, then the lobby shows the invite link). The board stays visible behind it.
//
// It replaces the "Continue your game?" card (Resume.tsx) when the page opens without URL options;
// any option (`?seed=`, `?menu=0`, …) skips it, as the test drivers and the showcase need. Autosave
// starts once a choice is made, as Resume did, so a stray click can't overwrite the saved game.

import { Rules } from './Rules'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Avatar } from './icons'
import { focusRing, panel } from './tokens'
import { DEFAULT_NAMES, NAME_MAX, SEATS, phaseText, seats, setSeatNames } from './gameView'
import { clearNotices } from './noticeQueue'
import { useGameStore } from '../store/GameProvider'
import { clearSave, readSave, resumable, startAutosave } from '../store/autosave'
import { readNames, writeNames, type Names } from '../store/names'
import { BOARD_CHOICES, readBoardChoice, writeBoardChoice, type BoardChoice } from '../store/boardChoice'
import { resetUi } from '../store/ui'
import { BRAND_NAME } from '../brand'
import { L, count as countOf, useLocale } from './locale'
import { LangSwitch } from './LangSwitch'
import { GraphicsSwitch } from './GraphicsSwitch'
import { type GameState, type PlayerId, type ReplayFile } from '../game'

/** Whether this page load starts at the menu: a plain URL does, any option skips it, except the
 *  language (`?lang=ru` is a link for new players and should still open the menu). */
export function menuAtStart() {
  if (typeof window === 'undefined') return false
  const q = new URLSearchParams(window.location.search)
  q.delete('lang')
  q.delete('nowebgl') // test flag: a real browser without WebGL has a plain URL and gets the menu
  return q.size === 0
}

// ---------------------------------------------------------------- open / closed

let open = false
// the load-time menu is up and nothing is chosen yet: the game behind it is a placeholder, so the HUD
// and the placement rings stay hidden (two instructions at once confused first-time players)
let pending = menuAtStart()
const listeners = new Set<() => void>()
const emit = () => { for (const l of [...listeners]) l() }
export function openMenu() { open = true; emit() }
function closeMenu() { open = false; pending = false; emit() }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export const useMenuOpen = () => useSyncExternalStore(subscribe, () => open)
/** True until the first menu choice of a plain page load (see `pending`). */
export const useBeforeGame = () => useSyncExternalStore(subscribe, () => pending)

const newSeed = () => Math.floor(Math.random() * 2 ** 31)
const ORDER: PlayerId[] = ['p1', 'p2', 'p3', 'p4']
const gold = 'border-2 border-[#ffe7a6] bg-[linear-gradient(180deg,#ffe08a_0%,#f4b33a_45%,#d98a16_100%)] font-display font-semibold text-[#3a2208] shadow-[0_3px_0_#8a5410]'
export const BOARD_NAMES: Record<BoardChoice, () => string> = {
  balanced: () => L('New balanced', 'Новая сбалансированная'),
  'standard-fixed': () => L('Classic', 'Классическая'),
}
const BOARD_NOTES: Record<BoardChoice, () => string> = {
  balanced: () => L('A new layout each game; red 6 and 8, rare 2 and 12, and equal numbers never touch.', 'Каждый раз новая раскладка; красные 6 и 8, редкие 2 и 12 и одинаковые числа не соседствуют.'),
  'standard-fixed': () => L('The same layout every game, good for learning.', 'Одна и та же раскладка в каждой партии — удобно для обучения.'),
}
const plain = 'bg-white/10 font-semibold text-white hover:bg-white/20'

/**
 * Mounted for every hot-seat page. `atStart` (a plain URL) opens it on load and makes it the owner of
 * autosave; otherwise Resume.tsx owns the load-time choice and autosave, and the menu only opens from
 * the Menu button, over a live game.
 */
export function StartMenu({ atStart, noWebGL = false }: { atStart: boolean; noWebGL?: boolean }) {
  const store = useGameStore()
  const isOpen = useMenuOpen()
  useLocale()
  // the saved game is offered only at load; later "Continue" goes back to the live game
  const [save, setSave] = useState<{ file: ReplayFile; state: GameState } | null>(() => {
    if (!atStart) return null
    const file = readSave()
    const state = resumable(file)
    return file && state ? { file, state } : null
  })
  const [names, setNames] = useState<Names>(readNames)
  const [board, setBoard] = useState<BoardChoice>(() => readBoardChoice())
  const saving = useRef<(() => void) | null>(null)
  const first = useRef<HTMLButtonElement>(null)
  const card = useRef<HTMLElement>(null)
  // a game is under way behind the menu (opened with the Menu button, or after a choice)
  const [live, setLive] = useState(!atStart)

  // the saved names apply at once, so a resumed game shows them
  useEffect(() => { setSeatNames(readNames()) }, [])
  // first screen of the page
  useEffect(() => { if (atStart) openMenu() }, [atStart])

  useEffect(() => {
    if (!isOpen) return
    const root = document.getElementById('root')
    if (root) root.inert = true
    requestAnimationFrame(() => first.current?.focus())
    const keys = (e: KeyboardEvent) => {
      const c = card.current
      if (!c) return
      if (e.key === 'Escape' && live) { e.preventDefault(); closeMenu(); return }
      if (e.key !== 'Tab') return
      const items = [...c.querySelectorAll<HTMLElement>('button, input, summary')].filter((x) => !(x as HTMLButtonElement).disabled)
      const i = items.indexOf(document.activeElement as HTMLElement)
      e.preventDefault()
      items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length]?.focus()
    }
    window.addEventListener('keydown', keys, true)
    return () => { window.removeEventListener('keydown', keys, true); if (root) root.inert = false }
  }, [isOpen, live])

  if (!isOpen) return null

  const autosave = () => { if (atStart && !saving.current) saving.current = startAutosave(store) }
  const quiet = () => { clearNotices(); resetUi('leave') }
  const finish = () => { autosave(); setLive(true); setSave(null); closeMenu() }

  const resume = () => {
    if (save) {
      const r = store.load(save.file)
      if (r.ok) quiet()
      else clearSave()
    }
    finish()
  }
  const startHere = () => {
    writeNames(names)
    setSeatNames(names)
    clearSave()
    quiet()
    writeBoardChoice(board)
    store.reset({ seed: newSeed(), boardPreset: board })
    finish()
  }
  const goOnline = () => { window.location.href = `${window.location.pathname}?online` }

  const shown = save ? seats(save.state) : null
  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-[#08121c]/35 px-[12px] py-[16px] font-ui text-[#f4efe6]">
      <section ref={card} role="dialog" aria-modal="true" aria-labelledby="menu-title" data-start-menu
        className={`w-full max-w-[440px] rounded-[16px] px-[18px] pb-[16px] pt-[16px] ${panel} animate-[notice-in_.25s_ease-out]`}
        style={{ boxShadow: 'inset 0 0 0 2px #f2b544aa, 0 18px 50px rgba(0,0,0,.65)' }}>
        <div className="flex items-center justify-between gap-[10px]">
          <h2 id="menu-title" className="font-display text-[28px] font-semibold leading-tight text-[#f4efe6]">{BRAND_NAME} <span className="text-[#f2b544]">3D</span></h2>
          <LangSwitch />
        </div>
        {/* the 3D view's own notice hides behind the menu, so the menu says it */}
        {noWebGL && <p role="alert" className="mt-[8px] rounded-[8px] bg-[#b8322b]/25 px-[10px] py-[6px] text-[13px] text-[#ffd9d2] ring-1 ring-[#b8322b]/60">{L('This browser cannot show the 3D island (no WebGL 2). Try an up-to-date Chrome, Edge, Firefox or Safari, or turn on hardware acceleration.', 'Этот браузер не может показать 3D-остров (нет WebGL 2). Попробуйте свежий Chrome, Edge, Firefox или Safari либо включите аппаратное ускорение.')}</p>}

        {(save || live) && (
          <div className="mt-[12px] rounded-[12px] bg-white/[0.05] p-[12px]">
            <div className="flex items-center justify-between gap-[10px]">
              <div className="min-w-0">
                <h3 className="font-display text-[18px] font-semibold">{save ? L('Your saved game', 'Сохранённая игра') : L('The current game', 'Текущая игра')}</h3>
                {save && <p className="truncate text-[13px] text-[#d6d2ca]">{L('Turn', 'Ход')} {save.state.turn} · {phaseText(save.state)}</p>}
              </div>
              <button ref={first} onClick={live && !save ? closeMenu : resume} data-menu-continue className={`h-[42px] shrink-0 rounded-full px-[22px] text-[17px] ${gold} ${focusRing}`}>
                {L('Continue', 'Продолжить')}
              </button>
            </div>
            {shown && (
              <ul aria-label={L('Scores', 'Очки')} className="mt-[10px] grid grid-cols-4 gap-[6px]">
                {shown.map((p) => (
                  <li key={p.id} aria-label={`${p.name}: ${countOf(p.vp, 'point', 'points', 'очко', 'очка', 'очков')}`} className="flex items-center justify-center gap-[5px] rounded-[8px] bg-white/[0.05] py-[4px]" style={{ boxShadow: `inset 0 -3px 0 ${p.color}` }}>
                    <span aria-hidden className="h-[22px] w-[22px] overflow-hidden rounded-[5px]"><Avatar i={p.avatar} className="h-full w-full" /></span>
                    <span aria-hidden className="font-display text-[15px] font-semibold text-[#f2cf84]">{p.vp}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-[12px] rounded-[12px] bg-white/[0.05] p-[12px]">
          <h3 className="font-display text-[18px] font-semibold">{L('Play on this device', 'Играть на этом устройстве')}</h3>
          <p className="text-[13px] text-[#d6d2ca]">{L('Four players take turns on one screen. Names are optional.', 'Четыре игрока ходят по очереди за одним экраном. Имена — по желанию.')}</p>
          <div className="mt-[8px] grid grid-cols-2 gap-[6px]">
            {ORDER.map((id) => (
              <label key={id} className="flex items-center gap-[6px] rounded-[8px] bg-black/25 py-[4px] pl-[4px] pr-[6px] ring-1 ring-white/10 focus-within:ring-2 focus-within:ring-[#f2b544]" style={{ boxShadow: `inset 3px 0 0 ${SEATS[id].color}` }}>
                <span aria-hidden className="ml-[3px] h-[26px] w-[26px] shrink-0 overflow-hidden rounded-[6px]"><Avatar i={SEATS[id].avatar} className="h-full w-full" /></span>
                <span className="sr-only">{L(`${DEFAULT_NAMES[id]} player's name`, `Имя игрока: ${DEFAULT_NAMES[id]}`)}</span>
                <input value={names[id] ?? ''} maxLength={NAME_MAX} placeholder={DEFAULT_NAMES[id]} data-name-input={id}
                  onChange={(e) => setNames((n) => ({ ...n, [id]: e.target.value }))}
                  className="h-[30px] min-w-0 flex-1 bg-transparent text-[14.5px] text-white outline-none placeholder:text-[#a9a49a]" />
              </label>
            ))}
          </div>
          <div role="group" aria-label={L('Board', 'Карта')} className="mt-[8px] flex flex-wrap items-center gap-[6px]">
            <span aria-hidden className="text-[12px] text-[#a9a49b]">{L('Board', 'Карта')}</span>
            <div className="flex overflow-hidden rounded-[8px] ring-1 ring-white/15">
              {BOARD_CHOICES.map((c) => (
                <button key={c} type="button" aria-pressed={board === c} data-board={c} onClick={() => setBoard(c)}
                  className={`h-[28px] px-[9px] text-[12.5px] font-bold ${board === c ? 'bg-[#f2b544] text-[#2a1a06]' : 'bg-white/5 text-[#d6d2ca] hover:bg-white/15'} ${focusRing}`}>
                  {BOARD_NAMES[c]()}
                </button>
              ))}
            </div>
            <p data-board-note className="w-full text-[12px] text-[#a9a49b]">{BOARD_NOTES[board]()}</p>
          </div>
          <div className="mt-[10px] flex items-center justify-between gap-[10px]">
            <span className="text-[12.5px] text-[#d6d2ca]">{save || live ? L('Ends the game above', 'Завершит игру выше') : ''}</span>
            <button ref={save || live ? undefined : first} onClick={startHere} data-menu-new
              className={`h-[42px] shrink-0 rounded-full px-[22px] text-[17px] ${save || live ? `rounded-[10px] ${plain}` : gold} ${focusRing}`}>
              {save || live ? L('New game', 'Новая игра') : L('Start game', 'Начать игру')}
            </button>
          </div>
        </div>

        <div className="mt-[12px] flex items-center justify-between gap-[10px] rounded-[12px] bg-white/[0.05] p-[12px]">
          <div className="min-w-0">
            <h3 className="font-display text-[18px] font-semibold">{L('Play online', 'Играть онлайн')}</h3>
            <p className="text-[13px] text-[#d6d2ca]">{L('Create a room and send the link to three friends.', 'Создайте комнату и отправьте ссылку трём друзьям.')}</p>
          </div>
          <button onClick={goOnline} data-menu-online className={`h-[40px] shrink-0 rounded-[10px] px-[14px] text-[14.5px] ${plain} ${focusRing}`}>{L('Create room', 'Создать комнату')}</button>
        </div>

        <Rules className="mt-[12px]" />
        <GraphicsSwitch className="mt-[12px] px-[2px]" />
      </section>
    </div>,
    document.body,
  )
}
