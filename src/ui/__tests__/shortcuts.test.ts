// G6.6: which key presses are shortcuts.
import { describe, expect, it } from 'vitest'
import { shortcutOf } from '../shortcuts'

const el = (tagName: string, attrs: Record<string, string> = {}, isContentEditable = false) =>
  ({ tagName, isContentEditable, getAttribute: (n: string) => (n in attrs ? attrs[n] : null) }) as unknown as EventTarget

describe('shortcutOf', () => {
  it('maps the letters, either case, and Enter off controls', () => {
    expect(['r', 'S', 'c', 'd', 'T'].map((key) => shortcutOf({ key, target: el('BODY') }))).toEqual(['road', 'settlement', 'city', 'dev', 'trade'])
    expect(shortcutOf({ key: 'Enter', target: el('BODY') })).toBe('confirm')
    expect(shortcutOf({ key: 'x', target: el('BODY') })).toBeNull()
  })

  it('stays out of typing, modifiers and held keys', () => {
    expect(shortcutOf({ key: 'r', target: el('INPUT') })).toBeNull()
    expect(shortcutOf({ key: 'r', target: el('TEXTAREA') })).toBeNull()
    expect(shortcutOf({ key: 'r', target: el('DIV', {}, true) })).toBeNull()
    expect(shortcutOf({ key: 'r', ctrlKey: true, target: el('BODY') })).toBeNull()
    expect(shortcutOf({ key: 'c', metaKey: true, target: el('BODY') })).toBeNull() // copy
    expect(shortcutOf({ key: 't', repeat: true, target: el('BODY') })).toBeNull()
  })

  it('leaves Enter to buttons and tabs, except resource cards', () => {
    expect(shortcutOf({ key: 'Enter', target: el('BUTTON') })).toBeNull()
    expect(shortcutOf({ key: 'Enter', target: el('DIV', { role: 'radio' }) })).toBeNull()
    expect(shortcutOf({ key: 'Enter', target: el('BUTTON', { 'data-tile': '' }) })).toBe('confirm')
    expect(shortcutOf({ key: 'Enter', target: el('BUTTON', { 'data-hand-card': '' }) })).toBe('confirm')
    expect(shortcutOf({ key: 'r', target: el('BUTTON') })).toBe('road')
  })
})
