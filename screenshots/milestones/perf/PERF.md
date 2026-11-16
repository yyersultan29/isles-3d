# Perf P0–P3 — frame budget, before vs after (2026-11-16)

Headless system Chrome (ANGLE/Metal), the owner's MacBook Pro M3 Pro, 1512×945 CSS px at DPR 2
(a full-screen window: a 3024×1890 buffer), `high` unless noted. The headless display runs at
60 Hz; the real screen is 120 Hz, where "before" asked for up to 120 frames a second.
Reproduce: `node scripts/perf-budget.mjs "http://localhost:5173/?menu=0&fps[&alwaysrender]"`.
"Before" is `?alwaysrender` (the old continuous loop, kept for A/B).

## Frames rendered per second

| State | Before `high` | **After `high`** | After `medium` |
|---|---|---|---|
| Idle board | 48–50 (GPU-bound) | **30** | 30 |
| Pointer moving | 50 | 50 (GPU limit) | 60 |
| Orbiting the camera | 48 | 50 (GPU limit) | 60 |
| Window unfocused | 50 | **4** | 4 |
| Unfocused + a game event | 50 | 30 | 30 |

Main thread: idle 15% → 13%; unfocused 15% → **3.5%**.

## Estimated GPU load (frame cost ≈ 1000 / 56 fps ≈ 18 ms at `high`, uncapped)

| State | Before | After |
|---|---|---|
| Idle board | ~100% (on 120 Hz: always behind) | **~54%** (30 × 18 ms) |
| Interacting | ~100% | ~100% at `high`; ~65% at `medium` |
| Unfocused | ~100% | **~7%** |

An estimate from frame cost. The real test is the owner's fans, checked with `?fps`.

## Mountain guy cost (P5 re-measure, uncapped, 3 runs each)

With him: 56.2 / 56.0 / 56.3 fps. `?off=guy`: 56.2 / 56.4 / 52.6 fps. **No measurable cost**: the
earlier "7%" was one noisy run. P5 (texture diet) is skipped: it would not move the frame rate.
It would save ~16 MB of texture memory (`matTexMB` 36.3 vs 20.3), which matters only on low-memory devices.

## Picture

Still frame (`?seed=7&nohover&reducedmotion`, 1440×900), mean abs diff / pixels > 12:
before vs before 0.03 / 0.02% (noise); before vs after **0.04 / 0.03%**: identical.
