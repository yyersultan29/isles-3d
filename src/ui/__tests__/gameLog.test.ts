// G9.1: the game log lists public events, never hidden ones, and survives a silent load and a new game.
import { describe, expect, it } from 'vitest'
import { legalActions, type Action } from '../../game'
import { createGameStore } from '../../store/gameStore'
import { activeId } from '../../game/state'
import { createRng, pick } from '../../game/rng'
import { LOG_MAX, gameLogFor, logLines } from '../gameLog'

describe('G9.1 game log', () => {
  it('writes one line per public event, with the robber tile by terrain and number', () => {
    const tiles = { '0,0': { id: '0,0' as const, q: 0, r: 0, terrain: 'fields' as const, token: 8 } }
    const lines = logLines([
      { type: 'TURN_STARTED', player: 'p1', turn: 12 },
      { type: 'DICE_ROLLED', by: 'p1', dice: [3, 5] },
      { type: 'RESOURCES_PRODUCED', gains: { p1: { lumber: 2, ore: 1 }, p3: { wool: 1 }, p2: {} }, shortfall: [] },
      { type: 'ROBBER_MOVED', by: 'p2', from: '1,0', to: '0,0' },
      { type: 'BUILT', what: 'city', at: 'v', by: 'p4', free: false },
      { type: 'BUILT', what: 'road', at: 'e', by: 'p4', free: true },
      { type: 'BANK_TRADED', by: 'p3', gave: { wool: 4 }, got: { ore: 1 } },
      { type: 'AWARD_CHANGED', award: 'largestArmy', from: null, to: 'p2' },
      { type: 'TRADE_PROPOSED', trade: {} as never },
    ], tiles)
    expect(lines.map((l) => l.text)).toEqual([
      'Turn 12: Red',
      'Red rolled 8',
      'Red got +2 wood +1 ore',
      'White got +1 wool',
      'Blue moved the robber to fields 8',
      'Orange upgraded a settlement to a city',
      'Orange built a road (free)',
      'White traded 4 wool for 1 ore with the bank',
      'Blue takes Largest Army (+2 points)',
    ])
    expect(lines[1].dice).toEqual([3, 5])
    expect(lines[2].gains).toEqual({ lumber: 2, ore: 1 })
    expect(logLines([{ type: 'RESOURCES_PRODUCED', gains: {}, shortfall: [] }])[0].text).toBe('No one produced anything')
  })

  it('never shows a stolen resource or a bought card type, even when the event carries them', () => {
    const text = logLines([
      { type: 'CARD_STOLEN', from: 'p2', to: 'p1', resource: 'ore' },
      { type: 'DEV_BOUGHT', by: 'p4', card: 'victoryPoint' },
    ]).map((l) => l.text).join(' | ')
    expect(text).toBe('Red stole a card from Blue | Orange bought a development card')
  })

  it('keeps the history across a silent load and starts over on a new game', () => {
    const store = createGameStore({ seed: 7 })
    gameLogFor(store) // subscribed from the start: the lines below are appended live
    const rng = createRng(3)
    for (let i = 0; i < 60; i++) {
      const s = store.getState()
      const legal = legalActions(s, activeId(s)).filter((a) => a.type !== 'PROPOSE_TRADE') as Action[]
      store.dispatch(activeId(s), legal[pick(rng, legal.length)])
    }
    const live = gameLogFor(store).map((l) => l.text)
    expect(live.length).toBeGreaterThan(20)

    // a second store resumes the same game silently: its log is rebuilt from the saved actions
    const other = createGameStore({ seed: 1 })
    gameLogFor(other) // subscribe before the load, as the mounted HUD does
    other.load(store.replayFile())
    const rebuilt = gameLogFor(other).map((l) => l.text)
    expect(rebuilt).toEqual(live)
    expect(rebuilt[0]).toMatch(/^New game: /)

    store.reset({ seed: 9 })
    const fresh = gameLogFor(store)
    expect(fresh.length).toBe(1)
    expect(fresh[0].kind).toBe('start')
    expect(LOG_MAX).toBe(200)
  })
})

describe('G9.7 long games', () => {
  it('keeps the last LOG_MAX lines through a language change after many turns', async () => {
    const { setLocale, getLocale } = await import('../locale')
    const was = getLocale()
    setLocale('en')
    const store = createGameStore({ seed: 4 })
    gameLogFor(store)
    const rng = createRng(8)
    for (let i = 0; i < 1500; i++) {
      const s = store.getState()
      if (s.phase.kind === 'gameOver') break
      const who = s.phase.kind === 'discard' ? s.order.find((p) => (s.phase as { pending: Record<string, number> }).pending[p])! : activeId(s)
      const legal = legalActions(s, who).filter((a) => !['PROPOSE_TRADE', 'RESPOND_TRADE', 'CONFIRM_TRADE', 'CANCEL_TRADE'].includes(a.type)) as Action[]
      if (!legal.length) break
      store.dispatch(who, legal[pick(rng, legal.length)])
    }
    const en = gameLogFor(store).map((l) => l.text)
    expect(en.length).toBe(LOG_MAX)
    setLocale('ru')
    const ru = gameLogFor(store)
    expect(ru.length).toBe(LOG_MAX)
    expect(ru.at(-1)!.text).not.toBe(en.at(-1))
    setLocale('en')
    expect(gameLogFor(store).map((l) => l.text)).toEqual(en)
    setLocale(was)
  })
})
