import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import gsap from 'gsap'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { motion } from './motion'

/**
 * Home (default) camera pose. CameraRig writes it after every auto-fit, so "reset" always returns
 * to the framing that matches the current viewport and HUD layout.
 */
export const home = { pos: new THREE.Vector3(), target: new THREE.Vector3(), set: false }

export function setHome(pos: THREE.Vector3, target: THREE.Vector3) {
  home.pos.copy(pos)
  home.target.copy(target)
  home.set = true
}

/** How far (world units, on the ground plane) the orbit target may be panned away from home. */
const PAN_LIMIT = 2.6

/** Screenshot/debug presets via `?view=`: orbit around the home target at a different angle or distance. */
export type ViewPreset = 'top' | 'low' | 'close'
export function applyViewPreset(camera: THREE.PerspectiveCamera, preset: string | null) {
  if (!preset || !home.set) return
  const off = home.pos.clone().sub(home.target)
  const sph = new THREE.Spherical().setFromVector3(off)
  if (preset === 'top') { sph.phi = 0.26; sph.radius *= 1.4 } // near-overhead, still inside the orbit limits
  else if (preset === 'low') { sph.phi = 1.15 } // low, cinematic three-quarter view at the lowest allowed tilt
  else if (preset === 'close') { sph.radius *= 0.55 } // detail check of terrain and pieces at default tilt
  else return
  camera.position.copy(home.target).add(new THREE.Vector3().setFromSpherical(sph))
  camera.lookAt(home.target)
}

/**
 * - Clamps panning so the board can't be dragged off screen (the target stays near home and on its height).
 * - Double-click on the canvas or the R key smoothly returns to the home pose (instantly under reduced motion).
 */
export function CameraInteraction() {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null
  const gl = useThree((s) => s.gl)

  useEffect(() => {
    if (!controls) return
    const d = new THREE.Vector3()
    const clamp = () => {
      if (!home.set) return
      const t = controls.target
      d.set(t.x - home.target.x, 0, t.z - home.target.z)
      const len = d.length()
      const dy = home.target.y - t.y
      if (len <= PAN_LIMIT && Math.abs(dy) < 1e-6) return
      // move target and camera together, so clamping never changes the view angle
      const sx = len > PAN_LIMIT ? d.x * (PAN_LIMIT / len - 1) : 0
      const sz = len > PAN_LIMIT ? d.z * (PAN_LIMIT / len - 1) : 0
      t.x += sx; t.z += sz; t.y += dy
      camera.position.x += sx; camera.position.z += sz; camera.position.y += dy
    }
    controls.addEventListener('change', clamp)
    return () => controls.removeEventListener('change', clamp)
  }, [controls, camera])

  useEffect(() => {
    if (!controls) return
    let tween: gsap.core.Timeline | null = null
    const reset = () => {
      if (!home.set) return
      tween?.kill()
      if (motion.reduced) {
        camera.position.copy(home.pos)
        controls.target.copy(home.target)
        controls.update()
        return
      }
      tween = gsap.timeline({ onUpdate: () => controls.update() })
      tween.to(camera.position, { x: home.pos.x, y: home.pos.y, z: home.pos.z, duration: 0.7, ease: 'power2.inOut' }, 0)
      tween.to(controls.target, { x: home.target.x, y: home.target.y, z: home.target.z, duration: 0.7, ease: 'power2.inOut' }, 0)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'r' && e.key !== 'R') return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
      reset()
    }
    const canvas = gl.domElement
    canvas.addEventListener('dblclick', reset)
    window.addEventListener('keydown', onKey)
    if (import.meta.env.DEV) Object.assign((window as unknown as { __isles?: object }).__isles ?? {}, { resetCamera: reset, camera, controls })
    return () => {
      tween?.kill()
      canvas.removeEventListener('dblclick', reset)
      window.removeEventListener('keydown', onKey)
    }
  }, [controls, camera, gl])

  return null
}
