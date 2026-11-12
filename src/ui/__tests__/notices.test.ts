// G4.5a: event notices are short, public-only summaries; every error code has a message.
import { describe, expect, it } from 'vitest'
import { act, fixture } from '../../game/__tests__/helpers'
import { apply, type ErrorCode } from '../../game'
import { eventNotices } from '../noticeQueue'
import { EN, errorText } from '../i18n'

describe('G4.5a notices', () => {
  it('summarises production, sevens, steals, awards, cards and trades without hidden information', () => {
    const texts = eventNotices([
      { type: 'DICE_ROLLED', by: 'p1', dice: [3, 4] },
      { type: 'RESOURCES_PRODUCED', gains: { p1: { lumber: 2, ore: 1 }, p3: { wool: 1 } }, shortfall: ['brick'] },
      { type: 'CARD_STOLEN', from: 'p2', to: 'p1', resource: 'ore' },
      { type: 'AWARD_CHANGED', award: 'longestRoad', from: 'p2', to: 'p1' },
      { type: 'DEV_BOUGHT', by: 'p4', card: 'victoryPoint' },
      { type: 'DEV_PLAYED', by: 'p4', card: 'knight' },
      { type: 'MONOPOLY_RESOLVED', by: 'p3', resource: 'grain', taken: { p1: 2, p2: 1 } },
      { type: 'BUILT', what: 'road', at: '0,0,NE', by: 'p1', free: false },
    ]).map((n) => n.text)
    expect(texts).toEqual([
      'Red rolled a seven!',
      'Red +2 wood +1 ore · White +1 wool',
      'The bank is short of brick: nobody gets it.',
      'Red stole a card from Blue.',
      'Red takes Longest Road from Blue!',
      'Orange bought a development card.',
      'Orange played a Knight.',
      'White played Monopoly on grain: took 3.',
    ])
    expect(texts.join(' ')).not.toMatch(/ore\.|victory/i) // stolen resource and bought card type stay hidden
  })

  it('real engine events from a trade produce one notice each', () => {
    const s = fixture({ hands: { p1: { grain: 4 } } })
    const r = apply(s, 'p1', { type: 'BANK_TRADE', give: 'grain', get: 'ore' })
    expect(r.ok && eventNotices(r.events).map((n) => n.text)).toEqual(['Red traded 4 grain for 1 ore with the bank.'])
    const t = act(fixture({ hands: { p1: { wool: 1 }, p2: { ore: 1 } } }), { type: 'PROPOSE_TRADE', offer: { wool: 1 }, request: { ore: 1 } })
    const t2 = act(t, { type: 'RESPOND_TRADE', tradeId: t.trade!.id, accept: true }, 'p2')
    const done = apply(t2, 'p1', { type: 'CONFIRM_TRADE', tradeId: t.trade!.id, with: 'p2' })
    expect(done.ok && eventNotices(done.events).map((n) => n.text)).toEqual(['Red traded 1 wool to Blue for 1 ore.'])
  })

  it('every engine error code has a player-facing message', () => {
    const r = apply(fixture(), 'p2', { type: 'END_TURN' })
    expect(!r.ok && errorText(r.error.code)).toBe('It isn’t your turn.')
    const codes = Object.keys(EN) as ErrorCode[]
    expect(codes).toHaveLength(29)
    for (const c of codes) expect(EN[c].length).toBeGreaterThan(8)
  })
})
