import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
import gsap from 'gsap'
import { Avatar, Brick, HexLogo, Logs, Ore, SheepIcon, WheatIcon } from './icons'
import { BRAND_NAME } from '../brand'
import { motion } from '../scene/motion'
import { useViewport } from './layout'
import { CompactHUD } from './CompactHUD'
import { GameDialogs } from './Dialogs'
import { Notices } from './Notices'
import { Victory } from './Victory'
import { usePrivacy } from './PassDevice'
import { BoardPicker } from './BoardPicker'
import { costText, useGameView, type BuildKind, type SeatView } from './gameView'
import { setDevOpen, setPanel, setPlacementMode, setTradeOpen, useDevOpen, usePlacementMode, useTradeOpen } from '../store/ui'
import type { Resource } from '../game'
import { useGameStore, useGameEvents } from '../store/GameProvider'

const LOGICAL_W = 1600
const LOGICAL_H = 904

/** Scales a fixed logical layout to the viewport so proportions match the reference at any size. */
function useHudScale() {
  const [s, setS] = useState(1)
  useEffect(() => {
    const f = () => setS(Math.min(window.innerWidth / LOGICAL_W, window.innerHeight / LOGICAL_H))
    f()
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])
  return s
}

// Shared HUD tokens: panels use r-12, controls and cards r-8/9; type is 14/15 UI and 20 display.
export const panel =
  'bg-[linear-gradient(180deg,rgba(28,32,40,0.88),rgba(12,14,19,0.9))] backdrop-blur-md border border-[#c9a45c]/35 shadow-[0_10px_30px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)]'

function Brand() {
  return (
    <div className="absolute left-[18px] top-[8px] flex items-center gap-3 rounded-[14px] pr-5 pl-1.5 py-1.5 bg-[linear-gradient(90deg,rgba(10,12,16,0.75),rgba(10,12,16,0.0))]">
      <div className="h-[50px] w-[50px] rounded-full bg-[radial-gradient(circle_at_40%_35%,#3a2a1a,#120c08)] border-2 border-[#e0a94a] shadow-[0_0_14px_rgba(224,169,74,0.45)] grid place-items-center">
        <HexLogo aria-hidden className="h-[38px] w-[38px]" />
      </div>
      <div className="font-display text-[27px] font-semibold tracking-tight text-[#f4efe6] drop-shadow-[0_2px_3px_rgba(0,0,0,0.8)]">
        {BRAND_NAME} <span className="text-[#f2b544]">3D</span>
      </div>
    </div>
  )
}

/** Visible keyboard focus that reads over both water and panels. */
export const focusRing = 'outline-none focus-visible:ring-2 focus-visible:ring-[#f2b544] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1018]'

export const NavIcon = ({ d }: { d: ReactNode }) => (
  <svg viewBox="0 0 24 24" className="h-[24px] w-[24px]" fill="currentColor">
    {d}
  </svg>
)

export const NAV_ITEMS: [string, ReactNode][] = [
    ['Home', <path key="h" d="M12 3 2 11.5h3V21h5.5v-6h3v6H19v-9.5h3z" />],
    ['Game', <g key="g"><circle cx="8" cy="8" r="3.4" /><circle cx="16.5" cy="8.5" r="3" /><path d="M1.5 20c0-4 3-6.5 6.5-6.5s6.5 2.5 6.5 6.5z" /><path d="M14 13.6c3.6-.6 8 1.4 8.5 6.4h-6.3c0-2.4-.8-4.6-2.2-6.4z" /></g>],
    ['Stats', <g key="s"><circle cx="12" cy="6" r="3.2" /><path d="M5 21v-3.5C5 14 8 11.5 12 11.5s7 2.5 7 6V21z" /><rect x="3" y="19" width="18" height="3" rx="1" /></g>],
    ['Settings', <path key="st" d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.4-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.3h-4l-.4 2.7a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.4L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.4 2.5-1a7.4 7.4 0 0 0 1.7 1l.4 2.7h4l.4-2.7a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)" />],
  ]

function Nav() {
  const items = NAV_ITEMS
  return (
    <nav aria-label="Main" className={`absolute left-[16px] top-[82px] w-[122px] rounded-[12px] p-[5px] ${panel}`}>
      {items.map(([label, d], i) => (
        <button
          key={label}
          aria-current={i === 0 ? 'page' : undefined}
          className={`flex w-full items-center gap-[11px] rounded-[9px] px-[11px] h-[47px] mb-[5px] last:mb-0 text-[14px] font-medium transition-colors ${focusRing} ${
            i === 0
              ? 'bg-[linear-gradient(180deg,rgba(60,70,90,0.55),rgba(30,36,48,0.6))] text-white ring-1 ring-[#8fa8d0]/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]'
              : 'text-[#e3e1dc] hover:bg-white/[0.07] hover:text-white'
          }`}
        >
          <span aria-hidden className={i === 0 ? 'text-[#f1d9a8]' : 'text-[#c9ccd2]'}>
            <NavIcon d={d} />
          </span>
          {label}
        </button>
      ))}
    </nav>
  )
}

export function IconButton({ children, label, className = '', ...rest }: { children: ReactNode; label: string; className?: string } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'>) {
  return (
    <button
      aria-label={label}
      title={label}
      {...rest}
      className={`grid h-[38px] w-[38px] place-items-center rounded-[9px] text-[#ece8e0] transition-[filter,transform] hover:brightness-125 active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:brightness-100 ${focusRing} ${panel} ${className}`}
    >
      {children}
    </button>
  )
}

export const Trophy = () => (
  <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="#f2b544">
    <path d="M6 3h12v3h3v2a5 5 0 0 1-4.6 5A6 6 0 0 1 13 16.6V19h4v2H7v-2h4v-2.4A6 6 0 0 1 7.6 13 5 5 0 0 1 3 8V6h3zm0 5V8H5a3 3 0 0 0 1.3 2.5A6 6 0 0 1 6 8zm12 0a6 6 0 0 1-.3 2.5A3 3 0 0 0 19 8z" />
  </svg>
)
export const CardsIco = () => (
  <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="#e8e4dc" strokeWidth="2">
    <rect x="6" y="5" width="12" height="15" rx="2" />
    <path d="M9 5V3.5h8.5a1.5 1.5 0 0 1 1.5 1.5v12" />
  </svg>
)

/** G5.4: an online player without a live connection. */
export const AwayBadge = () => <span title="Disconnected" className="rounded-[4px] bg-white/10 px-[4px] text-[11px] font-semibold text-[#d6d2ca] ring-1 ring-white/25">away</span>

/** Small award badges (Longest Road / Largest Army) shown on a player card. */
export function AwardBadges({ seat }: { seat: SeatView }) {
  if (!seat.longestRoad && !seat.largestArmy) return null
  return (
    <span className="flex gap-[3px]">
      {seat.longestRoad && <span title="Longest Road (+2)" className="rounded-[4px] bg-[#f2b544]/20 px-[4px] text-[11px] font-bold text-[#f2cf84] ring-1 ring-[#f2b544]/50">LR</span>}
      {seat.largestArmy && <span title="Largest Army (+2)" className="rounded-[4px] bg-[#f2b544]/20 px-[4px] text-[11px] font-bold text-[#f2cf84] ring-1 ring-[#f2b544]/50">LA</span>}
    </span>
  )
}

export const seatLabel = (p: SeatView) =>
  `${p.name}: ${p.vp} victory points, ${p.cards} resource cards, ${p.devCards} development cards${p.longestRoad ? ', Longest Road' : ''}${p.largestArmy ? ', Largest Army' : ''}${p.active ? ', current turn' : ''}${p.away ? ', away (disconnected)' : ''}`

function Players() {
  const { seats } = useGameView()
  return (
    <ul aria-label="Players" className="absolute right-[18px] top-[66px] flex w-[212px] flex-col gap-[7px]">
      {seats.map((p) => (
        <li
          key={p.id}
          aria-label={seatLabel(p)}
          aria-current={p.active ? 'true' : undefined}
          className={`relative flex h-[62px] items-center gap-[12px] overflow-hidden rounded-[8px] pl-[6px] pr-3 transition-transform ${panel} ${p.active ? '-translate-x-[8px]' : ''}`}
          style={{ boxShadow: `inset ${p.active ? 5 : 3}px 0 0 ${p.color}, inset 0 0 0 ${p.active ? 2 : 1}px ${p.color}${p.active ? 'cc' : '55'}, 0 8px 22px rgba(0,0,0,.5)` }}
        >
          <div className={`h-[50px] w-[50px] shrink-0 overflow-hidden rounded-[7px] ring-2 ${p.away ? 'opacity-45 grayscale' : ''}`} style={{ ['--tw-ring-color' as string]: p.color }}>
            <Avatar i={p.avatar} className="h-full w-full" />
          </div>
          <div className="flex-1">
            <div className="mb-[8px] flex items-center gap-[6px] text-[15px] font-semibold leading-none text-white">{p.name}<AwardBadges seat={p} />{p.away && <AwayBadge />}</div>
            <div className="flex items-center gap-[22px] text-[14px] text-[#ece8e0] leading-none">
              <span className="flex items-center gap-[5px]"><Trophy />{p.vp}</span>
              <span className="flex items-center gap-[5px]"><CardsIco />{p.cards}</span>
            </div>
          </div>
          {p.active && <span aria-hidden className="absolute right-[10px] top-[9px] h-[9px] w-[9px] rounded-full bg-[#f2b544] shadow-[0_0_8px_#f2b544]" />}
        </li>
      ))}
    </ul>
  )
}

/** Turn and phase line, announced politely to screen readers. */
export function PhaseBanner({ className = '' }: { className?: string }) {
  const { phase, seats, phaseKind, dice } = useGameView()
  const active = seats.find((x) => x.active)
  // G4.6b: the roll is part of the same announcement as the phase it leads to
  const rolled = dice && active && (phaseKind === 'actions' || phaseKind === 'discard' || phaseKind === 'moveRobber' || phaseKind === 'steal')
    ? `${active.name} rolled ${dice[0] + dice[1]} (${dice[0]} and ${dice[1]}). ` : ''
  return (
    <div role="status" aria-live="polite" className={`pointer-events-none rounded-full px-[18px] py-[7px] text-[15px] font-semibold text-[#f4efe6] ${panel} ${className}`}
      style={active ? { boxShadow: `inset 0 0 0 1.5px ${active.color}aa, 0 8px 22px rgba(0,0,0,.5)` } : undefined}>
      {active && <span aria-hidden className="mr-[8px] inline-block h-[10px] w-[10px] rounded-full align-middle" style={{ background: active.color }} />}
      {rolled && <span className="sr-only">{rolled}</span>}
      {phase}
    </div>
  )
}

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]],
  6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]],
}
function Face({ n, style }: { n: number; style: React.CSSProperties }) {
  return (
    <div className="absolute inset-0 rounded-[9px] bg-[radial-gradient(circle_at_35%_30%,#ffffff,#e9e4da_70%,#cfc8bb)] shadow-[inset_0_0_6px_rgba(0,0,0,0.25)]" style={style}>
      {PIPS[n].map(([x, y], i) => (
        <span key={i} className="absolute h-[16%] w-[16%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_40%_35%,#3a3a3a,#050505)]" style={{ left: `${x}%`, top: `${y}%` }} />
      ))}
    </div>
  )
}
export function Die({ faces, rot, size = 54 }: { faces: [number, number, number]; rot: string; size?: number }) {
  const S = size
  return (
    <div className="relative" style={{ width: S, height: S, perspective: 400 }}>
      <div className="absolute inset-0" style={{ transformStyle: 'preserve-3d', transform: rot }}>
        <Face n={faces[0]} style={{ transform: `translateZ(${S / 2}px)` }} />
        <Face n={faces[1]} style={{ transform: `rotateX(90deg) translateZ(${S / 2}px)` }} />
        <Face n={faces[2]} style={{ transform: `rotateY(90deg) translateZ(${S / 2}px)` }} />
        <Face n={7 - faces[2]} style={{ transform: `rotateY(-90deg) translateZ(${S / 2}px)` }} />
      </div>
    </div>
  )
}

/** A die showing `v` on the front, with consistent top and right faces. */
export const dieFaces = (v: number): [number, number, number] => {
  const adj: Record<number, [number, number]> = { 1: [2, 3], 2: [3, 1], 3: [1, 2], 4: [1, 5], 5: [1, 3], 6: [2, 4] }
  return [v, ...adj[v]]
}

/** Dice from state plus the main action button; the dice bounce on every DICE_ROLLED event. */
export function useDiceAndAction(bounce: (el: HTMLElement) => void) {
  const { dice, primary } = useGameView()
  const store = useGameStore()
  const ref = useRef<HTMLDivElement>(null)
  useGameEvents((events) => {
    if (ref.current && !motion.reduced && events.some((e) => e.type === 'DICE_ROLLED')) bounce(ref.current)
  })
  const act = () => { if (primary.action && primary.player) store.dispatch(primary.player, primary.action) }
  const [a, b] = dice ?? [5, 6]
  return { ref, a, b, rolled: !!dice, primary, act }
}

function DiceArea() {
  const { ref, a, b, rolled, primary, act } = useDiceAndAction((el) =>
    gsap.fromTo(el.children, { y: -18, rotate: -25 }, { y: 0, rotate: 0, duration: 0.7, ease: 'bounce.out', stagger: 0.08 }),
  )
  return (
    <div className="absolute right-[14px] top-[420px] w-[232px]">
      <div ref={ref} aria-label={rolled ? `Dice: ${a} and ${b}, total ${a + b}` : 'Dice not rolled yet'} role="img" className={`relative z-10 mx-auto flex w-[150px] justify-between drop-shadow-[0_10px_8px_rgba(0,0,0,0.55)] transition-opacity ${rolled ? '' : 'opacity-70'}`}>
        <Die faces={dieFaces(a)} rot="rotateX(-24deg) rotateY(-28deg) rotateZ(-4deg)" />
        <Die faces={dieFaces(b)} rot="rotateX(-22deg) rotateY(30deg) rotateZ(6deg)" />
      </div>
      {/* wooden plinth */}
      <div className="relative -mt-[18px] h-[96px] rounded-[28px] bg-[linear-gradient(180deg,#6b4a2c,#3d2817_60%,#2a1b10)] shadow-[0_14px_30px_rgba(0,0,0,0.6),inset_0_2px_0_rgba(255,220,170,0.25),inset_0_-6px_12px_rgba(0,0,0,0.5)] ring-1 ring-black/40">
        <div className="absolute inset-x-[10px] top-[8px] h-[8px] rounded-full bg-[repeating-linear-gradient(90deg,rgba(0,0,0,0.12)_0_6px,rgba(255,255,255,0.03)_6px_14px)]" />
        <button
          onClick={act}
          data-primary-action
          disabled={!primary.action}
          className="absolute left-1/2 top-[30px] outline-none focus-visible:ring-4 focus-visible:ring-white/80 h-[46px] w-[176px] -translate-x-1/2 rounded-full border-2 border-[#ffe7a6] bg-[linear-gradient(180deg,#ffe08a_0%,#f4b33a_45%,#d98a16_100%)] font-display text-[21px] font-semibold text-[#3a2208] shadow-[0_0_18px_rgba(255,190,70,0.7),0_4px_0_#8a5410,inset_0_2px_0_rgba(255,255,255,0.7)] transition-[transform,filter] hover:scale-[1.03] active:translate-y-[2px] disabled:cursor-default disabled:grayscale-[0.7] disabled:brightness-75 disabled:hover:scale-100 disabled:text-[18px]"
        >
          {primary.label}
        </button>
      </div>
    </div>
  )
}

export const RESOURCES: { key: Resource; name: string; Icon: typeof Logs; bg: string }[] = [
  { key: 'lumber', name: 'Wood', Icon: Logs, bg: 'from-[#5f8a32] to-[#2f4a18]' },
  { key: 'brick', name: 'Brick', Icon: Brick, bg: 'from-[#b9522c] to-[#6a2512]' },
  { key: 'wool', name: 'Wool', Icon: SheepIcon, bg: 'from-[#8fc04e] to-[#4a7a22]' },
  { key: 'grain', name: 'Grain', Icon: WheatIcon, bg: 'from-[#f0b43c] to-[#b7741a]' },
  { key: 'ore', name: 'Ore', Icon: Ore, bg: 'from-[#8a96a8] to-[#4a5363]' },
]
const RES_ICON = Object.fromEntries(RESOURCES.map((r) => [r.key, r.Icon])) as Record<Resource, typeof Logs>

/** The shown hand: counts by resource plus an accessible owner label. */
export function useHand() {
  const { hand, seats } = useGameView()
  const owner = seats.find((x) => x.id === hand.owner)!
  // G4.8a: behind the pass-the-device screen the previous or next hand is never rendered
  if (usePrivacy().covered) return { counts: { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 }, ownerName: '', ownerColor: '#888' }
  return { counts: hand.counts, ownerName: owner.name, ownerColor: owner.color }
}

/** Clears the build choice and closes the trade/dev panels when the turn or phase moves on, and on Escape. Mount once per HUD. */
export function usePlacementAutoReset() {
  const { phaseKind, active, turn } = useGameView()
  useEffect(() => {
    if (phaseKind !== 'actions') { setPlacementMode(null); setTradeOpen(false) }
    if (phaseKind !== 'actions' && phaseKind !== 'preRoll') setDevOpen(false) // knights may be played before the roll
  }, [phaseKind])
  useEffect(() => { setPlacementMode(null); setPanel(null) }, [active, turn])
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPlacementMode(null); setPanel(null) } }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [])
}

function ResourceCards() {
  const { counts, ownerName } = useHand()
  return (
    <div className="absolute bottom-0 left-1/2 -translate-x-[54%]">
      {/* wooden tray */}
      <div className="absolute -bottom-[30px] left-1/2 h-[64px] w-[700px] -translate-x-1/2 rounded-[40px_40px_0_0] bg-[linear-gradient(180deg,#5c3d22,#2c1c10)] shadow-[0_-6px_20px_rgba(0,0,0,0.5),inset_0_2px_0_rgba(255,210,160,0.2)]" />
      <ul aria-label={`${ownerName}'s resources`} className="relative flex gap-[8px] pb-[12px]">
        {RESOURCES.map(({ key, name, Icon, bg }, i) => { const n = counts[key]; return (
          <li
            key={i}
            aria-label={`${name}: ${n}`}
            title={`${name}: ${n}`}
            className="relative h-[96px] w-[88px] rounded-[9px] p-[3px] bg-[linear-gradient(180deg,#ffe2a0,#b98a3a_50%,#f2cf84)] shadow-[0_10px_22px_rgba(0,0,0,0.6)] transition-transform hover:-translate-y-[4px]"
          >
            <div className={`relative h-full w-full overflow-hidden rounded-[7px] bg-gradient-to-b ${bg} shadow-[inset_0_0_14px_rgba(0,0,0,0.45)]`}>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.28),transparent_60%)]" />
              <Icon aria-hidden className="absolute left-1/2 top-[54%] w-[78px] -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_4px_3px_rgba(0,0,0,0.45)]" />
              <span aria-hidden className="absolute left-[4px] top-[4px] grid h-[22px] w-[22px] place-items-center rounded-[5px] bg-[#1d1a16]/85 text-[14px] font-bold text-white ring-1 ring-[#f2cf84]/60">
                {n}
              </span>
              {n === 0 && <div aria-hidden className="absolute inset-0 bg-black/45" />}
            </div>
          </li>
        )})}
      </ul>
    </div>
  )
}

export const Arrow = () => (
  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)
const RoadIco = () => (
  <svg viewBox="0 0 24 24" className="h-[24px] w-[24px]"><path d="M4 20 20 4" stroke="#d9cbb0" strokeWidth="3.4" strokeLinecap="round" /><path d="M4 20 20 4" stroke="#7a6a52" strokeWidth="1" strokeDasharray="2 3" /></svg>
)
const HouseIco = ({ city }: { city?: boolean }) => (
  <svg viewBox="0 0 24 24" className="h-[26px] w-[26px]">
    <path d="M4 11 10 6l6 5v9H4z" fill="#f2deb0" />
    <path d="M3 11.5 10 5.5l7 6" stroke="#b98a3a" strokeWidth="1.6" fill="none" />
    {city && <path d="M14 8 18.5 4 23 8v12h-9z" fill="#e6c98c" />}
    <rect x="8.5" y="14" width="3" height="6" fill="#9a6b2a" />
  </svg>
)

const BUILD_ICON: Record<BuildKind, ReactNode> = {
  road: <RoadIco />,
  settlement: <HouseIco />,
  city: <HouseIco city />,
  dev: <span className="grid h-[26px] w-[24px] place-items-center rounded-[4px] border border-[#d9cbb0]/70 text-[14px] font-bold text-[#efe6d4]">?</span>,
}
const BUILD_NAME: Record<BuildKind, string> = { road: 'Road', settlement: 'Settlement', city: 'City', dev: 'Development card' }

/**
 * Rows of the build menu (cost icons + arrow); shared by the desktop panel and the compact popover.
 * Road/settlement/city choose a placement on the board; the dev card is bought at once. A row is
 * enabled exactly when the engine allows that build; otherwise its tooltip says why.
 */
export function BuildRows({ onChosen }: { onChosen?: () => void }) {
  const { build, primary } = useGameView()
  const store = useGameStore()
  const mode = usePlacementMode()
  const choose = (kind: BuildKind) => {
    if (kind === 'dev') {
      if (primary.player) store.dispatch(primary.player, { type: 'BUY_DEV' })
    } else setPlacementMode(mode === kind ? null : kind)
    onChosen?.()
  }
  return (
    <>
      {build.map(({ kind, enabled, reason, cost }) => {
        const selected = mode === kind
        const label = `${kind === 'dev' ? 'Buy' : 'Build'} ${BUILD_NAME[kind]}: ${costText(cost)}${reason ? ` (${reason})` : ''}`
        const icons = (Object.entries(cost) as [Resource, number][]).flatMap(([r, n]) => Array.from({ length: n }, (_, k) => [r, k] as const))
        return (
          <button
            key={kind}
            aria-label={label}
            aria-pressed={kind === 'dev' ? undefined : selected}
            title={label}
            disabled={!enabled}
            onClick={() => choose(kind)}
            className={`group flex h-[46px] w-full items-center gap-[12px] rounded-[8px] border-b border-white/5 px-[6px] text-left transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent ${selected ? 'bg-[#f2b544]/15 ring-1 ring-[#f2b544]/70' : ''} ${focusRing}`}
          >
            <span aria-hidden className="w-[28px]">{BUILD_ICON[kind]}</span>
            <span aria-hidden className="flex flex-1 items-center gap-[2px]">
              {icons.map(([r, k]) => { const I = RES_ICON[r]; return <span key={r + k} className="block h-[24px] w-[28px] [&>svg]:h-full [&>svg]:w-full"><I /></span> })}
            </span>
            <span aria-hidden className="text-[#ece8e0] transition-transform group-hover:translate-x-[2px]"><Arrow /></span>
          </button>
        )
      })}
    </>
  )
}

function BuildPanel() {
  return (
    <section aria-labelledby="build-title" className={`absolute bottom-[42px] right-[16px] w-[246px] rounded-[12px] px-[10px] pb-[8px] pt-[12px] ${panel}`}>
      <h2 id="build-title" className="mb-[8px] px-[6px] font-display text-[20px] font-medium text-[#f4efe6]">Build</h2>
      <BuildRows />
    </section>
  )
}

const TradeIco = ({ size }: { size: number }) => (
  <svg aria-hidden viewBox="0 0 24 24" style={{ width: size, height: size }} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h14l-4-4" /><path d="M20 16H6l4 4" /></svg>
)

/** Opens the bank/port trade panel (G4.4d); enabled in the active player's `actions` phase. */
export function TradeButton({ className = '', icon = 24 }: { className?: string; icon?: number }) {
  const { bank } = useGameView()
  const open = useTradeOpen()
  const label = `Trade with the bank${bank.reason ? ` (${bank.reason})` : ''}`
  return (
    <IconButton label={label} aria-pressed={open} disabled={!bank.open} onClick={() => setTradeOpen(!open)}
      className={`${open ? 'ring-2 ring-[#f2b544]' : ''} ${className}`}>
      <TradeIco size={icon} />
    </IconButton>
  )
}

const CardsStackIco = ({ size }: { size: number }) => (
  <svg aria-hidden viewBox="0 0 24 24" style={{ width: size, height: size }} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><rect x="8" y="4" width="11" height="15" rx="2" /><path d="M5 7.5v11A1.5 1.5 0 0 0 6.5 20H15" /><path d="M13.5 9l1 2 2 .3-1.5 1.4.4 2-1.9-1-1.9 1 .4-2L10.5 11.3l2-.3z" fill="currentColor" strokeWidth="1" /></svg>
)

/** Opens the development cards panel (G4.4e); a badge shows how many cards the active player holds. */
export function DevButton({ className = '', icon = 24 }: { className?: string; icon?: number }) {
  const { dev } = useGameView()
  const open = useDevOpen()
  const label = `Development cards: ${dev.total}${dev.canOpen ? '' : ' (Not now)'}`
  return (
    <div className="relative shrink-0">
      <IconButton label={label} aria-pressed={open} disabled={!dev.canOpen} onClick={() => setDevOpen(!open)}
        className={`${open ? 'ring-2 ring-[#f2b544]' : ''} ${className}`}>
        <CardsStackIco size={icon} />
      </IconButton>
      {dev.total > 0 && <span aria-hidden className="pointer-events-none absolute -right-[5px] -top-[5px] grid h-[19px] min-w-[19px] place-items-center rounded-full bg-[#f2b544] px-[4px] text-[11px] font-bold text-[#2a1a06] shadow-[0_1px_4px_rgba(0,0,0,.5)]">{dev.total}</span>}
    </div>
  )
}

function BottomLeft() {
  return (
    <div className="absolute bottom-[16px] left-[22px] flex gap-[12px]">
      <TradeButton className="!h-[52px] !w-[52px] !rounded-[12px]" />
      <DevButton className="!h-[52px] !w-[52px] !rounded-[12px]" />
      <IconButton label="Undo" className="!h-[52px] !w-[52px] !rounded-[12px]">
        <svg aria-hidden viewBox="0 0 24 24" className="h-[24px] w-[24px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></svg>
      </IconButton>
      <div className="relative">
        <IconButton label="Chat (new messages)" className="!h-[52px] !w-[52px] !rounded-[12px]">
          <svg aria-hidden viewBox="0 0 24 24" className="h-[24px] w-[24px]" fill="currentColor"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.6 3.4 6L4.5 21l4.4-2.3c1 .2 2 .3 3.1.3 5.5 0 10-3.6 10-8s-4.5-8-10-8zM7.5 12.3a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6zm4.5 0a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6zm4.5 0a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6z" /></svg>
        </IconButton>
        <span aria-hidden className="absolute right-[3px] top-[3px] h-[9px] w-[9px] rounded-full bg-[#f2a33a] shadow-[0_0_6px_#f2a33a]" />
      </div>
    </div>
  )
}

export const HUD = memo(function HUD() {
  const s = useHudScale()
  const { compact } = useViewport()
  usePlacementAutoReset()
  if (compact) return <CompactHUD />
  return (
    <div className="pointer-events-none fixed inset-0 z-[20] select-none overflow-hidden font-ui">
      <div
        className="absolute left-0 top-0 origin-top-left [&_button]:pointer-events-auto [&_nav]:pointer-events-auto"
        style={{ width: `${100 / s}vw`, height: `${100 / s}vh`, transform: `scale(${s})` }}
      >
        <Brand />
        <Nav />
        <div className="absolute right-[18px] top-[14px] flex gap-[10px]">
          <IconButton label="Fullscreen">
            <svg aria-hidden viewBox="0 0 24 24" className="h-[20px] w-[20px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
          </IconButton>
          <IconButton label="Help">
            <span aria-hidden className="text-[20px] font-bold">?</span>
          </IconButton>
        </div>
        <PhaseBanner className="absolute left-1/2 top-[14px] -translate-x-1/2 whitespace-nowrap" />
        {/* bottom-left corner above the action buttons: notices never cover tokens, ports or the HUD */}
        <Notices align="start" className="absolute bottom-[84px] left-[22px] w-[250px] justify-end" />
        <Players />
        <DiceArea />
        <ResourceCards />
        <BuildPanel />
        <BottomLeft />
        <GameDialogs className="absolute bottom-[132px] left-1/2 -translate-x-[54%]" />
        <BoardPicker className="absolute inset-x-0 bottom-[132px]" />
        <Victory />
      </div>
    </div>
  )
})
