import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
import gsap from 'gsap'
import { Avatar, Brick, HexLogo, Logs, Ore, SheepIcon, WheatIcon } from './icons'
import { BRAND_NAME } from '../brand'

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

const panel =
  'bg-[linear-gradient(180deg,rgba(28,32,40,0.88),rgba(12,14,19,0.9))] backdrop-blur-md border border-[#c9a45c]/35 shadow-[0_10px_30px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)]'

function Brand() {
  return (
    <div className="absolute left-[18px] top-[8px] flex items-center gap-3 rounded-[14px] pr-5 pl-1.5 py-1.5 bg-[linear-gradient(90deg,rgba(10,12,16,0.75),rgba(10,12,16,0.0))]">
      <div className="h-[50px] w-[50px] rounded-full bg-[radial-gradient(circle_at_40%_35%,#3a2a1a,#120c08)] border-2 border-[#e0a94a] shadow-[0_0_14px_rgba(224,169,74,0.45)] grid place-items-center">
        <HexLogo className="h-[38px] w-[38px]" />
      </div>
      <div className="font-display text-[27px] font-semibold tracking-tight text-[#f4efe6] drop-shadow-[0_2px_3px_rgba(0,0,0,0.8)]">
        {BRAND_NAME} <span className="text-[#f2b544]">3D</span>
      </div>
    </div>
  )
}

const NavIcon = ({ d }: { d: ReactNode }) => (
  <svg viewBox="0 0 24 24" className="h-[24px] w-[24px]" fill="currentColor">
    {d}
  </svg>
)

function Nav() {
  const items: [string, ReactNode][] = [
    ['Home', <path key="h" d="M12 3 2 11.5h3V21h5.5v-6h3v6H19v-9.5h3z" />],
    ['Game', <g key="g"><circle cx="8" cy="8" r="3.4" /><circle cx="16.5" cy="8.5" r="3" /><path d="M1.5 20c0-4 3-6.5 6.5-6.5s6.5 2.5 6.5 6.5z" /><path d="M14 13.6c3.6-.6 8 1.4 8.5 6.4h-6.3c0-2.4-.8-4.6-2.2-6.4z" /></g>],
    ['Stats', <g key="s"><circle cx="12" cy="6" r="3.2" /><path d="M5 21v-3.5C5 14 8 11.5 12 11.5s7 2.5 7 6V21z" /><rect x="3" y="19" width="18" height="3" rx="1" /></g>],
    ['Settings', <path key="st" d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.4-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.3h-4l-.4 2.7a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.4L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.4 2.5-1a7.4 7.4 0 0 0 1.7 1l.4 2.7h4l.4-2.7a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)" />],
  ]
  return (
    <nav className={`absolute left-[16px] top-[82px] w-[122px] rounded-[12px] p-[5px] ${panel}`}>
      {items.map(([label, d], i) => (
        <button
          key={label}
          className={`flex w-full items-center gap-[11px] rounded-[9px] px-[11px] h-[47px] mb-[5px] last:mb-0 text-[14.5px] font-medium transition-colors ${
            i === 0
              ? 'bg-[linear-gradient(180deg,rgba(60,70,90,0.55),rgba(30,36,48,0.6))] text-white ring-1 ring-[#8fa8d0]/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]'
              : 'text-[#e3e1dc] hover:bg-white/5'
          }`}
        >
          <span className={i === 0 ? 'text-[#f1d9a8]' : 'text-[#c9ccd2]'}>
            <NavIcon d={d} />
          </span>
          {label}
        </button>
      ))}
    </nav>
  )
}

function IconButton({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <button className={`grid h-[38px] w-[38px] place-items-center rounded-[9px] text-[#ece8e0] ${panel} ${className}`}>
      {children}
    </button>
  )
}

const PLAYERS = [
  { name: 'Alex', vp: 5, cards: 7, color: '#d23a2e' },
  { name: 'Maria', vp: 4, cards: 6, color: '#2f5fe0' },
  { name: 'Den', vp: 5, cards: 7, color: '#e0812f' },
  { name: 'Kate', vp: 3, cards: 5, color: '#c9ccd2' },
]

const Trophy = () => (
  <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="#f2b544">
    <path d="M6 3h12v3h3v2a5 5 0 0 1-4.6 5A6 6 0 0 1 13 16.6V19h4v2H7v-2h4v-2.4A6 6 0 0 1 7.6 13 5 5 0 0 1 3 8V6h3zm0 5V8H5a3 3 0 0 0 1.3 2.5A6 6 0 0 1 6 8zm12 0a6 6 0 0 1-.3 2.5A3 3 0 0 0 19 8z" />
  </svg>
)
const CardsIco = () => (
  <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="#e8e4dc" strokeWidth="2">
    <rect x="6" y="5" width="12" height="15" rx="2" />
    <path d="M9 5V3.5h8.5a1.5 1.5 0 0 1 1.5 1.5v12" />
  </svg>
)

function Players() {
  return (
    <div className="absolute right-[18px] top-[66px] flex w-[212px] flex-col gap-[7px]">
      {PLAYERS.map((p, i) => (
        <div
          key={p.name}
          className={`relative flex h-[62px] items-center gap-[12px] overflow-hidden rounded-[8px] pl-[6px] pr-3 ${panel}`}
          style={{ boxShadow: `inset 3px 0 0 ${p.color}, inset 0 0 0 1px ${p.color}55, 0 8px 22px rgba(0,0,0,.5)` }}
        >
          <div className="h-[50px] w-[50px] shrink-0 overflow-hidden rounded-[7px] ring-2" style={{ ['--tw-ring-color' as string]: p.color }}>
            <Avatar i={i} className="h-full w-full" />
          </div>
          <div className="flex-1">
            <div className="text-[15px] font-semibold text-white leading-none mb-[8px]">{p.name}</div>
            <div className="flex items-center gap-[22px] text-[14px] text-[#ece8e0] leading-none">
              <span className="flex items-center gap-[5px]"><Trophy />{p.vp}</span>
              <span className="flex items-center gap-[5px]"><CardsIco />{p.cards}</span>
            </div>
          </div>
          <span className="absolute right-[10px] top-[9px] h-[9px] w-[9px] rounded-full bg-[#3fd25a] shadow-[0_0_8px_#3fd25a]" />
        </div>
      ))}
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
function Die({ faces, rot }: { faces: [number, number, number]; rot: string }) {
  const S = 54
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

function DiceArea() {
  const dice = useRef<HTMLDivElement>(null)
  const roll = () => {
    if (!dice.current) return
    gsap.fromTo(dice.current.children, { y: -18, rotate: -25 }, { y: 0, rotate: 0, duration: 0.7, ease: 'bounce.out', stagger: 0.08 })
  }
  return (
    <div className="absolute right-[14px] top-[420px] w-[232px]">
      <div ref={dice} className="relative z-10 mx-auto flex w-[150px] justify-between drop-shadow-[0_10px_8px_rgba(0,0,0,0.55)]">
        <Die faces={[5, 1, 3]} rot="rotateX(-24deg) rotateY(-28deg) rotateZ(-4deg)" />
        <Die faces={[6, 2, 4]} rot="rotateX(-22deg) rotateY(30deg) rotateZ(6deg)" />
      </div>
      {/* wooden plinth */}
      <div className="relative -mt-[18px] h-[96px] rounded-[28px] bg-[linear-gradient(180deg,#6b4a2c,#3d2817_60%,#2a1b10)] shadow-[0_14px_30px_rgba(0,0,0,0.6),inset_0_2px_0_rgba(255,220,170,0.25),inset_0_-6px_12px_rgba(0,0,0,0.5)] ring-1 ring-black/40">
        <div className="absolute inset-x-[10px] top-[8px] h-[8px] rounded-full bg-[repeating-linear-gradient(90deg,rgba(0,0,0,0.12)_0_6px,rgba(255,255,255,0.03)_6px_14px)]" />
        <button
          onClick={roll}
          className="absolute left-1/2 top-[30px] h-[46px] w-[176px] -translate-x-1/2 rounded-full border-2 border-[#ffe7a6] bg-[linear-gradient(180deg,#ffe08a_0%,#f4b33a_45%,#d98a16_100%)] font-display text-[21px] font-semibold text-[#3a2208] shadow-[0_0_18px_rgba(255,190,70,0.7),0_4px_0_#8a5410,inset_0_2px_0_rgba(255,255,255,0.7)] transition-transform hover:scale-[1.03] active:translate-y-[2px]"
        >
          Roll Dice
        </button>
      </div>
    </div>
  )
}

const RESOURCES = [
  { n: 3, Icon: Logs, bg: 'from-[#5f8a32] to-[#2f4a18]' },
  { n: 2, Icon: Brick, bg: 'from-[#b9522c] to-[#6a2512]' },
  { n: 1, Icon: SheepIcon, bg: 'from-[#8fc04e] to-[#4a7a22]' },
  { n: 4, Icon: WheatIcon, bg: 'from-[#f0b43c] to-[#b7741a]' },
  { n: 1, Icon: Ore, bg: 'from-[#8a96a8] to-[#4a5363]' },
]

function ResourceCards() {
  return (
    <div className="absolute bottom-0 left-1/2 -translate-x-[54%]">
      {/* wooden tray */}
      <div className="absolute -bottom-[30px] left-1/2 h-[64px] w-[700px] -translate-x-1/2 rounded-[40px_40px_0_0] bg-[linear-gradient(180deg,#5c3d22,#2c1c10)] shadow-[0_-6px_20px_rgba(0,0,0,0.5),inset_0_2px_0_rgba(255,210,160,0.2)]" />
      <div className="relative flex gap-[8px] pb-[12px]">
        {RESOURCES.map(({ n, Icon, bg }, i) => (
          <div
            key={i}
            className="relative h-[96px] w-[88px] rounded-[9px] p-[3px] bg-[linear-gradient(180deg,#ffe2a0,#b98a3a_50%,#f2cf84)] shadow-[0_10px_22px_rgba(0,0,0,0.6)] transition-transform hover:-translate-y-[4px]"
          >
            <div className={`relative h-full w-full overflow-hidden rounded-[7px] bg-gradient-to-b ${bg} shadow-[inset_0_0_14px_rgba(0,0,0,0.45)]`}>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.28),transparent_60%)]" />
              <Icon className="absolute left-1/2 top-[54%] w-[78px] -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_4px_3px_rgba(0,0,0,0.45)]" />
              <span className="absolute left-[4px] top-[4px] grid h-[22px] w-[22px] place-items-center rounded-[5px] bg-[#1d1a16]/85 text-[14px] font-bold text-white ring-1 ring-[#f2cf84]/60">
                {n}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const Arrow = () => (
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

function BuildPanel() {
  const rows: [ReactNode, ReactNode[]][] = [
    [<RoadIco key="r" />, [<Logs key="a" />, <Brick key="b" />]],
    [<HouseIco key="h" />, [<Logs key="a" />, <Brick key="b" />, <SheepIcon key="c" />, <WheatIcon key="d" />]],
    [<HouseIco key="c" city />, [<WheatIcon key="a" />, <Ore key="b" />, <Ore key="c" />]],
  ]
  return (
    <div className={`absolute bottom-[42px] right-[16px] w-[246px] rounded-[14px] px-[16px] pb-[10px] pt-[12px] ${panel}`}>
      <div className="mb-[8px] font-display text-[20px] font-medium text-[#f4efe6]">Build</div>
      {rows.map(([ico, costs], i) => (
        <div key={i} className="flex h-[46px] items-center gap-[12px] border-b border-white/5">
          <span className="w-[28px]">{ico}</span>
          <div className="flex flex-1 items-center gap-[3px]">
            {costs.map((c, k) => (
              <span key={k} className="block h-[26px] w-[34px] [&>svg]:h-full [&>svg]:w-full">{c}</span>
            ))}
          </div>
          <span className="text-[#ece8e0]"><Arrow /></span>
        </div>
      ))}
      <div className="flex h-[46px] items-center gap-[12px]">
        <span className="grid h-[26px] w-[24px] place-items-center rounded-[4px] border border-[#d9cbb0]/70 text-[14px] font-bold text-[#efe6d4]">?</span>
        <div className="flex-1" />
        <span className="text-[#ece8e0]/40"><Arrow /></span>
      </div>
    </div>
  )
}

function BottomLeft() {
  return (
    <div className="absolute bottom-[16px] left-[22px] flex gap-[12px]">
      <IconButton className="!h-[52px] !w-[52px] !rounded-[14px]">
        <svg viewBox="0 0 24 24" className="h-[24px] w-[24px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></svg>
      </IconButton>
      <div className="relative">
        <IconButton className="!h-[52px] !w-[52px] !rounded-[14px]">
          <svg viewBox="0 0 24 24" className="h-[24px] w-[24px]" fill="currentColor"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.6 3.4 6L4.5 21l4.4-2.3c1 .2 2 .3 3.1.3 5.5 0 10-3.6 10-8s-4.5-8-10-8zM7.5 12.3a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6zm4.5 0a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6zm4.5 0a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6z" /></svg>
        </IconButton>
        <span className="absolute right-[3px] top-[3px] h-[9px] w-[9px] rounded-full bg-[#f2a33a] shadow-[0_0_6px_#f2a33a]" />
      </div>
    </div>
  )
}

export const HUD = memo(function HUD() {
  const s = useHudScale()
  return (
    <div className="pointer-events-none fixed inset-0 select-none overflow-hidden font-ui">
      <div
        className="absolute left-0 top-0 origin-top-left [&_button]:pointer-events-auto [&_nav]:pointer-events-auto"
        style={{ width: `${100 / s}vw`, height: `${100 / s}vh`, transform: `scale(${s})` }}
      >
        <Brand />
        <Nav />
        <div className="absolute right-[18px] top-[14px] flex gap-[10px]">
          <IconButton>
            <svg viewBox="0 0 24 24" className="h-[20px] w-[20px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
          </IconButton>
          <IconButton>
            <span className="text-[20px] font-bold">?</span>
          </IconButton>
        </div>
        <Players />
        <DiceArea />
        <ResourceCards />
        <BuildPanel />
        <BottomLeft />
      </div>
    </div>
  )
})
