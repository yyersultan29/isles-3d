// Mountain guy reactions in a real game: a click line, a settlement on his tile's corner (look),
// his number rolled (cheer / sad), the robber arriving (scared) and leaving (relief). Records the
// bubble text after each step, in English and Russian. Usage: node scripts/guy-react.mjs [outDir]
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
const D = process.argv[2] ?? 'shots/guy-react'; mkdirSync(D, { recursive: true })
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const result = {}
for (const lang of ['en', 'ru']) {
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) })
  await p.goto(`http://localhost:5173/?seed=7&lang=${lang}`, { waitUntil: 'networkidle' })
  await p.waitForFunction(() => window.__isles && window.__islesStore); await p.waitForTimeout(2500)
  const bubble = () => p.evaluate(() => document.querySelector('[data-guy-bubble]')?.textContent ?? null)
  const seen = []
  const note = async (step) => { await p.waitForTimeout(120); const t = await bubble(); seen.push([step, t]); return t }
  // click on him (projected proxy centre)
  const at = await p.evaluate(() => { let g; window.__isles.scene.traverse((o) => { if (o.userData.piece === 'mountain-guy') g = o }); const v = g.getWorldPosition(g.position.clone()); v.y += 0.22; v.project(window.__isles.camera); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight] })
  await p.mouse.click(at[0], at[1]); await note('click 1'); await p.mouse.click(at[0], at[1]); await note('click 2')
  await p.screenshot({ path: `${D}/${lang}-click.png`, clip: { x: at[0] - 160, y: at[1] - 140, width: 320, height: 220 } })
  // drive the game through the store, steering a few choices toward his tile
  const step = (prefer) => p.evaluate(async (prefer) => {
    const g = await import('/src/game/index.ts'); const st = window.__islesStore; const s = st.getState()
    const { GUY_SPOT } = await import('/src/scene/mountainGuyLogic.ts'); const tile = GUY_SPOT.tile.axial
    const corners = s.board.topo.tileVertices[tile]
    const who = s.phase.kind === 'discard' ? s.order.find((x) => s.phase.pending[x]) : s.order[s.active]
    const legal = g.legalActions(s, who)
    let a
    if (prefer === 'settle') a = legal.find((x) => x.type === 'PLACE_SETTLEMENT' && corners.includes(x.vertex))
    if (prefer === 'robberHere') a = legal.find((x) => x.type === 'MOVE_ROBBER' && x.tile === tile)
    if (prefer === 'robberAway') a = legal.find((x) => x.type === 'MOVE_ROBBER' && x.tile !== tile)
    if (!a) a = legal.find((x) => x.type === 'ROLL') ?? legal.find((x) => x.type === 'MOVE_ROBBER' && x.tile !== tile && prefer !== 'robberHere') ?? legal.find((x) => x.type === 'MOVE_ROBBER')
      ?? legal.find((x) => x.type === 'END_TURN') ?? legal.find((x) => x.type !== 'DISCARD' && x.type !== 'PROPOSE_TRADE' && !x.type.startsWith('BUILD') && !x.type.startsWith('PLAY') && x.type !== 'BUY_DEV_CARD' && x.type !== 'BANK_TRADE')
    if (!a && legal.some((x) => x.type === 'DISCARD')) {
      const me = s.players.find((x) => x.id === who); const need = s.phase.pending[who]; const cards = {}; let left = need
      for (const r of Object.keys(me.resources)) { const n = Math.min(left, me.resources[r]); if (n) { cards[r] = n; left -= n } }
      a = { type: 'DISCARD', cards }
    }
    const r = st.dispatch(who, a)
    return { a: a?.type, ok: r?.ok ?? null, kind: st.getState().phase.kind, dice: st.getState().dice, token: s.board.tiles[tile].token, robber: st.getState().robber === tile, err: r?.ok === false ? r.error.code : undefined }
  }, prefer)
  let r = await step('settle'); await note('settle on his corner')
  await p.screenshot({ path: `${D}/${lang}-look.png`, clip: { x: at[0] - 160, y: at[1] - 140, width: 320, height: 220 } })
  for (let i = 0; i < 40; i++) { r = await step(); if (r.kind !== 'setup' && r.kind !== 'setupRoad' && !String(r.kind).startsWith('setup')) break }
  let cheered = false, scared = false, relieved = false
  const sums = {}, acts = {}
  for (let i = 0; i < 900 && !(cheered && scared && relieved); i++) {
    const want = !scared ? 'robberHere' : (!relieved ? 'robberAway' : undefined)
    r = await step(want)
    acts[r.a] = (acts[r.a] ?? 0) + 1; if (r.a === 'ROLL' && r.dice) sums[r.dice[0] + r.dice[1]] = (sums[r.dice[0] + r.dice[1]] ?? 0) + 1
    if (r.a === 'ROLL' && r.dice && r.dice[0] + r.dice[1] === r.token && !cheered) { cheered = true; await note(r.robber ? 'his number, robber here' : 'his number'); await p.screenshot({ path: `${D}/${lang}-cheer.png`, clip: { x: at[0] - 160, y: at[1] - 140, width: 320, height: 220 } }); await p.waitForTimeout(2900) }
    if (r.a === 'MOVE_ROBBER' && r.robber && !scared) { scared = true; await note('robber arrives'); await p.screenshot({ path: `${D}/${lang}-scared.png`, clip: { x: at[0] - 160, y: at[1] - 140, width: 320, height: 220 } }); await p.waitForTimeout(2900) }
    else if (r.a === 'MOVE_ROBBER' && scared && !r.robber && !relieved) { relieved = true; await note('robber leaves'); await p.waitForTimeout(2900) }
    if (r.ok === false) { seen.push(['reject', r.err, r.a]); break }
  }
  await p.waitForTimeout(3000); const gone = await bubble()
  result[lang] = { sums, acts, last: r, seen, bubbleGoneAfter3s: gone === null, errors }
}
console.log(JSON.stringify(result, null, 1))
await b.close()
