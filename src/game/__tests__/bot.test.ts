// G10.5a: the solo-play bot. Every choice must be legal, bot-only games must finish, and the bot
// must clearly beat the random legal bot of §23.2.
import { describe, expect, it } from 'vitest'
import { validate } from '../engine'
import { botAction } from '../bot'
import { createRng } from '../rng'
import type { Action, GameState, PlayerId } from '../types'
import { act, assertInvariants, botMove, fixture, newGame, waiting } from './helpers'

/** Plays one game: seats in `bots` use botAction, the rest the random bot. */
function play(seed: number, bots: PlayerId[], opts: { cap?: number; times?: number[] } = {}) {
  const rng = createRng(seed ^ 0x51ed)
  let s = newGame(seed, { boardPreset: seed % 2 ? 'balanced' : 'standard-fixed' })
  const cap = opts.cap ?? 400
  let steps = 0
  while (s.phase.kind !== 'gameOver' && s.turn <= cap && steps++ < cap * 80) {
    let p: PlayerId, a: Action
    const w = waiting(s)[0]
    if (bots.includes(w)) {
      const t0 = performance.now()
      a = botAction(s, w)!
      opts.times?.push(performance.now() - t0)
      p = w
      const v = validate(s, p, a)
      if (!v.ok) throw new Error(`seed ${seed}: bot ${p} chose an illegal ${JSON.stringify(a)} → ${v.error.code}`)
    } else [p, a] = botMove(s, rng)
    s = act(s, a, p)
  }
  return s
}

const winner = (s: GameState) => (s.phase.kind === 'gameOver' ? s.phase.winner : null)

describe('G10.5a bot', () => {
  // 500 games measured once on 2026-11-20 (median 70 turns, max 123, p95 0.69 ms); 200 keep the suite quick
  const GAMES = 200
  it('bot-only games finish with legal moves and intact invariants', () => {
    const turns: number[] = []
    const times: number[] = []
    for (let g = 0; g < GAMES; g++) {
      const s = play(7000 + g, ['p1', 'p2', 'p3', 'p4'], { times })
      assertInvariants(s)
      expect(winner(s), `seed ${7000 + g} hit the turn cap`).not.toBeNull()
      turns.push(s.turn)
    }
    turns.sort((a, b) => a - b)
    times.sort((a, b) => a - b)
    const p95 = times[Math.floor(times.length * 0.95)]
    console.log(`bot vs bot: median ${turns[GAMES >> 1]} turns, max ${turns[GAMES - 1]}; choice p95 ${p95.toFixed(2)} ms, max ${times[times.length - 1].toFixed(1)} ms`)
    expect(p95).toBeLessThan(5)
  }, 120_000)

  it('beats three random bots in at least 80% of 100 games', () => {
    let wins = 0
    for (let g = 0; g < 100; g++) if (winner(play(9000 + g, ['p1'])) === 'p1') wins++
    console.log(`bot vs 3 random: ${wins}/100`)
    expect(wins).toBeGreaterThanOrEqual(80)
  }, 120_000)

  it('owes nothing when it is not waited for', () => {
    const s = fixture()
    expect(botAction(s, 'p2')).toBeNull()
  })

  it('never puts the robber on its own buildings when another tile exists', () => {
    const s = fixture({ phase: { kind: 'moveRobber', source: 'seven', resume: 'actions' }, buildings: [['0,0,N', 'p1'], ['1,-1,S', 'p2', 'city']] })
    expect(s.board.topo.vertices).toContain('0,0,N')
    expect(s.board.topo.vertices).toContain('1,-1,S')
    const a = botAction(s, 'p1')!
    expect(a.type).toBe('MOVE_ROBBER')
    const tile = (a as Extract<Action, { type: 'MOVE_ROBBER' }>).tile
    expect(s.board.topo.tileVertices[tile]).not.toContain('0,0,N')
  })

  it('discards what its goal needs least', () => {
    // 2 grain + 3 ore is a city; 4 extra lumber is the obvious thing to drop
    const s = fixture({ hands: { p1: { grain: 2, ore: 3, lumber: 4 } }, buildings: [['0,0,N', 'p1']], phase: { kind: 'discard', pending: { p1: 4 } } })
    expect(botAction(s, 'p1')).toEqual({ type: 'DISCARD', cards: { lumber: 4 } })
  })

  it('accepts a trade that completes its goal and declines one that does not', () => {
    const offer = (give: 'ore' | 'wool') => {
      const s = fixture({ hands: { p1: { ore: 1, wool: 1 }, p2: { grain: 2, ore: 2, lumber: 1 } }, buildings: [['0,0,N', 'p2'], ['1,-1,S', 'p1']] })
      s.trade = { id: 1, from: 'p1', offer: { [give]: 1 }, request: { lumber: 1 }, to: ['p2'], responses: {} }
      return s
    }
    // ore makes 2 grain + 3 ore: a city
    expect(botAction(offer('ore'), 'p2')).toEqual({ type: 'RESPOND_TRADE', tradeId: 1, accept: true })
    // wool brings no goal closer
    expect(botAction(offer('wool'), 'p2')).toEqual({ type: 'RESPOND_TRADE', tradeId: 1, accept: false })
  })
})
