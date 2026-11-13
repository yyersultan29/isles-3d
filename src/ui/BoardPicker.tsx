// Keyboard placement on the board (ROADMAP G4.6a). One focusable button stands for the board's
// current targets (the same legalActions-derived list Placement draws): arrow keys move a cursor
// to the next target in that direction on screen, Enter or Space places, Escape cancels a build.
// It stays visually hidden until it has keyboard focus, so the mouse HUD is unchanged; the scene
// draws the cursor with its hover marker. Focus moves here when a build is chosen or a board-only
// phase starts with nothing focused, and returns to where it came from when the targets go away.

import { useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties, type KeyboardEvent } from 'react'
import { panel } from './HUD'
import { usingKeyboard } from './modality'
import { BOARD_MODE } from '../scene/board'
import { useGame, useGameStore, useSeat } from '../store/GameProvider'
import { keepsPlacing, placementTargets } from '../store/placement'
import { setPlacementMode, usePlacementMode } from '../store/ui'
import { getCursor, nearest, project, setCursor, spotLabel, step, useCursor, type Dir, type Point } from '../store/boardCursor'

const KEYS: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }
const centre = (): Point => [innerWidth / 2, innerHeight / 2]
const lost = (el: Element | null) => !el || el === document.body || !el.isConnected || (el as HTMLButtonElement).disabled

export function BoardPicker({ className = '', style }: { className?: string; style?: CSSProperties }) {
  const state = useGame((s) => s)
  const mode = usePlacementMode()
  const store = useGameStore()
  const me = useSeat()
  const targets = useMemo(() => placementTargets(state, mode, me), [state, mode, me])
  const list = useMemo(() => [...targets.vertices, ...targets.edges, ...targets.tiles], [targets])
  const cur = useCursor()
  const btn = useRef<HTMLButtonElement>(null)
  const returnTo = useRef<HTMLElement | null>(null)
  const last = useRef<Point | null>(null) // screen position of the cursor, to land nearby after a change
  const active = useRef(false) // focused by keyboard: the cursor shows only then
  const idx = list.findIndex((t) => t.at === cur)
  const n = list.length

  // read before the commit hides the button: did it have focus?
  const hadFocus = useRef(false)
  hadFocus.current = !!btn.current && document.activeElement === btn.current

  const points = () => list.map((t) => project(t.action) ?? centre())
  // put the cursor on the target nearest to where it was (or the screen centre)
  const land = () => {
    let raf = 0, tries = 0
    const pick = () => {
      if (!project(list[0].action) && tries++ < 10) { raf = requestAnimationFrame(pick); return }
      if (!active.current) return
      const pts = points()
      // landing doesn't move the anchor: only a placement or an arrow key does, so a build mode that
      // stays on after a build (G6.5) lands near the last placement each time, without drifting
      const i = nearest(pts, last.current ?? centre())
      setCursor(list[i].at)
    }
    pick()
    return () => cancelAnimationFrame(raf)
  }

  // keep the cursor on a live target while active; the scene registers its projector for the new
  // targets in its own commit, so wait a frame or two for it
  useEffect(() => {
    if (!n) { setCursor(null); return }
    if (!active.current || list.some((t) => t.at === getCursor())) return
    return land()
  }, [list]) // eslint-disable-line react-hooks/exhaustive-deps

  // a build chosen from the menu: take focus (and remember where to go back)
  useEffect(() => {
    if (!mode || !n || !usingKeyboard()) return
    // back to the Build button afterwards (the menu row that chose it closes)
    returnTo.current = document.querySelector<HTMLElement>('[data-build-toggle]') ?? (document.activeElement as HTMLElement | null)
    btn.current?.focus()
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // a board-only phase (setup, robber, free roads) starts: the board is the only thing to do, so a
  // keyboard user goes there (after dialogs settle and return focus); a build-mode change is above
  const boardOnly = state.phase.kind !== 'actions'
  useEffect(() => {
    if (!n) return
    const raf = requestAnimationFrame(() => {
      const a = document.activeElement
      if (usingKeyboard() && (lost(a) || (boardOnly && !a?.closest('[role=dialog]')))) btn.current?.focus()
    })
    return () => cancelAnimationFrame(raf)
  }, [n > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  // nothing focused yet (a fresh page, or after a mouse click on the board): an arrow key or Enter
  // starts keyboard placement
  useEffect(() => {
    if (!n) return
    const f = (e: globalThis.KeyboardEvent) => {
      if (!(e.key in KEYS || e.key === 'Enter') || !lost(document.activeElement)) return
      e.preventDefault()
      btn.current?.focus()
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [n > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  // targets gone while focused: go back to where we came from, else to the main action
  useLayoutEffect(() => {
    if (n || !hadFocus.current) return
    hadFocus.current = false
    active.current = false
    const back = returnTo.current
    returnTo.current = null
    const el = back && !lost(back) ? back : document.querySelector<HTMLElement>('[data-primary-action]:not([disabled])')
    el?.focus()
  }, [n])

  const place = () => {
    const t = list[idx]
    if (!t || !targets.player) return
    last.current = project(t.action) ?? last.current
    const r = store.dispatch(targets.player, t.action)
    // G6.5: the build mode stays on while another of the same build is legal
    if (r.ok && state.phase.kind === 'actions' && !keepsPlacing(state, targets.player, t.action)) setPlacementMode(null)
  }

  const onFocus = () => {
    active.current = !!btn.current?.matches(':focus-visible')
    if (!active.current || list.some((t) => t.at === getCursor())) return
    land()
  }
  const onBlur = () => { active.current = false; setCursor(null) }
  const onKeyDown = (e: KeyboardEvent) => {
    const dir = KEYS[e.key]
    if (!dir || !n) return
    e.preventDefault()
    if (!active.current) { active.current = true; onFocus() }
    const pts = points()
    const from = idx >= 0 ? idx : nearest(pts, last.current ?? centre())
    const i = step(pts, from, dir)
    last.current = pts[i]
    setCursor(list[i].at)
  }

  if (!n || BOARD_MODE !== 'game') return null
  const label = idx >= 0 ? spotLabel(state, list[idx].action) : ''
  const kind = targets.tiles.length ? 'tile' : targets.edges.length ? 'road spot' : 'spot'
  return (
    <div className={`pointer-events-none flex justify-center ${className}`} style={style}>
      <button ref={btn} type="button" data-board-picker onClick={place} onFocus={onFocus} onBlur={onBlur} onKeyDown={onKeyDown}
        aria-label={idx >= 0 ? `${label}. ${idx + 1} of ${n}. Arrow keys choose, Enter places.` : `Choose a ${kind} on the board: ${n} options. Use the arrow keys.`}
        className={`sr-only rounded-full text-[14px] font-semibold text-[#f4efe6] outline-none ring-2 ring-[#f2b544] focus-visible:not-sr-only focus-visible:px-[16px] focus-visible:py-[8px] focus-visible:pointer-events-auto ${panel}`}>
        <span aria-hidden>
          {idx >= 0 ? label : `Choose a ${kind}`}
          <span className="ml-[10px] font-normal text-[#bdb8af]">{idx >= 0 ? `${idx + 1}/${n} · ` : ''}←↑↓→ move · Enter place{mode ? ' · Esc cancel' : ''}</span>
        </span>
      </button>
      <span className="sr-only" aria-live="polite">{idx >= 0 ? label : ''}</span>
    </div>
  )
}
