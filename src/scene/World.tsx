import { Suspense, useEffect, useLayoutEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Environment, Lightformer } from '@react-three/drei'
import { EffectComposer, Bloom, N8AO, Vignette, ToneMapping, HueSaturation, BrightnessContrast, SMAA } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Terrain } from './Terrain'
import { Island } from './Island'
import { Ocean } from './Ocean'
import { Vegetation } from './Vegetation'
import { Tokens, Robber, Buildings } from './Pieces'
import { Harbors, harborSignTops } from './Harbors'
import { VERTICES, islandRadius, BOARD_MODE } from './board'
import { Ships } from './Ships'
import { Scenery } from './Scenery'
import { Smoke } from './Smoke'
import { isCompact, COMPACT_SAFE } from '../ui/layout'
import { CameraInteraction, setHome, applyViewPreset } from './CameraInteraction'
import { TileHover } from './TileHover'
import { Placement } from './Placement'
import { quality } from './quality'
import { motion } from './motion'
import { ContextLossGuard } from './SceneGuard'

// Debug override: ?cam=x,y,z&tgt=x,y,z
const qp = new URLSearchParams(window.location.search)
const vec = (k: string) => qp.get(k)?.split(',').map(Number) as [number, number, number] | undefined
export const CAMERA_POS: [number, number, number] = vec('cam') ?? [0.12, 9.15, 10.05]
export const CAMERA_TARGET: [number, number, number] = vec('tgt') ?? [0.3, -0.35, 0.62]

/**
 * Auto-framing: keeps the camera angle fixed and solves for distance and pan so the board fills
 * the screen area not covered by the HUD. This runs on mount and on every resize.
 *  - Horizontal and bottom limits come from the board's hex vertices.
 *  - The top limit comes from the harbour signs, so they never clip.
 *  - The left HUD column and the right column (player cards, dice, build panel) are kept clear.
 * A `?cam=` URL override disables auto-framing.
 */
const FOV = 30
const ELEVATION = THREE.MathUtils.degToRad(43) // reference view is slightly flatter than 45°
const AZIMUTH = -0.019
const VIEW_DIR = new THREE.Vector3(Math.sin(AZIMUTH) * Math.cos(ELEVATION), Math.sin(ELEVATION), Math.cos(AZIMUTH) * Math.cos(ELEVATION))
// HUD geometry in its 1600x904 logical space (see src/ui/HUD.tsx)
const HUD_W = 1600, HUD_H = 904
const SAFE = { left: 22, right: 266, top: 4, bottom: 106, navW: 182, navH: 340, rimLeft: -60 }
const BOARD_PTS = VERTICES.map(([x, z]) => new THREE.Vector3(x, 0.05, z))
const SIGN_PTS = harborSignTops().map(([x, y, z]) => new THREE.Vector3(x, y, z))
// island cliff top outline + the west harbour signs: must stay on screen on the left (they may pass under the right HUD)
const RIM_PTS = [
  ...Array.from({ length: 72 }, (_, i) => {
    const th = (i / 72) * Math.PI * 2
    const r = islandRadius(th) + 0.05
    return new THREE.Vector3(Math.cos(th) * r, -0.05, Math.sin(th) * r)
  }),
]
// left edge of the west harbour signs (sign half-width ≈ 0.22 × SIGN_SCALE, plus the post)
const WEST_SIGN_PTS = SIGN_PTS.filter((v) => v.x < -3).map((v) => v.clone().add(new THREE.Vector3(-0.4, -0.3, 0)))
// compact layout: every harbour sign (both edges) must stay fully on screen
const ALL_SIGN_PTS = SIGN_PTS.flatMap((v) => [v.clone().add(new THREE.Vector3(-0.4, 0, 0)), v.clone().add(new THREE.Vector3(0.4, 0, 0))])
// sign posts reach the pier deck ~0.47×SIGN_SCALE below the sign top
const SIGN_FEET = SIGN_PTS.map((v) => v.clone().add(new THREE.Vector3(0, -0.5, 0)))
const DEFAULT_MAX_DIST = 22
const DEFAULT_FOG: [number, number] = [17, 40]

function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null
  const scene = useThree((s) => s.scene)
  useLayoutEffect(() => {
    if (vec('cam')) return
    const w = size.width, h = size.height
    if (isCompact(w, h)) {
      fitCompact(camera, w, h, controls, scene)
      return
    }
    if (scene.fog instanceof THREE.Fog) [scene.fog.near, scene.fog.far] = DEFAULT_FOG
    const s = Math.min(w / HUD_W, h / HUD_H)
    const right = w - SAFE.right * s, top = SAFE.top * s, bottom = h - SAFE.bottom * s
    camera.fov = FOV
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    const target = new THREE.Vector3(0.3, -0.35, 0.3)
    let dist = 13.6
    const p = new THREE.Vector3(), camRight = new THREE.Vector3(), camUp = new THREE.Vector3()
    const toPx = (v: THREE.Vector3) => { p.copy(v).project(camera); return [(p.x * 0.5 + 0.5) * w, (-p.y * 0.5 + 0.5) * h] }
    for (let it = 0; it < 12; it++) {
      camera.position.copy(target).addScaledVector(VIEW_DIR, dist)
      camera.lookAt(target)
      camera.updateMatrixWorld()
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      const board = BOARD_PTS.map(toPx)
      for (const [x, y] of board) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); minY = Math.min(minY, y) }
      for (const v of SIGN_PTS) minY = Math.min(minY, toPx(v)[1])
      // G4.2b: every harbour sign (both edges, and its foot) stays inside the safe area, clear of the side and bottom HUD
      for (const v of ALL_SIGN_PTS) { const [x, y] = toPx(v); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y) }
      for (const v of SIGN_FEET) maxY = Math.max(maxY, toPx(v)[1])
      // the left edge must clear the nav panel wherever the board reaches up beside it
      const rim = RIM_PTS.map(toPx)
      const signs = WEST_SIGN_PTS.map(toPx)
      for (const [x] of [...rim, ...signs]) minX = Math.min(minX, x)
      let left = SAFE.left * s
      for (const [x, y] of board) if (y < SAFE.navH * s) left = Math.max(left, SAFE.navW * s - (x - minX))
      for (const [x] of rim) left = Math.max(left, SAFE.rimLeft * s - (x - minX))
      for (const [x, y] of signs) left = Math.max(left, (y < SAFE.navH * s ? SAFE.navW : 6) * s - (x - minX))
      const k = Math.max((maxX - minX) / (right - left), (maxY - minY) / (bottom - top))
      const dx = (left + right) / 2 - (minX + maxX) / 2
      const dy = (top + bottom) / 2 - (minY + maxY) / 2
      const wpp = (2 * dist * Math.tan(THREE.MathUtils.degToRad(FOV / 2))) / h
      camRight.setFromMatrixColumn(camera.matrixWorld, 0)
      camUp.setFromMatrixColumn(camera.matrixWorld, 1)
      target.addScaledVector(camRight, -dx * wpp).addScaledVector(camUp, dy * wpp)
      dist *= k
    }
    camera.position.copy(target).addScaledVector(VIEW_DIR, dist)
    camera.lookAt(target)
    setHome(camera.position, target)
    applyViewPreset(camera, qp.get('view'))
    if (controls) {
      // the zoom-out limit must never be closer than the home pose, or the controls would crop the board
      controls.maxDistance = Math.max(DEFAULT_MAX_DIST, dist * 1.25)
      controls.target.copy(target)
      controls.update()
    }
  }, [camera, size, controls, scene])
  return null
}

/**
 * Compact (narrow or portrait) framing: same fixed angle, but the board and all harbour signs are
 * fitted between the compact HUD's top bar and bottom dock. A narrow aspect needs a much longer
 * camera distance, so the orbit limit and the fog are pushed out with it; otherwise the controls
 * would clamp the distance (cropping the board) and the fog would wash it out.
 */
function fitCompact(camera: THREE.PerspectiveCamera, w: number, h: number, controls: OrbitControlsImpl | null, scene: THREE.Scene) {
  camera.fov = FOV
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  const L = COMPACT_SAFE.side, R = w - COMPACT_SAFE.side, T = COMPACT_SAFE.top, B = h - COMPACT_SAFE.bottom
  const target = new THREE.Vector3(0.3, -0.35, 0.3)
  let dist = 13.6
  const p = new THREE.Vector3(), camRight = new THREE.Vector3(), camUp = new THREE.Vector3()
  const pts = [...BOARD_PTS, ...ALL_SIGN_PTS]
  for (let it = 0; it < 14; it++) {
    camera.position.copy(target).addScaledVector(VIEW_DIR, dist)
    camera.lookAt(target)
    camera.updateMatrixWorld()
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const v of pts) {
      p.copy(v).project(camera)
      const x = (p.x * 0.5 + 0.5) * w, y = (-p.y * 0.5 + 0.5) * h
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y)
    }
    const k = Math.max((maxX - minX) / (R - L), (maxY - minY) / (B - T))
    const wpp = (2 * dist * Math.tan(THREE.MathUtils.degToRad(FOV / 2))) / h
    camRight.setFromMatrixColumn(camera.matrixWorld, 0)
    camUp.setFromMatrixColumn(camera.matrixWorld, 1)
    target.addScaledVector(camRight, -((L + R) / 2 - (minX + maxX) / 2) * wpp).addScaledVector(camUp, ((T + B) / 2 - (minY + maxY) / 2) * wpp)
    dist *= k
  }
  camera.position.copy(target).addScaledVector(VIEW_DIR, dist)
  camera.lookAt(target)
  setHome(camera.position, target)
  applyViewPreset(camera, qp.get('view'))
  if (controls) {
    controls.maxDistance = Math.max(DEFAULT_MAX_DIST, dist * 1.25)
    controls.target.copy(target)
    controls.update()
  }
  if (scene.fog instanceof THREE.Fog) {
    const extra = Math.max(0, dist - 14)
    scene.fog.near = DEFAULT_FOG[0] + extra
    scene.fog.far = DEFAULT_FOG[1] + extra
  }
}

function Sun() {
  const ref = useRef<THREE.DirectionalLight>(null)
  const { scene } = useThree()
  useEffect(() => {
    const l = ref.current
    if (!l) return
    l.target.position.set(0, 0, 0)
    scene.add(l.target)
    return () => void scene.remove(l.target)
  }, [scene])
  return (
    <directionalLight
      ref={ref}
      position={[-7.5, 7.2, -5]}
      intensity={3.3}
      color="#ffbd78"
      castShadow
      shadow-mapSize={[quality.shadowMapSize, quality.shadowMapSize]}
      shadow-bias={-0.0004}
      shadow-normalBias={0.02}
      shadow-radius={3}
      shadow-camera-left={-6.8}
      shadow-camera-right={6.8}
      shadow-camera-top={6.8}
      shadow-camera-bottom={-6.8}
      shadow-camera-near={1}
      shadow-camera-far={30}
    />
  )
}

function Lights() {
  return (
    <>
      <Sun />
      {/* warm sky / bounced-earth fill: lifts shadows without flattening the sun */}
      <hemisphereLight args={['#cdd3d6', '#6e5434', 0.5]} />
      <ambientLight intensity={0.1} color="#ffe2b8" />
      {/* soft warm fill from the camera side so front faces of cliffs and houses read */}
      <directionalLight position={[2, 6, 9]} intensity={0.36} color="#ffe0bc" />
      {/* cool rim from the opposite side */}
      <directionalLight position={[7, 4, 3]} intensity={0.25} color="#9fc0e8" />
      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#8496a4']} />
        {/* warm low sun panel */}
        <Lightformer form="rect" intensity={8} color="#ffcf8a" position={[-8, 4, -5]} scale={[6, 3, 1]} target={[0, 0, 0]} />
        {/* sky dome */}
        <Lightformer form="rect" intensity={0.7} color="#c8d8e8" position={[0, 10, 0]} scale={[20, 20, 1]} rotation-x={Math.PI / 2} />
        <Lightformer form="rect" intensity={1.1} color="#ffb070" position={[0, 2, -10]} scale={[20, 4, 1]} />
        <Lightformer form="rect" intensity={0.4} color="#7896b8" position={[8, 3, 8]} scale={[10, 5, 1]} target={[0, 0, 0]} />
      </Environment>
    </>
  )
}

const off = new Set((qp.get('off') ?? '').split(','))

function Effects() {
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {off.has('ao') || !quality.ao ? <></> : <N8AO aoRadius={0.45} intensity={2.6} distanceFalloff={0.6} quality={quality.ao} halfRes />}
      {off.has('bloom') || !quality.bloom ? <></> : <Bloom luminanceThreshold={1.7} luminanceSmoothing={0.3} intensity={0.5} mipmapBlur radius={0.5} />}
      <HueSaturation saturation={0.08} />
      <BrightnessContrast brightness={0.0} contrast={0.1} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.32} darkness={0.5} />
      <SMAA />
    </EffectComposer>
  )
}

/**
 * The sun's shadow map is camera-independent and almost every caster is static, so it is
 * re-rendered every `quality.shadowEvery` frames (more rarely under reduced motion) instead of
 * every frame. Measured: the shadow pass is ~20% of the frame at 1440×900 DPR 2.
 */
function ShadowThrottle() {
  const gl = useThree((s) => s.gl)
  const n = useRef(0)
  useEffect(() => {
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    return () => void (gl.shadowMap.autoUpdate = true)
  }, [gl])
  useFrame(() => {
    const every = quality.shadowEvery * (motion.reduced ? 4 : 1)
    if (++n.current % every === 0) gl.shadowMap.needsUpdate = true
  })
  return null
}

export function World() {
  const controls = useRef<OrbitControlsImpl>(null)
  return (
    <Canvas
      shadows={{ type: THREE.PCFSoftShadowMap }}
      dpr={quality.dpr}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      camera={{ position: CAMERA_POS, fov: 30, near: 0.1, far: 120 }}
      onCreated={({ gl, scene, camera }) => {
        gl.toneMapping = THREE.NoToneMapping
        scene.background = new THREE.Color('#0b2236')
        scene.fog = new THREE.Fog('#1f3f55', 17, 40)
        // dev-only hook for scene audits (scripts/audit.mjs) and browser checks (camera for screen projection)
        if (import.meta.env.DEV) Object.assign(window, { __isles: { gl, scene, camera } })
      }}
    >
      <CameraRig />
      <ShadowThrottle />
      <ContextLossGuard />
      <CameraInteraction />
      <Suspense fallback={null}>
        <Lights />
        <Island />
        <Terrain />
        <Vegetation />
        <Tokens />
        <Robber />
        <Buildings />
        <Smoke />
        {!qp.has('nohover') && <TileHover />}
        {BOARD_MODE === 'game' && <Placement />}
        <Harbors />
        <Ocean />
        <Ships />
        <Scenery />
        {!qp.has('nofx') && <Effects />}
      </Suspense>
      <OrbitControls
        ref={controls}
        target={CAMERA_TARGET}
        enableDamping
        dampingFactor={0.08}
        minDistance={6}
        maxDistance={22}
        minPolarAngle={0.25}
        maxPolarAngle={1.2}
        enablePan
        screenSpacePanning={false}
        makeDefault
      />
    </Canvas>
  )
}
