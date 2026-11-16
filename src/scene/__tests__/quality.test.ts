import { describe, expect, it } from 'vitest'
import { AUTO_MIN_FPS, AUTO_SAMPLE_S, DEFAULT_SETTING, autoStepDown, autoVerdict, graphicsSetting, quality, setGraphics } from '../quality'

describe('graphics setting', () => {
  it('defaults to the signed-off high look', () => {
    expect(DEFAULT_SETTING).toBe('high')
    expect(quality.name).toBe('high')
  })
  it('Auto judges only after enough full-rate time', () => {
    expect(autoVerdict({ frames: 100, seconds: AUTO_SAMPLE_S - 0.1 })).toBe('wait')
    expect(autoVerdict({ frames: 60 * AUTO_SAMPLE_S, seconds: AUTO_SAMPLE_S })).toBe('ok')
    expect(autoVerdict({ frames: (AUTO_MIN_FPS - 4) * AUTO_SAMPLE_S, seconds: AUTO_SAMPLE_S })).toBe('down')
  })
  it('Auto steps down once to medium, never further, and only in Auto', () => {
    expect(autoStepDown()).toBe(false) // setting is 'high'
    setGraphics('auto')
    expect(graphicsSetting()).toBe('auto')
    expect(quality.name).toBe('high')
    expect(autoStepDown()).toBe(true)
    expect(quality.name).toBe('medium')
    expect(autoStepDown()).toBe(false)
    setGraphics('low'); expect(quality.name).toBe('low')
    setGraphics('auto'); expect(quality.name).toBe('high') // re-picking Auto measures again
    setGraphics('high')
  })
})
