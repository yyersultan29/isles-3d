import { Suspense, useEffect, useLayoutEffect, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
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
import { VERTICES, islandRadius } from './board'
import { Ships } from './Ships'
import { Scenery } from './Scenery'
import { Smoke } from './Smoke'

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

function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null
  useLayoutEffect(() => {
    if (vec('cam')) return
    const w = size.width, h = size.height
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
    if (controls) { controls.target.copy(target); controls.update() }
  }, [camera, size, controls])
  return null
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
      shadow-mapSize={[4096, 4096]}
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
      {off.has('ao') ? <></> : <N8AO aoRadius={0.45} intensity={2.6} distanceFalloff={0.6} quality="medium" halfRes />}
      {off.has('bloom') ? <></> : <Bloom luminanceThreshold={1.7} luminanceSmoothing={0.3} intensity={0.5} mipmapBlur radius={0.5} />}
      <HueSaturation saturation={0.08} />
      <BrightnessContrast brightness={0.0} contrast={0.1} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.32} darkness={0.5} />
      <SMAA />
    </EffectComposer>
  )
}

export function World() {
  const controls = useRef<OrbitControlsImpl>(null)
  return (
    <Canvas
      shadows={{ type: THREE.PCFSoftShadowMap }}
      dpr={[1, 2]}
      gl={{ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
      camera={{ position: CAMERA_POS, fov: 30, near: 0.1, far: 120 }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.NoToneMapping
        scene.background = new THREE.Color('#0b2236')
        scene.fog = new THREE.Fog('#1f3f55', 17, 40)
        // dev-only hook for scene audits (scripts/audit.mjs)
        if (import.meta.env.DEV) Object.assign(window, { __isles: { gl, scene } })
      }}
    >
      <CameraRig />
      <Suspense fallback={null}>
        <Lights />
        <Island />
        <Terrain />
        <Vegetation />
        <Tokens />
        <Robber />
        <Buildings />
        <Smoke />
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
