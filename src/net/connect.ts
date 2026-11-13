// Entering an online game from the address bar (ROADMAP G5.3b).
//   ?online          create a room on the server, then continue at ?room=<id>
//   ?room=<id>       join that room: take a free seat, or watch when all four are taken
//   &server=host:port  the game server (default: the server this build was made for, VITE_GAME_SERVER,
//                      else this page's host, port 8787)
// The seat token is kept per browser tab (sessionStorage), so a reload of the tab rejoins the same
// seat, while four tabs of one browser are four different players. G5.4: the browser also remembers
// every token it held in the room (localStorage); a reopened tab offers them and the server gives
// back a seat whose player is away, never one another tab is using.

import { createOnlineStore, type OnlineStore, type SessionErrorCode } from '../store/onlineStore'

const params = () => new URLSearchParams(location.search)

export function serverAddress(p = params()): { http: string; ws: string } {
  const host = p.get('server') ?? (import.meta.env.VITE_GAME_SERVER as string | undefined) ?? `${location.hostname || '127.0.0.1'}:8787`
  const secure = location.protocol === 'https:'
  return { http: `${secure ? 'https' : 'http'}://${host}`, ws: `${secure ? 'wss' : 'ws'}://${host}/ws` }
}

/** why `?online` has no room (G5.6b); read by onlineStoreFromUrl to explain it */
let createFailure: { code: SessionErrorCode; message: string } | null = null

/** G5.7: a free host sleeps when idle and takes about a minute to wake: keep asking this long */
const WAKE_MS = 90_000

/**
 * `?online` without a room: create one and move to its link. Resolves false when nothing to do.
 * While the server doesn't answer yet (asleep on a free host, or a proxy error while it wakes),
 * it keeps asking for WAKE_MS and reports the wait through `onWaiting` (seconds so far).
 */
export async function createRoomFromUrl(onWaiting?: (seconds: number) => void, wakeMs = WAKE_MS, retryMs = 2500): Promise<boolean> {
  const p = params()
  if (!p.has('online') || p.get('room')) return false
  const started = Date.now()
  for (;;) {
    try {
      const r = await fetch(`${serverAddress(p).http}/rooms`, { method: 'POST', signal: AbortSignal.timeout(20_000) })
      // our own refusals carry JSON; a waking host's proxy answers 502/503/504 without it
      const ours = (r.headers.get('content-type') ?? '').includes('application/json')
      if (r.ok) {
        const { roomId } = await r.json() as { roomId: string }
        p.delete('online')
        p.set('room', roomId)
        location.replace(`${location.pathname}?${p}`)
        return true
      }
      // refused (429 too many rooms, 503 full): never continue at ?room=undefined
      if (r.status === 429) { createFailure = { code: 'CREATE_BUSY', message: 'too many rooms created' }; return false }
      if (ours || r.status < 500) { createFailure = { code: 'CREATE_FULL', message: `server answered ${r.status}` }; return false }
    } catch { /* no answer yet */ }
    const waited = Date.now() - started
    if (waited >= wakeMs) {
      createFailure = { code: 'UNREACHABLE', message: 'no answer from the game server' }
      return false // the page explains it (Lobby)
    }
    onWaiting?.(Math.round(waited / 1000))
    await new Promise((r) => setTimeout(r, retryMs))
  }
}

const tokenKey = (room: string) => `isles3d.seat.${room}`
const readToken = (room: string) => { try { return sessionStorage.getItem(tokenKey(room)) ?? undefined } catch { return undefined } }
const writeToken = (room: string, t: string) => { try { sessionStorage.setItem(tokenKey(room), t) } catch { /* private mode: no rejoin */ } }

const heldKey = (room: string) => `isles3d.held.${room}`
const readHeld = (room: string): string[] => {
  try { const v = JSON.parse(localStorage.getItem(heldKey(room)) ?? '[]'); return Array.isArray(v) ? v.filter((t) => typeof t === 'string').slice(-4) : [] } catch { return [] }
}
const addHeld = (room: string, t: string) => {
  try { const held = readHeld(room).filter((x) => x !== t); localStorage.setItem(heldKey(room), JSON.stringify([...held, t].slice(-4))) } catch { /* no storage: no resume */ }
}

/** The online store for `?room=` (or `?online` when no server answered), else null (a local game). */
export function onlineStoreFromUrl(): OnlineStore | null {
  const p = params()
  const roomId = p.get('room') ?? (p.has('online') ? 'none' : null)
  if (!roomId || !/^[A-Za-z0-9_-]{1,64}$/.test(roomId)) return null
  // `?online` whose room couldn't be created: a closed store that says why (no socket to room "none")
  if (!p.get('room')) return createOnlineStore({ connect: () => new WebSocket(serverAddress(p).ws), roomId, failed: createFailure ?? { code: 'UNREACHABLE', message: 'no room was created' } })
  const token = readToken(roomId)
  const store = createOnlineStore({ connect: () => new WebSocket(serverAddress(p).ws), roomId, token, claim: true, resume: readHeld(roomId) })
  store.onSession(() => { const t = store.session().token; if (t) { writeToken(roomId, t); addHeld(roomId, t) } })
  return store
}

/** The link others open to join this room. */
export function inviteLink(roomId: string) {
  const p = new URLSearchParams(location.search)
  const keep = new URLSearchParams()
  keep.set('room', roomId)
  if (p.get('server')) keep.set('server', p.get('server')!)
  return `${location.origin}${location.pathname}?${keep}`
}
