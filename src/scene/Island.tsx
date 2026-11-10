import { useMemo } from 'react'
import * as THREE from 'three'
import { islandRadius, WATER_Y } from './board'
import { noise2, fbm, smoothstep, clamp } from './noise'

const SEG = 720

// radial profile of the rim, measured outward from the plateau edge: [offset, y]
const PROFILE: [number, number][] = [
  [-0.35, -0.02], [-0.12, -0.02], [0.0, -0.03], [0.04, -0.07], [0.08, -0.16], [0.11, -0.26],
  [0.14, -0.36], [0.18, -0.46], [0.22, -0.56], [0.27, -0.66], [0.34, -0.8], [0.46, -1.0], [0.62, -1.3],
]

/** Rocky cliff ring + plateau under the tiles. */
export function Island() {
  const { cliff, plateau } = useMemo(() => {
    const rock = new THREE.Color('#8a8073')
    const rockDark = new THREE.Color('#463d36')
    const rockLight = new THREE.Color('#b9ad99')
    const wet = new THREE.Color('#2f2b28')
    const grass = new THREE.Color('#4c6a24')
    const dirt = new THREE.Color('#8a7356')
    const moss = new THREE.Color('#465e22')
    const grassDark = new THREE.Color('#34501a'), grassLight = new THREE.Color('#7f963a')
    const tmp = new THREE.Color()

    // ---- cliff ring: smooth-shaded, layered sea cliff ----
    // resample the coarse profile into finer rows so ledges and the grass lip can be shaped
    const ROWS = 34
    const prof: [number, number][] = []
    for (let j = 0; j < ROWS; j++) {
      const f = (j / (ROWS - 1)) * (PROFILE.length - 1)
      const i0 = Math.floor(f), i1 = Math.min(PROFILE.length - 1, i0 + 1), k = f - i0
      prof.push([PROFILE[i0][0] * (1 - k) + PROFILE[i1][0] * k, PROFILE[i0][1] * (1 - k) + PROFILE[i1][1] * k])
    }
    const N = SEG / 2 // 360 columns are plenty once shading is smooth
    const pos = new Float32Array((N + 1) * ROWS * 3)
    const col = new Float32Array((N + 1) * ROWS * 3)
    const c = new THREE.Color()
    const ledge = (y: number) => {
      // stepped strata: each band leans out slightly at its top, giving soft horizontal ledges
      const band = 0.11
      const q = (-y + 0.03) / band
      const f = q - Math.floor(q)
      return (smoothstep(0.0, 0.25, f) - f * 0.8) * 0.045
    }
    for (let i = 0; i <= N; i++) {
      const th = (i / N) * Math.PI * 2
      const rb = islandRadius(th)
      const cx = Math.cos(th), sz = Math.sin(th)
      for (let j = 0; j < ROWS; j++) {
        const [off, y] = prof[j]
        const below = smoothstep(-0.03, -0.12, y) // 0 on the grassy lip, 1 on the rock face
        const depth = clamp(-y / 0.9)
        // vertical rock columns (moderate angular frequency) + large boulder bulges + strata ledges
        // crevice field: ~0 inside vertical cracks, 1 on the rock faces between them
        const crack = smoothstep(0.0, 0.22, Math.abs(noise2(th * 34, y * 1.2 + 7))) * smoothstep(0.0, 0.3, Math.abs(noise2(th * 13 + 9, y * 0.8)))
        const columns = crack * 0.07 + noise2(th * 9 + 3, y * 2) * 0.04
        const bulge = fbm(cx * 5 + y * 1.5, sz * 5 - y * 1.5, 3) * 0.1
        const r = rb + off + (columns + bulge + ledge(y + noise2(th * 6, 1) * 0.03)) * below * (0.5 + depth)
        // grass lip drapes unevenly over the edge
        const drape = y > -0.14 ? noise2(th * 14, 5.3) * 0.02 * (1 - below) : 0
        const v = (i * ROWS + j) * 3
        pos[v] = cx * r
        pos[v + 1] = y + drape
        pos[v + 2] = sz * r
        // ---- colour per vertex ----
        const x = cx * r, z = sz * r
        const n = noise2(x * 5, z * 5 + y * 4) * 0.5 + 0.5
        const strata = Math.sin(y * 55 + noise2(th * 4, y) * 2.5) * 0.5 + 0.5
        c.lerpColors(rockDark, rock, clamp(n * 0.7 + strata * 0.35))
        c.lerp(rockDark, (1 - crack) * 0.75 * below) // shadowed crevices
        c.lerp(rockLight, smoothstep(0.7, 0.95, strata) * 0.45 * (0.6 + n * 0.4)) // pale sandstone beds
        c.lerp(moss, smoothstep(-0.32, -0.18, y) * smoothstep(0.55, 0.85, n) * 0.55)
        // soil band and grass that hangs down in tongues rather than stripes
        const tongue = noise2(th * 11, 2.7) * 0.06
        c.lerp(dirt, smoothstep(-0.16 + tongue, -0.07, y) * 0.7)
        tmp.lerpColors(grassDark, grass, clamp(noise2(x * 6, z * 6) * 0.6 + 0.5))
        tmp.lerp(grassLight, smoothstep(0.55, 0.9, noise2(x * 17, z * 17) * 0.5 + 0.5) * 0.4)
        c.lerp(tmp, smoothstep(-0.1 + tongue, -0.04, y))
        c.lerp(wet, smoothstep(WATER_Y + 0.1, WATER_Y - 0.05, y) * 0.85)
        c.toArray(col, v)
      }
    }
    const idx: number[] = []
    for (let i = 0; i < N; i++)
      for (let j = 0; j < ROWS - 1; j++) {
        const a = i * ROWS + j, b = (i + 1) * ROWS + j
        idx.push(a, b, a + 1, b, b + 1, a + 1)
      }
    const cg = new THREE.BufferGeometry()
    cg.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    cg.setAttribute('color', new THREE.BufferAttribute(col, 3))
    cg.setIndex(idx)
    cg.computeVertexNormals()

    // ---- plateau disk under the tiles ----
    const pg = new THREE.CircleGeometry(3.95, 96)
    pg.rotateX(-Math.PI / 2)
    pg.translate(0, -0.03, 0)
    return { cliff: cg, plateau: pg }
  }, [])

  return (
    <group>
      <mesh geometry={cliff} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.92} />
      </mesh>
      <mesh geometry={plateau} receiveShadow>
        <meshStandardMaterial color="#55682c" roughness={1} />
      </mesh>
    </group>
  )
}
