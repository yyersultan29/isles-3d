// Keyboard shortcuts (ROADMAP G6.6): R road, S settlement, C city, D development card, T trade,
// Enter the trade panel's main action, Esc closes or cancels (usePlacementAutoReset). A shortcut
// does exactly what its button does, through the same code, and only when that button is enabled:
// never while typing, behind the pass-the-device screen, or outside the player's turn.

import { useEffect, useRef, useState } from 'react'
import { IconButton, chooseBuild, focusRing, panel } from './HUD'
import { gameView, type BuildKind } from './gameView'
import { shortfall } from './tradePlan'
import { usePrivacy } from './PassDevice'
import { useGameStore, useSeat } from '../store/GameProvider'
import { getPlacementMode, getTradeOpen, setTradeOpen } from '../store/ui'

export type Shortcut = BuildKind | 'trade' | 'confirm'

export const SHORTCUT_KEYS: [string, string][] = [
  ['R', 'Build a road'], ['S', 'Build a settlement'], ['C', 'Build a city'], ['D', 'Buy a development card'],
  ['T', 'Open or close trade'], ['Enter', 'Trade: bank trade, else offer (Space adds a card)'], ['Esc', 'Cancel a build, close a panel'],
]
const LETTERS: Record<string, Shortcut> = { r: 'road', s: 'settlement', c: 'city', d: 'dev', t: 'trade' }

interface KeyLike { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; repeat?: boolean; target?: EventTarget | null }
interface ElLike { tagName?: string; isContentEditable?: boolean; getAttribute?: (n: string) => string | null }

/**
 * The shortcut a key press means, or null: never with a modifier, a held key, or while typing.
 * Enter is left to the focused control, except on resource cards (trade tiles, hand cards): there it
 * means the trade panel's main action, and Space adds a card.
 */
export function shortcutOf(e: KeyLike): Shortcut | null {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return null
  const t = (e.target ?? null) as ElLike | null
  const tag = t?.tagName?.toUpperCase() ?? ''
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return null
  if (e.key === 'Enter') {
    const role = t?.getAttribute?.('role') ?? ''
    const card = t?.getAttribute?.('data-tile') != null || t?.getAttribute?.('data-hand-card') != null
    return !card && (tag === 'BUTTON' || tag === 'A' || /^(button|tab|radio|checkbox|link|menuitem|option|switch)$/.test(role)) ? null : 'confirm'
  }
  return LETTERS[e.key.toLowerCase()] ?? null
}

/** Mount once per HUD. */
export function useShortcuts() {
  const store = useGameStore()
  const me = useSeat()
  const covered = usePrivacy().covered
  const hidden = useRef(covered)
  hidden.current = covered
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const k = shortcutOf(e)
      if (!k || hidden.current) return
      const s = store.getState()
      const v = gameView(s, me)
      if (k === 'trade') {
        if (!v.bank.open) return
        e.preventDefault(); setTradeOpen(!getTradeOpen()); return
      }
      if (k === 'confirm') {
        // only with the trade panel open; a card's own Enter (adding it) is replaced, not doubled
        if (!document.querySelector('[aria-labelledby=trade-title]')) return
        e.preventDefault()
        document.querySelector<HTMLButtonElement>('[aria-labelledby=trade-title] [data-main-action]:not([disabled])')?.click()
        return
      }
      const row = v.build.find((b) => b.kind === k)!
      const plan = row.enabled ? null : shortfall(s, k, me)
      if (!row.enabled && !(plan?.covered && plan.trades.length)) return
      e.preventDefault()
      chooseBuild(k, { enabled: row.enabled, plan, player: v.primary.player, mode: getPlacementMode(), dispatch: (p, a) => store.dispatch(p, a) })
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [store, me])
}

/** The Help button: lists the shortcuts in a small popover (Esc or the button closes it). */
export function HelpButton({ className = '', align = 'right' }: { className?: string; align?: 'right' }) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus() } }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [open])
  return (
    <div className="relative shrink-0">
      <IconButton ref={btn} label="Help" aria-expanded={open} aria-controls="help-panel" onClick={() => setOpen(!open)} className={`${open ? 'ring-2 ring-[#f2b544]' : ''} ${className}`}>
        <span aria-hidden className="text-[20px] font-bold">?</span>
      </IconButton>
      {open && (
        <section id="help-panel" aria-labelledby="help-title" className={`pointer-events-auto absolute top-[calc(100%+8px)] ${align === 'right' ? 'right-0' : 'left-0'} z-[3] max-h-[calc(100dvh-72px)] w-[260px] overflow-y-auto rounded-[12px] px-[12px] pb-[10px] pt-[10px] text-left ${panel}`}>
          <h2 id="help-title" className="mb-[6px] font-display text-[17px] font-semibold text-[#f4efe6]">Keyboard shortcuts</h2>
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-[10px] gap-y-[5px] text-[13px] text-[#d6d2ca]">
            {SHORTCUT_KEYS.map(([k, d]) => (
              <div key={k} className="contents">
                <dt><kbd className="inline-block min-w-[26px] rounded-[5px] border border-[#c9a45c]/50 bg-white/10 px-[5px] text-center font-ui text-[12px] font-bold text-white">{k}</kbd></dt>
                <dd>{d}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-[8px] text-[12px] text-[#a9a49b]">In your turn, when the button is available. Arrow keys and Enter place on the board.</p>
          <button onClick={() => { setOpen(false); btn.current?.focus() }} className={`mt-[6px] h-[30px] w-full rounded-[8px] bg-white/10 text-[13px] font-semibold text-white hover:bg-white/20 ${focusRing}`}>Close</button>
        </section>
      )}
    </div>
  )
}
