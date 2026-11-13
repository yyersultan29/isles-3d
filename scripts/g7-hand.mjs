// G7.2 check: the hand shows what changed. "+N" / "−N" badges on the changed cards after a roll, a
// bank trade and a build (gone after ~2.5 s), none after loading a game or behind the pass screen;
// "no resources this roll" on an own roll that pays nothing; the hand-trade hint once per device.
// Usage: node scripts/g7-hand.mjs width height outDir
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
const [W, H] = [Number(process.argv[2] ?? 1440), Number(process.argv[3] ?? 900)]
const D = process.argv[4] ?? 'shots/g7-hand'; mkdirSync(D, { recursive: true })
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
const deltas = () => p.$$eval('[data-hand-delta]', (els) => els.map((e) => e.textContent.trim()))
const hint = () => p.$eval('[data-hand-hint]', (e) => e.textContent.trim()).catch(() => null)
const handOf = () => p.evaluate(() => { const s = window.__islesStore.getState(); return { ...s.players.find((x) => x.id === s.order[s.active]).resources } })
const NAME = { lumber: 'wood', brick: 'brick', wool: 'wool', grain: 'grain', ore: 'ore' }
const expectBadges = (before, after) => Object.keys(after).filter((r) => after[r] !== before[r]).map((r) => (after[r] > before[r] ? '+' : '−') + Math.abs(after[r] - before[r])).sort()

// ---- A. the hint: on a fresh device, at the first own turn that can trade; a card click ends it; once per device
{
  await begin((g, s, p, me) => s.turn > 8 && g.RESOURCE_ORDER.some((r) => me.resources[r] > 0))
  out.afterLoad = { deltas: await deltas() } // a loaded game is never a "gain"
  out.hint = { first: await hint() }
  await shot('a-hint')
  await p.click('button[data-hand-card]:not([disabled])'); await p.waitForTimeout(200)
  out.hint.afterCardClick = await hint()
  await p.keyboard.press('Escape'); await p.waitForTimeout(150)
  await p.evaluate(() => window.__islesStore.dispatch(window.__islesStore.getState().order[window.__islesStore.getState().active], { type: 'END_TURN' }))
  await p.waitForTimeout(400)
  out.privacy = { passScreen: !!(await p.$('[aria-labelledby=pass-title]')), deltasBehindPass: await deltas(), hintBehindPass: await hint() }
  await unpass(); await p.waitForTimeout(200)
  out.privacy.deltasAfterHandOver = await deltas()
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForSelector('canvas'); await p.waitForTimeout(2500)
  if (await p.$('[aria-labelledby=resume-title]')) { await p.click('[aria-labelledby=resume-title] button:has-text("New game")'); await p.waitForTimeout(500) }
  await begin((g, s, p, me) => s.turn > 8 && g.RESOURCE_ORDER.some((r) => me.resources[r] > 0))
  out.hint.afterReload = await hint()
}

// ---- B. rolls: one that pays the roller, one that pays nothing (not a seven)
async function rollPosition(pays) {
  await begin((g, s) => s.turn > 12)
  const k = await p.evaluate(async (pays) => {
    const g = await import('/src/game/index.ts')
    const st = window.__islesStore; const f = st.replayFile()
    for (let k = f.actions.length; k > 0; k--) {
      const r = g.replay({ ...f, actions: f.actions.slice(0, k) })
      if (!r.ok || r.state.phase.kind !== 'preRoll') continue
      const pl = r.state.order[r.state.active]
      const t = g.apply(r.state, pl, { type: 'ROLL' })
      if (!t.ok || t.state.phase.kind !== 'actions') continue
      const got = g.RESOURCE_ORDER.some((x) => t.state.players.find((y) => y.id === pl).resources[x] > r.state.players.find((y) => y.id === pl).resources[x])
      const others = r.state.order.some((o) => o !== pl && g.RESOURCE_ORDER.some((x) => t.state.players.find((y) => y.id === o).resources[x] > r.state.players.find((y) => y.id === o).resources[x]))
      if (got === pays && (pays || others)) { st.load({ ...f, actions: f.actions.slice(0, k) }); return k }
    }
    return null
  }, pays)
  await p.waitForTimeout(500); await unpass()
  return k
}
for (const pays of [true, false]) {
  const key = pays ? 'rollPays' : 'rollNothing'
  if (!(await rollPosition(pays))) { out[key] = 'no position'; continue }
  const before = await handOf()
  await p.click('[data-primary-action]'); await p.waitForTimeout(450)
  const after = await handOf()
  out[key] = { expected: expectBadges(before, after), badges: (await deltas()).sort(), notices: await notices() }
  await shot(`b-${key}`)
  await p.waitForTimeout(2600); out[key].badgesAfter3s = await deltas()
}

// ---- C. a 4:1 bank trade through the panel
{
  const cond = (g, s, p, me) => g.RESOURCE_ORDER.some((r) => g.tradeRate(s, p, r) === 4 && me.resources[r] >= 4) && g.RESOURCE_ORDER.some((r) => me.resources[r] === 0 && s.bank[r] > 0)
  const pos = await begin(cond)
  if (pos) {
    const want = Object.entries(pos.res).find(([, v]) => v === 0)[0]
    const before = await handOf()
    await p.click('button[data-trade-button]'); await p.waitForTimeout(200)
    await p.click(`button[aria-label^="Want one ${NAME[want]}"]`); await p.waitForTimeout(200)
    await p.click('[aria-label="Pay the bank"] button'); await p.waitForTimeout(400)
    const after = await handOf()
    out.bank = { expected: expectBadges(before, after), badges: (await deltas()).sort() }
    await shot('c-bank')
  } else out.bank = 'no position'
}

// ---- D. build a road
{
  const pos = await begin((g, s, p) => g.legalActions(s, p).some((a) => a.type === 'BUILD_ROAD'))
  if (pos) {
    const before = await handOf()
    await openBuild(); await p.click('button[aria-label^="Build Road"]'); await p.waitForTimeout(200); await place()
    await p.keyboard.press('Escape'); await p.waitForTimeout(150)
    const after = await handOf()
    out.road = { expected: expectBadges(before, after), badges: (await deltas()).sort() }
    await shot('d-road')
  } else out.road = 'no position'
}

// ---- E. empty piles: the count and the name are on top of the dimming
out.zeroPiles = await p.evaluate(() => [...document.querySelectorAll('[aria-label$="resources"] > li')].map((li) => li.innerText.replace(/\s+/g, ' ').trim()))
await shot('e-hand')
writeFileSync(`${D}/g7-hand.json`, JSON.stringify(out, null, 1))
console.log(JSON.stringify(out, null, 1))
await b.close()
