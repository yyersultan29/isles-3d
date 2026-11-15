// Online room screens (ROADMAP G5.3b): the lobby before the start (seats, invite link, Start for
// the host), a notice when the connection is lost, and a small "you are" pill during the game.
// G5.6b: every way of having no game (refused, full, gone, closed) says why and offers one action.
// Only mounted for an online store; a local game never renders any of it.

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Avatar } from './icons'
import { focusRing, panel } from './HUD'
import { SEATS } from './gameView'
import { useOnline, useSession } from '../store/GameProvider'
import { inviteLink } from '../net/connect'
import type { TimerPreset } from '../net/protocol'
import type { SessionErrorCode } from '../store/onlineStore'
import { COMPACT_SAFE, useViewport } from './layout'
import { L } from './locale'
import { LangSwitch } from './LangSwitch'

const gold = `h-[42px] rounded-full border-2 border-[#ffe7a6] bg-[linear-gradient(180deg,#ffe08a_0%,#f4b33a_45%,#d98a16_100%)] px-[26px] font-display text-[18px] font-semibold text-[#3a2208] disabled:cursor-not-allowed disabled:grayscale-[0.7] disabled:brightness-75 ${focusRing}`

export function Lobby() {
  const online = useOnline()
  const session = useSession()
  const [copied, setCopied] = useState(false)
  const { compact, h } = useViewport()
  const start = useRef<HTMLButtonElement>(null)
  const status = session?.status
  // the first snapshot starts the game on this screen; from then on the board stays visible
  const started = !!online && online.generation() > 0
  const covering = !started && !!status && status !== 'playing'
  // in a game, a dropped connection freezes the screen until the rejoin snapshot arrives
  const frozen = started && status === 'reconnecting'
  const retry = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!frozen) return
    const root = document.getElementById('root')
    if (root) root.inert = true
    retry.current?.focus()
    return () => { if (root) root.inert = false }
  }, [frozen])

  useEffect(() => {
    if (!covering) return
    const root = document.getElementById('root')
    if (root) root.inert = true
    return () => { if (root) root.inert = false }
  }, [covering])
  // a dialog takes the focus: the closed one on its action, otherwise the dialog itself (its title
  // and status are read), unless something inside it already has the focus
  const dialog = useRef<HTMLElement>(null)
  const action = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    if (!covering) return
    if (status === 'closed') action.current?.focus()
    else if (!dialog.current?.contains(document.activeElement)) dialog.current?.focus()
  }, [covering, status])
  const allTaken = !!session && session.seats.length === 4 && session.seats.every((s) => s.taken)
  useEffect(() => { if (allTaken && session?.host) start.current?.focus() }, [allTaken, session?.host])

  if (!online || !session) return null
  const me = session.me
  const closed = closedReason(session.errorCode, me !== null)
  const link = inviteLink(session.roomId)
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* the link stays selectable */ }
  }

  // ---- during the game: the connection dropped and the store is rejoining
  if (frozen) return createPortal(
    <div className="fixed inset-0 z-[55] grid place-items-center bg-[#08121c]/45 px-[12px] font-ui text-[#f4efe6]">
      <section role="alertdialog" aria-modal="true" aria-labelledby="reconnect-title" aria-describedby="reconnect-text"
        className={`w-full max-w-[340px] rounded-[16px] px-[18px] pb-[14px] pt-[14px] text-center ${panel}`}>
        <h2 id="reconnect-title" className="font-display text-[22px] font-semibold">{L('Reconnecting…', 'Переподключение…')}</h2>
        <p id="reconnect-text" className="mt-[4px] text-[14px] text-[#d6d2ca]">{L('The connection to the game dropped. Your seat is kept; the game continues as soon as you are back.', 'Связь с игрой прервалась. Ваше место сохранено, игра продолжится, как только вы вернётесь.')}</p>
        <button ref={retry} onClick={() => online.reconnectNow()} className={`mt-[12px] h-[36px] rounded-[9px] bg-white/10 px-[14px] text-[14px] font-semibold text-white hover:bg-white/20 ${focusRing}`}>{L('Retry now', 'Повторить сейчас')}</button>
      </section>
    </div>,
    document.body,
  )

  // ---- during the game: who you are, or why the connection is closed
  if (!covering) {
    const seat = me && me !== 'spectator' ? SEATS[me] : null
    return createPortal(
      // desktop: under the phase banner; compact: above the bottom dock (notices use the top there)
      <div className="pointer-events-none fixed inset-x-0 z-[30] flex justify-center font-ui" style={compact ? { bottom: COMPACT_SAFE.bottom + 6 } : { top: 70 }}>
        {status === 'closed' ? (
          <p role="alert" className={`pointer-events-auto mx-[8px] rounded-[16px] px-[16px] py-[7px] text-[14px] font-semibold text-[#ffd2c2] ring-2 ring-[#d23a2e] ${panel}`}>
            {closed.text} <a href={closed.action.href} className={`underline ${focusRing}`}>{closed.action.label}</a>
          </p>
        ) : session.errorCode === 'RATE_LIMITED' ? (
          <p role="status" className={`mx-[8px] rounded-full px-[14px] py-[5px] text-[13px] font-semibold text-[#ffe2a8] ring-1 ring-[#f2b544] ${panel}`}>{RATE()}</p>
        ) : compact && h < 500 ? (
          // a landscape phone has no free strip: the hand already says whose cards these are
          <p className="sr-only">{seat ? L(`Online, you are ${seat.name}`, `Онлайн, вы — ${seat.name}`) : L('Online, watching', 'Онлайн, вы зритель')}</p>
        ) : (
          <p aria-live="polite" className={`rounded-full px-[12px] py-[4px] text-[13px] font-semibold text-[#ece8e0] ${panel}`}>
            {seat ? <><span aria-hidden className="mr-[6px] inline-block h-[9px] w-[9px] rounded-full align-middle" style={{ background: seat.color }} />{L(`Online · you are ${seat.name}`, `Онлайн · вы — ${seat.name}`)}</> : L('Online · watching', 'Онлайн · зритель')}
          </p>
        )}
      </div>,
      document.body,
    )
  }

  // ---- before the game
  const title = status === 'connecting' ? L('Connecting…', 'Подключение…') : status === 'reconnecting' ? L('Reconnecting…', 'Переподключение…') : status === 'closed' ? closed.title : L('Online room', 'Онлайн-комната')
  return createPortal(
    <div className="fixed inset-0 z-[55] grid place-items-center bg-[#08121c]/85 px-[12px] font-ui text-[#f4efe6]">
      <section ref={dialog} tabIndex={-1} role={status === 'closed' ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby="lobby-title" aria-describedby="lobby-status"
        onKeyDown={trapTab}
        className={`w-full max-w-[420px] rounded-[16px] px-[18px] pb-[16px] pt-[16px] outline-none ${panel} animate-[notice-in_.25s_ease-out]`}
        style={{ boxShadow: 'inset 0 0 0 2px #f2b544aa, 0 18px 50px rgba(0,0,0,.65)' }}>
        <div className="flex items-start justify-between gap-[10px]">
          <h2 id="lobby-title" className="font-display text-[24px] font-semibold leading-tight">{title}</h2>
          <LangSwitch />
        </div>
        {status === 'closed' ? (
          <>
            <p id="lobby-status" className="mt-[6px] text-[14px] text-[#d6d2ca]">
              {closed.text}
              {closed.serverHint && <> {L('Start it with', 'Запустите его командой')} <code className="rounded bg-white/10 px-[4px]">npm run server</code>.</>}
            </p>
            <div className="mt-[14px] flex justify-end">
              <a ref={action} href={closed.action.href} className={`inline-flex h-[36px] items-center rounded-[9px] bg-white/10 px-[14px] text-[14px] font-semibold text-white hover:bg-white/20 ${focusRing}`}>{closed.action.label}</a>
            </div>
          </>
        ) : (
          <>
            <p id="lobby-status" aria-live="polite" className="mt-[4px] text-[14px] text-[#d6d2ca]">
              {status === 'connecting' ? `${L('Room', 'Комната')} ${session.roomId}` : me === 'spectator' ? L('All seats are taken: you are watching.', 'Все места заняты: вы зритель.')
                : allTaken ? (session.host ? L('Everyone is here.', 'Все на месте.') : L('Everyone is here. Waiting for the host to start.', 'Все на месте. Ждём, когда хозяин начнёт игру.'))
                  : L('Send the link to the other players. The game starts when all four seats are taken.', 'Отправьте ссылку остальным игрокам. Игра начнётся, когда займут все четыре места.')}
            </p>
            {session.errorCode && <p role="alert" className="mt-[6px] text-[14px] text-[#ffb4a2]">{session.errorCode === 'RATE_LIMITED' ? RATE() : session.error}</p>}
            <div className="mt-[12px] flex items-center gap-[8px]">
              <input readOnly value={link} aria-label={L('Invite link', 'Ссылка-приглашение')} onFocus={(e) => e.currentTarget.select()}
                className={`h-[36px] min-w-0 flex-1 rounded-[9px] bg-black/30 px-[10px] text-[13px] text-[#ece8e0] ring-1 ring-white/15 ${focusRing}`} />
              <button onClick={copy} className={`h-[36px] shrink-0 rounded-[9px] bg-white/10 px-[12px] text-[14px] font-semibold text-white hover:bg-white/20 ${focusRing}`}>
                {copied ? L('Copied', 'Скопировано') : L('Copy link', 'Копировать')}
              </button>
              <span role="status" className="sr-only">{copied ? L('Invite link copied', 'Ссылка скопирована') : ''}</span>
            </div>
            <ul aria-label={L('Seats', 'Места')} className="mt-[12px] grid grid-cols-2 gap-[8px]">
              {(session.seats.length ? session.seats : (['p1', 'p2', 'p3', 'p4'] as const).map((id) => ({ id, taken: false, connected: false }))).map((s) => {
                const seat = SEATS[s.id]
                const state = !s.taken ? L('Open seat', 'Свободно') : s.id === me ? L('You', 'Вы') : s.connected ? L('Joined', 'В игре') : L('Away', 'Нет связи')
                return (
                  <li key={s.id} aria-label={`${seat.name}: ${state}`}
                    className={`flex items-center gap-[8px] rounded-[10px] bg-white/[0.05] p-[6px] ${s.taken ? '' : 'opacity-55'}`} style={{ boxShadow: `inset 3px 0 0 ${seat.color}` }}>
                    <span className="h-[32px] w-[32px] shrink-0 overflow-hidden rounded-[7px]"><Avatar i={seat.avatar} className="h-full w-full" /></span>
                    <span aria-hidden className="flex flex-col leading-tight">
                      <span className="text-[15px] font-semibold">{seat.name}</span>
                      <span className={`text-[12px] ${s.id === me ? 'text-[#f2cf84]' : 'text-[#a9a49b]'}`}>{state}</span>
                    </span>
                  </li>
                )
              })}
            </ul>
            <TimerChoice host={session.host} preset={session.preset} onChange={(t) => online.setTimer(t)} />
            {session.host && (
              <div className="mt-[14px] flex justify-end">
                <button ref={start} disabled={!allTaken} onClick={() => online.start()} className={gold}>{L('Start game', 'Начать игру')}</button>
              </div>
            )}
          </>
        )}
      </section>
    </div>,
    document.body,
  )
}

/** keeps Tab inside a modal dialog: past the last control back to the first, and the other way */
function trapTab(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== 'Tab') return
  // the radios keep one tab stop (tabIndex -1 on the others), so only real stops count
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input')].filter((x) => x.tabIndex >= 0)
  if (!items.length) return
  const first = items[0], last = items[items.length - 1], at = document.activeElement
  if (e.shiftKey && (at === first || at === e.currentTarget)) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus() }
}

const RATE = () => L('Too many clicks at once: some were ignored. Try again.', 'Слишком много нажатий сразу: часть пропущена. Попробуйте ещё раз.')

/** `?online`, keeping a chosen game server */
function newRoomHref() {
  const server = new URLSearchParams(location.search).get('server')
  return `${location.pathname}?online${server ? `&server=${encodeURIComponent(server)}` : ''}`
}

/** G5.6b: why there is no game to show, in words, with the one thing to do about it */
function closedReason(code: SessionErrorCode | null, joined: boolean): { title: string; text: string; action: { label: string; href: string }; serverHint?: boolean } {
  const reload = { label: L('Try again', 'Попробовать снова'), href: location.href }
  const fresh = { label: L('New room', 'Новая комната'), href: newRoomHref() }
  switch (code) {
    case 'REPLACED': return { title: L('Open in another tab', 'Открыто в другой вкладке'), text: L('Your seat is open in another tab or device.', 'Ваше место открыто в другой вкладке или на другом устройстве.'), action: { label: L('Play here', 'Играть здесь'), href: location.href } }
    case 'NO_ROOM': return { title: L('This room is gone', 'Комнаты больше нет'), text: L('The game is no longer on the server: the room sat empty, or the server restarted.', 'Игры больше нет на сервере: комната пустовала или сервер перезапустился.'), action: fresh }
    case 'ABANDONED': return { title: L('Room closed', 'Комната закрыта'), text: L('Nobody played for five minutes, so the room was closed.', 'Пять минут никто не играл, поэтому комнату закрыли.'), action: fresh }
    case 'ROOM_FULL': return { title: L('This room is full', 'Комната заполнена'), text: L('Too many people are connected to this room right now.', 'Сейчас к комнате подключено слишком много людей.'), action: fresh }
    case 'CREATE_BUSY': return { title: L('Can’t create a room yet', 'Пока нельзя создать комнату'), text: L('Too many rooms were created from this network. Wait a minute, then try again.', 'Из этой сети создано слишком много комнат. Подождите минуту и попробуйте снова.'), action: reload }
    case 'CREATE_FULL': return { title: L('The server is full', 'Сервер заполнен'), text: L('The game server has no room for another game right now. Try again later.', 'На игровом сервере сейчас нет места для новой игры. Попробуйте позже.'), action: reload }
    case 'UNREACHABLE': return { title: L('Can’t reach the game server', 'Игровой сервер недоступен'), text: L('No room could be created because the game server didn’t answer for a minute and a half.', 'Не удалось создать комнату: сервер не отвечал полторы минуты.'), action: reload, serverHint: true }
    default: return joined
      ? { title: L('Connection closed', 'Соединение закрыто'), text: L('The connection to the game closed.', 'Соединение с игрой закрылось.'), action: { label: L('Reload', 'Перезагрузить'), href: location.href } }
      : { title: L('Can’t reach the game server', 'Игровой сервер недоступен'), text: L('This page keeps trying and joins once the server answers.', 'Страница продолжает попытки и подключится, когда сервер ответит.'), action: reload, serverHint: true }
  }
}

const PRESETS = (): { id: TimerPreset; label: string; hint: string }[] => [
  { id: 'relaxed', label: L('Relaxed', 'Спокойно'), hint: L('3 min per turn', '3 мин на ход') },
  { id: 'normal', label: L('Normal', 'Обычно'), hint: L('90 s per turn', '90 с на ход') },
  { id: 'fast', label: L('Fast', 'Быстро'), hint: L('45 s per turn', '45 с на ход') },
  { id: 'off', label: L('Off', 'Выкл.'), hint: L('no time limit', 'без ограничения') },
]

/** G5.5: the turn timer; the host picks it, everyone sees it. */
function TimerChoice({ host, preset, onChange }: { host: boolean; preset: TimerPreset; onChange: (t: TimerPreset) => void }) {
  const presets = PRESETS()
  const current = presets.find((p) => p.id === preset)!
  if (!host) return <p className="mt-[10px] text-[13px] text-[#a9a49b]">{L('Turn timer', 'Таймер хода')}: <span className="font-semibold text-[#ece8e0]">{current.label}</span> ({current.hint})</p>
  return (
    <fieldset className="mt-[12px]">
      <legend className="mb-[6px] text-[13px] text-[#a9a49b]">{L('Turn timer', 'Таймер хода')} <span className="text-[#ece8e0]">· {current.hint}</span></legend>
      <div role="radiogroup" aria-label={L('Turn timer', 'Таймер хода')} className="grid grid-cols-4 gap-[6px]" onKeyDown={(e) => {
        // the radio pattern: one tab stop, arrows move and select
        const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
        if (!step) return
        e.preventDefault()
        const i = (presets.findIndex((p) => p.id === preset) + step + presets.length) % presets.length
        onChange(presets[i].id)
        ;(e.currentTarget.children[i] as HTMLElement | undefined)?.focus()
      }}>
        {presets.map((p) => (
          <button key={p.id} role="radio" aria-checked={p.id === preset} tabIndex={p.id === preset ? 0 : -1} title={p.hint} aria-label={`${p.label}, ${p.hint}`} onClick={() => onChange(p.id)}
            className={`h-[32px] rounded-[8px] text-[13px] font-semibold ${p.id === preset ? 'bg-[#f2b544] text-[#2a1a06]' : 'bg-white/10 text-white hover:bg-white/20'} ${focusRing}`}>{p.label}</button>
        ))}
      </div>
    </fieldset>
  )
}
