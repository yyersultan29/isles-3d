import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { Avatar, HexLogo } from './icons'
import { AwardBadges, BuildRows, HandCards, DevButton, TradeButton, CardsIco, Die, IconButton, NAV_ITEMS, NavIcon, PhaseBanner, Trophy, dieFaces, focusRing, panel, seatLabel, useDiceAndAction } from './HUD'
import { useGameView } from './gameView'
import { HelpButton } from './shortcuts'
import { GameDialogs } from './Dialogs'
import { Notices } from './Notices'
import { Victory } from './Victory'
import { BoardPicker } from './BoardPicker'
import { COMPACT_SAFE, PHASE_ROW, useViewport } from './layout'

/**
 * HUD for narrow and portrait screens. It uses real CSS pixels (no global down-scaling), so text
 * stays at 12px or larger. A top bar holds the menu, players and help; a bottom dock holds the
 * actions and the resource hand. Heights must match COMPACT_SAFE (layout.ts), which the camera
 * uses to keep the whole board between the bars.
 */
export function CompactHUD() {
  const [menu, setMenu] = useState(false)
  const [build, setBuild] = useState(false)
  const { seats } = useGameView()
  // short (landscape phone) screens: the seven dialogs sit over the disabled dock instead of
  // climbing over the top bar
  const short = useViewport().h < 560
  const { ref: dice, a, b, primary, act } = useDiceAndAction((el) =>
    gsap.fromTo(el.children, { y: -10, rotate: -25 }, { y: 0, rotate: 0, duration: 0.6, ease: 'bounce.out', stagger: 0.08 }),
  )
  // Escape closes any open popover; focus inside it goes back to its toggle (G4.6b)
  const menuBtn = useRef<HTMLButtonElement>(null)
  const buildBtn = useRef<HTMLButtonElement>(null)
  const refocus = () => {
    const a = document.activeElement
    if (a?.closest('#compact-menu')) menuBtn.current?.focus()
    else if (a?.closest('#compact-build')) buildBtn.current?.focus()
  }
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') { refocus(); setMenu(false); setBuild(false) } }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [])

  return (
    <div className="pointer-events-none fixed inset-0 z-[20] select-none overflow-hidden font-ui text-[#f4efe6] [&_button]:pointer-events-auto">
      {/* ---------- top bar ---------- */}
      <div className="absolute inset-x-[8px] top-[8px] flex items-start gap-[8px]" style={{ height: COMPACT_SAFE.top - PHASE_ROW - 8 }}>
        <div className="relative">
          <button
            ref={menuBtn}
            aria-label="Menu"
            aria-expanded={menu}
            aria-controls="compact-menu"
            onClick={() => { setMenu((v) => !v); setBuild(false) }}
            className={`grid h-[46px] w-[46px] place-items-center rounded-full border-2 border-[#e0a94a] bg-[radial-gradient(circle_at_40%_35%,#3a2a1a,#120c08)] shadow-[0_0_10px_rgba(224,169,74,0.4)] ${focusRing}`}
          >
            <HexLogo aria-hidden className="h-[34px] w-[34px]" />
          </button>
          {menu && (
            <nav id="compact-menu" aria-label="Main" className={`pointer-events-auto absolute left-0 top-[54px] w-[180px] rounded-[12px] p-[5px] ${panel}`}>
              {NAV_ITEMS.map(([label, d], i) => (
                <button
                  key={label}
                  aria-current={i === 0 ? 'page' : undefined}
                  className={`mb-[4px] flex h-[44px] w-full items-center gap-[10px] rounded-[9px] px-[10px] text-[14px] font-medium last:mb-0 ${focusRing} ${i === 0 ? 'bg-white/[0.08] text-white' : 'text-[#e3e1dc] hover:bg-white/[0.07]'}`}
                >
                  <span aria-hidden className={i === 0 ? 'text-[#f1d9a8]' : 'text-[#c9ccd2]'}><NavIcon d={d} /></span>
                  {label}
                </button>
              ))}
            </nav>
          )}
        </div>

        <ul aria-label="Players" className="flex min-w-0 flex-1 gap-[6px]">
          {seats.map((p) => (
            <li
              key={p.id}
              aria-label={seatLabel(p)}
              aria-current={p.active ? 'true' : undefined}
              className={`flex h-[46px] min-w-0 flex-1 items-center gap-[3px] overflow-hidden rounded-[8px] pl-[3px] pr-[3px] ${panel}`}
              style={{ boxShadow: `inset ${p.active ? 4 : 3}px 0 0 ${p.color}, inset 0 0 0 ${p.active ? 2 : 1}px ${p.color}${p.active ? 'cc' : '55'}` }}
            >
              <div className={`h-[30px] w-[30px] shrink-0 overflow-hidden rounded-[6px] ring-2 min-[560px]:h-[36px] min-[560px]:w-[36px] ${p.away ? 'opacity-45 grayscale' : ''} relative`} style={{ ['--tw-ring-color' as string]: p.color }}>
                <Avatar i={p.avatar} className="h-full w-full" />
                {p.auto && <span aria-hidden title="Played automatically" className="absolute bottom-0 right-0 h-[9px] w-[9px] rounded-full bg-[#f2b544] ring-1 ring-black/60" />}
              </div>
              <div aria-hidden className="min-w-0 leading-none [&_svg]:h-[13px] [&_svg]:w-[13px] [&_svg]:shrink-0">
                <div className="mb-[4px] hidden items-center gap-[4px] truncate text-[13px] font-semibold text-white min-[560px]:flex">{p.name}<AwardBadges seat={p} /></div>
                <div className="flex items-center gap-[3px] text-[13px] font-semibold"><Trophy />{p.vp}</div>
                <div className="mt-[2px] flex items-center gap-[3px] text-[12px] text-[#d6d2ca] min-[560px]:hidden"><CardsIco />{p.cards}</div>
              </div>
            </li>
          ))}
        </ul>

        <HelpButton className="!h-[46px] !w-[40px]" />
      </div>

      {/* ---------- phase line, under the top bar (inside COMPACT_SAFE.top) ---------- */}
      <div className="absolute inset-x-[8px] flex justify-center" style={{ top: COMPACT_SAFE.top - PHASE_ROW + 2 }}>
        <PhaseBanner className="max-w-full truncate !px-[12px] !py-[5px] !text-[13px]" />
      </div>
      <Notices className="absolute inset-x-[8px] [&>button]:!text-[13px]" style={{ top: COMPACT_SAFE.top + 4 }} />

      {/* ---------- bottom dock ---------- */}
      {/* an open build popover sits above the dialogs: it rises over the dock, where the trade panel is (G6.3) */}
      <div className={`absolute inset-x-[8px] bottom-[8px] flex flex-col items-center gap-[8px] ${build ? 'z-[2]' : ''}`} style={{ height: COMPACT_SAFE.bottom - 8 }}>
        <div className="relative flex w-full max-w-[560px] items-center gap-[6px]">
          <button
            onClick={act}
            data-primary-action
            disabled={!primary.action}
            className="flex h-[48px] disabled:grayscale-[0.7] disabled:brightness-75 items-center gap-[8px] rounded-full border-2 border-[#ffe7a6] bg-[linear-gradient(180deg,#ffe08a_0%,#f4b33a_45%,#d98a16_100%)] pl-[6px] pr-[14px] font-display text-[17px] font-semibold text-[#3a2208] shadow-[0_0_12px_rgba(255,190,70,0.6),0_3px_0_#8a5410] outline-none focus-visible:ring-4 focus-visible:ring-white/80 active:translate-y-[2px]"
          >
            <span ref={dice} aria-hidden className="flex gap-[6px] pl-[2px]">
              <Die faces={dieFaces(a)} rot="rotateX(-24deg) rotateY(-28deg)" size={24} />
              <Die faces={dieFaces(b)} rot="rotateX(-22deg) rotateY(30deg)" size={24} />
            </span>
            <span className="whitespace-nowrap">{primary.short}</span>
          </button>
          <TradeButton icon={22} className="!h-[44px] !w-[40px] shrink-0" />
          <DevButton icon={22} className="!h-[44px] !w-[40px]" />
          {/* undo and chat are still placeholders: they give way to Trade and Cards on small screens (G4.4d/e) */}
          <IconButton label="Undo" className="!h-[44px] !w-[40px] shrink-0 max-[389px]:!hidden">
            <svg aria-hidden viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></svg>
          </IconButton>
          <IconButton label="Chat (new messages)" className="relative !h-[44px] !w-[40px] shrink-0 max-[559px]:!hidden">
            <svg aria-hidden viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="currentColor"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.6 3.4 6L4.5 21l4.4-2.3c1 .2 2 .3 3.1.3 5.5 0 10-3.6 10-8s-4.5-8-10-8z" /></svg>
            <span aria-hidden className="absolute right-[4px] top-[4px] h-[8px] w-[8px] rounded-full bg-[#f2a33a]" />
          </IconButton>
          <button
            ref={buildBtn}
            data-build-toggle
            aria-expanded={build}
            aria-controls="compact-build"
            onClick={() => { setBuild((v) => !v); setMenu(false) }}
            className={`ml-auto flex h-[44px] shrink-0 items-center gap-[6px] rounded-[10px] px-[12px] font-display text-[17px] font-medium ${focusRing} ${panel}`}
          >
            Build
            <svg aria-hidden viewBox="0 0 24 24" className={`h-[16px] w-[16px] transition-transform ${build ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 15l6-6 6 6" /></svg>
          </button>
          {build && (
            <section id="compact-build" aria-label="Build" className={`pointer-events-auto absolute bottom-[54px] right-0 max-h-[calc(100dvh-164px)] w-[246px] overflow-y-auto overscroll-contain rounded-[12px] px-[10px] py-[8px] ${panel}`}>
              <BuildRows onChosen={() => { refocus(); setBuild(false) }} />
            </section>
          )}
        </div>

        <HandCards compact />
      </div>
      <GameDialogs compact className="absolute inset-x-[8px] flex justify-center" style={{ bottom: short ? 8 : COMPACT_SAFE.bottom + 4 }} />
      <BoardPicker className="absolute inset-x-[8px]" style={{ bottom: COMPACT_SAFE.bottom + 4 }} />
      <Victory compact />
    </div>
  )
}
