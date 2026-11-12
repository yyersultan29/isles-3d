// G4.5c: the production tags add up to exactly what the engine paid out on every roll.
import { describe, expect, it } from 'vitest'
import { apply, createGame, RESOURCE_ORDER, type ReplayFile, type Resource } from '../../game'
import { productionTags } from '../production'

describe('G4.5c production tags', () => {
  const files = import.meta.glob('../../game/__tests__/golden/*.json', { eager: true, import: 'default' }) as Record<string, ReplayFile>

  it('match the engine’s RESOURCES_PRODUCED on every golden roll', () => {
    let rolls = 0, tagged = 0
    for (const f of Object.values(files)) {
      const g = createGame(f.settings)
      if (!g.ok) throw new Error('createGame')
      let s = g.state
      for (const { player, action } of f.actions) {
        const r = apply(s, player, action)
        if (!r.ok) throw new Error(r.error.code)
        s = r.state
        const dice = r.events.find((e) => e.type === 'DICE_ROLLED')
        const prod = r.events.find((e) => e.type === 'RESOURCES_PRODUCED')
        if (!dice || dice.type !== 'DICE_ROLLED' || !prod || prod.type !== 'RESOURCES_PRODUCED') continue
        rolls++
        const tags = productionTags(s, dice.dice[0] + dice.dice[1], prod.shortfall)
        tagged += tags.length
        const fromTags: Partial<Record<Resource, number>> = {}
        for (const t of tags) fromTags[t.res] = (fromTags[t.res] ?? 0) + t.n
        const paid: Partial<Record<Resource, number>> = {}
        for (const g2 of Object.values(prod.gains)) for (const res of RESOURCE_ORDER) if (g2?.[res]) paid[res] = (paid[res] ?? 0) + g2[res]!
        for (const res of RESOURCE_ORDER) if (!prod.shortfall.includes(res)) expect(fromTags[res] ?? 0).toBe(paid[res] ?? 0)
        for (const t of tags) expect(t.tile).not.toBe(s.robber)
      }
    }
    expect(rolls).toBeGreaterThan(100)
    expect(tagged).toBeGreaterThan(50)
  })
})
