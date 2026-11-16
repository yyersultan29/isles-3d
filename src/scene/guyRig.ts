// A small procedural rig for the mountain guy (the Hyper3D model ships without a skeleton).
// Bones: root (torso, legs, head, backpack), and per arm a shoulder and an elbow. Each vertex is
// bound by distance to the arm's bone chain, inside a sleeve-sized envelope, and only outside the
// torso's sides, so the jacket and the belt pouches stay put while the sleeves move. Weights blend
// over a short distance at the armpit and the elbow so nothing tears. Pure math, no three.js
// objects: MountainGuy.tsx builds the SkinnedMesh from these numbers.
//
// Coordinates are in units of the model's height (H = 1), feet at y = 0, the bounding box centred
// in x and z, facing +z. His right arm is on -x. Joints were read off front and side orthographic
// renders of public/models/mountain-guy.glb with a 0.05 grid.

export type V3 = readonly [number, number, number]
export interface ArmJoints { shoulder: V3; elbow: V3; wrist: V3; hand: V3; torso: number }

/** x of the body's centre line (the bounding box is off-centre: the ice axe on the pack sticks out to +x). */
export const BODY_X = -0.02
export const JOINTS: { right: ArmJoints; left: ArmJoints } = {
  right: { shoulder: [-0.175, 0.685, 0.12], elbow: [-0.228, 0.5, 0.127], wrist: [-0.23, 0.35, 0.15], hand: [-0.23, 0.29, 0.155], torso: 0.15 },
  left: { shoulder: [0.13, 0.685, 0.12], elbow: [0.205, 0.5, 0.127], wrist: [0.195, 0.35, 0.15], hand: [0.193, 0.29, 0.155], torso: 0.155 },
}
/** Bone order in the skeleton. */
export const BONE = { root: 0, rShoulder: 1, rElbow: 2, lShoulder: 3, lElbow: 4 } as const

/** Sleeve radius around the arm axis, and the blend beyond it. */
const R_ARM = 0.05, R_BLEND = 0.02
/** Vertices behind this z are the pack and the ice axe on it: never part of an arm. */
const Z_FRONT = 0.03

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
function segDist(p: V3, a: V3, b: V3) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]]
  const t = Math.min(1, Math.max(0, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2)))
  return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t)
}

/** How much a point (H units) belongs to an arm, and how much of that to the forearm. */
export function armWeight(p: V3, j: ArmJoints) {
  if (p[2] < Z_FRONT) return { arm: 0, fore: 0 }
  const d = Math.min(segDist(p, j.shoulder, j.elbow), segDist(p, j.elbow, j.hand))
  let arm = 1 - smooth(R_ARM, R_ARM + R_BLEND, d)
  arm *= smooth(j.torso - 0.015, j.torso + 0.02, Math.abs(p[0] - BODY_X)) // the jacket's sides stay with the torso
  arm *= smooth(j.shoulder[1] + 0.03, j.shoulder[1] - 0.06, p[1]) // the shoulder cap stays attached
  arm *= smooth(j.hand[1] - 0.09, j.hand[1] - 0.05, p[1]) // fingertips are the lowest arm part
  const fore = smooth(j.elbow[1] + 0.03, j.elbow[1] - 0.03, p[1])
  return { arm, fore }
}

/**
 * Skin indices and weights (4 per vertex, three.js layout) for positions in H units.
 * Each vertex gets the root plus at most the two bones of one arm.
 */
export function skinWeights(pos: ArrayLike<number>, count: number) {
  const idx = new Uint16Array(count * 4), w = new Float32Array(count * 4)
  for (let i = 0; i < count; i++) {
    const p: V3 = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]
    const right = p[0] < BODY_X
    const { arm, fore } = armWeight(p, right ? JOINTS.right : JOINTS.left)
    idx[i * 4] = BONE.root; w[i * 4] = 1 - arm
    idx[i * 4 + 1] = right ? BONE.rShoulder : BONE.lShoulder; w[i * 4 + 1] = arm * (1 - fore)
    idx[i * 4 + 2] = right ? BONE.rElbow : BONE.lElbow; w[i * 4 + 2] = arm * fore
  }
  return { idx, w }
}

// ---------- arm poses ----------
// Shoulder: `a` raises the arm forward (0 hangs down, −π/2 points ahead, −π straight up), `b` swings
// the hanging arm toward the body's centre line (positive brings the right hand in, negative the
// left), applied before the raise so the hands stay together on the way up. Elbow: `e` bends the
// forearm forward (negative). Euler order 'YXZ' on the bones does exactly this.

export interface ArmPose { a: number; b: number; e: number }
/**
 * `cock`: the pick's angle in the right hand, about the same axis. The handle's direction in his
 * body frame is then (0, cos θ, sin θ) with θ = r.a + r.e + cock: θ = 0 points up, π/2 straight
 * ahead, below that behind him. The head's point faces θ + π/2 (down when the handle points ahead).
 */
export interface ArmsPose { r: ArmPose; l: ArmPose; cock: number }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lerpArm = (x: ArmPose, y: ArmPose, t: number): ArmPose => ({ a: lerp(x.a, y.a, t), b: lerp(x.b, y.b, t), e: lerp(x.e, y.e, t) })
export const lerpArms = (x: ArmsPose, y: ArmsPose, t: number): ArmsPose => ({ r: lerpArm(x.r, y.r, t), l: lerpArm(x.l, y.l, t), cock: lerp(x.cock, y.cock, t) })

/** Mining keyframes. HIT's shoulder angle is solved per spot so the pick tip meets the boulder (see MountainGuy). */
export const SWING_KEYS = {
  // held low in front, handle pointing ahead and a little down (θ ≈ 1.9)
  rest: { r: { a: -0.22, b: 0.06, e: -0.45 }, l: { a: -0.08, b: -0.04, e: -0.2 }, cock: 2.57 },
  // wound up: hands above and behind his head, elbows bent, the handle hanging back (θ ≈ −2)
  up: { r: { a: -2.45, b: 0.3, e: -0.95 }, l: { a: -2.45, b: -0.34, e: -0.95 }, cock: 1.4 },
  // the blow: arms and handle reach ahead and down; `a` and `cock` are solved per spot (MountainGuy)
  hit: { r: { a: -0.8, b: 0.32, e: -0.08 }, l: { a: -0.8, b: -0.37, e: -0.08 }, cock: 2.8 },
} satisfies Record<string, ArmsPose>

/** Arms for swing phase u (0 rest, 1 wound up over the head, 2 the blow; see mineCycle). */
export function swingArms(u: number, hit: ArmsPose = SWING_KEYS.hit): ArmsPose {
  if (u <= 1) return lerpArms(SWING_KEYS.rest, SWING_KEYS.up, Math.max(0, u))
  return lerpArms(SWING_KEYS.up, hit, Math.min(1, u - 1))
}

/** Reaction gestures, blended over the mining arms by `k` (0..1). */
export const GESTURES = {
  cheer: { r: { a: -2.9, b: -0.35, e: -0.2 }, l: { a: -2.9, b: 0.35, e: -0.2 }, cock: 3.1 }, // both arms up, pick raised high
  scared: { r: { a: -1.35, b: 0.25, e: -1.1 }, l: { a: -1.35, b: -0.25, e: -1.1 }, cock: 2.45 }, // hands up in front, pick upright
  sad: { r: { a: 0.05, b: 0, e: -0.05 }, l: { a: 0.05, b: 0, e: -0.05 }, cock: 2.9 }, // arms hang, pick dangling
} satisfies Record<string, ArmsPose>
