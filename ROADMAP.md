# Isles 3D — Development Roadmap

> **Project:** Isles 3D — premium stylized 3D hex-board strategy game  
> **Stack:** React, TypeScript, Vite, Three.js, React Three Fiber, Drei  
> **Primary reference:** `references/colonist-reference.png`  
> **Current baseline:** working 3D island with hex terrain, ocean, buildings, vegetation, ports, decorative islands and HUD.  
> **Priority:** visual fidelity first; gameplay only after visual sign-off.

## 1. Product vision

Create a polished, responsive, real-time 3D tabletop strategy experience inspired by hex-based resource games. The world should look like a premium handcrafted miniature diorama: readable terrain, convincing materials, coherent art direction, attractive coastline, clear player pieces, and crisp UI. All board geometry must be genuinely 3D, never a flat image of the reference.

**Not the goal:** an exact asset-for-asset copy of another game's protected art, or an unverified claim of pixel-perfect similarity. Use original or properly licensed assets.

### Visual principles

- **Readable before realistic:** numbers, roads, player colors, and tile boundaries must remain clear at default zoom.
- **Stylized realism:** rich but controlled detail, natural silhouettes, warm daylight, restrained bloom and specular highlights.
- **Consistent scale:** buildings, trees, sheep, ships, cliffs, docks and roads must feel part of the same miniature world.
- **Stable camera:** changes to framing must be explicitly approved, not side effects of asset work.
- **Sharp canvas:** no depth-of-field, motion blur, tilt-shift, or aggressive upscaling by default.
- **Performance-aware:** reuse materials and geometries, instance repeated objects, measure rather than guess.

## 2. Working agreement for Claude Code

1. Read this file, inspect the current repository and the reference image before making changes.
2. Start each milestone with a short audit: relevant files, current behavior, risks and a small implementation plan.
3. Work on **one milestone at a time**. Do not silently start the next milestone.
4. Preserve existing features and visual improvements; avoid wholesale rewrites without justification.
5. Create a dedicated branch or checkpoint commit before risky changes.
6. After each milestone: run available typecheck/lint/build commands, capture a screenshot at the agreed viewport, compare with the reference, and summarize results.
7. Do not assert a visual result without inspecting an actual browser screenshot. If screenshot tooling is unavailable, explicitly say so.
8. Update the checklist, decisions, changed files and validation notes in this roadmap after completion.
9. Ask before installing paid assets, changing dependencies substantially, modifying camera/HUD, or introducing game mechanics.
10. Do not commit secrets, large unoptimized source assets, or unlicensed models.

### Standard milestone completion report

- What changed (with filenames)
- Before/after screenshots or screenshot paths
- What improved and what still differs from the reference
- Tests/build results and observed runtime performance
- Known regressions or tradeoffs
- Git commit hash and recommended next milestone

## 3. Baseline and measurement (M0)

**Objective:** establish a reproducible baseline before further visual work.

- [x] Confirm repository installs and runs locally.
- [x] Identify actual components responsible for scene, ocean, terrain, vegetation, pieces, scenery, camera, and HUD; do not assume filenames. These are `src/scene/World.tsx` (canvas, camera rig, lights, post-processing), `Ocean.tsx`, `Terrain.tsx`, `Island.tsx`, `Vegetation.tsx`, `models.ts`, `Pieces.tsx`, `Harbors.tsx`, `Ships.tsx`, `Scenery.tsx`, and `src/ui/HUD.tsx`.
- [x] Save current screenshot at **1920×1080** and **1440×900** using a fixed camera pose and consistent device pixel ratio. Saved in `screenshots/baseline/` at DPR 2.
- [x] Save the reference image under `references/colonist-reference.png`. It's kept locally and is gitignored, because it carries third-party branding.
- [x] Record FPS, draw calls, triangles, textures, renderer pixel ratio, and GPU/CPU bottlenecks where measurable. See `screenshots/baseline/BASELINE.md`.
- [x] Verify entire board is sharp and number tokens are readable.
- [x] Create a checkpoint commit. Tagged `m0-baseline`.

**Exit criteria:** baseline screenshots, measurements, and a clean build exist. No visual modifications required.

---

## 4. Visual-first milestones

### V3 — Premium environment assets (highest priority)

**Objective:** move from repetitive procedural low-poly to coherent premium stylized realism without changing board layout, HUD or camera.

**Vegetation**
- [x] Audit current trees, grass, shrubs, wheat and sheep.
- [x] Introduce 4–6 visually distinct conifer silhouettes with natural scale/rotation/color variation. There are six conifers plus two broadleaf variants.
- [x] Add small bushes, stones and subtle ground cover where it improves the scene.
- [x] Thin dense forests enough to keep number tokens and buildings readable. Each token's line of sight to the camera is kept clear.
- [x] Use instancing / geometry reuse for repeated vegetation.

**Mountains and cliffs**
- [x] Improve large-scale mountain silhouettes before adding polygon density. Done in V3.1: 2–3 capsule massifs per tile with a saddle ridge. The triangle count is unchanged (≈1.20M).
- [x] Add layered rock colors, believable ridges, crevices and controlled snow coverage. Done in V3.1: radial erosion gullies, rock buttresses and soft strata ledges, plus curvature-based snow that forms caps on top and streaks in the gullies.
- [x] Add sparse rock debris at bases and avoid harsh repetitive triangular patterns. The mountains were done in V3.1. In V3.2 the boulders became rounded, smooth-shaded weathered stones with fracture planes and moss, and the island cliffs became a smooth-shaded layered sea cliff.
- [x] Preserve hex tile coordinates and height relationships. Verified in V3.1: the token plateau and the zero height at the rails are unchanged, and all three mountain tokens are readable.

**Settlements and pieces**
- [x] Improve roofs, timber/stone details, doors, windows and chimneys.
- [x] Preserve distinct red, blue, orange and white player colors.
- [x] Ensure houses sit on valid vertices and roads follow edges.
- [x] Keep miniature-scale detail visible at default zoom. Verified in the V3 exit review: roofs, chimneys, lit windows, shutters and road segments are visible at the default pose at 1440×900 and 1920×1080.

**Terrain and coast**
- [x] Improve grass, clay, wheat, stone and sand material variation. Done in V3.3: olive pasture with worn-earth patches, earthier clay with dusty crests and scrub in the hollows, wheat with ripening and stubble field patches, and wind ripples on the desert.
- [x] Soften unnatural seams while preserving tile boundaries. Done in V3.3: a ragged, narrow strip of trodden earth plus contact darkening at the rails replaces the bright dirt outline. The island lip and the plateau now share the pasture turf palette, and the lip has denser rows so the faceting is gone.
- [x] Add tasteful shoreline rocks and improve cliff-to-water transition.
- [x] Preserve existing ocean shader except for necessary coastline integration. Verified: `Ocean.tsx` and `World.tsx` are unchanged since `m0-baseline`.

**Exit criteria:** side-by-side screenshots show clear improvements in silhouette/material quality, with no new blur, missing pieces, broken tile placement or noticeable readability regression.

### V4 — Lighting, materials and water art direction

**Objective:** establish consistent lighting and calmer, more attractive ocean rendering.

- [x] Audit tone mapping, exposure, ambient/directional light and shadow configuration. The pipeline is ACES in post with a warm key sun and hemisphere, ambient, front and rim fills plus an env map. The fills were too strong and the sky fill too blue, which washed out the biomes.
- [x] Balance warm sunlight and cooler shadows; avoid crushed blacks or overexposed wheat. V4.1 makes the sun warmer and stronger, lowers the fills and the sky dome, sets saturation to +0.08 and brightness to 0. Measured region means moved toward the reference (clay rgb 145,77,33 → 124,54,16). Forests keep detail and wheat isn't clipped.
- [x] Reduce noisy, excessively bright ocean specular reflections. Verified: no glare at the locked pose (roughness 0.42, env 0.09, normals calmed with distance).
- [x] Establish a deep-blue-to-turquoise coastal color gradient. The existing gradient is now visible because the foam no longer covers the shallows.
- [x] Improve shoreline foam without making it a thick white outline. V4.2 replaces the solid band with a narrow, broken contact line, lace around the coastal boulders and sparse wave lines.
- [x] Tune roughness/metalness and material response consistently across assets. Audited: natural materials 0.75–1, painted pieces 0.5–0.7, robber 0.32, only the brass rivets are metallic. No changes needed.
- [x] Confirm number tokens, ports, and player roads stay readable. Verified at 1440×900 and 1920×1080.
- [x] Keep the entire main board sharp; **do not add DOF or motion blur**. No new effects were added and the camera is unchanged.

**Exit criteria:** water no longer dominates the frame, terrain has balanced contrast, screenshots remain sharp, and lighting is consistent from the locked camera.

### V5 — Ambient micro-animations

**Objective:** make the world feel alive without distracting from the board.

- [x] Gentle wave movement and shoreline foam animation. Already present; verified it animates on the shared clock.
- [x] Subtle tree/wheat wind animation with varied phase. Already present; the phase comes from each instance's world position.
- [x] Restrained lantern flicker and chimney smoke. V5 makes the lantern flicker slower and softer (±6%/±3.5% instead of ±12%/±8% at 8/21 Hz). New `Smoke.tsx` adds one instanced mesh of thin wisps from every chimney.
- [x] Small ship movement and cloth-sail motion, avoiding collision with ports. Already present: bobbing, a small orbit of r ≤ 0.35 and billowing sails. No overlap with the docks at the default pose.
- [x] Optional distant birds and sheep idle motions. Birds were already present. Sheep now slowly turn while grazing and breathe, holding still most of the time.
- [x] Pause/reduce nonessential animation when tab is hidden or reduced-motion is enabled. New `motion.ts` provides a shared clamped clock, so hidden tabs pause via rAF and resume without a jump. `prefers-reduced-motion` (or `?reducedmotion`) slows motion to 12% and hides smoke and birds. Measured: 15.7% → 4.8% of pixels changing per second.
- [x] Avoid per-frame allocations and excessive React state updates. Every frame loop reuses preallocated objects and none of them sets React state.

**Exit criteria:** animation is subtle, stable, respects reduced-motion preference, and does not significantly degrade baseline performance.

### V6 — HUD and interface polish

**Objective:** refine the existing React overlay without sacrificing board visibility.

- [ ] Standardize spacing, typography, panel radii, border weights, and iconography.
- [ ] Improve resource-card illustration consistency and legibility.
- [ ] Refine player cards, dice tray, build menu, left navigation, and hover/focus states.
- [ ] Ensure sufficient contrast over bright/dark water.
- [ ] Add responsive layouts for 1440×900, 1920×1080, tablet and narrow screens.
- [ ] Keep HUD as DOM for accessibility and crisp text.
- [ ] Preserve current visual hierarchy; avoid covering tile numbers or ports.

**Exit criteria:** crisp, consistent UI at desktop sizes; usable smaller-screen fallback; keyboard-visible focus and no overlapping panels.

### V7 — Camera, interaction and visual QA

**Objective:** make the finished scene comfortable to inspect without implementing gameplay.

- [ ] Lock and document the default camera pose and zoom.
- [ ] Smooth orbit/zoom with bounds preventing clipping and under-board views.
- [ ] Optional hover highlight for tiles, edges and vertices (visual only).
- [ ] Add screenshot/debug presets and a way to reset the camera.
- [ ] Verify no accidental DOF, blur, stretching or low-resolution render target.
- [ ] Test common aspect ratios and high-DPI screens.
- [ ] Compare fixed-pose screenshots to reference for composition, terrain, water, pieces and HUD.

**Exit criteria:** visually approved scene and reproducible screenshots, with no camera/blur regressions.

### V8 — Performance and asset pipeline

**Objective:** make the visual build robust and maintainable.

- [ ] Measure FPS, draw calls, triangles, memory, shader compile and load times.
- [ ] Consolidate materials, instance repeated meshes and remove invisible objects where appropriate.
- [ ] Optimize textures and GLB/GLTF assets; document compression strategy.
- [ ] Add quality presets if needed (low/medium/high) without changing game logic.
- [ ] Add fallback behavior for WebGL errors or unsupported devices.
- [ ] Document asset sources, licenses, attribution and ownership.
- [ ] Validate production build and GitHub Pages deployment paths.

**Suggested targets (validate on real devices):** aim for 60 FPS on a modern desktop at 1080p; accept 30+ FPS on lower-tier devices when using a reduced quality preset. Treat these as goals, not promises.

**Exit criteria:** measured performance and documented asset pipeline; no material visual regression.

---

## 5. Gameplay milestones — only after visual sign-off

### G1 — Board model and rules foundation

- [ ] Represent 19 tiles with axial/cube coordinates, terrain type and number token.
- [ ] Model vertices, edges, roads, settlements, cities and ports independently of rendering.
- [ ] Define deterministic seeded board generation and validation.
- [ ] Add pure rules functions with unit tests.
- [ ] Separate game state from scene presentation.

### G2 — Turn loop and resource production

- [ ] Implement player turns and dice rolls.
- [ ] Produce resources from eligible tiles and settlements/cities.
- [ ] Implement robber behavior and seven-roll rules as specified by the chosen game design.
- [ ] Display clear visual feedback without compromising the art direction.
- [ ] Unit-test edge cases and resource accounting.

### G3 — Building, trading and victory

- [ ] Validate placement rules and resource costs.
- [ ] Implement roads, settlements and cities with animated placement.
- [ ] Implement bank/port trading and optional player trading.
- [ ] Add development cards and scoring only after rules are finalized.
- [ ] Implement victory conditions and endgame UI.

### G4 — Multiplayer and deployment

- [ ] Choose server-authoritative architecture and transport.
- [ ] Implement lobby, room state, reconnect and turn synchronization.
- [ ] Validate actions server-side and prevent client-authoritative cheating.
- [ ] Add error handling, logging, basic analytics and accessibility QA.
- [ ] Deploy and load-test realistic room sizes.

> Gameplay scope and rules should be reviewed before implementation. Avoid copying proprietary assets, branding or interface text from other products.

---

## 6. Suggested code organization (adapt to actual repo)

```text
src/
  app/                 # bootstrapping, providers, styles
  scene/               # Canvas, world, camera, lighting
  world/
    board/             # hex geometry, terrain, tile coordinates
    environment/       # ocean, coast, scenery, atmosphere
    assets/            # trees, mountains, buildings, ships
  game/                # future pure rules and game state
  ui/                  # HUD and React components
  shared/              # math, materials, hooks, constants
references/
  colonist-reference.png
screenshots/
  baseline/
  milestones/
ROADMAP.md
```

Do not reorganize existing files merely to match this suggestion. Refactor only when it reduces real complexity.

## 7. Visual review checklist (every milestone)

- [ ] Default camera and island framing unchanged unless explicitly approved.
- [ ] Main board and number tokens are sharp and readable.
- [ ] Terrain silhouettes are distinct and coherent.
- [ ] Roads and player-colored pieces are clearly visible.
- [ ] Water is attractive but does not dominate attention.
- [ ] UI remains crisp and does not overlap critical board elements.
- [ ] No missing assets, console errors, severe z-fighting or shadow artifacts.
- [ ] Build passes and FPS/quality are compared with baseline.
- [ ] Reference and result screenshots captured at identical viewport/camera settings.

## 8. Progress log

| Milestone | Status | Commit / PR | Screenshot | Notes |
|---|---|---|---|---|
| M0 — Baseline | Done | `m0-baseline` | `screenshots/baseline/` | 162 meshes, ≈1.2M tris, ~47 fps @1440×900 DPR2 |
| V3 — Environment assets | Done | `2c4fdb8`, `bdc6ec0`, `a10ff78`, `d8d17e8`, `9d1895a`, V3.4 | `screenshots/milestones/v3.4/` | V3.1 mountains, V3.2 cliffs and boulders, V3.3 materials and seams done; exit review in `screenshots/milestones/v3-exit/`: all criteria pass. V3.4 polish (`screenshots/milestones/v3.4/`): crisper snow edges, outcrops leaning into the slope, ground cover on the rim strip. 162 meshes, ≈1.26M tris, ~47 fps @1440×900 DPR2 |
| V4 — Lighting & water | Done | `bba5a95`, `2c4fdb8`, V4 | `screenshots/milestones/v4/` | V4.1 warm light balance, V4.2 broken lacy foam; materials audited. 162 meshes, ≈1.26M tris, ~47 fps @1440×900 DPR2 |
| V5 — Micro-animations | Done | V5 | `screenshots/milestones/v5/` | Shared clock and reduced-motion, chimney smoke, sheep idle, softer lanterns. 163 meshes (+1), ~47 fps @1440×900 DPR2 (unchanged) |
| V6 — HUD polish | Not started | — | — | Responsive |
| V7 — Camera & visual QA | Not started | — | — | Locked reference pose |
| V8 — Performance | Started | `bdc6ec0` | — | Static batching 820→162 meshes; point lights removed |
| G1–G4 — Gameplay | Backlog | — | — | After visual approval |

## 9. How to instruct Claude Code

Use this at the start of a session:

> Read `ROADMAP.md` and inspect the current project and `references/colonist-reference.png`. We are working on **[MILESTONE]** only. First audit relevant code and propose a concise plan. Implement only this milestone while preserving camera, sharpness, HUD and existing features. Validate with build/typecheck and screenshot comparison. Update the roadmap progress log and report changed files, visual differences, tests, performance observations and commit hash. Do not start the next milestone without approval.

**Recommended next action:** **V6**: HUD and interface polish.
