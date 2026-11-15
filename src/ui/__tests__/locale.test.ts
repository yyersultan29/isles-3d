import { describe, expect, it } from 'vitest'
import { count, getLocale, ruPlural, setLocale } from '../locale'
import { resCount, resList } from '../words'
import { logLines } from '../gameLog'

describe('locale (G9.4)', () => {
  it('picks Russian number forms', () => {
    const f = (n: number) => ruPlural(n, 'карта', 'карты', 'карт')
    expect([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111].map(f)).toEqual(
      ['карта', 'карты', 'карты', 'карт', 'карт', 'карт', 'карт', 'карта', 'карты', 'карт', 'карта', 'карт'])
  })
  it('switches words with the locale', () => {
    const was = getLocale()
    setLocale('en')
    expect(resList({ lumber: 2, ore: 1 })).toBe('2 wood, 1 ore')
    expect(count(1, 'card', 'cards', 'карта', 'карты', 'карт')).toBe('1 card')
    setLocale('ru')
    expect(resList({ lumber: 2, ore: 1 })).toBe('2 дерева, 1 руда')
    expect(resCount(5, 'brick')).toBe('5 кирпичей')
    expect(count(3, 'card', 'cards', 'карта', 'карты', 'карт')).toBe('3 карты')
    setLocale(was)
  })
  it('writes log lines in Russian', () => {
    const was = getLocale()
    setLocale('ru')
    const [line] = logLines([{ type: 'DICE_ROLLED', by: 'p1', dice: [3, 4] }], {})
    expect(line.text).toMatch(/[а-я]/i)
    setLocale(was)
  })
})
