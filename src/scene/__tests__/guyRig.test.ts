import { describe, expect, it } from 'vitest'
import { BODY_X, GESTURES, JOINTS, SWING_KEYS, armWeight, skinWeights, swingArms, type V3 } from '../guyRig'

describe('mountain guy rig', () => {
  const mid = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
  it('binds points on the arm axis fully to the arm, upper arm vs forearm by the elbow', () => {
    for (const j of [JOINTS.right, JOINTS.left]) {
      const up = armWeight(mid(j.shoulder, j.elbow), j), fo = armWeight(mid(j.elbow, j.wrist), j)
      expect(up.arm).toBeGreaterThan(0.95); expect(up.fore).toBeLessThan(0.05)
      expect(fo.arm).toBeGreaterThan(0.95); expect(fo.fore).toBeGreaterThan(0.95)
    }
  })
  it('leaves the torso, the head, the legs and the pack alone', () => {
    const still: V3[] = [[BODY_X, 0.5, 0.2], [BODY_X + 0.1, 0.45, 0.2], [BODY_X, 0.85, 0.1], [-0.1, 0.15, 0.1], [-0.2, 0.5, -0.1], [0.22, 0.55, -0.05]]
    for (const p of still) expect(armWeight(p, p[0] < BODY_X ? JOINTS.right : JOINTS.left).arm).toBe(0)
  })
  it('writes normalised weights for every vertex', () => {
    const pos = [-0.23, 0.45, 0.13, 0, 0.5, 0.2, 0.2, 0.42, 0.13, -0.17, 0.66, 0.12]
    const { idx, w } = skinWeights(pos, 4)
    for (let i = 0; i < 4; i++) expect(w[i * 4] + w[i * 4 + 1] + w[i * 4 + 2] + w[i * 4 + 3]).toBeCloseTo(1)
    expect(idx[1]).toBe(1) // right shoulder
    expect(idx[9]).toBe(3) // left shoulder
  })
  it('swings rest → wound up → the blow', () => {
    expect(swingArms(0)).toEqual(SWING_KEYS.rest)
    expect(swingArms(1)).toEqual(SWING_KEYS.up)
    const h = swingArms(2); expect(h.r.a).toBeCloseTo(SWING_KEYS.hit.r.a); expect(h.l.b).toBeCloseTo(SWING_KEYS.hit.l.b); expect(h.cock).toBeCloseTo(SWING_KEYS.hit.cock)
    expect(swingArms(1.5).r.a).toBeCloseTo((SWING_KEYS.up.r.a + SWING_KEYS.hit.r.a) / 2)
    expect(GESTURES.cheer.r.a).toBeLessThan(-2.5) // arms up
  })
})
