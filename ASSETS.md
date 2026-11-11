# Isles 3D — Assets, licenses and pipeline

Last audited: 2026-11-11 (V8).

## 1. What ships today

**There are no binary art assets in the build.** No GLB/GLTF models, image textures, HDRIs or audio.
Everything visible is generated at runtime from code in this repository.

| Asset | How it is made | Source file(s) | Owner / license |
|---|---|---|---|
| Hex terrain, mountains, island cliffs, plateau | procedural meshes (simplex noise, lathe/polar grids) | `src/scene/Terrain.tsx`, `Island.tsx`, `board.ts`, `noise.ts` | project-original |
| Trees, bushes, grass, wheat, stones, sheep | procedural instanced meshes | `src/scene/Vegetation.tsx`, `models.ts` | project-original |
| Houses, cities, roads, robber, number tokens | procedural meshes, canvas-drawn token faces | `src/scene/Pieces.tsx`, `textures.ts` | project-original |
| Harbors, docks, signs, ships, birds, smoke | procedural meshes, canvas-drawn sign faces | `Harbors.tsx`, `Ships.tsx`, `Scenery.tsx`, `Smoke.tsx` | project-original |
| Ocean, foam, wind | GLSL injected via `onBeforeCompile` | `Ocean.tsx`, `shaders.ts` | project-original |
| Surface detail textures (21) | `CanvasTexture`s painted at startup, 64²–512² | `src/scene/textures.ts` | project-original |
| Environment lighting | drei `<Environment>` built from `<Lightformer>` panels (no HDR file is downloaded) | `World.tsx` | project-original |
| HUD icons, avatars, resource illustrations, logo | hand-written inline SVG | `src/ui/icons.tsx`, `HUD.tsx`, `index.html` favicon | project-original |
| Fonts: Fredoka, Inter | Google Fonts CDN, loaded in `index.html` | — | SIL Open Font License 1.1 (both) |

The brand name lives in `src/brand.ts`. The project must not use third-party game branding.

### Reference material (not shipped)
`references/colonist-reference.png` is a third-party screenshot used only for visual comparison.
It is gitignored, never embedded in the scene and never deployed. The same goes for
`references/render-latest.png`.

## 2. Runtime dependencies (bundled into `dist/`)
| Package | Version | License | Obligation |
|---|---|---|---|
| three | 0.180.0 | MIT | keep copyright notice |
| @react-three/fiber | 9.4.0 | MIT | keep copyright notice |
| @react-three/drei | 10.7.6 | MIT | keep copyright notice |
| three-stdlib | 2.36.1 | MIT | keep copyright notice |
| @monogrid/gainmap-js (via drei) | 3.7.3 | MIT | keep copyright notice |
| @react-three/postprocessing | 3.0.4 | MIT | keep copyright notice |
| postprocessing | 6.37.8 | Zlib | don't misrepresent origin |
| n8ao | 1.10.3 | ISC | keep copyright notice |
| react, react-dom | 19.2.0 | MIT | keep copyright notice |
| gsap | 3.13.0 | GSAP Standard "no charge" license (https://gsap.com/standard-license) | free for commercial use; not OSI open source, so review the terms before redistributing GSAP itself |

Minified bundles keep the license headers that the packages ship. If the project is distributed
commercially, generate a `THIRD_PARTY_LICENSES` file (for example with `rollup-plugin-license`)
before release.

## 3. Rules for adding assets
1. **Licence first.** Use only CC0, CC-BY (with attribution recorded here), purchased licenses
   with written terms, or project-original work. Never import ripped or "found" game assets.
2. **Record every asset** in the table above: file, source URL, author, license and attribution
   text, date added, and any modifications.
3. Keep editable sources (`.blend`, `.psd`) out of the web build. Store them separately or with
   Git LFS, and commit only optimized runtime files under `public/assets/`.

## 4. Compression strategy (for future GLB/texture assets)
None of this is needed while everything is procedural. It's the agreed pipeline once binary assets
arrive:

| Asset type | Tool | Settings | Loader |
|---|---|---|---|
| GLB geometry | `@gltf-transform/cli` | `optimize --compress meshopt` (or `draco` for very dense meshes), `dedup`, `prune`, `weld`, quantize positions to 14 bit | drei `useGLTF` with the meshopt decoder |
| Color textures | `gltf-transform etc1s` → KTX2/Basis | ETC1S, quality 128–192, max 1024² for props, 2048² only for hero assets | `KTX2Loader` (transcoder from `three/examples/jsm/libs/basis`) |
| Normal / roughness maps | `gltf-transform uastc` → KTX2 | UASTC + zstd level 18 | `KTX2Loader` |
| UI images | SVG preferred; otherwise WebP or AVIF at 2× size | — | `<img>` |

Budgets: keep the whole first-load transfer under ~3 MB gzip, any single GLB under 1 MB, and the
GPU texture total under 64 MB on the `high` preset. Share materials across models, and instance
anything repeated more than ~10 times (see `Inst` / `useInstances` in `Vegetation.tsx`).

## 5. Build and deployment
- `npm run build` runs `tsc -b` and `vite build` into `dist/`.
- `npm run deploy` builds with `--base=/<repo>/` (currently `/isles-3d/`), adds `.nojekyll` and a
  `404.html` copy, and force-pushes `dist/` to the `gh-pages` branch. It only runs with explicit
  approval, because it pushes.
- The Pages path was verified locally in V8 with
  `npx vite build --base=/isles-3d/ && npx vite preview --base=/isles-3d/`: the page and hashed
  assets return 200, the scene renders, and there are no console errors.
