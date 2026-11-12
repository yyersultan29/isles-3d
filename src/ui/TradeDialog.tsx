// Bank and port trade panel (ROADMAP G4.4d). Rates come from the engine's tradeRate (ports
// included) through bankView(); the Trade button dispatches BANK_TRADE and the panel stays open
// for another trade. Player-to-player offers come with G4.4d2.

import { useEffect, useRef, useState } from 'react'
import { RESOURCES, focusRing, panel } from './HUD'
import { SEATS, bankMax, useGameView } from './gameView'
import { useGameStore } from '../store/GameProvider'
import { setTradeOpen } from '../store/ui'
import type { Resource } from '../game'

const NAME: Record<Resource, string> = { lumber: 'wood', brick: 'brick', wool: 'wool', grain: 'grain', ore: 'ore' }

function Tile({ res, top, corner, selected, disabled, label, onClick, compact, btnRef }: {
  res: Resource; top: string; corner: string; selected: boolean; disabled: boolean; label: string; onClick: () => void; compact: boolean
  btnRef?: React.Ref<HTMLButtonElement>
}) {
  const r = RESOURCES.find((x) => x.key === res)!
  return (
    <button ref={btnRef} aria-label={label} title={label} aria-pressed={selected} disabled={disabled} onClick={onClick}
      className={`relative h-[60px] ${compact ? 'w-[58px]' : 'w-[70px]'} overflow-hidden rounded-[8px] bg-gradient-to-b ${r.bg} transition-[transform,opacity] disabled:cursor-not-allowed disabled:opacity-35 ${selected ? 'ring-[3px] ring-[#ffd76a] -translate-y-[2px]' : 'ring-1 ring-[#f2cf84]/50 hover:-translate-y-[1px]'} ${focusRing}`}>
      <r.Icon aria-hidden className="absolute left-1/2 top-[55%] w-[70%] -translate-x-1/2 -translate-y-1/2" />
      <span aria-hidden className="absolute left-[3px] top-[3px] rounded-[4px] bg-[#1d1a16]/85 px-[4px] text-[12px] font-bold text-white">{top}</span>
      {corner && <span aria-hidden className="absolute bottom-[3px] right-[3px] rounded-[4px] bg-[#1d1a16]/85 px-[4px] text-[11px] font-semibold text-[#f2cf84]">{corner}</span>}
    </button>
  )
}

export function TradeDialog({ compact }: { compact: boolean }) {
  const { bank } = useGameView()
  const store = useGameStore()
  const [give, setGive] = useState<Resource | null>(null)
  const [get, setGet] = useState<Resource | null>(null)
  const [n, setN] = useState(1)
  // focus the first resource the player can give, or the close button when none
  const first = useRef<HTMLButtonElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const firstGive = bank.rows.find((r) => r.canGive)?.res
  useEffect(() => { (first.current ?? close.current)?.focus() }, [])

  // drop choices the hand or the bank no longer supports (after a trade, or a new turn)
  const giveRow = give ? bank.rows.find((r) => r.res === give)! : null
  const max = give && get ? bankMax(bank, give, get) : 0
  useEffect(() => {
    if (giveRow && !giveRow.canGive) { setGive(null); setGet(null) }
    if (get && bank.rows.find((r) => r.res === get)!.bank === 0) setGet(null)
    setN((x) => Math.max(1, Math.min(x, max || 1)))
  }, [bank, giveRow, get, max])

  const seat = SEATS[bank.player]
  const confirm = () => {
    if (!give || !get || n > max) return
    const r = store.dispatch(bank.player, { type: 'BANK_TRADE', give, get, count: n })
    if (r.ok) setN(1)
    else console.warn(`[trade] ${r.error.code}: ${r.error.message}`) // i18n messages come with G4.5
  }
  const summary = give && get ? `${n * giveRow!.rate} ${NAME[give]} → ${n} ${NAME[get]}` : give ? 'Choose what to get' : 'Choose what to give'

  return (
    <section role="dialog" aria-labelledby="trade-title" className={`pointer-events-auto rounded-[14px] px-[14px] pb-[12px] pt-[10px] ${panel}`} style={{ boxShadow: `inset 0 0 0 2px ${seat.color}aa, 0 14px 34px rgba(0,0,0,.6)` }}>
      <div className="mb-[6px] flex items-center justify-between gap-[12px]">
        <h2 id="trade-title" className="font-display text-[19px] font-semibold text-[#f4efe6]">
          <span className="mr-[8px] inline-block h-[11px] w-[11px] rounded-full align-middle" style={{ background: seat.color }} />
          {seat.name}: trade with the bank
        </h2>
        <button ref={close} aria-label="Close trade" onClick={() => setTradeOpen(false)} className={`grid h-[30px] w-[30px] place-items-center rounded-[8px] bg-white/10 text-[18px] text-white hover:bg-white/20 ${focusRing}`}>×</button>
      </div>

      <p className="mb-[4px] text-[13px] text-[#d6d2ca]">You give <span className="text-[#a9a49b]">(rate · you have)</span></p>
      <div className="flex gap-[8px]">
        {bank.rows.map((r) => (
          <Tile key={r.res} res={r.res} compact={compact} btnRef={r.res === firstGive ? first : undefined} top={`${r.rate}:1`} corner={String(r.have)}
            selected={give === r.res} disabled={!r.canGive}
            label={`Give ${NAME[r.res]} at ${r.rate} to 1 (you have ${r.have})${r.canGive ? '' : `: need ${r.rate}`}`}
            onClick={() => { setGive(give === r.res ? null : r.res); if (get === r.res) setGet(null) }} />
        ))}
      </div>

      <p className="mb-[4px] mt-[10px] text-[13px] text-[#d6d2ca]">You get <span className="text-[#a9a49b]">(bank has)</span></p>
      <div className="flex gap-[8px]">
        {bank.rows.map((r) => (
          <Tile key={r.res} res={r.res} compact={compact} top={String(r.bank)} corner=""
            selected={get === r.res} disabled={!give || give === r.res || r.bank === 0}
            label={`Get ${NAME[r.res]} (bank has ${r.bank})`}
            onClick={() => setGet(get === r.res ? null : r.res)} />
        ))}
      </div>

      <p aria-live="polite" className="mt-[10px] text-[14px] font-semibold text-[#f2cf84]">{summary}</p>
      <div className="mt-[6px] flex items-center justify-between gap-[10px]">
        <div className="flex items-center gap-[6px]">
          <button aria-label="One less" disabled={n <= 1} onClick={() => setN(n - 1)} className={`grid h-[30px] w-[30px] place-items-center rounded-[7px] bg-white/10 text-[17px] font-bold text-white disabled:opacity-30 ${focusRing}`}>−</button>
          <span className="min-w-[24px] text-center text-[16px] font-bold text-white" aria-label={`Count ${n}`}>×{n}</span>
          <button aria-label="One more" disabled={n >= max} onClick={() => setN(n + 1)} className={`grid h-[30px] w-[30px] place-items-center rounded-[7px] bg-white/10 text-[17px] font-bold text-white disabled:opacity-30 ${focusRing}`}>+</button>
        </div>
        <button onClick={confirm} disabled={!give || !get || max < 1} aria-label={give && get ? `Confirm trade: ${summary}` : 'Confirm trade'}
          className={`h-[38px] shrink-0 rounded-full border-2 border-[#ffe7a6] bg-[linear-gradient(180deg,#ffe08a_0%,#f4b33a_45%,#d98a16_100%)] px-[22px] font-display text-[17px] font-semibold text-[#3a2208] disabled:grayscale-[0.7] disabled:brightness-75 ${focusRing}`}>
          Trade
        </button>
      </div>
    </section>
  )
}
