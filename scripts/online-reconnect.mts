// Online reconnect check (G5.4), run with `npx tsx scripts/online-reconnect.mts [width] [height] [outDir]`.
// Starts its own game server on port 8788 (needs `npm run dev`), opens four tabs and checks: every
// socket dropped mid-game (frozen "Reconnecting…" card, then the same seats and state), a closed tab
// reopened from the link (shown away meanwhile, then its seat back), a reload (seat kept, next move
// applied), and a server restart (every tab says the room is gone).
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { startServer } from '../src/server/server'
const D = process.argv[4] ?? 'shots/online-reconnect'
mkdirSync(D, { recursive: true })
const W = Number(process.argv[2] ?? 1440), H = Number(process.argv[3] ?? 900)
let server = await startServer({ port: 8788, heartbeatMs: 2000, room: { settings: { boardPreset: 'standard-fixed' } } })
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
const errors: string[] = []
const open = async (url: string) => {
  const p = await ctx.newPage()
  p.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|ERR_CONNECTION_REFUSED|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 160)) })
  p.on('pageerror', (e) => errors.push('pageerror ' + e.message))
  await p.goto(url, { waitUntil: 'networkidle' }); return p
}
const sess = (p: any) => p.evaluate(() => { const st = (window as any).__islesStore; if (!st) return { status: "loading", me: null, error: null, away: [] }; const s = st.session(); return { status: s.status, me: s.me, error: s.error, away: s.seats.filter((x: any) => !x.connected).map((x: any) => x.id) } })
const n = (p: any) => p.evaluate(() => (window as any).__islesStore.getState().actionCount)
const until = async (f: () => Promise<boolean>, what: string, ms = 8000) => { const end = Date.now() + ms; while (!(await f())) { if (Date.now() > end) throw new Error('timeout ' + what); await new Promise((r) => setTimeout(r, 50)) } }
const out: Record<string, unknown> = {}

const host = await open('http://localhost:5173/?online&server=127.0.0.1:8788')
await host.waitForSelector('#lobby-title'); await host.waitForTimeout(1500)
const link = await host.inputValue('[aria-label="Invite link"]')
const tabs = [host]; for (let i = 0; i < 3; i++) tabs.push(await open(link))
await host.waitForTimeout(600); await host.click('button:text-is("Start game")')
await until(async () => (await Promise.all(tabs.map(sess))).every((s) => s.status === 'playing'), 'start')
const seatTab = async (p: string) => { for (const t of tabs) if ((await sess(t)).me === p) return t; throw new Error('no tab') }
// a few setup moves through the board picker
const placeOnce = async () => {
  const s = await host.evaluate(() => { const st = (window as any).__islesStore.getState(); return st.order[st.active] })
  const t = await seatTab(s); const before = await n(t)
  await t.focus('[data-board-picker]'); await t.keyboard.press('ArrowRight'); await t.keyboard.press('Enter')
  await until(async () => (await n(host)) > before, 'placed')
}
for (let i = 0; i < 3; i++) await placeOnce()

// 1. every socket dropped: the frozen "Reconnecting…" card, then back where we were
const count0 = await n(host)
for (const ws of server.sockets.values()) ws.terminate()
await until(async () => (await sess(tabs[1])).status === 'reconnecting', 'reconnecting shown', 3000)
await tabs[1].screenshot({ path: `${D}/reconnecting.png` })
out.inertWhileReconnecting = await tabs[1].evaluate(() => document.getElementById('root')!.inert)
await until(async () => (await Promise.all(tabs.map(sess))).every((s) => s.status === 'playing'), 'rejoined')
out.afterDrop = { seats: (await Promise.all(tabs.map(sess))).map((s) => s.me), sameCount: (await n(tabs[2])) === count0 }
await placeOnce(); out.moveAfterDrop = true

// 2. a closed tab shows as away; reopening the link takes the seat back
const closedSeat = (await sess(tabs[3])).me
await tabs[3].close()
await until(async () => (await sess(host)).away.includes(closedSeat), 'away shown')
await host.waitForTimeout(300); await host.screenshot({ path: `${D}/away.png` })
out.awayLabel = await host.evaluate((p: string) => document.querySelector(`ul[aria-label=Players] li[aria-label*="away"]`)?.getAttribute('aria-label') ?? null, closedSeat)
tabs[3] = await open(link)
await until(async () => (await sess(tabs[3])).status === 'playing', 'reopened')
out.reopened = { seat: (await sess(tabs[3])).me, expected: closedSeat, awayAfter: (await sess(host)).away }

// 3. a reload keeps the seat and its next move is applied (numbering continues)
const active = await host.evaluate(() => { const st = (window as any).__islesStore.getState(); return st.order[st.active] })
const at = await seatTab(active)
await at.reload({ waitUntil: 'networkidle' })
await until(async () => (await sess(at)).status === 'playing', 'reloaded')
out.reloadSeat = { seat: (await sess(at)).me, expected: active }
await placeOnce(); out.moveAfterReload = true

// 4. the server restarts: rooms are gone, every tab says so instead of spinning
await server.close()
server = await startServer({ port: 8788 })
await until(async () => (await Promise.all(tabs.map(sess))).every((s) => s.status === 'closed'), 'gone', 10000)
await tabs[0].waitForTimeout(400); await tabs[0].screenshot({ path: `${D}/room-gone.png` })
out.gone = (await sess(tabs[0])).error
out.errors = errors
console.log(JSON.stringify(out, null, 1))
await b.close(); await server.close()
