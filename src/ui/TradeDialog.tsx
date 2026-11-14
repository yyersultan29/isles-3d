// Trade panel (ROADMAP G4.4d, one panel since G6.3, two modes since G7.3). While composing, one
// draft (the UI store, filled from the hand too) has "You give" and "You want", shown in one of two
// modes (the UI store's tradeMode, picked by how the panel was opened, switched with one click):
//  - Bank / ports: rates and bank stock, the one-click ways to pay for a wanted card (payOptions), the
//    result ("3 wood → 1 brick (3:1)") and "Trade with the bank" (bankQuote, at the player's rate).
//  - Players: the recipients, one result sentence and "Offer trade" (proposeCheck() mirrors the
//    engine's checks; dispatches PROPOSE_TRADE).
// A disabled main button's reason is the result line next to it. A completed trade closes the panel.
// While an offer is open (state.trade) the panel shows it instead: each addressed player accepts or
// declines (hot-seat, on the same screen; online each on their own), and the proposer confirms with
// one who accepted (the separate last step) or cancels.
// Every enabled button corresponds to an action legalActions offers.

import { useEffect, useRef, useState } from 'react'
import { Avatar } from './icons'
import { RESOURCES, focusRing, panel } from './HUD'
import { ART_SHADOW, ResourceBackdrop } from './cards/ResourceArt'
import { SEATS, proposeCheck, useGameView, type Counts } from './gameView'
import { bankQuote, noPayReason, payOptions, sameDraft, shortfall, tradesText } from './tradePlan'
import { useGame, useGameStore } from '../store/GameProvider'
import { changeDraft, clearDraft, setBuildGoal, setPlacementMode, setTradeMode, setTradeOpen, useBuildGoal, useTradeDraft, useTradeMode, type TradeMode } from '../store/ui'
import { RESOURCE_ORDER, type Action, type PlayerId, type Resource } from '../game'

export const NAME: Record<Resource, string> = { lumber: 'wood', brick: 'brick', wool: 'wool', grain: 'grain', ore: 'ore' }
const text = (c: Counts) => RESOURCE_ORDER.filter((r) => c[r]).map((r) => `${c[r]} ${NAME[r]}`).join(', ')
// functions, not constants: HUD.tsx (focusRing) and this module import each other
export const gold = () => `h-[38px] shrink-0 rounded-full border-2 border-[#ffe7a6] bg-[linear-gradient(180deg,#ffe08a_0%,#f4b33a_45%,#d98a16_100%)] px-[20px] font-display text-[17px] font-semibold text-[#3a2208] disabled:grayscale-[0.7] disabled:brightness-75 ${focusRing}`
export const plain = () => `h-[34px] shrink-0 rounded-[9px] bg-white/10 px-[12px] text-[14px] font-semibold text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-white/10 ${focusRing}`
const tileW = (compact: boolean) => (compact ? 'w-[58px]' : 'w-[70px]')
/** Move focus into the panel unless the user is picking cards from the hand (G6.2). */
const focusInto = (el: HTMLElement | null) => { if (!(document.activeElement as HTMLElement | null)?.matches('[data-hand-card]')) el?.focus() }

export function useAct() {
  const store = useGameStore()
  return (player: PlayerId, action: Action) => {
    return store.dispatch(player, action).ok // a rejection shows as a notice (Notices.tsx)
  }
}

export function Tile({ res, top, corner, selected, disabled, label, onClick, compact, btnRef }: {
  res: Resource; top: string; corner: string; selected: boolean; disabled: boolean; label: string; onClick: () => void; compact: boolean
  btnRef?: React.Ref<HTMLButtonElement>
}) {
  const r = RESOURCES.find((x) => x.key === res)!
  return (
    <button ref={btnRef} data-tile aria-label={label} title={label} aria-pressed={selected} disabled={disabled} onClick={onClick}
      className={`relative h-[60px] [@media(max-height:560px)]:h-[46px] ${tileW(compact)} overflow-hidden rounded-[8px] transition-[transform,opacity] disabled:cursor-not-allowed ${selected ? '' : 'disabled:opacity-35'} ${selected ? 'ring-[3px] ring-[#ffd76a] -translate-y-[2px]' : 'ring-1 ring-[#f2cf84]/50 hover:-translate-y-[1px]'} ${focusRing}`}>
      <ResourceBackdrop res={res} />
      <r.Icon aria-hidden className={`absolute left-1/2 top-[55%] w-[70%] -translate-x-1/2 [@media(max-height:560px)]:w-[52%] -translate-y-1/2 ${ART_SHADOW}`} />
      {top && <span aria-hidden className="absolute left-[3px] top-[3px] rounded-[4px] bg-[#1d1a16]/85 px-[4px] text-[12px] font-bold text-white">{top}</span>}
      {corner && <span aria-hidden className="absolute bottom-[3px] right-[3px] rounded-[4px] bg-[#1d1a16]/85 px-[4px] text-[11px] font-semibold text-[#f2cf84]">{corner}</span>}
    </button>
  )
}

/** A resource tile that adds one per click, with a small remove button once something is chosen. */
function CountTile({ res, chosen, max, sub, hint = '', detail, verb, compact, btnRef, onAdd, onRemove }: {
  res: Resource; chosen: number; max: number; sub: string; hint?: string; detail: string; verb: string; compact: boolean; btnRef?: React.Ref<HTMLButtonElement>
  onAdd: () => void; onRemove: () => void
}) {
  return (
    <div className="relative">
      <Tile res={res} compact={compact} btnRef={btnRef} top={chosen ? `×${chosen}` : hint} corner={sub} selected={chosen > 0} disabled={chosen >= max}
        label={`${verb} one ${NAME[res]} (${chosen} chosen${detail ? `, ${detail}` : ''})`} onClick={onAdd} />
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

// ---------------------------------------------------------------- composing (bank or players)

function ComposePanel({ compact }: { compact: boolean }) {
  const s = useGame((x) => x)
  const { hand, opponents, bank, me } = useGameView()
  const act = useAct()
  // the draft lives in the UI store (G6.2): the hand fills it, and it survives closing the panel;
  // it is cleared at the end of the turn and when the hand no longer holds it (usePlacementAutoReset)
  const draft = useTradeDraft()
  const { give, want } = draft
  // G6.4: opened from a build row, and the draft is still that build's plan: the Bank button makes
  // the plan's trades (one or more) and then starts the placement
  const goal = useBuildGoal()
  const plan = goal ? shortfall(s, goal, me) : null
  const forBuild = goal && plan?.covered && plan.trades.length && sameDraft(plan.draft, draft) ? { kind: goal, trades: plan.trades, text: tradesText(s, bank.player, plan.trades) } : null
  const mode = useTradeMode()
  const [to, setTo] = useState<PlayerId[]>(opponents)
  const first = useRef<HTMLButtonElement>(null)
  const main = useRef<HTMLButtonElement>(null)
  // opened for a build (G6.4): the Bank button is what comes next; otherwise the first card to give
  useEffect(() => { focusInto(main.current ?? first.current) }, [])

  // a resource sits on one side only
  const add = (side: 'give' | 'want', r: Resource, d: number) => changeDraft(side, r, d, side === 'give' ? hand.counts[r] : 19)
  const quote = bankQuote(s, give, want, me)
  const offerReason = proposeCheck(s, give, want, to)
  const wanted = RESOURCE_ORDER.filter((r) => want[r])
  const giving = RESOURCE_ORDER.some((r) => give[r])
  const pay = !giving && wanted.length === 1 ? payOptions(s, wanted[0], want[wanted[0]]!, me) : []
  const noPay = !giving && wanted.length === 1 && !pay.length ? noPayReason(s, wanted[0], want[wanted[0]]!, me) : null
  const bankTrade = (a: Action) => { if (act(bank.player, a)) { clearDraft(); setTradeOpen(false) } }
  const BUILD_WORD = { road: 'road', settlement: 'settlement', city: 'city', dev: 'development card' } as const
  const tradeThenBuild = () => {
    if (!forBuild) return
    // online each trade is checked against the state before the first one; the plan pays every
    // trade from spare cards, so each is valid on its own and the server applies them in order
    for (const t of forBuild.trades) if (!act(bank.player, t)) return
    clearDraft()
    if (forBuild.kind === 'dev') { setTradeOpen(false); return } // the card is then one click in the build menu
    setBuildGoal(null); setPlacementMode(forBuild.kind) // also closes the panel
  }
  const offer = () => { if (!offerReason && act(hand.owner, { type: 'PROPOSE_TRADE', offer: give, request: want, to: to.length === opponents.length ? undefined : to })) clearDraft() }
  const firstHeld = RESOURCE_ORDER.find((r) => hand.counts[r] > 0)

  const bankMain = forBuild
    ? <button ref={main} data-main-action onClick={tradeThenBuild} title={forBuild.text} className={`${gold()} !px-[14px]`}
        aria-label={`${forBuild.kind === 'dev' ? 'Trade with the bank for a development card' : `Trade with the bank, then build the ${BUILD_WORD[forBuild.kind]}`}: ${forBuild.text}`}>Trade &amp; build</button>
    : <button data-main-action onClick={() => quote.ok && bankTrade(quote.action)} disabled={!quote.ok}
        aria-label={quote.ok ? `Trade with the bank: ${quote.text}` : `Trade with the bank (${noPay ?? quote.reason})`} className={`${gold()} !px-[14px]`}>Trade with the bank</button>
  // G7.3: one result sentence per mode, and the reason a main button is disabled next to it
  const bankResult = forBuild ? `For a ${BUILD_WORD[forBuild.kind]}: ${forBuild.text}` : quote.ok ? quote.text : pay.length ? 'Pick how to pay, or add cards you give' : noPay ?? quote.reason
  const names = (ids: PlayerId[]) => ids.length === opponents.length ? 'everyone' : ids.map((x) => SEATS[x].name).join(' and ')
  const playersResult = offerReason ?? `Offer ${text(give)} to ${names(to)} for ${text(want)}`
  const kept = giving || wanted.length > 0

  return (
    <>
      <p className="mb-[4px] text-[13px] text-[#d6d2ca]">You give <span className="text-[#a9a49b]">({mode === 'bank' ? 'bank rate · you have' : 'you have'})</span></p>
      <div className="flex gap-[8px]">
        {bank.rows.map((r) => (
          <CountTile key={r.res} res={r.res} compact={compact} btnRef={r.res === firstHeld ? first : undefined} verb="Give" chosen={give[r.res] ?? 0} max={hand.counts[r.res]}
            sub={String(hand.counts[r.res])} hint={mode === 'bank' ? `${r.rate}:1` : ''} detail={mode === 'bank' ? `you have ${hand.counts[r.res]}, bank rate ${r.rate}:1` : `you have ${hand.counts[r.res]}`}
            onAdd={() => add('give', r.res, 1)} onRemove={() => add('give', r.res, -1)} />
        ))}
      </div>
      <p className="mb-[4px] mt-[10px] text-[13px] text-[#d6d2ca]">You want {mode === 'bank' && <span className="text-[#a9a49b]">(bank has)</span>}</p>
      <div className="flex gap-[8px]">
        {bank.rows.map((r) => (
          <CountTile key={r.res} res={r.res} compact={compact} verb="Want" chosen={want[r.res] ?? 0} max={19} sub={mode === 'bank' ? String(r.bank) : ''} detail={mode === 'bank' ? `bank has ${r.bank}` : ''}
            onAdd={() => add('want', r.res, 1)} onRemove={() => add('want', r.res, -1)} />
        ))}
      </div>
      {mode === 'bank' && pay.length > 0 && (
        <div role="group" aria-label="Pay the bank" className="mt-[10px] flex flex-wrap items-center gap-[6px]">
          <span className="mr-[2px] text-[13px] text-[#d6d2ca]">Pay the bank</span>
          {pay.map((o) => { const R = RESOURCES.find((x) => x.key === o.give)!; const label = `Pay ${o.cost} ${NAME[o.give]} for ${o.action.count} ${NAME[o.action.get]}`; return (
            <button key={o.give} aria-label={label} title={label} onClick={() => bankTrade(o.action)}
              className={`flex h-[34px] items-center gap-[4px] rounded-[8px] bg-gradient-to-b ${R.bg} pl-[3px] pr-[9px] text-[14px] font-bold text-white ring-1 ring-[#f2cf84]/50 hover:brightness-110 ${focusRing}`}>
              <R.Icon aria-hidden className="h-[26px] w-[28px]" />{o.cost} → {o.action.count} {NAME[o.action.get]}
              <span className="ml-[3px] text-[11px] font-semibold text-white/80">{o.rate}:1{o.rate < 4 ? ' (port)' : ''}</span>
            </button>
          ) })}
        </div>
      )}
      {mode === 'players' && (
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
      )}
      <div className="mt-[10px] flex items-center justify-between gap-[8px]">
        <p aria-live="polite" data-trade-result className={`min-w-0 text-[14px] font-semibold leading-tight ${(mode === 'bank' ? forBuild || quote.ok : !offerReason) ? 'text-[#f2cf84]' : 'text-[#d6d2ca]'}`}>
          {mode === 'bank' ? bankResult : playersResult}
        </p>
        {mode === 'bank' ? bankMain : (
          <button data-main-action onClick={offer} disabled={!!offerReason}
            aria-label={offerReason ? `Offer trade (${offerReason})` : `Offer trade: ${playersResult}`} className={`${gold()} !px-[14px]`}>Offer trade</button>
        )}
      </div>
      {kept && <p className="mt-[6px] text-[12px] text-[#a9a49b]">Closing keeps your choice until the end of the turn.</p>}
    </>
  )
}

/** G7.3: Bank / ports or Players, over the one draft; one click switches. */
function ModeSwitch() {
  const mode = useTradeMode()
  const opt = (m: TradeMode, label: string) => (
    <button aria-pressed={mode === m} data-trade-mode={m} onClick={() => setTradeMode(m)}
      className={`h-[30px] [@media(max-height:560px)]:h-[26px] flex-1 rounded-[8px] px-[12px] text-[14px] font-semibold transition-colors ${mode === m ? 'bg-[#f2cf84] text-[#2a1a06]' : 'text-[#d6d2ca] hover:bg-white/10'} ${focusRing}`}>{label}</button>
  )
  return (
    <div role="group" aria-label="Trade with" className="mb-[10px] [@media(max-height:560px)]:mb-[6px] flex gap-[4px] rounded-[10px] bg-white/[0.06] p-[3px]">
      {opt('bank', 'Bank / ports')}{opt('players', 'Players')}
    </div>
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
  // G7.3: where the offer stands; confirming with a player who accepted is the separate last step
  const accepted = offer.rows.some((r) => r.response === 'accept')
  const pending = offer.rows.some((r) => r.response === 'pending')
  const step = !offer.canManage ? null
    : accepted ? 'Last step: confirm with a player who accepted. Nothing is traded until you do.'
    : pending ? 'Offer sent. Waiting for answers.'
    : 'Everyone declined. Cancel the offer to change it.'
  return (
    <>
      <div className="mb-[8px] flex flex-wrap items-center gap-[8px] text-[14px] text-[#d6d2ca]">
        <span>{from.name} gives</span><Chips c={offer.offer} /><span>for</span><Chips c={offer.request} />
      </div>
      {step && <p aria-live="polite" data-offer-step className={`mb-[8px] text-[13px] font-semibold ${accepted ? 'text-[#f2cf84]' : 'text-[#d6d2ca]'}`}>{step}</p>}
      <ul className="flex flex-col gap-[6px]">
        {offer.rows.map((r) => (
          <li key={r.id} className="flex h-[44px] items-center gap-[10px] rounded-[10px] bg-white/[0.05] pl-[5px] pr-[6px]" style={{ boxShadow: `inset 3px 0 0 ${r.color}` }}>
            <span className="h-[34px] w-[34px] shrink-0 overflow-hidden rounded-[7px]"><Avatar i={r.avatar} className="h-full w-full" /></span>
            <span className="min-w-[52px] flex-1 text-[15px] font-semibold text-white">{r.name}</span>
            {r.response === 'pending' && !r.canRespond && <span className="pr-[6px] text-[14px] text-[#a9a49b]">Waiting</span>}
            {r.response === 'pending' && r.canRespond && (<>
              {/* G7.8: why this player can't accept is visible text, not a hover title on a disabled button */}
              {!r.canAccept && r.reason ? <span data-offer-reason className="text-right text-[13px] leading-tight text-[#e8b4a0]">{r.reason}</span> : <button ref={r.id === firstEnabled ? first : undefined} disabled={!r.canAccept} title={r.reason ?? undefined}
                aria-label={`${r.name}: accept${r.reason ? ` (${r.reason})` : ''}`} onClick={() => act(r.id, { type: 'RESPOND_TRADE', tradeId: offer.id, accept: true })}
                className={`${plain()} !bg-[#2f7d3a] hover:!bg-[#3a9447] disabled:!bg-white/10`}>Accept</button>}
              <button aria-label={`${r.name}: decline`} onClick={() => act(r.id, { type: 'RESPOND_TRADE', tradeId: offer.id, accept: false })} className={plain()}>Decline</button>
            </>)}
            {r.response === 'reject' && <span className="pr-[6px] text-[14px] text-[#a9a49b]">Declined</span>}
            {r.response === 'accept' && <span className="pr-[2px] text-[14px] text-[#9fd49a]">Accepted</span>}
            {r.response === 'accept' && offer.canManage && (
              <button ref={r.id === firstEnabled ? first : undefined} disabled={!r.canConfirm} aria-label={`Confirm trade with ${r.name}`}
                onClick={() => { if (act(offer.from, { type: 'CONFIRM_TRADE', tradeId: offer.id, with: r.id })) setTradeOpen(false) }} className={`${gold()} !h-[34px] !px-[12px] !text-[15px]`}>Confirm trade</button>
            )}
          </li>
        ))}
      </ul>
      {offer.canManage && <div className="mt-[10px] flex justify-end">
        <button ref={cancel} aria-label="Cancel offer" onClick={() => act(offer.from, { type: 'CANCEL_TRADE' })} className={plain()}>Cancel offer</button>
      </div>}
    </>
  )
}

// ---------------------------------------------------------------- shell

export function TradeDialog({ compact }: { compact: boolean }) {
  const { bank, offer } = useGameView()
  const seat = SEATS[offer?.from ?? bank.player]
  const title = offer ? `${seat.name} offers a trade` : `${seat.name}: trade`
  return (
    <section role="dialog" aria-labelledby="trade-title" className={`pointer-events-auto rounded-[14px] px-[14px] pb-[12px] pt-[10px] ${panel}`} style={{ boxShadow: `inset 0 0 0 2px ${seat.color}aa, 0 14px 34px rgba(0,0,0,.6)` }}>
      <div className="mb-[8px] flex items-center justify-between gap-[10px]">
        <h2 id="trade-title" className="whitespace-nowrap font-display text-[19px] font-semibold text-[#f4efe6]">
          <span className="mr-[8px] inline-block h-[11px] w-[11px] rounded-full align-middle" style={{ background: seat.color }} />
          {title}
        </h2>
        {!offer && <button aria-label="Close trade" onClick={() => setTradeOpen(false)} className={`grid h-[30px] w-[30px] place-items-center rounded-[8px] bg-white/10 text-[18px] text-white hover:bg-white/20 ${focusRing}`}>×</button>}
      </div>
      <div id="trade-body">
        {offer ? <OfferPanel /> : <><ModeSwitch /><ComposePanel compact={compact} /></>}
      </div>
    </section>
  )
}
