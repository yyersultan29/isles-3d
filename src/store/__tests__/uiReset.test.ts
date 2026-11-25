import { describe, expect, it } from 'vitest'
import { changeDraft, draftEmpty, getDraft, getPanel, getPlacementMode, getSeen, resetUi, resetUiForPhase, setDevOpen, setPlacementMode, setSeen, setTradeOpen } from '../ui'

const busy = () => { setSeen('p1'); changeDraft('give', 'lumber', 1); setTradeOpen(true) }

describe('UI resets', () => {
  it('turn: closes the panel and the board choice, drops the draft, keeps the viewer', () => {
    busy(); resetUi('turn')
    expect([getPanel(), getPlacementMode(), draftEmpty(getDraft()), getSeen()]).toEqual([null, null, true, 'p1'])
    setPlacementMode('road'); resetUi('turn')
    expect(getPlacementMode()).toBe(null)
  })

  it('escape: closes but keeps the draft; leave: also forgets the viewer', () => {
    busy(); resetUi('escape')
    expect([getPanel(), draftEmpty(getDraft()), getSeen()]).toEqual([null, false, 'p1'])
    resetUi('leave')
    expect(getSeen()).toBe(null)
    resetUi('turn')
  })

  it('phase: trade and building only in actions, dev cards also before the roll', () => {
    setDevOpen(true); resetUiForPhase('preRoll')
    expect(getPanel()).toBe('dev')
    resetUiForPhase('setup')
    expect(getPanel()).toBe(null)
    setTradeOpen(true); resetUiForPhase('preRoll')
    expect(getPanel()).toBe(null)
    setPlacementMode('road'); resetUiForPhase('actions')
    expect(getPlacementMode()).toBe('road')
    resetUiForPhase('discard')
    expect(getPlacementMode()).toBe(null)
  })
})
