// Entering an online game from the address bar (ROADMAP G5.3b).
//   ?online          create a room on the server, then continue at ?room=<id>
//   ?room=<id>       join that room: take a free seat, or watch when all four are taken
//   &server=host:port  the game server (default: this page's host, port 8787)
// The seat token is kept per browser tab (sessionStorage), so a reload of the tab rejoins the same
// seat, while four tabs of one browser are four different players.

import { createOnlineStore, type OnlineStore } from '../store/onlineStore'

const params = () => new URLSearchParams(location.search)

export function serverAddress(p = params()): { http: string; ws: string } {
  const host = p.get('server') ?? `${location.hostname || '127.0.0.1'}:8787`
  const secure = location.protocol === 'https:'
  return { http: `${secure ? 'https' : 'http'}://${host}`, ws: `${secure ? 'wss' : 'ws'}://${host}/ws` }
}

/** `?online` without a room: create one and move to its link. Resolves false when nothing to do. */
export async function createRoomFromUrl(): Promise<boolean> {
  const p = params()
  if (!p.has('online') || p.get('room')) return false
  try {
    const r = await fetch(`${serverAddress(p).http}/rooms`, { method: 'POST' })
    const { roomId } = await r.json() as { roomId: string }
    p.delete('online')
    p.set('room', roomId)
    location.replace(`${location.pathname}?${p}`)
    return true
  } catch {
    return false // no server: the page explains it (Lobby shows the closed connection)
  }
}

const tokenKey = (room: string) => `isles3d.seat.${room}`
const readToken = (room: string) => { try { return sessionStorage.getItem(tokenKey(room)) ?? undefined } catch { return undefined } }
const writeToken = (room: string, t: string) => { try { sessionStorage.setItem(tokenKey(room), t) } catch { /* private mode: no rejoin */ } }

/** The online store for `?room=` (or `?online` when no server answered), else null (a local game). */
export function onlineStoreFromUrl(): OnlineStore | null {
  const p = params()
  const roomId = p.get('room') ?? (p.has('online') ? 'none' : null)
  if (!roomId || !/^[A-Za-z0-9_-]{1,64}$/.test(roomId)) return null
  const token = readToken(roomId)
  const store = createOnlineStore({ connect: () => new WebSocket(serverAddress(p).ws), roomId, token, claim: true })
  store.onSession(() => { const t = store.session().token; if (t) writeToken(roomId, t) })
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
