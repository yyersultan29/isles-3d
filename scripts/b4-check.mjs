// B4 check (docs/BOARD_GEN_PLAN.md §6): the host picks the board in the online lobby, the others see
// the choice, and after the start every tab draws the same board, the one the server made.
// Usage: node scripts/b4-check.mjs [server]   (needs `npm run dev` and a game server; default localhost:8787)
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
const D = 'screenshots/milestones/b4'; mkdirSync(D, { recursive: true })
const SERVER = process.argv[2] ?? 'localhost:8787'
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal'] })
const ok = (cond, msg) => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}`); if (!cond) process.exitCode = 1 }
const errors = []
// two browsers (separate contexts: own storage, like two people); the host has Classic remembered
const ctxs = await Promise.all([0, 1].map(() => b.newContext({ viewport: { width: 1440, height: 900 } })))
await ctxs[0].addInitScript(() => { try { if (!sessionStorage.b4) { localStorage.setItem('isles3d.board.v1', 'standard-fixed'); sessionStorage.b4 = '1' } } catch {} })
const open = async (ctx, url) => {
  const p = await ctx.newPage()
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) }); p.on('pageerror', (e) => errors.push('pageerror ' + e.message))
  await p.goto(url, { waitUntil: 'load' }); await p.waitForSelector('#lobby-title', { timeout: 20000 }); await p.waitForTimeout(1200)
  return p
}
const lobbyBoard = (p) => p.$eval('[data-lobby-board]', (e) => e.dataset.lobbyBoard)
const host = await open(ctxs[0], `http://localhost:5173/?online&lang=en&server=${SERVER}`)
const link = await host.inputValue('[aria-label="Invite link"]')
const guest = await open(ctxs[1], link + '&lang=ru')
const rest = [await open(ctxs[1], link), await open(ctxs[1], link)]
ok(await lobbyBoard(host) === 'standard-fixed', 'the host room starts on the remembered board (Classic)')
ok(await lobbyBoard(guest) === 'standard-fixed', 'the guest sees Classic')
await host.click('[data-lobby-board] [data-board="balanced"]'); await host.waitForTimeout(600)
ok(await lobbyBoard(guest) === 'balanced', 'the host picks New balanced; the guest sees it')
ok(await guest.$('[data-lobby-board] button') === null, 'the guest has no board buttons')
await host.locator('section:has(#lobby-title)').screenshot({ path: `${D}/lobby-host-en.png` })
await guest.locator('section:has(#lobby-title)').screenshot({ path: `${D}/lobby-guest-ru.png` })
await host.click('button:text-is("Start game")'); await host.waitForTimeout(3000)
const boards = await Promise.all([host, guest, ...rest].map((p) => p.evaluate(() => { const s = window.__islesStore.getState(); return JSON.stringify(s.board.tiles) })))
ok(boards.every((x) => x === boards[0]), 'all four tabs hold the same board')
const preset = await guest.evaluate(() => window.__islesStore.getState().settings.boardPreset)
const classic = await host.evaluate(async () => JSON.stringify((await import('/src/game/index.ts')).createGame({ seed: 1, boardPreset: 'standard-fixed' }).state.board.tiles))
ok(preset === 'balanced' && boards[0] !== classic, `the game is balanced (${preset}), not the classic layout`)
await host.screenshot({ path: `${D}/game-host.png` }); await guest.screenshot({ path: `${D}/game-guest.png` })
ok(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`)
await b.close()
