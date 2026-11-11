// G1.1: src/game stays pure — no rendering/UI imports, no nondeterminism.
import { describe, expect, it } from 'vitest'

const sources = import.meta.glob(['../**/*.ts', '!../__tests__/**'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>

describe('engine boundary', () => {
  it('finds the engine sources', () => {
    expect(Object.keys(sources).length).toBeGreaterThanOrEqual(8)
  })
  it.each(Object.entries(sources))('%s has no forbidden imports', (_file, src) => {
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])
    for (const spec of imports) {
      expect(spec).not.toMatch(/^(react|react-dom|three|@react-three\/|gsap)/)
      expect(spec).not.toMatch(/(^|\/)(scene|ui)\//)
      expect(spec).not.toMatch(/^node:/)
    }
  })
  it.each(Object.entries(sources))('%s has no nondeterministic calls', (_file, src) => {
    const code = src.replace(/\/\/.*$/gm, '')
    expect(code).not.toMatch(/Math\.random|Date\.now|new Date\(|performance\.now|toLocale/)
  })
})
