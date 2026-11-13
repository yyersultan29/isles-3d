// G6.1: trade and build planning agrees with the engine.
import { describe, expect, it } from 'vitest'
import { botGame, fixture } from '../../game/__tests__/helpers'
import { COSTS, RESOURCE_ORDER, apply, legalActions, tradeRate, validate, type GameState, type Resource, type VertexId } from '../../game'
import { affordable, bankQuote, payOptions, sameDraft, shortfall, tradesText } from '../tradePlan'
import type { BuildKind } from '../gameView'

/** a settlement for p1 away from every port, plus a free edge next to it */
const HOME = '0,0,N' as VertexId
const portOf = (s: GameState, kind: Resource | 'generic') => s.board.ports.find((p) => p.kind === kind)!.vertices[0]

describe('bankQuote', () => {
  it('accepts exactly one kind at the player’s rate for one other kind', () => {
    const s = fixture({ hands: { p1: { lumber: 9 } }, buildings: [[HOME, 'p1']] })
    expect(bankQuote(s, { lumber: 4 }, { brick: 1 })).toMatchObject({ ok: true, rate: 4, action: { type: 'BANK_TRADE', give: 'lumber', get: 'brick', count: 1 }, text: '4 wood → 1 brick (4:1)' })
    expect(bankQuote(s, { lumber: 8 }, { ore: 2 })).toMatchObject({ ok: true, action: { count: 2 } })
    expect(bankQuote(s, { lumber: 3 }, { brick: 1 })).toEqual({ ok: false, reason: 'The bank takes 4 wood per card (4:1)' })
    expect(bankQuote(s, { lumber: 4, wool: 0 }, { brick: 1, ore: 1 })).toEqual({ ok: false, reason: 'The bank trades one kind for one kind' })
    expect(bankQuote(s, { lumber: 12 }, { brick: 3 })).toEqual({ ok: false, reason: 'You have only 9 wood' })
    expect(bankQuote(s, {}, { brick: 1 })).toEqual({ ok: false, reason: 'Add cards you give' })
  })

  it('uses port rates, and says when the bank runs out or it is not this screen’s turn', () => {
    const s = fixture({ hands: { p1: { wool: 4 } } })
    const v = portOf(s, 'wool')
    s.buildings[v] = { owner: 'p1', type: 'settlement' }
    expect(tradeRate(s, 'p1', 'wool')).toBe(2)
    expect(bankQuote(s, { wool: 2 }, { ore: 1 })).toMatchObject({ ok: true, rate: 2, text: '2 wool → 1 ore (2:1)' })
    s.bank.ore = 0
    expect(bankQuote(s, { wool: 2 }, { ore: 1 })).toEqual({ ok: false, reason: 'The bank has only 0 ore' })
    expect(bankQuote(s, { wool: 2 }, { brick: 1 }, 'p2')).toEqual({ ok: false, reason: 'Wait for your turn' })
    expect(bankQuote(fixture({ phase: { kind: 'preRoll' }, hands: { p1: { wool: 4 } } }), { wool: 4 }, { brick: 1 })).toEqual({ ok: false, reason: 'Roll the dice first' })
  })
})

describe('payOptions', () => {
  it('lists every way to pay, cheapest rate first, then the biggest pile', () => {
    const s = fixture({ hands: { p1: { lumber: 5, grain: 6, wool: 3 } } })
    s.buildings[portOf(s, 'generic')] = { owner: 'p1', type: 'settlement' }
    const o = payOptions(s, 'brick')
    expect(o.map((x) => [x.give, x.cost, x.text])).toEqual([['grain', 3, '3 grain (port)'], ['lumber', 3, '3 wood (port)'], ['wool', 3, '3 wool (port)']])
    for (const x of o) expect(validate(s, 'p1', x.action).ok).toBe(true)
    expect(payOptions(s, 'brick', 2).map((x) => x.give)).toEqual(['grain'])
  })
})

describe('shortfall', () => {
  const home = () => fixture({ buildings: [[HOME, 'p1']], hands: { p1: { lumber: 5 } } })

  it('finds the missing brick for a road and pays it with spare wood, keeping the road’s own wood', () => {
    const f = shortfall(home(), 'road')
    expect(f).toMatchObject({ missing: { brick: 1 }, trades: [{ give: 'lumber', get: 'brick', count: 1 }], covered: true, draft: { give: { lumber: 4 }, want: { brick: 1 } } })
    // four wood: one is the road's own, so only three are spare
    const short = fixture({ buildings: [[HOME, 'p1']], hands: { p1: { lumber: 4 } } })
    expect(shortfall(short, 'road')).toMatchObject({ missing: { brick: 1 }, trades: [], covered: false })
  })

  it('combines kinds for a city and is not covered without a settlement to upgrade', () => {
    const s = fixture({ buildings: [[HOME, 'p1']], hands: { p1: { ore: 1, grain: 2, wool: 8 } } })
    const f = shortfall(s, 'city')
    expect(f.missing).toEqual({ ore: 2 })
    expect(f.trades).toEqual([{ type: 'BANK_TRADE', give: 'wool', get: 'ore', count: 2 }])
    expect(f.covered).toBe(true)
    const none = fixture({ hands: { p1: { ore: 1, grain: 2, wool: 8 } } })
    expect(shortfall(none, 'city')).toMatchObject({ missing: { ore: 2 }, covered: false })
  })

  it('spreads payment over piles as each runs down (8 wood, then 4 wool for three ore)', () => {
    const s = fixture({ buildings: [[HOME, 'p1']], hands: { p1: { grain: 2, lumber: 8, wool: 4 } } })
    const f = shortfall(s, 'city')
    expect(f.missing).toEqual({ ore: 3 })
    expect(f.trades).toEqual([{ type: 'BANK_TRADE', give: 'lumber', get: 'ore', count: 2 }, { type: 'BANK_TRADE', give: 'wool', get: 'ore', count: 1 }])
    expect(f.draft).toEqual({ give: { lumber: 8, wool: 4 }, want: { ore: 3 } })
    expect(f.covered).toBe(true)
  })

  it('reports a build the hand already pays for, and nothing outside the player’s turn', () => {
    const s = fixture({ buildings: [[HOME, 'p1']], hands: { p1: { lumber: 1, brick: 1 } } })
    expect(shortfall(s, 'road')).toMatchObject({ missing: {}, trades: [], covered: true })
    expect(shortfall(s, 'road', 'p3')).toMatchObject({ trades: [], covered: false })
  })
})

describe('affordable', () => {
  it('counts what the hand pays for, capped by pieces', () => {
    const s = fixture({ hands: { p1: { lumber: 3, brick: 5, ore: 6, grain: 4 } } })
    expect(affordable(s, 'road', 'p1')).toBe(3)
    expect(affordable(s, 'city', 'p1')).toBe(2)
    expect(affordable(s, 'settlement', 'p1')).toBe(0)
    s.players[0].pieces.roads = 1
    expect(affordable(s, 'road', 'p1')).toBe(1)
  })
})

describe('agreement with the engine over whole bot games', () => {
  it('quotes, pay options and shortfall plans are exactly what the engine accepts', () => {
    let checked = 0
    for (const seed of [3, 11, 29]) {
      botGame(seed, {
        preset: 'standard-fixed',
        check: (s) => {
          if (s.phase.kind !== 'actions') return
          const p = s.order[s.active]
          const pl = s.players.find((x) => x.id === p)!
          // every exact single-kind draft: the quote is ok exactly when the engine accepts the trade
          for (const give of RESOURCE_ORDER) for (const get of RESOURCE_ORDER) for (const n of [1, 2]) {
            if (give === get) continue
            const rate = tradeRate(s, p, give)
            const q = bankQuote(s, { [give]: rate * n }, { [get]: n })
            expect(q.ok).toBe(validate(s, p, { type: 'BANK_TRADE', give, get, count: n }).ok)
            if (q.ok) expect(q.action).toEqual({ type: 'BANK_TRADE', give, get, count: n })
          }
          // pay options for one card are the engine's legal bank trades for that card, no more, no less
          const legal = legalActions(s, p).filter((a) => a.type === 'BANK_TRADE') as { give: Resource; get: Resource }[]
          for (const want of RESOURCE_ORDER) {
            const mine = payOptions(s, want).map((o) => o.give).sort()
            expect(mine).toEqual(legal.filter((a) => a.get === want).map((a) => a.give).sort())
          }
          // a covered shortfall really works: each trade applies, then the build is legal
          for (const kind of ['road', 'settlement', 'city', 'dev'] as BuildKind[]) {
            const f = shortfall(s, kind)
            for (const r of RESOURCE_ORDER) expect(f.missing[r] ?? 0).toBe(Math.max(0, (COSTS[kind][r] ?? 0) - pl.resources[r]))
            if (!f.covered) continue
            let cur = s
            for (const t of f.trades) { const r = apply(cur, p, t); expect(r.ok).toBe(true); if (r.ok) cur = r.state }
            const type = { road: 'BUILD_ROAD', settlement: 'BUILD_SETTLEMENT', city: 'BUILD_CITY', dev: 'BUY_DEV' }[kind]
            expect(legalActions(cur, p).some((a) => a.type === type)).toBe(true)
            // never spends the build's own cards
            for (const r of RESOURCE_ORDER) expect(cur.players.find((x) => x.id === p)!.resources[r]).toBeGreaterThanOrEqual(COSTS[kind][r] ?? 0)
          }
          checked++
        },
      })
    }
    expect(checked).toBeGreaterThan(500)
  })
})

describe('tradesText and sameDraft (G6.4)', () => {
  it('describes a plan at the player’s rates and compares drafts side by side', () => {
    const s = fixture({ buildings: [[HOME, 'p1']], hands: { p1: { grain: 2, lumber: 8, wool: 4 } } })
    const f = shortfall(s, 'city')
    expect(tradesText(s, 'p1', f.trades)).toBe('8 wood → 2 ore, 4 wool → 1 ore')
    expect(sameDraft(f.draft, { give: { wool: 4, lumber: 8 }, want: { ore: 3 } })).toBe(true)
    expect(sameDraft(f.draft, { give: { wool: 4, lumber: 8 }, want: { ore: 2 } })).toBe(false)
    expect(sameDraft(f.draft, { give: { wool: 4, lumber: 8, brick: 0 }, want: { ore: 3 } })).toBe(true)
  })
})
