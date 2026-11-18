// B3 check (docs/BOARD_GEN_PLAN.md §6): the start menu's Board choice in EN and RU, remembered across
// page loads, and a resumed hot-seat game keeps its board. Usage: node scripts/b3-check.mjs (needs `npm run dev`)
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
const D = 'screenshots/milestones/b3'; mkdirSync(D, { recursive: true })
const APP = 'http://localhost:5173/'
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal'] })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const p = await ctx.newPage()
const errors = []
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) })
p.on('pageerror', (e) => errors.push(`pageerror ${e.message}`))
const ok = (cond, msg) => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}`); if (!cond) process.exitCode = 1 }
const open = async (q) => {
  await p.goto(APP + q, { waitUntil: 'load' })
  await p.waitForSelector('[data-start-menu]', { timeout: 20000 }); await p.waitForTimeout(1500)
}
const game = () => p.evaluate(() => { const s = window.__islesStore.getState(); return { preset: s.settings.boardPreset, seed: s.settings.seed, board: JSON.stringify(s.board.tiles) } })
const pressed = () => p.$eval('[data-board][aria-pressed="true"]', (e) => e.dataset.board)

// EN: balanced is the default; pick Classic, start
await open('?lang=en')
ok(await pressed() === 'balanced', 'EN: New balanced is selected by default')
await p.locator('[data-start-menu]').screenshot({ path: `${D}/menu-en.png` })
await p.click('[data-board="standard-fixed"]')
await p.click('[data-menu-new]'); await p.waitForTimeout(800)
ok((await game()).preset === 'standard-fixed', 'EN: Start game with Classic gives a standard-fixed board')

// RU: the choice is remembered; switch back to balanced, start, make a move (so the save is resumable)
await open('?lang=ru')
ok(await pressed() === 'standard-fixed', 'RU: Classic is remembered after a reload')
await p.locator('[data-start-menu]').screenshot({ path: `${D}/menu-ru.png` })
await p.click('[data-board="balanced"]')
await p.click('[data-menu-new]'); await p.waitForTimeout(800)
const before = await game()
ok(before.preset === 'balanced', 'RU: Start game with New balanced gives a balanced board')
const moved = await p.evaluate(() => {
  const st = window.__islesStore, s = st.getState()
  return st.dispatch(s.order[s.active], { type: 'PLACE_SETTLEMENT', vertex: s.board.topo.vertices[0] }).ok
})
ok(moved, 'a setup settlement is placed (the game is saved)')

// resume: the saved balanced game comes back with the same board, even though the page starts on another
await open('?lang=ru')
await p.click('[data-menu-continue]'); await p.waitForTimeout(1500)
const after = await game()
ok(after.preset === 'balanced' && after.seed === before.seed && after.board === before.board, 'resume keeps the board (preset, seed, tiles)')
await p.screenshot({ path: `${D}/resumed-ru.png` })
ok(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`)
await b.close()
