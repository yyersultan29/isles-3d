import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { CLICK_LINES, GUY_FOOT, GUY_H, GUY_MODEL, GUY_SPOT, MOOD_S, ROCK_R, guyPose, guyReaction, pickLine, setGuyHitTest, type GuyAct, type GuyMood, type GuySpot } from './mountainGuyLogic'
import { pickaxeGeometry, rockGeometry } from './models'
import { BONE, GESTURES, JOINTS, SWING_KEYS, lerpArms, skinWeights, swingArms, type ArmsPose, type V3 } from './guyRig'
import { animTime, motion } from './motion'
import { useGame, useGameEvents } from '../store/GameProvider'

/**
 * The "mountain guy" (see mountainGuyLogic.ts for where he stands and how he idles). One mesh, one
 * material from public/models/mountain-guy.glb (GLTFLoader + meshopt decoder via drei's useGLTF;
 * no Draco, so nothing is fetched from a CDN). The model ships without a skeleton; guyRig.ts binds
 * its arms to a small procedural one (shoulders, elbows), so he swings the pick with both arms and
 * gestures in reactions. The idle is a whole-body bob, look-around turn and lean. Clicks hit an invisible capsule proxy, never the mesh itself.
 * He reacts to game events on his tile (guyReaction) and says a line in a bubble; a click gets a
 * random line. Between reactions he mines: bouts of pickaxe swings at an ore boulder beside him,
 * with stone chips on each blow. All of it only animates the view and never touches the game.
 * Mount inside its own <Suspense> so the island never waits for this file.
 */
export function MountainGuy() {
  return GUY_SPOT ? <Guy spot={GUY_SPOT} /> : null
}

const URL = import.meta.env.BASE_URL + GUY_MODEL
const BUBBLE_MS = 2800
const PICK_LEN = 0.21
/** The pick head's striking tip in the pick's own frame (handle along +y from the grip). */
const PICK_TIP = new THREE.Vector3(0, PICK_LEN - 0.02, 0.062)
/** Body pitch at the moment of the blow (mineCycle leans him into it). */
const HIT_PITCH = 0.14
const CHIPS = 10, CHIP_LIFE = 0.55, GRAVITY = 2.6
const at = (v: V3) => new THREE.Vector3(v[0], v[1], v[2]).multiplyScalar(GUY_H)

/** Bake the quantized glTF mesh into float attributes in the fitted frame (skinning needs plain positions). */
function bake(src: THREE.BufferGeometry, fit: THREE.Matrix4) {
  const g = new THREE.BufferGeometry()
  const p = src.attributes.position, n = src.attributes.normal, uv = src.attributes.uv
  const P = new Float32Array(p.count * 3), N = new Float32Array(p.count * 3), v = new THREE.Vector3()
  const nm = new THREE.Matrix3().getNormalMatrix(fit)
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(fit); P.set([v.x, v.y, v.z], i * 3)
    if (n) { v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); N.set([v.x, v.y, v.z], i * 3) }
  }
  g.setAttribute('position', new THREE.BufferAttribute(P, 3))
  if (n) g.setAttribute('normal', new THREE.BufferAttribute(N, 3))
  if (uv) { const U = new Float32Array(uv.count * 2); for (let i = 0; i < uv.count; i++) U.set([uv.getX(i), uv.getY(i)], i * 2); g.setAttribute('uv', new THREE.BufferAttribute(U, 2)) }
  if (src.index) g.setIndex(Array.from(src.index.array))
  // skin: positions in units of his height for guyRig
  const H = new Float32Array(P.length); for (let i = 0; i < P.length; i++) H[i] = P[i] / GUY_H
  const { idx, w } = skinWeights(H, p.count)
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4))
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(w, 4))
  return g
}

interface Rig { mesh: THREE.SkinnedMesh; rS: THREE.Bone; rE: THREE.Bone; lS: THREE.Bone; lE: THREE.Bone; pick: THREE.Group }
function poseRig(r: Rig, a: ArmsPose) {
  r.rS.rotation.set(a.r.a, 0, a.r.b, 'YXZ'); r.rE.rotation.x = a.r.e
  r.lS.rotation.set(a.l.a, 0, a.l.b, 'YXZ'); r.lE.rotation.x = a.l.e
  r.pick.rotation.x = a.cock
}

/** Ore boulder, pickaxe and chip meshes: built once, one vertex-coloured material for rock and pick. */
function buildProps(spot: GuySpot) {
  const rock = rockGeometry(17)
  rock.computeBoundingBox()
  const bb = rock.boundingBox!
  const rs = (ROCK_R * 2) / Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z)
  // dark slate with bright silvery-blue ore veins, so it stands out from the grey mountain around it
  const col = rock.attributes.color as THREE.BufferAttribute, pos = rock.attributes.position as THREE.BufferAttribute
  const slate = new THREE.Color('#4a4f5a'), ore = new THREE.Color('#e2f1ff'), c = new THREE.Color()
  for (let i = 0; i < col.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const vein = Math.abs(Math.sin(x * 9 + y * 14 - z * 6) + Math.sin(z * 11 - x * 4)) < 0.35
    c.fromBufferAttribute(col, i).multiply(slate).multiplyScalar(1.6)
    if (vein) c.lerp(ore, 0.85)
    col.setXYZ(i, c.r, c.g, c.b)
  }
  // the geometry's origin sits on the ground; its flat base already reaches a little below it
  const top = spot.rock.y - spot.y + bb.max.y * rs
  return {
    rock, rockScale: rs,
    pick: pickaxeGeometry(PICK_LEN), top,
    chip: new THREE.TetrahedronGeometry(0.009),
    mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.1 }),
    chipMat: new THREE.MeshStandardMaterial({ color: '#9a958d', roughness: 0.9 }),
    strike: new THREE.Vector3(spot.rock.x, spot.y + top, spot.rock.z),
  }
}
const noRaycast = () => {}

function Guy({ spot }: { spot: GuySpot }) {
  const gltf = useGLTF(URL, false, true)
  const gl = useThree((s) => s.gl)

  // the single mesh, its node transform (meshopt quantization lives there) and a fit to GUY_H, feet on y=0
  const model = useMemo(() => {
    let mesh: THREE.Mesh | undefined
    gltf.scene.updateMatrixWorld(true)
    gltf.scene.traverse((o) => { if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh })
    if (!mesh) throw new Error('mountain-guy.glb has no mesh')
    const box = new THREE.Box3().setFromObject(mesh)
    const s = GUY_H / (box.max.y - box.min.y)
    const fit = new THREE.Matrix4().makeScale(s, s, s)
      .premultiply(new THREE.Matrix4().makeTranslation(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s))
      .multiply(mesh.matrixWorld)
    const material = mesh.material as THREE.MeshStandardMaterial
    // colour spaces: base colour is sRGB, the data maps are linear (GLTFLoader sets this; kept explicit)
    if (material.map) { material.map.colorSpace = THREE.SRGBColorSpace; material.map.anisotropy = 4 }
    for (const t of [material.normalMap, material.roughnessMap, material.metalnessMap]) if (t) t.colorSpace = THREE.NoColorSpace
    return { geometry: bake(mesh.geometry, fit), source: mesh.geometry, material }
  }, [gltf])

  // free GPU memory when he leaves the scene, and drop the loader cache so a remount loads afresh.
  // Deferred one tick and skipped if the effect ran again meanwhile: StrictMode (dev) runs a
  // cleanup right after mount, and clearing the cache then made the next render suspend and remount.
  const props = useMemo(() => buildProps(spot), [spot])

  // the skeleton: root, then shoulder → elbow per arm, at the joints guyRig read off the model;
  // the pick rides in the right hand. Bound with the mesh at the origin (bindMode 'attached').
  const rig = useMemo<Rig>(() => {
    const J = JOINTS
    const root = new THREE.Bone(), rS = new THREE.Bone(), rE = new THREE.Bone(), lS = new THREE.Bone(), lE = new THREE.Bone()
    rS.position.copy(at(J.right.shoulder)); rE.position.copy(at(J.right.elbow)).sub(at(J.right.shoulder))
    lS.position.copy(at(J.left.shoulder)); lE.position.copy(at(J.left.elbow)).sub(at(J.left.shoulder))
    root.add(rS, lS); rS.add(rE); lS.add(lE)
    const bones: THREE.Bone[] = []
    bones[BONE.root] = root; bones[BONE.rShoulder] = rS; bones[BONE.rElbow] = rE; bones[BONE.lShoulder] = lS; bones[BONE.lElbow] = lE
    const mesh = new THREE.SkinnedMesh(model.geometry, model.material)
    mesh.add(root)
    mesh.updateMatrixWorld(true)
    mesh.bind(new THREE.Skeleton(bones), new THREE.Matrix4())
    mesh.castShadow = mesh.receiveShadow = true
    mesh.frustumCulled = false // raised arms leave the bind-pose bounds; one small mesh
    mesh.raycast = noRaycast
    const pick = new THREE.Group()
    pick.position.copy(at(J.right.hand)).sub(at(J.right.elbow))
    const pm = new THREE.Mesh(props.pick, props.mat); pm.castShadow = true; pm.raycast = noRaycast
    pick.add(pm); rE.add(pick)
    return { mesh, rS, rE, lS, lE, pick }
  }, [model, props])

  // the blow: search the shoulder raise, elbow bend and wrist cock that put the pick's point on the
  // boulder's top (he faces it while working, so it lies straight ahead, at +z). The boulder is close,
  // so the natural answer is a chop: arms reaching ahead, elbows bent, the head coming down steeply.
  // Among the poses that land, prefer arms well forward (a ≈ −0.9) over arms hanging at his sides.
  const hitPose = useMemo<ArmsPose>(() => {
    const lean = new THREE.Matrix4().makeRotationX(HIT_PITCH), tip = new THREE.Vector3()
    const ahead = Math.hypot(spot.rock.x - spot.x, spot.rock.z - spot.z) - ROCK_R * 0.25
    const H = SWING_KEYS.hit
    const pose = (a: number, cock: number, e = H.r.e): ArmsPose => ({ cock, r: { ...H.r, a, e }, l: { ...H.l, a, e } })
    let best = pose(H.r.a, H.cock), bestErr = Infinity
    for (let i = 0; i <= 32; i++) for (let k = 0; k <= 7; k++) for (let j = 0; j <= 32; j++) {
      const a = -1.5 + (i / 32) * 1.5, e = -0.05 - (k / 7) * 0.85, cock = 1.4 + (j / 32) * 3, theta = a + e + cock
      if (theta < 1.3 || theta > 2.9) continue
      poseRig(rig, pose(a, cock, e)); rig.mesh.updateMatrixWorld(true)
      rig.mesh.worldToLocal(tip.copy(PICK_TIP).applyMatrix4(rig.pick.matrixWorld)).applyMatrix4(lean)
      const dz = Math.max(0, Math.abs(tip.z - ahead) - ROCK_R * 0.4) // anywhere on the boulder's top
      const err = (tip.y - props.top - 0.004) ** 2 * 4 + dz ** 2 + (a + 0.9) ** 2 * 0.0004
      if (err < bestErr) { bestErr = err; best = pose(a, cock, e) }
    }
    poseRig(rig, SWING_KEYS.rest)
    if (import.meta.env.DEV) Object.assign(window as unknown as { __guyHit?: object }, { __guyHit: { ...best, err: Math.sqrt(bestErr) } })
    return best
  }, [rig, props, spot])
  const mounts = useRef(0)
  useEffect(() => {
    const id = ++mounts.current
    return () => {
      setTimeout(() => {
        if (mounts.current !== id) return
        const m = model.material
        for (const t of new Set([m.map, m.normalMap, m.roughnessMap, m.metalnessMap])) t?.dispose()
        m.dispose()
        model.geometry.dispose(); model.source.dispose()
        rig.mesh.skeleton.dispose()
        useGLTF.clear(URL)
        for (const x of [props.rock, props.pick, props.chip, props.mat, props.chipMat]) x.dispose()
      }, 0)
    }
  }, [model, props, rig])

  // current reaction: started at `t0` (ms); the pose reads it every frame, no React state
  const body = useRef<THREE.Group>(null)
  const act = useRef<{ mood: GuyMood | null; t0: number; lookYaw?: number }>({ mood: null, t0: 0 })
  const robberHere = useGame((s) => s.robber) === spot.tile.axial
  const shiver = useRef(robberHere)
  shiver.current = robberHere
  const pose: GuyAct = { mood: null, s: 0 }
  const chipsRef = useRef<THREE.InstancedMesh>(null)
  // work: 1 while mining, eased to 0 during a reaction or while the robber is on his tile
  const work = useRef(1)
  const strikes = useRef(-1)
  const chips = useMemo(() => Array.from({ length: CHIPS }, () => ({ t: -1, p: new THREE.Vector3(), v: new THREE.Vector3(), r: 0 })), [])
  const o = useMemo(() => new THREE.Object3D(), [])
  useFrame((_, dt) => {
    const g = body.current
    if (!g) return
    const a = act.current, now = performance.now()
    pose.mood = a.mood; pose.s = (now - a.t0) / 1000; pose.lookYaw = a.lookYaw
    const busy = shiver.current || (a.mood !== null && pose.s < MOOD_S[a.mood] + 0.3)
    work.current += ((busy ? 0 : 1) - work.current) * Math.min(1, dt * 5)
    const p = guyPose(animTime.value, pose, motion.reduced, shiver.current, work.current, spot.rock.faceYaw)
    g.position.y = p.y
    g.rotation.set(p.pitch, p.yaw, p.lean, 'YXZ')
    g.scale.set(1, p.squash, 1)
    const arms = swingArms(p.pick, hitPose)
    poseRig(rig, p.arms ? lerpArms(arms, GESTURES[p.arms], p.armsK) : arms)
    // a blow landed: a burst of stone chips (none under reduced motion)
    if (strikes.current >= 0 && p.strikes > strikes.current && work.current > 0.6 && !motion.reduced) {
      let n = 0
      for (const c of chips) {
        if (c.t >= 0 || n >= 5) continue
        n++
        const ang = Math.random() * Math.PI * 2, sp = 0.25 + Math.random() * 0.35
        c.t = 0; c.r = Math.random() * 6
        c.p.copy(props.strike)
        c.v.set(Math.cos(ang) * sp * 0.6, 0.55 + Math.random() * 0.45, Math.sin(ang) * sp * 0.6)
      }
    }
    strikes.current = p.strikes
    const im = chipsRef.current
    if (im) {
      for (let i = 0; i < CHIPS; i++) {
        const c = chips[i]
        if (c.t >= 0) {
          c.t += dt
          c.v.y -= GRAVITY * dt
          c.p.addScaledVector(c.v, dt)
          if (c.t > CHIP_LIFE) c.t = -1
        }
        o.position.copy(c.p)
        o.rotation.set(c.r + (c.t > 0 ? c.t * 9 : 0), c.r, 0)
        o.scale.setScalar(c.t >= 0 ? 1 - (c.t / CHIP_LIFE) ** 3 : 0)
        o.updateMatrix()
        im.setMatrixAt(i, o.matrix)
      }
      im.instanceMatrix.needsUpdate = true
    }
  })

  // speech bubble: one line at a time, gone after BUBBLE_MS
  const [bubble, setBubble] = useState<{ id: number; text: string } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const say = (text: string) => {
    const id = performance.now()
    setBubble({ id, text })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setBubble(null), BUBBLE_MS)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  const react = (mood: GuyMood, text: string, lookAt?: [number, number]) => {
    // look: the yaw toward the target, relative to his rest facing (the model faces +z)
    const lookYaw = lookAt ? Math.atan2(lookAt[0] - spot.x, lookAt[1] - spot.z) - spot.yaw : undefined
    act.current = { mood, t0: performance.now(), lookYaw }
    say(text)
  }
  if (import.meta.env.DEV) Object.assign(window as unknown as { __guyReact?: typeof react }, { __guyReact: react })
  useGameEvents((events, s) => {
    const r = guyReaction(events, s, spot.tile.axial)
    if (r) react(r.mood, r.say, r.lookAt)
  })
  const lastLine = useRef(-1)

  // the proxy answers Placement's "did this click hit him?" (see setGuyHitTest)
  const proxy = useRef<THREE.Mesh>(null)
  useEffect(() => {
    const rc = new THREE.Raycaster(), hits: THREE.Intersection[] = []
    setGuyHitTest((ray) => {
      const m = proxy.current
      if (!m) return false
      rc.ray.copy(ray); hits.length = 0
      m.raycast(rc, hits)
      return hits.length > 0
    })
    return () => setGuyHitTest(null)
  }, [])

  // pointer cursor over the proxy (set on every move: Placement clears it on its own moves first)
  const setCursor = (on: boolean) => { gl.domElement.style.cursor = on ? 'pointer' : '' }
  useEffect(() => () => { gl.domElement.style.cursor = '' }, [gl])
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    const lines = CLICK_LINES()
    lastLine.current = pickLine(lines, lastLine.current)
    react('click', lines[lastLine.current])
  }

  return (
    <>
    {/* the ore boulder he works on */}
    <mesh geometry={props.rock} material={props.mat} position={[spot.rock.x, spot.rock.y - 0.005, spot.rock.z]} scale={props.rockScale} rotation-y={1.3} castShadow receiveShadow raycast={noRaycast} />
    <instancedMesh ref={chipsRef} args={[props.chip, props.chipMat, CHIPS]} frustumCulled={false} raycast={noRaycast} />
    <group position={[spot.x, spot.y - 0.004, spot.z]} rotation-y={spot.yaw} userData={{ piece: 'mountain-guy' }}>
      <group ref={body}>
        <primitive object={rig.mesh} />
      </group>
      {/* click target: an invisible capsule around him (material.visible=false: raycastable, never drawn) */}
      <mesh
        ref={proxy}
        position-y={GUY_H / 2}
        onClick={onClick}
        onPointerMove={(e) => { e.stopPropagation(); setCursor(true) }}
        onPointerOut={() => setCursor(false)}
      >
        <capsuleGeometry args={[GUY_FOOT, GUY_H - GUY_FOOT * 2, 2, 8]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      {bubble && (
        <Html position={[0, GUY_H + 0.1, 0]} center zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}>
          <div key={bubble.id} aria-hidden data-guy-bubble className="relative -translate-y-1/2 w-max max-w-[190px] rounded-[12px] bg-[#fbf6ea] px-[10px] py-[5px] text-center font-ui text-[13px] font-semibold leading-snug text-[#2a231b] shadow-[0_4px_14px_rgba(0,0,0,.45)] ring-1 ring-[#c9a45c]/70 [animation:notice-in_.18s_ease-out]">
            {bubble.text}
            <span className="absolute left-1/2 top-full -ml-[6px] h-0 w-0 border-x-[6px] border-t-[7px] border-x-transparent border-t-[#fbf6ea]" />
          </div>
        </Html>
      )}
    </group>
    </>
  )
}
