// Test helpers: deterministic setup playouts and invariants.
import { apply, createGame, legalActions, validate } from '../engine'
import { longestRoad, resolveLargestArmy, resolveLongestRoad } from '../rules/awards'
import type { Action, EdgeId, GameState, LegalAction, PlayerId, Resource, ResourceCounts, Result, VertexId } from '../types'
import { PLAYER_IDS, RESOURCE_ORDER } from '../types'
import { activeId, draft } from '../state'
import { createRng, pick, type Rng } from '../rng'

export function newGame(seed = 1, extra: Partial<Parameters<typeof createGame>[0]> = {}): GameState {
  const r = createGame({ seed, ...extra })
  if (!r.ok) throw new Error(r.error.message)
  return r.state
}

export function must(r: Result): Extract<Result, { ok: true }> {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`)
  return r
}

export const act = (s: GameState, a: Action, p: PlayerId = activeId(s)) => must(apply(s, p, a)).state

/** Plays the whole setup with legal moves chosen by a separate seeded RNG. */
export function playSetup(s: GameState, choiceSeed = 99): GameState {
  const rng = createRng(choiceSeed)
  while (s.phase.kind === 'setup') {
    const legal = legalActions(s, activeId(s)) as Action[]
    s = act(s, legal[pick(rng, legal.length)])
  }
  return s
}

/** Resource conservation and non-negativity (§5, §13). */
export function assertInvariants(s: GameState) {
  for (const r of RESOURCE_ORDER) {
    const total = s.bank[r] + s.players.reduce((a, p) => a + p.resources[r], 0)
    if (total !== 19) throw new Error(`conservation broken for ${r}: ${total}`)
    if (s.bank[r] < 0 || s.players.some((p) => p.resources[r] < 0)) throw new Error(`negative ${r}`)
  }
  for (const p of s.players) {
    const onBoardS = Object.values(s.buildings).filter((b) => b?.owner === p.id && b.type === 'settlement').length
    const onBoardC = Object.values(s.buildings).filter((b) => b?.owner === p.id && b.type === 'city').length
    const onBoardR = Object.values(s.roads).filter((o) => o === p.id).length
    if (onBoardS + p.pieces.settlements !== 5) throw new Error(`settlement pieces broken for ${p.id}`)
    if (onBoardC + p.pieces.cities !== 4) throw new Error(`city pieces broken for ${p.id}`)
    if (onBoardR + p.pieces.roads !== 15) throw new Error(`road pieces broken for ${p.id}`)
  }
}

/** Recursively freezes a value so any accidental mutation of an engine input throws in tests. */
export function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    for (const v of Object.values(o as object)) deepFreeze(v)
  }
  return o
}

/** Players the game is waiting for right now (the active player, or everyone who owes a discard). */
export function waiting(s: GameState): PlayerId[] {
  if (s.phase.kind === 'discard') return s.order.filter((p) => (s.phase as { pending: Partial<Record<PlayerId, number>> }).pending[p])
  return s.phase.kind === 'gameOver' ? [] : [activeId(s)]
}

/** Turns a legal-action marker into a concrete action: DISCARD takes cards in canonical order (or randomly with rng). */
export function concretize(s: GameState, p: PlayerId, a: LegalAction, rng?: Rng): Action {
  if (a.type === 'DISCARD' && 'count' in a) {
    const hand = { ...s.players.find((x) => x.id === p)!.resources }
    const cards: Partial<Record<Resource, number>> = {}
    for (let k = 0; k < a.count; k++) {
      const avail = RESOURCE_ORDER.filter((r) => hand[r] > 0)
      const r = rng ? avail[pick(rng, avail.length)] : avail[0]
      hand[r] -= 1
      cards[r] = (cards[r] ?? 0) + 1
    }
    return { type: 'DISCARD', cards }
  }
  if (a.type === 'PROPOSE_TRADE' && !('offer' in a)) {
    // a minimal legal proposal: 1 of the first held resource for 1 of another
    const hand = s.players.find((x) => x.id === p)!.resources
    const give = RESOURCE_ORDER.find((r) => hand[r] > 0)!
    const get = RESOURCE_ORDER.find((r) => r !== give)!
    return { type: 'PROPOSE_TRADE', offer: { [give]: 1 }, request: { [get]: 1 } }
  }
  return a as Action
}

/** Resolves discard / robber / steal with the first legal choice; optionally records [player, action]. */
export function resolvePending(s: GameState, log?: [PlayerId, Action][]): GameState {
  while (s.phase.kind === 'discard' || s.phase.kind === 'moveRobber' || s.phase.kind === 'steal') {
    const p = waiting(s)[0]
    const a = concretize(s, p, legalActions(s, p)[0])
    log?.push([p, a])
    s = act(s, a, p)
  }
  return s
}

/** ROLL, resolve any seven, END_TURN. */
export function playTurn(s: GameState, log?: [PlayerId, Action][]): GameState {
  for (const a of [{ type: 'ROLL' }] as Action[]) { log?.push([activeId(s), a]); s = act(s, a) }
  s = resolvePending(s, log)
  if (s.phase.kind !== 'actions') return s
  log?.push([activeId(s), { type: 'END_TURN' }])
  return act(s, { type: 'END_TURN' })
}

/** Empty board in `actions`, order p1..p4, p1 active, with optional hands, buildings and roads. */
export function fixture(opts: {
  hands?: Partial<Record<PlayerId, Partial<ResourceCounts>>>
  buildings?: [VertexId, PlayerId, ('settlement' | 'city')?][]
  roads?: [EdgeId, PlayerId][]
  friendly?: boolean
  phase?: GameState['phase']
} = {}): GameState {
  const s = draft(newGame(1, { friendlyRobber: !!opts.friendly }))
  s.order = [...PLAYER_IDS]
  s.active = 0
  s.turn = 5
  s.phase = opts.phase ?? { kind: 'actions' }
  for (const [p, h] of Object.entries(opts.hands ?? {}) as [PlayerId, Partial<ResourceCounts>][]) {
    const pl = s.players.find((x) => x.id === p)!
    for (const r of RESOURCE_ORDER) { const n = h[r] ?? 0; pl.resources[r] += n; s.bank[r] -= n }
  }
  for (const [v, p, t] of opts.buildings ?? []) {
    s.buildings[v] = { owner: p, type: t ?? 'settlement' }
    const pl = s.players.find((x) => x.id === p)!
    if (t === 'city') pl.pieces.cities -= 1
    else pl.pieces.settlements -= 1
  }
  for (const [e, p] of opts.roads ?? []) { s.roads[e] = p; s.players.find((x) => x.id === p)!.pieces.roads -= 1 }
  assertInvariants(s)
  return s
}


/**
 * "Random legal bot" (§23.2): picks among legalActions with a light bias towards progress
 * (cities, settlements, cards, roads) so games finish; never proposes or cancels trades.
 */
export function botMove(s: GameState, rng: Rng): [PlayerId, Action] {
  const p = waiting(s)[0]
  const legal = legalActions(s, p).filter((a) => a.type !== 'PROPOSE_TRADE' && a.type !== 'CANCEL_TRADE')
  const by = (t: string) => legal.filter((a) => a.type === t)
  const roll = rng.next()
  const prefer = (lists: LegalAction[][]) => { for (const l of lists) if (l.length) return l[pick(rng, l.length)]; return undefined }
  let choice: LegalAction | undefined
  if (s.phase.kind === 'actions') {
    if (roll < 0.9) choice = prefer([by('BUILD_CITY'), by('BUILD_SETTLEMENT'), by('BUY_DEV')])
    if (!choice && roll < 0.6) choice = prefer([by('PLAY_KNIGHT'), by('PLAY_ROAD_BUILDING'), by('PLAY_MONOPOLY'), by('PLAY_YEAR_OF_PLENTY')])
    if (!choice && roll < 0.5) choice = prefer([by('BUILD_ROAD')])
    if (!choice && roll < 0.3) choice = prefer([by('BANK_TRADE')])
    if (!choice) choice = by('END_TURN')[0] ?? legal[pick(rng, legal.length)]
  } else choice = legal[pick(rng, legal.length)]
  return [p, concretize(s, p, choice!, rng)]
}

/** Plays a whole game with the bot; stops at gameOver or the turn cap (reported, not failed). */
export function botGame(seed: number, opts: { cap?: number; check?: (s: GameState) => void; log?: [PlayerId, Action][]; preset?: 'random' | 'standard-fixed' } = {}) {
  const rng = createRng(seed ^ 0x9e3779b9)
  let s = newGame(seed, { boardPreset: opts.preset ?? 'random' })
  const cap = opts.cap ?? 2000
  let steps = 0
  while (s.phase.kind !== 'gameOver' && s.turn <= cap && steps++ < cap * 60) {
    const [p, a] = botMove(s, rng)
    opts.log?.push([p, a])
    s = act(s, a, p)
    opts.check?.(s)
  }
  return s
}

/** §23.2 award consistency: re-resolving the awards from the current state changes nothing. */
export function assertAwards(s: GameState) {
  const len = {} as Record<PlayerId, number>, kn = {} as Record<PlayerId, number>
  for (const p of s.order) { len[p] = longestRoad(s, p); kn[p] = s.players.find((x) => x.id === p)!.playedKnights }
  if (resolveLongestRoad(s.longestRoad, len, s.order) !== s.longestRoad) throw new Error(`longest road inconsistent: ${s.longestRoad} ${JSON.stringify(len)}`)
  if (resolveLargestArmy(s.largestArmy, kn, s.largestArmy ?? s.order[0]) !== s.largestArmy) throw new Error(`largest army inconsistent: ${s.largestArmy} ${JSON.stringify(kn)}`)
  if (s.longestRoad && len[s.longestRoad] < 5) throw new Error('longest road holder below 5')
  if (s.largestArmy && kn[s.largestArmy] < 3) throw new Error('largest army holder below 3')
}

/** §23.2 legalActions ⊆ validate, for every player the game is waiting for (and trade responders). */
export function assertLegalSubset(s: GameState, rng?: Rng) {
  for (const p of PLAYER_IDS) {
    for (const a of legalActions(s, p)) {
      const c = concretize(s, p, a, rng)
      const r = validate(s, p, c)
      if (!r.ok) throw new Error(`legal action rejected for ${p}: ${JSON.stringify(c)} → ${r.error.code}`)
    }
  }
}
