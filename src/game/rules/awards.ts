// Longest Road and Largest Army (GAME_DESIGN.md §10.2–10.3).

import type { EdgeId, GameEvent, GameState, PlayerId, VertexId } from '../types'

/** Longest trail (no edge reused, vertices may repeat) in p's roads; can't pass through an opponent's building. */
export function longestRoad(s: GameState, p: PlayerId): number {
  const topo = s.board.topo
  const own = (Object.keys(s.roads) as EdgeId[]).filter((e) => s.roads[e] === p)
  if (own.length === 0) return 0
  const blocked = (v: VertexId) => { const b = s.buildings[v]; return !!b && b.owner !== p }
  const used = new Set<EdgeId>()
  let best = 0
  const dfs = (v: VertexId, len: number) => {
    if (len > best) best = len
    if (len > 0 && blocked(v)) return // a road may end at an opponent's building but not pass through
    for (const e of topo.vertexEdges[v]) {
      if (s.roads[e] !== p || used.has(e)) continue
      used.add(e)
      const [a, b] = topo.edgeVertices[e]
      dfs(a === v ? b : a, len + 1)
      used.delete(e)
    }
  }
  const starts = new Set<VertexId>()
  for (const e of own) for (const v of topo.edgeVertices[e]) starts.add(v)
  for (const v of starts) dfs(v, 0) // every touching vertex: a pure loop has no dead end
  return best
}

/** One rule for the normal and the broken-road case (§10.2). */
export function resolveLongestRoad(prev: PlayerId | null, len: Record<PlayerId, number>, order: readonly PlayerId[]): PlayerId | null {
  const max = Math.max(...order.map((p) => len[p] ?? 0))
  if (max < 5) return null
  const leaders = order.filter((p) => len[p] === max)
  if (prev && leaders.includes(prev)) return prev // the holder keeps it on a tie
  return leaders.length === 1 ? leaders[0] : null // a unique leader takes it; otherwise it's set aside
}

export function updateLongestRoad(s: GameState, events: GameEvent[]) {
  const len = {} as Record<PlayerId, number>
  for (const p of s.order) len[p] = longestRoad(s, p)
  const next = resolveLongestRoad(s.longestRoad, len, s.order)
  if (next !== s.longestRoad) {
    events.push({ type: 'AWARD_CHANGED', award: 'longestRoad', from: s.longestRoad, to: next })
    s.longestRoad = next
  }
}

export function resolveLargestArmy(prev: PlayerId | null, knights: Record<PlayerId, number>, justPlayed: PlayerId): PlayerId | null {
  if (knights[justPlayed] < 3) return prev
  return prev === null || knights[justPlayed] > knights[prev] ? justPlayed : prev
}

export function updateLargestArmy(s: GameState, justPlayed: PlayerId, events: GameEvent[]) {
  const knights = {} as Record<PlayerId, number>
  for (const pl of s.players) knights[pl.id] = pl.playedKnights
  const next = resolveLargestArmy(s.largestArmy, knights, justPlayed)
  if (next !== s.largestArmy) {
    events.push({ type: 'AWARD_CHANGED', award: 'largestArmy', from: s.largestArmy, to: next })
    s.largestArmy = next
  }
}
