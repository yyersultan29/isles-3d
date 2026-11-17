import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { CLICK_LINES, GUY_FOOT, GUY_H, GUY_MODEL, GUY_SPOT, ROCK_R, guyPose, guyReaction, pickLine, setGuyHitTest, type GuyAct, type GuyMood, type GuySpot } from './mountainGuyLogic'
import { rockGeometry } from './models'
import { animTime, motion } from './motion'
import { useGame, useGameEvents } from '../store/GameProvider'

/**
 * The "mountain guy" (see mountainGuyLogic.ts for where he stands and how he idles). One mesh, one
 * material from public/models/mountain-guy.glb (GLTFLoader + meshopt decoder via drei's useGLTF;
 * no Draco, so nothing is fetched from a CDN). The model has no skeleton: the idle is a whole-body
 * bob, look-around turn and lean. Clicks hit an invisible capsule proxy, never the mesh itself.
 * He reacts to game events on his tile (guyReaction) and says a line in a bubble; a click gets a
 * random line. Between reactions he shifts his weight from foot to foot and looks around, beside an
 * ore boulder. All of it only animates the view and never touches the game.
 * Mount inside its own <Suspense> so the island never waits for this file.
 */
export function MountainGuy() {
  return GUY_SPOT ? <Guy spot={GUY_SPOT} /> : null
}

const URL = import.meta.env.BASE_URL + GUY_MODEL
const BUBBLE_MS = 2800
/** The ore boulder beside him: built once, vertex-coloured. */
function buildProps() {
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
  return { rock, rockScale: rs, mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.1 }) }
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
    return { geometry: mesh.geometry, material, fit }
  }, [gltf])

  // free GPU memory when he leaves the scene, and drop the loader cache so a remount loads afresh.
  // Deferred one tick and skipped if the effect ran again meanwhile: StrictMode (dev) runs a
  // cleanup right after mount, and clearing the cache then made the next render suspend and remount.
  const props = useMemo(() => buildProps(), [])
  const mounts = useRef(0)
  useEffect(() => {
    const id = ++mounts.current
    return () => {
      setTimeout(() => {
        if (mounts.current !== id) return
        const m = model.material
        for (const t of new Set([m.map, m.normalMap, m.roughnessMap, m.metalnessMap])) t?.dispose()
        m.dispose()
        model.geometry.dispose()
        useGLTF.clear(URL)
        for (const x of [props.rock, props.mat]) x.dispose()
      }, 0)
    }
  }, [model, props])

  // current reaction: started at `t0` (ms); the pose reads it every frame, no React state
  const body = useRef<THREE.Group>(null)
  const act = useRef<{ mood: GuyMood | null; t0: number; lookYaw?: number }>({ mood: null, t0: 0 })
  const robberHere = useGame((s) => s.robber) === spot.tile.axial
  const shiver = useRef(robberHere)
  shiver.current = robberHere
  const pose: GuyAct = { mood: null, s: 0 }
  useFrame(() => {
    const g = body.current
    if (!g) return
    const a = act.current
    pose.mood = a.mood; pose.s = (performance.now() - a.t0) / 1000; pose.lookYaw = a.lookYaw
    const p = guyPose(animTime.value, pose, motion.reduced, shiver.current)
    g.position.set(p.x, p.y, 0)
    g.rotation.set(p.pitch, p.yaw, p.lean, 'YXZ')
    g.scale.set(1, p.squash, 1)
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
    {/* an ore boulder beside him */}
    <mesh geometry={props.rock} material={props.mat} position={[spot.rock.x, spot.rock.y - 0.005, spot.rock.z]} scale={props.rockScale} rotation-y={1.3} castShadow receiveShadow raycast={noRaycast} />
    <group position={[spot.x, spot.y - 0.004, spot.z]} rotation-y={spot.yaw} userData={{ piece: 'mountain-guy' }}>
      <group ref={body}>
        <mesh geometry={model.geometry} material={model.material} matrix={model.fit} matrixAutoUpdate={false} castShadow receiveShadow raycast={noRaycast} />
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
