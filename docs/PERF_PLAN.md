# P — Quiet and cool: performance analysis and plan

Status: plan approved 2026-11-16 ("да начинаем"). **P0–P4 implemented, P5 measured and skipped (no cost), owner review pending** (see §6, §7 and `screenshots/milestones/perf/PERF.md`). P4's default stays `high` until the owner chooses; P6 not started. Trigger: "когда я играю локально у меня мак
начинает шуметь" — the owner's MacBook Pro (M3 Pro, 120 Hz Liquid Retina XDR) spins its fans
during play.

Builds on the V8 audit (`screenshots/milestones/v8/PERF.md`): same tools, same method.

## 1. Analysis

### 1.1 Who is affected and why it matters

| Segment | Situation | What they feel |
|---|---|---|
| **Laptop players** (most players, the owner included) | Battery, fans, a hot keyboard | Fan noise, a warm laptop and battery drain within minutes. A board game makes them think the site is broken or heavy |
| **120 Hz displays** (MacBook Pro, many phones and gaming monitors) | Chrome asks for up to 120 frames a second | Twice the work of a 60 Hz screen, for no visible gain on a board game |
| **Weak devices** (integrated GPUs, older laptops) | Can't hold 60 fps at `high` | Stutter, as well as heat |

A board game is mostly still. Players look at the board, think and talk. Today the GPU works
flat out the whole time, as if it were a shooter.

### 1.2 Measurements (2026-11-16, headless Chrome / Metal on the owner's Mac)

1512×945 CSS px at DPR 2 (a full-screen browser window on this MacBook: a 3024×1890 buffer),
default `high`, no frame cap (`UNCAP=1 node scripts/perf.mjs …`). The fps shows how much work one
frame takes: below 60 means the GPU can't keep up even at 60 Hz.

| Configuration | Uncapped fps | Reading |
|---|---|---|
| Full pipeline (today) | **52.8** | GPU saturated: **100% busy at 60 Hz, and more on a 120 Hz screen** |
| `?off=ao` (no N8AO) | 75.1 | ambient occlusion ≈ 30% of the frame |
| `?off=bloom` | 54.6 | bloom ≈ 3% |
| `?nofx` (no post-processing) | 120 | post-processing as a whole ≈ 56% |
| `?off=guy` (no mountain guy) | 56.6 | the guy ≈ 7% (one run; to be confirmed, see P5) |
| `?quality=medium` | 91.5 | DPR 1.5 + cheaper AO |
| DPR 1 | 152 | fill-rate bound: pixel count dominates |

Main thread at the 60 fps vsync cap, idle board: **14% busy** (JS 13%), both in `npm run dev` and in
the production build. **CPU and React are not the problem; dev mode is not the cause.**
React commits while idle: 0.

### 1.3 Root causes

1. **The canvas renders continuously** (`frameloop="always"`), at the display's refresh rate,
   even when nothing changes on screen except slow ambient motion (water, wind, smoke, the guy).
2. **120 Hz.** On ProMotion Chrome drives `requestAnimationFrame` at up to 120 Hz. The game asks for
   every frame, and at `high` the GPU can't even make 60, so it never rests. Headless Chrome can't
   show this (it's fixed at 60), so it must be confirmed in the owner's real browser (P0).
3. **The look is expensive per pixel** (AO, post-processing, a 3024×1890 buffer). This was a
   deliberate V8 decision for the signed-off look. It is fine for a short burst, but not as a
   permanent 100% load.
4. **No idle state.** The window keeps rendering when it is visible but unfocused (the player is
   on a video call or in another app). Hidden tabs already stop: the browser pauses rAF.

### 1.4 What we must not break (CLAUDE.md guardrails)

- No change to camera, pixel ratio, post-processing or blur **at the default quality**, unless the
  owner approves a step that says so (P4 and P6 are marked).
- A still frame must stay identical: a pixel diff within the animation noise floor (V8 method:
  mean abs diff ≈ 0.14, under 0.2% of pixels > 12/255).
- Interaction must stay smooth: camera orbit, hover and placement at 60 fps where the GPU allows.
- Game logic is untouched. Rendering only.

## 2. Goals and acceptance

| Goal | Measure | Target |
|---|---|---|
| Idle board stops cooking the GPU | frames rendered per second on an idle board | **≤ 30** (today 60–120) |
| Never above 60 | frames per second on a 120 Hz screen while interacting | **≤ 60** |
| Unfocused window is quiet | frames per second when the window is blurred | **≤ 5** |
| Same picture | pixel diff, still frame, `high` | within the noise floor |
| Smooth interaction | frame pacing while orbiting (perf.mjs) | no new frames over 34 ms at `medium`+ |
| The owner's ears | play 10 minutes locally on the MacBook | fans quiet or low (owner's call) |

## 3. Plan: small steps, each verified and approved like G9

Order: the steps that don't change the look (P0–P3, P5) first; then the ones that trade
looks for speed (P4, P6) only if the owner wants them.

### P0 — See it on the real device (diagnostics only)
- `?fps` overlay: rendered fps, frame time and the current cap. Dev and production, off by default.
- The owner opens `localhost:5173/?fps` on the MacBook: this confirms the 120 Hz theory and gives a
  real-device baseline (headless can't show ProMotion or fan noise).
- Files: `src/ui/FpsMeter.tsx` (new), `App.tsx`. Risk: none.

### P1 — Frame budget: 60 while acting, 30 while watching *(main win, no visual change)*
- Canvas `frameloop="never"`; `FrameTicker` renders each frame itself (R3F `advance`) at a target rate
  (`demand` + `invalidate()` was tried first: it draws one rAF late and halved 60 to 30):
  - **60 fps while active:** pointer or keyboard input, wheel or drag, camera damping still moving,
    an event animation running (piece drop, robber hop, dice, production tags, the guy's reaction
    hop, board picker), and for ~1.5 s after the last of them;
  - **30 fps while idle:** ambient motion only (water, wind, smoke, ships, sheep, the guy mining).
- Never above 60, whatever the display. Ambient clocks already advance by real time (`animTime`),
  so motion speed doesn't change, only how often it is sampled.
- Shadow throttle counts rendered frames, so idle shadow updates drop with it (15/s). No change
  to the shadow look.
- Files: `src/scene/frameBudget.ts` (new: active/idle state, pure + tested), `World.tsx`
  (frameloop, ticker), `CameraInteraction.tsx`, `Feedback.tsx`, `Pieces.tsx` (Robber hop),
  `MountainGuy.tsx` (mark active), the dice component.
- Risks:
  - something that animates without marking itself active would play at 30 instead of 60. I'll
    list every `useFrame` (there are ~25) and check each one;
  - OrbitControls damping needs frames to settle, so its `change` event marks the loop active.
- Check: perf.mjs reports frames rendered per second idle and while orbiting; pixel diff; a
  playthrough; the reduced-motion path.

### P2 — Quiet when unfocused *(no visual change)*
- Window `blur`: drop to ~4 fps; `focus` or `pointerenter`: back to normal. Hidden tabs already
  stop (the browser pauses rAF).
- Online games still get state updates (WebSocket); only drawing slows down. The board catches up
  on the next frame.
- Files: `frameBudget.ts`. Risk: low.

### P3 — Measure, don't guess: perf tooling
- `scripts/perf.mjs` gains an idle phase and an interaction phase (scripted orbit), and reports
  rendered fps, frame times and main-thread %. A `PERF.md` table goes under
  `screenshots/milestones/perf/`, before and after each step.

### P5 — Mountain guy diet *(no visible change at board scale)*
- Re-measure his cost (3 runs each with and without). If it really is ~7%: textures 1024 → 512,
  keep only the base colour (the normal and roughness maps are invisible at ~36 px tall). The boulder
  and chips stop casting shadows into the shadow map (they're tiny).
- Files: `scripts/build-mountain-guy.mjs` (rerun), `public/models/mountain-guy.glb`, `MountainGuy.tsx`.

### P4 — Graphics setting with "Auto" *(changes the look on slow devices: owner decision)*
- A visible Graphics option in the start menu and the in-game menu: **Auto** / High / Medium /
  Low, saved in localStorage. The `?quality=` URL param stays for tests.
- **Auto** watches the real frame time for the first ~10 s of play. If `high` can't hold its
  budget, it steps down to `medium`, and never steps back up during the same session. On the
  owner's Mac at full screen this would land on `medium` (91 fps uncapped, so ~65% GPU at a 60 cap).
- Default: keep `high` (today's look) **or** make Auto the default. **The owner chooses.**

### P6 — Cheaper AO while idle *(optional, changes the look slightly: owner decision)*
- AO is ≈ 30% of every frame. Options: AO at lower quality during idle, or AO off on
  `medium`. Only with a side-by-side comparison the owner approves.

## 4. Expected effect (estimates from the table above, to be measured)

| State | Today | After P1–P2 | After P4 (Auto → medium) |
|---|---|---|---|
| Idle board, 120 Hz MacBook | GPU 100% (can't even reach 60) | **≈ 55%** (30 fps × ~19 ms) | **≈ 33%** |
| Orbiting the camera | 100% | 100% at `high` (52.8 < 60) | ≈ 65% |
| Window unfocused | 100% | **≈ 7%** | ≈ 5% |

So P1–P2 fix the "fans while I just look at the board" case without touching the picture.
Fans *while actively orbiting* at `high` need P4 (or a lower window size): a deliberate trade
the owner decides.

## 5. Out of scope

Camera, framing and blur changes; new assets; game logic; the server (Render). Phone-specific
tuning stays in G8.

## 6. Results — P0, P1, P2 (2026-11-16)

Files: `src/scene/frameBudget.ts` (pure budget + shared state, tested), `src/scene/FrameTicker.tsx`,
`src/ui/FpsMeter.tsx` (`?fps`), `World.tsx` (`frameloop="never"`, `?alwaysrender` restores the old
loop for A/B), `App.tsx`, `scripts/perf-budget.mjs`, `src/scene/__tests__/frameBudget.test.ts`.
Input, OrbitControls `change` (damping, camera reset) and every game event raise the rate globally,
so no per-component `useFrame` had to change.

`node scripts/perf-budget.mjs` — 1512×945, DPR 2, headless (60 Hz display):

| State | Rendered fps `high` | Rendered fps `low` | Main thread |
|---|---|---|---|
| Idle board | 30 (was 52–60, GPU-bound) | 30 | 13% |
| Pointer moving | 49 (GPU limit) | 60 | 17% |
| Orbiting | 48 (GPU limit) | 60 | 17% |
| Window unfocused | 4 | 4 | 4% |
| Unfocused + game event | 30 | 30 | 14% |

- Still frame, `?seed=7&nohover&reducedmotion`, 1440×900: old loop vs old loop 0.03 mean / 0.02% >12;
  old loop vs budget **0.04 / 0.03%** → identical within noise.
- 301 unit tests pass; build OK; guy-check, guy-react (EN+RU) and the start-menu check pass with no errors.
- Not verified: the 120 Hz cap and fan noise (headless runs at 60 Hz) → owner checks with `?fps`.

## 7. Results — P4, Graphics setting (2026-11-16)

Files: `src/scene/quality.ts` (live setting store, `DEFAULT_SETTING = 'high'`, Auto verdict, tested),
`src/ui/GraphicsSwitch.tsx` (start menu + help panel, EN/RU), `World.tsx` (DPR, shadow map, AO
follow the setting live), `FrameTicker.tsx` (Auto measures full-rate frames), `scripts/graphics-check.mjs`.

- Live switch: buffer 3024×1890 → 2268×1417 (medium) → 1512×945 (low); sun shadow map 4096 → 2048.
- Auto at 1512×945 DPR 2: after ~3 s of orbiting, High (≈50 fps) → **Medium** (60 fps). Never steps back up in a visit.
- The choice survives a reload (localStorage `isles.graphics`); `?quality=` still overrides.
- GPU memory: N8AO is created once and only enabled or disabled (unmounting it leaked ~10 textures per
  switch). 5× Low↔High: textures 60 → 60.
- Default `high` still frame vs the old loop: 0.04 / 0.04%, identical. Live Low vs `?quality=low`:
  differences only in animated foam, wheat and trees (captured at different moments), no AO.
- Menu fits at 390 px (no horizontal scroll); start-menu check (`g9-menu.mjs`) passes; 304 unit tests pass.
