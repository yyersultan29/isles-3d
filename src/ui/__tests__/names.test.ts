// G9.3: hot-seat names are cleaned, fall back to the colour, and survive junk in storage.
import { afterEach, describe, expect, it } from 'vitest'
import { SEATS, cleanName, setSeatNames } from '../gameView'
import { NAMES_KEY, readNames, writeNames } from '../../store/names'
import { logLines } from '../gameLog'

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } }

describe('G9.3 player names', () => {
  afterEach(() => setSeatNames({}))
  it('cleans names and falls back to the colour', () => {
    expect(cleanName('  Аня   Петрова  ')).toBe('Аня Петрова')
    expect(cleanName('x'.repeat(40))).toHaveLength(14)
    setSeatNames({ p1: 'Аня', p2: '   ' })
    expect(SEATS.p1.name).toBe('Аня')
    expect(SEATS.p2.name).toBe('Blue')
    expect(logLines([{ type: 'BUILT', what: 'road', at: 'e', by: 'p1', free: false }])[0].text).toBe('Аня built a road')
  })
  it('stores names per device and ignores junk', () => {
    const kv = memory()
    writeNames({ p1: 'Аня', p4: 'Bob' }, kv)
    expect(readNames(kv)).toEqual({ p1: 'Аня', p4: 'Bob' })
    kv.setItem(NAMES_KEY, '{"p1": 5, "p9": "x"}')
    expect(readNames(kv)).toEqual({})
    kv.setItem(NAMES_KEY, 'not json')
    expect(readNames(kv)).toEqual({})
    expect(readNames(null)).toEqual({})
  })
})
