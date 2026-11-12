// Valid-placement highlights and click-to-place (ROADMAP G4.3). Targets come from the engine's
// legalActions (store/placement.ts); this file only draws them and turns a click into a dispatch.
// Picking intersects a horizontal plane and finds the nearest target mathematically (no mesh
// raycasts), like TileHover. A drag (camera orbit or pan) never counts as a click.

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { corner, edgeToScene, PLAYER_COLOR_OF, PLAYER_COLORS, tileAt, tileByAxial, vertexToScene } from './board'
import { animTime, motion } from './motion'
import { useGame, useGameStore, useSeat } from '../store/GameProvider'
import { placementTargets } from '../store/placement'
import { setPlacementMode, usePlacementMode } from '../store/ui'
import { getCursor, setProjector } from '../store/boardCursor'
import type { Action } from '../game'

// the rails sit flat at board level, so markers use a fixed height (a tile's relief rises near
// mountains and would lift them off the rail); drawn without depth test so props never hide a target
const MARK_Y = 0.1
const PICK_VERTEX = 0.3
const PICK_EDGE = 0.22
const CLICK_SLOP_PX = 6

interface Spot { x: number; z: number; action: Action; at: string }
interface EdgeSpot extends Spot { ang: number; len: number; a: [number, number]; b: [number, number] }

const vertexPos = (v: Parameters<typeof vertexToScene>[0]) => { const s = vertexToScene(v); return corner(tileAt(...s.tile), s.corner) }

function distToSegment(px: number, pz: number, a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0], dz = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz)))
  return Math.hypot(px - (a[0] + t * dx), pz - (a[1] + t * dz))
}

const markMat = (color: string, opacity: number) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthTest: false, side: THREE.DoubleSide, toneMapped: false })

export function Placement() {
  const state = useGame((s) => s)
  const mode = usePlacementMode()
  const store = useGameStore()
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)

  const me = useSeat()
  const targets = useMemo(() => placementTargets(state, mode, me), [state, mode, me])
  const spots = useMemo(() => {
    const vertices: Spot[] = targets.vertices.map(({ at, action }) => { const [x, z] = vertexPos(at); return { x, z, action, at } })
    const edges: EdgeSpot[] = targets.edges.map(({ at, action }) => {
      const s = edgeToScene(at)
      const t = tileAt(...s.tile)
      const a = corner(t, s.edge), b = corner(t, (s.edge + 1) % 6)
      return { x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2, ang: -Math.atan2(b[1] - a[1], b[0] - a[0]), len: Math.hypot(b[0] - a[0], b[1] - a[1]), a, b, action, at }
    })
    const tiles: Spot[] = targets.tiles.flatMap(({ at, action }) => { const t = tileByAxial(at); return t ? [{ x: t.x, z: t.z, action, at }] : [] })
    return { vertices, edges, tiles }
  }, [targets])

  const colour = targets.player ? PLAYER_COLORS[PLAYER_COLOR_OF[targets.player]].wall : '#ffffff'

  // shared geometry and materials
  const geo = useMemo(() => {
    const ring = new THREE.RingGeometry(0.075, 0.11, 28)
    ring.rotateX(-Math.PI / 2)
    const dot = new THREE.CircleGeometry(0.05, 20)
    dot.rotateX(-Math.PI / 2)
    const bar = new THREE.PlaneGeometry(1, 0.075)
    bar.rotateX(-Math.PI / 2)
    const hexRing = (r: number) => Array.from({ length: 6 }, (_, k) => new THREE.Vector2(...corner({ x: 0, z: 0 }, k, r)))
    const shape = new THREE.Shape(hexRing(0.9))
    shape.holes.push(new THREE.Path(hexRing(0.84)))
    const hex = new THREE.ShapeGeometry(shape)
    hex.rotateX(Math.PI / 2)
    return { ring, dot, bar, hex }
  }, [])
  const mats = useMemo(() => ({ base: markMat('#fff6dc', 0.8), hover: markMat('#ffffff', 0.95), fill: markMat('#ffffff', 0.9) }), [])
  useEffect(() => { mats.fill.color.set(colour) }, [colour, mats])
  useEffect(() => () => { Object.values(geo).forEach((g) => g.dispose()); Object.values(mats).forEach((m) => m.dispose()) }, [geo, mats])

  // instanced base markers, rebuilt when the targets change
  const ringRef = useRef<THREE.InstancedMesh>(null)
  const barRef = useRef<THREE.InstancedMesh>(null)
  const hexRef = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    const o = new THREE.Object3D()
    const fill = (m: THREE.InstancedMesh | null, list: Spot[], f: (s: Spot) => void) => {
      if (!m) return
      list.forEach((s, i) => { o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); f(s); o.updateMatrix(); m.setMatrixAt(i, o.matrix) })
      m.count = list.length
      m.instanceMatrix.needsUpdate = true
    }
    fill(ringRef.current, spots.vertices, (s) => o.position.set(s.x, MARK_Y, s.z))
    fill(barRef.current, spots.edges, (s) => { const e = s as EdgeSpot; o.position.set(e.x, MARK_Y, e.z); o.rotation.set(0, e.ang, 0); o.scale.set(e.len * 0.62, 1, 1) })
    fill(hexRef.current, spots.tiles, (s) => o.position.set(s.x, 0.06, s.z))
  }, [spots])

  // pointer picking: hover the nearest target, click (without dragging) to place
  const hover = useRef<{ spot: Spot | null; kind: 'v' | 'e' | 't' | null }>({ spot: null, kind: null })
  const hoverRef = useRef<THREE.Group>(null)
  useEffect(() => {
    const el = gl.domElement
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.08)
    const hit = new THREE.Vector3()
    let down: [number, number] | null = null
    const pick = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      if (!ray.ray.intersectPlane(plane, hit)) return { spot: null, kind: null }
      let best: Spot | null = null, kind: 'v' | 'e' | 't' | null = null, bd = Infinity
      for (const s of spots.vertices) { const d = Math.hypot(hit.x - s.x, hit.z - s.z); if (d < PICK_VERTEX && d < bd) { best = s; bd = d; kind = 'v' } }
      for (const s of spots.edges) { const d = distToSegment(hit.x, hit.z, s.a, s.b); if (d < PICK_EDGE && d < bd) { best = s; bd = d; kind = 'e' } }
      if (!best) for (const s of spots.tiles) { const d = Math.hypot(hit.x - s.x, hit.z - s.z); if (d < 0.85 && d < bd) { best = s; bd = d; kind = 't' } }
      return { spot: best, kind }
    }
    const move = (e: PointerEvent) => {
      hover.current = e.buttons ? { spot: null, kind: null } : pick(e)
      el.style.cursor = hover.current.spot ? 'pointer' : ''
    }
    const onDown = (e: PointerEvent) => { down = [e.clientX, e.clientY] }
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > CLICK_SLOP_PX) { down = null; return }
      down = null
      const { spot } = pick(e)
      if (!spot || !targets.player) return
      const r = store.dispatch(targets.player, spot.action)
      if (r.ok) {
        if (state.phase.kind === 'actions') setPlacementMode(null) // one build per menu choice
      } // a rejection shows as a HUD notice (ui/Notices.tsx)
      hover.current = { spot: null, kind: null }
      el.style.cursor = ''
    }
    const leave = () => { hover.current = { spot: null, kind: null }; el.style.cursor = '' }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointerleave', leave)
    return () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointerleave', leave)
      el.style.cursor = ''
    }
  }, [gl, camera, spots, targets, store, state.phase.kind])

  // keyboard cursor (G4.6a): the HUD picker moves through targets in screen space, so it needs to
  // know where each target lands on screen with the current camera
  const byAt = useMemo(() => {
    const m = new Map<string, { spot: Spot; kind: 'v' | 'e' | 't' }>()
    spots.vertices.forEach((s) => m.set(s.at, { spot: s, kind: 'v' }))
    spots.edges.forEach((s) => m.set(s.at, { spot: s, kind: 'e' }))
    spots.tiles.forEach((s) => m.set(s.at, { spot: s, kind: 't' }))
    return m
  }, [spots])
  useEffect(() => {
    const v = new THREE.Vector3()
    setProjector((a) => {
      const at = 'vertex' in a ? a.vertex : 'edge' in a ? a.edge : 'tile' in a ? a.tile : null
      const hit = at ? byAt.get(at) : undefined
      if (!hit) return null
      const r = gl.domElement.getBoundingClientRect()
      v.set(hit.spot.x, MARK_Y, hit.spot.z).project(camera)
      return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]
    })
    return () => setProjector(null)
  }, [byAt, camera, gl])

  // gentle pulse (steady under reduced motion) and the hover marker
  const hoverRing = useRef<THREE.Mesh>(null)
  const hoverDot = useRef<THREE.Mesh>(null)
  const hoverBar = useRef<THREE.Mesh>(null)
  const hoverHex = useRef<THREE.Mesh>(null)
  useFrame(() => {
    mats.base.opacity = motion.reduced ? 0.8 : 0.62 + 0.28 * (0.5 + 0.5 * Math.sin(animTime.value * 3.2))
    const key = getCursor()
    const { spot, kind } = hover.current.spot ? hover.current : (key && byAt.get(key)) || hover.current
    const g = hoverRef.current
    if (!g) return
    g.visible = !!spot
    if (!spot) return
    const y = kind === 't' ? 0.06 : MARK_Y + 0.002
    g.position.set(spot.x, y, spot.z)
    if (hoverRing.current) hoverRing.current.visible = kind === 'v'
    if (hoverDot.current) hoverDot.current.visible = kind === 'v'
    if (hoverBar.current) {
      hoverBar.current.visible = kind === 'e'
      if (kind === 'e') { const e = spot as EdgeSpot; hoverBar.current.rotation.set(0, e.ang, 0); hoverBar.current.scale.set(e.len * 0.7, 1, 1.6) }
    }
    if (hoverHex.current) hoverHex.current.visible = kind === 't'
  })

  const cap = (n: number) => Math.max(1, n)
  return (
    <group>
      <instancedMesh ref={ringRef} args={[geo.ring, mats.base, cap(54)]} count={0} frustumCulled={false} renderOrder={5} />
      <instancedMesh ref={barRef} args={[geo.bar, mats.base, cap(72)]} count={0} frustumCulled={false} renderOrder={5} />
      <instancedMesh ref={hexRef} args={[geo.hex, mats.base, cap(19)]} count={0} frustumCulled={false} renderOrder={5} />
      <group ref={hoverRef} visible={false}>
        <mesh ref={hoverRing} geometry={geo.ring} material={mats.hover} scale={1.45} renderOrder={6} />
        <mesh ref={hoverDot} geometry={geo.dot} material={mats.fill} scale={1.3} renderOrder={7} />
        <mesh ref={hoverBar} geometry={geo.bar} material={mats.fill} renderOrder={7} />
        <mesh ref={hoverHex} geometry={geo.hex} material={mats.fill} scale={[1.04, 1, 1.04]} renderOrder={6} />
      </group>
    </group>
  )
}
