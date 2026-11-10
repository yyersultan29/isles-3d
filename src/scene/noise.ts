// Small, dependency-free 2D simplex noise + helpers (seeded).

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const F2 = 0.5 * (Math.sqrt(3) - 1)
const G2 = (3 - Math.sqrt(3)) / 6
const grad = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
]

function buildPerm(seed: number) {
  const rnd = mulberry32(seed)
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    const t = p[i]; p[i] = p[j]; p[j] = t
  }
  const perm = new Uint8Array(512)
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]
  return perm
}

const perm = buildPerm(1337)

export function noise2(xin: number, yin: number): number {
  const s = (xin + yin) * F2
  const i = Math.floor(xin + s)
  const j = Math.floor(yin + s)
  const t = (i + j) * G2
  const x0 = xin - (i - t)
  const y0 = yin - (j - t)
  const i1 = x0 > y0 ? 1 : 0
  const j1 = x0 > y0 ? 0 : 1
  const x1 = x0 - i1 + G2
  const y1 = y0 - j1 + G2
  const x2 = x0 - 1 + 2 * G2
  const y2 = y0 - 1 + 2 * G2
  const ii = i & 255
  const jj = j & 255
  let n0 = 0, n1 = 0, n2 = 0
  let t0 = 0.5 - x0 * x0 - y0 * y0
  if (t0 > 0) {
    const g = grad[perm[ii + perm[jj]] & 7]
    t0 *= t0
    n0 = t0 * t0 * (g[0] * x0 + g[1] * y0)
  }
  let t1 = 0.5 - x1 * x1 - y1 * y1
  if (t1 > 0) {
    const g = grad[perm[ii + i1 + perm[jj + j1]] & 7]
    t1 *= t1
    n1 = t1 * t1 * (g[0] * x1 + g[1] * y1)
  }
  let t2 = 0.5 - x2 * x2 - y2 * y2
  if (t2 > 0) {
    const g = grad[perm[ii + 1 + perm[jj + 1]] & 7]
    t2 *= t2
    n2 = t2 * t2 * (g[0] * x2 + g[1] * y2)
  }
  return 70 * (n0 + n1 + n2) // ~[-1, 1]
}

export function fbm(x: number, y: number, oct = 4, lac = 2, gain = 0.5) {
  let a = 1, f = 1, s = 0, n = 0
  for (let i = 0; i < oct; i++) {
    s += a * noise2(x * f, y * f)
    n += a
    a *= gain
    f *= lac
  }
  return s / n
}

export function ridged(x: number, y: number, oct = 4) {
  let a = 0.5, f = 1, s = 0
  for (let i = 0; i < oct; i++) {
    const n = 1 - Math.abs(noise2(x * f, y * f))
    s += a * n * n
    a *= 0.5
    f *= 2.03
  }
  return s
}

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
