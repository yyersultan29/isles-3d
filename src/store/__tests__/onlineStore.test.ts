/// <reference types="node" />
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { startServer, type RunningServer } from '../../server/server'
import { createOnlineStore, shadowState, type OnlineStore, type SocketLike } from '../onlineStore'
import { botMove, waiting } from '../../game/__tests__/helpers'
import { createRng, pick } from '../../game/rng'
import { RESOURCE_ORDER, legalActions, viewFor, type Action, type PlayerId } from '../../game'
import { newGame, playSetup } from '../../game/__tests__/helpers'

let server: RunningServer | null = null
const stores: OnlineStore[] = []
afterEach(async () => { stores.splice(0).forEach((s) => s.close()); await server?.close(); server = null })

const until = async (ok: () => boolean, what: string, ms = 3000) => {
  const end = Date.now() + ms
  while (!ok()) { if (Date.now() > end) throw new Error(`timeout: ${what}`); await new Promise((r) => setTimeout(r, 2)) }
}
const key = (a: unknown) => JSON.stringify(a)
const sameLegal = (a: unknown[], b: unknown[]) => expect(a.map(key).sort()).toEqual(b.map(key).sort())

async function setup() {
  server = await startServer({ port: 0, room: { settings: { boardPreset: 'standard-fixed' } } })
  const room = server.createRoom()
  const url = `ws://127.0.0.1:${server.port}/ws`
  const connect = () => new WebSocket(url) as unknown as SocketLike
  const players: OnlineStore[] = []
  for (let i = 0; i < 4; i++) {
    const s = createOnlineStore({ connect, roomId: room.id, claim: true })
    stores.push(s); players.push(s)
    await until(() => s.session().me !== null, 'welcome')
  }
  const spectator = createOnlineStore({ connect, roomId: room.id })
  stores.push(spectator)
  await until(() => spectator.session().me === 'spectator', 'spectator welcome')
  return { room, players, spectator }
}

describe('shadowState', () => {
  it('copies public data, keeps the own hand, and fills hidden parts with the right counts', () => {
    const s = playSetup(newGame(3, { boardPreset: 'standard-fixed' }))
    const sh = shadowState(viewFor(s, 'p2'))
    expect(sh.board).toEqual(s.board)
    expect(sh.buildings).toEqual(s.buildings)
    expect(sh.phase).toEqual(s.phase)
    expect(sh.deck).toHaveLength(s.deck.length)
    expect(sh.rngState).toBe(0)
    for (const p of s.players) {
      const q = sh.players.find((x) => x.id === p.id)!
      const total = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)
      expect(total(q.resources)).toBe(total(p.resources))
      expect(q.devCards).toHaveLength(p.devCards.length)
      if (p.id === 'p2') expect(q.resources).toEqual(p.resources)
    }
    // the shadow agrees with the real state about this seat's legal actions
    sameLegal(legalActions(sh, 'p2'), legalActions(s, 'p2'))
  })
})

describe('online store over a real server', () => {
  it('lobby, start by the host, and refusals that never reach the server', async () => {
    const { players, spectator } = await setup()
    await until(() => players.every((s) => s.session().status === 'lobby' && s.session().seats.every((x) => x.taken)), 'lobby')
    expect(players.map((s) => s.session().me)).toEqual(['p1', 'p2', 'p3', 'p4'])
    expect(players.map((s) => s.session().host)).toEqual([true, false, false, false])
    expect(players.every((s) => /^[0-9a-f]{32}$/.test(s.session().token ?? ''))).toBe(true)
    players[1].start()
    await until(() => !!players[1].session().error, 'NOT_HOST')
    expect(players[1].session().error).toMatch(/^NOT_HOST/)
    players[0].start()
    await until(() => [...players, spectator].every((s) => s.session().status === 'playing'), 'start')
    const g0 = players[0].generation()
    expect(g0).toBeGreaterThan(0)
    // acting for another seat, out of turn, or as a spectator is refused locally
    const refused: string[] = []
    for (const s of [...players, spectator]) s.onRejected((e) => refused.push(e.code))
    const active = players[0].getState().order[players[0].getState().active]
    const idle = players.find((s) => s.session().me !== active)!
    expect(idle.dispatch(idle.session().me as PlayerId, { type: 'END_TURN' }).ok).toBe(false)
    expect(idle.dispatch(active, { type: 'END_TURN' }).ok).toBe(false)
    expect(spectator.dispatch(active, { type: 'END_TURN' }).ok).toBe(false)
    expect(refused).toHaveLength(3)
  })

  it('plays a full game with trades; each seat’s shadow legality equals the server’s after every update', async () => {
    const { room, players, spectator } = await setup()
    const bySeat = new Map(players.map((s) => [s.session().me as PlayerId, s]))
    const all = [...players, spectator]
    const rejected: string[] = []
    const eventCounts = new Map<OnlineStore, number>()
    for (const s of all) {
      s.onRejected((e, _p, a) => rejected.push(`${e.code} ${a.type}`))
      s.onEvents((ev) => eventCounts.set(s, (eventCounts.get(s) ?? 0) + ev.length))
    }
    players[0].start()
    await until(() => all.every((s) => s.session().status === 'playing'), 'start')
    const rng = createRng(4242)
    const synced = () => all.every((s) => s.getState().actionCount === room.game!.actionCount)
    let steps = 0, checks = 0, confirms = 0, proposals = 0

    const act = async (p: PlayerId, a: Action) => {
      const target = room.game!.actionCount + 1
      const r = bySeat.get(p)!.dispatch(p, a)
      expect(r.ok, `${p} ${a.type}: ${!r.ok && r.error.message}`).toBe(true)
      await until(() => room.game!.actionCount >= target && synced(), `sync after ${a.type}`)
      // the heart of G5.3a: legality from the shadow == the server's list, for every seat
      for (const s of players) {
        const me = s.session().me as PlayerId
        sameLegal(legalActions(s.getState(), me), s.session().legal)
        checks++
      }
      expect(spectator.session().legal).toEqual([])
    }

    while (room.game!.phase.kind !== 'gameOver' && steps++ < 20000) {
      const shadowOfActor = (p: PlayerId) => bySeat.get(p)!.getState()
      const s0 = players[0].getState()
      const p = waiting(s0)[0]
      const mine = shadowOfActor(p)
      const legal = legalActions(mine, p)
      // sometimes a player-to-player trade: propose 1-for-1, others answer from their own shadow
      if (mine.phase.kind === 'actions' && !mine.trade && proposals < 120 && rng.next() < 0.15 && legal.some((a) => a.type === 'PROPOSE_TRADE')) {
        const hand = mine.players.find((x) => x.id === p)!.resources
        const give = RESOURCE_ORDER.filter((r) => hand[r] > 0)
        if (give.length) {
          const g = give[pick(rng, give.length)]
          const w = RESOURCE_ORDER.filter((r) => r !== g)[pick(rng, 4)]
          await act(p, { type: 'PROPOSE_TRADE', offer: { [g]: 1 }, request: { [w]: 1 } })
          proposals++
          const t = players[0].getState().trade!
          for (const q of t.to) {
            const answers = legalActions(shadowOfActor(q), q).filter((a) => a.type === 'RESPOND_TRADE') as Action[]
            const accept = answers.find((a) => a.type === 'RESPOND_TRADE' && a.accept)
            await act(q, accept ?? answers[0])
          }
          // the proposer confirms with the first acceptor, judged on its own shadow
          const confirm = legalActions(shadowOfActor(p), p).find((a) => a.type === 'CONFIRM_TRADE') as Action | undefined
          if (confirm) { await act(p, confirm); confirms++ } else await act(p, { type: 'CANCEL_TRADE', tradeId: t.id } as Action)
          continue
        }
      }
      const [who, a] = botMove(mine, rng)
      expect(who).toBe(p)
      await act(who, a)
    }

    expect(room.game!.phase.kind).toBe('gameOver')
    expect(rejected).toEqual([])
    expect(confirms).toBeGreaterThan(5)
    expect(checks).toBeGreaterThan(2000)
    // the final view reveals the seed to everyone; every seat heard the same number of events
    for (const s of all) expect(s.getState().settings.seed).toBe(room.game!.settings.seed)
    expect(new Set(eventCounts.values()).size).toBe(1)
  }, 120000)
})

describe('online store G5.4: reconnect', () => {
  const fast = { baseMs: 10, maxMs: 40 }
  async function started() {
    server = await startServer({ port: 0, room: { settings: { boardPreset: 'standard-fixed' } } })
    const room = server.createRoom()
    const url = `ws://127.0.0.1:${server.port}/ws`
    const connect = () => new WebSocket(url) as unknown as SocketLike
    const players: OnlineStore[] = []
    for (let i = 0; i < 4; i++) {
      const s = createOnlineStore({ connect, roomId: room.id, claim: true, reconnect: fast })
      stores.push(s); players.push(s)
      await until(() => s.session().me !== null, 'welcome')
    }
    players[0].start()
    await until(() => players.every((s) => s.session().status === 'playing'), 'start')
    return { room, players, connect }
  }
  const bySeat = (players: OnlineStore[], p: PlayerId) => players.find((s) => s.session().me === p)!

  it('a dropped socket rejoins its seat by itself and the game goes on', async () => {
    const { room, players } = await started()
    const statuses: string[] = []
    players[1].onSession(() => statuses.push(players[1].session().status))
    const gen = players[1].generation()
    for (const ws of server!.sockets.values()) ws.terminate()
    await until(() => players.every((s) => s.session().status === 'playing') && statuses.includes('reconnecting'), 'rejoin')
    expect(players.map((s) => s.session().me)).toEqual(['p1', 'p2', 'p3', 'p4'])
    expect(players[1].generation()).toBeGreaterThan(gen) // views snap to the rejoin snapshot
    const s = players[0].getState()
    const [p, a] = botMove(s, createRng(1))
    expect(bySeat(players, p).dispatch(p, a).ok).toBe(true)
    await until(() => players.every((x) => x.getState().actionCount === room.game!.actionCount) && room.game!.actionCount === 1, 'action after rejoin')
  })

  it('a reloaded tab (a new store with the saved token) continues numbering and its moves are applied', async () => {
    const { room, players, connect } = await started()
    const rng = createRng(3)
    for (let i = 0; i < 10; i++) {
      const [p, a] = botMove(room.game!, rng)
      const n = room.game!.actionCount
      bySeat(players, p).dispatch(p, a)
      await until(() => room.game!.actionCount === n + 1 && players.every((x) => x.getState().actionCount === n + 1), 'step')
    }
    const p = room.game!.order[room.game!.active]
    const old = bySeat(players, p)
    const token = old.session().token!
    old.close()
    const fresh = createOnlineStore({ connect, roomId: room.id, token, reconnect: fast })
    stores.push(fresh)
    await until(() => fresh.session().status === 'playing', 'reloaded rejoin')
    expect(fresh.session().me).toBe(p)
    const [q, a] = botMove(fresh.getState(), rng)
    expect(q).toBe(p)
    const n = room.game!.actionCount
    expect(fresh.dispatch(q, a).ok).toBe(true)
    await until(() => room.game!.actionCount === n + 1, 'reloaded move applied')
  })

  it('opening the seat elsewhere closes this one for good (no tug of war)', async () => {
    const { room, players, connect } = await started()
    const twin = createOnlineStore({ connect, roomId: room.id, token: players[2].session().token!, reconnect: fast })
    stores.push(twin)
    await until(() => twin.session().status === 'playing' && players[2].session().status === 'closed', 'replaced')
    expect(players[2].session().error).toMatch(/^REPLACED/)
    await new Promise((r) => setTimeout(r, 200))
    expect(players[2].session().status).toBe('closed')
    expect(twin.session().status).toBe('playing')
  })

  it('a room the server no longer has (restart) stops the retries and says so', async () => {
    const { players, connect } = await started()
    void connect
    const port = server!.port
    await server!.close()
    server = await startServer({ port })
    await until(() => players.every((s) => s.session().status === 'closed'), 'gone')
    expect(players[0].session().error).toMatch(/^NO_ROOM/)
    const n = server.sockets.size
    await new Promise((r) => setTimeout(r, 200))
    expect(server.sockets.size).toBe(n) // nobody keeps knocking
    expect(n).toBe(0)
  })

  it('a page opened before the server is up joins once it answers', async () => {
    const probe = await startServer({ port: 0 })
    const port = probe.port
    await probe.close()
    const s = createOnlineStore({ connect: () => new WebSocket(`ws://127.0.0.1:${port}/ws`) as unknown as SocketLike, roomId: 'later', claim: true, reconnect: fast })
    stores.push(s)
    await until(() => s.session().status === 'closed', 'unreachable')
    server = await startServer({ port })
    const r = server.createRoom()
    // the room id is fixed by the page; rename the room for the test
    server.rooms.delete(r.id)
    const { Room } = await import('../../server/room')
    server.rooms.set('later', new Room({ id: 'later' }))
    await until(() => s.session().status === 'lobby' && s.session().me === 'p1', 'joined after start-up', 5000)
  })

  it('a full game with sockets dropping at random (also right after a move) still ends with every seat in sync', async () => {
    const { room, players } = await started()
    const rng = createRng(2026)
    const rejected: string[] = []
    for (const s of players) s.onRejected((e, _p, a) => rejected.push(`${e.code} ${a.type}`))
    const sockets = () => [...server!.sockets.values()]
    let drops = 0, lostMoves = 0, steps = 0, rejoins = 0
    for (const s of players) {
      let last = s.session().status
      s.onSession(() => { const now = s.session().status; if (now === 'reconnecting' && last !== 'reconnecting') rejoins++; last = now })
    }
    const synced = () => players.every((s) => s.session().status === 'playing' && s.getState().actionCount === room.game!.actionCount)
    while (room.game!.phase.kind !== 'gameOver' && steps++ < 20000) {
      const shadow0 = players[0].getState()
      const p = waiting(shadow0)[0]
      const actor = bySeat(players, p)
      const [, a] = botMove(actor.getState(), rng)
      const n = room.game!.actionCount
      expect(actor.dispatch(p, a).ok).toBe(true)
      const r = rng.next()
      if (r < 0.05) {
        // drop a random socket while the move may still be in flight
        const r0 = rejoins
        sockets()[pick(rng, sockets().length)]?.terminate(); drops++
        // wait for the client to notice the drop, then for everyone to be back and in sync
        await until(() => rejoins > r0, 'drop noticed', 5000)
        await until(synced, 'resync after drop', 5000)
        if (room.game!.actionCount === n) lostMoves++
      } else {
        await until(() => room.game!.actionCount === n + 1 && synced(), 'step')
      }
      for (const s of players) sameLegal(legalActions(s.getState(), s.session().me as PlayerId), s.session().legal)
    }
    expect(room.game!.phase.kind).toBe('gameOver')
    expect(drops).toBeGreaterThan(8)
    expect(rejected).toEqual([])
    expect(rejoins).toBe(drops)
  }, 180000)
})
