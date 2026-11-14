// Large resource illustrations for the cards (hand, discard, trade tiles): a painted look with
// shading, highlights and a dark contour, so each item stays crisp on its landscape. The small icons
// in ../icons.tsx stay for cost chips, harbour signs and board feedback, where detail would be noise.
// Our own drawings; references/card-ref.png is only a style direction (ASSET_DESIGN §1).

import { useId, type ReactNode } from 'react'
import type { Resource } from '../../game'

const INK = '#3a2412' // shared contour

function Wheat({ id }: { id: string }) {
  // one ear in local units: stem from the tie (0,0) up, grains from y -50 to -22
  const ear = (rot: number, len: number, k: number) => (
    <g key={k} transform={`rotate(${rot} 50 72)`}>
      <path d={`M50 72 Q${50 + rot * 0.05} 50 50 ${72 - len}`} stroke="#9a6a14" strokeWidth="1.8" fill="none" />
      {Array.from({ length: 6 }, (_, i) => {
        const y = 72 - len + 4 + i * 4.6
        return (
          <g key={i}>
            <path d={`M50 ${y + 2} Q${44 - i * 0.2} ${y} ${45.5} ${y - 5} Q${49} ${y - 2} 50 ${y + 2} Z`} fill={`url(#${id}g)`} stroke="#6e4408" strokeWidth=".8" />
            <path d={`M50 ${y + 2} Q${56 + i * 0.2} ${y} ${54.5} ${y - 5} Q${51} ${y - 2} 50 ${y + 2} Z`} fill={`url(#${id}g2)`} stroke="#6e4408" strokeWidth=".8" />
            <path d={`M45.5 ${y - 5} L42 ${y - 11}`} stroke="#e8c160" strokeWidth=".5" />
            <path d={`M54.5 ${y - 5} L58 ${y - 11}`} stroke="#e8c160" strokeWidth=".5" />
          </g>
        )
      })}
      <path d={`M50 ${72 - len + 3} Q47 ${72 - len - 3} 50 ${72 - len - 7} Q53 ${72 - len - 3} 50 ${72 - len + 3} Z`} fill="#f7d572" stroke="#8a5a10" strokeWidth=".6" />
    </g>
  )
  return (
    <>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fbe08a" /><stop offset="1" stopColor="#d69a26" /></linearGradient>
        <linearGradient id={`${id}g2`} x1="1" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f2c454" /><stop offset="1" stopColor="#b97c16" /></linearGradient>
      </defs>
      <g transform="translate(50 62) scale(1.22) translate(-50 -62)">
      {/* stems below the tie */}
      {[-12, -6, 0, 6, 12].map((d) => <path key={d} d={`M50 72 L${50 + d} 94`} stroke="#a8781e" strokeWidth="2" strokeLinecap="round" />)}
      {[[-30, 46], [30, 46], [-18, 54], [18, 54], [-7, 58], [7, 58], [0, 62]].map(([r, l], k) => ear(r, l, k))}
      {/* the tie */}
      <path d="M43 70 Q50 74 57 70 L57 76 Q50 80 43 76 Z" fill="#8a4f22" stroke={INK} strokeWidth="1" />
      <path d="M44 72 Q50 75 56 72" stroke="#c88a4a" strokeWidth=".8" fill="none" />
      </g>
    </>
  )
}

/** The log pile, also drawn on the Road Building card. */
export function LogPile({ id }: { id: string }) {
  const log = (x: number, y: number, k: number) => (
    <g key={k} transform={`translate(${x} ${y}) rotate(-24)`}>
      <path d="M0 -10 H50 a5 10 0 0 1 0 20 H0 Z" fill={`url(#${id}b)`} stroke={INK} strokeWidth="1.2" />
      <path d="M8 -5 H22 M28 -6 H44 M12 4 H30 M34 5 H46" stroke="#4e2a10" strokeWidth="1.2" strokeLinecap="round" opacity=".55" />
      <path d="M6 -8 H46" stroke="#d7955a" strokeWidth="1.2" strokeLinecap="round" opacity=".7" />
      <ellipse cx="0" cy="0" rx="6.5" ry="10" fill={`url(#${id}r)`} stroke={INK} strokeWidth="1.2" />
      <ellipse cx="0" cy="0" rx="4.2" ry="6.5" fill="none" stroke="#b0773e" strokeWidth=".8" />
      <ellipse cx="0" cy="0" rx="2" ry="3.2" fill="none" stroke="#b0773e" strokeWidth=".8" />
    </g>
  )
  return (
    <>
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c27a40" /><stop offset=".55" stopColor="#8e4f22" /><stop offset="1" stopColor="#5e3214" /></linearGradient>
        <radialGradient id={`${id}r`} cx=".45" cy=".4" r=".6"><stop offset="0" stopColor="#f8dcaa" /><stop offset=".8" stopColor="#dca468" /><stop offset="1" stopColor="#a8682e" /></radialGradient>
      </defs>
      <ellipse cx="54" cy="86" rx="34" ry="5" fill="#000" opacity=".25" />
      {log(36, 56, 0)}{log(24, 76, 1)}{log(47, 80, 2)}
    </>
  )
}

function Ore({ id }: { id: string }) {
  const rock = (x: number, y: number, r: number, k: number) => {
    const P = [[-1, 0.2], [-0.55, -0.75], [0.35, -0.9], [1, -0.1], [0.6, 0.75], [-0.5, 0.8]].map(([a, b]) => [x + a * r, y + b * r])
    const C = [x + 0.05 * r, y - 0.05 * r]
    const pts = (xs: number[][]) => xs.map((q) => q.join(' ')).join(' L')
    return (
      <g key={k}>
        <path d={`M${pts([P[1], P[2], P[3], C])} Z`} fill={`url(#${id}t)`} />
        <path d={`M${pts([P[0], P[1], C, P[5]])} Z`} fill="#9aa0a7" />
        <path d={`M${pts([C, P[3], P[4], P[5]])} Z`} fill="#676d75" />
        <path d={`M${pts(P)} Z`} fill="none" stroke="#33373d" strokeWidth="1.2" strokeLinejoin="round" />
        <path d={`M${P[1][0] + r * 0.15} ${P[1][1] + r * 0.2} L${P[2][0] - r * 0.1} ${P[2][1] + r * 0.2}`} stroke="#f2f4f6" strokeWidth="1.2" strokeLinecap="round" opacity=".8" />
      </g>
    )
  }
  return (
    <>
      <defs>
        <linearGradient id={`${id}t`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#e4e7ea" /><stop offset="1" stopColor="#b4b9be" /></linearGradient>
      </defs>
      <ellipse cx="50" cy="86" rx="38" ry="5" fill="#000" opacity=".25" />
      {rock(34, 50, 15, 0)}{rock(64, 46, 16, 1)}{rock(50, 34, 13, 2)}
      {rock(24, 70, 15, 3)}{rock(52, 70, 18, 4)}{rock(78, 68, 13, 5)}
      {rock(38, 84, 5, 6)}{rock(68, 85, 4, 7)}
    </>
  )
}

function Bricks({ id }: { id: string }) {
  const brick = (x: number, y: number, k: number) => (
    <g key={k} stroke="#5a1e0e" strokeWidth="1" strokeLinejoin="round">
      <path d={`M${x} ${y} L${x + 10} ${y - 6} H${x + 36} L${x + 26} ${y} Z`} fill="#ef9068" />
      <rect x={x} y={y} width="26" height="12" fill={`url(#${id}f)`} />
      <path d={`M${x + 26} ${y} L${x + 36} ${y - 6} V${y + 6} L${x + 26} ${y + 12} Z`} fill="#8a3018" />
      <path d={`M${x + 3} ${y + 3} H${x + 12}`} stroke="#f2a07a" strokeWidth="1" opacity=".7" />
      <circle cx={x + 18} cy={y + 7} r=".9" fill="#7a2a14" stroke="none" /><circle cx={x + 7} cy={y + 9} r=".7" fill="#7a2a14" stroke="none" />
    </g>
  )
  return (
    <>
      <defs>
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#dc6c42" /><stop offset="1" stopColor="#a63e1e" /></linearGradient>
      </defs>
      <ellipse cx="52" cy="86" rx="38" ry="5" fill="#000" opacity=".25" />
      {/* bottom layer: back row, then front row */}
      {brick(26, 66, 0)}{brick(52, 66, 1)}
      {brick(16, 72, 2)}{brick(42, 72, 3)}
      {/* top layer */}
      {brick(31, 54, 4)}{brick(23, 60, 5)}{brick(49, 60, 6)}
    </>
  )
}

function Sheep({ id }: { id: string }) {
  const wool: [number, number, number][] = [[58, 54, 15], [74, 64, 9], [78, 56, 10], [62, 62, 12], [48, 61, 11], [70, 47, 12], [56, 44, 13], [44, 50, 12]]
  return (
    <>
      <defs>
        <radialGradient id={`${id}w`} cx=".4" cy=".35" r=".7"><stop offset="0" stopColor="#ffffff" /><stop offset=".7" stopColor="#efe9dd" /><stop offset="1" stopColor="#cfc6b4" /></radialGradient>
      </defs>
      <ellipse cx="58" cy="87" rx="30" ry="4.5" fill="#000" opacity=".25" />
      {/* legs */}
      {[[47, 68], [55, 70], [66, 70], [74, 67]].map(([x, y]) => (
        <g key={x}><rect x={x} y={y} width="5" height="17" rx="2" fill="#4a3c32" stroke={INK} strokeWidth=".8" /><rect x={x} y={y + 14} width="5" height="3" rx="1" fill="#241a14" /></g>
      ))}
      {/* fleece */}
      {wool.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill={`url(#${id}w)`} stroke="#9a907e" strokeWidth=".9" />)}
      {wool.slice(3).map(([x, y, r], i) => <path key={i} d={`M${x - r * 0.5} ${y - r * 0.35} q${r * 0.35} ${-r * 0.35} ${r * 0.7} 0`} stroke="#fff" strokeWidth="1.2" fill="none" strokeLinecap="round" />)}
      {/* head */}
      <ellipse cx="30" cy="50" rx="8.5" ry="11" transform="rotate(-18 30 50)" fill="#f3e9da" stroke="#7a6a56" strokeWidth="1" />
      <ellipse cx="38" cy="42" rx="6" ry="3" transform="rotate(25 38 42)" fill="#e6c9b8" stroke="#7a6a56" strokeWidth=".9" />
      <circle cx="34" cy="40" r="5" fill={`url(#${id}w)`} stroke="#9a907e" strokeWidth=".8" />
      <circle cx="29" cy="47" r="1.5" fill="#2a1e16" /><circle cx="28.6" cy="46.5" r=".5" fill="#fff" />
      <path d="M24 57 q2 2 4.5 0.5" stroke="#7a5a48" strokeWidth="1" fill="none" strokeLinecap="round" />
      <ellipse cx="25" cy="55" rx="2.2" ry="1.4" fill="#d9a898" />
    </>
  )
}

const ITEM: Record<Resource, (p: { id: string }) => ReactNode> = { grain: Wheat, lumber: LogPile, ore: Ore, brick: Bricks, wool: Sheep }

/** The card's item, drawn in a 100×100 box (fits its box, centred). */
export function ResourceItem({ res, className = '' }: { res: Resource; className?: string }) {
  const id = useId().replace(/:/g, '')
  const Draw = ITEM[res]
  return (
    <svg aria-hidden viewBox="0 0 100 100" className={className}>
      <Draw id={id} />
    </svg>
  )
}
