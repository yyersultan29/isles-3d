// Online error states and accessibility QA (G5.6b), run with
// `npx tsx scripts/online-a11y.mts [width] [height] [outDir]` (needs `npm run dev`).
// Starts its own game servers (8788 with tight room limits, 8789 with a tight frame limit) and
// checks every "no game" state (refused, full, gone, unreachable, rate limited) for its words, its
// action and where the focus lands; the lobby's keyboard use (focus in the dialog, one tab stop
// for the timer radios, arrows select); and runs axe-core (loaded from cdnjs into the page for the
// check only) on the lobby, each closed state and the game screen.
import { chromium, type Page } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { startServer } from '../src/server/server'
const W = Number(process.argv[2] ?? 1440), H = Number(process.argv[3] ?? 900)
const D = process.argv[4] ?? 'shots/online-a11y'
mkdirSync(D, { recursive: true })
const AXE = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js'
const APP = 'http://localhost:5173/'

const rooms = await startServer({ port: 8788, limits: { roomBurst: 1, roomsPerMinute: 0.001, connsPerRoom: 5 }, room: { settings: { boardPreset: 'standard-fixed' } } })
const frames = await startServer({ port: 8789, limits: { msgBurst: 3, msgPerSecond: 0.01, dropBurst: 50 } })
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
const errors: string[] = []
const open = async (url: string) => {
  const p = await ctx.newPage()
  p.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 160)) })
  p.on('pageerror', (e) => errors.push('pageerror ' + e.message))
  await p.goto(url, { waitUntil: 'networkidle' }); return p
}
const until = async (f: () => Promise<boolean>, what: string, ms = 8000) => { const end = Date.now() + ms; while (!(await f())) { if (Date.now() > end) throw new Error('timeout ' + what); await new Promise((r) => setTimeout(r, 50)) } }

/** axe on the page; violations as "rule (impact): n nodes, first target" */
async function axe(p: Page, include?: string) {
  if (!(await p.evaluate(() => !!(window as any).axe))) await p.addScriptTag({ url: AXE })
  const r = await p.evaluate(async (inc) => {
    const res = await (window as any).axe.run(inc ? { include: [inc] } : document, { resultTypes: ['violations'] })
    return res.violations.map((v: any) => `${v.id} (${v.impact}): ${v.nodes.length}× ${v.nodes[0]?.target?.join(' ')}`)
  }, include ?? null)
  return r as string[]
}
/** what the dialog says and where the focus is */
const dialogState = (p: Page) => p.evaluate(() => {
  const d = document.querySelector('[aria-labelledby=lobby-title]')
  const a = document.activeElement as HTMLElement | null
  return {
    role: d?.getAttribute('role'),
    title: document.getElementById('lobby-title')?.textContent,
    text: document.getElementById('lobby-status')?.textContent,
    focus: a ? `${a.tagName.toLowerCase()}${a.getAttribute('role') ? `[role=${a.getAttribute('role')}]` : ''} "${(a.textContent ?? '').trim().slice(0, 24)}"` : null,
    focusInDialog: !!d && d.contains(a),
    action: (d?.querySelector('a') as HTMLAnchorElement | null)?.getAttribute('href') ?? null,
  }
})
const out: Record<string, unknown> = {}

// ---- the lobby: focus, keyboard, axe
const host = await open(`${APP}?online&server=127.0.0.1:8788`)
await host.waitForSelector('#lobby-title'); await host.waitForTimeout(900)
out.lobby = await dialogState(host)
out.lobbyAxe = await axe(host, '[aria-labelledby=lobby-title]')
const link = await host.inputValue('[aria-label="Invite link"]')
// Tab from the dialog reaches the radios through one stop; arrows select
const stops: string[] = []
for (let i = 0; i < 6; i++) { await host.keyboard.press('Tab'); stops.push(await host.evaluate(() => { const a = document.activeElement as HTMLElement; return `${a.tagName.toLowerCase()}${a.getAttribute('role') ? `[role=${a.getAttribute('role')}]` : ''}:${(a.getAttribute('aria-label') ?? a.textContent ?? '').trim().slice(0, 20)}` })) }
out.tabStops = stops
await host.focus('[role=radio][aria-checked=true]')
await host.keyboard.press('ArrowRight')
await until(async () => (await host.evaluate(() => (window as any).__islesStore.session().preset)) === 'fast', 'arrow selects')
await host.waitForTimeout(150)
out.arrow = await host.evaluate(() => ({ checked: document.querySelector('[role=radio][aria-checked=true]')?.textContent, focused: document.activeElement?.textContent, tabbable: [...document.querySelectorAll('[role=radio]')].filter((x) => (x as HTMLElement).tabIndex === 0).map((x) => x.textContent) }))
await host.screenshot({ path: `${D}/lobby.png` })

// ---- a full room: three players and a spectator fill it (5 connections), the sixth is refused
const tabs = [host]
for (let i = 0; i < 3; i++) tabs.push(await open(link))
const spectator = await open(link)
const full = await open(link)
await full.waitForSelector('#lobby-title:text-is("This room is full")')
out.full = await dialogState(full)
out.fullAxe = await axe(full)
await full.screenshot({ path: `${D}/room-full.png` })
await full.close()

// ---- creating a second room from this address is refused (429)
const busy = await open(`${APP}?online&server=127.0.0.1:8788`)
await busy.waitForSelector('#lobby-title:text-is("Can’t create a room yet")')
out.busy = await dialogState(busy)
out.busyAxe = await axe(busy)
await busy.screenshot({ path: `${D}/create-busy.png` })
await busy.close()

// ---- an old link, and no server at all
const gone = await open(`${APP}?room=oldroom123&server=127.0.0.1:8788`)
await gone.waitForSelector('#lobby-title:text-is("This room is gone")')
out.gone = await dialogState(gone)
out.goneAxe = await axe(gone)
await gone.screenshot({ path: `${D}/room-gone.png` })
await gone.close()
const none = await open(`${APP}?online&server=127.0.0.1:1`)
// G5.7: first the page says it is waking the server up (a free host sleeps), then gives up
await none.waitForSelector('[role=status]:has-text("Waking up the game server")')
out.waking = await none.evaluate(() => document.querySelector('p[role=status]')?.textContent)
await none.screenshot({ path: `${D}/waking.png` })
await none.waitForSelector('#lobby-title:text-is("Can’t reach the game server")', { timeout: 120_000 }) // after the 90 s wake-up wait
out.unreachable = await dialogState(none)
out.unreachableAxe = await axe(none)
await none.screenshot({ path: `${D}/unreachable.png` })
await none.close()

// ---- frames over the limit: the lobby says so for a moment, then the notice clears
const fast = await open(`${APP}?online&server=127.0.0.1:8789`)
await fast.waitForSelector('#lobby-title:text-is("Online room")'); await fast.waitForTimeout(500)
for (const label of ['Fast', 'Relaxed', 'Off', 'Normal']) await fast.click(`[role=radio]:text-is("${label}")`)
await fast.waitForSelector('[role=alert]:has-text("Too many clicks")')
out.rateLimited = await fast.evaluate(() => ({ alert: document.querySelector('[role=alert]')?.textContent, status: (window as any).__islesStore.session().status }))
await fast.screenshot({ path: `${D}/rate-limited.png` })
await until(async () => (await fast.evaluate(() => (window as any).__islesStore.session().errorCode)) === null, 'notice clears', 7000)
out.rateCleared = true
await fast.close()

// ---- the game screen
await host.click('button:text-is("Start game")')
await until(async () => (await Promise.all(tabs.map((t) => t.evaluate(() => (window as any).__islesStore.session().status)))).every((s) => s === 'playing'), 'start')
await host.waitForTimeout(1500)
out.gameAxe = await axe(host)
out.spectatorAxe = await axe(spectator)
await host.screenshot({ path: `${D}/game.png` })

out.errors = errors
console.log(JSON.stringify(out, null, 1))
await b.close(); await rooms.close(); await frames.close()
