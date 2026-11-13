// Load test for the game server (ROADMAP G5.7). Bots play whole games over real WebSockets, four
// seats and a spectator per room, choosing only from the legal actions the server sends each seat
// (they never see the full state), with a pause before every move like a quick human.
//
//   npx tsx scripts/load-test.mts --local --rooms 40           an in-process server, limits lifted
//   npx tsx scripts/load-test.mts --url https://host --rooms 5 --origin https://page.example
//
// Reports games finished, moves per second, the round trip from sending a move to its update
// (p50/p95/p99/max), rejections and rate-limit notices; with --local also the server's CPU and
// memory. A remote server keeps its per-address limits (32 sockets, 10 rooms a minute), so from one
// machine stay at 6 rooms or fewer.
import { WebSocket } from 'ws'
import { startServer } from '../src/server/server'
import type { LegalAction, PlayerId, PublicGameState, ResourceCounts } from '../src/game'
import type { ServerMessage } from '../src/net/protocol'

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d }
const local = process.argv.includes('--local')
const ROOMS = Number(arg('rooms', '10'))
const THINK = Number(arg('think', '150'))
const MINUTES = Number(arg('minutes', '10'))
const ORIGIN = arg('origin')

let base = arg('url', 'http://127.0.0.1:8787')!
let server: Awaited<ReturnType<typeof startServer>> | null = null
if (local) {
  server = await startServer({ port: 0, limits: { msgBurst: Infinity, msgPerSecond: Infinity, roomBurst: Infinity, roomsPerMinute: Infinity, connectBurst: Infinity, connectsPerMinute: Infinity, socketsPerAddress: Infinity }, room: { settings: { boardPreset: 'standard-fixed' } } })
  base = `http://127.0.0.1:${server.port}`
}
const wsUrl = base.replace(/^http/, 'ws') + '/ws'

const rtts: number[] = []
let moves = 0, rejected = 0, limited = 0, finished = 0, broken = 0
const RES: (keyof ResourceCounts)[] = ['lumber', 'brick', 'wool', 'grain', 'ore']

/** a move from the seat's legal list: build and develop first, trade with the bank sometimes, never propose */
function choose(legal: LegalAction[], view: PublicGameState, me: PlayerId) {
  const by = (t: string) => legal.filter((a) => a.type === t)
  const any = <T,>(l: T[]) => l[Math.floor(Math.random() * l.length)]
  const d = by('DISCARD')[0] as { type: 'DISCARD'; count: number } | undefined
  if (d) {
    const hand = { ...view.players.find((p) => p.id === me)!.resources! }
    const cards: Partial<ResourceCounts> = {}
    for (let k = 0; k < d.count; k++) { const r = RES.filter((x) => hand[x] > 0)[0]; hand[r]--; cards[r] = (cards[r] ?? 0) + 1 }
    return { type: 'DISCARD', cards }
  }
  for (const t of ['ROLL', 'PLACE_SETTLEMENT', 'PLACE_ROAD', 'MOVE_ROBBER', 'STEAL', 'BUILD_CITY', 'BUILD_SETTLEMENT', 'BUY_DEV', 'PLAY_KNIGHT']) { const l = by(t); if (l.length) return any(l) }
  const respond = legal.find((a) => a.type === 'RESPOND_TRADE' && !(a as { accept: boolean }).accept)
  if (respond) return respond
  if (Math.random() < 0.4 && by('BUILD_ROAD').length) return any(by('BUILD_ROAD'))
  if (Math.random() < 0.3 && by('BANK_TRADE').length) return any(by('BANK_TRADE'))
  const rest = legal.filter((a) => a.type !== 'PROPOSE_TRADE' && a.type !== 'CANCEL_TRADE' && a.type !== 'DISCARD')
  return by('END_TURN')[0] ?? any(rest)
}

function seat(roomId: string, claim: boolean): Promise<{ ws: WebSocket; done: Promise<void> }> {
  return new Promise((ready, fail) => {
    const ws = new WebSocket(wsUrl, ORIGIN ? { origin: ORIGIN } : undefined)
    let me: PlayerId | 'spectator' | null = null
    let clientSeq = 0, pending: { at: number; seq: number } | null = null, waiting = false
    let last: Extract<ServerMessage, { type: 'snapshot' | 'update' }> | null = null
    let finish!: () => void
    const done = new Promise<void>((r) => { finish = r })
    ws.on('open', () => ws.send(JSON.stringify({ type: 'join', roomId, claim })))
    ws.on('error', (e) => fail(e))
    ws.on('close', () => finish())
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw)) as ServerMessage
      if (m.type === 'welcome') { me = m.you; ready({ ws, done }) }
      if (m.type === 'rejected') rejected++
      if (m.type === 'error') { if (m.code === 'RATE_LIMITED') limited++; else broken++ }
      if (m.type !== 'snapshot' && m.type !== 'update') return
      last = m
      if (pending && m.seq > pending.seq) { rtts.push(performance.now() - pending.at); pending = null }
      if (m.view.phase.kind === 'gameOver') { if (me === 'p1') finished++; ws.close(); return }
      if (me === 'spectator' || !m.legal.length || waiting) return
      waiting = true
      // act on the newest view when the pause ends (updates may arrive meanwhile)
      setTimeout(() => {
        waiting = false
        const now = last!
        if (ws.readyState !== ws.OPEN || !now.legal.length || now.view.phase.kind === 'gameOver') return
        const action = choose(now.legal, now.view, me as PlayerId)
        pending = { at: performance.now(), seq: now.seq }
        moves++
        ws.send(JSON.stringify({ type: 'action', clientSeq: clientSeq++, action }))
      }, THINK)
    })
  })
}

async function room() {
  const r = await fetch(`${base}/rooms`, { method: 'POST', headers: ORIGIN ? { origin: ORIGIN } : {} })
  if (!r.ok) throw new Error(`POST /rooms: ${r.status}`)
  const { roomId } = await r.json() as { roomId: string }
  const seats: { ws: WebSocket; done: Promise<void> }[] = []
  for (let i = 0; i < 4; i++) seats.push(await seat(roomId, true))
  const watcher = await seat(roomId, false)
  seats[0].ws.send(JSON.stringify({ type: 'start' }))
  await Promise.race([Promise.all(seats.map((s) => s.done)), new Promise((r) => setTimeout(r, MINUTES * 60_000))])
  for (const s of [...seats, watcher]) s.ws.close()
}

const t0 = performance.now()
const cpu0 = process.cpuUsage()
let peakRss = 0
const sampler = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss) }, 500)
await Promise.all(Array.from({ length: ROOMS }, (_, i) => new Promise((r) => setTimeout(r, i * 200)).then(room)))
clearInterval(sampler)
const secs = (performance.now() - t0) / 1000
const cpu = process.cpuUsage(cpu0)
rtts.sort((a, b) => a - b)
const q = (p: number) => Math.round(rtts[Math.min(rtts.length - 1, Math.floor(p * rtts.length))] ?? NaN)
console.log(JSON.stringify({
  target: local ? 'local (in-process, limits lifted)' : base,
  rooms: ROOMS, sockets: ROOMS * 5, thinkMs: THINK, seconds: Math.round(secs),
  gamesFinished: finished, moves, movesPerSecond: Math.round(moves / secs),
  roundTripMs: { p50: q(0.5), p95: q(0.95), p99: q(0.99), max: Math.round(rtts[rtts.length - 1] ?? NaN) },
  rejected, rateLimited: limited, otherErrors: broken,
  ...(local ? { processCpuPercent: Math.round(((cpu.user + cpu.system) / 1000 / (secs * 1000)) * 100), peakRssMB: Math.round(peakRss / 2 ** 20), note: 'CPU and memory include the bots (same process)' } : {}),
}, null, 1))
await server?.close()
process.exit(0)
