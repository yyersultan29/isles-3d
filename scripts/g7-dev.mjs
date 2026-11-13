// G7.4 check: development cards, buy vs mine. Buying from Build tells the buyer which card it is and
// when it plays; "My development cards" groups the cards (Can play / Bought this turn / Already
// played a card this turn / Not now / Victory points), only "Can play" rows have a Play button, and
// a victory point reads as a point. G7.5: each card's steps, Back keeps the card, Year of Plenty
// counts down, Monopoly names the choice, Road Building counts the free roads. Usage: node scripts/g7-dev.mjs width height outDir
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
const [W, H] = [Number(process.argv[2] ?? 1440), Number(process.argv[3] ?? 900)]
const D = process.argv[4] ?? 'shots/g7-dev'; mkdirSync(D, { recursive: true })
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
const errors = []
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) })
p.on('pageerror', (e) => errors.push('pageerror ' + e.message))
await p.goto('http://localhost:5173/?seed=2024', { waitUntil: 'networkidle' }); await p.waitForSelector('canvas'); await p.waitForTimeout(3000)
const compact = W < 700 || H < 500
const out = { viewport: `${W}x${H}`, compact, errors }

async function position(cond) {
  return p.evaluate(async (condSrc) => {
    const g = await import('/src/game/index.ts')
    const tp = await import('/src/ui/tradePlan.ts')
    const cond = new Function('g', 's', 'p', 'me', 'tp', `return (${condSrc})(g, s, p, me, tp)`)
    const store = window.__islesStore
    const settings = store.getState().settings
    for (let seed = 1; seed < 400; seed++) {
      let r = 0x9e3779b9 ^ seed
      const rand = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 2 ** 32 }
      let s = g.createGame({ ...settings }).state
      const log = []
      for (let step = 0; step < 3000 && s.phase.kind !== 'gameOver'; step++) {
        const who = s.phase.kind === 'discard' ? s.order.find((x) => s.phase.pending[x]) : s.order[s.active]
        const me = s.players.find((x) => x.id === who)
        if (s.phase.kind === 'actions' && cond(g, s, who, me, tp)) {
          store.load({ schemaVersion: 1, engineVersion: g.ENGINE_VERSION, settings: s.settings, actions: log })
          return { seed, step, who, res: me.resources }
        }
        let legal = g.legalActions(s, who).filter((a) => !['PROPOSE_TRADE', 'RESPOND_TRADE', 'CONFIRM_TRADE', 'CANCEL_TRADE', 'BANK_TRADE'].includes(a.type) && !a.type.startsWith('PLAY_'))
        let a
        if (s.phase.kind === 'discard') {
          const hand = { ...me.resources }; const cards = {}
          for (let k = 0; k < s.phase.pending[who]; k++) { const rs = Object.keys(hand).filter((x) => hand[x] > 0); const x = rs[Math.floor(rand() * rs.length)]; hand[x]--; cards[x] = (cards[x] ?? 0) + 1 }
          a = { type: 'DISCARD', cards }
        } else if (s.phase.kind === 'actions') {
          // hoard: mostly end the turn, so hands grow
          const builds = legal.filter((x) => x.type === 'BUILD_SETTLEMENT' || x.type === 'BUILD_CITY' || x.type === 'BUY_DEV')
          a = builds.length && rand() < 0.5 ? builds[Math.floor(rand() * builds.length)] : legal.find((x) => x.type === 'END_TURN')
        } else a = legal[Math.floor(rand() * legal.length)]
        const res = g.apply(s, who, a)
        if (!res.ok) break
        s = res.state; log.push({ player: who, action: a })
      }
    }
    return null
  }, cond.toString())
}

const unpass = async () => { while (await p.$('[aria-labelledby=pass-title]')) { await p.click('[aria-labelledby=pass-title] button'); await p.waitForTimeout(250) } }
let clicks = 0
const begin = async (cond) => { const r = await position(cond); if (!r) return null; await p.waitForTimeout(600); await unpass(); clicks = 0; return r }
const tap = async (sel) => { const el = await p.waitForSelector(sel + ':not([disabled])', { timeout: 4000 }); await el.click(); clicks++; await p.waitForTimeout(150) }
const place = async () => { await p.waitForSelector('[data-board-picker]', { timeout: 4000 }); await p.focus('[data-board-picker]'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(60); await p.keyboard.press('Enter'); clicks++; await p.waitForTimeout(250) }
const shot = (name) => p.screenshot({ path: `${D}/${name}.png` })
const n = () => p.evaluate(() => window.__islesStore.replayFile().actions.length)
const phase = () => p.evaluate(() => window.__islesStore.getState().phase.kind)
const notices = () => p.$$eval('[aria-live] , [role=status]', (els) => els.map((e) => e.textContent.trim()).filter((t) => t && t.length < 160))
const openBuild = async () => { if (compact && !(await p.$('#compact-build'))) await tap('[data-build-toggle]') }
const panelView = () => p.evaluate(() => {
  const d = document.querySelector('[aria-labelledby=dev-title]'); if (!d) return null
  return {
    title: d.querySelector('#dev-title')?.textContent,
    groups: [...d.querySelectorAll('[data-dev-group]')].map((g) => ({ group: g.getAttribute('data-dev-group'), rows: [...g.querySelectorAll('li')].map((li) => ({ text: li.innerText.replace(/\s+/g, ' ').trim(), play: !!li.querySelector('button') })) })),
  }
})
const myCards = 'button[aria-label^="My development cards"]'

// ---- A. buy a card from Build: the notice names it; the panel puts it under "Bought this turn" with no Play
{
  const pos = await begin((g, s, p, me) => g.legalActions(s, p).some((a) => a.type === 'BUY_DEV') && !me.devCards.length)
  if (pos) {
    await openBuild(); await tap('button[aria-label^="Buy Development card"]'); await p.waitForTimeout(350)
    out.buy = { notices: await notices(), buttonLabel: await p.$eval(myCards, (e) => e.getAttribute('aria-label')) }
    await shot('a-after-buy')
    // G7.4 guard: with every row short (the longest reasons) the build rows never cover the main button
    await openBuild()
    out.buy.buildClearsMain = await p.evaluate(() => {
      const m = document.querySelector('[data-primary-action]').getBoundingClientRect()
      const rows = [...document.querySelectorAll('button[aria-label^="Build Road"]')].map((e) => e.closest('section, [aria-label=Build]') ?? e.parentElement).filter(Boolean)
      const box = rows[0]?.getBoundingClientRect(); if (!box) return null
      return box.top >= m.bottom || box.bottom <= m.top || box.right <= m.left || box.left >= m.right
    })
    if (compact) await p.keyboard.press('Escape')
    await tap(myCards); await p.waitForTimeout(200)
    out.buy.panel = await panelView(); await shot('a-panel')
    await p.keyboard.press('Escape'); await p.waitForTimeout(150)
  } else out.buy = 'no position'
}

// ---- B. a playable card and a victory point
{
  const pos = await begin((g, s, p, me) => me.devCards.some((c) => c.type === 'victoryPoint') && g.legalActions(s, p).some((a) => a.type.startsWith('PLAY_')))
  if (pos) { await tap(myCards); await p.waitForTimeout(200); out.vp = await panelView(); await shot('b-play-vp'); await p.keyboard.press('Escape'); await p.waitForTimeout(150) } else out.vp = 'no position'
}

// ---- C. play Monopoly, then the other cards move to "Already played a card this turn"
{
  const pos = await begin((g, s, p, me) => g.legalActions(s, p).some((a) => a.type === 'PLAY_MONOPOLY') && me.devCards.some((c) => c.type !== 'victoryPoint' && c.type !== 'monopoly' && c.boughtOnTurn < s.turn))
  if (pos) {
    await tap(myCards); await tap('button[aria-label="Play Monopoly"]'); await tap('[aria-labelledby=dev-title] button[aria-label^="Monopoly on "]'); await tap('[aria-labelledby=dev-title] button[aria-label="Play Monopoly"]')
    await p.waitForTimeout(250); await tap(myCards); await p.waitForTimeout(200)
    out.played = await panelView(); await shot('c-played')
    await p.keyboard.press('Escape')
  } else out.played = 'no position'
}
// ---- D. (G7.5) Knight's steps: what happens, then Back keeps the card (nothing dispatched)
const banner = () => p.$eval('[role=status]', (e) => e.textContent.trim()).catch(() => null)
const stepsView = () => p.evaluate(() => { const d = document.querySelector('[aria-labelledby=dev-title]'); return d ? { steps: [...d.querySelectorAll('[data-card-steps] li')].map((li) => li.innerText.replace(/\s+/g, ' ').trim()), summary: d.querySelector('[data-card-summary]')?.textContent, note: d.querySelector('[data-card-summary] + p')?.textContent } : null })
{
  const pos = await begin((g, s, p) => g.legalActions(s, p).some((a) => a.type === 'PLAY_KNIGHT'))
  if (pos) {
    const n0 = await n()
    await tap(myCards); await tap('button[aria-label^="Play Knight"]'); await p.waitForTimeout(150)
    out.knight = { steps: await stepsView(), focus: await p.evaluate(() => document.activeElement?.getAttribute('aria-label')) }
    await shot('d-knight-steps')
    await tap('[aria-labelledby=dev-title] button:text-is("Back")')
    out.knight.afterBack = { dispatched: (await n()) - n0, stillPlayable: !!(await p.$('[aria-labelledby=dev-title] button[aria-label="Play Knight"]')) }
    await tap('[aria-labelledby=dev-title] button[aria-label="Play Knight"]'); await tap('[aria-labelledby=dev-title] button[aria-label="Play Knight"]'); await p.waitForTimeout(250)
    out.knight.afterPlay = { phase: await phase(), banner: await banner() }
    await p.keyboard.press('Escape')
  } else out.knight = 'no position'
}

// ---- E. (G7.5) Year of Plenty counts down; Monopoly names the choice before Play
{
  const pos = await begin((g, s, p) => g.legalActions(s, p).some((a) => a.type === 'PLAY_YEAR_OF_PLENTY'))
  if (pos) {
    await tap(myCards); await tap('button[aria-label^="Play Year of Plenty"]')
    const s0 = (await stepsView()).summary
    await tap('[aria-labelledby=dev-title] button[aria-label^="Take one "]'); const s1 = (await stepsView()).summary
    await tap('[aria-labelledby=dev-title] button[aria-label^="Take one "]'); const s2 = (await stepsView()).summary
    out.yop = { summaries: [s0, s1, s2], steps: (await stepsView()).steps, note: (await stepsView()).note }
    await shot('e-yop'); await p.keyboard.press('Escape')
  } else out.yop = 'no position'
  const pos2 = await begin((g, s, p) => g.legalActions(s, p).some((a) => a.type === 'PLAY_MONOPOLY'))
  if (pos2) {
    await tap(myCards); await tap('button[aria-label^="Play Monopoly"]')
    const s0 = (await stepsView()).summary
    await tap('[aria-labelledby=dev-title] button[aria-label="Monopoly on ore"]')
    out.monopoly = { summaries: [s0, (await stepsView()).summary] }
    await shot('e-monopoly'); await p.keyboard.press('Escape')
  } else out.monopoly = 'no position'
}

// ---- F. (G7.5) Road Building: the phase line counts the free roads left
{
  const pos = await begin((g, s, p) => g.legalActions(s, p).some((a) => a.type === 'PLAY_ROAD_BUILDING'))
  if (pos) {
    await tap(myCards); await tap('button[aria-label^="Play Road Building"]'); await tap('[aria-labelledby=dev-title] button[aria-label="Play Road Building"]'); await p.waitForTimeout(250)
    const b0 = await banner(); await shot('f-road-building')
    await place(); const b1 = await banner()
    out.roadBuilding = { banners: [b0, b1], phase: await phase() }
  } else out.roadBuilding = 'no position'
}

writeFileSync(`${D}/g7-dev.json`, JSON.stringify(out, null, 1))
console.log(JSON.stringify(out, null, 1))
await b.close()
