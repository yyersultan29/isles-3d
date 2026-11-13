// G5.7: creating a room waits for a sleeping free host; a page's idle socket sends keep-alives.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRoomFromUrl, onlineStoreFromUrl } from '../connect'
import { createOnlineStore, type SocketLike } from '../../store/onlineStore'

const page = (search: string) => {
  const replace = vi.fn()
  vi.stubGlobal('location', { search, pathname: '/isles-3d/', hostname: 'example.test', protocol: 'https:', origin: 'https://example.test', replace })
  return replace
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
afterEach(() => { vi.unstubAllGlobals() })

describe('room creation on a free host G5.7', () => {
  it('keeps asking while the host wakes (no answer, then a proxy 502), then moves to the room', async () => {
    const replace = page('?online&server=game.test')
    const answers = [() => Promise.reject(new TypeError('failed')), () => Promise.resolve(new Response('waking', { status: 502 })), () => Promise.resolve(json(201, { roomId: 'abc123' }))]
    const fetch = vi.fn((url: string) => { expect(url).toBe('https://game.test/rooms'); return answers.shift()!() })
    vi.stubGlobal('fetch', fetch)
    const waits: number[] = []
    expect(await createRoomFromUrl((s) => waits.push(s), 5000, 5)).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(waits).toHaveLength(2)
    expect(replace).toHaveBeenCalledWith('/isles-3d/?server=game.test&room=abc123')
  })

  it('a refusal from the server itself is final (429), and so is no answer after the wait', async () => {
    page('?online&server=game.test')
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(json(429, { error: 'too many' }))))
    expect(await createRoomFromUrl(undefined, 5000, 5)).toBe(false)
    vi.stubGlobal('WebSocket', class {})
    expect(onlineStoreFromUrl()!.session()).toMatchObject({ status: 'closed', errorCode: 'CREATE_BUSY' })
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('failed'))))
    expect(await createRoomFromUrl(undefined, 30, 5)).toBe(false)
    expect(onlineStoreFromUrl()!.session().errorCode).toBe('UNREACHABLE')
  })
})

describe('keep-alive', () => {
  it('an open page pings the server while idle', async () => {
    const sent: string[] = []
    const socket: SocketLike = { readyState: 1, send: (d) => sent.push(d), close: () => {}, addEventListener: () => {} }
    const s = createOnlineStore({ connect: () => socket, roomId: 'r1', keepAliveMs: 20 })
    await new Promise((r) => setTimeout(r, 75))
    s.close()
    const pings = sent.filter((d) => JSON.parse(d).type === 'ping').length
    expect(pings).toBeGreaterThanOrEqual(2)
    const after = sent.length
    await new Promise((r) => setTimeout(r, 50))
    expect(sent.length).toBe(after) // stopped with the store
  })
})
