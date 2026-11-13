// G7.8 check: refused trade and card actions say why in visible text and change nothing. Bank:
// wanting a card with nothing to pay, and giving fewer than the rate. Players: an addressee who can't
// accept shows "Needs …" on the row; when everyone declines the step says so, there is no Confirm,
// and Cancel offer leaves the hand as it was. Cards: before the roll, bought this turn.
// Usage: node scripts/g7-refusals.mjs width height outDir   (needs `npm run dev`)
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
const [W, H] = [Number(process.argv[2] ?? 1440), Number(process.argv[3] ?? 900)]
const D = process.argv[4] ?? 'shots/g7-refusals'; mkdirSync(D, { recursive: true })
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
const openTrade = async () => { await tap('button[data-trade-button]'); await p.waitForSelector('[aria-labelledby=trade-title]') }
const visible = () => p.$eval('[aria-labelledby=trade-title]', (e) => e.innerText.replace(/\s+/g, ' '))
const meRes = () => p.evaluate(() => { const s = window.__islesStore.getState(); return { ...s.players.find((x) => x.id === s.order[s.active]).resources } })
const R = {}

// ---- R1. bank: want one ore with nothing to pay (no pile reaches its rate)
{
  const pos = await begin((g, s, p, me) => !g.legalActions(s, p).some((a) => a.type === 'BANK_TRADE') && Object.values(me.resources).some((n) => n > 0) && me.resources.ore === 0)
  if (pos) {
    const n0 = await n(); await openTrade()
    await tap('button[aria-label^="Want one ore"]')
    const main = await p.$eval('[aria-labelledby=trade-title] [data-main-action]', (e) => ({ label: e.getAttribute('aria-label'), disabled: e.disabled }))
    const result = await p.$eval('[data-trade-result]', (e) => e.textContent)
    const reason = (main.label.match(/\((.*)\)$/) || [])[1] ?? null
    R.bankNothingToPay = { main, result, reasonVisible: !!reason && result.includes(reason), payOptions: await p.$$eval('[aria-label="Pay the bank"] button', (e) => e.length), dispatched: (await n()) - n0, pos }
    await shot('r1-bank-nothing'); await p.click('button[aria-label="Close trade"]'); await p.waitForTimeout(200)
  } else R.bankNothingToPay = 'no position'
}

// ---- R2. bank: give one card below its rate, want ore
{
  const pos = await begin((g, s, p, me, tp) => me.resources.lumber >= 1 && me.resources.lumber < 2 && me.resources.ore === 0)
  if (pos) {
    const n0 = await n(); await openTrade()
    await tap('button[aria-label^="Give one wood"]'); await tap('button[aria-label^="Want one ore"]')
    const main = await p.$eval('[aria-labelledby=trade-title] [data-main-action]', (e) => ({ label: e.getAttribute('aria-label'), disabled: e.disabled }))
    const result = await p.$eval('[data-trade-result]', (e) => e.textContent)
    const reason = (main.label.match(/\((.*)\)$/) || [])[1] ?? null
    R.bankBelowRate = { main, result, reasonVisible: !!reason && result.includes(reason), dispatched: (await n()) - n0, pos }
    await shot('r2-bank-below-rate')
    // the same draft in Players mode is a valid offer
    await tap('[data-trade-mode=players]')
    R.bankBelowRate.playersResult = await p.$eval('[data-trade-result]', (e) => e.textContent)
    await p.click('button[aria-label="Close trade"]'); await p.waitForTimeout(200)
  } else R.bankBelowRate = 'no position'
}

// ---- R3. players: someone can't accept (reason on the row), everyone declines, Cancel offer
{
  const pos = await begin((g, s, p, me) => me.resources.wool >= 1 && me.resources.ore === 0 && s.players.some((o) => o.id !== p && o.resources.ore === 0) && s.players.some((o) => o.id !== p && o.resources.ore >= 1))
  if (pos) {
    const res0 = await meRes(); const n0 = await n()
    await openTrade(); await tap('[data-trade-mode=players]')
    await tap('button[aria-label^="Give one wool"]'); await tap('button[aria-label^="Want one ore"]'); await tap('button[aria-label^="Offer trade"]')
    const rows = () => p.$$eval('[aria-labelledby=trade-title] li', (els) => els.map((li) => ({ text: li.innerText.replace(/\s+/g, ' ').trim(), accept: li.querySelector('button[aria-label*=": accept"]')?.getAttribute('aria-label') ?? null, reason: li.querySelector('[data-offer-reason]')?.textContent ?? null })))
    const offered = await rows()
    await shot('r3-offer')
    for (let i = 0; i < 3; i++) { const d = await p.$('button[aria-label$=": decline"]'); if (!d) break; await d.click(); await p.waitForTimeout(150) }
    const declined = { rows: await rows(), step: await p.$eval('[data-offer-step]', (e) => e.textContent).catch(() => null), confirm: await p.$$eval('button[aria-label^="Confirm trade with"]', (e) => e.length) }
    await shot('r3-declined')
    await tap('button[aria-label="Cancel offer"]')
    const after = { res: await meRes(), panelOpen: !!(await p.$('[aria-labelledby=trade-title]')), offerOpen: await p.evaluate(() => !!window.__islesStore.getState().trade) }
    R.offerRefused = { offered, cantAcceptHasVisibleReason: offered.some((r) => r.reason && /^Needs /.test(r.reason) && r.text.includes(r.reason)), declined, after, handUnchanged: JSON.stringify(after.res) === JSON.stringify(res0), actions: (await n()) - n0, pos }
    if (after.panelOpen) { const c = await p.$('button[aria-label="Close trade"]'); if (c) await c.click() }
  } else R.offerRefused = 'no position'
}

// ---- R4. cards: bought this turn has no Play, and says so
{
  const pos = await begin((g, s, p, me) => g.legalActions(s, p).some((a) => a.type === 'BUY_DEV') && !me.devCards.length)
  if (pos) {
    await openBuild(); await tap('button[aria-label^="Buy Development card"]')
    await p.waitForTimeout(300); await tap(myCards)
    R.cardBoughtThisTurn = await panelView(); await shot('r4-bought')
    await p.keyboard.press('Escape'); await p.waitForTimeout(200)
  } else R.cardBoughtThisTurn = 'no position'
}

// hover-only audit of the offer rows (the state G7.0 didn't audit)
R.offerHoverOnly = R.offerRefused?.offered?.filter((r) => r.accept && /\(/.test(r.accept)).map((r) => r.accept) ?? null
out.R = R
writeFileSync(`${D}/g7-refusals.json`, JSON.stringify(out, null, 1))
console.log(JSON.stringify(out, null, 1))
await b.close()
