import { use, useMemo } from 'react'
import * as THREE from 'three'
import { TILES, LEDGES, Tile, EDGES, VERTICES } from './board'
import { buildTileGeometry, tileDetail } from './terrainGeometry'
import type { TileArrays } from './terrain.worker'

const buildHere = () => TILES.map((t) => buildTileGeometry(t, tileDetail(t)))
let ready: { key: string; geos: THREE.BufferGeometry[] } | null = null
let first: Promise<void> | null = null

/** All tiles' meshes for the current board, in TILES order; rebuilt only when the board changes. */
function useTileGeometries() {
  const key = JSON.stringify([TILES, LEDGES])
  if (ready?.key === key) return ready.geos
  // only the first board waits for the worker: suspending later would blank the scene already shown
  // (the boundary's fallback), so a board switch builds here, as before
  if (!first) first = inWorker().catch(buildHere).then((geos) => { ready = { key, geos } })
  if (!ready) use(first)
  if (ready?.key !== key) ready = { key, geos: buildHere() }
  return ready.geos
}

function inWorker() {
  return new Promise<THREE.BufferGeometry[]>((resolve, reject) => {
    if (typeof Worker === 'undefined') return reject(new Error('no Worker'))
    const w = new Worker(new URL('./terrain.worker.ts', import.meta.url), { type: 'module' })
    w.onerror = (e) => { w.terminate(); reject(e) }
    w.onmessage = (e: MessageEvent<TileArrays[]>) => {
      w.terminate()
      resolve(e.data.map((a) => {
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.BufferAttribute(a.position, 3))
        g.setAttribute('normal', new THREE.BufferAttribute(a.normal, 3))
        g.setAttribute('color', new THREE.BufferAttribute(a.color, 3))
        g.setIndex(new THREE.BufferAttribute(a.index, 1))
        return g
      }))
    }
    w.postMessage({ tiles: TILES, ledges: LEDGES })
  })
}

function TileMesh({ t, geo }: { t: Tile; geo: THREE.BufferGeometry }) {
  return (
    <mesh geometry={geo} position={[t.x, 0, t.z]} castShadow receiveShadow>
      <meshStandardMaterial
        vertexColors
        roughness={t.biome === 'mountain' ? 0.86 : 0.95}
        metalness={0}
      />
    </mesh>
  )
}

/** Wooden rails along every hex edge + brass rivets at vertices. */
function Rails() {
  const { railGeo, rivets } = useMemo(() => {
    const g = new THREE.BoxGeometry(1, 1, 1)
    g.translate(0, 0.5, 0)
    return { railGeo: g, rivets: VERTICES }
  }, [])
  const railRef = (m: THREE.InstancedMesh | null) => {
    if (!m) return
    const o = new THREE.Object3D()
    EDGES.forEach((e, i) => {
      const [ax, az] = e.a, [bx, bz] = e.b
      const len = Math.hypot(bx - ax, bz - az)
      o.position.set((ax + bx) / 2, -0.01, (az + bz) / 2)
      o.rotation.set(0, -Math.atan2(bz - az, bx - ax), 0)
      o.scale.set(len * 0.98, 0.05, e.outer ? 0.09 : 0.075)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  }
  const rivRef = (m: THREE.InstancedMesh | null) => {
    if (!m) return
    const o = new THREE.Object3D()
    rivets.forEach(([x, z], i) => {
      o.position.set(x, 0.045, z)
      o.scale.setScalar(1)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  }
  return (
    <group>
      <instancedMesh ref={railRef} args={[railGeo, undefined, EDGES.length]} castShadow receiveShadow>
        <meshStandardMaterial color="#8a5e36" roughness={0.78} />
      </instancedMesh>
      <instancedMesh ref={rivRef} args={[undefined, undefined, rivets.length]} castShadow>
        <cylinderGeometry args={[0.05, 0.06, 0.035, 12]} />
        <meshStandardMaterial color="#c8b07a" roughness={0.35} metalness={0.7} />
      </instancedMesh>
    </group>
  )
}

export function Terrain() {
  // suspends the scene's boundary, which also waits for the model files, until the worker is done
  const geos = useTileGeometries()
  return (
    <group>
      {TILES.map((t, i) => (
        <TileMesh key={t.id} t={t} geo={geos[i]} />
      ))}
      <Rails />
    </group>
  )
}
