import { Suspense, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { animTime } from './motion'
import * as THREE from 'three'
import { WATER_Y } from './board'
import { useCharacterModel } from './characterModel'

const SHIP_H = 1.1 // fit height: the models are ~1.7 long and 1.9 tall, so the hull lands about 1 long
const SHIP_SINK = 0.06 // the GLBs sit their keel on y=0; sink it so the hull rides in the water

/** A ship from the owner's Hyper3D models (src/models/boat, sheep-boat → scripts/build-character.mjs). */
function Ship({ model, scale }: { model: string; scale: number }) {
  const { geometry, material, fit } = useCharacterModel(model, SHIP_H)
  // the models run along z; turn them so +x stays the heading the SHIPS yaws were set for
  return (
    <group scale={scale} rotation-y={Math.PI / 2} position-y={-SHIP_SINK}>
      <mesh geometry={geometry} material={material} matrix={fit} matrixAutoUpdate={false} castShadow receiveShadow />
    </group>
  )
}

const SHIPS = [
  { x: -6.0, z: -0.6, ry: 0.4, s: 1.1, r: 0.35, sp: 0.05, model: 'models/boat.glb' },
  { x: -6.1, z: 2.9, ry: -0.3, s: 1.0, r: 0.3, sp: 0.04, model: 'models/sheep-boat.glb' },
  { x: 6.3, z: -4.5, ry: 2.7, s: 0.95, r: 0.3, sp: 0.045, model: 'models/boat.glb' },
  { x: 6.6, z: 3.6, ry: -2.4, s: 1.05, r: 0.35, sp: 0.05, model: 'models/sheep-boat.glb' },
]

export function Ships() {
  const refs = useRef<(THREE.Group | null)[]>([])
  useFrame(() => {
    const t = animTime.value
    SHIPS.forEach((s, i) => {
      const g = refs.current[i]
      if (!g) return
      const a = t * s.sp + i * 2
      g.position.set(s.x + Math.cos(a) * s.r, WATER_Y + 0.02 + Math.sin(t * 1.3 + i) * 0.012, s.z + Math.sin(a) * s.r * 0.6)
      g.rotation.set(Math.sin(t * 1.1 + i) * 0.04, s.ry + Math.sin(a) * 0.1, Math.sin(t * 0.9 + i * 2) * 0.05)
    })
  })
  return (
    <group>
      {SHIPS.map((s, i) => (
        <group key={i} ref={(g) => { refs.current[i] = g }}>
          <Suspense fallback={null}><Ship model={s.model} scale={s.s} /></Suspense>
        </group>
      ))}
    </group>
  )
}
