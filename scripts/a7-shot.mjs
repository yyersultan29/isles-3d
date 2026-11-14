// A7 check (ASSET_DESIGN A7): number tokens, dice and build-menu icons on the fixed A0 position.
// Shots: the whole board at the V7 sizes and DPR 1–3, a close-up of three tokens (a red 6/8, a two-digit
// number, a single digit), the dice and the build panel as element crops; axe on the build panel.
// Usage: node scripts/a7-shot.mjs replay.json outDir   (needs `npm run dev`)
import { chromium } from 'playwright-core'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
const [REPLAY, D = 'shots/a7'] = process.argv.slice(2)
mkdirSync(D, { recursive: true })
const replay = JSON.parse(readFileSync(REPLAY, 'utf8'))
const AXE = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js'
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const out = { errors: [] }
const SIZES = [[1440, 900, 2], [1920, 1080, 1], [1366, 768, 1], [2560, 1440, 1], [390, 844, 3], [844, 390, 3]]
for (const [W, H, DPR] of SIZES) {
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR })
  await p.routeWebSocket(/\/\/localhost:5173\//, () => {})
  p.on('console', (m) => { if (m.type() === 'error') out.errors.push(m.text().slice(0, 160)) })
  p.on('pageerror', (e) => out.errors.push('pageerror ' + e.message))
  await p.goto('http://localhost:5173/?seed=2024&nohover', { waitUntil: 'networkidle' }); await p.waitForSelector('canvas'); await p.waitForTimeout(2500)
  await p.evaluate((f) => window.__islesStore.load(f), replay)
  await p.waitForTimeout(800)
  while (await p.$('[aria-labelledby=pass-title]')) { await p.click('[aria-labelledby=pass-title] button'); await p.waitForTimeout(250) }
  await p.mouse.move(2, H - 2); await p.waitForTimeout(3000)
  await p.screenshot({ path: `${D}/board_${W}x${H}@${DPR}.png` })
  if (W === 1440) {
    // dice and build panel (desktop HUD)
    // the dice are rotated in 3D and overflow their box: clip around it with a margin
    const bb = await p.locator('[aria-label^="Dice"]').first().boundingBox()
    await p.screenshot({ path: `${D}/dice.png`, clip: { x: bb.x - 30, y: bb.y - 30, width: bb.width + 60, height: bb.height + 60 } })
    await p.screenshot({ path: `${D}/dice-full.png`, clip: { x: W - 300, y: 300, width: 300, height: 360 } })
    const build = p.locator('section[aria-labelledby=build-title], [aria-labelledby=build-title]').first()
    if (await build.count()) { await build.screenshot({ path: `${D}/build.png` }); if (!(await p.evaluate(() => !!window.axe))) await p.addScriptTag({ url: AXE }); out.buildAxe = await p.evaluate(async () => (await window.axe.run('[aria-labelledby=build-title]', { runOnly: ['wcag2a', 'wcag2aa'] })).violations.map((v) => `${v.id} (${v.nodes.length})`)) }
    // token close-up, board camera direction
    await p.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' })
    const toks = await p.evaluate(() => { const r = []; window.__isles.scene.traverse((o) => { if (o.userData?.piece === 'token') { const v = o.getWorldPosition(o.position.clone()); r.push({ x: v.x, y: v.y, z: v.z }) } }); return r })
    for (const [i, t] of toks.entries()) {
      if (i % 6) continue
      await p.evaluate(({ x, y, z }) => { const I = window.__isles; window.__probeDir ??= I.camera.position.clone().sub(I.controls.target).normalize(); I.controls.enabled = false; I.camera.position.set(x, y, z).addScaledVector(window.__probeDir, 2.4); I.camera.lookAt(x, y, z) }, t)
      await p.waitForTimeout(600); await p.screenshot({ path: `${D}/token_${i}.png`, clip: { x: W / 2 - 260, y: H / 2 - 200, width: 520, height: 400 } })
    }
  }
  if (W === 390) {
    // compact HUD: open the build sheet
    const btn = p.locator('button[aria-expanded]', { hasText: 'Build' }).first()
    if (await btn.count()) { await btn.click(); await p.waitForTimeout(500); await p.screenshot({ path: `${D}/build_390.png` }) }
  }
  await p.close()
}
writeFileSync(`${D}/a7.json`, JSON.stringify(out, null, 1))
console.log(JSON.stringify(out))
await b.close()
