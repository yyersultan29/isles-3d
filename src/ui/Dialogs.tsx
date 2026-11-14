// In-game dialogs for the seven (ROADMAP G4.4c): discarding half a hand and choosing whom to rob.
// Both are driven by the engine phase; they dispatch through the store and close by themselves
// when the phase moves on. Shared by the desktop and compact HUDs.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Avatar } from './icons'
import { RESOURCES, focusRing, panel } from './HUD'
import { ART_SHADOW, ResourceBackdrop } from './cards/ResourceArt'
import { SEATS, useGameView } from './gameView'
import { useGameStore } from '../store/GameProvider'
import { useDevOpen, useTradeOpen } from '../store/ui'
import { DevDialog } from './DevDialog'
import { TradeDialog } from './TradeDialog'
import { usePrivacy } from './PassDevice'
import { RESOURCE_ORDER, type Resource } from '../game'

const zero = (): Record<Resource, number> => ({ lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 })

function DiscardDialog({ compact }: { compact: boolean }) {
  const { discard } = useGameView()
  const store = useGameStore()
  const [pick, setPick] = useState(zero)
  const box = useRef<HTMLElement>(null)
  const confirmBtn = useRef<HTMLButtonElement>(null)
  // a new discarding player starts from an empty selection, focused on the first card they can drop
  const firstPlus = () => box.current?.querySelector<HTMLButtonElement>('button[data-plus]:not([disabled])')
  useEffect(() => { setPick(zero()); requestAnimationFrame(() => firstPlus()?.focus()) }, [discard?.player])
  // keyboard flow (G4.6b): a "+" that just disabled itself hands focus on, to Discard once enough are chosen
  const chosenNow = RESOURCE_ORDER.reduce((a, r) => a + pick[r], 0)
  useEffect(() => {
    const a = document.activeElement as HTMLButtonElement | null
    if (!box.current || !(a === document.body || (box.current.contains(a) && a?.disabled))) return
    if (discard && chosenNow === discard.count) confirmBtn.current?.focus()
    else firstPlus()?.focus()
  }, [pick]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!discard) return null
  const seat = SEATS[discard.player]
  const chosen = RESOURCE_ORDER.reduce((a, r) => a + pick[r], 0)
  const total = RESOURCE_ORDER.reduce((a, r) => a + discard.hand[r], 0)
  const step = (r: Resource, d: number) =>
    setPick((p) => ({ ...p, [r]: Math.max(0, Math.min(discard.hand[r], p[r] + d, p[r] + (d > 0 ? discard.count - chosen : 0))) }))
  const confirm = () => {
    const cards: Partial<Record<Resource, number>> = {}
    for (const r of RESOURCE_ORDER) if (pick[r]) cards[r] = pick[r]
    store.dispatch(discard.player, { type: 'DISCARD', cards })
  }
  const card = compact ? 'w-[58px]' : 'w-[78px]'
  return (
    <section ref={box} role="dialog" aria-labelledby="discard-title" className={`pointer-events-auto rounded-[14px] px-[14px] pb-[12px] pt-[12px] ${panel}`} style={{ boxShadow: `inset 0 0 0 2px ${seat.color}aa, 0 14px 34px rgba(0,0,0,.6)` }}>
      <h2 id="discard-title" className="mb-[2px] font-display text-[19px] font-semibold text-[#f4efe6]">
        <span className="mr-[8px] inline-block h-[11px] w-[11px] rounded-full align-middle" style={{ background: seat.color }} />
        {seat.name}: discard {discard.count} of {total}
      </h2>
      <p className="mb-[10px] text-[13px] text-[#d6d2ca]">
        Rolled a seven. {discard.waiting.length > 1 ? `Then: ${discard.waiting.slice(1).map((p) => SEATS[p].name).join(', ')}.` : ''}
      </p>
      <ul className="flex gap-[8px]">
        {RESOURCES.map(({ key, name, Icon }) => (
          <li key={key} className={`flex flex-col items-center gap-[6px] ${card}`}>
            <div className={`relative h-[64px] w-full overflow-hidden rounded-[8px] ring-1 ring-[#f2cf84]/50 ${discard.hand[key] ? '' : 'opacity-40'}`}>
              <ResourceBackdrop res={key} />
              <Icon aria-hidden className={`absolute left-1/2 top-1/2 w-[80%] -translate-x-1/2 -translate-y-1/2 ${ART_SHADOW}`} />
              <span aria-hidden className="absolute left-[3px] top-[3px] rounded-[4px] bg-[#1d1a16]/85 px-[5px] text-[12px] font-bold text-white">{discard.hand[key]}</span>
              {pick[key] > 0 && <span aria-hidden className="absolute bottom-[3px] right-[3px] rounded-[4px] bg-[#c8302a] px-[5px] text-[13px] font-bold text-white">−{pick[key]}</span>}
            </div>
            <div className="flex items-center gap-[4px]">
              <button aria-label={`Discard one less ${name}`} disabled={!pick[key]} onClick={() => step(key, -1)}
                className={`grid h-[28px] w-[28px] place-items-center rounded-[7px] bg-white/10 text-[17px] font-bold text-white disabled:opacity-30 ${focusRing}`}>−</button>
              <button data-plus aria-label={`Discard one more ${name} (${pick[key]} of ${discard.hand[key]} chosen)`} disabled={pick[key] >= discard.hand[key] || chosen >= discard.count} onClick={() => step(key, +1)}
                className={`grid h-[28px] w-[28px] place-items-center rounded-[7px] bg-white/10 text-[17px] font-bold text-white disabled:opacity-30 ${focusRing}`}>+</button>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-[12px] flex items-center justify-between">
        <span aria-live="polite" className="text-[14px] font-semibold text-[#f2cf84]">{chosen} / {discard.count} chosen</span>
        <button ref={confirmBtn} onClick={confirm} disabled={chosen !== discard.count}
          className={`h-[38px] rounded-full border-2 border-[#ffe7a6] bg-[linear-gradient(180deg,#ffe08a_0%,#f4b33a_45%,#d98a16_100%)] px-[22px] font-display text-[17px] font-semibold text-[#3a2208] disabled:grayscale-[0.7] disabled:brightness-75 ${focusRing}`}>
          Discard
        </button>
      </div>
    </section>
  )
}

function StealDialog() {
  const { steal } = useGameView()
  const store = useGameStore()
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => { first.current?.focus() }, [steal?.player, steal?.candidates.length])
  if (!steal) return null
  const seat = SEATS[steal.player]
  return (
    <section role="dialog" aria-labelledby="steal-title" className={`pointer-events-auto rounded-[14px] px-[14px] pb-[12px] pt-[12px] ${panel}`} style={{ boxShadow: `inset 0 0 0 2px ${seat.color}aa, 0 14px 34px rgba(0,0,0,.6)` }}>
      <h2 id="steal-title" className="mb-[10px] font-display text-[19px] font-semibold text-[#f4efe6]">
        <span className="mr-[8px] inline-block h-[11px] w-[11px] rounded-full align-middle" style={{ background: seat.color }} />
        {seat.name}: rob whom?
      </h2>
      <div className="flex flex-wrap gap-[8px]">
        {steal.candidates.map((c, i) => (
          <button key={c.id} ref={i === 0 ? first : undefined} onClick={() => store.dispatch(steal.player, { type: 'STEAL', victim: c.id })}
            aria-label={`Rob ${c.name} (${c.cards} cards)`}
            className={`flex h-[52px] items-center gap-[10px] rounded-[10px] bg-white/[0.06] pl-[5px] pr-[14px] text-left transition-colors hover:bg-white/[0.12] ${focusRing}`}
            style={{ boxShadow: `inset 3px 0 0 ${c.color}, inset 0 0 0 1px ${c.color}66` }}>
            <span className="h-[42px] w-[42px] overflow-hidden rounded-[7px] ring-2" style={{ ['--tw-ring-color' as string]: c.color }}><Avatar i={c.avatar} className="h-full w-full" /></span>
            <span className="leading-tight">
              <span className="block text-[15px] font-semibold text-white">{c.name}</span>
              <span className="block text-[13px] text-[#d6d2ca]">{c.cards} cards</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

/**
 * G4.6b: when a dialog closes (or gives way to another) with focus inside it or lost, put focus
 * back on what opened it (the Trade or Cards button), else on the main action. Board-only phases
 * that follow (the robber after a discard) take focus themselves (BoardPicker). The cleanup runs
 * before React removes the dialog, so `contains` still sees the focused element.
 */
function useReturnFocus(kind: string | null, box: React.RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    if (!kind) return
    const opener = document.activeElement as HTMLElement | null
    return () => {
      const a = document.activeElement
      const lost = !a || a === document.body
      if (!lost && !box.current?.contains(a)) return
      const usable = (el: HTMLElement | null): el is HTMLElement =>
        !!el && el !== document.body && el.isConnected && !(el as HTMLButtonElement).disabled && !box.current?.contains(el)
      const target = usable(opener) ? opener : document.querySelector<HTMLElement>('[data-primary-action]:not([disabled])')
      target?.focus()
    }
  }, [kind, box])
}

/**
 * G4.6b: inside an open dialog a control can disable or remove itself while focused (an answered
 * offer row, a spent "+"); the browser then drops focus to the page. Put it back on the dialog's
 * first enabled button. A pointer press elsewhere means the user left, so it never steals focus.
 */
function useKeepFocus(box: React.RefObject<HTMLDivElement | null>) {
  const inside = useRef(false)
  useEffect(() => {
    const onIn = (e: FocusEvent) => { inside.current = !!box.current?.contains(e.target as Node) }
    const onDown = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) inside.current = false }
    document.addEventListener('focusin', onIn)
    document.addEventListener('pointerdown', onDown, true)
    return () => { document.removeEventListener('focusin', onIn); document.removeEventListener('pointerdown', onDown, true) }
  }, [box])
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const a = document.activeElement
      if (!inside.current || !box.current || (a && a !== document.body)) return
      box.current.querySelector<HTMLElement>('button:not([disabled]):not([role=tab])')?.focus()
    })
    return () => cancelAnimationFrame(raf)
  })
}

/** Whichever dialog the current phase needs (seven, the trade panel or development cards), positioned above the hand. */
export function GameDialogs({ compact = false, className = '', style }: { compact?: boolean; className?: string; style?: React.CSSProperties }) {
  const { phaseKind, offer } = useGameView()
  const trade = useTradeOpen() || !!offer // an open offer stays on screen until it is answered
  const dev = useDevOpen()
  const kind = phaseKind === 'discard' ? 'discard'
    : phaseKind === 'steal' ? 'steal'
    : phaseKind === 'actions' && trade ? 'trade'
    : (phaseKind === 'preRoll' || phaseKind === 'actions') && dev ? 'dev'
    : null
  const box = useRef<HTMLDivElement>(null)
  useReturnFocus(kind, box)
  useKeepFocus(box)
  if (usePrivacy().covered) return null // G4.8a: a hand-revealing dialog waits for the pass screen
  const body = kind === 'discard' ? <DiscardDialog compact={compact} />
    : kind === 'steal' ? <StealDialog />
    : kind === 'trade' ? <TradeDialog compact={compact} />
    : kind === 'dev' ? <DevDialog compact={compact} />
    : null
  return body && <div ref={box} className={className} style={style}>{body}</div>
}
