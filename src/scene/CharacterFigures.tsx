import { Component, Suspense, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'
import { CHARACTER_SPOTS, type CharacterSpot } from './characters'
import { useCharacterModel } from './characterModel'
import { animTime, motion } from './motion'

/**
 * The farmer, shepherd, … (characters.ts says who stands where). Each one loads in its own Suspense
 * and error boundary: a missing or broken file logs one console error and leaves that tile empty,
 * the island and the game go on. Idle: a procedural weight shift and look-around (the models have no
 * clips), each with its own phase, driven by the shared animation clock.
 */
export function Characters() {
  return (
    <>
      {CHARACTER_SPOTS.map((s) => (
        <LoadGuard key={s.def.id} id={s.def.id}>
          <Suspense fallback={null}><Character spot={s} /></Suspense>
        </LoadGuard>
      ))}
    </>
  )
}

class LoadGuard extends Component<{ id: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: unknown) { console.error(`[characters] "${this.props.id}" failed to load; its tile stays empty.`, error) }
  render() { return this.state.failed ? null : this.props.children }
}

const noRaycast = () => {}
const phaseOf = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7) / 997 * Math.PI * 2

function Character({ spot }: { spot: CharacterSpot }) {
  const { def } = spot
  const model = useCharacterModel(def.model, def.targetHeight)
  const body = useRef<THREE.Group>(null)
  const ph = phaseOf(def.id)
  useFrame(() => {
    const g = body.current
    if (!g) return
    if (motion.reduced) { g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); return }
    const t = animTime.value
    const step = Math.sin(t * 1.5 + ph) // foot to foot
    g.position.set(step * 0.006, Math.abs(step) * 0.003, 0)
    g.rotation.set(0, Math.sin(t * 0.45 + ph) * 0.22 + Math.sin(t * 1.1 + ph * 2) * 0.04, step * 0.035, 'YXZ')
  })
  return (
    <group position={[spot.x + def.offset[0], spot.y - 0.004 + def.offset[1], spot.z + def.offset[2]]} rotation-y={spot.yaw + def.yaw} userData={{ piece: `character-${def.id}` }}>
      <group ref={body}>
        <mesh geometry={model.geometry} material={model.material} matrix={model.fit} matrixAutoUpdate={false} castShadow={def.castShadow} receiveShadow={def.receiveShadow} raycast={noRaycast} />
      </group>
    </group>
  )
}
