# V8 — Performance audit (2026-11-11)

All numbers are from headless system Chrome (ANGLE/Metal) on the dev Mac. They are indicative
for this machine only, not a promise for other hardware. Reproduce with `node scripts/perf.mjs`.

## Method
- `scripts/perf.mjs [url] [w] [h] [dpr]` measures FPS over 5 s after an 6–8 s warm-up, frame
  pacing, React commits while idle, draw calls and triangles for one full frame (shadow + main +
  post passes, via `renderer.info` with `autoReset` off), shader compile/link time (wrapped GL
  calls), DOMContentLoaded, transferred bytes and the JS heap.
- `UNCAP=1` disables vsync so GPU headroom above 60 fps is visible.
- `PRE='…'` runs JS before measuring. It was used for A/B tests through the dev hook, e.g.
  `__isles.gl.shadowMap.autoUpdate=true` to reproduce the pre-V8 per-frame shadow pass.
- Startup and steady-state CPU profiles were taken with the CDP sampling profiler.
- Visual regressions were checked with a pixel diff of DPR 2 captures at 1440×900, `?nohover`.

## Where the frame time goes (1440×900, DPR 2, uncapped, before V8)
| Configuration | FPS | Reading |
|---|---|---|
| Full pipeline | 52.8 | baseline |
| `?off=ao` (no N8AO) | 84.2 | AO ≈ 37% of the frame |
| `?off=bloom` | 59.3 | bloom ≈ 11% |
| `?nofx` (no post at all) | 127.7 | post ≈ 59% |
| Shadow map frozen | 65.7 | per-frame shadow pass ≈ 20% |
| Instanced meshes stop casting shadows | 55.3 | instanced casters are not the shadow cost |
| All instanced meshes hidden | 60.0 | 15k instances ≈ 12% |
| DPR 1 (same CSS size) | 130.5 | the app is fill-rate bound |
| Steady-state main thread | ~10% busy | CPU, draw calls and React are not the bottleneck |
| HUD `backdrop-filter` disabled | +1 fps | within noise, kept |

**Conclusion:** the GPU is fill-rate bound at high DPR (post-processing, AO, shadow pass).
Cutting draw calls further (they're already batched by `StaticBatch`, 820 → 162 meshes in `bdc6ec0`)
would not move the frame rate. JS is idle about 90% of each frame.

## Changes made (only measurable wins were kept)
1. **Shadow map throttling** (`ShadowThrottle` in `World.tsx`). The sun's shadow map is
   camera-independent and almost every caster is static. Wind sway runs in the vertex shader and
   doesn't reach the depth pass, so only ships, sheep and birds move a shadow. The map is now
   re-rendered every 2nd frame on `high` (every 8th under reduced motion).
2. **`preserveDrawingBuffer: false`.** Nothing reads the canvas back: the screenshot tooling uses
   CDP capture. Dropping it lets the browser swap buffers instead of copying.
3. **Quality presets** (`src/scene/quality.ts`, `?quality=low|medium|high`, default `high`). See below.
4. **WebGL fallback** (`src/scene/SceneGuard.tsx`). No WebGL 2 → notice instead of a canvas; a
   scene exception → error boundary and notice with Reload; context loss → notice, then automatic
   restore.

Tried and reverted: flattening the simplex-noise gradient table (startup noise cost 373 → 367 ms,
inside the noise, so reverted).

## Results — before vs after
FPS (vsync-capped / uncapped). "Before" is V7 behaviour (shadow map every frame).

| Viewport | Buffer | Before | **High (default)** | Medium | Low |
|---|---|---|---|---|---|
| 1440×900 DPR 2 | 2880×1800 | 46.6 / 52.6 | **52.6 / 60.0** | 60 / 95.5 | 60 / 205 |
| 1920×1080 DPR 2 | 3840×2160 | 33.6 / 37.0 | **37.4 / 41.3** | 58 / 67.7 | 60 / 158 |
| 1920×1080 DPR 1 | 1920×1080 | 60 / 96.0 | **60 / 105.6** | 60 / 122 | 60 / 159 |

- Draw calls: 435 on frames that render the shadow map, about 254 on frames that don't (`high`).
  `low` is 194 because there's no AO pass.
- One rerun of the 1080p DPR 1 capped case once read 39.6 fps. Three reruns read 60.0 for both
  before and after, so that reading was measurement noise.
- Roadmap target "60 fps at 1080p on a modern desktop": **met at DPR 1** (105 fps uncapped).
  On a 1080p window at DPR 2 (a 4K buffer) `high` reaches ~37 fps. `medium` reaches 58 fps there.

## Visual regression check (pixel diff, 2880×1800)
| Pair | Mean abs diff | Pixels > 12/255 |
|---|---|---|
| V8 high vs V8 high (animation noise floor) | 0.14 | 0.16% |
| V7 vs V8 high | 0.14 | 0.16% |
| V8 high vs medium | 2.05 | 4.4% |
| V8 high vs low | 5.67 | 14.6% |

`high` is identical to V7 within the noise floor. `medium` and `low` intentionally trade AO and
resolution for speed and are opt-in only. On a DPR 2 screen `low` renders at DPR 1 and the browser
upscales it, which is softer. That is why it's never the default.

## Load and memory (production build, `vite preview --base=/isles-3d/`)
| Metric | Value |
|---|---|
| JS bundle | 1,619 KB minified / 534 KB gzip, one chunk |
| CSS | 33 KB / 6.4 KB gzip |
| Transferred on first load (excluding Google Fonts) | ~530 KB |
| DOMContentLoaded | 0.46–0.87 s (local) |
| First canvas frame | 0.80–1.23 s |
| Longest startup frame (procedural geometry build) | 0.9 s |
| Shader compile/link time (blocking GL calls) | ~0.2 s, 48 programs |
| JS heap after load | ~48 MB (prod), 75–107 MB (dev) |
| Geometry buffers | ~22 MB |
| Material textures | 21 canvas textures, 64²–512², ~15 MB with mips |
| Sun shadow map | 4096² depth = 64 MB (`high`), 16 MB (`medium`/`low`) |
| React commits while idle | 0 in 5 s (5 at startup, 1 per resize) |

Bundle by package (minified): three 691 KB, react-dom 182 KB, postprocessing 158 KB, n8ao 138 KB,
react-reconciler 110 KB, gsap 69 KB, three-stdlib 45 KB, fiber 30 KB, app code ~90 KB. There's no
dead weight worth splitting out yet.

Startup CPU profile (dev): `noise2` 373 ms, `mergeVertices` 172 ms, `mountainHeight` 108 ms,
`buildTileGeometry` 107 ms. This is procedural terrain generation, which runs once. A future option
is to move it into a Web Worker or precompute it at build time. That is a structural change, so it
wasn't done in V8.

## Quality presets
| Preset | DPR | Shadow map | AO | Bloom | Shadow refresh |
|---|---|---|---|---|---|
| `high` (default) | 1–2 | 4096² | N8AO medium, half-res | on | every 2nd frame |
| `medium` | 1–1.5 | 2048² | N8AO low, half-res | on | every 2nd frame |
| `low` | 1 | 2048² | off | on | every 3rd frame |

There's no automatic downgrade: a preset that switched by itself would make fixed-pose screenshots
non-reproducible. Automatic selection (e.g. drei `PerformanceMonitor`) is a possible follow-up.

## Not done / open
- Testing on real lower-tier devices (integrated GPUs, phones). Only this Mac and headless Chrome
  were measured.
- Running the actual GitHub Pages deploy: `npm run deploy` force-pushes `gh-pages` and needs
  explicit approval. The Pages base path (`/isles-3d/`) was verified locally with `vite preview`:
  all assets 200, no console errors.
