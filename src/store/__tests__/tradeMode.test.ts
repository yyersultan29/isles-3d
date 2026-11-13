import { describe, expect, it } from 'vitest'
import { getTradeMode, getTradeOpen, setPanel, setTradeMode, setTradeOpen } from '../ui'

describe('G7.3 trade mode', () => {
  it('is picked by how the panel opens, and an open panel keeps its mode', () => {
    setPanel(null)
    setTradeOpen(true, 'players') // a hand card
    expect(getTradeMode()).toBe('players')
    setTradeOpen(true) // another hand card or T while open: no change
    expect(getTradeMode()).toBe('players')
    setTradeOpen(false)
    setTradeOpen(true) // the Trade button, a build row or T
    expect(getTradeMode()).toBe('bank')
    expect(getTradeOpen()).toBe(true)
  })
  it('switches with one call and survives a panel switch only until the next open', () => {
    setPanel(null); setTradeOpen(true)
    setTradeMode('players')
    expect(getTradeMode()).toBe('players')
    setPanel('dev'); setTradeOpen(true)
    expect(getTradeMode()).toBe('bank')
    setPanel(null)
  })
})
