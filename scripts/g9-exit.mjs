// G9.7 exit check (docs/G9_PLAN.md §1.3): in both languages, walks the audited states (start menu,
// setup, play, trade, dev cards, help, full log, discard, victory, online lobby) and reports, per
// state, English words left in visible Russian text, text overflow and axe; also the log after a
// reload (Continue) and clicks from the menu to an invite link.
// Usage: node scripts/g9-exit.mjs <width> <height> <outDir> (needs npm run dev and npm run server)
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
const [W, H, O] = [Number(process.argv[2] ?? 1440), Number(process.argv[3] ?? 900), process.argv[4] ?? 'shots/g9-exit']
mkdirSync(O, { recursive: true })
const AXE = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js'
const APP = 'http://localhost:5173/'
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const tag = `${W}x${H}`
const out = { viewport: tag }

// visible text nodes only (sr-only and hidden elements are skipped); brand and key names are allowed
const ALLOW = /^(Isles|3D|EN|RU|Enter|Esc|Shift|Tab|Space|WebGL|Chrome|Edge|Firefox|Safari|npm|run|server)$/
const scan = (p) => p.evaluate((allow) => {
  const re = new RegExp(allow)
  const words = new Set(); const overflow = []
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const el = n.parentElement; if (!el || !n.textContent.trim()) continue
    if (el.closest('.sr-only, script, style, [aria-hidden=true] svg, code')) continue
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || !el.getClientRects().length) continue
    let hidden = false; for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.opacity === '0') { hidden = true; break } }
    if (hidden) continue
    for (const m of n.textContent.match(/[A-Za-z]{2,}/g) ?? []) if (!re.test(m)) words.add(`${m} ← "${n.textContent.trim().slice(0, 50)}"`)
  }
  for (const e of document.querySelectorAll('button, h2, h3, p, li, label')) {
    if (e.getBoundingClientRect().width && e.scrollWidth > e.clientWidth + 1 && !e.classList.contains('truncate') && !e.classList.contains('overflow-hidden') && !e.closest('.sr-only') && e.textContent.trim().length > 2) overflow.push(e.textContent.trim().slice(0, 40))
  }
  // shortened with an ellipsis on purpose: listed for review, not counted as overflow
  const cut = [...document.querySelectorAll('.truncate')].filter((e) => e.getClientRects().length && !e.closest('.sr-only') && e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent.trim().slice(0, 60))
  return { latin: [...words].slice(0, 20), overflow: overflow.slice(0, 8), cut: [...new Set(cut)].slice(0, 8) }
}, ALLOW.source)
const axe = async (p) => { await p.addScriptTag({ url: AXE }); return p.evaluate(async () => (await window.axe.run(document.body, { resultTypes: ['violations'] })).violations.map((v) => `${v.id}: ${v.nodes.length} ${v.nodes.slice(0, 2).map((n) => n.html.slice(0, 120) + ' ' + (n.any[0]?.message ?? '').slice(0, 110)).join(' | ')}`)) }
const unpass = async (p) => { for (let i = 0; i < 6; i++) { const x = await p.$('[aria-labelledby=pass-title] button'); if (!x) break; await x.click(); await p.waitForTimeout(300) } }

// scripted play: `until` is checked before each action (runs in the page)
const play = (p, until, seed = 5) => p.evaluate(async ({ until, seed }) => {
  const g = await import('/src/game/index.ts'); const store = window.__islesStore
  const stop = new Function('s', `return (${until})`)
  let r = seed; const rand = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 2 ** 32 }
  const prefer = ['BUILD_CITY', 'BUILD_SETTLEMENT', 'PLAY_KNIGHT', 'BUILD_ROAD', 'BUY_DEV']
  for (let i = 0; i < 6000; i++) {
    const s = store.getState(); if (stop(s) || s.phase.kind === 'gameOver') break
    const who = s.phase.kind === 'discard' ? s.order.find((x) => s.phase.pending[x]) : s.order[s.active]
    const legal = g.legalActions(s, who).filter((a) => !['PROPOSE_TRADE', 'RESPOND_TRADE', 'CONFIRM_TRADE', 'CANCEL_TRADE'].includes(a.type))
    let a
    if (s.phase.kind === 'discard') { const me = s.players.find((x) => x.id === who); const hand = { ...me.resources }; const cards = {}; for (let k = 0; k < s.phase.pending[who]; k++) { const rs = Object.keys(hand).filter((x) => hand[x] > 0); const x = rs[Math.floor(rand() * rs.length)]; hand[x]--; cards[x] = (cards[x] ?? 0) + 1 } a = { type: 'DISCARD', cards } }
    else if (s.phase.kind === 'actions') {
      for (const t of prefer) { const c = legal.filter((x) => x.type === t); if (c.length) { a = c[Math.floor(rand() * c.length)]; break } }
      a ??= legal.find((x) => x.type === 'BANK_TRADE' && rand() < 0.6) ?? legal.find((x) => x.type === 'END_TURN')
    } else a = legal[Math.floor(rand() * legal.length)]
    if (!a || !store.dispatch(who, a).ok) break
  }
  const s = store.getState(); return { turn: s.turn, phase: s.phase.kind }
}, { until, seed })

for (const lang of ['en', 'ru']) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
  const p = await ctx.newPage(); const errors = []
  p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('WebSocket')) errors.push(m.text().slice(0, 140)) })
  const res = { errors, states: {} }
  const state = async (name) => { await p.waitForTimeout(400); res.states[name] = { ...(await scan(p)), axe: await axe(p) }; await p.screenshot({ path: `${O}/${lang}-${tag}-${name}.png` }) }

  await p.goto(APP); await p.evaluate((l) => { localStorage.clear(); localStorage.setItem('isles3d.lang', l) }, lang)
  await p.goto(APP, { waitUntil: 'networkidle' }); await p.waitForSelector('[data-start-menu]'); await p.waitForTimeout(1200)
  await state('menu')
  await p.click('[data-menu-new]'); await p.waitForTimeout(800); await unpass(p)
  await state('setup')
  res.toActions = await play(p, "s.phase.kind === 'actions' && s.turn >= 10 && Object.values(s.players.find((x) => x.id === s.order[s.active]).resources).reduce((a, b) => a + b, 0) >= 3")
  await p.waitForTimeout(600); await unpass(p)
  await state('play')
  const tb = await p.$('[data-trade-button]:not([disabled])'); if (tb && await tb.isVisible()) { await tb.click(); await state('trade'); await p.keyboard.press('Escape') }
  const db = await p.$('[data-dev-button]:not([disabled])'); if (db && await db.isVisible()) { await db.click(); await state('dev'); await p.keyboard.press('Escape') }
  await p.click('[aria-controls=help-panel]'); await state('help'); await p.click('[aria-controls=help-panel]')
  const lt = await p.$('[data-log-toggle]'); if (lt && await lt.isVisible()) { await lt.click(); await state('log'); await lt.click() }
  // the log after a reload: Continue restores the game and rebuilds its history
  const readLog = async () => {
    let xs = await p.$$eval('[role=log] li', (ls) => ls.map((x) => x.textContent))
    if (!xs.length) { await p.click('[data-log-toggle]'); await p.waitForTimeout(300); xs = await p.$$eval('[role=log] li', (ls) => ls.slice(-5).map((x) => x.textContent)); await p.keyboard.press('Escape'); await p.waitForTimeout(200) }
    return xs
  }
  const logBefore = await readLog()
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForSelector('[data-start-menu]'); await p.waitForTimeout(800)
  await p.click('[data-menu-continue]'); await p.waitForTimeout(800); await unpass(p)
  const logAfter = await readLog()
  res.logAfterReload = { lines: logBefore.length, same: logBefore.length > 1 && JSON.stringify(logBefore) === JSON.stringify(logAfter) }
  // a discard: play on until a human must discard
  const d = await play(p, "s.phase.kind === 'discard'", 9)
  if (d.phase === 'discard') { await p.waitForTimeout(600); await unpass(p); await state('discard') }
  res.discardReached = d.phase === 'discard'
  // victory
  const v = await play(p, 'false', 13)
  res.victoryReached = v.phase === 'gameOver'
  if (v.phase === 'gameOver') { await p.waitForTimeout(1200); await unpass(p); await state('victory') }
  // online: from the menu, clicks to a copyable invite link
  await p.goto(APP, { waitUntil: 'networkidle' }); await p.waitForSelector('[data-start-menu]')
  let clicks = 0
  await p.click('[data-menu-online]'); clicks++
  const link = await p.waitForSelector('[aria-labelledby=lobby-title] input[readonly]', { timeout: 15000 }).catch(() => null)
  res.online = { clicksToLink: clicks, link: link ? await link.inputValue() : null }
  if (link) await state('lobby')
  out[lang] = res
  await ctx.close()
}
writeFileSync(`${O}/g9-exit-${tag}.json`, JSON.stringify(out, null, 1))
console.log(JSON.stringify(out, null, 1))
await b.close()
