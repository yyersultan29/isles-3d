/// <reference types="node" />
// G5.7: the host's build script pins its own esbuild and ws; they must match the project's.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8')

describe('server build for the host', () => {
  it('build-server.sh uses the same ws and esbuild as the project', () => {
    const script = read('scripts/build-server.sh')
    const pin = (k: string) => script.match(new RegExp(`^${k}=(\\S+)$`, 'm'))?.[1]
    const pkg = JSON.parse(read('package.json'))
    expect(pkg.devDependencies.ws.replace(/^\^/, '')).toBe(pin('WS'))
    expect(JSON.parse(read('node_modules/esbuild/package.json')).version).toBe(pin('ESBUILD'))
  })

  it('render.yaml builds with that script and starts the bundle', () => {
    const y = read('render.yaml')
    expect(y).toContain('buildCommand: bash scripts/build-server.sh')
    expect(y).toContain('startCommand: node server-dist/main.mjs')
  })
})
