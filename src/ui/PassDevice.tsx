// Hot-seat "pass the device" screen (ROADMAP G4.8a, GAME_DESIGN §18). When the player the game
// waits for changes to someone holding private cards, this covers the whole app before that
// player's hand renders: the HUD hides the hand and dialogs while `covered` (decided in the same
// render as the state change, so nothing private flashes), and the rest of the page is `inert`
// so neither Tab nor a screen reader reaches it. The board stays faintly visible: it is public.

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Avatar } from './icons'
import { focusRing } from './HUD'
import { usingKeyboard } from './modality'
import { SEATS, discardPrompt, needsPass, viewerOf } from './gameView'
import { useGame } from '../store/GameProvider'
import { setSeen, useSeen } from '../store/ui'

/** The current viewer and whether the pass screen covers the app. Safe to call from many components. */
export function usePrivacy() {
  const s = useGame((x) => x)
  const seen = useSeen()
  const viewer = viewerOf(s)
  const covered = needsPass(s, seen)
  // nothing to hide (an empty hand in the first setup round): reveal at once, so cards gained
  // later in the same turn don't raise the screen mid-turn
  useEffect(() => { if (viewer && !covered && viewer !== seen) setSeen(viewer) }, [viewer, covered, seen])
  return { viewer, covered }
}

export function PassDevice() {
  const s = useGame((x) => x)
  const { viewer, covered } = usePrivacy()
  const btn = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!covered) return
    const root = document.getElementById('root')
    if (root) root.inert = true
    btn.current?.focus()
    // the button is the only control: Tab (and any key once focus has slipped to the page) keeps it there
    const trap = (e: KeyboardEvent) => {
      if (e.key === 'Tab') { e.preventDefault(); btn.current?.focus() }
      else if (document.activeElement !== btn.current && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); btn.current?.focus() }
    }
    window.addEventListener('keydown', trap, true)
    return () => {
      window.removeEventListener('keydown', trap, true)
      if (root) root.inert = false
      // the revealed view: whatever takes focus by itself (a discard dialog) wins; otherwise the
      // main action, or the board when the board is all there is to do
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const a = document.activeElement
        if (!usingKeyboard() || (a && a !== document.body)) return
        const next = document.querySelector<HTMLElement>('[data-primary-action]:not([disabled])') ?? document.querySelector<HTMLElement>('[data-board-picker]')
        next?.focus()
      }))
    }
  }, [covered, viewer])

  if (!covered || !viewer) return null
  const seat = SEATS[viewer]
  const d = discardPrompt(s)
  const reason = d && d.player === viewer ? `${seat.name} must discard ${d.count} cards` : `${seat.name}’s turn`
  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="pass-title" aria-describedby="pass-reason"
      className="fixed inset-0 z-[60] grid place-items-center bg-[#08121c]/[0.96] px-[16px] font-ui text-[#f4efe6] animate-[notice-in_.25s_ease-out]">
      <div className="flex max-w-[360px] flex-col items-center text-center">
        <span className="mb-[14px] h-[84px] w-[84px] overflow-hidden rounded-[18px] ring-4" style={{ ['--tw-ring-color' as string]: seat.color }}>
          <Avatar i={seat.avatar} className="h-full w-full" />
        </span>
        <h2 id="pass-title" className="font-display text-[28px] font-semibold leading-tight">Pass the device to {seat.name}</h2>
        <p id="pass-reason" className="mt-[6px] text-[15px] text-[#d6d2ca]">{reason}. Only {seat.name} should look at the screen.</p>
        <button ref={btn} onClick={() => setSeen(viewer)}
          className={`mt-[22px] h-[46px] rounded-full border-2 border-[#ffe7a6] bg-[linear-gradient(180deg,#ffe08a_0%,#f4b33a_45%,#d98a16_100%)] px-[26px] font-display text-[19px] font-semibold text-[#3a2208] shadow-[0_0_16px_rgba(255,190,70,0.5)] ${focusRing}`}>
          I’m {seat.name}: show my cards
        </button>
      </div>
    </div>,
    document.body,
  )
}
