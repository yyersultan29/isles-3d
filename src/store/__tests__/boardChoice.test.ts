// B3: the remembered board choice for new hot-seat games.
import { describe, expect, it } from 'vitest'
import { BOARD_KEY, readBoardChoice, writeBoardChoice } from '../boardChoice'
import type { KeyValue } from '../autosave'

const mem = (init: Record<string, string> = {}): KeyValue => {
  const m = new Map(Object.entries(init))
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) }
}

describe('B3 board choice', () => {
  it('defaults to balanced, ignores unknown values', () => {
    expect(readBoardChoice(mem())).toBe('balanced')
    expect(readBoardChoice(mem({ [BOARD_KEY]: 'random' }))).toBe('balanced')
  })
  it('remembers the choice', () => {
    const kv = mem()
    writeBoardChoice('standard-fixed', kv)
    expect(readBoardChoice(kv)).toBe('standard-fixed')
    writeBoardChoice('balanced', kv)
    expect(readBoardChoice(kv)).toBe('balanced')
  })
  it('keeps the choice for the page when storage throws', () => {
    const blocked: KeyValue = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => {} }
    writeBoardChoice('standard-fixed', blocked)
    expect(readBoardChoice(blocked)).toBe('standard-fixed')
    writeBoardChoice('balanced', blocked)
  })
})
