import { useLayoutEffect, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Merges static child meshes that share a material (and shadow flags) into one mesh per group,
 * after the children mount. That turns hundreds of small draw calls (planks, posts, house parts)
 * into a handful. The originals are hidden, not removed, so React keeps owning its objects.
 *
 * Skipped: instanced meshes, multi-material meshes, meshes whose material is animated per frame
 * (mark with `userData.dynamic = true`), and anything with a non-static ancestor.
 */
export function StaticBatch({ children }: { children: ReactNode }) {
  const root = useRef<THREE.Group>(null)
  useLayoutEffect(() => {
    const g = root.current
    if (!g) return
    g.updateMatrixWorld(true)
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert()
    const groups = new Map<string, { mat: THREE.Material; cast: boolean; receive: boolean; items: THREE.Mesh[] }>()
    g.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material) || m.userData.dynamic) return
      const key = `${m.material.uuid}|${m.castShadow}|${m.receiveShadow}|${m.renderOrder}`
      let e = groups.get(key)
      if (!e) groups.set(key, (e = { mat: m.material, cast: m.castShadow, receive: m.receiveShadow, items: [] }))
      e.items.push(m)
    })
    const merged: THREE.Mesh[] = []
    const mtx = new THREE.Matrix4()
    for (const { mat, cast, receive, items } of groups.values()) {
      if (items.length < 2) continue
      const withUv = items.every((m) => m.geometry.attributes.uv)
      const geos = items.map((m) => {
        let geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()
        for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && !(k === 'uv' && withUv)) geo.deleteAttribute(k)
        if (!geo.attributes.normal) geo.computeVertexNormals()
        geo.applyMatrix4(mtx.multiplyMatrices(inv, m.matrixWorld))
        geo.clearGroups()
        return geo
      })
      const geo = mergeGeometries(geos)
      geos.forEach((x) => x.dispose())
      if (!geo) continue
      geo.computeBoundingSphere()
      const mesh = new THREE.Mesh(geo, mat)
      mesh.castShadow = cast
      mesh.receiveShadow = receive
      mesh.renderOrder = items[0].renderOrder
      g.add(mesh)
      merged.push(mesh)
      items.forEach((m) => (m.visible = false))
    }
    return () => {
      for (const m of merged) {
        g.remove(m)
        m.geometry.dispose()
      }
      g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.visible = true })
    }
  }, [])
  return <group ref={root}>{children}</group>
}
