// Hand-drawn SVG illustrations used by the HUD.
import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>

export const Logs = (p: P) => (
  <svg viewBox="0 0 100 80" {...p}>
    <defs>
      <linearGradient id="bark" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#b5703a" />
        <stop offset="1" stopColor="#6a3818" />
      </linearGradient>
      <radialGradient id="ring" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#f2c98c" />
        <stop offset="0.7" stopColor="#d79a5a" />
        <stop offset="1" stopColor="#8a4f22" />
      </radialGradient>
    </defs>
    {[
      [8, 46],
      [36, 46],
      [22, 22],
    ].map(([x, y], i) => (
      <g key={i} transform={`translate(${x} ${y}) rotate(-12)`}>
        <rect x="0" y="0" width="52" height="22" rx="10" fill="url(#bark)" />
        <path d="M6 6 H40 M10 15 H44" stroke="#4e2810" strokeWidth="1.5" opacity=".5" />
        <ellipse cx="50" cy="11" rx="8" ry="11" fill="url(#ring)" />
        <ellipse cx="50" cy="11" rx="3.5" ry="5" fill="none" stroke="#8a4f22" strokeWidth="1.2" />
      </g>
    ))}
  </svg>
)

export const Brick = (p: P) => (
  <svg viewBox="0 0 100 80" {...p}>
    <defs>
      <linearGradient id="bk" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#e2774f" />
        <stop offset="1" stopColor="#9b3a20" />
      </linearGradient>
    </defs>
    {[
      [10, 44], [42, 44], [26, 22], [58, 22], [74, 44],
    ].map(([x, y], i) => (
      <g key={i} transform={`translate(${x - 4} ${y})`}>
        <path d={`M0 8 L12 0 H40 L28 8 Z`} fill="#f09a74" />
        <rect x="0" y="8" width="28" height="16" fill="url(#bk)" />
        <path d="M28 8 L40 0 V16 L28 24 Z" fill="#7d2c17" />
      </g>
    ))}
  </svg>
)

export const SheepIcon = (p: P) => (
  <svg viewBox="0 0 100 80" {...p}>
    {[30, 42, 60, 70].map((x) => (
      <rect key={x} x={x} y="52" width="5" height="18" rx="2" fill="#2b2522" />
    ))}
    {[
      [36, 40, 16], [52, 32, 17], [68, 40, 15], [46, 50, 16], [62, 50, 15], [52, 42, 18],
    ].map(([cx, cy, r], i) => (
      <circle key={i} cx={cx} cy={cy} r={r} fill="#fbf8f1" stroke="#cfc6b6" strokeWidth="1.5" />
    ))}
    <ellipse cx="22" cy="36" rx="10" ry="12" fill="#3a322e" />
    <ellipse cx="14" cy="30" rx="6" ry="3" fill="#3a322e" transform="rotate(-25 14 30)" />
    <circle cx="19" cy="34" r="1.6" fill="#fff" />
  </svg>
)

export const WheatIcon = (p: P) => (
  <svg viewBox="0 0 100 80" {...p}>
    {[-14, 0, 14].map((rot, k) => (
      <g key={k} transform={`rotate(${rot} 50 76)`}>
        <path d="M50 76 Q51 40 50 10" stroke="#a87418" strokeWidth="3" fill="none" />
        {Array.from({ length: 6 }, (_, i) => (
          <g key={i}>
            <ellipse cx="44" cy={18 + i * 8} rx="6" ry="3.3" fill="#f0bd45" transform={`rotate(-35 44 ${18 + i * 8})`} />
            <ellipse cx="56" cy={18 + i * 8} rx="6" ry="3.3" fill="#e2a530" transform={`rotate(35 56 ${18 + i * 8})`} />
          </g>
        ))}
        <ellipse cx="50" cy="12" rx="3.5" ry="6" fill="#f6cf62" />
      </g>
    ))}
  </svg>
)

export const Ore = (p: P) => (
  <svg viewBox="0 0 100 80" {...p}>
    {[
      [22, 48, 18], [50, 52, 20], [76, 50, 16], [36, 30, 16], [62, 30, 17],
    ].map(([x, y, r], i) => (
      <g key={i}>
        <path d={`M${x - r} ${y + 4} L${x - r * 0.5} ${y - r * 0.8} L${x + r * 0.6} ${y - r * 0.7} L${x + r} ${y + 2} L${x + r * 0.4} ${y + r * 0.7} L${x - r * 0.6} ${y + r * 0.7} Z`} fill="#8e9298" />
        <path d={`M${x - r * 0.5} ${y - r * 0.8} L${x + r * 0.6} ${y - r * 0.7} L${x + r * 0.1} ${y} L${x - r * 0.7} ${y + 2} Z`} fill="#c6cace" />
        <path d={`M${x + r * 0.1} ${y} L${x + r} ${y + 2} L${x + r * 0.4} ${y + r * 0.7} Z`} fill="#5d6167" />
      </g>
    ))}
  </svg>
)

export const HexLogo = (p: P) => (
  <svg viewBox="0 0 64 64" {...p}>
    <defs>
      <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ffd77a" />
        <stop offset="1" stopColor="#c47a1c" />
      </linearGradient>
    </defs>
    <path d="M32 3 L57 17.5 V46.5 L32 61 L7 46.5 V17.5 Z" fill="#1b1410" stroke="url(#lg)" strokeWidth="4" />
    {/* stylised island + sail */}
    <path d="M14 42 Q32 34 50 42 L46 48 H18 Z" fill="#7aa63a" />
    <path d="M32 14 L32 40 L46 38 Z" fill="#f4ead2" />
    <path d="M30 18 L30 40 L19 38 Z" fill="#e6d2a4" />
    <path d="M31 12 V42" stroke="#ffd77a" strokeWidth="2" />
  </svg>
)

const skin = ['#e7b48f', '#f1c7a5', '#c98c62', '#f3d2b8']
const hair = ['#2a1a12', '#1a1a22', '#4a2a16', '#e2b86a']
/** Stylised illustrated avatar. */
export function Avatar({ i, className }: { i: number; className?: string }) {
  const long = i === 1 || i === 3
  return (
    <svg viewBox="0 0 64 64" className={className}>
      <defs>
        <radialGradient id={`bg${i}`} cx="0.5" cy="0.35" r="0.8">
          <stop offset="0" stopColor={['#c9533f', '#4b77d1', '#d68a3a', '#a8b4c4'][i]} />
          <stop offset="1" stopColor={['#5a1a12', '#162c63', '#6a3a12', '#3d4656'][i]} />
        </radialGradient>
      </defs>
      <rect width="64" height="64" fill={`url(#bg${i})`} />
      {long && <path d="M14 30 Q12 58 20 62 H44 Q52 58 50 30 Z" fill={hair[i]} />}
      <path d="M12 64 Q14 46 32 46 Q50 46 52 64 Z" fill={['#7a2a1e', '#2d3f7a', '#8a5a2a', '#e6e2da'][i]} />
      <rect x="27" y="38" width="10" height="10" fill={skin[i]} />
      <ellipse cx="32" cy="30" rx="12" ry="14" fill={skin[i]} />
      <path d={long ? 'M19 30 Q18 13 32 13 Q46 13 45 30 Q42 20 32 19 Q22 20 19 30 Z' : 'M20 26 Q19 13 32 13 Q45 13 44 26 Q40 19 32 19 Q24 19 20 26 Z'} fill={hair[i]} />
      {i === 0 && <path d="M21 33 Q22 46 32 46 Q42 46 43 33 Q40 41 32 41 Q24 41 21 33 Z" fill={hair[0]} />}
      <ellipse cx="27" cy="30" rx="1.6" ry="2" fill="#1f1612" />
      <ellipse cx="37" cy="30" rx="1.6" ry="2" fill="#1f1612" />
      <path d="M28 37 Q32 39.5 36 37" stroke="#8a4a3a" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  )
}
