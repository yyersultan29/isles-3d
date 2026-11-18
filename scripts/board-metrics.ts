// Board fairness and speed (docs/BOARD_GEN_PLAN.md §2.1, N1): the §2.1 metrics over many seeds for a
// preset, plus generation time. Usage: npx tsx scripts/board-metrics.ts [preset] [seeds]  (default balanced 20000)
import { boardBalance, generateBoard, pips } from '../src/game/board'
import { createRng } from '../src/game/rng'
import type { BoardPreset } from '../src/game'

const preset = (process.argv[2] ?? 'balanced') as BoardPreset
const N = Number(process.argv[3] ?? 20000)
const rows: Record<string, number>[] = []
const ms: number[] = []
for (let seed = 0; seed < N; seed++) {
  const t0 = performance.now()
  const b = generateBoard(createRng(seed), preset)
  ms.push(performance.now() - t0)
  const layout = Object.fromEntries(Object.values(b.tiles).map((t) => [t.id, [t.terrain, t.token] as const]))
  const m = boardBalance(layout as never, b.ports.map((p) => p.kind), b.topo)
  let same = 0, rare = 0
  const tok = (id: string) => b.tiles[id as keyof typeof b.tiles].token
  for (const e of Object.keys(b.topo.edgeTiles)) {
    const ts = b.topo.edgeTiles[e as keyof typeof b.topo.edgeTiles]
    if (ts.length !== 2) continue
    const [x, y] = ts.map(tok)
    if (x == null || y == null) continue
    if (x === y) same++
    if ((x === 2 && y === 12) || (x === 12 && y === 2)) rare++
  }
  const corner = Math.max(...b.topo.vertices.map((v) => b.topo.vertexTiles[v].reduce((s, t) => s + pips(tok(t)), 0)))
  rows.push({ same, clumps: m.clumps, rare, spread: m.spread, minPips: m.minPips, corner, red: m.redResources })
}
const avg = (k: string) => rows.reduce((s, r) => s + r[k], 0) / N
const share = (f: (r: Record<string, number>) => boolean) => `${((rows.filter(f).length / N) * 100).toFixed(1)}%`
ms.sort((a, b) => a - b)
console.log(JSON.stringify({
  preset, seeds: N,
  avg: { samePairs: avg('same'), sameResourcePairs: avg('clumps'), twoNextTo12: avg('rare'), spread: +avg('spread').toFixed(2), poorestPips: +avg('minPips').toFixed(1), bestCorner: +avg('corner').toFixed(1) },
  shares: { anySameNumber: share((r) => r.same > 0), clumps3plus: share((r) => r.clumps >= 3), twoNextTo12: share((r) => r.rare > 0), starved6: share((r) => r.minPips <= 6), poorest9plus: share((r) => r.minPips >= 9), red3resources: share((r) => r.red >= 3), corner13orLess: share((r) => r.corner <= 13) },
  ms: { median: +ms[N >> 1].toFixed(2), p99: +ms[Math.floor(N * 0.99)].toFixed(2), max: +ms[N - 1].toFixed(2) },
}, null, 1))
