import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { islandRadius, WATER_Y, ISLAND_APOTHEM } from './board'
import { SIMPLEX_GLSL } from './shaders'

const time = { value: 0 }

/** Lit PBR ocean with procedural swell normals and depth-based colouring. */
function Water() {
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.0, envMapIntensity: 0.22 })
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time
      shader.uniforms.uDeep = { value: new THREE.Color('#021120') }
      shader.uniforms.uMid = { value: new THREE.Color('#06243a') }
      shader.uniforms.uShallow = { value: new THREE.Color('#0d515a') }
      shader.uniforms.uApo = { value: ISLAND_APOTHEM }
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nuniform float uTime;\nvarying vec3 vWPos;`)
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec4 wp0 = modelMatrix * vec4(transformed, 1.0);
          transformed.z += 0.018 * sin(wp0.x * 1.3 + uTime * 0.9) + 0.012 * sin(wp0.z * 2.1 - uTime * 1.3);
          vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
        )
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uTime; uniform vec3 uDeep; uniform vec3 uMid; uniform vec3 uShallow; uniform float uApo;
          varying vec3 vWPos;
          ${SIMPLEX_GLSL}
          float islandR(vec2 p){
            float th = atan(p.y, p.x);
            float seg = 1.04719755;
            float t = mod(th, seg) - seg * 0.5;
            return min(uApo / cos(t), uApo * 1.1);
          }
          float H(vec2 p){
            float t = uTime;
            return 0.55 * snoise(p * vec2(0.9, 1.4) + vec2(t * 0.11, t * 0.05))
                 + 0.30 * snoise(p * 2.3 + vec2(-t * 0.21, t * 0.14))
                 + 0.15 * snoise(p * 5.7 + vec2(t * 0.4, -t * 0.33))
                 + 0.03 * snoise(p * 13.0 + vec2(-t * 0.7, t * 0.6));
          }`,
        )
        .replace(
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          `float dIsl = length(vWPos.xz) - islandR(vWPos.xz);
          float nC = snoise(vWPos.xz * 0.35) * 0.5 + 0.5;
          vec3 wcol = mix(uShallow, uMid, smoothstep(0.05, 0.8 + nC * 0.6, dIsl));
          wcol = mix(wcol, uDeep, smoothstep(1.2, 6.5, dIsl));
          // lighter wave crests give the surface visible structure
          float crest = smoothstep(0.45, 0.9, H(vWPos.xz * 0.6));
          wcol = mix(wcol, wcol * 1.35 + vec3(0.01, 0.018, 0.026), crest * 0.14);
          vec4 diffuseColor = vec4(wcol, opacity);`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `{
            vec2 p = vWPos.xz;
            float e = 0.03;
            float h0 = H(p);
            float hx = H(p + vec2(e, 0.0));
            float hz = H(p + vec2(0.0, e));
            float amp = 0.03;
            vec3 nW = normalize(vec3(-(hx - h0) / e * amp, 1.0, -(hz - h0) / e * amp));
            normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
          }`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          // faint subsurface glow in the shallows
          totalEmissiveRadiance += uShallow * 0.05 * (1.0 - smoothstep(0.0, 1.2, dIsl));`,
        )
    }
    return m
  }, [])

  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, WATER_Y, 0]} receiveShadow material={mat}>
      <planeGeometry args={[90, 90, 220, 220]} />
    </mesh>
  )
}

/** Animated foam band hugging the exact cliff outline. */
function Foam() {
  const { geo, mat } = useMemo(() => {
    const SEG = 720
    const RINGS = 10
    const pos: number[] = []
    const uv: number[] = []
    const idx: number[] = []
    for (let i = 0; i <= SEG; i++) {
      const th = (i / SEG) * Math.PI * 2
      const rb = islandRadius(th)
      for (let j = 0; j <= RINGS; j++) {
        const v = j / RINGS
        const r = rb + 0.04 + v * 0.85
        pos.push(Math.cos(th) * r, 0, Math.sin(th) * r)
        uv.push(i / SEG, v)
      }
    }
    for (let i = 0; i < SEG; i++)
      for (let j = 0; j < RINGS; j++) {
        const a = i * (RINGS + 1) + j
        const b = a + RINGS + 1
        idx.push(a, a + 1, b, b, a + 1, b + 1)
      }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.setIndex(idx)
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: time },
      vertexShader: `varying vec2 vUv; varying vec3 vW;
        void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uTime; varying vec2 vUv; varying vec3 vW;
        ${SIMPLEX_GLSL}
        void main(){
          float v = vUv.y;
          vec2 p = vW.xz;
          float n = snoise(p * 4.0 + uTime * 0.2) * 0.5 + 0.5;
          float n2 = snoise(p * 11.0 - uTime * 0.35) * 0.5 + 0.5;
          float shore = 1.0 - smoothstep(0.06, 0.28 + n * 0.12, v);
          // waves rolling in toward the shore
          float w = fract(v * 3.2 + uTime * 0.18 + n * 0.5);
          float ring = smoothstep(0.0, 0.08, w) * (1.0 - smoothstep(0.08, 0.32, w));
          ring *= smoothstep(0.45, 0.75, n2 + n * 0.3) * (1.0 - smoothstep(0.15, 0.9, v));
          float lace = smoothstep(0.58, 0.8, n2) * (1.0 - smoothstep(0.1, 0.6, v)) * 0.65;
          float a = max(shore * (0.65 + 0.35 * n2), max(ring * 0.85, lace));
          gl_FragColor = vec4(vec3(0.9, 0.95, 0.97), min(1.0, a * 1.05));
        }`,
    })
    return { geo: g, mat: m }
  }, [])
  return <mesh geometry={geo} material={mat} position={[0, WATER_Y + 0.008, 0]} renderOrder={2} />
}

export function Ocean() {
  const t0 = useRef(0)
  useFrame((_, dt) => {
    t0.current += Math.min(dt, 0.05)
    time.value = t0.current
  })
  return (
    <group>
      <Water />
      <Foam />
    </group>
  )
}

export const oceanTime = time
