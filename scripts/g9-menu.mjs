// G9.3 start menu check (ROADMAP G9.3): the first screen of a plain URL, names, clicks to the first
// placement, Continue after a reload, the Menu button over a live game (Continue, Escape, New game),
// the online path, axe and on-screen fit. Usage: node scripts/g9-menu.mjs [width] [height] [outDir]
// (needs `npm run dev`; the online server is not needed: only the move to ?online is checked)
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
const [W, H] = [Number(process.argv[2] ?? 1440), Number(process.argv[3] ?? 900)]
const D = process.argv[4] ?? 'shots/g9-menu'; mkdirSync(D, { recursive: true })
const AXE = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js'
const APP = 'http://localhost:5173/'
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
const p = await ctx.newPage()
const errors = []
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) })
p.on('pageerror', (e) => errors.push('pageerror ' + e.message))
const out = { viewport: `${W}x${H}`, errors }
const menu = '[data-start-menu]'

const axe = async () => {
  await p.addScriptTag({ url: AXE })
  return p.evaluate(async () => (await window.axe.run(document.querySelector('[data-start-menu]'), { resultTypes: ['violations'] })).violations.map((v) => `${v.id}: ${v.nodes.length}`))
}
const fits = () => p.evaluate(() => {
  const r = document.querySelector('[data-start-menu]').getBoundingClientRect()
  const s = document.scrollingElement
  return r.left >= 0 && r.right <= innerWidth && r.width > 0 && s.scrollWidth <= innerWidth
})
const unpass = async () => { for (let i = 0; i < 6; i++) { const x = await p.$('[aria-labelledby=pass-title] button'); if (!x) break; await x.click(); await p.waitForTimeout(300) } }

// 1. a plain URL opens the menu; Start game has focus
await p.goto(APP, { waitUntil: 'networkidle' }); await p.waitForSelector(menu); await p.waitForTimeout(1500)
out.firstScreen = {
  focused: await p.evaluate(() => document.activeElement?.getAttribute('data-menu-new') !== null && document.activeElement?.hasAttribute('data-menu-new')),
  continueShown: !!(await p.$('[data-menu-continue]')),
  axe: await axe(), fits: await fits(),
}
await p.screenshot({ path: `${D}/1-first.png` })

// 2. names, then Start: clicks counted to the first placement (typing is not a click)
let clicks = 0
await p.fill('[data-name-input=p1]', 'Аня'); await p.fill('[data-name-input=p2]', 'Bob')
await p.click('[data-menu-new]'); clicks++
await p.waitForSelector(menu, { state: 'detached' }); await p.waitForTimeout(800); await unpass()
const seatNames = await p.$$eval('[aria-label=Players] li', (ls) => ls.map((l) => l.getAttribute('aria-label').split(':')[0]))
await p.focus('[data-board-picker]'); await p.keyboard.press('ArrowRight'); await p.keyboard.press('Enter'); clicks++
await p.waitForTimeout(500)
const placed = await p.evaluate(() => Object.keys(window.__islesStore.getState().buildings).length)
out.newGame = { seatNames, clicksToFirstPlacement: clicks, placed }
await p.screenshot({ path: `${D}/2-started.png` })

// 3. play on (scripted), reload: the menu offers the saved game; Continue restores it with the names
const turnBefore = await p.evaluate(async () => {
  const g = await import('/src/game/index.ts'); const store = window.__islesStore
  let r = 7; const rand = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 2 ** 32 }
  for (let i = 0; i < 120; i++) {
    const s = store.getState(); const who = s.phase.kind === 'discard' ? s.order.find((x) => s.phase.pending[x]) : s.order[s.active]
    let legal = g.legalActions(s, who).filter((a) => !['PROPOSE_TRADE', 'RESPOND_TRADE', 'CONFIRM_TRADE', 'CANCEL_TRADE'].includes(a.type) && !a.type.startsWith('PLAY_'))
    let a
    if (s.phase.kind === 'discard') { const me = s.players.find((x) => x.id === who); const hand = { ...me.resources }; const cards = {}; for (let k = 0; k < s.phase.pending[who]; k++) { const rs = Object.keys(hand).filter((x) => hand[x] > 0); const x = rs[Math.floor(rand() * rs.length)]; hand[x]--; cards[x] = (cards[x] ?? 0) + 1 } a = { type: 'DISCARD', cards } }
    else if (s.phase.kind === 'actions') a = legal.find((x) => x.type === 'END_TURN')
    else a = legal[Math.floor(rand() * legal.length)]
    if (!store.dispatch(who, a).ok) break
  }
  return store.getState().turn
})
await p.reload({ waitUntil: 'networkidle' }); await p.waitForSelector(menu); await p.waitForTimeout(1200)
out.reload = { continueFocused: await p.evaluate(() => document.activeElement?.hasAttribute('data-menu-continue')), axe: await axe(), fits: await fits() }
await p.screenshot({ path: `${D}/3-saved.png` })
await p.click('[data-menu-continue]'); await p.waitForSelector(menu, { state: 'detached' }); await p.waitForTimeout(600); await unpass()
out.reload.turnBefore = turnBefore
out.reload.turnAfter = await p.evaluate(() => window.__islesStore.getState().turn)
out.reload.names = await p.$$eval('[aria-label=Players] li', (ls) => ls.map((l) => l.getAttribute('aria-label').split(':')[0]))

// 4. the Menu button over a live game: Continue and Escape close it, the game is untouched; New game starts over
const menuBtn = await p.$('[data-menu-button]')
out.menuButton = { visible: !!menuBtn && await menuBtn.isVisible() }
await menuBtn.click(); await p.waitForSelector(menu); await p.waitForTimeout(300)
out.menuButton.liveTitle = await p.$eval(menu, (m) => m.textContent.includes('The current game'))
await p.screenshot({ path: `${D}/4-menu-live.png` })
await p.click('[data-menu-continue]'); await p.waitForTimeout(300)
out.menuButton.continueCloses = !(await p.$(menu))
await menuBtn.click(); await p.waitForSelector(menu); await p.keyboard.press('Escape'); await p.waitForTimeout(300)
out.menuButton.escapeCloses = !(await p.$(menu))
out.menuButton.turnKept = (await p.evaluate(() => window.__islesStore.getState().turn)) === out.reload.turnAfter
await menuBtn.click(); await p.waitForSelector(menu); await p.click('[data-menu-new]'); await p.waitForTimeout(800)
out.menuButton.newGameTurn = await p.evaluate(() => window.__islesStore.getState().turn)
out.menuButton.newGamePhase = await p.evaluate(() => window.__islesStore.getState().phase.kind)

// 5. online: Create room moves to ?online (the existing flow takes it from there)
await p.click('[data-menu-button]'); await p.waitForSelector(menu)
await Promise.all([p.waitForURL(/\?online/, { timeout: 8000 }).catch(() => {}), p.click('[data-menu-online]')])
out.online = { url: new URL(p.url()).search }

// 6. any URL option skips the menu
await p.goto(APP + '?menu=0', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500)
out.optionSkips = !(await p.$(menu))

writeFileSync(`${D}/g9-menu.json`, JSON.stringify(out, null, 1))
console.log(JSON.stringify(out, null, 1))
await b.close()
