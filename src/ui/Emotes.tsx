// G11b: emotes in online games. A button opens a 5×2 picker; the server sends the emote to the whole
// room, and it shows for 2.5 s over the sender's avatar. Not game state: nothing here touches the
// engine, the replay or the save. Unicode emoji stand in until the art (G11c) arrives.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { EMOTES, type EmoteId } from '../net/protocol'
import type { PlayerId } from '../game'
import { useOnline, useSeat } from '../store/GameProvider'
import { localStore } from '../store/autosave'
import { useGameView } from './gameView'
import { IconButton } from './HUD'
import { focusRing, panel } from './tokens'
import { L } from './locale'

export const EMOTE_SHOW_MS = 2500
const COOLDOWN_MS = 2500 // the server's EMOTE_COOLDOWN_MS; a faster click would be dropped there anyway

const EMOJI: Record<EmoteId, string> = { thumbs: '👍', laugh: '😂', wow: '😮', deal: '🤝', angry: '😤', sad: '😢', please: '🙏', smirk: '😏', sleepy: '😴', robber: '🦹' }
const NAME: Record<EmoteId, () => string> = {
  thumbs: () => L('Nice', 'Класс'), laugh: () => L('Laugh', 'Смех'), wow: () => L('Wow', 'Ого'), deal: () => L('Deal?', 'По рукам?'),
  angry: () => L('Angry', 'Злюсь'), sad: () => L('Sad', 'Грустно'), please: () => L('Please', 'Ну пожалуйста'), smirk: () => L('Smirk', 'Ухмылка'),
  sleepy: () => L('Sleepy', 'Скучно'), robber: () => L('Robber', 'Разбойник'),
}

// ---- mute: "all" is kept on this device; a player is muted for this page only, because seat ids
// are reused by different people in the next room
const MUTE_KEY = 'isles3d.emoteMute.v1'
let muteAll = (() => { try { return localStore()?.getItem(MUTE_KEY) === '1' } catch { return false } })()
let mutedSeats: ReadonlySet<PlayerId> = new Set()
const muteListeners = new Set<() => void>()
const muteChanged = () => { for (const l of [...muteListeners]) l() }
const onMute = (l: () => void) => { muteListeners.add(l); return () => { muteListeners.delete(l) } }
function setMuteAll(v: boolean) {
  muteAll = v
  try { localStore()?.setItem(MUTE_KEY, v ? '1' : '0') } catch { /* this page only */ }
  muteChanged()
}
function toggleSeat(p: PlayerId) {
  const n = new Set(mutedSeats)
  if (!n.delete(p)) n.add(p)
  mutedSeats = n
  muteChanged()
}
const useMuteAll = () => useSyncExternalStore(onMute, () => muteAll)
const useMutedSeats = () => useSyncExternalStore(onMute, () => mutedSeats)

/** The emote over one seat's avatar; place it inside a `relative` box the size of the avatar. */
export function EmoteBubble({ seat, name, size }: { seat: PlayerId; name: string; size: number }) {
  const online = useOnline()
  const [shown, setShown] = useState<{ id: EmoteId; n: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    if (!online) return
    const off = online.onEmote((from, id) => {
      if (from !== seat || muteAll || mutedSeats.has(from)) return
      clearTimeout(timer.current)
      setShown((s) => ({ id, n: (s?.n ?? 0) + 1 })) // n restarts the animation when the same emote repeats
      timer.current = setTimeout(() => setShown(null), EMOTE_SHOW_MS)
    })
    return () => { off(); clearTimeout(timer.current) }
  }, [online, seat])
  if (!online) return null
  return (
    <>
      <span aria-live="polite" className="sr-only">{shown ? `${name}: ${NAME[shown.id]()}` : ''}</span>
      {shown && (
        <span key={shown.n} aria-hidden data-emote={shown.id}
          className="emote-bubble pointer-events-none absolute inset-0 z-[1] grid place-items-center rounded-full bg-[radial-gradient(circle,rgba(255,244,214,.95)_55%,rgba(255,244,214,0)_72%)] leading-none"
          style={{ fontSize: size }}>
          <span className="emote-motion inline-block">{EMOJI[shown.id]}</span>
        </span>
      )}
    </>
  )
}

const SmileIco = ({ size }: { size: number }) => (
  <svg aria-hidden viewBox="0 0 24 24" style={{ width: size, height: size }} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" /><path d="M9 9.5h.01M15 9.5h.01" strokeWidth="2.8" /></svg>
)

/**
 * The emote button with its picker (online only). A spectator cannot send, so for them the picker
 * holds only the mute switches. The picker opens above the button; `dock` (phone) anchors it to the
 * dock row instead, so it fits a narrow screen, and lifts it over the online "you are" pill.
 */
export function EmoteButton({ className = '', icon = 24, dock = false }: { className?: string; icon?: number; dock?: boolean }) {
  const online = useOnline()
  const me = useSeat()
  const { seats } = useGameView()
  const all = useMuteAll()
  const muted = useMutedSeats()
  const [open, setOpen] = useState(false)
  const [cool, setCool] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const coolTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(coolTimer.current), [])
  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus() } }
    const down = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('keydown', key)
    document.addEventListener('pointerdown', down)
    return () => { window.removeEventListener('keydown', key); document.removeEventListener('pointerdown', down) }
  }, [open])
  if (!online || !me) return null
  const player = me !== 'spectator'
  const send = (id: EmoteId) => {
    online.sendEmote(id)
    setOpen(false)
    btn.current?.focus()
    setCool(true)
    clearTimeout(coolTimer.current)
    coolTimer.current = setTimeout(() => setCool(false), COOLDOWN_MS)
  }
  const chip = (on: boolean) => `rounded-full px-[10px] py-[4px] text-[13px] font-semibold ${focusRing} ${on ? 'bg-[#f2b544] text-[#2a1a06]' : 'bg-white/10 text-[#ece8e0] hover:bg-white/20'}`
  return (
    <div ref={box} className={`shrink-0 ${dock ? '' : 'relative'}`}>
      <IconButton ref={btn} label={L('Emotes', 'Эмоции')} data-emote-button aria-expanded={open} aria-controls="emote-picker"
        onClick={() => setOpen((v) => !v)} className={`${open ? 'ring-2 ring-[#f2b544]' : ''} ${className}`}>
        <SmileIco size={icon} />
      </IconButton>
      {open && (
        <section id="emote-picker" aria-label={L('Emotes', 'Эмоции')}
          className={`pointer-events-auto absolute left-0 z-[3] w-[272px] rounded-[12px] p-[10px] text-[#ece8e0] ${panel} ${dock ? 'bottom-[86px] max-h-[calc(100dvh-110px)] overflow-y-auto' : 'bottom-full mb-[8px]'}`}>
          {player && (
            <div className="grid grid-cols-5 gap-[6px]">
              {EMOTES.map((id) => (
                <button key={id} data-emote-id={id} aria-label={NAME[id]()} title={NAME[id]()} disabled={cool} onClick={() => send(id)}
                  className={`grid h-[44px] place-items-center rounded-[9px] bg-white/5 text-[26px] leading-none transition-[filter,transform] hover:bg-white/15 active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`}>
                  <span aria-hidden>{EMOJI[id]}</span>
                </button>
              ))}
            </div>
          )}
          <div className={`flex flex-wrap items-center gap-[6px] ${player ? 'mt-[10px] border-t border-white/15 pt-[8px]' : ''}`}>
            <span className="text-[13px] text-[#bdb8ae]">{L('Mute:', 'Скрыть:')}</span>
            <button aria-pressed={all} data-emote-mute="all" onClick={() => setMuteAll(!all)} className={chip(all)}>{L('Everyone', 'Всех')}</button>
            {seats.filter((p) => p.id !== me).map((p) => (
              <button key={p.id} aria-pressed={all || muted.has(p.id)} disabled={all} data-emote-mute={p.id} onClick={() => toggleSeat(p.id)}
                aria-label={L(`Mute ${p.name}`, `Скрыть: ${p.name}`)} className={`${chip(all || muted.has(p.id))} max-w-[110px] truncate disabled:opacity-60`}
                style={{ boxShadow: `inset 3px 0 0 ${p.color}` }}>{p.name}</button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
