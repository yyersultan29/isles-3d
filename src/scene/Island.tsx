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
    const rock = new THREE.Color('#98886f')
    const rockDark = new THREE.Color('#5a4c40')
    const rockLight = new THREE.Color('#c4b498')
    const wet = new THREE.Color('#2f2b28')
    const grass = new THREE.Color('#4c6a24')
    const dirt = new THREE.Color('#8a7356')
    const moss = new THREE.Color('#465e22')

    // ---- cliff ring (faceted) ----
    const rows = PROFILE.length
    const pos: number[] = []
    const grid: THREE.Vector3[][] = []
    for (let i = 0; i <= SEG; i++) {
      const th = (i / SEG) * Math.PI * 2
      const rb = islandRadius(th)
      const col: THREE.Vector3[] = []
      for (let j = 0; j < rows; j++) {
        const [off, y] = PROFILE[j]
        const depth = clamp(-y / 0.8)
        // vertical strata + boulder bulges
        const strata = noise2(th * 38, y * 9) * 0.07 + noise2(th * 90, y * 22) * 0.03
        const bulge = fbm(Math.cos(th) * 6 + y * 2, Math.sin(th) * 6 - y * 2, 3) * 0.12
        const r = rb + off + (j > 2 ? (strata + bulge) * (0.4 + depth) : 0)
        const yy = y + (j > 2 && j < rows - 1 ? noise2(th * 50, j * 3.3) * 0.035 : 0)
        col.push(new THREE.Vector3(Math.cos(th) * r, yy, Math.sin(th) * r))
      }
      grid.push(col)
    }
    for (let i = 0; i < SEG; i++) {
      for (let j = 0; j < rows - 1; j++) {
        const a = grid[i][j], b = grid[i + 1][j], c = grid[i][j + 1], d = grid[i + 1][j + 1]
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
        pos.push(b.x, b.y, b.z, d.x, d.y, d.z, c.x, c.y, c.z)
      }
    }
    const cg = new THREE.BufferGeometry()
    cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    cg.computeVertexNormals()
    const colors = new Float32Array(pos.length)
    const c = new THREE.Color()
    for (let i = 0; i < pos.length; i += 9) {
      const x = (pos[i] + pos[i + 3] + pos[i + 6]) / 3
      const y = (pos[i + 1] + pos[i + 4] + pos[i + 7]) / 3
      const z = (pos[i + 2] + pos[i + 5] + pos[i + 8]) / 3
      const n = noise2(x * 7, z * 7 + y * 5) * 0.5 + 0.5
      c.lerpColors(rockDark, rock, n)
      c.lerp(rockLight, smoothstep(0.65, 0.95, noise2(x * 3, z * 3 + y * 11) * 0.5 + 0.5) * 0.7)
      // grassy lip
      c.lerp(dirt, smoothstep(-0.12, -0.04, y) * 0.6)
      c.lerp(grass, smoothstep(-0.08, -0.035, y) * smoothstep(0.35, 0.7, n))
      c.lerp(moss, smoothstep(-0.3, -0.18, y) * smoothstep(0.6, 0.9, n) * 0.6)
      // wet dark band at and below waterline
      c.lerp(wet, smoothstep(WATER_Y + 0.1, WATER_Y - 0.05, y) * 0.85)
      for (let k = 0; k < 3; k++) c.toArray(colors, i + k * 3)
    }
    cg.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    // ---- plateau disk under the tiles ----
    const pg = new THREE.CircleGeometry(3.95, 96)
    pg.rotateX(-Math.PI / 2)
    pg.translate(0, -0.03, 0)
    return { cliff: cg, plateau: pg }
  }, [])

  return (
    <group>
      <mesh geometry={cliff} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.92} flatShading />
      </mesh>
      <mesh geometry={plateau} receiveShadow>
        <meshStandardMaterial color="#55682c" roughness={1} />
      </mesh>
    </group>
  )
}
