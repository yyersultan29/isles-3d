// Victory card (ROADMAP G4.5d, §18 gameOver): the winner, a final score table with VP cards
// revealed, and a new game. No full-screen backdrop: the camera stays free, and the card can be
// tucked away to look at the board.

import { useEffect, useRef, useState } from 'react'
import { Avatar } from './icons'
import { focusRing, panel } from './HUD'
import { useGameView } from './gameView'
import { useGameStore } from '../store/GameProvider'

const newSeed = () => Math.floor(Math.random() * 2 ** 31)

export function Victory({ compact = false }: { compact?: boolean }) {
  const { final } = useGameView()
  const store = useGameStore()
  const [hidden, setHidden] = useState(false)
  const again = useRef<HTMLButtonElement>(null)
  const pill = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (final) (hidden ? pill : again).current?.focus() }, [final, hidden])
  useEffect(() => { if (!final) setHidden(false) }, [final])
  if (!final) return null
  const w = final.rows[0]
  const newGame = () => store.reset({ seed: newSeed(), boardPreset: 'standard-fixed' })

  if (hidden) return (
    <div className="pointer-events-none absolute inset-x-0 flex justify-center" style={{ bottom: compact ? 160 : 140 }}>
      <button ref={pill} onClick={() => setHidden(false)} className={`pointer-events-auto h-[40px] rounded-full px-[18px] font-display text-[16px] font-semibold text-[#f4efe6] ring-2 ring-[#f2b544]/80 ${panel} ${focusRing}`}>
        {w.name} won · Show results
      </button>
    </div>
  )

  const th = 'px-[6px] pb-[6px] text-[12px] font-semibold uppercase tracking-wide text-[#a9a49b]'
  const td = 'px-[6px] py-[5px] [@media(max-height:560px)]:py-[2px] text-center text-[15px] text-[#ece8e0] tabular-nums'
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center px-[8px] [@media(max-height:560px)]:pt-[66px] [@media(max-height:560px)]:pb-[6px]">
      <section role="dialog" aria-labelledby="victory-title" className={`pointer-events-auto w-full ${compact ? 'max-w-[374px]' : 'max-w-[560px]'} rounded-[16px] px-[16px] pb-[14px] pt-[16px] [@media(max-height:560px)]:pb-[10px] [@media(max-height:560px)]:pt-[10px] ${panel} animate-[notice-in_.3s_ease-out]`}
        style={{ boxShadow: `inset 0 0 0 2px ${w.color}, 0 18px 50px rgba(0,0,0,.65)` }}>
        <div className="mb-[12px] flex items-center gap-[12px] [@media(max-height:560px)]:mb-[4px]">
          <span className="h-[56px] w-[56px] shrink-0 overflow-hidden rounded-[12px] ring-[3px] [@media(max-height:560px)]:h-[36px] [@media(max-height:560px)]:w-[36px] [@media(max-height:560px)]:rounded-[8px]" style={{ ['--tw-ring-color' as string]: w.color }}><Avatar i={w.avatar} className="h-full w-full" /></span>
          <div>
            <h2 id="victory-title" className="font-display text-[26px] [@media(max-height:560px)]:text-[22px] font-semibold leading-tight text-[#f4efe6]">{w.name} wins!</h2>
            <p className="text-[14px] text-[#d6d2ca]">{w.total} victory points on turn {final.turn}</p>
          </div>
        </div>
        <table className="w-full border-collapse">
          <caption className="sr-only">Final scores</caption>
          <thead>
            <tr className="border-b border-white/10">
              <th scope="col" className={`${th} text-left`}>Player</th>
              <th scope="col" className={th} title="Settlements (1 point each)">{compact ? 'Set.' : 'Settlements'}</th>
              <th scope="col" className={th} title="Cities (2 points each)">Cities</th>
              <th scope="col" className={th} title="Longest Road and Largest Army (2 points each)">Awards</th>
              <th scope="col" className={th} title="Victory Point cards, revealed">{compact ? 'VP' : 'VP cards'}</th>
              <th scope="col" className={th}>Total</th>
            </tr>
          </thead>
          <tbody>
            {final.rows.map((r) => (
              <tr key={r.id} className={r.winner ? 'bg-[#f2b544]/10' : ''}>
                <th scope="row" className="py-[5px] [@media(max-height:560px)]:py-[2px] pl-[4px] pr-[6px] text-left">
                  <span className="flex items-center gap-[8px]">
                    <span className="h-[26px] w-[26px] shrink-0 overflow-hidden rounded-[6px]" style={{ boxShadow: `0 0 0 2px ${r.color}` }}><Avatar i={r.avatar} className="h-full w-full" /></span>
                    <span className="text-[15px] font-semibold text-white">{r.name}</span>
                  </span>
                </th>
                <td className={td}>{r.settlements}</td>
                <td className={td}>{r.cities}</td>
                <td className={`${td} text-[12px]`}>
                  {r.longestRoad || r.largestArmy
                    ? <span className="inline-flex flex-col gap-[2px] leading-tight">{r.longestRoad && <span title="Longest Road">Road</span>}{r.largestArmy && <span title="Largest Army">Army</span>}</span>
                    : <span className="text-[#77736c]">–</span>}
                </td>
                <td className={td}>{r.vpCards}</td>
                <td className={`${td} font-display text-[18px] font-semibold ${r.winner ? 'text-[#f2cf84]' : ''}`}>{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-[14px] flex items-center justify-between gap-[10px] [@media(max-height:560px)]:mt-[6px]">
          <button onClick={() => setHidden(true)} className={`h-[36px] rounded-[9px] bg-white/10 px-[14px] text-[14px] font-semibold text-white hover:bg-white/20 ${focusRing}`}>View board</button>
          <button ref={again} onClick={newGame}
            className={`h-[40px] rounded-full border-2 border-[#ffe7a6] bg-[linear-gradient(180deg,#ffe08a_0%,#f4b33a_45%,#d98a16_100%)] px-[24px] font-display text-[18px] font-semibold text-[#3a2208] ${focusRing}`}>
            New game
          </button>
        </div>
      </section>
    </div>
  )
}
