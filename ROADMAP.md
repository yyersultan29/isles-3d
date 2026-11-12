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
- [ ] **G4.2 Board from state** (a: tiles/tokens/robber ✅, b: ports ✅, c: pieces): the scene reads tiles, tokens, ports, robber, buildings and roads from engine state through the G1.10 adapter. The art direction is unchanged (needs the board decision above).
- [ ] **G4.3 Valid-placement highlights**: extend the visual-only hover (`TileHover`) to vertices and edges taken from `legalActions`; robber target tiles in `moveRobber`.
- [ ] **G4.4 HUD wiring** (flows per phase in §18): dice, resource hand, build menu (enabled only when legal and affordable), player cards (public VP, card counts, awards), bank and trade dialogs, discard dialog, dev card hand, turn and phase indicator.
- [ ] **G4.5 Feedback**: placement animations, production particles or tags from the source tile, robber move, steal notice, award changes, victory screen; all respect reduced motion. Animations follow events and never delay state. Every rejected action shows the i18n message for its `ErrorCode` (§19).
- [ ] **G4.6 Accessibility**: every action reachable by keyboard; phase changes announced through a live region.
- [ ] **G4.7 Regression**: fixed-pose screenshots against the V8 baseline (no blur or camera changes); perf within 10% of V8; no console errors.
- [ ] **G4.8 Hot-seat privacy and resume**: a "pass the device" screen hides the previous hand before the next player's view renders, including between sequential discards (§18); autosave the replay after each action and offer "resume game" (§22).

**Exit criteria:** a full 4-player hot-seat game is playable in the browser; the scene stays as sharp and readable as at visual sign-off.

**Board decision for G4 (2026-11-11):** games render `standard-fixed` only (no random-board rendering in G4); the showcase layout stays as the `demo` scene preset. G4 is done in small steps, each verified and committed separately.

**G4.1 result (2026-11-11):** `src/store/gameStore.ts` is a plain-TS store: `getState`, `subscribe`, `onEvents` (events reach listeners before state listeners), `dispatch` (a rejected action changes nothing and notifies nobody), `reset`, `replayFile` (for autosave in G4.8). `src/store/GameProvider.tsx` adds `useGame(selector)` via `useSyncExternalStore`, `useDispatch`, `useGameEvents` (ref-based, no per-frame state) and `?seed=`. `App` is wrapped in the provider; nothing reads it yet. A dev-only `window.__islesStore` exists for browser checks and is absent from the production bundle. Tests: 7 store tests (141 total), including replay-hash equality with the store state. Browser: a live dispatch through the store works with no console errors. Pixel diff at 1440×900 DPR 2 `?nohover`: mean 0.05 against V8, noise floor 0.06 (`screenshots/milestones/g4.1/`); ~51 fps headless before and after. The JS bundle grew by 26 KB (9.4 KB gzip) because the engine is now included.

**G4.2a result (2026-11-12):** tiles, tokens and the robber come from the engine. `scene/board.ts` builds its 19 tiles from `STANDARD_FIXED` through the G1.10 adapter (`axialToScene`). Each scene tile carries its canonical `axial` id; `?board=demo` keeps the showcase layout. Mountains, forests, fields and vegetation are procedural per biome, so they followed the new layout without art changes. The robber reads `state.robber` from the store; on a numbered tile it stands 0.5 to the west so the token stays readable. Tests: 4 scene-board tests (145 total) check that every scene tile matches the engine's terrain and token. Browser: a live game driven through the store to a 7 moved the robber to `1,1` with no console errors; the store context reaches inside the R3F canvas. Screenshots are in `screenshots/milestones/g4.2a/` (game board, demo board, robber moved). The demo board differs from the G4.1 baseline only in animated areas (wheat sway, foam, smoke): 0.26% of pixels over 12/255, all at animation-phase spots, none structural. Still demo data until G4.2b/c: harbours (7 instead of 9 ports) and the buildings/roads.

**G4.2b result (2026-11-12):** the 9 engine ports replace the 7 demo harbours. `engineHarbors()` maps each port edge to its coastal tile and scene side through `edgeTiles` and `hexSides`. A test checks that every scene sign stands on the port's exact vertex pair with the port's kind and ratio. New sign icons: ore, and a neutral "?" coin for generic 3:1 ports. The demo board keeps its own harbours. **Camera change (approved 2026-11-12):** the desktop fit now keeps every harbour sign inside the safe area, clear of the side columns and the bottom tray, instead of only the west signs. Before this, 1–3 ports were hidden under the HUD at 1440×900 and 1920×1080; the demo's south harbour had also always been under the resource tray since V8. The board is ≈9–10% smaller on desktop; all 9 signs are visible at 1920×1080, 1440×900, 1280×720 and 1024×768, and numbers stay readable. The compact layout is unchanged, since it already fitted all signs. The orbit limit follows the home distance as before. Screenshots are in `screenshots/milestones/g4.2b/`, including `*_without_camera_fit.jpg` for comparison. Tests: 146.

### G5 — Multiplayer and deployment (later)

Design targets are in `GAME_DESIGN.md` §20 (timers and absent players), §21 (architecture and protocol) and §22 (persistence). They are our own design and need the decisions in item 5 above before work starts.

- [ ] Choose a server-authoritative architecture and transport. The engine runs unchanged on the server. Decide hosting first: the current GitHub Pages deployment can serve the client only.
- [ ] Implement lobby, room state, reconnect and turn synchronization (events plus `viewFor` projections; message set in §21).
- [ ] Turn timers and absent-player fallback as ordinary logged actions, outside the pure engine (§20).
- [ ] Validate actions server-side and prevent client-authoritative cheating; dice and shuffles come from server RNG.
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
| V6 — HUD polish | Done | V6 | `screenshots/milestones/v6/` | V6.1 a11y, focus and tokens; V6.2 compact HUD and camera fit for tablet/phone. Open: resource-card illustration pass, larger board on landscape phones |
| V7 — Camera & visual QA | Done | V7 | `screenshots/milestones/v7/` | Pan clamp, reset (dbl-click/R), view presets, tile hover, QA at 10 viewports and DPR 1–3; docs in CAMERA.md |
| V8 — Performance | Done | `bdc6ec0`, V8 | `screenshots/milestones/v8/` | Shadow-map throttling, quality presets, WebGL fallback, ASSETS.md, perf probe. 52.6 fps @1440×900 DPR2 (was 46.6); identical image on `high` |
| G1 — Engine foundation | Done | `861b562` | — | 65 tests; setup, dice, production, views, replay |
| G2 — Construction & robber | Done | `40d5a8e` | — | 97 tests; builds, seven/discard/robber/steal, Friendly Robber, Longest Road, fuzzer |
| G3 — Trades, dev cards, victory | Done | `e31e683` | — | 134 tests; bank/port and player trades, dev cards, victory, views, golden replays, 1,000-game bot playout (999 finished, 1 at the 2,000-turn cap) |
| G4 — 3D/UI integration | In progress | `62ed0d3`, `cd3258b`, G4.2b | `screenshots/milestones/g4.1/`, `g4.2a/`, `g4.2b/` | G4.1 store; G4.2a tiles, tokens, robber; G4.2b 9 ports, desktop fit keeps every sign clear of the HUD (board ≈9–10% smaller) |
| G5 — Gameplay | Backlog (spec ready) | — | — | `GAME_DESIGN.md` v1.2 |

## 9. How to instruct Claude Code

Use this at the start of a session:

> Read `ROADMAP.md` and inspect the current project and `references/colonist-reference.png`. We are working on **[MILESTONE]** only. First audit relevant code and propose a concise plan. Implement only this milestone while preserving camera, sharpness, HUD and existing features. Validate with build/typecheck and screenshot comparison. Update the roadmap progress log and report changed files, visual differences, tests, performance observations and commit hash. Do not start the next milestone without approval.

**Recommended next action:** **G4.2c**: buildings and roads from engine state, after the G4.2b review.
