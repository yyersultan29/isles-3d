// Online turn-timer check (G5.5), run with `npx tsx scripts/online-timers.mts [width] [height] [outDir]`.
// Starts its own game server on port 8788 with a clock this script controls (needs `npm run dev`):
// the host picks Fast in the lobby, the phase line counts down, the last 10 s turn red for the
// seat that owes the move, a timeout plays the move, and a closed tab's seat turns "auto" after a
// minute and is played by the server until its player is back.
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { startServer } from '../src/server/server'
const W = Number(process.argv[2] ?? 1440), H = Number(process.argv[3] ?? 900)
const D = process.argv[4] ?? 'shots/online-timers'
mkdirSync(D, { recursive: true })
let t = 1_000_000
const server = await startServer({ port: 8788, tickMs: 100, room: { now: () => t, settings: { boardPreset: 'standard-fixed' } } })
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
const errors: string[] = []
const open = async (url: string) => {
  const p = await ctx.newPage()
  p.on('console', (m) => { if (m.type() === 'error' && !/WebSocket/.test(m.text())) errors.push(m.text().slice(0, 160)) })
  p.on('pageerror', (e) => errors.push('pageerror ' + e.message))
  await p.goto(url, { waitUntil: 'networkidle' }); return p
}
const st = (p: any) => p.evaluate(() => { const s = (window as any).__islesStore; if (!s) return null; const g = s.getState(); const x = s.session(); return { n: g.actionCount, active: g.order[g.active], me: x.me, status: x.status, timer: x.timer, auto: x.seats.filter((y: any) => y.absent).map((y: any) => y.id), banner: document.querySelector('[role=status][aria-live=polite]')?.textContent } })
const until = async (f: () => Promise<boolean>, what: string, ms = 8000) => { const end = Date.now() + ms; while (!(await f())) { if (Date.now() > end) throw new Error('timeout ' + what); await new Promise((r) => setTimeout(r, 50)) } }
const out: Record<string, unknown> = {}

const host = await open('http://localhost:5173/?online&server=127.0.0.1:8788')
await host.waitForSelector('#lobby-title'); await host.waitForTimeout(1200)
const link = await host.inputValue('[aria-label="Invite link"]')
const tabs = [host]; for (let i = 0; i < 3; i++) tabs.push(await open(link))
await host.click('[role=radio]:text-is("Fast")')
await until(async () => (await tabs[2].evaluate(() => (window as any).__islesStore.session().preset)) === 'fast', 'preset reaches guests')
await host.waitForTimeout(300); await host.screenshot({ path: `${D}/lobby-host.png` }); await tabs[2].screenshot({ path: `${D}/lobby-guest.png` })
out.guestSees = await tabs[2].evaluate(() => [...document.querySelectorAll('p')].map((p) => p.textContent).find((x) => x?.startsWith('Turn timer')))
await host.click('button:text-is("Start game")')
await until(async () => (await Promise.all(tabs.map(st))).every((s) => s?.status === 'playing'), 'start')
const seatTab = async (p: string) => { for (const x of tabs) if ((await st(x))?.me === p) return x; throw new Error('no tab') }
let s0 = await st(host)
out.start = { kind: s0.timer?.kind, totalMs: s0.timer?.totalMs, banner: s0.banner }
await (await seatTab(s0.active)).screenshot({ path: `${D}/countdown.png` })

// the last 10 seconds turn red for the seat that owes the move
t += 21_000
const a = await seatTab(s0.active)
// a fresh update carries the server's time left; the next one comes with the timeout itself, so
// read the digits the client computes from the deadline it was given (shifted by the fake clock)
await a.evaluate((ms: number) => { const s = (window as any).__islesStore.session(); if (s.timer) s.timer.deadline -= ms }, 21_000)
await a.waitForTimeout(400)
out.urgent = await a.evaluate(() => { const el = [...document.querySelectorAll('[aria-hidden]')].find((x) => /^· \d:\d\d$/.test(x.textContent ?? '')); return el ? { text: el.textContent, red: el.className.includes('ff9b7a') } : null })
await a.screenshot({ path: `${D}/urgent.png` })

// the timeout plays the placement for that seat
t += 10_000
await until(async () => (await st(host)).n === s0.n + 1, 'timeout move')
out.timeoutMove = { before: s0.n, after: (await st(host)).n, nextTimer: (await st(host)).timer?.kind }

// a closed tab: away at once, "auto" after a minute, then played by the server
const victim = tabs[3]; const vSeat = (await st(victim)).me
await victim.close()
await until(async () => (await host.evaluate((p: string) => (window as any).__islesStore.session().seats.find((x: any) => x.id === p).connected, vSeat)) === false, 'seen away')
t += 61_000
await until(async () => (await st(host)).auto.includes(vSeat), 'auto badge')
await host.waitForTimeout(400); await host.screenshot({ path: `${D}/auto.png` })
out.autoLabel = await host.evaluate(() => [...document.querySelectorAll('li[aria-label]')].map((x) => x.getAttribute('aria-label')).find((l) => l?.includes('automatically')) ?? null)
// keep the others moving by their timers until the absent seat has been played at least once
const before = (await st(host)).n
for (let i = 0; i < 40; i++) {
  const s = await st(host)
  if (s.active === vSeat && s.n > before) break
  t += 31_000; await host.waitForTimeout(250)
}
const n1 = (await st(host)).n
await host.waitForTimeout(800)
out.autoPlayed = { from: before, now: (await st(host)).n, progressed: (await st(host)).n > before && n1 >= before }
// back: the seat is present again
tabs[3] = await open(link)
await until(async () => (await st(tabs[3]))?.status === 'playing', 'back')
await until(async () => !(await st(host)).auto.includes(vSeat), 'auto cleared')
out.back = { seat: (await st(tabs[3])).me, autoNow: (await st(host)).auto }
out.errors = errors
console.log(JSON.stringify(out, null, 1))
await b.close(); await server.close()
