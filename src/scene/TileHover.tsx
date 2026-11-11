import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { corner, findTile } from './board'

/**
 * Visual-only hover highlight: a soft glowing ring just inside the rails of the tile under the
 * pointer. Picking intersects a horizontal plane and looks the hex up mathematically, so it costs
 * nothing per move (no mesh raycasts). Only for fine pointers; it hides while dragging the camera.
 */
export function TileHover() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const ref = useRef<THREE.Mesh>(null)
  const state = useRef({ want: 0, x: 0, z: 0, has: false })

  const geo = useMemo(() => {
    const ring = (r: number) => Array.from({ length: 6 }, (_, k) => new THREE.Vector2(...corner({ x: 0, z: 0 }, k, r)))
    const shape = new THREE.Shape(ring(0.975))
    shape.holes.push(new THREE.Path(ring(0.9)))
    const g = new THREE.ShapeGeometry(shape)
    g.rotateX(Math.PI / 2) // shape is in XY; lay it on the ground (x, z)
    return g
  }, [])
  const mat = useMemo(
    // depthTest off: wheat and trees lean over the rails and would otherwise hide most of the ring
    () => new THREE.MeshBasicMaterial({ color: '#fff1c8', transparent: true, opacity: 0, depthWrite: false, depthTest: false, side: THREE.DoubleSide, toneMapped: false }),
    [],
  )

  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return
    const el = gl.domElement
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.08) // roughly the mean ground height
    const hit = new THREE.Vector3()
    const s = state.current
    const move = (e: PointerEvent) => {
      if (e.buttons) { s.want = 0; return } // orbiting/panning
      const r = el.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      const t = ray.ray.intersectPlane(plane, hit) ? findTile(hit.x, hit.z) : null
      if (t) { s.x = t.x; s.z = t.z; s.has = true; s.want = 1 } else s.want = 0
    }
    const leave = () => { s.want = 0 }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', leave)
    return () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', leave)
    }
  }, [camera, gl])

  useFrame((_, dt) => {
    const m = ref.current
    if (!m) return
    const s = state.current
    if (s.has) m.position.set(s.x, 0.052, s.z)
    // quick fade so the ring follows the pointer without popping
    mat.opacity += (s.want * 0.45 - mat.opacity) * Math.min(1, dt * 14)
    m.visible = mat.opacity > 0.01
  })

  return <mesh ref={ref} geometry={geo} material={mat} visible={false} renderOrder={4} />
}
