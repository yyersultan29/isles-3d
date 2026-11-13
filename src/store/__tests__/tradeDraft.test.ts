// G6.2: the trade draft in the UI store.
import { describe, expect, it } from 'vitest'
import { changeDraft, clearDraft, draftAdd, draftCovered, draftEmpty, getDraft, type TradeDraft } from '../ui'

const E: TradeDraft = { give: {}, want: {} }
const hand = { lumber: 3, brick: 0, wool: 1, grain: 0, ore: 2 }

describe('draftAdd', () => {
  it('adds and removes one card at a time, within 0 and the cap', () => {
    let d = draftAdd(E, 'give', 'lumber', 1, 3)
    d = draftAdd(d, 'give', 'lumber', 1, 3)
    expect(d).toEqual({ give: { lumber: 2 }, want: {} })
    expect(draftAdd(draftAdd(d, 'give', 'lumber', 1, 3), 'give', 'lumber', 1, 3)).toEqual({ give: { lumber: 3 }, want: {} })
    expect(draftAdd(draftAdd(d, 'give', 'lumber', -1), 'give', 'lumber', -1)).toEqual(E)
    expect(draftAdd(E, 'give', 'lumber', -1)).toBe(E) // no change, same object (no re-render)
    expect(draftAdd(E, 'give', 'brick', 1, 0)).toBe(E)
  })

  it('keeps a resource on one side only', () => {
    const d = draftAdd(draftAdd(E, 'want', 'ore', 2), 'give', 'wool', 1)
    expect(draftAdd(d, 'give', 'ore', 1)).toEqual({ give: { wool: 1, ore: 1 }, want: {} })
    expect(draftAdd(d, 'want', 'wool', 1)).toEqual({ give: {}, want: { ore: 2, wool: 1 } })
    expect(draftAdd(d, 'give', 'ore', -1)).toBe(d) // removing never touches the other side
  })
})

describe('draftCovered and the store', () => {
  it('says whether the hand still holds the given cards', () => {
    expect(draftCovered({ give: { lumber: 3, ore: 2 }, want: { brick: 4 } }, hand)).toBe(true)
    expect(draftCovered({ give: { lumber: 4 }, want: {} }, hand)).toBe(false)
    expect(draftCovered(E, hand)).toBe(true)
    expect(draftEmpty(E)).toBe(true)
  })

  it('changeDraft and clearDraft update the shared draft', () => {
    clearDraft()
    changeDraft('give', 'wool', 1, 1)
    changeDraft('give', 'wool', 1, 1)
    expect(getDraft()).toEqual({ give: { wool: 1 }, want: {} })
    clearDraft()
    expect(draftEmpty(getDraft())).toBe(true)
  })
})
