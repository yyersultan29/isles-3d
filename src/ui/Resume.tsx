// "Continue your game?" on load (ROADMAP G4.8b). Autosave only starts once the choice is made, so
// a stray click on the fresh board can't overwrite the saved game. Resuming loads silently (no
// build drops, tags or notices for history) and the pass-the-device screen then guards the hand of
// whoever the game waits for. Without a save worth offering, autosave starts at once.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Avatar } from './icons'
import { focusRing, panel } from './HUD'
import { phaseText, seats } from './gameView'
import { clearNotices } from './noticeQueue'
import { usingKeyboard } from './modality'
import { useGameStore } from '../store/GameProvider'
import { clearSave, readSave, resumable, startAutosave } from '../store/autosave'
import { setPanel, setPlacementMode, setSeen } from '../store/ui'
import type { GameState, ReplayFile } from '../game'

export function Resume() {
  const store = useGameStore()
  const [offer, setOffer] = useState<{ file: ReplayFile; state: GameState } | null>(() => {
    const file = readSave()
    const state = resumable(file)
    return file && state ? { file, state } : null
  })
  const btn = useRef<HTMLButtonElement>(null)

  // save from the moment there is nothing (left) to decide
  useEffect(() => { if (!offer) return startAutosave(store) }, [offer, store])

  useEffect(() => {
    if (!offer) return
    const root = document.getElementById('root')
    if (root) root.inert = true
    btn.current?.focus()
    // keep keyboard focus on the card: Tab cycles its two buttons; a key press after focus slipped
    // to the page (a click on the backdrop) comes back to Resume
    const trap = (e: KeyboardEvent) => {
      const card = btn.current?.closest('section')
      const inside = !!card && card.contains(document.activeElement)
      if (e.key === 'Tab' && card) {
        const bs = [...card.querySelectorAll<HTMLButtonElement>('button')]
        const i = bs.indexOf(document.activeElement as HTMLButtonElement)
        e.preventDefault()
        bs[(i + (e.shiftKey ? -1 : 1) + bs.length) % bs.length]?.focus()
      } else if (!inside && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); btn.current?.focus() }
    }
    window.addEventListener('keydown', trap, true)
    return () => { window.removeEventListener('keydown', trap, true); if (root) root.inert = false }
  }, [offer])

  if (!offer) return null
  const { state } = offer
  const resume = () => {
    const r = store.load(offer.file)
    if (r.ok) { clearNotices(); setPlacementMode(null); setPanel(null); setSeen(null) }
    else clearSave() // it replayed a moment ago; if it no longer does, start fresh
    setOffer(null)
  }
  const fresh = () => {
    clearSave()
    setOffer(null)
    if (usingKeyboard()) requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-board-picker], [data-primary-action]:not([disabled])')?.focus())
  }
  return createPortal(
    <div className="fixed inset-0 z-[55] grid place-items-center bg-[#08121c]/60 px-[12px] font-ui text-[#f4efe6]">
      <section role="dialog" aria-modal="true" aria-labelledby="resume-title" aria-describedby="resume-where"
        className={`w-full max-w-[400px] rounded-[16px] px-[18px] pb-[16px] pt-[16px] ${panel} animate-[notice-in_.25s_ease-out]`}
        style={{ boxShadow: 'inset 0 0 0 2px #f2b544aa, 0 18px 50px rgba(0,0,0,.65)' }}>
        <h2 id="resume-title" className="font-display text-[24px] font-semibold leading-tight">Continue your game?</h2>
        <p id="resume-where" className="mt-[4px] text-[14px] text-[#d6d2ca]">Turn {state.turn} · {phaseText(state)}</p>
        <ul aria-label="Scores" className="mt-[12px] grid grid-cols-4 gap-[6px]">
          {seats(state).map((p) => (
            <li key={p.id} aria-label={`${p.name}: ${p.vp} points`} className="flex flex-col items-center gap-[3px] rounded-[10px] bg-white/[0.05] py-[6px]" style={{ boxShadow: `inset 0 -3px 0 ${p.color}` }}>
              <span className="h-[30px] w-[30px] overflow-hidden rounded-[7px]"><Avatar i={p.avatar} className="h-full w-full" /></span>
              <span aria-hidden className="text-[13px] font-semibold">{p.name}</span>
              <span aria-hidden className="font-display text-[17px] font-semibold text-[#f2cf84]">{p.vp}</span>
            </li>
          ))}
        </ul>
        <div className="mt-[16px] flex items-center justify-between gap-[10px]">
          <button onClick={fresh} className={`h-[38px] rounded-[9px] bg-white/10 px-[14px] text-[14px] font-semibold text-white hover:bg-white/20 ${focusRing}`}>New game</button>
          <button ref={btn} onClick={resume}
            className={`h-[42px] rounded-full border-2 border-[#ffe7a6] bg-[linear-gradient(180deg,#ffe08a_0%,#f4b33a_45%,#d98a16_100%)] px-[26px] font-display text-[18px] font-semibold text-[#3a2208] ${focusRing}`}>
            Resume
          </button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
