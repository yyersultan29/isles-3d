// Development cards panel (ROADMAP G4.4e). Lists the active player's cards by type; a Play
// button is enabled exactly when legalActions offers that card (devView). Knight and Road
// Building play at once and hand over to the board (robber or free-road markers, G4.3);
// Year of Plenty and Monopoly first ask for resources here.

import { useEffect, useRef, useState } from 'react'
import { focusRing, panel } from './HUD'
import { SEATS, useGameView, type DevKind } from './gameView'
import { NAME, Tile, gold, plain, useAct } from './TradeDialog'
import { setDevOpen } from '../store/ui'
import { RESOURCE_ORDER, type Resource } from '../game'

const CARD: Record<DevKind, { name: string; blurb: string; tint: string }> = {
  knight: { name: 'Knight', blurb: 'Move the robber and steal a card', tint: '#7a4bc2' },
  roadBuilding: { name: 'Road Building', blurb: 'Build two free roads', tint: '#3f8a4a' },
  yearOfPlenty: { name: 'Year of Plenty', blurb: 'Take any two resources from the bank', tint: '#c9902a' },
  monopoly: { name: 'Monopoly', blurb: 'Take one resource from every player', tint: '#b8452f' },
  victoryPoint: { name: 'Victory Point', blurb: '+1 VP, kept hidden', tint: '#2f6fb3' },
}

export function DevGlyph({ type, className = '' }: { type: DevKind; className?: string }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className}>
      {type === 'knight' && <g {...p}><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /><path d="M9 12l2 2 4-4" /></g>}
      {type === 'roadBuilding' && <g {...p}><path d="M8 21L11 3M16 21L13 3" /><path d="M12 7v2M12 12v2M12 17v2" /></g>}
      {type === 'yearOfPlenty' && <g {...p}><path d="M12 21c-4 0-7-3-7-7 0-3 2-5 4-6M12 21c4 0 7-3 7-7 0-3-2-5-4-6" /><path d="M12 3v10M8 9l4 4 4-4" /></g>}
      {type === 'monopoly' && <g {...p}><path d="M4 18h16M5 18l-1-9 5 4 3-7 3 7 5-4-1 9" /></g>}
      {type === 'victoryPoint' && <g {...p}><path d="M7 4h10v4a5 5 0 0 1-10 0z" /><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9 17h6" /></g>}
    </svg>
  )
}

function Picker({ kind, compact, onDone, onBack }: { kind: 'yearOfPlenty' | 'monopoly'; compact: boolean; onDone: () => void; onBack: () => void }) {
  const { dev } = useGameView()
  const act = useAct()
  const [take, setTake] = useState<Resource[]>([])
  const [mono, setMono] = useState<Resource | null>(null)
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => { first.current?.focus() }, [])
  const yop = kind === 'yearOfPlenty'
  const n = (r: Resource) => take.filter((x) => x === r).length
  const ready = yop ? take.length === dev.yopTake && dev.yopTake > 0 : !!mono
  const play = () => {
    const ok = yop ? act(dev.player, { type: 'PLAY_YEAR_OF_PLENTY', take }) : mono && act(dev.player, { type: 'PLAY_MONOPOLY', resource: mono })
    if (ok) onDone()
  }
  const summary = yop
    ? take.length ? `Take ${take.map((r) => NAME[r]).join(' + ')}` : `Choose ${dev.yopTake === 1 ? 'one resource' : 'two resources (the same twice is fine)'}`
    : mono ? `Take every ${NAME[mono]} from the other players` : 'Choose a resource'
  const firstRes = RESOURCE_ORDER.find((r) => !yop || dev.bank[r] > 0)
  return (
    <>
      <p className="mb-[6px] text-[13px] text-[#d6d2ca]">{yop ? 'Take from the bank' : 'Name a resource'} {yop && <span className="text-[#a9a49b]">(bank has)</span>}</p>
      <div className="flex gap-[8px]">
        {RESOURCE_ORDER.map((r) => yop ? (
          <div key={r} className="relative">
            <Tile res={r} compact={compact} btnRef={r === firstRes ? first : undefined} top={n(r) ? `×${n(r)}` : ''} corner={String(dev.bank[r])} selected={n(r) > 0}
              disabled={take.length >= dev.yopTake || dev.bank[r] <= n(r)} label={`Take one ${NAME[r]} (bank has ${dev.bank[r]})`} onClick={() => setTake([...take, r])} />
            {n(r) > 0 && <button aria-label={`Take one less ${NAME[r]}`} onClick={() => { const i = take.lastIndexOf(r); setTake(take.filter((_, k) => k !== i)) }}
              className={`absolute -right-[5px] -top-[7px] grid h-[22px] w-[22px] place-items-center rounded-full bg-[#c8302a] text-[15px] font-bold leading-none text-white shadow-[0_2px_6px_rgba(0,0,0,.5)] ${focusRing}`}>−</button>}
          </div>
        ) : (
          <Tile key={r} res={r} compact={compact} btnRef={r === firstRes ? first : undefined} top="" corner="" selected={mono === r} disabled={false}
            label={`Monopoly on ${NAME[r]}`} onClick={() => setMono(mono === r ? null : r)} />
        ))}
      </div>
      <p aria-live="polite" className="mt-[10px] text-[14px] font-semibold text-[#f2cf84]">{summary}</p>
      <div className="mt-[6px] flex items-center justify-between gap-[10px]">
        <button onClick={onBack} className={plain()}>Back</button>
        <button onClick={play} disabled={!ready} aria-label={`Play ${CARD[kind].name}`} className={gold()}>Play</button>
      </div>
    </>
  )
}

export function DevDialog({ compact }: { compact: boolean }) {
  const { dev } = useGameView()
  const act = useAct()
  const [pick, setPick] = useState<'yearOfPlenty' | 'monopoly' | null>(null)
  const first = useRef<HTMLButtonElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (!pick) (first.current ?? close.current)?.focus() }, [pick])
  const seat = SEATS[dev.player]
  const firstPlayable = dev.rows.find((r) => r.playable)?.type
  const play = (type: DevKind) => {
    if (type === 'knight') act(dev.player, { type: 'PLAY_KNIGHT' }) // the robber phase closes the panel
    else if (type === 'roadBuilding') act(dev.player, { type: 'PLAY_ROAD_BUILDING' })
    else if (type === 'yearOfPlenty' || type === 'monopoly') setPick(type)
  }
  return (
    <section role="dialog" aria-labelledby="dev-title" className={`pointer-events-auto rounded-[14px] px-[14px] pb-[12px] pt-[10px] ${panel}`} style={{ boxShadow: `inset 0 0 0 2px ${seat.color}aa, 0 14px 34px rgba(0,0,0,.6)` }}>
      <div className="mb-[8px] flex items-center justify-between gap-[10px]">
        <h2 id="dev-title" className="whitespace-nowrap font-display text-[19px] font-semibold text-[#f4efe6]">
          <span className="mr-[8px] inline-block h-[11px] w-[11px] rounded-full align-middle" style={{ background: seat.color }} />
          {pick ? `${seat.name}: ${CARD[pick].name}` : `${seat.name}: development cards`}
        </h2>
        <button ref={close} aria-label="Close development cards" onClick={() => setDevOpen(false)} className={`grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px] bg-white/10 text-[18px] text-white hover:bg-white/20 ${focusRing}`}>×</button>
      </div>
      {pick ? <Picker kind={pick} compact={compact} onDone={() => setDevOpen(false)} onBack={() => setPick(null)} /> : (
        dev.rows.length === 0
          ? <p className={`${compact ? 'w-[322px]' : 'w-[380px]'} text-[14px] text-[#d6d2ca]`}>No development cards yet. Buy one from the Build menu (1 wool, 1 grain, 1 ore).</p>
          : (
            <ul className={`flex ${compact ? 'w-[322px]' : 'w-[390px]'} flex-col gap-[6px]`}>
              {dev.rows.map((r) => (
                <li key={r.type} className="flex min-h-[50px] items-center gap-[10px] rounded-[10px] bg-white/[0.05] py-[4px] pl-[5px] pr-[6px]" style={{ boxShadow: `inset 3px 0 0 ${CARD[r.type].tint}` }}>
                  <span className="relative grid h-[40px] w-[34px] shrink-0 place-items-center rounded-[6px] text-white" style={{ background: `linear-gradient(180deg, ${CARD[r.type].tint}, ${CARD[r.type].tint}99)` }}>
                    <DevGlyph type={r.type} className="h-[22px] w-[22px]" />
                    {r.count > 1 && <span className="absolute -right-[6px] -top-[6px] rounded-full bg-[#1d1a16] px-[5px] text-[11px] font-bold text-white ring-1 ring-white/30">×{r.count}</span>}
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block text-[15px] font-semibold text-white">{CARD[r.type].name}</span>
                    <span className="block text-[12px] text-[#bdb8af]">{r.reason && !r.playable ? r.reason : CARD[r.type].blurb}</span>
                  </span>
                  {r.type !== 'victoryPoint' && (
                    <button ref={r.type === firstPlayable ? first : undefined} disabled={!r.playable} onClick={() => play(r.type)}
                      aria-label={`Play ${CARD[r.type].name}${r.reason ? ` (${r.reason})` : ''}`} title={r.reason ?? CARD[r.type].blurb}
                      className={`${gold()} !h-[34px] !px-[16px] !text-[15px]`}>Play</button>
                  )}
                </li>
              ))}
            </ul>
          )
      )}
    </section>
  )
}
