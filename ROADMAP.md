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

- [x] Standardize spacing, typography, panel radii, border weights, and iconography. V6.1 adds shared tokens (`panel`, `focusRing`), sets panels to r-12 and controls/cards to r-8/9, and uses 14/15 px for UI text and 20 px for display text.
- [ ] Improve resource-card illustration consistency and legibility. Deferred at the V6 sign-off; tracked as a follow-up.
- [x] Refine player cards, dice tray, build menu, left navigation, and hover/focus states. Build rows are now real buttons with hover. Nav has `aria-current`, icon buttons have labels and hover, and every control has a gold `focus-visible` ring. Dice skip the bounce under reduced motion.
- [x] Ensure sufficient contrast over bright/dark water. Panels are opaque (88–90%), and the focus ring uses an offset so it reads over water and over panels.
- [x] Add responsive layouts for 1440×900, 1920×1080, tablet and narrow screens. V6.2 adds `CompactHUD` for narrow or portrait screens: a top bar with the menu, players and help, plus a bottom dock with Roll, Undo, Chat, a Build popover and the resource hand. Text is ≥ 12 px. Camera fitting keeps the whole board and every port between the bars, with the orbit limit and fog pushed out to match. Desktop framing is unchanged.
- [x] Keep HUD as DOM for accessibility and crisp text.
- [x] Preserve current visual hierarchy; avoid covering tile numbers or ports. The desktop layout is identical to V5. In compact mode only the user-opened Build or menu popovers overlap the board.

**Exit criteria:** crisp, consistent UI at desktop sizes; usable smaller-screen fallback; keyboard-visible focus and no overlapping panels.

### V7 — Camera, interaction and visual QA

**Objective:** make the finished scene comfortable to inspect without implementing gameplay.

- [x] Lock and document the default camera pose and zoom. See `screenshots/milestones/v7/CAMERA.md`: the fixed angle is auto-fitted per viewport and HUD layout, and the home pose is recorded for reset.
- [x] Smooth orbit/zoom with bounds preventing clipping and under-board views. Damped orbit, distance 6–22 (the zoom-out limit is never closer than home), tilt ≥ 21° above the horizon, and pan clamped to 2.6 units around home. Tested by dragging and zooming to the extremes.
- [x] Optional hover highlight for tiles, edges and vertices (visual only). `TileHover.tsx` adds a soft ring inside the rails using math picking with no mesh raycasts. Fine pointers only, hidden while dragging, `?nohover` turns it off. Tiles only, no edges or vertices; those wait for gameplay.
- [x] Add screenshot/debug presets and a way to reset the camera. `?view=top|low|close`, `?nohover`, and reset with double-click or `R`.
- [x] Verify no accidental DOF, blur, stretching or low-resolution render target. Buffer = CSS × min(DPR, 2), verified at DPR 1, 2 and 3. The post chain was audited and has no blur effects.
- [x] Test common aspect ratios and high-DPI screens. Tested 21:9 (2560×1080), 16:9 (2560×1440, 1920×1080, 1366×768, 1280×720), 16:10, 4:3, portrait tablet and phone, landscape phone, and DPR 1, 2 and 3.
- [x] Compare fixed-pose screenshots to reference for composition, terrain, water, pieces and HUD. The default pose matches V6 pixel-for-pixel in composition. Remaining gaps vs the reference are wheat hue and denser forest canopy; see the V7 notes.

**Exit criteria:** visually approved scene and reproducible screenshots, with no camera/blur regressions.

### V8 — Performance and asset pipeline

**Objective:** make the visual build robust and maintainable.

- [x] Measure FPS, draw calls, triangles, memory, shader compile and load times. New `scripts/perf.mjs`; results in `screenshots/milestones/v8/PERF.md`. The app is GPU fill-rate bound: post-processing is ≈59% of the frame at DPR 2, AO ≈37%, the shadow pass ≈20%. The main thread is ~10% busy and React makes 0 commits while idle.
- [x] Consolidate materials, instance repeated meshes and remove invisible objects where appropriate. Batching (820→162 meshes) and instancing were already in place. The audit shows that cutting draw calls further would not change FPS because the CPU isn't the bottleneck. The measurable win was re-rendering the static sun shadow map every 2nd frame instead of every frame, plus dropping `preserveDrawingBuffer`. Result: 46.6→52.6 fps at 1440×900 DPR 2 (vsync) and 33.6→37.4 at 1920×1080 DPR 2. The pixel diff against V7 is at the noise floor.
- [x] Optimize textures and GLB/GLTF assets; document compression strategy. There are no GLB/image assets: everything is procedural, with 21 small canvas textures (64²–512²). The bundle is 534 KB gzip, mostly three.js. The compression pipeline for future assets (gltf-transform with meshopt/Draco, KTX2 ETC1S/UASTC) and budgets are in `ASSETS.md`.
- [x] Add quality presets if needed (low/medium/high) without changing game logic. `?quality=low|medium|high` in `src/scene/quality.ts`; the default `high` is the signed-off look. At 1920×1080 DPR 2: high 37 fps, medium 58, low 60 (vsync).
- [x] Add fallback behavior for WebGL errors or unsupported devices. `src/scene/SceneGuard.tsx` handles three cases: no WebGL 2 (or `?nowebgl`) shows a notice, a scene exception goes to an error boundary that offers Reload, and context loss shows a notice until the context is restored automatically. All three were tested in headless Chrome, including with WebGL disabled.
- [x] Document asset sources, licenses, attribution and ownership. See `ASSETS.md`: all art is project-original procedural or SVG, fonts are OFL, and dependencies are MIT/ISC/Zlib plus the GSAP standard license. The reference image is never shipped.
- [x] Validate production build and GitHub Pages deployment paths. `vite build --base=/isles-3d/` with `vite preview` serves the page and assets with 200 and no console errors. The actual `npm run deploy` (force-push to `gh-pages`) was not run; it needs approval.

**Suggested targets (validate on real devices):** aim for 60 FPS on a modern desktop at 1080p; accept 30+ FPS on lower-tier devices when using a reduced quality preset. Treat these as goals, not promises.

**Measured on the dev Mac:** 1080p at DPR 1 runs at 60 fps capped (105 uncapped) on `high`. A 1080p window at DPR 2 (a 4K buffer) runs at ~37 fps on `high` and 58 fps on `medium`. No real lower-tier devices have been tested yet.

**Exit criteria:** measured performance and documented asset pipeline; no material visual regression.

---

## 5. Gameplay milestones — only after visual sign-off

Specification: `GAME_DESIGN.md` v1.2 (systems review of the v1.1 rules audit, 2026-11-11; changes are listed in its §0.2). Section numbers below (§) refer to it. All engine code lives in `src/game/`, which is pure TypeScript and may not import React, three.js or `src/scene`/`src/ui`. Every milestone ends with typecheck, unit tests, a production build, and a screenshot check that the scene didn't change.

**G1 decisions** (`GAME_DESIGN.md` §15), decided 2026-11-11:
1. ✅ `vitest` approved as a dev dependency.
2. ✅ Defaults accepted: no trading or building before the roll; Friendly Robber off; an off-turn 10th point wins at the start of that player's next turn; a broken Longest Road tie leaves the award unheld.
3. ✅ The current showcase layout stays as a separate `demo` preset for the scene; games use `standard-fixed` or `random`. Rendering engine boards is G4 work.
4. ✅ Seating order by seeded shuffle; discards, Monopoly and Year of Plenty are public.
5. (v1.2) Not needed until G5: timer lengths, absent-player handling and hosting (§15 item 11). GitHub Pages is static hosting and can't run game rooms, so G5 needs a separate server or a managed WebSocket service.

### G1 — Engine foundation: board, state, setup and production

- [x] **G1.1 Tooling.** Add `vitest` (pending approval) and an `npm test` script. Add an import-boundary test that fails if `src/game/**` imports react, three, `@react-three/*`, `src/scene` or `src/ui`.
- [x] **G1.2 Types** (`src/game/types.ts`): `Resource`, `Terrain`, `TileId`/`VertexId`/`EdgeId`, `GameSettings`, `GameState`, `Phase`, `Action`, `GameEvent`, `Result`, `ErrorCode`, `RESOURCE_ORDER` (§3.3, §4.1, §11, §19). The actor is the `player` argument, never a field of the action. `roadBuilding` carries `resume`.
- [x] **G1.3 RNG** (`rng.ts`): seeded mulberry32 kept inside the state (`rngState`), plus `shuffle`, `d6`, `pick`. Tests: determinism and a uniformity smoke test. The RNG consumption order in §11 is part of the replay format. No `Math.random` or `Date.now` in `src/game`.
- [x] **G1.4 Topology** (`topology.ts`): axial pointy-top hexes, canonical `N/S` vertex and `NE/NW/W` edge IDs, adjacency maps built once (§2.2–2.3). Tests: 19/54/72 counts, 30 coastal edges, every edge has 2 vertices, vertex degree is 2–3, the corner table matches the scene's `corner(k)`, and the `(row,col)`↔axial mapping round-trips.
- [x] **G1.5 Board generation** (`board.ts`): `standard-fixed` and `random(seed)` presets with the standard terrain, token and port multisets. `standard-fixed` and the 9 port edges are copied exactly from §2.6; tiles are assigned in canonical order (by `r`, then `q`). 6 and 8 never adjacent; bounded retries; robber starts on the desert (§2.1, §2.4). Tests: `standard-fixed` equals §2.6, multisets, constraints over 1,000 seeds, same seed gives the same board.
- [x] **G1.6 Game creation**: bank of 19×5, a shuffled 25-card dev deck, piece supplies of 15/5/4, seating order by seeded shuffle (§4.2), `settings` defaults (10 VP, discard limit 7, Friendly Robber off) and settings validation with `INVALID_SETTINGS` (§3.3).
- [x] **G1.7 Setup phase**: snake order, settlement then road, distance rule, the road must touch the settlement just placed, starting resources from the 2nd settlement (§4.2). Tests per §13 "Setup".
- [x] **G1.8 Turn skeleton and dice**: `preRoll → actions → END_TURN`, `ROLL` from the RNG, and the `apply`/`validate`/`legalActions` API returning `Result`: invalid → unchanged state plus an `ErrorCode` from `errors.ts` (§4.1, §11, §19). Includes the who-may-act table in §4.1.
- [x] **G1.9 Production**: settlements yield 1 and cities 2; the robber's tile and the desert are skipped; per-resource bank shortage rule (a single recipient takes the rest, several recipients get none) (§5). Tests per §13 "Production" and "Bank shortage", plus a conservation invariant checked after every action.
- [x] **G1.10 Scene adapter test only**: map `src/scene/board.ts` `Building{tile,corner}` and `Road{tile,edge}` to engine IDs and back. No rendering changes.
- [x] **G1.11 View skeleton** (`view.ts`): `viewFor` and `eventsFor` exist from the start and never expose `rngState` or the deck (§17). Completed in G3.6.

**Exit criteria:** a seeded script can play the full setup and N rolled turns headlessly; all tests pass; build passes; the scene is untouched.

**G1 result (2026-11-11):** `src/game/` holds about 1.5k lines including tests: `types`, `errors`, `rng`, `topology`, `board`, `state`, `rules/{setup,production,turn,victory}`, `engine`, `view`. `npm test` runs 65 vitest tests in about 0.3 s. Mutation checks pass: breaking the shortage rule, the distance rule or round-1 resources makes a test fail. 20 seeds × setup + 200 rolled turns keep every invariant. The scene is unchanged: no diff in `src/scene`/`src/ui`, and the screenshot matches V8 within animation noise. Known G1 limit: a rolled 7 produces nothing and goes straight to `actions`. Discards, robber and steal arrive in G2.3, marked `TODO(G2.3)` in `rules/turn.ts`.

### G2 — Construction, robber and awards

- [x] **G2.1 Costs and supply**: road, settlement, city and dev card costs; piece limits 15/5/4; a city returns its settlement piece (§3.1, §7).
- [x] **G2.2 Placement validation**: road connectivity; no extending through an opponent's building; distance rule; a settlement must touch your own road after setup; a city only on your own settlement (§7).
- [x] **G2.3 Seven**: discards for more than `discardLimit` cards, `floor(n/2)`, exact count and only cards held, accepted in any order; robber must move to a different tile (desert allowed); steal one card at random, weighted by hand, from an adjacent opponent who has cards; skip when nobody qualifies (§6).
- [x] **G2.4 Friendly Robber setting**: tiles touching players with fewer than 3 public VP are excluded; desert fallback; if no other tile is legal the robber stays and nothing is stolen (§6).
- [x] **G2.5 Longest Road**: trail DFS that can't pass through opponent buildings; 5 minimum; must be strictly longer to take it; recompute after roads and settlements; award decided by the single `resolveLongestRoad` function, which also covers broken roads (§10.2).
- [x] **G2.6 Largest Army**: 3 minimum, strictly more to take it, via `resolveLargestArmy` (§10.3). Played knights are tracked (the Knight card itself comes in G3).
- [x] **G2.7 Scoring**: `publicVP` and `totalVP` (§10.1).
- [x] **G2.8 Tests** per §13 "Seven", "Building", "Longest Road" and "Largest Army", including a loop of 6, a fork, a broken 7→3+4, and the tie cases.

**Exit criteria:** every construction and robber path is validated and tested, including the edge cases; invariants hold under a randomized action fuzzer seeded from `legalActions`.

**G2 result (2026-11-11):** new `rules/build.ts`, `rules/robber.ts` and `rules/awards.ts`, wired into the engine's phase table. Discards on a 7 come from every owing player in any order (`NOT_YOUR_TURN` for the others). The robber then moves; a single candidate is robbed automatically, two or more go to the `steal` phase. Friendly Robber includes the D14 fallback, tested with an exact 6-vertex cover of the 18 non-desert tiles. `npm test`: 97 tests in about 5.6 s. Seven mutations are caught: tie keeps the holder, no passing through opponents, road blocked by a building, exact discard, Friendly threshold, robber same tile, city returns its settlement. The fuzzer plays 150 seeded games × 60 turns (over 500 builds, over 50 robber moves) with invariants and award idempotence checked after every action. Speed in a mid-game `actions` position: `legalActions` ≈ 0.45 ms, `apply` ≈ 0.016 ms on desktop (targets 5 ms and 1 ms). The scene is unchanged (no diff in `src/scene`/`src/ui`). The Knight card that drives Largest Army arrives in G3; `resolveLargestArmy` is already unit-tested.

### G3 — Trading, development cards, victory and a local hot-seat game

- [x] **G3.1 Bank and port trades**: 4:1, 3:1 and 2:1 at the best rate a settlement or city earns; the bank must have stock; `count` is the number of cards received (§9).
- [x] **G3.2 Player trades**: propose, respond, confirm; the active player is always a party; nothing given for free; not the same type on both sides; re-validated at confirm (`TRADE_STALE`); one open proposal with a `tradeId`; the proposer must hold the offer; any hand change by the active player cancels it; at most 20 proposals per turn; open offers cancel at turn end (§9).
- [x] **G3.3 Dev cards**: buy (own turn, any number, not from an empty deck); one non-VP card per turn; never on the turn it was bought; every non-VP type is playable before the roll and returns to `preRoll`, so the roll still happens (§4.1, §8).
- [x] **G3.4 Card effects**: Knight (robber and steal, +1 army), Road Building (up to 2, placed one at a time, only legal edges), Year of Plenty (`take` of 1–2 cards, limited by bank stock), Monopoly (§8).
- [x] **G3.5 Victory**: the `checkVictory` procedure runs after every successful action and at the start of each turn, for the active player only; hidden VP cards count and are revealed in `GAME_WON`; off-turn rule (§10.4).
- [x] **G3.6 `viewFor(player)` and `eventsFor(player)`**: full visibility matrix and event redaction (§17). Test: no view produced during a full playout contains a secret field.
- [x] **G3.7 Replay**: seed plus action log gives an identical state. Replay file format and `schemaVersion` per §22; a few golden replays with a final-state hash stored in the repo.
- [x] **G3.8 Full-game simulation test**: a random-legal-move bot finishes 1,000 seeded games with no invariant violations or stuck states. Assertions per §23.2; a 2,000-turn cap is reported, not failed (§23.3).

**Exit criteria:** complete local games are possible through the engine API alone; tests cover every §13 scenario.

**G3 result (2026-11-11):** new `rules/trade.ts`, `rules/devcards.ts` and `replay.ts`. Bank trades use the best rate from any port touching the player's settlement or city. Player trades follow propose → respond → confirm with one open `tradeId`; it is re-validated at confirm (`TRADE_STALE` keeps it open) and cancelled by any hand change of the proposer, by a new proposal, by `CANCEL_TRADE` or at turn end. Dev cards: buy, then the one-per-turn and purchase-turn rules (the oldest copy is played first). Every non-VP card is playable before the roll and resumes `preRoll`. Road Building places 1–2 free roads one at a time and is rejected without a legal edge. Year of Plenty is limited by bank stock. Victory is checked after every action for the active player only, so an off-turn 10th point wins when that player's turn starts; `GAME_WON` reveals VP cards. Tests: `npm test` runs 134 tests in about 24 s. Three golden replays live in `src/game/__tests__/golden/` with final-state hashes: standard-fixed seed 7, random seed 42 and a 40-turn cap. Nine mutations are caught: port rate, purchase turn, stale check, Monopoly removal, one card per turn, trade limit, Knight resume, `vpToWin`, responder holding the request. The default run plays 25 bot games; `VITE_PLAYOUTS=1000 npm test -- g3` plays 1,000 seeded games (about 6.5 min). After every action it checks conservation, pieces, award idempotence and dev-card non-creation; on sampled states it checks `legalActions ⊆ validate` and that views contain no secrets. Result: 999 games reached `gameOver` and 1 hit the 2,000-turn cap (reported, not failed, per §23.3); the average was ≈356 turns. A separate test plays 5 games with player trades (more than 20 completed trades) under the same invariants. Deviation from §23.2: the bot isn't uniform; it prefers cities, settlements and cards so that games finish within the cap. Assumption: the bot never proposes trades, so trades in full playouts are covered only by the separate trade test. The scene is unchanged (no diff in `src/scene`/`src/ui`).

### G4 — 3D and UI integration (hot-seat)

- [x] **G4.1 Store**: one small state container (React context with `useSyncExternalStore`) holding `GameState`, dispatching `Action`s to the engine. Animations listen to `GameEvent`s; no per-frame React state.
- [x] **G4.2 Board from state** (a: tiles/tokens/robber, b: ports, c: pieces): the scene reads tiles, tokens, ports, robber, buildings and roads from engine state through the G1.10 adapter. The art direction is unchanged (needs the board decision above).
- [x] **G4.3 Valid-placement highlights**: extend the visual-only hover (`TileHover`) to vertices and edges taken from `legalActions`; robber target tiles in `moveRobber`.
- [x] **G4.4 HUD wiring** (a: players, phase, dice, Roll/End Turn ✅; b: hand + build menu ✅; c: discard + steal ✅; d: trades ✅ (d1 bank/ports, d2 players); e: dev cards ✅) (flows per phase in §18): dice, resource hand, build menu (enabled only when legal and affordable), player cards (public VP, card counts, awards), bank and trade dialogs, discard dialog, dev card hand, turn and phase indicator.
- [x] **G4.5 Feedback** (a: notices + error messages ✅; b: robber ✅; c: placement and production ✅; d: victory screen ✅): placement animations, production particles or tags from the source tile, robber move, steal notice, award changes, victory screen; all respect reduced motion. Animations follow events and never delay state. Every rejected action shows the i18n message for its `ErrorCode` (§19).
- [x] **G4.6 Accessibility** (a: board placement by keyboard ✅; b: focus order, dialogs and announcements ✅): every action reachable by keyboard; phase changes announced through a live region.
- [x] **G4.7 Regression**: fixed-pose screenshots against the V8 baseline (no blur or camera changes); perf within 10% of V8; no console errors.
- [x] **G4.8 Hot-seat privacy and resume** (a: pass-the-device screen ✅; b: autosave and resume ✅): a "pass the device" screen hides the previous hand before the next player's view renders, including between sequential discards (§18); autosave the replay after each action and offer "resume game" (§22).

**Exit criteria:** a full 4-player hot-seat game is playable in the browser; the scene stays as sharp and readable as at visual sign-off.

**Board decision for G4 (2026-11-11):** games render `standard-fixed` only (no random-board rendering in G4); the showcase layout stays as the `demo` scene preset. G4 is done in small steps, each verified and committed separately.

**G4.1 result (2026-11-11):** `src/store/gameStore.ts` is a plain-TS store: `getState`, `subscribe`, `onEvents` (events reach listeners before state listeners), `dispatch` (a rejected action changes nothing and notifies nobody), `reset`, `replayFile` (for autosave in G4.8). `src/store/GameProvider.tsx` adds `useGame(selector)` via `useSyncExternalStore`, `useDispatch`, `useGameEvents` (ref-based, no per-frame state) and `?seed=`. `App` is wrapped in the provider; nothing reads it yet. A dev-only `window.__islesStore` exists for browser checks and is absent from the production bundle. Tests: 7 store tests (141 total), including replay-hash equality with the store state. Browser: a live dispatch through the store works with no console errors. Pixel diff at 1440×900 DPR 2 `?nohover`: mean 0.05 against V8, noise floor 0.06 (`screenshots/milestones/g4.1/`); ~51 fps headless before and after. The JS bundle grew by 26 KB (9.4 KB gzip) because the engine is now included.

**G4.2a result (2026-11-12):** tiles, tokens and the robber come from the engine. `scene/board.ts` builds its 19 tiles from `STANDARD_FIXED` through the G1.10 adapter (`axialToScene`). Each scene tile carries its canonical `axial` id; `?board=demo` keeps the showcase layout. Mountains, forests, fields and vegetation are procedural per biome, so they followed the new layout without art changes. The robber reads `state.robber` from the store; on a numbered tile it stands 0.5 to the west so the token stays readable. Tests: 4 scene-board tests (145 total) check that every scene tile matches the engine's terrain and token. Browser: a live game driven through the store to a 7 moved the robber to `1,1` with no console errors; the store context reaches inside the R3F canvas. Screenshots are in `screenshots/milestones/g4.2a/` (game board, demo board, robber moved). The demo board differs from the G4.1 baseline only in animated areas (wheat sway, foam, smoke): 0.26% of pixels over 12/255, all at animation-phase spots, none structural. Still demo data until G4.2b/c: harbours (7 instead of 9 ports) and the buildings/roads.

**G4.2b result (2026-11-12):** the 9 engine ports replace the 7 demo harbours. `engineHarbors()` maps each port edge to its coastal tile and scene side through `edgeTiles` and `hexSides`. A test checks that every scene sign stands on the port's exact vertex pair with the port's kind and ratio. New sign icons: ore, and a neutral "?" coin for generic 3:1 ports. The demo board keeps its own harbours. **Camera change (approved 2026-11-12):** the desktop fit now keeps every harbour sign inside the safe area, clear of the side columns and the bottom tray, instead of only the west signs. Before this, 1–3 ports were hidden under the HUD at 1440×900 and 1920×1080; the demo's south harbour had also always been under the resource tray since V8. The board is ≈9–10% smaller on desktop; all 9 signs are visible at 1920×1080, 1440×900, 1280×720 and 1024×768, and numbers stay readable. The compact layout is unchanged, since it already fitted all signs. The orbit limit follows the home distance as before. Screenshots are in `screenshots/milestones/g4.2b/`, including `*_without_camera_fit.jpg` for comparison. Tests: 146.

**G4.2c result (2026-11-12):** buildings and roads come from engine state. `scenePieces()` maps `state.buildings` and `state.roads` to scene corners and sides through `vertexToScene` and `edgeToScene`. Seat colours: p1 red, p2 blue, p3 white, p4 orange. `usePieces()` reads the store and recomputes only when the engine replaces those records. `StaticBatch` is keyed by the piece set, so its merged meshes always match the board. Chimney smoke and city lanterns follow the buildings; smoke uses a fixed pool of 36 chimneys. On the game board vegetation keeps clear of every vertex and edge, since any of them may get a piece; the demo keeps its old exclusion. Tests: 148. Two of them check that every vertex and edge maps to the same scene point from every hex that has it, and that pieces after a full setup convert with seat colours. Browser: a fresh game starts with an empty board. Replaying 560 golden actions through the store shows 12 buildings (3 cities) and 33 roads with no console errors. Rebuilding the pieces after a `BUILT` event takes about 38 ms to the second frame (two frames ≈ 33 ms, so ≈ 5 ms of work, once per build). Perf at 1440×900 DPR 2 on an empty board: 52.6 fps and 250 draw calls, against 51.4 fps and 287 calls with the demo pieces in G4.2b. Screenshots are in `screenshots/milestones/g4.2c/`. Known: the black robber is hard to see on dark forest tiles (for G4.3/G4.5); the HUD still shows demo players (G4.4).

**G4.3 result (2026-11-12):** `store/placement.ts` derives clickable spots from `legalActions` only, so highlights can't disagree with the rules. Setup shows settlements then roads, Road Building shows free roads, `moveRobber` shows robber tiles. In `actions` only the build chosen in `store/ui.ts` shows; the G4.4 build menu will set it, and `?place=road|settlement|city` sets it for dev checks. `scene/Placement.tsx` draws pulsing instanced markers: rings at vertices, bars on edges, thin hex rings on tiles. They are steady under reduced motion and have no depth test, so trees and peaks never hide a target. Hovering brightens the nearest target in the player's colour and shows a pointer cursor; a click dispatches through the store. A drag (orbit or pan, over 6 px) never places. Picking is plane math, with no mesh raycasts. Tests: 4 placement tests (152 total). Browser, with real mouse input at 1440×900: a drag over a target placed nothing; a click on a vertex built the settlement, a click on an edge built the road; after a 7, clicking a tile moved the robber. No console warnings or errors. Perf with 54 setup markers on screen: 50.8 fps and 254 draw calls (52.6 fps and 250 calls with nothing shown). Screenshots are in `screenshots/milestones/g4.3/`. The dev hook `window.__isles` now also exposes the camera.

**G4.4a result (2026-11-12):** `ui/gameView.ts` holds pure, tested HUD data. Seat names and colours: Red, Blue, White, Orange, matching the 3D pieces. Player cards follow turn order with public VP only (hidden VP cards are never counted), resource and dev-card counts, Longest Road / Largest Army badges, and a highlighted active player. A phase line says who acts and what to do (`role="status"`, polite live region): at the top centre on desktop, and in a new 34 px row under the compact top bar. `COMPACT_SAFE.top` grew from 62 to 96, so the compact camera fit leaves room for it. The dice show `state.dice` and bounce on `DICE_ROLLED` events (no per-frame React state). The plinth's single button is Roll Dice in `preRoll` and End Turn in `actions`; elsewhere it is a disabled hint, with short labels on compact. Tests: 3 HUD-view tests (155 total). Browser at 1440×900 with real mouse input: the whole setup clicked on the board (8 settlements, 8 roads), Roll Dice gave 5+1, the dice label read "Dice: 5 and 1, total 6" and the phase moved to actions. End Turn passed the turn to the next seat ("Blue: roll the dice"). No console warnings or errors. Checked at 1440×900, 1920×1080, 1280×720, 1024×768, 390×844 and 844×390. A 2 px overflow in the compact player chips was fixed. Perf: 52.4 fps, 254 draw calls, 0 React commits in 5 s idle. Known: on landscape phones (844×390) the board was already small (V6 open item), and the phase row costs another 34 px there. The resource hand and build menu are still demo data until G4.4b. Screenshots are in `screenshots/milestones/g4.4a/`.

**G4.4b result (2026-11-12):** the resource hand shows the active player's real cards; empty types are dimmed, and the list is labelled with the owner. Hot-seat hiding comes with G4.8. Build menu rows come from `buildOptions()`: a row is enabled exactly when `legalActions` offers that build. Otherwise the tooltip and aria-label give the first applicable reason: "Roll the dice first", "Need 1 more brick", "No roads left", "The deck is empty" or "No legal spot". Road, settlement and city set the placement mode, so the G4.3 markers appear. The selected row is highlighted (`aria-pressed`); a second click or Escape cancels it. The mode resets after a build and when the phase or turn changes. The dev-card row buys a card. Cost icons and labels now come from the engine's `COSTS`; the demo HUD had shown the city as 1 grain + 2 ore instead of 2 grain + 3 ore. Tests: 2 more (157 total). Browser at 1440×900, mid-game from the golden replay, real clicks: Build Road showed 12 edge targets, clicking one built the road, and the mode cleared. Buy Development card took the top card. Disabled rows showed accurate reasons, and Escape cleared a pending choice. On a phone, choosing from the Build popover closes it so the board is visible. No console errors; 0 React commits in 5 s idle. Screenshots are in `screenshots/milestones/g4.4b/`.

**G4.4c result (2026-11-12):** the seven now plays through the HUD. `discardPrompt()` picks the next player owing a discard (turn order) with their hand. `stealPrompt()` lists the robber's candidates with seat colours and card counts. Both are pure and tested. `ui/Dialogs.tsx` renders only in `discard` or `steal`. The discard dialog has −/+ per resource, a live "N / count chosen" counter, and a Discard button enabled only at the exact count; it resets and refocuses for each discarding player. The steal dialog has one button per victim ("Rob Blue (3 cards)"), and the first is focused. Both close themselves when the phase moves on. The disabled compact plinth hint during a discard now reads "Wait", not a second "Discard" button. On short screens (height < 560, landscape phones) the dialogs sit over the disabled dock instead of covering the top bar. Tests: 1 more (158 total). Browser, real clicks, standard-fixed golden replay at turn 41: Orange discarded 4 of 8, a click on a tile with two victims moved the robber, "Rob Blue" took a card, and the phase returned to actions with the dialogs closed. Checked at 1440×900, 390×844 and 844×390, with no console errors. Perf at 1440×900 DPR 2: 51.6 fps, 0 React commits in 5 s idle. Screenshots are in `screenshots/milestones/g4.4c/`. Known: the dock hand still shows the active player's cards during someone else's discard (hot-seat privacy, G4.8).

**G4.4d1 result (2026-11-12):** bank and port trades. A Trade button (⇄) sits next to Undo/Chat on desktop and in the compact dock. It is enabled only in the active player's `actions` phase; otherwise its label says why. It opens a panel in the dialog slot above the hand. "You give" shows each resource's rate and your count; "You get" shows the bank's stock. A count stepper is capped by hand and bank, a summary line reads "2 wool → 1 wood", and Trade dispatches `BANK_TRADE`. Rates come from the engine's `tradeRate` (now exported) through `bankView()`, so 2:1 and 3:1 ports can't disagree with the rules. A unit test checks every port and that the panel's give options equal `legalActions`. The panel stays open for further trades. It closes on ×, Escape, a phase or turn change, or when a build is chosen; opening it clears a pending build choice. Focus goes to the first resource you can give. Distinct accessible names: "Trade with the bank" for the toggle, "Confirm trade: …" for the confirm button. Compact dock: the new button made the row 10 px too wide at 390 px. The gaps are now 6 px, the empty spacer is gone, the icon buttons are 40 px wide, and the Chat placeholder is hidden below 390 px. Build keeps its 8 px gutter at 360, 375 and 390 px with every main-button label. Tests: 1 more (159 total). Browser, real clicks, standard-fixed golden replay at turn 3: Orange (wool port) traded 2 wool → 1 wood, and the hand changed by exactly that. Checked at 1440×900, 390×844 and 844×390: no overflow, no console errors. Perf 50–51.6 fps, 0 idle React commits. Screenshots are in `screenshots/milestones/g4.4d/`. Known: on landscape phones the panel covers the phase line while it is open.

**G4.4d2 result (2026-11-12):** player-to-player trades. The trade panel has Bank and Players tabs (`role=tablist`). The Players tab composes an offer: clicking a tile adds one, a small red − removes one, and "give" is capped by the hand. A resource sits on one side only; adding it to one side clears it from the other. Opponent toggles default to everyone. A summary line gives the first blocking reason from `proposeCheck()`, which mirrors the engine's `propose` checks: empty side, both sides, no recipients, short hand, 20 offers per turn. Propose dispatches `PROPOSE_TRADE`. While `state.trade` is open, the panel stays on screen even if the user closed it, and shows the offer as resource chips. Each addressed player gets a row: Accept (disabled with "Needs 1 more wood" when they can't pay) and Decline, both dispatched as that player (hot-seat). It then shows "Declined" or "Trade with X" (`CONFIRM_TRADE` by the proposer), plus "Cancel offer". Buttons follow `legalActions`/`offerView()`. Focus goes to the first actionable button. Short screens (≤ 560 px tall) get lower resource tiles so the panel clears the compact top bar. Fixed along the way: an import-order crash, because class strings used `focusRing` from HUD.tsx at module load while HUD imports this panel. `MAX_PROPOSALS_PER_TURN` is now exported. Tests: 1 more (160 total) covering every propose reason and an offer through respond, decline and confirm. Browser, real clicks, golden replay at turn 9: White offered 1 brick for 1 wood to all. Blue's Accept was disabled (no wood); Blue declined, Orange accepted, and "Trade with Orange" moved exactly 1 brick and 1 wood both ways. The panel returned to composing; a second offer was cancelled, leaving `state.trade` null. Checked at 1440×900, 390×844 and 844×390: no overflow, no console errors; the bank flow was rechecked at all three sizes. Perf 50.2 fps, 0 idle React commits. Screenshots are in `screenshots/milestones/g4.4d/` (`*_compose`, `*_offer`). Known: responders answer on the active player's screen, and every hand is visible (hot-seat privacy is G4.8).

**G4.4e result (2026-11-12):** development cards. A Cards button sits next to Trade, with a badge counting the active player's cards. It is enabled in `preRoll` and `actions`, so a knight can be played before rolling. It opens a panel in the dialog slot, one row per card type held, with icon, count, a short description and Play. `devView()` enables Play exactly when `legalActions` offers that card; otherwise the row says why: "Bought this turn", "One card per turn", "No legal road" or "Not now". Victory Point cards show as "Counts at the end" and have no Play button. Knight and Road Building play at once and hand over to the G4.3 board markers: the robber, or free roads. Year of Plenty asks for 1–2 resources (the same one twice allowed, capped by the bank). Monopoly asks for one resource, and its summary line explains the effect. Both then dispatch and close. Trade and Cards share one panel slot in `store/ui.ts` (`setPanel`), so only one is open at a time, and choosing a build closes it. Escape or a new turn closes it. Compact dock: to fit Cards, the Chat placeholder hides up to 560 px wide and the Undo placeholder below 390 px. Build keeps its 8 px gutter at 360, 375 and 390 px with every label, and the landscape phone still shows both. Tests: 1 more (161 total). Browser, real clicks at 1440×900, 390×844 and 844×390. A golden replay gave real positions for Knight (turn 52; phase went to moveRobber) and Road Building (turn 38; phase went to roadBuilding). The bots never play Year of Plenty or Monopoly, so for those the test moved that real card from the deck into the hand (the deck's composition was unchanged). Year of Plenty then took ore + ore (+2 ore). Monopoly on brick took 4 brick, after which the held knight showed "One card per turn". No overflow or console errors. Seven, bank and player trade flows were rechecked. Perf 51.6 fps, 0 idle React commits. Screenshots are in `screenshots/milestones/g4.4e/`. With this, every G4.4 sub-step is done.

**G4.5a result (2026-11-12):** notices and error messages. `ui/i18n.ts` gives every one of the 29 `ErrorCode`s a player-facing message (`Record<ErrorCode, string>`, so a missing code is a type error; another locale is a second table). The store gained `onRejected`, so every dispatch path (board clicks, buttons, dialogs) reports rejections the same way; the `console.warn` calls in Placement and the trade panel are gone. `eventNotices()` (pure, tested) turns events into short public summaries: a seven, production per player ("Red +2 wood +1 ore") and bank shortfalls, steals, award changes, dev-card purchases and plays, Year of Plenty, Monopoly totals, bank and player trades, the win. It never names a stolen card or a bought card's type. `ui/Notices.tsx` shows at most 3 notices under the phase line on desktop and compact. They expire after 4–5 s (timers in a small external store, no per-frame React state); a click dismisses one. Errors use `role=alert`, the rest a polite live region; a new game clears them. The entrance slide is CSS and follows the global reduced-motion rule. Tests: 3 more (164 total); the store test covers rejection listeners. Browser at 1440×900, 390×844 and 844×390: a real Roll gave "Blue +1 grain +1 ore". A dispatch for the wrong player showed "It isn't your turn." as an alert. Both expired on time; no overflow or console errors. Seven and trade flows were rechecked. Perf 52 fps, 0 idle React commits. Screenshots are in `screenshots/milestones/g4.5a/`. Not yet: the §18 game log (a scrolling history) is not part of this step.

**G4.5b result (2026-11-12):** robber visibility and movement. Baseline close-ups per biome showed the black robber buried by trees on forest tiles; it read well on hills and mountains. Changes: the robber's spot (`robberSpot`, beside the token) moved to `scene/board.ts`. On the game board, vegetation keeps clear of that spot on every tile and of a short strip in front of it towards the default camera; this is static placement with no per-move cost. The figure stands on a pale stone base, like a board-game piece, so it separates from dark grass and trees. When `state.robber` changes, the robber hops along an arc (0.75 s, ease in-out, lift about 0.5). The engine state is already final, so this is view-only, and it is instant under reduced motion. A browser check sampled the scene: peak lift 0.48 mid-move, landing exactly on the target; with `?reducedmotion` it is at the target on the first frame. Desktop notices from G4.5a moved from the top centre, where three of them covered the top number tokens, to the bottom-left corner above the action buttons (250 px wide). Checked at 1440×900, 1280×720, 1920×1080 and 1024×768: no token, port sign or HUD element is covered. Tests 164; build clean; seven and notice flows rechecked; no console errors. Perf 51.8 fps, 0 idle React commits. Screenshots in `screenshots/milestones/g4.5b/`: `base_*` and `final_*` close-ups per biome, and `notices_*` per desktop size.

**G4.5c result (2026-11-12):** build and production feedback, driven by events after the state is final. A new road, settlement or city (setup placements too) drops into place with a short bounce (0.62 s). Buildings are merged by `StaticBatch`, so `scene/arrivals.ts` (a tiny external store) leaves an arriving piece out of the batch while `scene/Feedback.tsx` animates its own copy (`BuildingPiece`/`Roads` are now shared); the piece then rejoins the batch. A city upgrade swaps the settlement for the dropping city. Under reduced motion nothing is held back. After a roll, a "+N" tag with the resource icon rises from each producing tile (drei `Html`, CSS animation, removed after 1.8 s; under reduced motion it simply shows). `scene/production.ts` computes the tags from public state like the engine's `produce` (token = roll, not the robber tile; 1 per settlement, 2 per city; bank-shortfall resources get no tag). A test replays all three golden games and checks that on every roll the tags add up to exactly what `RESOURCES_PRODUCED` paid. Tests: 165. Browser: a real Roll (10) showed "+1 wool" over the 10 pasture without covering its token, gone after 1.8 s. A golden `BUILD_ROAD` was in flight at 140 ms (screenshot shows the road mid-air) and back in the batch by 0.9 s; with `?reducedmotion` there was no flight. Checked at 1440×900 and 390×844. Frame cost of a build: worst frame 24 ms during the drop and re-merge, against 27 ms idle, none over 34 ms. Seven and trade flows rechecked; no console errors. Perf 52 fps, 0 idle React commits. Screenshots are in `screenshots/milestones/g4.5c/`. Dev handle: `window.__islesArrivals`. Note for G4.8: resuming a game by replaying actions through `dispatch` would animate every piece; resume should load without feedback.

**G4.5d result (2026-11-12):** victory screen. `finalScores()` (pure, tested against the golden `GAME_WON`) lists every player with settlements, cities, Longest Road / Largest Army, revealed VP cards and total, winner first. `ui/Victory.tsx` is a centred card with no full-screen backdrop, so the camera stays free: winner avatar, "Blue wins!", "10 victory points on turn 210", and the score table (golden game: Blue 0/2/Army/4 = 10, Orange 3/1/Road/1 = 8, Red 4/0/–/0 = 4, White 2/0/–/0 = 2). "View board" folds it into a "Blue won · Show results" pill; "New game" (focused on open) resets the store with a fresh seed on `standard-fixed`. Short screens (≤560 px tall) get a compact variant below the top bar. The entrance follows the global reduced-motion rule. Fix found on the way: drei `Html` production tags were painted over HUD dialogs; the HUD roots now sit at `z-[20]`. Tests: 166; build clean. Browser at 1440×900, 390×844 and 844×390: the card is complete and readable, no overflow, New game returns to setup, no console errors. Seven, bank trade, player trade, dev-card and feedback flows rechecked. Perf 52.4 fps, 0 idle React commits. Screenshots are in `screenshots/milestones/g4.5d/`. With this, G4.5 is complete. Not yet: the §18 scrolling game log.

**G4.6a result (2026-11-12):** board placement by keyboard, the one action that needed a mouse. `ui/BoardPicker.tsx` is a single focusable button for the current targets (the same `placementTargets` list Placement draws). Arrow keys move a cursor to the next target in that direction on screen (`step`: within 60° of the direction, straight ahead preferred); Enter or Space places, Escape cancels a build. The scene draws the cursor with its hover marker in the player's colour; the robber's hex cursor now uses that colour too (it was white like the other rings and hard to tell apart). `store/boardCursor.ts` holds the cursor (a target id in a tiny external store read by `useFrame`) and a projector the scene registers. `spotLabel()` describes each target for the picker and screen readers: "Settlement: desert, 6 wood, 4 ore", "Settlement: 6 ore, 2:1 wood port", "Road between 11 wool and 10 wood", "Robber to 6 ore (White, Blue)". The button stays visually hidden until it has keyboard focus (`:focus-visible`), so the mouse HUD is unchanged and mouse users never get a cursor. Focus moves to it when a build is chosen or a board-only phase (setup, robber, free roads) starts with focus lost, and returns to the Build control, else to the main action, when the targets go away. Tests: 4 more (170 total). Browser at 1440×900, 390×844 and 844×390, keys only: all 16 setup placements, then focus on Roll; a robber move (then End Turn); a road from the Build menu (then back to Build); Escape cancels and returns focus. A mouse click on Build Road shows no pill and no cursor. No overflow or console errors; seven, trade, player trade, dev cards, feedback, placement-click and victory flows rechecked. Perf 51.8 fps (three runs), 0 idle React commits. Screenshots are in `screenshots/milestones/g4.6a/`.

**G4.6b result (2026-11-12):** a keyboard and announcement audit of the rest of the HUD, with fixes. Found: closing Trade or Cards (Escape or ×) dropped focus to the page; the discard dialog focused the Wood "+" even with no wood (a disabled button, so nowhere), and a "+" that disabled itself mid-choice lost focus too; a completed bank trade and an answered offer row lost focus the same way; Escape inside the compact Menu or Build popover, or buying a card from it, lost focus; a normal roll was never announced (only sevens and production); notices sat in the Tab order. Fixes: `GameDialogs` returns focus to the control that opened a dialog, else to the main action, when the dialog closes or gives way to another (board-only phases that follow take focus through BoardPicker), and puts focus back on the dialog's first enabled button when a control inside disables or removes itself (a pointer press elsewhere turns this off, so it never fights the mouse). The discard dialog starts on the first card the player can drop and moves to Discard once enough are chosen, so pressing Enter repeatedly completes a discard. The compact popovers return focus to their toggle. The phase banner (a polite status region) now begins with the roll: "Orange rolled 7 (4 and 3). Orange: move the robber". Notices are out of the Tab order (they expire and are already announced). "View board" focuses the "Show results" pill. No visual change. Verified by keys only at 1440×900, 390×844 and 844×390: open and close every dialog and popover; bank trade; propose, answer and cancel an offer; buy a card; a full seven (discards, robber, steal) ending on End Turn; victory → View board → Show results → New game → setup with focus on the board. Tab order has no hidden or unnamed controls. Phase changes, turn changes and rolls are announced through the status region; errors through `role=alert`. Not tested with a real screen reader (VoiceOver); the announced text was checked in the DOM. Tests 170; build clean; all earlier flows rechecked; no console errors. Perf 50.4 fps and 0 idle React commits, the same with and without this change in back-to-back runs (the machine measured about 1.5 fps lower than in G4.6a). With this, G4.6 is complete.

**G4.7 result (2026-11-12):** regression against V8 (`8b903dc`). *Code:* since V8 the renderer, post-processing, pixel ratio, tone mapping, camera angle, FOV and orbit limits are unchanged; there is no depth of field, tilt-shift, motion blur or temporal accumulation anywhere in `src`. Only two framing changes, both intended: the desktop fit that keeps all 9 harbour signs clear of the HUD (G4.2b, approved) and the compact phase line (G4.4a). *Images:* fixed home pose, `?nohover`, DPR 2. A pixel-for-pixel comparison needs the V8 framing, so the G4.2b fit was disabled in a scratch copy for one capture of `?board=demo` (then restored). The board matches V8 structurally (same tiles, tokens, harbours, pieces, framing); the diff map shows only animation phase (wheat and tree sway, sheep, foam) and the robber's stone base from G4.5b. Board-region mean diff 5.2 against 1.3 between two current captures; the excess is the animation phase, since V8 was captured at a different time after load. Sharpness (mean |Laplacian| over the board area, same size, same JPEG quality): V8 16.2; now 18.1 on a fresh game and 17.4 mid-game, so nothing is softer. Readability checked by eye at 1440×900, 1920×1080, 390×844 and 844×390, fresh and mid-game (turn 41: 12 buildings, roads, robber). *Perf* (headless, 1440×900 and 1920×1080, DPR 2, vsync): V8 measured again today on the same machine gives 51.4 and 36.0 fps; now 50.2 (−2%) and 35.4 (−2%) on a fresh game, and 50.2 and 36.8 mid-game, with 0 idle React commits and no frame over 34 ms. One 1920×1080 mid-game run gave 30.8 but repeats gave 37.0 and 36.6; the first run on a fresh server is low for V8 too (43.4, then 51.4). Within the 10% budget. *Console:* no errors or warnings in dev at all four sizes, in the production build served at `/isles-3d/` (default, `quality=low|medium`, `?board=demo`, `?nowebgl` notice), and no failed requests. *Found and fixed:* the G4.6a board picker took focus on a fresh page, and Chrome counts focus with no prior input as keyboard focus, so every visitor saw its hint pill and a cursor on the board; it also appeared on the `?board=demo` showcase, which has no game board. The picker now moves focus on its own only when the last input was a key press (`ui/modality.ts`); an arrow key or Enter on a page with nothing focused starts keyboard placement; in board-only phases (setup, robber, free roads) it takes focus from wherever a dialog returned it; it doesn't render in demo mode. Rechecked by keys at all three sizes (16 setup placements, robber, a road from Build, Escape, a full seven by Enter) and by mouse (no pill, no focus taken). Tests 170; build clean. Screenshots are in `screenshots/milestones/g4.7/`, including `demo_1440x900_v8_framing.jpg` and `diffmap_vs_v8.jpg`.

**G4.8a result (2026-11-12):** the hot-seat pass-the-device screen (§18). The *viewer* is the player the game waits for: the active player, or during a seven's discards the next discarding player in turn order (`viewerOf`); the hand tray now shows the viewer's hand, so a discarding player sees their own cards instead of the active player's. When the viewer changes to someone holding private cards (resources or development cards, `hasPrivate`), `ui/PassDevice.tsx` covers the app: "Pass the device to Blue", the reason ("Blue's turn", "Red must discard 4 cards") and "I'm Blue: show my cards". The decision is made in the same render as the state change (`needsPass`), and while covered the HUD renders neither the hand nor any dialog, so nothing private shows even for a frame; the rest of the page is `inert` (no Tab, hidden from screen readers) and Tab stays on the button. The board stays faintly visible because it is public. Empty hands need no screen, so the first setup round passes without interruptions, and a player who gains cards mid-turn is not interrupted either. After the reveal a keyboard user lands on the main action, a discard dialog or the board; mouse users get no programmatic focus (as in G4.7). Tests: 2 more (172 total) for the viewer through sequential discards, the empty-hand case, development cards and the end of the game. Browser at 1440×900, 390×844 and 844×390, keys and mouse: the whole setup without a screen; Roll and End Turn hand over to Blue behind the screen, with the hand not rendered; Enter reveals Blue's hand with focus on Roll; a seven with two discarding players shows two screens in a row (each discard dialog only after its screen), then the robber; game over shows the victory card with no screen. G4.6 and G4.7 keyboard flows rechecked (their scripts now confirm the screen after jumping through a replay). No console errors. Perf 51.8 fps, 0 idle React commits. Screenshots are in `screenshots/milestones/g4.8a/`. Known limit: when answering a player trade offer on the proposer's device, the Accept button still shows whether a responder can pay ("Needs 1 more ore"); a per-responder pass flow would be needed to hide that.

**G4.8b result (2026-11-12):** autosave and resume (§22). `store/autosave.ts` writes the replay file to local storage (`isles3d.save.v1`) after every state change; every storage access is wrapped, so a blocked or full storage only means no save. A saved file is checked like any replay (schema 1, same engine major version, every action must apply). The store gained `load(file)`: it replays silently (event listeners hear nothing, so no build drops, production tags or notices for history), tells state listeners once, and keeps the action log so saving continues from there; a file that doesn't replay is rejected and the current game kept. `generation()` bumps on every reset and load, and the robber snaps into place on a new or resumed game instead of hopping (this also removes the hop back to the desert on New game). On load, `ui/Resume.tsx` offers "Continue your game?" with the turn, the phase line and public scores, when the save has moves and isn't finished. Autosave starts only once the choice is made, so a stray click can't overwrite the save (the page is inert behind the card; Tab cycles its two buttons). Resume loads the game, clears notices and leaves the pass-the-device screen to guard the hand of whoever the game waits for; New game drops the save and the fresh game is saved from its first move. Tests: 3 more (175 total): silent load and continued log, rejected files, autosave on and off, finished and empty saves not offered, junk and throwing storage. Browser at 1440×900, 390×844 and 844×390: 330 golden actions saved; after a reload the offer reads "Turn 114 · Blue: roll the dice"; a click behind the card changes nothing; Enter resumes to the identical state (turn, phase, pieces, robber) with no notices or tags and the robber already in place, then "Pass the device to Blue", then Blue's hand with focus on Roll; one more action makes the save 331; New game clears it; a finished game is not offered. Saving a full 615-action game costs 0.1 ms (30 KB). G4.6–G4.8a flows rechecked; no console errors. Perf: 42–44 fps at 1440×900 DPR 2 both with and without this change in back-to-back runs, so the machine was slower than in earlier steps (51.8 in G4.8a); 0 idle React commits. Screenshots are in `screenshots/milestones/g4.8b/`. With this, every G4 task is checked; the G4 exit review (a complete 4-player game played through the UI) is next.

**G4 exit check (2026-11-12):** two complete 4-player hot-seat games were played in the browser through the UI only, by `scripts/playthrough.mjs`. It reads the engine state through the dev handle to decide, but every action goes through a HUD control (pass screen, Roll, End Turn, Build menu, Trade dialog with bank and player offers, development card panel, discard and steal dialogs) or the keyboard board picker. Desktop 1440×900, seed 2024: Blue won on turn 194 after 939 actions (5 min), including 61 bank trades, 65 offers (54 completed), 25 cards bought, Knight, Monopoly, Year of Plenty and Road Building played, 47 robber moves and 3 discards. Compact 390×844, seed 77: Blue won on turn 272 after 1,249 actions (6.5 min), with 15 discards and 29 steals. Both: 0 rejected actions, 0 console errors, and after every one of the 195 and 279 pass screens the hand shown matched the engine state for that player. The victory tables match the public points plus revealed VP cards. Mid-game and final screenshots stay sharp and readable (tokens unobstructed, player colours distinct); the scene itself was compared with V8 in G4.7. Results and screenshots are in `screenshots/milestones/g4-exit/`. The first run stopped on turn 3 because of a selector bug in the driver (it clicked "Trade with the bank" instead of "Trade with Blue"), not an app bug; fixed and rerun. Open items carried forward: the Accept button reveals whether a responder can pay (per-responder pass flow); the §18 scrolling game log; real-device and VoiceOver checks; the 1440×900 perf reading was 42–44 fps on the last day with and without the latest change (machine load), against 50–52 earlier.

### G5 — Multiplayer and deployment (later)

Design targets are in `GAME_DESIGN.md` §20 (timers and absent players), §21 (architecture and protocol) and §22 (persistence). They are our own design and need the decisions in item 5 above before work starts.

- [ ] Choose a server-authoritative architecture and transport. The engine runs unchanged on the server. Decide hosting first: the current GitHub Pages deployment can serve the client only.
- [ ] Implement lobby, room state, reconnect and turn synchronization (events plus `viewFor` projections; message set in §21).
- [ ] Turn timers and absent-player fallback as ordinary logged actions, outside the pure engine (§20).
- [ ] Validate actions server-side and prevent client-authoritative cheating; dice and shuffles come from server RNG.
- [ ] Add error handling, logging, basic analytics and accessibility QA.
- [ ] Deploy and load-test realistic room sizes.

> Gameplay scope and rules should be reviewed before implementation. Avoid copying proprietary assets, branding or interface text from other products.

**Decision (2026-11-12):** start with a local server. A small Node WebSocket server lives in the repo (`src/server/`) and runs the unchanged engine. It is local only: no accounts and no running costs. Hosting is decided at G5.7. The protocol (`src/net/protocol.ts`) is shared by the server and the client.

Steps (each verified and reviewed before the next):

- [x] **G5.1 Room core (no network).**
  - Protocol types from §21 and envelope validation of untrusted frames: 8 KB limit, id format, integer `clientSeq`; payloads are checked by the engine (MALFORMED_ACTION).
  - A transport-free `Room` with seats p1–p4 and secret seat tokens. The first claimer is the host; others join as spectators.
  - The host starts once all four seats are taken, with a seed from Web Crypto.
  - Actions are applied one at a time for the seat bound to the connection. Retries are idempotent by `clientSeq`.
  - Each recipient gets only its own `viewFor`/`eventsFor` projection and its own legal actions.
- [x] G5.2 WebSocket transport and a server start script.
- [x] G5.3 Client online mode: lobby, joining by link, rendering server views.
  - [x] G5.3a Online store: the GameStore contract over a socket, fed by server views (no UI yet).
  - [x] G5.3b Seat-aware HUD, lobby screen, join by link; hot-seat-only parts (pass screen, autosave) off online.
- [x] G5.4 Reconnect and presence (seat token, snapshot resync on a `seq` gap).
- [x] G5.5 Turn timers and absent-player fallback as logged actions (§20).
- [x] G5.6 Hardening: rate limits, logging, error handling, accessibility QA.
  - [x] G5.6a Server: rate and connection limits, room cleanup, Origin allowlist, structured logs, contained failures.
  - [x] G5.6b Client: clear messages for refused or full rooms and dropped frames; accessibility QA of the online screens.
- [x] G5.7 Hosting decision, deployment and a load test.
  - [x] G5.7a Ready for Render Free: blueprint, proxy-aware limits, keep-alive, wake-up wait, build-time server address, load-test tool.
  - [x] G5.7b Live: the Render service, the site deployed against it, and a load test on the real host.

**G5.1 result (2026-11-12):** `src/net/protocol.ts`, `src/server/room.ts` and 8 tests in `src/server/__tests__/room.test.ts`, 183 tests in total.
- Covered: envelope rejection, seats, tokens and rejoin, the lobby broadcast, the start rules, and wrong-seat and malformed intents (rejected to the sender only, state unchanged). Also covered: spectators cannot act, and a retried `clientSeq` is applied once.
- A full bot game played only through room messages (4 seats plus a spectator) reaches gameOver with no rejections.
- Every message to every connection was checked:
  - no `rngState` or deck, and no seed before gameOver;
  - no other player's hand or dev cards;
  - stolen cards and bought dev cards redacted for third parties;
  - empty legal actions for the spectator;
  - `seq` without gaps.
- After gameOver the seed is visible to a newly joined spectator.
- Not yet run over a real socket (G5.2).

**G5.2 result (2026-11-12):** `src/server/server.ts` and `src/server/main.ts`; `npm run server` starts the server.
- Dev dependencies added (approved): `ws` 8.22, `tsx` 4.23, `@types/ws`, `@types/node` 22. None of them reach the client bundle: the build output is byte-identical.
- The server listens on 127.0.0.1:8787 by default (local only).
  - `POST /rooms` creates a room with a random id; `GET /health` reports the room count.
  - WebSocket frames go to `/ws`. The first message must be a `join` to an existing room, which binds the socket to that room. After that, every frame goes to `Room`, and its messages are delivered to the sockets they name.
  - Binary frames are rejected; frames over 16 KB close the socket (1009).
  - A closed socket updates lobby presence.
- 4 integration tests on a random port in `src/server/__tests__/server.test.ts`, 187 tests in total.
  - Covered: HTTP routes, join-first, unknown rooms, junk, binary and oversized frames, and rejoining a lobby seat with its token.
  - A full bot game over five real sockets (4 seats plus a spectator) reaches gameOver. Every socket received every update in order, saw only its own hand and saw the seed only in the final update.
- Manual check: `npm run server` in its own process; health, room creation, four joins and start (4 snapshots) worked from a separate Node client; stops cleanly on SIGINT.
- Not yet covered: a browser client (G5.3); reconnect during a game is only covered at the Room level (G5.4).

**G5.3a result (2026-11-12):** `src/store/onlineStore.ts`, with 3 tests in `src/store/__tests__/onlineStore.test.ts` (190 tests in total).
- The online store keeps the local store's contract (getState, subscribe, onEvents, onRejected, dispatch, generation), so the scene and HUD can bind to it unchanged.
  - It also exposes the session: status, seat, host, token, seats and the server's legal list. `start` and `close` complete it.
  - `dispatch` validates on the client and then sends the intent; the state changes only when the server's update arrives.
  - Acting for another seat, out of turn or as a spectator is refused locally and never sent.
- The server's view becomes a *shadow* `GameState`. It holds all the public data and this seat's real hand and cards. Hidden parts are opaque fillers with the right counts: other hands, other dev cards (never VP), the deck and the RNG.
  - Confirming a trade reads the responder's hand. An accepted responder's filler therefore holds the request: the server checked that at the accept, and the hand can't change before the confirm.
- `viewFor` now also exposes `playedDevThisTurn`, which is public (everyone sees a card being played). Without it the client couldn't tell whether a second card may be played this turn. 134 engine tests still pass.
- Evidence: four online stores and a spectator played a full game through a real server, 1,548 actions over 409 turns, with 71 player-trade proposals and 53 completed trades.
  - Moves were chosen only from each actor's own shadow state.
  - After every update, the legal actions computed from each seat's shadow equalled the server's list for that seat (6,192 comparisons).
  - 0 rejections; every store heard the same number of events; the seed was revealed at the end.
  - Negative control: without the accepted-responder filler, the test fails on CONFIRM_TRADE as expected.
- Not yet: a browser client. The HUD still assumes the active player is the viewer; G5.3b makes it seat-aware.

**G5.3b result (2026-11-12):** online play works in the browser; see the README for how to play.
- Entry: `?online` creates a room and moves to `?room=<id>`, which joins it. The seat token is kept per tab in sessionStorage, so a reload rejoins the same seat and four tabs are four players. `&server=` overrides the server address. New: `src/net/connect.ts`.
- `src/ui/Lobby.tsx`:
  - The lobby shows the four seats (open, joined, away, you), the invite link with Copy, and Start for the host once all seats are taken. A spectator is told it is watching.
  - When the server can't be reached, the lobby says how to start it.
  - During the game, a small "Online · you are <colour>" pill sits under the phase banner on desktop and above the dock on a portrait phone. On landscape phones it is screen-reader only, because there is no free strip. A lost connection shows a "Reload to rejoin" alert.
- Seat-aware HUD. `gameView` and `placementTargets` take `me`: `null` is hot-seat and behaves as before.
  - Online, the hand is always this seat's own.
  - Roll/End Turn, the build menu, trade and placement are live only on this seat's turn; otherwise they read "<colour>’s turn" or "Wait for your turn".
  - Every seat that owes a discard gets its own dialog at once. Only the active seat sees the steal choice.
  - In an open offer, only the addressed seat has Accept/Decline (others see "Deciding…"), and only the proposer confirms or cancels. This also closes the hot-seat leak where other screens learned whether a responder could pay.
  - A spectator sees no hand, no cards and no controls.
- Hot-seat-only parts are off online: the pass-the-device screen, autosave and Resume. The victory card offers "New room" instead of "New game".
- `viewFor` exposes everyone's `totalVP` once the game is over (GAME_WON announces them anyway). The shadow state turns the gap to public points into VP cards, so the final table matches the server for every seat and for a spectator (unit-tested).
- Tests: 6 new unit tests for the seat-aware views (196 in total).
- Two full online games, played only through each tab's UI with four tabs plus a spectator against `npm run server` (`scripts/online-playthrough.mjs`):

  | Viewport, seed | Result | Player trades | Bank trades | Discards |
  |---|---|---|---|---|
  | 1440×900, seed 7 | Orange won on turn 229 after 1,141 actions (5.8 min) | 85 offers, 71 completed | 67 | 14 |
  | 390×844, seed 77 | Blue won on turn 194 after 1,082 actions (4.5 min) | 87 offers, 75 completed | 86 | 13 |

  Both games also included cards, knights, road building and robber moves.

  At every turn change each tab was audited: the hand shown equals that seat's own cards, the hand label names its own seat, and no tab had a live control outside its seat's turn. Results: 0 mismatches, 0 other hands shown, 0 live controls out of turn, 0 console errors.

  The victory table was identical in all five tabs. The phone run also recorded 0 rejected actions in every tab. The desktop run's rejection listeners were lost when the dev server hot-reloaded the tabs after an edit of `Lobby.tsx` mid-run, so the tabs rejoined their seats by token; the game finished regardless.
- Layout:
  - The phone run showed the pill covering the notice stack (screenshots `phone-*-before-pill-fix.png`). It was moved above the dock and checked at 390×844 and 844×390.
  - The lobby backdrop is darker, so the placeholder board's banner doesn't read through.
- Regression: the hot-seat UI playthrough with seed 2024 replays the G4 exit game exactly (Blue on turn 194 after 939 actions, 195 pass screens, 0 rejections, 0 hand mismatches, 0 errors). Screenshots are in `screenshots/milestones/g5.3b/`.
- Not yet: reconnect is only tested by reload in the lobby and by that unplanned mid-game reload. Resync on a `seq` gap and presence during the game are G5.4. Real devices on a LAN were not tried.

**G5.4 result (2026-11-12):** a dropped connection, a reload or a closed tab no longer costs a seat.
- **Client.** The online store reconnects by itself.
  - The pause grows from 0.5 s to a 5 s cap. The store rejoins with the seat token, and the server answers with a full snapshot.
  - While a game is on screen the status is `reconnecting`. The page is frozen (`inert`) under a "Reconnecting…" card with "Retry now".
  - Before the start, a missing server reads "Can’t reach the game server". The page keeps trying and joins once the server answers.
  - Every update already carries the full view, so a `seq` gap needs no extra round trip: the state is exact, only missed animations are skipped.
  - A move sent into a dying socket is lost, not replayed; the player simply makes it again.
- **Bug found and fixed.** After a reload the client counted `clientSeq` from 0 again, and the server silently dropped its moves as old retries.
  - `welcome` now carries `nextSeq`, and the client continues from it.
  - A Room test reproduces the old failure, and a store test shows a reloaded client's move is applied.
- **Server.**
  - **Presence:** after the start, every join and leave is broadcast as `presence`. The HUD greys out the avatar of a player without a connection and adds an "away" badge (in the screen-reader label too).
  - **Takeover:** the same seat on a new connection replaces the old one. The old one gets `REPLACED`, is closed with code 4000 and doesn't fight back (no reconnect). Its tab offers "Play here".
  - **Heartbeat:** every socket is pinged every 15 s, and one that missed a pong is terminated. A sleeping laptop thus shows as away instead of holding the seat silently.
- **A reopened tab gets its seat back.** sessionStorage dies with the tab, so the browser also keeps the room's tokens in localStorage and offers them on `join` as `resume`.
  - The server gives back only a seat that has no live connection. Four tabs of one browser keep their own seats, while a closed tab reopened from the link returns to its seat instead of becoming a spectator.
- **Server restart.** Rooms live in memory, so a restarted server answers `NO_ROOM`. Every tab stops retrying and says the game is gone, with a "New room" link. Persistence is not in scope here.
- **Tests:** 12 new, 208 in total.
  - Room: presence, takeover, `nextSeq`, resume tokens.
  - Server: heartbeat drop, takeover close code.
  - Store: automatic rejoin mid-game, a reload with the saved token, takeover without a tug of war, `NO_ROOM` after a restart, joining a server that starts later.
  - A full bot game where 5% of moves are followed by dropping a random socket, possibly with the move still in flight. Three runs gave 373–869 actions with 12–36 drops and 3–9 lost moves. Every game ended, with no rejections, and the legal-action equality held after every resync.
- **Browser** (`npx tsx scripts/online-reconnect.mts`, its own server on 8788), at 1440×900 and 390×844:
  - With every socket dropped mid-setup, the frozen card shows and the root is inert. The game comes back with the same seats and state, and the next move is applied.
  - A closed tab shows as away to the others, and reopening the link returns it to its seat.
  - A reloaded tab keeps its seat, and its next move is applied.
  - A server restart leaves every tab saying the room is gone.
  - 0 console errors (WebSocket connection-refused messages during the restart are expected and filtered).
- **Regression.** A full online UI game (seed 7) ended on turn 125 after 654 actions with 0 rejections, 0 hand mismatches and 0 live controls out of turn. The result differs from G5.3b because the bot's choices depend on timing in the browser. The hot-seat playthrough with seed 2024 still replays the G4 exit game exactly (turn 194, 939 actions, 0 rejections, 0 hand mismatches); a first attempt was cut short by the Vite dev server reloading the page when ROADMAP.md was edited mid-run, not by the app. Screenshots are in `screenshots/milestones/g5.4/`.
- **Not yet.** The game waits indefinitely for an away player: turn timers and absent-player fallback are G5.5. Rooms are not persisted across a server restart. Real devices were not tried.

**G5.5 result (2026-11-12):** the game no longer waits forever for a slow or missing player.
- **Timers (§20).** The server owns the clock.
  - At `normal`: placement 60 s, roll 15 s, discard 30 s, robber 30 s, actions 90 s. Each completed trade adds 15 s, up to 180 s.
  - The host picks a preset in the lobby: Relaxed (×2), Normal, Fast (×0.5) or Off. Others see the choice as text.
  - Snapshots and updates carry `remainingMs`, and the client turns it into a local deadline.
  - The phase banner shows "· m:ss" next to the phase, and the clock is never truncated. It turns red when the decision is yours and 10 s or less remain, and screen readers hear "10 seconds left" once.
  - The actions clock survives a trade proposal and the robber interlude.
- **Timeout actions** are ordinary, logged engine actions (`src/server/timeouts.ts`). Random picks use a separate RNG, so the game's dice are untouched.
  - Setup: the legal vertex with the most pips. Roll: roll. Discard: random cards.
  - Robber: the best tile touching the public-VP leader. Steal: a random victim.
  - Actions: end the turn; an addressed player declines the trade.
- **Absent players.**
  - A seat becomes absent after two timed-out turns in a row, or after more than 60 s without a connection.
  - An absent seat's decisions are taken at once, one per tick; the HUD marks it "auto" in amber, including the screen-reader label. Its own next move clears it.
  - With no human present nothing is auto-played, and an empty room is closed as `ABANDONED` after 5 minutes.
- **Tests:** 14 new, 222 in total.
  - Every timeout action is legal across a whole bot game. Limits and presets are checked.
  - Room on a fake clock: placement timeout, Off and Fast, host-only preset, the 15 s trade bonus, absent by streak and by disconnect, abandonment.
  - A full game with three absent seats and one human finishes.
- **Browser** (`npx tsx scripts/online-timers.mts`, its own server on 8788 with a script-controlled clock), at 1440×900 and 390×844:
  - The guest sees the host's Fast choice. The first placement shows 30 s, and the urgent clock is red.
  - A timeout makes the move. A closed tab is shown as "auto" and played automatically, and it returns with "auto" cleared.
  - 0 console errors.
- **Regression.** A full online UI game (seed 7) ended on turn 165 after 904 actions with 0 rejections, 0 hand mismatches and the same victory screen in every tab. The hot-seat seed 2024 game still replays exactly (turn 194, 939 actions); its banner looks as before. Screenshots are in `screenshots/milestones/g5.5/`.
- **Not yet.** No rate limits or room limits (G5.6). Rooms are not persisted across a server restart. Real devices were not tried.

**G5.6a result (2026-11-12):** the server now protects itself; `src/server/limits.ts` holds token buckets and the defaults.
- **Limits** (all configurable through `startServer({ limits })`):
  - Frames per connection: a burst of 40, then 10 per second. A dropped frame is answered with `RATE_LIMITED`. A flood (40 drops, refilled at 2 per second) closes the socket with 1008.
  - Room creation: 10 per minute per address (429 with `Retry-After`), and 500 rooms in total (503).
  - WebSocket handshakes: 60 per minute per address. Open sockets: 32 per address and 2,000 in total. All of these are refused before the upgrade.
  - 24 connections per room (`ROOM_FULL`; the client stops retrying).
  - A socket must join a room within 10 s, or it is closed.
- **Cleanup.** A room with no connection for 10 minutes is removed, whether it is a lobby, a finished game or anything left over. Abandoned rooms (§20) still go after 5 minutes, and their sockets are unbound. A page that comes back later hears `NO_ROOM`, and the text now says the room sat empty or the server restarted.
- **Origin allowlist.** `ORIGINS=https://a,https://b npm run server` lets only those pages open sockets or create rooms, and CORS echoes only those origins. The default stays open for local play.
- **Logs.** One JSON line per event: listening, room created and removed (with the reason), connection open, join (seat or spectator), close (with code), game started, game over, limits hit, and errors. Entries never hold seat tokens, message bodies or addresses.
- **Failures are contained.** An exception in a room's message, join, leave or tick is logged, and the sender gets `SERVER_ERROR` with nothing changed; the process and the other rooms go on. Anything uncaught outside the server exits the process with a `fatal` log line, for a supervisor to restart.
- **Client.** `?online` no longer continues at `?room=undefined` when the server refuses to create a room.
- **Tests:** 10 new, 232 in total. They cover the bucket, the frame limit and the flood close, room creation (429 and 503), handshake caps and rate, a wrong path, `ROOM_FULL`, the join deadline, removal of empty rooms on a fake clock, the Origin allowlist, a throwing room answered with `SERVER_ERROR` while another room still works, and that logs hold no token.
  - Bot games in the socket and store tests answer at machine speed, hundreds of frames a second, so they lift the frame limit. The UI checks below run with the defaults.
- **Browser, with default limits:**
  - A full online UI game (seed 7) ended on turn 205 after 1,040 actions with 0 rejections, 0 hand mismatches and the same victory everywhere. The server log has no limit entries.
  - The reconnect and timer checks (`scripts/online-reconnect.mts`, `scripts/online-timers.mts`) pass with 0 console errors.
  - The hot-seat seed 2024 game still replays exactly (turn 194, 939 actions).
- **Not yet (G5.6b).** A refused room creation (429 or 503) or a full room still shows the generic "Can't reach the game server" before the game. `RATE_LIMITED` lands in the lobby error line as raw text. Behind a proxy all players share one address until G5.7 decides how to trust `X-Forwarded-For`.

**G5.6b result (2026-11-12):** every way of having no game now says why and offers one action. The online screens pass an accessibility check.
- **Error states.** The session carries an `errorCode`, and one table gives each case its title, text and action, both in the lobby dialog and in the in-game notice:
  - room creation refused (429 "Can’t create a room yet", 503 "The server is full");
  - no server ("Can’t reach the game server", with the `npm run server` hint);
  - an old link ("This room is gone"), a full room, an abandoned room, and a seat opened in another tab.
  - "Try again" reloads; "New room" keeps a chosen `&server=`.
  - A `?online` whose room couldn't be created no longer joins a room called "none": the store starts closed with the reason and opens no socket.
  - `RATE_LIMITED` shows "Too many clicks at once: some were ignored. Try again." for 4 s. The connection stays, and the player simply acts again.
- **Accessibility, online screens.**
  - A closed state is an `alertdialog` with the focus on its action; the open lobby takes the focus on the dialog itself.
  - Tab stays inside the dialog.
  - The turn-timer radios have one tab stop, and the arrows select (APG radio pattern); each radio's name includes its hint.
  - The lobby status is a polite live region, and "Invite link copied" is announced.
  - The app is now a `<main>` landmark. axe flagged `region` on the game screen, hot-seat as well; the change is semantic only, and the layout is unchanged in a screenshot comparison.
- **Tests:** 3 new store tests (232 → 235): a failed creation never connects, `ROOM_FULL` stops retrying, and `RATE_LIMITED` clears itself while the connection stays.
- **Browser** (`npx tsx scripts/online-a11y.mts`, its own servers on 8788 and 8789; axe-core 4.10.2 is loaded from cdnjs into the page for the check only, not a project dependency), at 1440×900 and 390×844:
  - each closed state shows its title, focuses its action and keeps the focus in the dialog;
  - Tab cycles invite link → Copy link → the checked radio → back, and ArrowRight selects Fast;
  - the rate-limit notice appears and clears;
  - axe reports 0 violations on the lobby, every closed state, the game screen and the spectator screen;
  - 0 console errors.
- **Regression.**
  - A full online UI game (seed 7) ended on turn 141 after 731 actions with 0 rejections, 0 hand mismatches and the same victory everywhere.
  - The reconnect and timer checks pass; the in-game "room is gone" notice shows the new text.
  - Hot-seat seed 2024 still replays exactly (turn 194, 939 actions).
  - Screenshots and the axe results are in `screenshots/milestones/g5.6/` (`b-*`, `a11y-*.json`).
- **Not yet.** Screen readers were not tried by hand (VoiceOver or NVDA), only axe and keyboard checks. Pages outside the online screens were not re-audited here. Behind a proxy all players share one address until G5.7.

**G5.7 decision (2026-11-13):** host for free. The client stays on GitHub Pages, and the game server runs on Render's free web service. The alternatives were weighed and set aside:
- Cloudflare Durable Objects: free and never sleeps, but the transport would have to be rewritten; kept as the fallback.
- An Oracle Always Free VM: needs a card, capacity is unreliable, and the server must be run by hand.
- A tunnel from a home computer: works only while that computer is on.

**G5.7a result (2026-11-13):** everything needed before the service exists.
- **`render.yaml`.** One free web service in Frankfurt on Node 22: `npm ci`, then `npm run server`, with a health check on `/health`.
  - Environment: `HOST=0.0.0.0`, `TRUST_PROXY=1`, and `ORIGINS` limited to the GitHub Pages site.
  - `buildFilter` redeploys only on server-side changes, because a redeploy ends every room.
- **Proxy.** With `trustProxy`, the per-address limits use the last `X-Forwarded-For` entry, the one Render's proxy appends. A forged first entry doesn't change the address, and a test covers it.
- **Free-plan sleep.** The plan sleeps after 15 minutes without inbound requests or WebSocket messages.
  - An open page now sends a `ping` every 4 minutes. It gets no reply and changes nothing, but a lobby or a slow game keeps the server awake.
  - `?online` keeps asking for up to 90 s while the server wakes; a proxy 502, 503 or 504 without JSON counts as still waking. Meanwhile a plain line says "Waking up the game server… n s". The server's own refusals (429, and 503 with JSON) are final.
- **Client build.** `GAME_SERVER=<host> npm run deploy` builds the site with `VITE_GAME_SERVER`, so the site's `?online` and invite links need no `&server=`.
- **Load-test tool** (`scripts/load-test.mts`). Bots play whole games over real sockets, four seats and a spectator per room, choosing only from the legal actions the server sends each seat. It works locally or against a URL.
  - Locally, with limits lifted: 50 rooms (250 sockets) with a 150 ms pause per move for 3 minutes. That gave 35,465 moves at 192 per second, 44 games finished, a round trip of p50 3 ms, p95 7 ms and max 15 ms, 0 rejections and 0 errors. The process peaked at 263 MB and 35% CPU, bots included.
  - A Mac is not the 0.1-CPU free instance, so the number that counts comes from G5.7b.
- **Checks:**
  - 240 tests (5 new: proxy address, ping, the wake-up wait with retries and final refusals, keep-alive).
  - `npm ci --dry-run` accepts the lockfile.
  - **Production rehearsal:** `main.ts` with Render's environment on 8790 and a production build with `VITE_GAME_SERVER`, served by `vite preview` under `/isles-3d/`. `?online` created a room, the invite link had no `&server=`, four tabs joined and the game started. A foreign Origin got 403, and the log was JSON.
  - `scripts/online-a11y.mts` passes, including the new waking line.
  - A full online UI game (seed 7, turn 175, 908 actions) passed with 0 rejections, and hot-seat seed 2024 still replays exactly (194 / 939).
  - Screenshots are in `screenshots/milestones/g5.7/`.
- **Needs the owner (G5.7b).** Create the Render service from the blueprint; my side can't create accounts. Then deploy the site against its address and run the load test on the real host, within its per-address limits.

**G5.7b result (2026-11-13):** online play is live, for free.
- **Server.** The first Render build failed: `npm ci` for the whole project died in npm ("Exit handler never called!"), most likely out of memory on the free build machine.
  - `scripts/build-server.sh` now installs only esbuild and ws and bundles the server into `server-dist/main.mjs`, started with plain `node`.
  - In a clean clone it builds in 1.6 s using 137 MB.
  - A test keeps its pinned versions equal to the project's.
  - Render built it, and `https://isles-3d-server.onrender.com/health` answers in about 0.2 s. A foreign Origin gets 403.
- **Site.** `GAME_SERVER=isles-3d-server.onrender.com npm run deploy`. On `https://yyersultan29.github.io/isles-3d/?online` a room was created in 4.7 s.
  - The invite link has no `&server=`. Four tabs joined, the host picked Fast, and the game started in every tab.
  - The banner counted down ("· 0:28"), each tab named its seat, and there were 0 console errors.
- **Load test on the live server** (`scripts/load-test.mts`, 5 rooms, 25 sockets, a 300 ms pause per move, 8 minutes):
  - 3,723 moves; 4 games finished, and the fifth was still running at the cutoff because of the bots' pace.
  - 0 rate-limit notices and 0 server errors.
  - Round trip: p50 197 ms, p95 475 ms, p99 837 ms, max 1.9 s.
  - 20 refusals (0.5%): bots acting on a view that was already stale while updates were in flight, not server faults.
  - Warm HTTPS requests from this machine take about 120 ms, so roughly half the round trip is network, the rest the 0.1-CPU free instance.
  - **The §23 target (p95 < 200 ms) is not met on the free plan.** Moves feel slightly delayed but the game plays.
- **Region.** The first service had been created in Oregon, so the owner recreated it in Frankfurt under the same address. (The DNS name shows `gcp-us-west1` either way and says nothing about the region.) Same test in Frankfurt: p50 188 ms, p95 489 ms, p99 860 ms, 8 refusals, 0 errors. That is about the same as Oregon, so distance was not the cost.
  - With one room alone: p50 177 ms, p95 193 ms, max 392 ms. The §23 target is met at low load.
  - The base of about 175 ms is the network through the host's proxy (about 120 ms for warm HTTPS) plus the small instance. Five busy rooms push p95 to about 0.5 s, contention on the 0.1-CPU free instance.
  - If that ever matters: smaller updates (each move now sends every socket its full view), or a paid instance.
- Rooms end when the free service sleeps or redeploys.

---

### G6 — Fast trade and build (UX)

**Why (2026-11-13, after the owner played online):** trading and building take too many clicks and feel slow next to Colonist. The interaction patterns are taken from how that game behaves; none of its code or assets are used.

**Findings in the code:**
1. **The hand isn't interactive.** The cards (`ResourceCards` in `HUD.tsx`) are only a display, so resources can be used only through separate panels.
2. **Trade is split into Bank and Players tabs** that work differently. The bank tab makes the player pick give, get and a count by hand, and never suggests the best rate.
3. **Building is one-shot.** `Placement.tsx` and `BoardPicker.tsx` reset the mode after every build, so three roads take six clicks.
4. **A greyed-out build row is a dead end.** It says what is missing but offers no way to get it.
5. **A panel and a placement cancel each other.** `setPanel` clears the placement mode, so trading for a brick means choosing the road again afterwards.
6. **There are no keyboard shortcuts.**

**Measured goal** (desktop, clicks; G6.0 records the baseline):

| Flow | Now, desktop | Now, phone | Target, both |
|---|---|---|---|
| Trade 4 wood for a brick at the bank, then build a road | 6 | 8 | 3 |
| A second road straight after | 2 | 3 | 1 |
| Offer 1 wool for 1 ore to players, then trade with the one who accepts (proposer's clicks; the panel stays open afterwards) | 6 | 6 | 4, panel closed |

The "now" numbers are the G6.0 measurement. The first estimate of 7 for the bank flow was one too many, because choosing a road closes the trade panel.

**Rules for every step:**
- The engine and its rules don't change; every action still goes through `dispatch` and `legalActions`.
- The board, camera and art stay as they are.
- Each step gets tests, a build, and screenshots at 1440×900 and 390×844.
- The hot-seat replay (seed 2024: turn 194, 939 actions) and the online UI game still pass. The drivers in `scripts/` are updated with the UI, so the action sequence stays the same.
- Each step is reviewed and committed on its own.

Steps:

- [x] **G6.0 Baseline.** A script (`scripts/ux-flows.mjs`) plays the three flows above through the UI on the standard-fixed board and records clicks and panels. Time is not recorded: a script's timing says nothing about a person's. Desktop and phone screenshots of the build menu and both trade tabs give the before picture.
- [x] **G6.1 Trade and build logic, no UI** (pure functions in `src/ui/tradePlan.ts`, beside `gameView.ts`, with unit tests):
  - `bankQuote(bank, give, want)`: whether a give/want pair is one legal bank trade, at which rate and count. The engine's `BANK_TRADE` is one resource for one resource; mixed bank trades are left out.
  - `payOptions(bank, want)`: every way to pay for a wanted card at the player's rates (2:1, 3:1, 4:1), cheapest first.
  - `shortfall(state, kind)`: the cards missing for a build, plus a filled-in trade draft that covers them when the bank can.
  - The panels' readiness checks reuse `proposeCheck`, which mirrors the engine's checks.
- [x] **G6.2 A clickable hand.**
  - The hand cards become buttons. In the player's `actions` phase, a click adds one card to the trade draft's "give" side and opens the trade panel.
  - A small "−" on a chosen card removes one.
  - Outside your turn the cards stay plain, with a tooltip saying why.
  - The draft lives in the UI store (`src/store/ui.ts`), so it survives switching panels. It clears at the end of the turn and when the hand can no longer cover it.
  - Desktop and compact HUD; keyboard and screen-reader labels.
- [x] **G6.3 One trade panel.**
  - The Bank and Players tabs are replaced by "You give" (filled from the hand) and "You want" (five tiles).
  - Two actions:
    - **Bank**: enabled when the draft is one legal bank trade; it shows the rate, e.g. "4 wood → 1 brick (4:1)".
    - **Offer to players**: as now, with the recipient picker.
  - With "want" chosen and "give" empty, the panel shows the `payOptions` as one-click trades, e.g. "3 wool (port)" or "4 wood".
  - The open-offer view (accept, decline, confirm with a player) stays, and the panel closes after a completed trade.
  - The drivers `playthrough.mjs` and `online-playthrough.mjs` move to the new panel.
- [x] **G6.4 Missing cards → trade → build.**
  - A greyed-out build row shows the shortfall ("−1 brick") and becomes a button when the bank can cover it.
  - A click opens the trade panel with the draft filled in (`shortfall`). When that bank trade completes, the placement mode for the build starts by itself.
  - A trade started from the build menu returns to the build. Otherwise opening a panel still ends the placement, as now.
- [ ] **G6.5 Building that keeps going.**
  - After a road, settlement or city the placement mode stays on while the player can afford another and has a legal spot.
  - It ends on Esc, on clicking its row again, or when either runs out.
  - Build rows show how many the hand can pay for (×2) and light up when affordable.
- [ ] **G6.6 Keyboard shortcuts.**
  - R road, S settlement, C city, D development card, T trade, Esc closes or cancels, Enter confirms the panel's main action.
  - Inactive while typing in a field, behind the pass-the-device screen and outside the player's turn.
  - Listed under the Help button.
- [ ] **G6.7 Phone, accessibility and exit check.**
  - The compact HUD gets every flow: the hand above the dock, the trade panel as a bottom sheet, build rows with shortfalls.
  - axe shows 0 violations on the new panels, and every flow works by keyboard.
  - `ux-flows.mjs` is rerun against the baseline, and the targets above must hold.
  - The hot-seat and online regressions pass.
  - The site is deployed only with the owner's approval.

**G6.0 result (2026-11-13):** `scripts/ux-flows.mjs` measures the three flows through the real UI.
- **How positions are found.** For each flow the script searches a seeded bot game on the standard-fixed board for a position where the active player holds the needed hand, e.g. 5 wood, no brick, a 4:1 rate and a legal road after the trade. The store loads that game as a replay, and the flow is clicked on the HUD.
  - A spot on the board counts as one click; the keyboard picker places it.
  - Every flow checks the resulting state (cards and actions).
- **Desktop (1440×900):**
  - bank trade then road: 6 clicks, and the trade panel opens on the way;
  - two roads: 2 + 2 clicks;
  - player trade: 6 clicks, plus 1 click by the accepting player, and the panel stays open afterwards.
- **Phone (390×844):** 8, 3 + 3, and 6.
- **Phone bug found.** While the trade panel is open, the Build button can't be tapped: the panel's wrapper intercepts the tap. The trade panel has to be closed first, and the build popover costs one more tap every time. G6.3/G6.7 must fix it.
- 0 console errors. The before screenshots (both trade tabs, an open offer, the phone overlap) and the JSON results are in `screenshots/milestones/g6.0/`.

**G6.1 result (2026-11-13):** `src/ui/tradePlan.ts`, pure and engine-checked. No UI changes yet.
- **`bankQuote(state, give, want, me)`.** Ok exactly when the draft is one kind at the player's rate for one other kind, e.g. "4 wood → 1 brick (4:1)". Otherwise it names what to change: rate, mixed kinds, not enough cards, bank empty, not your turn, roll first.
- **`payOptions(state, want, count, me)`.** Every way to pay the bank, ordered by rate, then the biggest pile, then the usual order. Port rates are labelled "(port)".
- **`shortfall(state, kind, me)`.** Returns the missing cards and a greedy list of bank trades that pays from spare cards only (the build's own cards are never spent), plus the same as one give/want draft. `covered` is decided by applying the trades and asking the engine whether the build is then legal: there must be a spot, a piece, a card in the deck.
- **`affordable(state, kind, player)`.** How many the hand pays for, capped by pieces left (or by the deck).
- **Tests:** 9 new (242 → 251).
  - Fixtures: rates and ports, refusals, the road keeping its own wood, a city paid from two piles, no settlement to upgrade.
  - A check over three whole bot games (more than 500 action positions), against the engine at every position:
    - each exact single-kind draft is ok exactly when `validate` accepts the trade;
    - pay options are exactly the engine's legal bank trades for that card;
    - each covered plan applies trade by trade and leaves the build legal without spending its own cards.
  - Two deliberate bugs were planted: dropping the bank-stock check and not spending used cards. The first failed 2 tests at once. The second at first slipped through, because an over-spending plan only shows up as "not covered". The two-pile fixture was added for it and now fails on it.
- **Limit.** The plan is greedy, one missing card at a time. A cleverer mix might cover a rare hand it calls not covered; it never claims a cover that the engine refuses.

**G6.2 result (2026-11-13):** the hand fills the trade draft. Desktop and phone.
- **Hand cards.** In the player's own `actions` phase the five hand cards are buttons, e.g. "Trade one wool (you have 4, 2 chosen)". A click adds one card to the draft's "give" side, opens the trade panel on Players and keeps focus on the hand, so several cards can be picked in a row. A chosen card is lifted, shows ×N and has a red "−" ("Take back one wool"). An empty pile is disabled. Outside the turn the cards stay plain, and the tooltip gives the reason ("Wood: 3 (Roll the dice first)"). Behind the pass-the-device screen nothing changes.
  - `HandCards` in `HUD.tsx` is shared by both HUDs and replaces their two copies of the hand.
- **Draft.** It lives in `src/store/ui.ts` (`draftAdd`, `changeDraft`, `clearDraft`, `draftCovered`), beside the panel tab.
  - The Players composer reads and writes it, so it survives closing the panel or switching tabs.
  - A resource sits on one side only.
  - The draft clears at the end of the turn, after a proposal, and when the hand no longer holds it (after a trade or a robbery).
  - The Bank tab starts with the given kind selected when the draft holds exactly one kind.
  - The Trade button opens Bank when the draft is empty, as before, and Players when it isn't.
- **A regression caught and fixed.** At first the tab stayed on Players after an offer, so the hot-seat driver's later bank trade in the same turn found no Bank tab, and the seed 2024 game diverged (turn 157, 752 actions). With the Trade-button rule above it replays exactly again.
- **Checks:**
  - 4 new unit tests (255).
  - `scripts/hand-trade.mjs` at 1440×900 and 390×844: pick 2 wool and 1 wood, take the wood back, close and reopen, Bank preselects wool, add an ore wish ("Give 2 wool, get 1 ore"), end the turn and the draft is empty. axe shows 0 violations on the hand and the panel, and there are 0 console errors.
  - `ux-flows` is unchanged from G6.0: 6 / 2+2 / 6 on desktop and 8 / 3+3 / 6 on phone. The flows don't use the hand yet; the click savings come in G6.3–G6.5.
  - Hot-seat seed 2024 replays exactly (turn 194, 939 actions, 195 pass screens, 0 rejections, 0 hand mismatches).
  - The online UI game (seed 7, turn 156, 851 actions) has 0 rejections, 0 hand mismatches and no live controls out of turn.
  - The build passes.
- Screenshots and JSON are in `screenshots/milestones/g6.2/`. The board, camera and the rest of the HUD are unchanged; the phone trade panel still covers the Build button (G6.3/G6.7).

**G6.3 result (2026-11-13):** one trade panel instead of the Bank and Players tabs.
- **Layout.** One draft: "You give" tiles show the bank rate and how many you hold; "You want" tiles show what the bank holds. Two buttons:
  - **Bank** is enabled when `bankQuote` accepts the draft; its label carries the rate ("Bank trade: 4 wood → 1 brick (4:1)").
  - **Offer** sends to the chosen players as before.
  - The status line says what the draft will do. When players could take a draft the bank can't, a second line says why the bank can't ("Bank: The bank takes 4 wool per card (4:1)").
- **One-click bank trades.** With only a wanted kind chosen, "Pay the bank" lists every way to pay (`payOptions`, e.g. "4 wool", "3 grain (port)"), one click each.
- **Panel closes.** A completed bank trade or a confirmed player trade closes the panel. Focus returns to the Trade button.
- **Phone overlap fixed.** The build popover rises above the dialogs while it is open, so it can be tapped over an open trade panel. Checked by hit-testing the Road row.
- The tab state added in G6.2 is gone again. The drivers (`playthrough.mjs`, `online-playthrough.mjs`, `ux-flows.mjs`, `hand-trade.mjs`) now use the panel: want a card, pay; offers start from the hand in `ux-flows`.
- **Clicks (`ux-flows`, against G6.0):**

  | Flow | Desktop | Phone | Target |
  |---|---|---|---|
  | Bank trade, then road | 6 → 5 | 8 → 6 | 3 (G6.4) |
  | Second road | 2 → 2 | 3 → 3 | 1 (G6.5) |
  | Player trade | 6 → 4, panel closes | 6 → 4, panel closes | 4, panel closed: **met** |

- **Checks:**
  - 255 tests pass and the build passes.
  - `hand-trade.mjs` at both sizes: the "4 wool" option pays for an ore, the panel closes and focus returns to the Trade button. axe shows 0 violations and there are 0 console errors.
  - Hot-seat seed 2024 replays exactly (turn 194, 939 actions, 61 bank trades, 65 offers, 54 completed, 0 rejections, 0 hand mismatches).
  - The online UI game (seed 7, turn 215, 1,165 actions, 64 bank trades, 95 offers) has 0 rejections, 0 hand mismatches and no live controls out of turn.
- **Known.** The Trade button is still labelled "Trade with the bank" (the drivers find it by that). It can be renamed to "Trade" with them in G6.6/G6.7.
- Screenshots and JSON are in `screenshots/milestones/g6.3/`.

**G6.4 result (2026-11-13):** a build row short of cards leads straight to the trade and back to the build.
- **Rows.** A greyed-out row greys out the cost icons the hand lacks.
  - When `shortfall` says bank trades cover them and the build is legal afterwards, the row stays a button and its arrow becomes a gold trade icon.
  - Its label adds the plan, e.g. "Build Road: 1 wood, 1 brick (Need 1 more brick; trade 4 wood → 1 brick first)".
- **Panel.** A click opens the trade panel with the plan as the draft. The status says "For a road: 4 wood → 1 brick", and a two-kind plan reads "For a city: 4 wool → 1 grain, 4 ore → 1 grain".
  - **Bank** makes the plan's trades and then starts the placement. While the panel is open, the build goal is kept in the UI store (`setBuildGoal`).
  - Editing the draft turns the panel back into a plain trade. Closing it, or the end of the turn, drops the goal.
- **Development card.** After the trade the card is one click in the build menu; it is not bought automatically. Online the buy would be checked against the state from before the trade arrives, and refused.
- **Online.** Each trade is checked against the state from before the first one, which is safe: the plan pays every trade from spare cards, so each is valid on its own, and the server applies them in order. The placement mode starts at once, and its spots appear when the update arrives.
- A fully chosen give tile ("×4 of 4") no longer looks dimmed.
- **Clicks (`ux-flows`, against G6.0):**

  | Flow | Desktop | Phone | Target |
  |---|---|---|---|
  | Bank trade, then road | 6 → 3 | 8 → 4 | 3: **met on desktop**; the phone pays one tap to open the build popover (G6.7) |
  | City paid with two bank trades | 3 | 4 | (new) |
  | Second road | 2 | 3 | 1 (G6.5) |
  | Player trade | 4, panel closes | 4, panel closes | met (G6.3) |

- **Checks:**
  - 256 tests pass (`tradesText`, `sameDraft`) and the build passes.
  - `ux-flows` at both sizes: the placement starts right after the trade; 0 console errors.
  - Hot-seat seed 2024 replays exactly (turn 194, 939 actions, 0 rejections). The hot-seat driver is unchanged.
  - The online driver now sometimes takes a short settlement or city row instead of a plain bank trade. Full online game (seed 7): turn 205, 993 actions, 5 trade-then-build moves through the real server, 0 rejections, 0 hand mismatches, no live controls out of turn. The run doesn't record how many of those 5 plans had two trades. The two-trade case is checked locally (`ux-flows`, unit tests).
  - A first online run stopped at turn 217 because editing the driver mid-run made Vite reload the pages (as in G5.4), not because of the app; it passed on rerun.
- Screenshots and JSON are in `screenshots/milestones/g6.4/`.

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
| V6 — HUD polish | Done | V6 | `screenshots/milestones/v6/` | V6.1 a11y, focus and tokens; V6.2 compact HUD and camera fit for tablet/phone. Open: resource-card illustration pass, larger board on landscape phones |
| V7 — Camera & visual QA | Done | V7 | `screenshots/milestones/v7/` | Pan clamp, reset (dbl-click/R), view presets, tile hover, QA at 10 viewports and DPR 1–3; docs in CAMERA.md |
| V8 — Performance | Done | `bdc6ec0`, V8 | `screenshots/milestones/v8/` | Shadow-map throttling, quality presets, WebGL fallback, ASSETS.md, perf probe. 52.6 fps @1440×900 DPR2 (was 46.6); identical image on `high` |
| G1 — Engine foundation | Done | `861b562` | — | 65 tests; setup, dice, production, views, replay |
| G2 — Construction & robber | Done | `40d5a8e` | — | 97 tests; builds, seven/discard/robber/steal, Friendly Robber, Longest Road, fuzzer |
| G3 — Trades, dev cards, victory | Done | `e31e683` | — | 134 tests; bank/port and player trades, dev cards, victory, views, golden replays, 1,000-game bot playout (999 finished, 1 at the 2,000-turn cap) |
| G4 — 3D/UI integration | Done | `62ed0d3`, `cd3258b`, `ed0f78b`, `83f998b`, `2d31b1f`, `fe96cb1`, `2fb6b3a`, `8e49704`, `0c655e3`, `1cf7dec`, `286c0d0`, `9b67662`, `7d5c011`, `1b27410`, `9b9c47a`, `ea5a7bd`, `05fcb1b`, `7f208ac`, `2c9f7df`, `99a1c09`, G4 exit | `screenshots/milestones/g4.1/` … `g4.8b/`, `g4-exit/` | G4.1 store; G4.2 board from state; G4.3 placement; G4.4a players, phase, dice, Roll/End Turn; G4.4b hand and build menu; G4.4c discard and steal; G4.4d bank, port and player trades; G4.4e dev cards (G4.4 done); G4.5a notices; G4.5b robber; G4.5c build/production feedback; G4.5d victory screen (G4.5 done); G4.6a keyboard placement; G4.6b focus and announcements (G4.6 done); G4.7 regression vs V8; G4.8a pass-the-device screen; G4.8b autosave and resume; exit check: two full games through the UI (reviewed 2026-11-12) |
| G5 — Multiplayer | In progress | `71f775f`, `8e2b243`, `d9aac51`, `356d3d0`, `4831b33`, `26125fe`, `9cefa3e`, `56cef12`, `7a222d1`, `05a3cef`, G5.7b | — | G5.1 room core (local server first); G5.2 WebSocket server; G5.3a online store; G5.3b browser online play (two full 4-tab games); G5.4 reconnect and presence; G5.5 turn timers and absent players; G5.6 server limits, logs, client error states and online accessibility QA; G5.7 live on Render Free + GitHub Pages; `GAME_DESIGN.md` v1.2 |
| G6 — Fast trade and build | In progress | `981cdb6`, `b067ef5`, `4a5f419`, `c4c363f`, `bb0bab1`, G6.4 | — | Approved 2026-11-13 after online play: clickable hand, one trade panel, missing cards → trade → build, building that keeps going, shortcuts |

## 9. How to instruct Claude Code

Use this at the start of a session:

> Read `ROADMAP.md` and inspect the current project and `references/colonist-reference.png`. We are working on **[MILESTONE]** only. First audit relevant code and propose a concise plan. Implement only this milestone while preserving camera, sharpness, HUD and existing features. Validate with build/typecheck and screenshot comparison. Update the roadmap progress log and report changed files, visual differences, tests, performance observations and commit hash. Do not start the next milestone without approval.

**Recommended next action:** G6.5: building that keeps going (the placement stays on while another is affordable and legal; ×N on the build rows).
