// Shared GLSL snippets.

export const SIMPLEX_GLSL = /* glsl */ `
vec3 _p3(vec3 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = _p3(_p3(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
`

/** Wind sway injected into a MeshStandardMaterial vertex shader (instanced foliage). */
export function addWind(
  shader: { uniforms: Record<string, { value: unknown }>; vertexShader: string },
  time: { value: number },
  strength = 0.04,
) {
  shader.uniforms.uTime = time
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\nuniform float uTime;`)
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      {
        vec4 wp = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float k = max(position.y, 0.0);
        float ph = wp.x * 1.7 + wp.z * 1.3;
        transformed.x += sin(uTime * 1.6 + ph) * ${strength.toFixed(3)} * k * k * 6.0;
        transformed.z += cos(uTime * 1.2 + ph * 0.8) * ${(strength * 0.6).toFixed(3)} * k * k * 6.0;
      }`,
    )
}
