// The notice stack (ROADMAP G4.5a): event summaries and the message for every rejected action.
// Mounted once per HUD layout; it subscribes to store events and rejections, so every dispatch
// path (board clicks, buttons, dialogs) reports errors the same way.

import { useEffect } from 'react'
import { useGameEvents, useGameStore } from '../store/GameProvider'
import { errorText } from './i18n'
import { clearNotices, dismissNotice, eventNotices, pushNotice, useNotices, type NoticeKind } from './noticeQueue'
import { panel } from './HUD'

const RING: Record<NoticeKind, string> = { info: 'ring-white/15', good: 'ring-[#f2b544]/70', warn: 'ring-[#e0812f]/70', error: 'ring-[#e0483a]/80' }

export function Notices({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  const store = useGameStore()
  const list = useNotices()
  useGameEvents((events) => {
    if (events.some((e) => e.type === 'GAME_STARTED')) clearNotices()
    for (const n of eventNotices(events)) pushNotice(n)
  })
  useEffect(() => store.onRejected((e) => pushNotice({ kind: 'error', text: errorText(e.code) })), [store])
  return (
    <div className={`pointer-events-none flex flex-col items-center gap-[6px] ${className}`} style={style} aria-live="polite">
      {list.map((n) => (
        <button key={n.id} role={n.kind === 'error' ? 'alert' : undefined} onClick={() => dismissNotice(n.id)} title="Dismiss"
          className={`pointer-events-auto flex max-w-full items-center gap-[8px] rounded-full px-[14px] py-[6px] text-left text-[14px] font-medium text-[#f4efe6] ring-1 ${RING[n.kind]} ${panel} animate-[notice-in_.22s_ease-out]`}>
          {n.kind === 'error'
            ? <span aria-hidden className="grid h-[16px] w-[16px] shrink-0 place-items-center rounded-full bg-[#e0483a] text-[11px] font-bold text-white">!</span>
            : <span aria-hidden className="h-[9px] w-[9px] shrink-0 rounded-full" style={{ background: n.color ?? '#d6d2ca' }} />}
          <span>{n.text}</span>
        </button>
      ))}
    </div>
  )
}
