// Development cards panel (ROADMAP G4.4e; "My development cards" since G7.4). Lists the player's
// cards in groups (devView): "Can play" has a Play button, enabled exactly when legalActions offers
// that card; "Bought this turn", "Already played a card this turn" and "Not now" say why in text
// instead; victory points are shown as points, never as a card to play. G7.5: Play opens the
// card's steps (what happens, where to choose, what can still be undone); Knight and Road Building
// are confirmed there and hand over to the board (robber or free-road markers, G4.3), Year of
// Plenty and Monopoly ask for resources there first. Back keeps the card.

import { useEffect, useRef, useState } from 'react'
import { focusRing, panel } from './HUD'
import { SEATS, useGameView, type DevGroup, type DevKind, type DevRow } from './gameView'
import { NAME, Tile, gold, plain, useAct } from './TradeDialog'
import { setDevOpen } from '../store/ui'
import { RESOURCE_ORDER, type Resource } from '../game'
import { DEV_TINT, DevCard } from './cards/DevCardArt'

const CARD: Record<DevKind, { name: string; blurb: string; tint: string }> = {
  knight: { name: 'Knight', blurb: 'Move the robber and steal a card', tint: DEV_TINT.knight },
  roadBuilding: { name: 'Road Building', blurb: 'Build two free roads', tint: DEV_TINT.roadBuilding },
  yearOfPlenty: { name: 'Year of Plenty', blurb: 'Take any two resources from the bank', tint: DEV_TINT.yearOfPlenty },
  monopoly: { name: 'Monopoly', blurb: 'Take one resource from every player', tint: DEV_TINT.monopoly },
  victoryPoint: { name: 'Victory Point', blurb: '+1 VP, kept hidden', tint: DEV_TINT.victoryPoint },
}

const GROUP: Record<DevGroup, string> = {
  play: 'Can play',
  new: 'Bought this turn · playable from your next turn',
  played: 'Already played a card this turn',
  wait: 'Not now',
  vp: 'Victory points',
}

type PlayKind = Exclude<DevKind, 'victoryPoint'>
/** G7.5: each card as short steps: what happens, where to choose, and what can still be undone. */
const STEPS: Record<PlayKind, string[]> = {
  knight: ['Play the card', 'Pick a tile for the robber on the board', 'Rob one card from a player there, if any'],
  roadBuilding: ['Play the card', 'Pick an edge on the board for each free road (two, or one if only one fits)'],
  yearOfPlenty: ['Pick two resources here (the same twice is fine)', 'Press Play: they go to your hand'],
  monopoly: ['Pick a resource here', 'Press Play: every other player gives you all of theirs'],
}

function CardSteps({ kind, compact, onDone, onBack }: { kind: PlayKind; compact: boolean; onDone: () => void; onBack: () => void }) {
  const { dev } = useGameView()
  const act = useAct()
  const [take, setTake] = useState<Resource[]>([])
  const [mono, setMono] = useState<Resource | null>(null)
  const first = useRef<HTMLButtonElement>(null)
  const playBtn = useRef<HTMLButtonElement>(null)
  const board = kind === 'knight' || kind === 'roadBuilding'
  // the board cards: the confirm is what comes next; the panel cards: the first resource
  useEffect(() => { (board ? playBtn.current : first.current)?.focus() }, [board])
  const yop = kind === 'yearOfPlenty'
  const n = (r: Resource) => take.filter((x) => x === r).length
  const ready = board || (yop ? take.length === dev.yopTake && dev.yopTake > 0 : !!mono)
  const play = () => {
    const ok = kind === 'knight' ? act(dev.player, { type: 'PLAY_KNIGHT' }) // the robber step closes the panel
      : kind === 'roadBuilding' ? act(dev.player, { type: 'PLAY_ROAD_BUILDING' })
      : yop ? act(dev.player, { type: 'PLAY_YEAR_OF_PLENTY', take }) : mono && act(dev.player, { type: 'PLAY_MONOPOLY', resource: mono })
    if (ok) onDone()
  }
  const names = take.map((r) => NAME[r]).join(' + ')
  const left = dev.yopTake - take.length
  const summary = board ? (kind === 'knight' ? 'Next: the robber, on the board' : 'Next: the free roads, on the board')
    : yop ? (left > 0 ? `Pick ${left} more${take.length ? ` (so far: ${names})` : ''}` : `You'll take ${names}`)
    : mono ? `You'll take every ${NAME[mono]} the other players have` : 'Pick a resource'
  const firstRes = RESOURCE_ORDER.find((r) => !yop || dev.bank[r] > 0)
  return (
    <div className={compact ? 'w-[322px]' : 'w-[390px]'}>
      {/* A5: the card being played, beside its steps (left out on very low screens, where height is short) */}
      <div className="mb-[8px] flex items-start gap-[10px]">
        <DevCard type={kind} name={CARD[kind].name} size="large" compact={compact} className="[@media(max-height:560px)]:hidden" />
        <ol data-card-steps className="flex min-w-0 flex-1 flex-col gap-[3px] text-[13px] text-[#d6d2ca]">
          {(yop && dev.yopTake === 1 ? ['Pick one resource here (the bank has only one left)', STEPS.yearOfPlenty[1]] : STEPS[kind]).map((t, i) => (
            <li key={i} className="flex gap-[6px]"><span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-white/10 text-[11px] font-bold text-white">{i + 1}</span><span>{t}</span></li>
          ))}
        </ol>
      </div>
      {!board && <>
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
      </>}
      <p aria-live="polite" data-card-summary className="mt-[10px] text-[14px] font-semibold text-[#f2cf84]">{summary}</p>
      <p className="mt-[2px] text-[12px] text-[#a9a49b]">{board ? 'Back keeps the card. Once played, it can’t be taken back.' : 'Back keeps the card. Nothing happens until you press Play.'}</p>
      <div className="mt-[8px] flex items-center justify-between gap-[10px]">
        <button onClick={onBack} className={plain()}>Back</button>
        <button ref={playBtn} onClick={play} disabled={!ready} aria-label={`Play ${CARD[kind].name}`} className={gold()}>Play {CARD[kind].name}</button>
      </div>
    </div>
  )
}

export function DevDialog({ compact }: { compact: boolean }) {
  const { dev } = useGameView()
  const [pick, setPick] = useState<PlayKind | null>(null)
  const first = useRef<HTMLButtonElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (!pick) (first.current ?? close.current)?.focus() }, [pick])
  const seat = SEATS[dev.player]
  const firstPlayable = dev.rows.find((r) => r.playable)?.type
  // G7.5: every card opens its steps first; the card is played from there (Back keeps it)
  const play = (type: DevKind) => { if (type !== 'victoryPoint') setPick(type) }
  return (
    <section role="dialog" aria-labelledby="dev-title" className={`pointer-events-auto rounded-[14px] px-[14px] pb-[12px] pt-[10px] ${panel}`} style={{ boxShadow: `inset 0 0 0 2px ${seat.color}aa, 0 14px 34px rgba(0,0,0,.6)` }}>
      <div className="mb-[8px] flex items-center justify-between gap-[10px]">
        <h2 id="dev-title" className="whitespace-nowrap font-display text-[19px] font-semibold text-[#f4efe6]">
          <span className="mr-[8px] inline-block h-[11px] w-[11px] rounded-full align-middle" style={{ background: seat.color }} />
          {pick ? `${seat.name}: ${CARD[pick].name}` : `${seat.name}: my development cards`}
        </h2>
        <button ref={close} aria-label="Close development cards" onClick={() => setDevOpen(false)} className={`grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px] bg-white/10 text-[18px] text-white hover:bg-white/20 ${focusRing}`}>×</button>
      </div>
      {pick ? <CardSteps kind={pick} compact={compact} onDone={() => setDevOpen(false)} onBack={() => setPick(null)} /> : (
        dev.rows.length === 0
          ? <p className={`${compact ? 'w-[322px]' : 'w-[380px]'} text-[14px] text-[#d6d2ca]`}>No development cards yet. Buy one in Build: 1 wool, 1 grain, 1 ore.</p>
          : (
            <div className={`flex ${compact ? 'w-[322px]' : 'w-[390px]'} flex-col gap-[8px]`}>
              {(['play', 'new', 'played', 'wait', 'vp'] as DevGroup[]).map((g) => { const rows = dev.rows.filter((r) => r.group === g); return rows.length ? (
                <section key={g} aria-label={GROUP[g]} data-dev-group={g}>
                  <h3 className="mb-[4px] text-[12px] font-semibold uppercase tracking-[0.04em] text-[#bdb8af]">{GROUP[g]}</h3>
                  <ul className="flex flex-col gap-[6px]">
                    {rows.map((r) => <DevItem key={r.type} r={r} btnRef={r.type === firstPlayable && g === 'play' ? first : undefined} onPlay={() => play(r.type)} />)}
                  </ul>
                </section>
              ) : null })}
            </div>
          )
      )}
    </section>
  )
}

function DevItem({ r, btnRef, onPlay }: { r: DevRow; btnRef?: React.Ref<HTMLButtonElement>; onPlay: () => void }) {
  const vp = r.group === 'vp'
  const sub = vp ? 'Hidden from the others, counted at the end'
    : r.group === 'wait' ? r.reason ?? '' // the group heading says why for the others
    : CARD[r.type].blurb
  return (
    <li aria-label={vp ? `${r.count} victory point${r.count > 1 ? 's' : ''}` : undefined} className="flex min-h-[50px] items-center gap-[10px] rounded-[10px] bg-white/[0.05] py-[4px] pl-[5px] pr-[6px]" style={{ boxShadow: `inset 3px 0 0 ${CARD[r.type].tint}` }}>
      {/* A5: the card face (src/ui/cards/DevCardArt.tsx); a victory point keeps its "+N" as the badge */}
      <span className="relative shrink-0">
        <DevCard type={r.type} dim={!vp && r.group !== 'play'} />
        {(vp || r.count > 1) && <span className="absolute -right-[6px] -top-[6px] rounded-full bg-[#1d1a16] px-[5px] text-[11px] font-bold text-white ring-1 ring-white/30">{vp ? `+${r.count}` : `×${r.count}`}</span>}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-[15px] font-semibold text-white">{vp ? `Victory point${r.count > 1 ? 's' : ''}` : CARD[r.type].name}</span>
        <span className="block text-[12px] text-[#bdb8af]">{sub}</span>
      </span>
      {r.group === 'play' && (
        <button ref={btnRef} onClick={onPlay} aria-label={`Play ${CARD[r.type].name}`} title={CARD[r.type].blurb}
          className={`${gold()} !h-[34px] !px-[16px] !text-[15px]`}>Play</button>
      )}
    </li>
  )
}
