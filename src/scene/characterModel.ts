// One loader for the character GLBs (mountain guy, farmer, shepherd, robber). drei's useGLTF loads
// each file once (GLTFLoader + meshopt decoder from three; no Draco, so nothing comes from a CDN) and
// every instance draws that same geometry and material, so clones share GPU memory. The models are
// static meshes (no skeleton, no clips), so SkeletonUtils.clone isn't needed.

import { useEffect, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

export interface CharacterModel {
  geometry: THREE.BufferGeometry
  material: THREE.MeshStandardMaterial
  /** Node transform (meshopt dequantization lives there) × a fit: `height` tall, feet on y=0, centred on x/z. */
  fit: THREE.Matrix4
}

/** Mounted users per file: the last one to leave frees the GPU memory and the loader cache. */
const users = new Map<string, number>()

export function useCharacterModel(file: string, height: number): CharacterModel {
  const url = import.meta.env.BASE_URL + file
  const gltf = useGLTF(url, false, true)
  const model = useMemo(() => {
    let mesh: THREE.Mesh | undefined
    gltf.scene.updateMatrixWorld(true)
    gltf.scene.traverse((o) => { if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh })
    if (!mesh) throw new Error(`${file} has no mesh`)
    const box = new THREE.Box3().setFromObject(mesh)
    const s = height / (box.max.y - box.min.y)
    const fit = new THREE.Matrix4().makeScale(s, s, s)
      .premultiply(new THREE.Matrix4().makeTranslation(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s))
      .multiply(mesh.matrixWorld)
    const material = mesh.material as THREE.MeshStandardMaterial
    // colour spaces: base colour and emissive are sRGB, the data maps linear (GLTFLoader sets this; kept explicit)
    for (const t of [material.map, material.emissiveMap]) if (t) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4 }
    for (const t of [material.normalMap, material.roughnessMap, material.metalnessMap]) if (t) t.colorSpace = THREE.NoColorSpace
    return { geometry: mesh.geometry, material, fit }
  }, [gltf, file, height])

  // Freed one tick after the last user leaves: StrictMode (dev) runs a cleanup right after mount and a
  // new board remounts every instance, and clearing the cache then would make the next render suspend.
  useEffect(() => {
    users.set(url, (users.get(url) ?? 0) + 1)
    return () => {
      users.set(url, users.get(url)! - 1)
      setTimeout(() => {
        if (users.get(url)) return
        const m = model.material
        for (const t of new Set([m.map, m.emissiveMap, m.normalMap, m.roughnessMap, m.metalnessMap])) t?.dispose()
        m.dispose()
        model.geometry.dispose()
        useGLTF.clear(url)
      }, 0)
    }
  }, [url, model])
  return model
}
