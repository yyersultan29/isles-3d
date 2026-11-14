// Development card art (ASSET_DESIGN A5): a face for each card type and a card back, in the same
// paper frame as the resource cards. The art is our own: a shield and sword (Knight), a bundle of
// road logs with a mallet, like the 3D road pieces (Road Building), a basket of grain and apples
// (Year of Plenty), a crown on a cushion (Monopoly), and the HUD's trophy with a star (Victory Point).
// Each face sits on its card colour (CARD.tint in DevDialog), so the list keeps its colour coding.

import { useId, type ReactNode } from 'react'
import { HexLogo } from '../icons'
import { PARCHMENT_FRAME } from './ResourceArt'

export type DevCardType = 'knight' | 'roadBuilding' | 'yearOfPlenty' | 'monopoly' | 'victoryPoint'

/** Card colours, the same as the list rows' accent (DevDialog CARD.tint). */
export const DEV_TINT: Record<DevCardType, string> = {
  knight: '#7a4bc2', roadBuilding: '#3f8a4a', yearOfPlenty: '#c9902a', monopoly: '#b8452f', victoryPoint: '#2f6fb3',
}

const ART: Record<DevCardType, (id: string) => ReactNode> = {
  knight: (id) => (
    <>
      <defs>
        <linearGradient id={`${id}st`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#e9edf1" /><stop offset="1" stopColor="#8d96a1" /></linearGradient>
      </defs>
      {/* sword behind the shield */}
      <g transform="rotate(-38 50 52)">
        <rect x="47" y="6" width="6" height="66" rx="2" fill={`url(#${id}st)`} stroke="#3e434a" strokeWidth="1.2" />
        <rect x="36" y="70" width="28" height="6" rx="3" fill="#c79a3c" stroke="#5a3d12" strokeWidth="1.2" />
        <rect x="47" y="76" width="6" height="14" rx="2" fill="#6b4524" />
        <circle cx="50" cy="92" r="4" fill="#c79a3c" stroke="#5a3d12" strokeWidth="1.2" />
      </g>
      {/* kite shield with a chevron */}
      <path d="M30 26 H70 V50 C70 68 60 80 50 88 C40 80 30 68 30 50 Z" fill={`url(#${id}st)`} stroke="#3e434a" strokeWidth="2" />
      {/* pale field and a dark chevron: the card colour behind it is already purple */}
      <path d="M35 31 H65 V50 C65 65 57 75 50 82 C43 75 35 65 35 50 Z" fill="#f4ead2" />
      <path d="M36 58 L50 44 L64 58 L64 67 L50 53 L36 67 Z" fill="#4a2a86" />
    </>
  ),
  roadBuilding: () => (
    <>
      {/* three bound logs, like a road piece on the board */}
      {([[22, 62], [48, 62], [35, 46]] as const).map(([x, y], i) => (
        <g key={i}>
          <rect x={x - 14} y={y - 7} width="44" height="14" rx="7" fill="#8a4d22" stroke="#4e2810" strokeWidth="1.2" />
          <ellipse cx={x + 30} cy={y} rx="5" ry="7" fill="#e8c48e" stroke="#4e2810" strokeWidth="1.2" />
          <ellipse cx={x + 30} cy={y} rx="2" ry="3" fill="none" stroke="#a8743e" strokeWidth="1" />
        </g>
      ))}
      <rect x="26" y="40" width="4" height="30" fill="#3a2414" /><rect x="58" y="40" width="4" height="30" fill="#3a2414" />
      {/* mallet */}
      <g transform="rotate(28 70 40)">
        <rect x="68" y="22" width="5" height="44" rx="2" fill="#c08a4a" stroke="#5a3d12" strokeWidth="1.2" />
        <rect x="58" y="12" width="26" height="14" rx="3" fill="#a8743e" stroke="#4e2810" strokeWidth="1.4" />
      </g>
    </>
  ),
  yearOfPlenty: () => (
    <>
      {/* wheat ears behind */}
      {[-24, -10, 6, 20].map((r) => (
        <g key={r} transform={`rotate(${r} 50 60)`}>
          <path d="M50 60 V18" stroke="#a87418" strokeWidth="2" />
          {[0, 1, 2, 3].map((k) => <ellipse key={k} cx={k % 2 ? 53 : 47} cy={22 + k * 6} rx="4" ry="2.4" fill="#f0bd45" transform={`rotate(${k % 2 ? 35 : -35} ${k % 2 ? 53 : 47} ${22 + k * 6})`} />)}
        </g>
      ))}
      {/* apples */}
      <circle cx="38" cy="52" r="9" fill="#c8302a" stroke="#6e1712" strokeWidth="1.2" /><circle cx="35" cy="49" r="2.5" fill="#f08a7a" />
      <circle cx="62" cy="53" r="8" fill="#d9472f" stroke="#6e1712" strokeWidth="1.2" /><path d="M62 45 q3 -4 7 -3" stroke="#4e7426" strokeWidth="2" fill="none" />
      {/* woven basket */}
      <path d="M20 56 H80 L72 88 H28 Z" fill="#b8863f" stroke="#5a3d12" strokeWidth="2" />
      <path d="M24 66 H76 M26 76 H74" stroke="#7a5320" strokeWidth="2" />
      {[34, 44, 56, 66].map((x) => <path key={x} d={`M${x} 57 L${x - (x - 50) * 0.15} 87`} stroke="#7a5320" strokeWidth="1.5" />)}
      <rect x="17" y="52" width="66" height="7" rx="3.5" fill="#c99a52" stroke="#5a3d12" strokeWidth="1.5" />
    </>
  ),
  monopoly: (id) => (
    <>
      <defs>
        <linearGradient id={`${id}au`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe08a" /><stop offset="1" stopColor="#c98a1c" /></linearGradient>
      </defs>
      {/* cushion */}
      <path d="M14 76 Q50 62 86 76 Q90 84 82 88 Q50 96 18 88 Q10 84 14 76 Z" fill="#7a1f1a" stroke="#3e0e0b" strokeWidth="1.5" />
      {/* crown */}
      <path d="M24 70 L20 34 L36 50 L50 24 L64 50 L80 34 L76 70 Z" fill={`url(#${id}au)`} stroke="#6b4512" strokeWidth="2" strokeLinejoin="round" />
      <rect x="22" y="64" width="56" height="10" rx="3" fill={`url(#${id}au)`} stroke="#6b4512" strokeWidth="2" />
      {[[20, 33], [50, 23], [80, 33]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="4" fill="#ffe7a6" stroke="#6b4512" strokeWidth="1.5" />)}
      <circle cx="50" cy="69" r="3.5" fill="#c8302a" /><circle cx="36" cy="69" r="2.5" fill="#2f6fb3" /><circle cx="64" cy="69" r="2.5" fill="#2f6fb3" />
    </>
  ),
  victoryPoint: (id) => (
    <>
      <defs>
        <linearGradient id={`${id}au`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffe7a6" /><stop offset="1" stopColor="#d08f1e" /></linearGradient>
      </defs>
      {/* trophy cup, the same shape as the HUD's points icon */}
      <path d="M30 18 H70 V30 C70 46 62 56 50 58 C38 56 30 46 30 30 Z" fill={`url(#${id}au)`} stroke="#6b4512" strokeWidth="2" />
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
        style={{ background: `radial-gradient(circle at 50% 42%, color-mix(in srgb, ${tint} 55%, #fff6dc) 0%, ${tint} 70%, color-mix(in srgb, ${tint} 70%, #000) 100%)` }}>
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full drop-shadow-[0_2px_1.5px_rgba(0,0,0,0.45)]">{ART[type](id)}</svg>
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
