import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { chimneyTops } from './Pieces'
import { animTime, motion } from './motion'

const PUFFS = 10 // per chimney; enough overlap that the column reads as a wisp, not beads
const LIFE = 5.5 // seconds a puff takes to rise and fade
const RISE = 0.32 // world units a puff climbs over its life

/**
 * Thin chimney smoke: one instanced mesh of soft, low-poly puffs that rise, drift downwind
 * (+x, matching the foliage wind) and shrink away. No per-frame allocations.
 */
export function Smoke() {
  const tops = useMemo(() => chimneyTops(), [])
  const geo = useMemo(() => new THREE.IcosahedronGeometry(1, 1), [])
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#e9e4dc', roughness: 1, transparent: true, opacity: 0.3, depthWrite: false }),
    [],
  )
  const ref = useRef<THREE.InstancedMesh>(null)
  const o = useMemo(() => new THREE.Object3D(), [])
  useFrame(() => {
    const m = ref.current
    if (!m) return
    m.visible = !motion.reduced
    if (!m.visible) return
    const t = animTime.value
    let k = 0
    for (let c = 0; c < tops.length; c++) {
      const [x, y, z] = tops[c]
      for (let p = 0; p < PUFFS; p++) {
        // staggered phase per puff and per chimney
        const f = (((t + c * 1.37) / LIFE + p / PUFFS) % 1 + 1) % 1
        const sway = Math.sin(t * 0.8 + c * 2.1 + p) * 0.012
        o.position.set(x + f * f * 0.09 + sway, y + f * RISE, z + sway * 0.6)
        // grow out of the chimney, then shrink away so the puff fades without per-instance alpha
        const size = 0.012 + 0.04 * Math.sin(Math.min(1, f * 1.15) * Math.PI) * (0.6 + 0.4 * f)
        o.scale.setScalar(size)
        o.rotation.set(0, p * 1.3, 0)
        o.updateMatrix()
        m.setMatrixAt(k++, o.matrix)
      }
    }
    m.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[geo, mat, tops.length * PUFFS]} frustumCulled={false} renderOrder={3} />
}
