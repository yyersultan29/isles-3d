// Development card art (ASSET_DESIGN A5): a face for each card type and a card back, in the same
// paper frame as the resource cards. The art is our own: a shield and sword (Knight), a bundle of
// road logs with a mallet, like the 3D road pieces (Road Building), a basket of grain and apples
// (Year of Plenty), a crown on a cushion (Monopoly), and the HUD's trophy with a star (Victory Point).
// Each face sits on its card colour (CARD.tint in DevDialog), so the list keeps its colour coding.

import { useId, type ReactNode } from 'react'
import { HexLogo } from '../icons'
import { PARCHMENT_FRAME } from './ResourceArt'
import { LogPile } from './ResourceItems'

export type DevCardType = 'knight' | 'roadBuilding' | 'yearOfPlenty' | 'monopoly' | 'victoryPoint'

/** Card colours, the same as the list rows' accent (DevDialog CARD.tint). */
export const DEV_TINT: Record<DevCardType, string> = {
  knight: '#7a4bc2', roadBuilding: '#3f8a4a', yearOfPlenty: '#c9902a', monopoly: '#b8452f', victoryPoint: '#2f6fb3',
}

const INK = '#3a2412'
const leaf = (x: number, y: number, r: number, k: number, s = 1) => (
  <path key={k} d="M0 0 Q4 -5 10 0 Q4 5 0 0 Z" transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`} fill="#4f8a2e" stroke="#24461a" strokeWidth=".6" />
)

const ART: Record<DevCardType, (id: string) => ReactNode> = {
  knight: (id) => (
    <>
      <defs>
        <linearGradient id={`${id}st`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f2f5f8" /><stop offset=".5" stopColor="#b9c1ca" /><stop offset="1" stopColor="#6f7882" /></linearGradient>
        <linearGradient id={`${id}fl`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#e2483a" /><stop offset="1" stopColor="#a8231a" /></linearGradient>
      </defs>
      {/* lance with a pennant behind */}
      <g transform="rotate(24 50 52)">
        <rect x="48.5" y="4" width="3.4" height="86" rx="1.4" fill="#8a5a2c" stroke={INK} strokeWidth="1" />
        <path d="M50.2 0 L54 9 H46.4 Z" fill={`url(#${id}st)`} stroke={INK} strokeWidth="1" />
        <path d="M52 11 L74 16 L66 20 L74 25 L52 25 Z" fill={`url(#${id}fl)`} stroke="#5e120c" strokeWidth="1" strokeLinejoin="round" />
      </g>
      {/* sword */}
      <g transform="rotate(-38 50 52)">
        <rect x="47" y="8" width="6" height="64" rx="2" fill={`url(#${id}st)`} stroke="#3e434a" strokeWidth="1.2" />
        <path d="M50 10 V68" stroke="#fff" strokeWidth=".8" opacity=".7" />
        <rect x="36" y="70" width="28" height="6" rx="3" fill="#d4a443" stroke="#5a3d12" strokeWidth="1.2" />
        <rect x="47" y="76" width="6" height="13" rx="2" fill="#6b4524" stroke="#3a2414" strokeWidth=".8" />
        <circle cx="50" cy="91" r="4" fill="#d4a443" stroke="#5a3d12" strokeWidth="1.2" />
      </g>
      {/* kite shield with a chevron and rivets */}
      <path d="M29 25 H71 V50 C71 69 61 81 50 89 C39 81 29 69 29 50 Z" fill={`url(#${id}st)`} stroke="#33373d" strokeWidth="2" />
      <path d="M34.5 30.5 H65.5 V50 C65.5 65 57.5 75.5 50 82 C42.5 75.5 34.5 65 34.5 50 Z" fill="#f4ead2" stroke="#8a7a5a" strokeWidth=".8" />
      <path d="M36 58 L50 44 L64 58 L64 67 L50 53 L36 67 Z" fill="#4a2a86" stroke="#24104a" strokeWidth=".8" />
      {[[32, 28], [68, 28], [32, 52], [68, 52], [50, 85.5]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.3" fill="#e9edf1" stroke="#3e434a" strokeWidth=".6" />)}
      <path d="M36 33 H48" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" opacity=".8" />
    </>
  ),
  roadBuilding: (id) => (
    <>
      <defs>
        <linearGradient id={`${id}hd`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c99256" /><stop offset="1" stopColor="#7e4e22" /></linearGradient>
      </defs>
      {/* the same log pile as the wood card */}
      <svg x="-4" y="6" width="96" height="96" viewBox="0 0 100 100"><LogPile id={`${id}lp`} /></svg>
      {/* mallet */}
      <g transform="rotate(30 72 40)">
        <rect x="69.5" y="22" width="5" height="48" rx="2" fill="#c08a4a" stroke="#4e2810" strokeWidth="1.1" />
        <rect x="58" y="10" width="28" height="15" rx="3.5" fill={`url(#${id}hd)`} stroke={INK} strokeWidth="1.3" />
        <path d="M61 13 H83" stroke="#e8b67a" strokeWidth="1.2" strokeLinecap="round" />
        <rect x="58" y="10" width="4" height="15" rx="1.5" fill="#5e3214" />
        <rect x="82" y="10" width="4" height="15" rx="1.5" fill="#5e3214" />
      </g>
    </>
  ),
  yearOfPlenty: (id) => (
    <>
      <defs>
        <linearGradient id={`${id}bk`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d6a35a" /><stop offset="1" stopColor="#8e5e24" /></linearGradient>
        <radialGradient id={`${id}ap`} cx=".35" cy=".3" r=".75"><stop offset="0" stopColor="#ff8a70" /><stop offset=".5" stopColor="#d6352a" /><stop offset="1" stopColor="#7e1712" /></radialGradient>
        <linearGradient id={`${id}gr`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fbe08a" /><stop offset="1" stopColor="#d69a26" /></linearGradient>
      </defs>
      {/* wheat ears behind */}
      {[-26, -12, 4, 18].map((r) => (
        <g key={r} transform={`rotate(${r} 50 60)`}>
          <path d="M50 60 V16" stroke="#9a6a14" strokeWidth="1.8" />
          {[0, 1, 2, 3, 4].map((k) => <ellipse key={k} cx={k % 2 ? 53 : 47} cy={19 + k * 5.5} rx="4.2" ry="2.5" fill={`url(#${id}gr)`} stroke="#6e4408" strokeWidth=".6" transform={`rotate(${k % 2 ? 35 : -35} ${k % 2 ? 53 : 47} ${19 + k * 5.5})`} />)}
        </g>
      ))}
      {/* apples and a pear */}
      <circle cx="37" cy="51" r="9.5" fill={`url(#${id}ap)`} stroke="#5e120c" strokeWidth="1.1" />
      <path d="M37 42 q1 -4 4 -5" stroke="#5a3a1a" strokeWidth="1.4" fill="none" />
      <circle cx="63" cy="52" r="8.5" fill={`url(#${id}ap)`} stroke="#5e120c" strokeWidth="1.1" />
      {leaf(63, 44, -40, 0)}
      <ellipse cx="50" cy="49" rx="7" ry="9" fill="#c9c24a" stroke="#5e5a14" strokeWidth="1" />
      <ellipse cx="48" cy="46" rx="2" ry="3" fill="#f2ec9a" opacity=".8" />
      {/* woven basket */}
      <path d="M19 57 H81 L72 89 H28 Z" fill={`url(#${id}bk)`} stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
      {[65, 73, 81].map((y) => <path key={y} d={`M${21 + (y - 57) * 0.28} ${y} H${79 - (y - 57) * 0.28}`} stroke="#6e4a1c" strokeWidth="1.6" />)}
      {[30, 40, 50, 60, 70].map((x) => <path key={x} d={`M${x} 58 L${x - (x - 50) * 0.18} 88`} stroke="#6e4a1c" strokeWidth="1.3" />)}
      <rect x="16" y="52" width="68" height="8" rx="4" fill="#d8a85e" stroke={INK} strokeWidth="1.4" />
      <path d="M20 54.5 H80" stroke="#f2cf8a" strokeWidth="1.1" strokeLinecap="round" />
    </>
  ),
  monopoly: (id) => (
    <>
      <defs>
        <linearGradient id={`${id}au`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff0a8" /><stop offset=".5" stopColor="#f0c040" /><stop offset="1" stopColor="#b07514" /></linearGradient>
        <radialGradient id={`${id}cu`} cx=".5" cy=".3" r=".8"><stop offset="0" stopColor="#b8382e" /><stop offset="1" stopColor="#5e120e" /></radialGradient>
      </defs>
      {/* cushion with tassels */}
      <path d="M12 76 Q50 62 88 76 Q92 84 84 89 Q50 97 16 89 Q8 84 12 76 Z" fill={`url(#${id}cu)`} stroke="#3e0e0b" strokeWidth="1.5" />
      <path d="M18 79 Q50 69 82 79" stroke="#e08070" strokeWidth="1" fill="none" opacity=".6" />
      {[[12, 78], [88, 78]].map(([x, y]) => <g key={x}><circle cx={x} cy={y} r="2.6" fill="#e2b23c" stroke="#6b4512" strokeWidth=".8" /><path d={`M${x} ${y + 2} l-2 8 h4 z`} fill="#e2b23c" stroke="#6b4512" strokeWidth=".7" /></g>)}
      {/* crown */}
      <path d="M23 70 L18 32 L35 50 L50 22 L65 50 L82 32 L77 70 Z" fill={`url(#${id}au)`} stroke="#6b4512" strokeWidth="2" strokeLinejoin="round" />
      <path d="M50 28 L50 62 M29 44 L32 64 M71 44 L68 64" stroke="#fff6c8" strokeWidth="1.2" opacity=".6" />
      <rect x="21" y="63" width="58" height="11" rx="3" fill={`url(#${id}au)`} stroke="#6b4512" strokeWidth="2" />
      {[[18, 31], [50, 21], [82, 31]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="4.2" fill="#fff0b8" stroke="#6b4512" strokeWidth="1.4" />)}
      <circle cx="50" cy="68.5" r="3.8" fill="#d6352a" stroke="#5e120c" strokeWidth=".8" /><circle cx="49" cy="67.5" r="1.2" fill="#ffb0a0" />
      <circle cx="35" cy="68.5" r="2.8" fill="#2f6fb3" stroke="#14325a" strokeWidth=".7" /><circle cx="65" cy="68.5" r="2.8" fill="#2f6fb3" stroke="#14325a" strokeWidth=".7" />
    </>
  ),
  victoryPoint: (id) => (
    <>
      <defs>
        <linearGradient id={`${id}au`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff0a8" /><stop offset=".55" stopColor="#efbe3e" /><stop offset="1" stopColor="#b47812" /></linearGradient>
      </defs>
      {/* laurel branches */}
      {Array.from({ length: 7 }, (_, i) => {
        const t = i / 6, a = Math.PI * (0.6 + t * 0.66), x = 50 + Math.cos(a) * 37, y = 50 + Math.sin(a) * 35
        return <g key={i}>{leaf(x, y, (a * 180) / Math.PI + 75, i, 1.5)}{leaf(100 - x, y, 180 - (a * 180) / Math.PI - 75, i + 10, 1.5)}</g>
      })}
      {/* trophy cup, the same shape as the HUD's points icon */}
      <path d="M30 18 H70 V30 C70 46 62 56 50 58 C38 56 30 46 30 30 Z" fill={`url(#${id}au)`} stroke="#6b4512" strokeWidth="2" />
      <path d="M35 22 V34 C35 42 39 48 44 51" stroke="#fff6c8" strokeWidth="2" fill="none" strokeLinecap="round" opacity=".7" />
      <path d="M30 24 H20 C20 36 26 42 34 44 M70 24 H80 C80 36 74 42 66 44" fill="none" stroke="#b07a1a" strokeWidth="4" strokeLinecap="round" />
      <rect x="46" y="57" width="8" height="12" fill="#c98a1c" stroke="#6b4512" strokeWidth="1.5" />
      <rect x="34" y="68" width="32" height="8" rx="2" fill={`url(#${id}au)`} stroke="#6b4512" strokeWidth="1.5" />
      <rect x="30" y="76" width="40" height="9" rx="2" fill="#6b4524" stroke="#3a2414" strokeWidth="1.5" />
      <path d="M50 27 L53 34 L60.5 34.5 L54.8 39.4 L56.6 46.8 L50 42.8 L43.4 46.8 L45.2 39.4 L39.5 34.5 L47 34 Z" fill="#fff6dc" stroke="#6b4512" strokeWidth="1" />
    </>
  ),
}

/**
 * A development card face. `thumb` is the list size (38×50; 30×40 on screens under 560 px high, so
 * list rows keep their old height there); `large` adds the name under the art
 * (92×124, or 72×98 when `compact`). `dim` greys a card that can't be played now.
 */
export function DevCard({ type, name, size = 'thumb', compact = false, dim = false, className = '' }: {
  type: DevCardType; name?: string; size?: 'thumb' | 'large'; compact?: boolean; dim?: boolean; className?: string
}) {
  const id = useId().replace(/:/g, '')
  const tint = DEV_TINT[type]
  const dims = size === 'thumb' ? 'h-[50px] w-[38px] [@media(max-height:560px)]:h-[40px] [@media(max-height:560px)]:w-[30px] rounded-[5px] p-[2px]' : compact ? 'h-[98px] w-[72px] rounded-[8px] p-[3px]' : 'h-[124px] w-[92px] rounded-[9px] p-[3px]'
  return (
    <span aria-hidden className={`relative flex shrink-0 flex-col ${dims} ${PARCHMENT_FRAME} ${dim ? 'opacity-70 grayscale-[0.35]' : ''} ${className}`}>
      <span className={`relative block min-h-0 flex-1 overflow-hidden ${size === 'thumb' ? 'rounded-[3px]' : 'rounded-[6px]'}`}
        style={{ background: `radial-gradient(circle at 50% 42%, #fffaf0 0%, #f3e6c8 45%, color-mix(in srgb, ${tint} 30%, #e2cfa4) 100%)`, boxShadow: `inset 0 0 0 1px rgba(90,60,25,0.55), inset 0 3px 0 ${tint}` }}>
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full drop-shadow-[0_2px_1.5px_rgba(60,40,15,0.45)]">{ART[type](id)}</svg>
      </span>
      {size === 'large' && name && (
        <span className={`block truncate text-center font-display font-semibold leading-none text-[#2b2118] ${compact ? 'pt-[3px] text-[11px]' : 'pt-[4px] text-[12.5px]'}`}>{name}</span>
      )}
    </span>
  )
}

/** The card back: dark leather with the island mark, used where a card's type is hidden or not yet known. */
export function DevCardBack({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden className={`relative grid shrink-0 place-items-center rounded-[4px] p-[1.5px] ${PARCHMENT_FRAME} ${className}`}>
      <span className="grid h-full w-full place-items-center rounded-[3px] bg-[radial-gradient(circle_at_50%_40%,#5a3a22,#24160c)]">
        <HexLogo className="h-[70%] w-[70%]" />
      </span>
    </span>
  )
}
