import { Suspense, useEffect, useRef } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
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
import { Harbors } from './Harbors'
import { Ships } from './Ships'
import { Scenery } from './Scenery'

// Debug override: ?cam=x,y,z&tgt=x,y,z
const qp = new URLSearchParams(window.location.search)
const vec = (k: string) => qp.get(k)?.split(',').map(Number) as [number, number, number] | undefined
export const CAMERA_POS: [number, number, number] = vec('cam') ?? [0.12, 9.15, 10.05]
export const CAMERA_TARGET: [number, number, number] = vec('tgt') ?? [0.3, -0.35, 0.62]

/**
 * Keeps the island framed on any viewport. The base vertical FOV is tuned for a 16:10 screen.
 * On narrower or taller windows the FOV opens up so the island's width still fits between the HUD columns.
 */
const BASE_FOV = 30
const BASE_ASPECT = 1.6
function CameraRig() {
  const { camera, size } = useThree()
  useFrame(() => {
    const cam = camera as THREE.PerspectiveCamera
    const aspect = size.width / Math.max(1, size.height)
    const tanH = Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)) * BASE_ASPECT
    const fov = Math.max(BASE_FOV, THREE.MathUtils.radToDeg(2 * Math.atan(tanH / aspect)))
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = Math.min(fov, 55)
      cam.updateProjectionMatrix()
    }
  })
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
      intensity={3.1}
      color="#ffc888"
      castShadow
      shadow-mapSize={[4096, 4096]}
      shadow-bias={-0.0004}
      shadow-normalBias={0.02}
      shadow-radius={3}
      shadow-camera-left={-8}
      shadow-camera-right={8}
      shadow-camera-top={8}
      shadow-camera-bottom={-8}
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
      <hemisphereLight args={['#e3e6e0', '#7a5a34', 0.72]} />
      <ambientLight intensity={0.16} color="#ffe2b8" />
      {/* soft warm fill from the camera side so front faces of cliffs and houses read */}
      <directionalLight position={[2, 6, 9]} intensity={0.45} color="#ffe0bc" />
      {/* cool rim from the opposite side */}
      <directionalLight position={[7, 4, 3]} intensity={0.25} color="#9fc0e8" />
      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#8496a4']} />
        {/* warm low sun panel */}
        <Lightformer form="rect" intensity={8} color="#ffcf8a" position={[-8, 4, -5]} scale={[6, 3, 1]} target={[0, 0, 0]} />
        {/* sky dome */}
        <Lightformer form="rect" intensity={1.0} color="#c8d8e8" position={[0, 10, 0]} scale={[20, 20, 1]} rotation-x={Math.PI / 2} />
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
      {off.has('ao') ? <></> : <N8AO aoRadius={0.35} intensity={2.2} distanceFalloff={0.6} quality="medium" halfRes />}
      {off.has('bloom') ? <></> : <Bloom luminanceThreshold={1.6} luminanceSmoothing={0.3} intensity={0.8} mipmapBlur radius={0.55} />}
      <HueSaturation saturation={0.06} />
      <BrightnessContrast brightness={0.025} contrast={0.1} />
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
