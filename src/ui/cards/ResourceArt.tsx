// Resource card art (ASSET_DESIGN A3): a small landscape behind each resource, drawn from the
// island's own biome colours (src/scene/Terrain.tsx), so a card says where its resource comes from.
// The resource itself stays the illustration in ./icons.tsx, drawn on top by the card, which keeps
// one picture per resource across the hand, the dialogs and the cost chips.
//
// The backdrop fills its (positioned) parent at any aspect ratio: the SVG is sliced, and every
// scene keeps its horizon and detail in the middle band so the cut edges never matter. Skies and
// far ground are mid-tones, darker than the light items (sheep, wheat, ore) and lighter than the
// dark ones' outlines, so the item always reads first; a vignette frames it.

import { useId, type ReactNode } from 'react'
import type { Resource } from '../../game'

/**
 * `horizon` (0–100, default 52) moves the ground line and the drawn detail together; the field and
 * the meadow sit higher so their colour leads the card, like the flat colours the cards had before.
 */
interface Scene { sky: [string, string]; ground: [string, string]; horizon?: number; draw: () => ReactNode; front: () => ReactNode }

const pine = (x: number, y: number, s: number, fill: string) => (
  <path key={`${x},${y}`} d={`M${x} ${y - 14 * s} L${x + 5 * s} ${y - 6 * s} H${x + 3 * s} L${x + 7 * s} ${y} H${x - 7 * s} L${x - 3 * s} ${y - 6 * s} H${x - 5 * s} Z`} fill={fill} />
)

const tuft = (x: number, y: number, s: number, c: string) => (
  <path key={`t${x},${y}`} d={`M${x - 6 * s} ${y} Q${x - 5 * s} ${y - 7 * s} ${x - 7 * s} ${y - 11 * s} Q${x - 2 * s} ${y - 6 * s} ${x - 1 * s} ${y - 13 * s} Q${x + 1 * s} ${y - 6 * s} ${x + 5 * s} ${y - 12 * s} Q${x + 4 * s} ${y - 5 * s} ${x + 7 * s} ${y} Z`} fill={c} />
)
const stone = (x: number, y: number, s: number, c: string, hi: string) => (
  <g key={`s${x},${y}`}>
    <path d={`M${x - 7 * s} ${y} Q${x - 6 * s} ${y - 6 * s} ${x - 1 * s} ${y - 7 * s} Q${x + 6 * s} ${y - 6 * s} ${x + 7 * s} ${y} Z`} fill={c} />
    <path d={`M${x - 4 * s} ${y - 4 * s} Q${x - 1 * s} ${y - 6.5 * s} ${x + 3 * s} ${y - 5 * s}`} stroke={hi} strokeWidth={1.4 * s} fill="none" strokeLinecap="round" />
  </g>
)
/** Foreground grass (and a stone) in the bottom corners, as on a painted card. */
const meadowFront = (dark: string, mid: string) => () => (
  <>
    {tuft(5, 101, 2, dark)}{tuft(17, 101, 1.4, mid)}{tuft(93, 101, 1.9, dark)}{tuft(82, 101, 1.3, mid)}
    {stone(27, 101, 0.7, '#8f8a7e', '#c9c3b5')}
  </>
)

const SCENES: Record<Resource, Scene> = {
  // forest: rows of pines on a dark-green floor
  lumber: {
    sky: ['#9fb98a', '#7a9660'], ground: ['#3d5a20', '#22340f'],
    draw: () => (
      <>
        <path d="M0 50 Q25 40 50 46 T100 42 V60 H0 Z" fill="#6e8a48" opacity=".7" />
        {[8, 22, 36, 64, 78, 92].map((x, i) => pine(x, 56 + (i % 2) * 3, 1.1, '#3f5e25'))}
        {[0, 15, 30, 70, 85, 100].map((x, i) => pine(x, 64 + (i % 2) * 2, 1.4, '#2c451a'))}
      </>
    ),
    front: meadowFront('#1f3410', '#3d5f1f'),
  },
  // clay hills: terracotta mounds with eroded strata
  brick: {
    sky: ['#e8b383', '#cf8a58'], ground: ['#9a4a2c', '#5a2818'],
    draw: () => (
      <>
        <path d="M-5 58 Q15 36 34 50 Q52 30 72 48 Q88 36 105 52 V62 H-5 Z" fill="#b86c3e" />
        <path d="M-5 62 Q20 48 40 58 Q62 44 84 56 Q96 50 105 56 V66 H-5 Z" fill="#96442a" />
        <g stroke="#5a2818" strokeWidth="1" fill="none" opacity=".35">
          <path d="M8 52 Q20 46 30 51" /><path d="M48 44 Q60 40 70 47" /><path d="M78 47 Q88 42 98 50" />
        </g>
      </>
    ),
    front: () => (
      <>
        {stone(8, 100, 1.6, '#7a3a20', '#b8653c')}{stone(22, 100, 1, '#8a4326', '#c47448')}{stone(88, 100, 1.5, '#7a3a20', '#b8653c')}{stone(76, 100, 0.9, '#8a4326', '#c47448')}
      </>
    ),
  },
  // pasture: soft rolling meadow with a few bushes
  wool: {
    sky: ['#79aecb', '#a9cbb0'], ground: ['#6f9a34', '#4a6a22'], horizon: 40,
    draw: () => (
      <>
        <path d="M-5 54 Q25 42 55 52 T105 48 V64 H-5 Z" fill="#9ab656" />
        <path d="M-5 60 Q30 52 60 60 T105 58 V68 H-5 Z" fill="#7f9f3c" />
        {[[12, 56], [86, 54], [30, 63]].map(([x, y]) => <ellipse key={x} cx={x} cy={y} rx="4.5" ry="3" fill="#4e7426" />)}
      </>
    ),
    front: meadowFront('#36551a', '#5f8a2a'),
  },
  // wheat field: golden rows running to a high horizon, darker than the sheaf in front
  grain: {
    sky: ['#d9c58a', '#c9a256'], ground: ['#b8802a', '#7e4e14'], horizon: 34,
    draw: () => (
      <>
        <path d="M0 50 Q50 44 100 50 V54 H0 Z" fill="#a3902f" opacity=".8" />
        <g stroke="#9c6a1c" strokeWidth="1.1" opacity=".45">
          {[-60, -35, -15, 0, 15, 35, 60].map((d) => <path key={d} d={`M50 52 L${50 + d * 2.2} 100`} />)}
        </g>
      </>
    ),
    front: meadowFront('#7a6a1c', '#9c8a2a'),
  },
  // mountains: grey peaks with snow caps over a rocky foot
  ore: {
    sky: ['#7d8994', '#a7b1b9'], ground: ['#5a534c', '#332e2a'],
    draw: () => (
      <>
        <path d="M-5 60 L18 30 L32 46 L50 22 L68 44 L82 32 L105 60 Z" fill="#6c655d" />
        <path d="M18 30 L24 38 L20 37 L15 40 Z M50 22 L57 31 L52 30 L46 34 Z M82 32 L87 39 L83 38 L78 41 Z" fill="#f4f6f8" />
        <path d="M-5 64 L22 48 L40 58 L60 46 L84 58 L105 52 V68 H-5 Z" fill="#544d46" />
      </>
    ),
    front: () => (
      <>
        {stone(8, 100, 1.7, '#4a4540', '#8a847c')}{stone(24, 100, 0.9, '#5a544d', '#958f86')}{stone(90, 100, 1.4, '#4a4540', '#8a847c')}{stone(78, 100, 0.8, '#5a544d', '#958f86')}
      </>
    ),
  },
}

/** Landscape behind a resource card; absolutely fills its positioned parent. */
export function ResourceBackdrop({ res, className = '' }: { res: Resource; className?: string }) {
  const id = useId().replace(/:/g, '')
  const s = SCENES[res]
  const h = s.horizon ?? 52
  return (
    <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className={`absolute inset-0 h-full w-full ${className}`}>
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={s.sky[0]} /><stop offset="1" stopColor={s.sky[1]} /></linearGradient>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={s.ground[0]} /><stop offset="1" stopColor={s.ground[1]} /></linearGradient>
        <radialGradient id={`${id}h`}><stop offset="0" stopColor="#fff8e0" stopOpacity=".5" /><stop offset="1" stopColor="#fff8e0" stopOpacity="0" /></radialGradient>
        <radialGradient id={`${id}v`} cx="0.5" cy="0.5" r="0.75"><stop offset="0.6" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".4" /></radialGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${id}s)`} />
      <rect y={h} width="100" height={100 - h} fill={`url(#${id}g)`} />
      <g transform={`translate(0 ${h - 52})`}>{s.draw()}</g>
      {/* soft light behind the item, as on a painted card */}
      <ellipse cx="50" cy="52" rx="42" ry="36" fill={`url(#${id}h)`} />
      {s.front()}
      <rect width="100" height="100" fill={`url(#${id}v)`} />
    </svg>
  )
}

/** Drop shadow plus a thin dark contour, so the item stays separate from its landscape. */
export const ART_SHADOW = 'drop-shadow-[0_0_1px_rgba(20,12,4,0.85)] drop-shadow-[0_3px_2px_rgba(0,0,0,0.45)]'

/** The parchment frame of a hand card (the same paper as the harbour signs and number tokens). */
export const PARCHMENT_FRAME = 'bg-[linear-gradient(180deg,#f6ead0,#dcc597_55%,#efdfbb)] ring-1 ring-[#7a5a2e]/70'
