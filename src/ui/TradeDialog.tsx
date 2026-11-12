// Trade panel (ROADMAP G4.4d). Two tabs while composing:
//  - Bank: rates from the engine's tradeRate (ports included) through bankView(); dispatches BANK_TRADE.
//  - Players: an offer composer; proposeCheck() mirrors the engine's checks; dispatches PROPOSE_TRADE.
// While an offer is open (state.trade) the panel shows it instead: each addressed player accepts or
// declines (hot-seat, on the same screen), the proposer confirms with one who accepted or cancels.
// Every enabled button corresponds to an action legalActions offers.

import { useEffect, useRef, useState } from 'react'
import { Avatar } from './icons'
import { RESOURCES, focusRing, panel } from './HUD'
import { SEATS, bankMax, proposeCheck, useGameView, type Counts } from './gameView'
import { useGame, useGameStore } from '../store/GameProvider'
import { setTradeOpen } from '../store/ui'
import { RESOURCE_ORDER, type Action, type PlayerId, type Resource } from '../game'

export const NAME: Record<Resource, string> = { lumber: 'wood', brick: 'brick', wool: 'wool', grain: 'grain', ore: 'ore' }
const text = (c: Counts) => RESOURCE_ORDER.filter((r) => c[r]).map((r) => `${c[r]} ${NAME[r]}`).join(', ')
// functions, not constants: HUD.tsx (focusRing) and this module import each other
export const gold = () => `h-[38px] shrink-0 rounded-full border-2 border-[#ffe7a6] bg-[linear-gradient(180deg,#ffe08a_0%,#f4b33a_45%,#d98a16_100%)] px-[20px] font-display text-[17px] font-semibold text-[#3a2208] disabled:grayscale-[0.7] disabled:brightness-75 ${focusRing}`
export const plain = () => `h-[34px] shrink-0 rounded-[9px] bg-white/10 px-[12px] text-[14px] font-semibold text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-white/10 ${focusRing}`
const tileW = (compact: boolean) => (compact ? 'w-[58px]' : 'w-[70px]')
/** Move focus into a panel unless the user is switching tabs with the keyboard. */
const focusInto = (el: HTMLElement | null) => { if (!(document.activeElement as HTMLElement | null)?.matches('[role=tab]')) el?.focus() }

export function useAct() {
  const store = useGameStore()
  return (player: PlayerId, action: Action) => {
    const r = store.dispatch(player, action)
    if (!r.ok) console.warn(`[trade] ${r.error.code}: ${r.error.message}`) // i18n messages come with G4.5
    return r.ok
  }
}

export function Tile({ res, top, corner, selected, disabled, label, onClick, compact, btnRef }: {
  res: Resource; top: string; corner: string; selected: boolean; disabled: boolean; label: string; onClick: () => void; compact: boolean
  btnRef?: React.Ref<HTMLButtonElement>
}) {
  const r = RESOURCES.find((x) => x.key === res)!
  return (
    <button ref={btnRef} aria-label={label} title={label} aria-pressed={selected} disabled={disabled} onClick={onClick}
      className={`relative h-[60px] [@media(max-height:560px)]:h-[46px] ${tileW(compact)} overflow-hidden rounded-[8px] bg-gradient-to-b ${r.bg} transition-[transform,opacity] disabled:cursor-not-allowed disabled:opacity-35 ${selected ? 'ring-[3px] ring-[#ffd76a] -translate-y-[2px]' : 'ring-1 ring-[#f2cf84]/50 hover:-translate-y-[1px]'} ${focusRing}`}>
      <r.Icon aria-hidden className="absolute left-1/2 top-[55%] w-[70%] -translate-x-1/2 [@media(max-height:560px)]:w-[52%] -translate-y-1/2" />
      {top && <span aria-hidden className="absolute left-[3px] top-[3px] rounded-[4px] bg-[#1d1a16]/85 px-[4px] text-[12px] font-bold text-white">{top}</span>}
      {corner && <span aria-hidden className="absolute bottom-[3px] right-[3px] rounded-[4px] bg-[#1d1a16]/85 px-[4px] text-[11px] font-semibold text-[#f2cf84]">{corner}</span>}
    </button>
  )
}

/** A resource tile that adds one per click, with a small remove button once something is chosen. */
function CountTile({ res, chosen, max, sub, verb, compact, btnRef, onAdd, onRemove }: {
  res: Resource; chosen: number; max: number; sub: string; verb: string; compact: boolean; btnRef?: React.Ref<HTMLButtonElement>
  onAdd: () => void; onRemove: () => void
}) {
  return (
    <div className="relative">
      <Tile res={res} compact={compact} btnRef={btnRef} top={chosen ? `×${chosen}` : ''} corner={sub} selected={chosen > 0} disabled={chosen >= max}
        label={`${verb} one ${NAME[res]} (${chosen} chosen${sub ? `, you have ${sub}` : ''})`} onClick={onAdd} />
      {chosen > 0 && (
        <button aria-label={`${verb} one less ${NAME[res]}`} onClick={onRemove}
          className={`absolute -right-[5px] -top-[7px] grid h-[22px] w-[22px] place-items-center rounded-full bg-[#c8302a] text-[15px] font-bold leading-none text-white shadow-[0_2px_6px_rgba(0,0,0,.5)] ${focusRing}`}>−</button>
      )}
    </div>
  )
}

function Chips({ c }: { c: Counts }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-[3px]">
      {RESOURCE_ORDER.filter((r) => c[r]).map((r) => { const R = RESOURCES.find((x) => x.key === r)!; return (
        <span key={r} className={`inline-flex h-[30px] items-center gap-[2px] rounded-[6px] bg-gradient-to-b ${R.bg} pl-[2px] pr-[6px] ring-1 ring-[#f2cf84]/40`}>
          <R.Icon aria-hidden className="h-[24px] w-[26px]" /><span className="text-[14px] font-bold text-white">{c[r]}</span>
        </span>
      ) })}
    </span>
  )
}

// ---------------------------------------------------------------- bank

function BankPanel({ compact }: { compact: boolean }) {
  const { bank } = useGameView()
  const act = useAct()
  const [give, setGive] = useState<Resource | null>(null)
  const [get, setGet] = useState<Resource | null>(null)
  const [n, setN] = useState(1)
  const first = useRef<HTMLButtonElement>(null)
  const firstGive = bank.rows.find((r) => r.canGive)?.res
  useEffect(() => { focusInto(first.current) }, [])

  // drop choices the hand or the bank no longer supports (after a trade, or a new turn)
  const giveRow = give ? bank.rows.find((r) => r.res === give)! : null
  const max = give && get ? bankMax(bank, give, get) : 0
  useEffect(() => {
    if (giveRow && !giveRow.canGive) { setGive(null); setGet(null) }
    if (get && bank.rows.find((r) => r.res === get)!.bank === 0) setGet(null)
    setN((x) => Math.max(1, Math.min(x, max || 1)))
  }, [bank, giveRow, get, max])

  const confirm = () => { if (give && get && n <= max && act(bank.player, { type: 'BANK_TRADE', give, get, count: n })) setN(1) }
  const summary = give && get ? `${n * giveRow!.rate} ${NAME[give]} → ${n} ${NAME[get]}` : give ? 'Choose what to get' : 'Choose what to give'

  return (
    <>
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
        <button onClick={confirm} disabled={!give || !get || max < 1} aria-label={give && get ? `Confirm trade: ${summary}` : 'Confirm trade'} className={gold()}>Trade</button>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- composing an offer

function PlayersPanel({ compact }: { compact: boolean }) {
  const s = useGame((x) => x)
  const { hand, opponents } = useGameView()
  const act = useAct()
  const [give, setGive] = useState<Counts>({})
  const [want, setWant] = useState<Counts>({})
  const [to, setTo] = useState<PlayerId[]>(opponents)
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => { focusInto(first.current) }, [])
  // never offer more than the hand holds (it can shrink after a bank trade)
  useEffect(() => {
    setGive((g) => {
      const over = RESOURCE_ORDER.some((r) => (g[r] ?? 0) > hand.counts[r])
      return over ? Object.fromEntries(RESOURCE_ORDER.map((r) => [r, Math.min(g[r] ?? 0, hand.counts[r])])) : g
    })
  }, [hand])

  const add = (side: 'give' | 'want', r: Resource, d: number) => {
    const [set, other] = side === 'give' ? [setGive, setWant] : [setWant, setGive]
    set((c) => ({ ...c, [r]: Math.max(0, (c[r] ?? 0) + d) }))
    if (d > 0) other((c) => ({ ...c, [r]: 0 })) // a resource sits on one side only
  }
  const reason = proposeCheck(s, give, want, to)
  const propose = () => { if (!reason) act(hand.owner, { type: 'PROPOSE_TRADE', offer: give, request: want, to: to.length === opponents.length ? undefined : to }) }
  const firstHeld = RESOURCE_ORDER.find((r) => hand.counts[r] > 0)

  return (
    <>
      <p className="mb-[4px] text-[13px] text-[#d6d2ca]">You give <span className="text-[#a9a49b]">(you have)</span></p>
      <div className="flex gap-[8px]">
        {RESOURCE_ORDER.map((r) => (
          <CountTile key={r} res={r} compact={compact} btnRef={r === firstHeld ? first : undefined} verb="Give" chosen={give[r] ?? 0} max={hand.counts[r]} sub={String(hand.counts[r])}
            onAdd={() => add('give', r, 1)} onRemove={() => add('give', r, -1)} />
        ))}
      </div>
      <p className="mb-[4px] mt-[10px] text-[13px] text-[#d6d2ca]">You want</p>
      <div className="flex gap-[8px]">
        {RESOURCE_ORDER.map((r) => (
          <CountTile key={r} res={r} compact={compact} verb="Want" chosen={want[r] ?? 0} max={19} sub=""
            onAdd={() => add('want', r, 1)} onRemove={() => add('want', r, -1)} />
        ))}
      </div>
      <div role="group" aria-label="Offer to" className="mt-[10px] flex flex-wrap items-center gap-[6px]">
        <span className="mr-[2px] text-[13px] text-[#d6d2ca]">To</span>
        {opponents.map((id) => { const on = to.includes(id); return (
          <button key={id} aria-pressed={on} aria-label={`Offer to ${SEATS[id].name}`} onClick={() => setTo(on ? to.filter((x) => x !== id) : opponents.filter((x) => x === id || to.includes(x)))}
            className={`flex h-[32px] items-center gap-[6px] rounded-full pl-[3px] pr-[10px] text-[13px] font-semibold transition-opacity ${on ? 'bg-white/[0.12] text-white' : 'bg-white/[0.04] text-white/50'} ${focusRing}`}
            style={{ boxShadow: on ? `inset 0 0 0 2px ${SEATS[id].color}` : undefined }}>
            <span className={`h-[26px] w-[26px] overflow-hidden rounded-full ${on ? '' : 'opacity-50 grayscale'}`}><Avatar i={SEATS[id].avatar} className="h-full w-full" /></span>
            {SEATS[id].name}
          </button>
        ) })}
      </div>
      <div className="mt-[10px] flex items-center justify-between gap-[10px]">
        <p aria-live="polite" className="text-[14px] font-semibold text-[#f2cf84]">{reason ?? `Give ${text(give)}, get ${text(want)}`}</p>
        <button onClick={propose} disabled={!!reason} aria-label="Propose trade" className={gold()}>Propose</button>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- an open offer

function OfferPanel() {
  const { offer } = useGameView()
  const act = useAct()
  const first = useRef<HTMLButtonElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  useEffect(() => { (first.current ?? cancel.current)?.focus() }, [offer?.id])
  if (!offer) return null
  const from = SEATS[offer.from]
  const firstEnabled = offer.rows.find((r) => r.response === 'pending' && r.canAccept)?.id ?? offer.rows.find((r) => r.canConfirm)?.id
  return (
    <>
      <div className="mb-[10px] flex flex-wrap items-center gap-[8px] text-[14px] text-[#d6d2ca]">
        <span>{from.name} gives</span><Chips c={offer.offer} /><span>for</span><Chips c={offer.request} />
      </div>
      <ul className="flex flex-col gap-[6px]">
        {offer.rows.map((r) => (
          <li key={r.id} className="flex h-[44px] items-center gap-[10px] rounded-[10px] bg-white/[0.05] pl-[5px] pr-[6px]" style={{ boxShadow: `inset 3px 0 0 ${r.color}` }}>
            <span className="h-[34px] w-[34px] shrink-0 overflow-hidden rounded-[7px]"><Avatar i={r.avatar} className="h-full w-full" /></span>
            <span className="min-w-[52px] flex-1 text-[15px] font-semibold text-white">{r.name}</span>
            {r.response === 'pending' && (<>
              <button ref={r.id === firstEnabled ? first : undefined} disabled={!r.canAccept} title={r.reason ?? undefined}
                aria-label={`${r.name}: accept${r.reason ? ` (${r.reason})` : ''}`} onClick={() => act(r.id, { type: 'RESPOND_TRADE', tradeId: offer.id, accept: true })}
                className={`${plain()} !bg-[#2f7d3a] hover:!bg-[#3a9447] disabled:!bg-white/10`}>Accept</button>
              <button aria-label={`${r.name}: decline`} onClick={() => act(r.id, { type: 'RESPOND_TRADE', tradeId: offer.id, accept: false })} className={plain()}>Decline</button>
            </>)}
            {r.response === 'reject' && <span className="pr-[6px] text-[14px] text-[#a9a49b]">Declined</span>}
            {r.response === 'accept' && (
              <button ref={r.id === firstEnabled ? first : undefined} disabled={!r.canConfirm} aria-label={`Trade with ${r.name}`}
                onClick={() => act(offer.from, { type: 'CONFIRM_TRADE', tradeId: offer.id, with: r.id })} className={`${gold()} !h-[34px] !px-[14px] !text-[15px]`}>Trade with {r.name}</button>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-[10px] flex justify-end">
        <button ref={cancel} aria-label="Cancel offer" onClick={() => act(offer.from, { type: 'CANCEL_TRADE' })} className={plain()}>Cancel offer</button>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- shell

export function TradeDialog({ compact }: { compact: boolean }) {
  const { bank, offer } = useGameView()
  const [tab, setTab] = useState<'bank' | 'players'>('bank')
  const seat = SEATS[offer?.from ?? bank.player]
  const title = offer ? `${seat.name} offers a trade` : `${seat.name}: trade`
  const tabBtn = (id: 'bank' | 'players', label: string) => (
    <button role="tab" aria-selected={tab === id} aria-controls="trade-body" onClick={() => setTab(id)}
      className={`h-[30px] rounded-[8px] px-[12px] text-[14px] font-semibold ${tab === id ? 'bg-[#f2b544] text-[#2a1a06]' : 'bg-white/10 text-white hover:bg-white/20'} ${focusRing}`}>{label}</button>
  )
  return (
    <section role="dialog" aria-labelledby="trade-title" className={`pointer-events-auto rounded-[14px] px-[14px] pb-[12px] pt-[10px] ${panel}`} style={{ boxShadow: `inset 0 0 0 2px ${seat.color}aa, 0 14px 34px rgba(0,0,0,.6)` }}>
      <div className="mb-[8px] flex items-center justify-between gap-[10px]">
        <h2 id="trade-title" className="whitespace-nowrap font-display text-[19px] font-semibold text-[#f4efe6]">
          <span className="mr-[8px] inline-block h-[11px] w-[11px] rounded-full align-middle" style={{ background: seat.color }} />
          {title}
        </h2>
        {!offer && (
          <div className="flex items-center gap-[6px]">
            <div role="tablist" aria-label="Trade with" className="flex gap-[4px]">{tabBtn('bank', 'Bank')}{tabBtn('players', 'Players')}</div>
            <button aria-label="Close trade" onClick={() => setTradeOpen(false)} className={`grid h-[30px] w-[30px] place-items-center rounded-[8px] bg-white/10 text-[18px] text-white hover:bg-white/20 ${focusRing}`}>×</button>
          </div>
        )}
      </div>
      <div id="trade-body" role={offer ? undefined : 'tabpanel'}>
        {offer ? <OfferPanel /> : tab === 'bank' ? <BankPanel key="bank" compact={compact} /> : <PlayersPanel key="players" compact={compact} />}
      </div>
    </section>
  )
}
