// G10.2: a setup settlement clicked on the board waits here: what the corner gives, "Place here"
// and "Another corner". A second click on the same corner builds too, so it stays quick.

import { useEffect, useMemo } from 'react'
import { useGame, useGameStore, useSeat } from '../store/GameProvider'
import { placementTargets } from '../store/placement'
import { spotLabel } from '../store/boardCursor'
import { setPendingCorner, usePendingCorner } from '../store/ui'
import { L } from './locale'
import { focusRing, panel } from './HUD'

export function SetupConfirm({ compact = false, className = '', style }: { compact?: boolean; className?: string; style?: React.CSSProperties }) {
  const state = useGame((s) => s)
  const me = useSeat()
  const store = useGameStore()
  const at = usePendingCorner()
  const targets = useMemo(() => placementTargets(state, null, me), [state, me])
  const t = at ? targets.vertices.find((v) => v.at === at && v.action.type === 'PLACE_SETTLEMENT') : undefined

  useEffect(() => {
    if (!t) return
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') setPendingCorner(null) }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [t])

  if (!t || !targets.player) return null
  const place = () => { setPendingCorner(null); store.dispatch(targets.player!, t.action) }
  const btn = `pointer-events-auto rounded-full font-semibold transition-[filter] hover:brightness-110 ${focusRing}`
  return (
    <div className={`pointer-events-none flex justify-center ${className}`} style={style}>
      <div data-setup-confirm role="group" aria-label={L('Confirm the settlement', 'Подтвердите поселение')}
        className={`flex max-w-full flex-col items-center gap-[4px] rounded-[14px] px-[14px] py-[8px] text-[#f4efe6] ${panel}`}>
        <span className="flex flex-wrap items-center justify-center gap-x-[12px] gap-y-[6px]">
        <span aria-live="polite" className={`${compact ? 'text-[13px]' : 'text-[14px]'} font-medium`}>{spotLabel(state, t.action)}</span>
        <span className="flex gap-[8px]">
          <button type="button" data-setup-place onClick={place}
            className={`${btn} border border-[#ffe7a6] bg-[linear-gradient(180deg,#ffe08a,#f4b33a_45%,#d98a16)] px-[14px] py-[5px] text-[14px] text-[#3a2208]`}>
            {L('Place here', 'Поставить здесь')}
          </button>
          <button type="button" onClick={() => setPendingCorner(null)}
            className={`${btn} bg-white/10 px-[12px] py-[5px] text-[13px] ring-1 ring-white/20`}>
            {L('Another corner', 'Другое место')}
          </button>
        </span>
        </span>
        {!compact && <span className="text-center text-[12px] text-[#bdb8af]">{L('or click the same corner again', 'или кликните по этому углу ещё раз')}</span>}
      </div>
    </div>
  )
}
