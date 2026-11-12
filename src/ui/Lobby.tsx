// Online room screens (ROADMAP G5.3b): the lobby before the start (seats, invite link, Start for
// the host), a notice when the connection is lost, and a small "you are" pill during the game.
// Only mounted for an online store; a local game never renders any of it.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Avatar } from './icons'
import { focusRing, panel } from './HUD'
import { SEATS } from './gameView'
import { useOnline, useSession } from '../store/GameProvider'
import { inviteLink } from '../net/connect'
import { COMPACT_SAFE, useViewport } from './layout'

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
  const allTaken = !!session && session.seats.length === 4 && session.seats.every((s) => s.taken)
  useEffect(() => { if (allTaken && session?.host) start.current?.focus() }, [allTaken, session?.host])

  if (!online || !session) return null
  const me = session.me
  const link = inviteLink(session.roomId)
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* the link stays selectable */ }
  }

  // ---- during the game: the connection dropped and the store is rejoining
  if (frozen) return createPortal(
    <div className="fixed inset-0 z-[55] grid place-items-center bg-[#08121c]/45 px-[12px] font-ui text-[#f4efe6]">
      <section role="alertdialog" aria-modal="true" aria-labelledby="reconnect-title" aria-describedby="reconnect-text"
        className={`w-full max-w-[340px] rounded-[16px] px-[18px] pb-[14px] pt-[14px] text-center ${panel}`}>
        <h2 id="reconnect-title" className="font-display text-[22px] font-semibold">Reconnecting…</h2>
        <p id="reconnect-text" className="mt-[4px] text-[14px] text-[#d6d2ca]">The connection to the game dropped. Your seat is kept; the game continues as soon as you are back.</p>
        <button ref={retry} onClick={() => online.reconnectNow()} className={`mt-[12px] h-[36px] rounded-[9px] bg-white/10 px-[14px] text-[14px] font-semibold text-white hover:bg-white/20 ${focusRing}`}>Retry now</button>
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
            {session.error?.startsWith('REPLACED')
              ? <>Your seat is open in another tab or device. <a href={location.href} className={`underline ${focusRing}`}>Play here</a></>
              : session.error?.startsWith('NO_ROOM')
              ? <>This game is no longer on the server (it was restarted). <a href="?online" className={`underline ${focusRing}`}>New room</a></>
              : <>Connection closed. <a href={location.href} className={`underline ${focusRing}`}>Reload</a> to rejoin your seat.</>}
          </p>
        ) : compact && h < 500 ? (
          // a landscape phone has no free strip: the hand already says whose cards these are
          <p className="sr-only">{seat ? `Online, you are ${seat.name}` : 'Online, watching'}</p>
        ) : (
          <p aria-live="polite" className={`rounded-full px-[12px] py-[4px] text-[13px] font-semibold text-[#ece8e0] ${panel}`}>
            {seat ? <><span aria-hidden className="mr-[6px] inline-block h-[9px] w-[9px] rounded-full align-middle" style={{ background: seat.color }} />Online · you are {seat.name}</> : 'Online · watching'}
          </p>
        )}
      </div>,
      document.body,
    )
  }

  // ---- before the game
  const title = status === 'connecting' ? 'Connecting…' : status === 'reconnecting' ? 'Reconnecting…' : status === 'closed' ? 'Can’t reach the game server' : 'Online room'
  return createPortal(
    <div className="fixed inset-0 z-[55] grid place-items-center bg-[#08121c]/85 px-[12px] font-ui text-[#f4efe6]">
      <section role="dialog" aria-modal="true" aria-labelledby="lobby-title" aria-describedby="lobby-status"
        className={`w-full max-w-[420px] rounded-[16px] px-[18px] pb-[16px] pt-[16px] ${panel} animate-[notice-in_.25s_ease-out]`}
        style={{ boxShadow: 'inset 0 0 0 2px #f2b544aa, 0 18px 50px rgba(0,0,0,.65)' }}>
        <h2 id="lobby-title" className="font-display text-[24px] font-semibold leading-tight">{title}</h2>
        {status === 'closed' ? (
          <p id="lobby-status" className="mt-[6px] text-[14px] text-[#d6d2ca]">
            Start it with <code className="rounded bg-white/10 px-[4px]">npm run server</code>; this page keeps trying and joins once it answers.
            {session.error && <span className="mt-[4px] block text-[#ffb4a2]">{session.error}</span>}
          </p>
        ) : (
          <>
            <p id="lobby-status" className="mt-[4px] text-[14px] text-[#d6d2ca]">
              {status === 'connecting' ? `Room ${session.roomId}` : me === 'spectator' ? 'All seats are taken: you are watching.'
                : allTaken ? (session.host ? 'Everyone is here.' : 'Everyone is here. Waiting for the host to start.')
                  : 'Send the link to the other players. The game starts when all four seats are taken.'}
            </p>
            {session.error && <p role="alert" className="mt-[6px] text-[14px] text-[#ffb4a2]">{session.error}</p>}
            <div className="mt-[12px] flex items-center gap-[8px]">
              <input readOnly value={link} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()}
                className={`h-[36px] min-w-0 flex-1 rounded-[9px] bg-black/30 px-[10px] text-[13px] text-[#ece8e0] ring-1 ring-white/15 ${focusRing}`} />
              <button onClick={copy} className={`h-[36px] shrink-0 rounded-[9px] bg-white/10 px-[12px] text-[14px] font-semibold text-white hover:bg-white/20 ${focusRing}`}>
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
            <ul aria-label="Seats" className="mt-[12px] grid grid-cols-2 gap-[8px]">
              {(session.seats.length ? session.seats : (['p1', 'p2', 'p3', 'p4'] as const).map((id) => ({ id, taken: false, connected: false }))).map((s) => {
                const seat = SEATS[s.id]
                const state = !s.taken ? 'Open seat' : s.id === me ? 'You' : s.connected ? 'Joined' : 'Away'
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
            {session.host && (
              <div className="mt-[14px] flex justify-end">
                <button ref={start} disabled={!allTaken} onClick={() => online.start()} className={gold}>Start game</button>
              </div>
            )}
          </>
        )}
      </section>
    </div>,
    document.body,
  )
}
