import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import gsap from 'gsap'
import { Avatar, Brick, HexLogo, Logs, Ore, SheepIcon, WheatIcon } from './icons'
import { RES_CARD, RES_CARD_FRAME, ResourceCardFace } from './cards/ResourceCard'
import { DevCardBack } from './cards/DevCardArt'
import { BRAND_NAME } from '../brand'
import { motion } from '../scene/motion'
import { useViewport } from './layout'
import { CompactHUD } from './CompactHUD'
import { GameDialogs } from './Dialogs'
import { Notices } from './Notices'
import { GameLog } from './LogPanel'
import { Victory } from './Victory'
import { usePrivacy } from './PassDevice'
import { TurnClock } from './TurnClock'
import { BoardPicker } from './BoardPicker'
import { SetupConfirm } from './SetupConfirm'
import { costText, useGameView, type BuildKind, type SeatView } from './gameView'
import { changeDraft, clearDraft, draftCovered, draftEmpty, getDraft, setDevOpen, setPanel, setBuildGoal, setDraft, setPlacementMode, setTradeOpen, useDevOpen, type PlacementMode, usePanel, usePendingCorner, usePlacementMode, useTradeDraft, useTradeOpen } from '../store/ui'
import { RESOURCE_ORDER, type Action, type PlayerId, type Resource } from '../game'
import { useGame, useGameStore, useGameEvents, useOnline } from '../store/GameProvider'
import { openMenu, useBeforeGame } from './StartMenu'
import { BOARD_MODE } from '../scene/board'
import { affordable, shortfall, tradesText, type Shortfall } from './tradePlan'
import { HelpButton, useShortcuts } from './shortcuts'
import { deltaText, handDiff, hintSeen, markHintSeen, type HandCounts } from './handDelta'
import { L, count } from './locale'
import { awardName, awardShort, pieceName, resName, resTitle } from './words'

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

/** Frosted glass for the right column (players, build): the board shows through, blurred, under a light rim. */
export const glass =
  'bg-[linear-gradient(180deg,rgba(120,138,158,0.30),rgba(22,28,38,0.55))] backdrop-blur-lg border border-white/25 shadow-[0_12px_32px_rgba(0,0,0,0.40),inset_0_1px_0_rgba(255,255,255,0.28)] [text-shadow:0_1px_2px_rgba(0,0,0,0.55)]'

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

export function IconButton({ children, label, className = '', ref, ...rest }: { children: ReactNode; label: string; className?: string; ref?: React.Ref<HTMLButtonElement> } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'>) {
  return (
    <button
      ref={ref}
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
/** G9.2: a development card (a card with a star) and a played knight (a sword), for the player cards. */
export const DevCardIco = () => (
  <svg aria-hidden viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="#e7c27a" strokeWidth="2"><rect x="6" y="4" width="12" height="16" rx="2" /><path d="M12 8.2l1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z" fill="#e7c27a" strokeWidth="0.8" /></svg>
)
export const CardsIco = () => (
  <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="#e8e4dc" strokeWidth="2">
    <rect x="6" y="5" width="12" height="15" rx="2" />
    <path d="M9 5V3.5h8.5a1.5 1.5 0 0 1 1.5 1.5v12" />
  </svg>
)

/** G5.4: an online player without a live connection; G5.5: one the server is playing for (absent). */
export const AwayBadge = ({ auto = false }: { auto?: boolean }) => auto
  ? <span title={L('Played automatically until they act again', 'Играет автоматически, пока игрок не вернётся')} className="rounded-[4px] bg-[#f2b544]/15 px-[4px] text-[11px] font-semibold text-[#f2cf84] ring-1 ring-[#f2b544]/40">{L('auto', 'авто')}</span>
  : <span title={L('Disconnected', 'Нет связи')} className="rounded-[4px] bg-white/10 px-[4px] text-[11px] font-semibold text-[#d6d2ca] ring-1 ring-white/25">{L('away', 'нет связи')}</span>

export const RoadAwardIco = ({ className = 'h-[15px] w-[15px]' }: { className?: string }) => (
  <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M7 21l3-18M17 21L14 3" /><path d="M12 5v2.5M12 11v2.5M12 17v2.5" /></svg>
)
export const ArmyAwardIco = ({ className = 'h-[15px] w-[15px]' }: { className?: string }) => (
  <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /><path d="M9.5 9.5l5 5M14.5 9.5l-5 5" strokeLinecap="round" /></svg>
)
const AWARD_ICO = { longestRoad: RoadAwardIco, largestArmy: ArmyAwardIco }
const awardsOf = (seat: SeatView) => (['longestRoad', 'largestArmy'] as const).filter((a) => seat[a])

/** Compact award chips (icon and +2) for the small player cards; the full name is the title. */
export function AwardBadges({ seat }: { seat: SeatView }) {
  const list = awardsOf(seat)
  if (!list.length) return null
  return (
    <span className="ml-[2px] flex gap-[3px]">
      {list.map((a) => { const I = AWARD_ICO[a]; return (
        <span key={a} title={`${awardName(a)} (+2)`} className="flex items-center gap-[2px] rounded-[4px] bg-[#f2b544]/20 px-[3px] text-[11px] font-bold text-[#f2cf84] ring-1 ring-[#f2b544]/50"><I className="h-[12px] w-[12px]" /><span className="hidden min-[560px]:inline">+2</span></span>
      ) })}
    </span>
  )
}

/** G9.6: awards spelled out on the desktop player card, one line each: icon, name, +2. */
function AwardLines({ seat }: { seat: SeatView }) {
  const list = awardsOf(seat)
  if (!list.length) return null
  return (
    <div data-award-lines className="mt-[6px] flex flex-col gap-[3px] text-[12px] font-semibold leading-tight text-[#f2cf84]">
      {list.map((a) => { const I = AWARD_ICO[a]; return (
        <span key={a} data-award={a} title={`${awardName(a)} (+2)`} className="flex items-center gap-[5px]"><I className="h-[14px] w-[14px] shrink-0" /><span className="truncate">{awardShort(a)}</span><span className="text-[#ffe08a]">+2</span></span>
      ) })}
    </div>
  )
}

export const seatLabel = (p: SeatView) => L(
  `${p.name}: ${p.vp} of ${p.win} victory points, ${p.cards} resource cards, ${p.devCards} development cards, ${p.knights} ${p.knights === 1 ? 'knight' : 'knights'} played, longest road ${p.road}${p.longestRoad ? ', Longest Road' : ''}${p.largestArmy ? ', Largest Army' : ''}${p.active ? ', current turn' : ''}${p.away ? ', away (disconnected)' : ''}${p.auto ? ', played automatically' : ''}`,
  `${p.name}: ${p.vp} из ${p.win} победных очков, ${count(p.cards, '', '', 'карта ресурсов', 'карты ресурсов', 'карт ресурсов')}, ${count(p.devCards, '', '', 'карта развития', 'карты развития', 'карт развития')}, сыграно рыцарей: ${p.knights}, длина дороги: ${p.road}${p.longestRoad ? `, ${awardName('longestRoad')}` : ''}${p.largestArmy ? `, ${awardName('largestArmy')}` : ''}${p.active ? ', сейчас ходит' : ''}${p.away ? ', нет связи' : ''}${p.auto ? ', играет автоматически' : ''}`,
)

/** What the bank still holds: each resource and the development-card deck (online the deck is a count). */
function BankStock({ className = '' }: { className?: string }) {
  const bank = useGame((s) => s.bank)
  const deck = useGame((s) => s.deck.length)
  const label = L(`Bank: ${RESOURCE_ORDER.map((r) => `${resName(r)} ${bank[r]}`).join(', ')}, development cards ${deck}`,
    `Банк: ${RESOURCE_ORDER.map((r) => `${resName(r)} ${bank[r]}`).join(', ')}, карты развития ${deck}`)
  return (
    <div role="group" aria-label={label} data-bank-stock className={`flex items-center gap-[8px] rounded-[14px] py-[5px] pl-[10px] pr-[12px] ${glass} ${className}`}>
      <span aria-hidden className="text-[13px] font-semibold text-[#e9e4da]">{L('Bank', 'Банк')}</span>
      {RESOURCE_ORDER.map((r) => { const I = RES_ICON[r]; return (
        <span key={r} aria-hidden title={`${resName(r)}: ${bank[r]}`} className={`flex items-center gap-[2px] text-[14px] font-bold text-white ${bank[r] ? '' : 'opacity-45'}`}>
          <span className="block h-[20px] w-[22px] [&>svg]:h-full [&>svg]:w-full"><I /></span>{bank[r]}
        </span>
      ) })}
      <span aria-hidden title={L(`Development cards: ${deck}`, `Карты развития: ${deck}`)} className={`flex items-center gap-[3px] border-l border-white/20 pl-[8px] text-[14px] font-bold text-white ${deck ? '' : 'opacity-45'}`}><DevCardIco />{deck}</span>
    </div>
  )
}

function Players() {
  const { seats } = useGameView()
  return (
    <ul aria-label={L('Players', 'Игроки')} className="mr-[4px] flex w-[228px] shrink-0 flex-col gap-[7px]">
      {seats.map((p) => (
        <li
          key={p.id}
          aria-label={seatLabel(p)}
          aria-current={p.active ? 'true' : undefined}
          className={`relative flex min-h-[62px] items-center gap-[10px] overflow-hidden rounded-[14px] py-[6px] pl-[6px] pr-[10px] transition-transform ${glass} ${p.active ? '-translate-x-[8px]' : ''}`}
          style={{
            // tinted in the seat colour; the active seat glows
            backgroundImage: `linear-gradient(180deg, ${p.color}${p.active ? '55' : '38'}, rgba(22,28,38,.62) 85%)`,
            boxShadow: `inset 0 0 0 ${p.active ? 2 : 1}px ${p.color}${p.active ? 'dd' : '77'}, inset 0 1px 0 rgba(255,255,255,.28), 0 10px 26px rgba(0,0,0,.4)${p.active ? `, 0 0 16px ${p.color}99` : ''}`,
          }}
        >
          <div className={`h-[50px] w-[50px] shrink-0 overflow-hidden rounded-full ring-2 ${p.away ? 'opacity-45 grayscale' : ''}`} style={{ ['--tw-ring-color' as string]: p.color }}>
            <Avatar i={p.avatar} className="h-full w-full" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-[8px] flex items-center gap-[6px] text-[16px] font-bold leading-none">
              <span className="min-w-0 truncate" style={{ color: `color-mix(in srgb, ${p.color} 62%, white)` }}>{p.name}</span>{p.auto ? <AwayBadge auto /> : p.away && <AwayBadge />}
              <span aria-hidden title={L('Victory points', 'Победные очки')} className="ml-auto flex shrink-0 items-center gap-[3px] text-[14px] font-semibold text-[#ece8e0]"><Trophy />{p.vp}<span className="-ml-[1px] text-[11px] text-[#c4bfb6]">/{p.win}</span></span>
            </div>
            {/* army = knights played, road = longest road length; gold while the seat holds that award */}
            <div aria-hidden className="flex items-center gap-[7px] text-[14px] text-[#ece8e0] leading-none">
              <span title={L('Resource cards', 'Карты ресурсов')} className="flex items-center gap-[3px]"><CardsIco />{p.cards}</span>
              <span title={L('Development cards in hand', 'Карты развития на руке')} className="flex items-center gap-[3px]"><DevCardIco />{p.devCards}</span>
              <span className="h-[14px] w-px bg-white/20" />
              <span data-army title={L(`Army: ${p.knights} knights played (Largest Army from 3)`, `Войско: сыграно рыцарей — ${p.knights} (самое большое войско — от 3)`)}
                className={`flex items-center gap-[3px] ${p.largestArmy ? 'font-bold text-[#ffd77a]' : p.knights ? '' : 'opacity-45'}`}><ArmyAwardIco className="h-[16px] w-[16px]" />{p.knights}</span>
              <span data-road title={L(`Longest road: ${p.road} (Longest Road from 5)`, `Дорога: длина ${p.road} (самая длинная дорога — от 5)`)}
                className={`flex items-center gap-[3px] ${p.longestRoad ? 'font-bold text-[#ffd77a]' : p.road ? '' : 'opacity-45'}`}><RoadAwardIco className="h-[16px] w-[16px]" />{p.road}</span>
            </div>
            <AwardLines seat={p} />
          </div>
          {p.active && <span aria-hidden className="absolute left-[45px] top-[7px] h-[11px] w-[11px] rounded-full bg-[#f2b544] shadow-[0_0_8px_#f2b544] ring-2 ring-black/60" />}
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
    ? L(`${active.name} rolled ${dice[0] + dice[1]} (${dice[0]} and ${dice[1]}). `, `${active.name}: выпало ${dice[0] + dice[1]} (${dice[0]} и ${dice[1]}). `) : ''
  return (
    <div role="status" aria-live="polite" className={`pointer-events-none flex items-center rounded-full px-[18px] py-[7px] text-[15px] font-semibold text-[#f4efe6] ${panel} ${className}`}
      style={active ? { boxShadow: `inset 0 0 0 1.5px ${active.color}aa, 0 8px 22px rgba(0,0,0,.5)` } : undefined}>
      {active && <span aria-hidden className="mr-[8px] inline-block h-[10px] w-[10px] shrink-0 rounded-full" style={{ background: active.color }} />}
      {rolled && <span className="sr-only">{rolled}</span>}
      {/* a long phase line shortens; the turn clock after it always stays visible */}
      <span className="min-w-0 truncate">{phase}</span>
      <TurnClock />
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
// A7: the second die is red with white pips (owner's choice), so the two dice read as a pair at a glance
const DIE_LOOK = {
  white: { face: 'bg-[radial-gradient(circle_at_35%_30%,#ffffff,#ece7dd_62%,#d3ccbf)]', pip: 'bg-[radial-gradient(circle_at_40%_35%,#3a3a3a,#050505)] shadow-[0_0.5px_0_rgba(255,255,255,0.7)]', core: '#cfc6b6' },
  red: { face: 'bg-[radial-gradient(circle_at_35%_30%,#e2584a,#b8281f_62%,#8a1a14)]', pip: 'bg-[radial-gradient(circle_at_40%_35%,#ffffff,#e8e0d4)] shadow-[0_0.5px_0_rgba(0,0,0,0.35)]', core: '#7e1812' },
} as const
type DieColor = keyof typeof DIE_LOOK
function Face({ n, style, color }: { n: number; style: React.CSSProperties; color: DieColor }) {
  const look = DIE_LOOK[color]
  return (
    <div className={`absolute inset-0 ${look.face} shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45),inset_0_-2px_5px_rgba(60,30,10,0.3)]`} style={style}>
      {PIPS[n].map(([x, y], i) => (
        <span key={i} className={`absolute h-[16%] w-[16%] -translate-x-1/2 -translate-y-1/2 rounded-full ${look.pip}`} style={{ left: `${x}%`, top: `${y}%` }} />
      ))}
    </div>
  )
}
// A7: rounded edges. Each face's corners are cut (radius = 22% of the die); a slightly inset, square,
// darker core behind the faces fills the cut corners, so the edges read as rounded instead of open.
const DIE_R = 0.22
const DIE_CORE = 0.1
export function Die({ faces, rot, size = 54, color = 'white' }: { faces: [number, number, number]; rot: string; size?: number; color?: DieColor }) {
  const S = size
  const face = (t: string): React.CSSProperties => ({ transform: t, borderRadius: S * DIE_R })
  const core = (t: string): React.CSSProperties => ({ transform: t, background: DIE_LOOK[color].core })
  const z = S / 2, zc = S / 2 - S * DIE_CORE
  return (
    <div className="relative" style={{ width: S, height: S, perspective: 400 }}>
      <div className="absolute inset-0" style={{ transformStyle: 'preserve-3d', transform: rot }}>
        <div className="absolute inset-0" style={core(`translateZ(${zc}px)`)} />
        <div className="absolute inset-0" style={core(`rotateX(90deg) translateZ(${zc}px)`)} />
        <div className="absolute inset-0" style={core(`rotateY(90deg) translateZ(${zc}px)`)} />
        <div className="absolute inset-0" style={core(`rotateY(-90deg) translateZ(${zc}px)`)} />
        <Face color={color} n={faces[0]} style={face(`translateZ(${z}px)`)} />
        <Face color={color} n={faces[1]} style={face(`rotateX(90deg) translateZ(${z}px)`)} />
        <Face color={color} n={faces[2]} style={face(`rotateY(90deg) translateZ(${z}px)`)} />
        <Face color={color} n={7 - faces[2]} style={face(`rotateY(-90deg) translateZ(${z}px)`)} />
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

/** G9.2: the last roll's total on a small token between the dice (red for a seven). */
export function DiceSum({ total, className = '', small = false }: { total: number; className?: string; small?: boolean }) {
  return (
    <span aria-hidden data-dice-sum className={`grid place-items-center rounded-full border-2 font-display font-bold leading-none shadow-[0_3px_8px_rgba(0,0,0,.55)] ${small ? 'h-[22px] min-w-[22px] px-[3px] text-[13px]' : 'h-[34px] min-w-[34px] px-[4px] text-[20px]'} ${total === 7 ? 'border-[#ffd2c8] bg-[#b8281f] text-white' : 'border-[#ffe7a6] bg-[#2a1b10] text-[#ffe08a]'} ${className}`}>
      {total}
    </span>
  )
}

function DiceArea() {
  const { ref, a, b, rolled, primary, act } = useDiceAndAction((el) =>
    gsap.fromTo(el.children, { y: -18, rotate: -25 }, { y: 0, rotate: 0, duration: 0.7, ease: 'bounce.out', stagger: 0.08 }),
  )
  return (
    <div className="relative mt-[22px] w-[232px] shrink-0">
      <div ref={ref} aria-label={rolled ? L(`Dice: ${a} and ${b}, total ${a + b}`, `Кубики: ${a} и ${b}, сумма ${a + b}`) : L('Dice not rolled yet', 'Кубики ещё не брошены')} role="img" className={`relative z-10 mx-auto flex w-[150px] justify-between drop-shadow-[0_10px_8px_rgba(0,0,0,0.55)] transition-opacity ${rolled ? '' : 'opacity-70'}`}>
        <Die faces={dieFaces(a)} rot="rotateX(-24deg) rotateY(-28deg) rotateZ(-4deg)" />
        <Die faces={dieFaces(b)} rot="rotateX(-22deg) rotateY(30deg) rotateZ(6deg)" color="red" />
      </div>
      {/* G9.2: the roll as a number, so nobody has to count pips; a sibling of the dice, which gsap animates */}
      {rolled && <DiceSum total={a + b} className="absolute left-1/2 -top-[22px] z-20 -translate-x-1/2" />}
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
  if (usePrivacy().covered) return { counts: { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 }, owner: null, ownerName: '', ownerColor: '#888' }
  return { counts: hand.counts, owner: hand.owner, ownerName: owner.name, ownerColor: owner.color }
}

/**
 * G7.2: the change in the shown hand since the last render that showed the same owner, kept for
 * 2.5 s ("+2 grain", "−4 wool"). It covers every way a hand changes (roll, trade, build, discard,
 * robbery, cards) because it compares counts. A new owner (hot-seat hand-over, a discard prompt),
 * the pass screen or a new store generation (a loaded or resumed game, an online resync) resets the
 * baseline, so one player's change is never shown on another's hand and a jump is never a "gain".
 */
function useHandDelta(counts: HandCounts, owner: PlayerId | null): { d: Partial<HandCounts>; seq: number } | null {
  const gen = useGameStore().generation()
  const prev = useRef<{ owner: PlayerId; gen: number; counts: HandCounts } | null>(null)
  const [delta, setDelta] = useState<{ d: Partial<HandCounts>; owner: PlayerId; seq: number } | null>(null)
  useEffect(() => {
    const p = prev.current
    prev.current = owner ? { owner, gen, counts } : null
    if (!owner || !p || p.owner !== owner || p.gen !== gen) { setDelta(null); return }
    const d = handDiff(p.counts, counts)
    if (d) setDelta((x) => ({ d, owner, seq: (x?.seq ?? 0) + 1 }))
  }, [counts, owner, gen])
  useEffect(() => {
    if (!delta) return
    const t = setTimeout(() => setDelta(null), 2500)
    return () => clearTimeout(t)
  }, [delta])
  return delta && delta.owner === owner ? delta : null
}

/**
 * G7.6: in setup the board is the only thing to do, so the tools (hand, Build, Trade, cards) are set
 * back and this one visible line says why, instead of a "Not now" in each control's tooltip. The
 * disabled Trade and cards buttons point to it with aria-describedby.
 */
export const SETUP_NOTE_ID = 'setup-note'
export function useSetup() { return useGameView().phaseKind === 'setup' }
/** Classes that set a tool back during setup (dimmed, still readable). */
export const setBack = (on: boolean) => `transition-[filter] duration-300 ${on ? 'brightness-[.62] saturate-[.45]' : ''}` // no opacity: panels stay solid
export function SetupNote({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  const setup = useSetup()
  const covered = usePrivacy().covered // hooks before any early return
  const step = useGame((s) => (s.phase.kind === 'setup' ? s.phase.step : null))
  const previewing = usePendingCorner() !== null // G10.2: the confirm panel takes this place and says the corner's value
  if (!setup || covered || previewing) return null
  // G9.5: while a settlement is placed, the note says what the rings mean (a value legend)
  if (step === 'settlement') return (
    <p id={SETUP_NOTE_ID} data-setup-note className={`pointer-events-none flex items-center gap-[8px] whitespace-nowrap rounded-full px-[12px] py-[5px] text-[13px] font-medium text-[#f4efe6] ring-1 ring-white/15 ${panel} ${className}`}>
      <span aria-hidden className="flex items-center gap-[3px]">
        <span className="h-[8px] w-[8px] rounded-full border-2 border-[#9a958c]" />
        <span className="h-[11px] w-[11px] rounded-full border-2 border-[#fff6dc]" />
        <span className="h-[15px] w-[15px] rounded-full border-[3px] border-[#ffc23d]" />
      </span>
      {compact
        ? L('Ring = dots on the numbers around · tap to check', 'Кольцо = точки на числах · тап — подробнее')
        : L('Ring = the dots on the numbers around a corner: more dots, more often it pays; gold is the most. Click a corner to see its tiles.', 'Кольцо — это точки на числах вокруг угла: больше точек — чаще доход; золотое — больше всех. Клик по углу покажет его гексы.')}
    </p>
  )
  return (
    <p id={SETUP_NOTE_ID} data-setup-note className={`pointer-events-none whitespace-nowrap rounded-full px-[12px] py-[5px] text-[13px] font-medium text-[#f4efe6] ring-1 ring-white/15 ${panel} ${className}`}>
      {compact
        ? L('Building, trading and cards start after setup', 'Стройка, торговля и карты — после расстановки')
        : L('Setup: place on the board. Building, trading and cards start after it.', 'Расстановка: ставьте на поле. Стройка, торговля и карты — после неё.')}
    </p>
  )
}

/**
 * G7.2: a one-line hint above the hand, once per device: on the first own turn where a trade is
 * possible, say that clicking a card puts it in a trade. It stays for that turn until a card is
 * chosen or a panel opens. Never behind the pass screen.
 */
export function HandHint({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  const { bank } = useGameView()
  const { counts, owner } = useHand()
  const draft = useTradeDraft()
  const panelOpen = usePanel() !== null
  const [stage, setStage] = useState<'unseen' | 'showing' | 'done'>(() => (hintSeen() ? 'done' : 'unseen'))
  const eligible = !!owner && bank.open && RESOURCE_ORDER.some((r) => counts[r] > 0) && draftEmpty(draft) && !panelOpen
  useEffect(() => {
    if (stage === 'unseen' && eligible) { markHintSeen(); setStage('showing') }
    else if (stage === 'showing' && !eligible) setStage('done')
  }, [stage, eligible])
  if (stage !== 'showing' || !eligible) return null
  return (
    <p data-hand-hint className={`pointer-events-none whitespace-nowrap rounded-full px-[12px] py-[5px] text-[13px] font-medium text-[#f4efe6] ring-1 ring-[#f2cf84]/50 ${panel} animate-[notice-in_.22s_ease-out] ${className}`}>
      {L(`Tip: ${compact ? 'tap' : 'click'} a card to put it in a trade`, `Совет: ${compact ? 'коснитесь карты' : 'нажмите на карту'}, чтобы предложить её в обмен`)}
    </p>
  )
}

/** Clears the build choice and closes the trade/dev panels when the turn or phase moves on, and on Escape. Mount once per HUD. */
export function usePlacementAutoReset() {
  const { phaseKind, active, turn, hand } = useGameView()
  useEffect(() => {
    if (phaseKind !== 'actions') { setPlacementMode(null); setTradeOpen(false) }
    if (phaseKind !== 'actions' && phaseKind !== 'preRoll') setDevOpen(false) // knights may be played before the roll
  }, [phaseKind])
  useEffect(() => { setPlacementMode(null); setPanel(null); clearDraft() }, [active, turn])
  // G6.2: a trade draft the hand can no longer pay (after a trade or a robbery) is dropped
  useEffect(() => { if (!draftCovered(getDraft(), hand.counts)) clearDraft() }, [hand])
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPlacementMode(null); setPanel(null) } }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [])
}

/**
 * The resource hand (desktop tray and compact dock). G6.2: in the player's own `actions` phase each
 * card is a button that adds one card to the trade draft's "give" side and opens the trade panel; a
 * small "−" takes one back. Otherwise the cards are plain, and the tooltip says why.
 */
export function HandCards({ compact = false }: { compact?: boolean }) {
  const { counts, owner, ownerName } = useHand()
  const { bank } = useGameView()
  const setup = useSetup()
  const delta = useHandDelta(counts, owner)
  const covered = usePrivacy().covered
  const draft = useTradeDraft()
  const can = bank.open && !covered
  // cards: a portrait parchment card with the biome and the item (src/ui/cards/ResourceCard.tsx)
  const frame = `${RES_CARD_FRAME} ${compact ? RES_CARD.compact : RES_CARD.full} transition-transform`
  // only the resources in hand are shown; a pile that just ran out stays while its "−n" shows
  const shown = RESOURCES.filter(({ key }) => counts[key] > 0 || (can && (draft.give[key] ?? 0) > 0) || (delta?.d[key] ?? 0) < 0)
  return (
    <ul aria-label={`${ownerName}'s resources`} className={`relative flex items-end ${compact ? 'gap-[6px]' : 'gap-[8px] pb-[12px]'} ${setBack(setup)}`}>
      {!shown.length && owner && !setup && (
        <li className={`rounded-full bg-[#1d1a16]/80 font-semibold text-[#d6d2ca] ring-1 ring-white/10 ${compact ? 'px-[10px] py-[4px] text-[12px]' : 'px-[14px] py-[6px] text-[13px]'}`}>{L('No resource cards', 'Нет карт ресурсов')}</li>
      )}
      {shown.map(({ key }) => {
        const name = resTitle(key)
        const n = counts[key]
        const chosen = can ? draft.give[key] ?? 0 : 0
        const word = resName(key)
        const face = <ResourceCardFace res={key} name={name} count={n} chosen={chosen} compact={compact} />
        const d = delta?.d[key]
        const badge = d ? (
          <span key={delta!.seq} aria-hidden data-hand-delta className={`pointer-events-none absolute inset-x-0 z-[1] mx-auto w-fit rounded-full px-[7px] py-[1px] font-bold leading-[1.25] text-white shadow-[0_2px_6px_rgba(0,0,0,.55)] ring-1 ring-white/40 animate-[delta-pop_2.5s_ease-out] ${d > 0 ? 'bg-[#2a7d34]' : 'bg-[#b8322b]'} ${compact ? '-top-[11px] text-[13px]' : '-top-[13px] text-[15px]'}`}>{deltaText(d)}</span>
        ) : null
        if (!can) {
          const why = covered || setup ? '' : bank.reason ? ` (${bank.reason})` : '' // G7.6: setup says why in its note
          return <li key={key} aria-label={`${name}: ${n}`} title={`${name}: ${n}${why}`} className={`${frame} pointer-events-auto`}>{face}{badge}</li>
        }
        const label = L(`Trade one ${word} (you have ${n}${chosen ? `, ${chosen} chosen` : ''})`, `Отдать в обмен: ${word} (у вас ${n}${chosen ? `, выбрано ${chosen}` : ''})`)
        return (
          <li key={key} className="relative">
            <button data-hand-card aria-label={label} title={n ? label : L(`${name}: none to trade`, `${name}: нечего отдать`)} disabled={chosen >= n}
              onClick={() => { changeDraft('give', key, 1, n); setTradeOpen(true, 'players') }}
              className={`${frame} disabled:cursor-not-allowed ${chosen ? `ring-[3px] ring-[#ffd76a] ${compact ? '-translate-y-[4px]' : '-translate-y-[8px]'}` : 'enabled:hover:-translate-y-[4px]'} ${focusRing}`}>
              {face}
            </button>
            {badge}
            {chosen > 0 && (
              <button data-hand-card aria-label={L(`Take back one ${word}`, `Убрать из обмена: ${word}`)} title={L(`Take back one ${word}`, `Убрать из обмена: ${word}`)} onClick={() => changeDraft('give', key, -1)}
                className={`absolute -right-[6px] grid place-items-center rounded-full bg-[#c8302a] font-bold leading-none text-white shadow-[0_2px_6px_rgba(0,0,0,.5)] ${compact ? '-top-[10px] h-[24px] w-[24px] text-[16px]' : '-top-[14px] h-[26px] w-[26px] text-[17px]'} ${focusRing}`}>−</button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function ResourceCards() {
  return (
    <div className="absolute bottom-0 left-1/2 -translate-x-[54%]">
      {/* wooden tray */}
      <div className="absolute -bottom-[30px] left-1/2 h-[64px] w-[700px] -translate-x-1/2 rounded-[40px_40px_0_0] bg-[linear-gradient(180deg,#5c3d22,#2c1c10)] shadow-[0_-6px_20px_rgba(0,0,0,0.5),inset_0_2px_0_rgba(255,210,160,0.2)]" />
      <HandHint className="absolute bottom-[124px] left-1/2 -translate-x-1/2" />
      <SetupNote className="absolute bottom-[124px] left-1/2 -translate-x-1/2" />
      <HandCards />
    </div>
  )
}

export const Arrow = () => (
  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)
// A7: build-menu icons drawn after the 3D pieces: a paved road with kerbs, a cottage with
// deep eaves, a chimney and a door step, and the castle (curtain wall, keep with a cone roof, gabled hall)
const ICO_WALL = '#efdcae', ICO_ROOF = '#bf8d3c', ICO_LINE = '#6b4a22', ICO_DARK = '#7a4f22'
const RoadIco = () => (
  <svg viewBox="0 0 24 24" className="h-[24px] w-[24px]">
    {/* a paved road: grey kerbs, two rows of cobbles in a running bond */}
    <g transform="rotate(-38 12 12)">
      <rect x="1.5" y="7.6" width="21" height="8.8" rx="1.2" fill="#9a8f80" stroke={ICO_LINE} strokeWidth="0.8" />
      {[[3, 9.3, 3.6], [7.2, 9.3, 3.6], [11.4, 9.3, 3.6], [15.6, 9.3, 3.6], [3, 12.3, 1.6], [5.2, 12.3, 3.6], [9.4, 12.3, 3.6], [13.6, 12.3, 3.6], [17.8, 12.3, 1.6]].map(([x, y, w]) => (
        <rect key={`${x},${y}`} x={x} y={y} width={w} height="2.4" rx="0.5" fill={ICO_WALL} stroke={ICO_LINE} strokeWidth="0.45" />
      ))}
    </g>
  </svg>
)
const HouseIco = ({ city }: { city?: boolean }) => city ? (
  <svg viewBox="0 0 24 24" className="h-[26px] w-[26px]" strokeLinejoin="round">
    {/* keep: round tower with a cone roof */}
    <rect x="3.5" y="6.5" width="6" height="8" fill={ICO_WALL} stroke={ICO_LINE} strokeWidth="0.7" />
    <path d="M2.6 7 6.5 1 10.4 7Z" fill={ICO_ROOF} stroke={ICO_LINE} strokeWidth="0.7" />
    {/* hall with a gable roof */}
    <rect x="12" y="9" width="9" height="5" fill={ICO_WALL} stroke={ICO_LINE} strokeWidth="0.7" />
    <path d="M11 9.6 16.5 5 22 9.6Z" fill={ICO_ROOF} stroke={ICO_LINE} strokeWidth="0.7" />
    {/* curtain wall with merlons and a gate */}
    <path d="M1.5 13h2v-1.4h2V13h2.5v-1.4h2V13h3v-1.4h2V13h2.5v-1.4h2V13h2v8h-21Z" fill={ICO_WALL} stroke={ICO_LINE} strokeWidth="0.7" />
    <path d="M10 21v-3.2a2 2 0 0 1 4 0V21Z" fill={ICO_DARK} />
  </svg>
) : (
  <svg viewBox="0 0 24 24" className="h-[26px] w-[26px]" strokeLinejoin="round">
    <rect x="14.6" y="4.6" width="2.6" height="5" fill="#d9c49a" stroke={ICO_LINE} strokeWidth="0.7" />
    <rect x="5.5" y="11" width="13" height="8.6" fill={ICO_WALL} stroke={ICO_LINE} strokeWidth="0.7" />
    {/* deep eaves: the roof overhangs the walls on both sides */}
    <path d="M2.2 12.2 12 4 21.8 12.2Z" fill={ICO_ROOF} stroke={ICO_LINE} strokeWidth="0.7" />
    <rect x="10.4" y="14.6" width="3.2" height="5" fill={ICO_DARK} />
    <rect x="9.4" y="19.6" width="5.2" height="1.4" fill="#cdbb95" stroke={ICO_LINE} strokeWidth="0.5" />
  </svg>
)

const BUILD_ICON: Record<BuildKind, ReactNode> = {
  road: <RoadIco />,
  settlement: <HouseIco />,
  city: <HouseIco city />,
  dev: <DevCardBack className="h-[26px] w-[20px]" />, // A5: the card back
}
const BUILD_NAME = (k: BuildKind) => (k === 'dev' ? L('Development card', 'Карта развития') : pieceName(k))

/**
 * Rows of the build menu (cost icons + arrow); shared by the desktop panel and the compact popover.
 * Road/settlement/city choose a placement on the board; the dev card is bought at once. A row is
 * enabled exactly when the engine allows that build; otherwise its tooltip says why.
 * G6.4: a row short of cards greys out the missing ones; when bank trades can cover them (and the
 * build is legal afterwards) it stays a button that opens the trade panel with those trades filled
 * in, and the trade then starts the placement.
 */
/**
 * What choosing a build does (a menu row or its shortcut, G6.6): an enabled row toggles its placement
 * mode or buys the card; a row short of cards that the bank can cover opens the trade for it (G6.4).
 */
export function chooseBuild(kind: BuildKind, o: { enabled: boolean; plan: Shortfall | null; player: PlayerId | null; mode: PlacementMode; dispatch: (p: PlayerId, a: Action) => void }) {
  if (!o.enabled) {
    if (o.plan?.covered) { setDraft(o.plan.draft); setTradeOpen(true); setBuildGoal(kind) }
  } else if (kind === 'dev') {
    if (o.player) o.dispatch(o.player, { type: 'BUY_DEV' })
  } else setPlacementMode(o.mode === kind ? null : kind)
}
const BUILD_KEY: Record<BuildKind, string> = { road: 'R', settlement: 'S', city: 'C', dev: 'D' }

export function BuildRows({ onChosen }: { onChosen?: () => void }) {
  const { build, primary, me } = useGameView()
  const s = useGame((x) => x)
  const store = useGameStore()
  const mode = usePlacementMode()
  const hidden = usePrivacy().covered
  const { counts } = useHand() // the shown hand (empty behind the pass screen)
  const plans = useMemo(() => Object.fromEntries(build.map((b) => [b.kind, b.enabled || hidden ? null : shortfall(s, b.kind, me)])), [s, me, build, hidden])
  const choose = (kind: BuildKind, enabled: boolean) => {
    chooseBuild(kind, { enabled, plan: plans[kind], player: primary.player, mode, dispatch: (p, a) => store.dispatch(p, a) })
    onChosen?.()
  }
  return (
    <>
      {build.map(({ kind, enabled, reason, cost }) => {
        const selected = mode === kind
        const plan = plans[kind]
        const tradable = !enabled && !!plan?.covered && plan.trades.length > 0
        // G6.5: how many the hand pays for, on enabled rows
        const many = enabled && primary.player ? affordable(s, kind, primary.player) : 0
        const trades = tradable && primary.player ? tradesText(s, primary.player, plan!.trades) : ''
        const label = L(
          `${kind === 'dev' ? 'Buy' : 'Build'} ${BUILD_NAME(kind)}: ${costText(cost)}${reason ? ` (${reason}${trades ? `; trade ${trades} first` : ''})` : ''}${many ? ` (can pay for ${many})` : ''}`,
          `${kind === 'dev' ? 'Купить' : 'Построить'}: ${BUILD_NAME(kind).toLowerCase()}, ${costText(cost)}${reason ? ` (${reason}${trades ? `; сначала обменяйте ${trades}` : ''})` : ''}${many ? ` (хватает на ${many})` : ''}`,
        )
        // G7.1: the cost per kind as "have/need", the missing kinds marked by a dashed outline and the count still needed, not by colour alone
        const kinds = RESOURCE_ORDER.filter((r) => cost[r])
        return (
          <button
            key={kind}
            aria-label={label}
            aria-pressed={kind === 'dev' ? undefined : selected}
            title={label}
            disabled={!enabled && !tradable}
            data-trade-for={tradable ? kind : undefined}
            aria-keyshortcuts={BUILD_KEY[kind]}
            onClick={() => choose(kind, enabled)}
            className={`group relative flex w-full items-start gap-[10px] rounded-[10px] border-b border-white/10 py-[6px] pl-[6px] pr-[6px] text-left transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:hover:bg-transparent ${selected ? 'bg-[#f2b544]/15 ring-1 ring-[#f2b544]/70' : enabled ? 'bg-gradient-to-r from-[#4fbf6a]/20 to-[#4fbf6a]/[0.04] shadow-[inset_3px_0_0_#5fd37a,inset_0_0_0_1px_rgba(95,211,122,.28)] hover:from-[#4fbf6a]/30' : ''} ${focusRing}`}
          >
            <span aria-hidden className={`relative mt-[2px] w-[28px] shrink-0 ${enabled || tradable ? '' : 'opacity-50'}`}>
              {BUILD_ICON[kind]}
              {many > 0 && <span className="absolute -right-[7px] -top-[9px] rounded-full bg-[#5fd37a] px-[4px] text-[11px] font-bold leading-[15px] text-[#0c2a14] shadow-[0_1px_3px_rgba(0,0,0,.5)]">×{many}</span>}
            </span>
            <span aria-hidden className="min-w-0 flex-1">
              <span className={`block pr-[26px] text-[14px] font-semibold leading-[18px] ${enabled ? 'text-white' : 'text-[#cfcac1]'}`}>{pieceName(kind)}</span>
              <span className="mt-[3px] flex flex-wrap gap-[3px]">
                {kinds.map((r) => {
                  const I = RES_ICON[r]; const need = cost[r]!; const have = counts[r]; const short = need - have
                  return (
                    <span key={r} className={`flex h-[24px] items-center gap-[2px] rounded-[9px] pl-[3px] pr-[6px] text-[12px] font-bold leading-none ${short > 0 ? 'border border-dashed border-[#ff9b8a]/80 bg-[#8a2a22]/45 text-[#ffd8cf]' : enabled ? 'border border-[#5fd37a]/45 bg-[#173a22]/55 text-[#e6f8e9]' : 'border border-white/15 bg-black/25 text-[#f1f5e6]'}`}>
                      <span className="block h-[16px] w-[18px] [&>svg]:h-full [&>svg]:w-full"><I /></span>
                      {Math.min(have, 99)}/{need}
                    </span>
                  )
                })}
              </span>
              {reason && <span className={`mt-[3px] block text-[12px] leading-[15px] ${tradable ? 'text-[#e9e3d8]' : 'text-[#d9b8a8]'}`}>{reason}</span>}
              {tradable && <span className="mt-[2px] block text-[12px] font-semibold leading-[15px] text-[#f2b544]">{L('Trade & build: ', 'Обменять и построить: ')}{trades}</span>}
            </span>
            {tradable
              ? <span aria-hidden className="absolute right-[6px] top-[4px] grid h-[24px] w-[24px] place-items-center rounded-full bg-[#f2b544]/20 text-[#f2b544] ring-1 ring-[#f2b544]/60"><TradeIco size={15} /></span>
              : <span aria-hidden className={`absolute right-[6px] top-[5px] transition-transform group-hover:translate-x-[2px] ${enabled ? 'text-[#7fe39a]' : 'text-[#ece8e0] opacity-40'}`}><Arrow /></span>}
          </button>
        )
      })}
    </>
  )
}

const MenuIco = () => (
  <svg aria-hidden viewBox="0 0 24 24" className="h-[20px] w-[20px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
)
/** G9.3: opens the start menu (continue, new game, online); hot-seat only, online has its own lobby. */
export function MenuButton({ className = '' }: { className?: string }) {
  const online = useOnline()
  if (online || BOARD_MODE !== 'game') return null
  return <IconButton label={L('Menu', 'Меню')} data-menu-button onClick={openMenu} className={className}><MenuIco /></IconButton>
}

/** G7: toggles browser fullscreen for the whole page; hidden where the browser has no fullscreen (iPhone Safari). */
export function FullscreenButton({ className = '' }: { className?: string }) {
  const [on, setOn] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement)
  useEffect(() => {
    const f = () => setOn(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', f)
    return () => document.removeEventListener('fullscreenchange', f)
  }, [])
  if (typeof document === 'undefined' || !document.fullscreenEnabled) return null
  const toggle = () => { (on ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {}) }
  return (
    <IconButton label={on ? L('Exit fullscreen', 'Выйти из полноэкранного режима') : L('Fullscreen', 'Во весь экран')} aria-pressed={on} onClick={toggle} className={className}>
      <svg aria-hidden viewBox="0 0 24 24" className="h-[20px] w-[20px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        {on ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
      </svg>
    </IconButton>
  )
}

function BuildPanel() {
  const setup = useSetup()
  // G9.5: during setup the panel is one line; the costs come back with the first turn
  if (setup) return (
    <section aria-labelledby="build-title" className={`mr-[2px] mt-auto flex w-[246px] shrink-0 items-baseline justify-between rounded-[18px] px-[16px] py-[10px] ${glass} ${setBack(setup)}`}>
      <h2 id="build-title" className="font-display text-[20px] font-medium text-[#f4efe6]">{L('Build', 'Стройка')}</h2>
      <span className="text-[13px] text-[#d6d2ca]">{L('after setup', 'после расстановки')}</span>
    </section>
  )
  // focusable and wheel-scrollable: on a short screen it scrolls, and with every row disabled the keyboard could not reach the rest
  return (
    <section tabIndex={0} aria-labelledby="build-title" className={`pointer-events-auto mr-[2px] mt-auto min-h-0 w-[246px] overflow-y-auto rounded-[18px] px-[10px] pb-[8px] pt-[12px] ${focusRing} ${glass}`}>
      <h2 id="build-title" className="mb-[8px] px-[6px] font-display text-[20px] font-medium text-[#f4efe6]">{L('Build', 'Стройка')}</h2>
      <BuildRows />
    </section>
  )
}

const TradeIco = ({ size }: { size: number }) => (
  <svg aria-hidden viewBox="0 0 24 24" style={{ width: size, height: size }} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h14l-4-4" /><path d="M20 16H6l4 4" /></svg>
)

/** Opens the trade panel (G4.4d; bank and players in one panel since G6.3). */
export function TradeButton({ className = '', icon = 24 }: { className?: string; icon?: number }) {
  const { bank } = useGameView()
  const open = useTradeOpen()
  const setup = useSetup()
  const label = `${L('Trade', 'Торговля')}${bank.reason && !setup ? ` (${bank.reason})` : ''}`
  return (
    <IconButton label={label} data-trade-button aria-pressed={open} aria-keyshortcuts="T" disabled={!bank.open} onClick={() => setTradeOpen(!open)}
      aria-describedby={setup ? SETUP_NOTE_ID : undefined} className={`${open ? 'ring-2 ring-[#f2b544]' : ''} ${setBack(setup)} ${className}`}>
      <TradeIco size={icon} />
    </IconButton>
  )
}

const CardsStackIco = ({ size }: { size: number }) => (
  <svg aria-hidden viewBox="0 0 24 24" style={{ width: size, height: size }} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><rect x="8" y="4" width="11" height="15" rx="2" /><path d="M5 7.5v11A1.5 1.5 0 0 0 6.5 20H15" /><path d="M13.5 9l1 2 2 .3-1.5 1.4.4 2-1.9-1-1.9 1 .4-2L10.5 11.3l2-.3z" fill="currentColor" strokeWidth="1" /></svg>
)

/** Opens the development cards panel (G4.4e); a badge shows how many cards the active player holds. */
export function DevButton({ className = '', icon = 24 }: { className?: string; icon?: number }) { // compact dock
  const { dev } = useGameView()
  const open = useDevOpen()
  const setup = useSetup()
  const label = `${L('My development cards', 'Мои карты развития')}: ${dev.total}${dev.canOpen || setup ? '' : ` (${L('Not now', 'Не сейчас')})`}`
  return (
    <div className="relative shrink-0">
      <IconButton label={label} data-dev-button aria-pressed={open} disabled={!dev.canOpen} onClick={() => setDevOpen(!open)}
        aria-describedby={setup ? SETUP_NOTE_ID : undefined} className={`${open ? 'ring-2 ring-[#f2b544]' : ''} ${setBack(setup)} ${className}`}>
        <CardsStackIco size={icon} />
      </IconButton>
      {dev.total > 0 && <span aria-hidden className="pointer-events-none absolute -right-[5px] -top-[5px] grid h-[19px] min-w-[19px] place-items-center rounded-full bg-[#f2b544] px-[4px] text-[11px] font-bold text-[#2a1a06] shadow-[0_1px_4px_rgba(0,0,0,.5)]">{dev.total}</span>}
    </div>
  )
}

/**
 * G9.2: trade and development cards as labelled buttons (they were two unlabelled icons). The second
 * line says why a button is off right now, or its key, so nothing depends on hover.
 */
function LabelledAction({ icon, title, sub, badge, className = '', ...rest }: { icon: ReactNode; title: string; sub: string; badge?: number; className?: string } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className' | 'title'>) {
  return (
    <button {...rest}
      className={`relative flex h-[54px] min-w-0 items-center gap-[9px] rounded-[12px] pl-[11px] pr-[10px] text-left text-[#ece8e0] transition-[filter,transform] hover:brightness-125 active:translate-y-[1px] disabled:cursor-not-allowed disabled:hover:brightness-100 [&:disabled>*]:opacity-60 ${focusRing} ${panel} ${className}`}>
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate font-display text-[16px] font-semibold text-[#f4efe6]">{title}</span>
        <span className="block truncate text-[12px] text-[#bdb8ae]">{sub}</span>
      </span>
      {!!badge && <span aria-hidden className="pointer-events-none absolute -right-[6px] -top-[6px] grid h-[20px] min-w-[20px] place-items-center rounded-full bg-[#f2b544] px-[4px] text-[11.5px] font-bold text-[#2a1a06] shadow-[0_1px_4px_rgba(0,0,0,.5)] !opacity-100">{badge}</span>}
    </button>
  )
}

function BottomLeft() {
  const { bank, dev } = useGameView()
  const tradeOpen = useTradeOpen()
  const devOpen = useDevOpen()
  const setup = useSetup()
  const after = L('After setup', 'Позже')
  const tradeSub = setup ? after : bank.open ? L('Key: T', 'Клавиша T') : bank.reason ?? L('Not now', 'Не сейчас')
  // G9.7: short enough for the subline in both languages (was cut off: "2 на руке ·…")
  const devSub = setup ? after : dev.total === 0 ? L('None yet', 'Пока нет') : dev.canOpen ? L(`${dev.total} in hand`, `${dev.total} на руке`) : L(`${dev.total} · not now`, `${dev.total} · не сейчас`)
  return (
    <div className="absolute bottom-[16px] left-[22px] grid w-[272px] grid-cols-2 gap-[10px]">
      <LabelledAction data-trade-button aria-pressed={tradeOpen} aria-keyshortcuts="T" disabled={!bank.open} onClick={() => setTradeOpen(!tradeOpen)}
        aria-label={`${L('Trade', 'Торговля')}: ${tradeSub}`} aria-describedby={setup ? SETUP_NOTE_ID : undefined}
        icon={<TradeIco size={24} />} title={L('Trade', 'Торговля')} sub={tradeSub} className={`${tradeOpen ? 'ring-2 ring-[#f2b544]' : ''} ${setBack(setup)}`} />
      <LabelledAction data-dev-button aria-pressed={devOpen} disabled={!dev.canOpen} onClick={() => setDevOpen(!devOpen)}
        aria-label={L(`Dev cards: my development cards, ${devSub}`, `Карты развития: ${devSub}`)} aria-describedby={setup ? SETUP_NOTE_ID : undefined}
        icon={<CardsStackIco size={24} />} title={L('Dev cards', 'Карты')} sub={devSub} className={`${devOpen ? 'ring-2 ring-[#f2b544]' : ''} ${setBack(setup)}`} />
    </div>
  )
}

export const HUD = memo(function HUD() {
  const s = useHudScale()
  const { compact } = useViewport()
  usePlacementAutoReset()
  useShortcuts()
  if (useBeforeGame()) return null
  if (compact) return <CompactHUD />
  return (
    <div className="pointer-events-none fixed inset-0 z-[20] select-none overflow-hidden font-ui">
      <div
        className="absolute left-0 top-0 origin-top-left [&_button]:pointer-events-auto [&_nav]:pointer-events-auto"
        style={{ width: `${100 / s}vw`, height: `${100 / s}vh`, transform: `scale(${s})` }}
      >
        <Brand />
        <BankStock className="absolute left-[22px] top-[72px]" />
        <div className="absolute right-[18px] top-[14px] flex gap-[10px]">
          <MenuButton />
          <FullscreenButton />
          <HelpButton />
        </div>
        <PhaseBanner className="absolute left-1/2 top-[14px] -translate-x-1/2 whitespace-nowrap" />
        {/* bottom-left corner above the action buttons: the game log (G9.1) with the remaining notices
            above it; neither covers tokens, ports or the HUD */}
        <div className="absolute bottom-[84px] left-[22px] flex w-[272px] flex-col items-stretch justify-end gap-[8px]">
          <Notices align="start" events={false} max={1} className="w-full" />
          <GameLog />
        </div>
        {/* G10.1: one right column, so on a short screen the build panel scrolls instead of covering the
            primary action (it hid "End turn" at 1280×720); the spacer keeps the dice where they were on tall screens */}
        <div className="absolute bottom-[42px] right-[14px] top-[66px] flex flex-col items-end">
          <Players />
          <div aria-hidden className="max-h-[56px] min-h-[10px] flex-1" />
          <DiceArea />
          <BuildPanel />
        </div>
        <ResourceCards />
        <BottomLeft />
        <GameDialogs className="absolute bottom-[132px] left-1/2 -translate-x-[54%]" />
        <BoardPicker className="absolute inset-x-0 bottom-[132px]" />
        <SetupConfirm className="absolute inset-x-0 bottom-[132px]" />
        <Victory />
      </div>
    </div>
  )
})
