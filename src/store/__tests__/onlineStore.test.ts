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
