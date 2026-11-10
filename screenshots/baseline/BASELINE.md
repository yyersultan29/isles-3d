# M0 baseline (2026-11-10, commit bdc6ec0)

## Capture settings
- Command: `DPR=2 WAIT=10000 node scripts/screenshot.mjs http://localhost:5173/ <out> <w> <h>`
- Browser: system Chrome, headless, ANGLE/Metal. Device pixel ratio 2.
- Canvas buffer equals CSS size × DPR (2880×1800 and 3840×2160), so there's no upscaling.
- Camera: the default pose, auto-fit by `CameraRig` (`src/scene/World.tsx`). It uses FOV 30°, elevation 43° and azimuth −0.019 rad, and solves distance and pan for the HUD-free area of each viewport. No `?cam=` override.
- PNG captures are converted to JPEG at quality 88 to keep the repo small.

## Files
- `1440x900@2x.jpg`
- `1920x1080@2x.jpg`

## Renderer measurements (`node scripts/audit.mjs`, 1440×900, DPR 1)
| Metric | Value |
|---|---|
| Visible meshes (≈ draw calls before shadow passes) | 162 |
| InstancedMesh objects / instances | 20 / 15,358 |
| Triangles (instances expanded) | ≈ 1.20 M |
| Materials / geometries | 178 / 154 |
| Transparent materials | 8 |
| Lights | 3 directional, 1 hemisphere, 1 ambient, 0 point |
| GPU textures / shader programs | 58 / 47 |

## Frame rate (headless Chrome on the dev Mac; indicative only)
| Viewport | DPR | FPS |
|---|---|---|
| 1440×900 | 1 | ~60 (vsync cap) |
| 1440×900 | 2 | ~47 |
| 1920×1080 | 2 | ~34 |

## Likely bottlenecks
- Fragment cost at high DPR: N8AO (half-res), PCF soft shadows from a 4096² map, and the full-screen ocean shader with simplex noise.
- Triangle count, mostly instanced wheat (~3k stalks per field) and grass tufts. These are cheap per triangle but drawn again in the shadow pass.

## Visual checks
- Whole board sharp at DPR 2. No DOF, tilt-shift or motion blur in the pipeline.
- All 18 number tokens readable, including "4", which was cleared of tree occlusion in bdc6ec0.
- No console errors during capture.
