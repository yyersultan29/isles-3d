# B — A new, fair board every game: analysis and plan

Status: **B1–B2 committed (`46eeaa8`), B3 committed (`50ee444`); B4 (online lobby choice) implemented, awaiting owner review** (2026-11-18); B5 not started. Checks: `scripts/b2-check.mjs`, `scripts/b3-check.mjs`, `scripts/b4-check.mjs [server]`
Original trigger: "сейчас карта статичный надо сделать бизнес сис анализ на
расстановку точек там у colonist есть алгоритм по установке точек".

"Точки" here means the board layout: which terrain goes on which hex, which number token goes on
it, and which port goes on which coastal edge. Settlement spots follow from that layout.

## 1. Business analysis

### 1.1 Why it matters

| Who | Today | What a generated board gives them |
|---|---|---|
| **Returning player** | The same 19 hexes and numbers every game. After 2–3 games the best opening spots are known by heart, so setup stops being a decision | Every game starts with a new puzzle, which drives replayability |
| **New player** | Doesn't notice yet | Nothing changes for them at first. The game must stay fair, with no "this board was decided at setup" games |
| **Online room** | All four players know the fixed board equally well | Fairness matters more here: a bad layout is visible to everyone and feels like a broken game |
| **The product vs Colonist** | Colonist starts each base game on a new layout. A fixed board makes Isles feel like a demo | Parity on a core expectation of the genre |

**Goal.** New games use a new layout by default. It must be **fair**: no hard rule broken, no
resource starved, no "god spot". It must be **reproducible** from the seed for replays and online
sync. And it must **look as good as the fixed board**, with readable tokens and no visual breakage.

### 1.2 What Colonist does (what we know, honestly)

- Colonist doesn't publish its generator. Searches found no developer post or spec, and
  GAME_DESIGN.md §2.4 already records it as undocumented.
- The genre baseline is the published base game's variable-setup rule: **6 and 8 are never on
  adjacent hexes**.
- Fan generators also commonly apply these rules (sources below):
  - keep 2 and 12 apart as well;
  - don't let identical numbers touch;
  - avoid same-resource clumps;
  - spread the 6s and 8s over different resources;
  - give every resource a minimum total "pips" (production weight);
  - cap the best corner at about 13 pips.
- So we can't copy "Colonist's algorithm". We can meet the same player expectation with a
  documented, testable algorithm of our own. This also suits the IP rules in GAME_DESIGN.md §25.

### 1.3 Scope

**In scope:**
- terrain, number tokens and port kinds on the standard 19-hex board;
- a menu choice of board;
- scene rebuild per game;
- online sync.

**Out of scope:**
- other board sizes (5–6 players);
- moving the port positions (the 9 edges stay fixed, §2.6);
- custom map editors;
- bots choosing spots.

## 2. As-is (code audit)

| Area | State | File |
|---|---|---|
| Engine generator | Exists. The `random` preset shuffles terrain, then tokens; it retries the token shuffle up to 200 times until no 6/8 touch, then shuffles port kinds. Falls back to `standard-fixed`. Deterministic from the seed | `src/game/board.ts` |
| Rules enforced | **Only 6/8 not adjacent.** Nothing about 2/12, equal numbers, resource clumps or resource balance | `redNumbersSeparated` |
| Who uses `random` | **Nobody.** StartMenu, Victory, GameProvider and the online blank state all create `standard-fixed` | `StartMenu.tsx:115`, `Victory.tsx:26`, `GameProvider.tsx:19`, `onlineStore.ts:129` |
| Scene board | **Static at module load.** `src/scene/board.ts` builds `TILES`, `HARBORS`, `LEDGES`, `EDGES` and `VERTICES` once from `STANDARD_FIXED` and `PORT_EDGES` | `src/scene/board.ts:56`, `:394` |
| Scene modules that read it | About 20: Terrain, Island, Vegetation (its blockers list is a module-level cache), Scenery, Harbors, Ships, Ocean, Pieces, Placement, TileHover, Feedback, textures, MountainGuy (`GUY_SPOT` is computed at import), BoardPicker, HUD, World | grep for `scene/board` |

**Root cause of "the map is static".** The engine can already make other boards. But every new
game is pinned to `standard-fixed`, and the scene can't draw anything else because it computes
the board once, when the module loads.

### 2.1 How fair is today's `random` preset? (measured)

Script: 20,000 seeds through `generateBoard(rng, 'random')`, 2026-11-17.

| Metric | `standard-fixed` | `random`, average | `random`, worst 10% |
|---|---|---|---|
| Adjacent pairs with the **same number** | 0 | 1.47 | ≥ 3 |
| Adjacent **same-resource** pairs | 2 | 5.9 | ≥ 8 (max 16) |
| 2 next to 12 | 0 | 0.25 | 1 |
| Resource balance: max − min of average pips per tile | 0.75 | 1.69 | ≥ 2.42 |
| Poorest resource's total pips | 9 | 8.0 | ≤ 6 |
| Best corner (pips of its 3 hexes) | 12 | 12.5 | 13 |

Share of boards with each problem:

| Problem | Share of `random` boards |
|---|---|
| Some identical numbers touch | **82%** |
| 3 or more same-resource clumps | **97%** |
| 2 and 12 touch | 25% |
| One resource starved (≤ 6 pips) | **15%** |

Retry cost: a plain shuffle passes the 6/8 rule only 13.7% of the time. Reaching 200 straight
failures has a probability of about 10⁻¹³, so the fallback never fires in practice.

**Conclusion.** Turning `random` on as it is would be unfair in about 1 game in 7 (a starved
resource), and nearly every board would have visible clumps. It needs balancing, not only
switching on.

## 3. Requirements

### 3.1 Functional

| ID | Requirement |
|---|---|
| F1 | A new game, from the menu, from "play again" or online, gets a new layout by default. The old fixed board stays selectable ("Classic") |
| F2 | **Hard rules**, never broken: <br>• the standard terrain and token counts (§2.1) and port kinds; <br>• the desert has no token; <br>• the robber starts on the desert; <br>• 6 and 8 never adjacent; <br>• 2 and 12 never adjacent; <br>• no two identical numbers adjacent |
| F3 | **Soft goals**, optimised: <br>• few same-resource clumps (target ≤ 2 pairs, never 3 in a connected group); <br>• every resource ≥ 9 total pips (hills/mountains have 3 hexes, the others 4); <br>• the 6s and 8s on at least 3 different resources; <br>• best corner ≤ 13 pips; <br>• each 2:1 port's resource not on a 6/8 hex touching that port |
| F4 | Same seed and preset give the same board on every client and the server. Replays of old games keep working |
| F5 | The scene draws the generated board: terrain, vegetation, harbours, tokens, the robber's spot, ships and the mountain guy (his spot is recomputed, or he's hidden if no mountain hex fits) |
| F6 | Online: the host's choice of board goes to the server; all clients draw the server's board |

### 3.2 Non-functional

| ID | Requirement |
|---|---|
| N1 | Generation ≤ 30 ms on the owner's laptop, deterministic, with no `Math.random` |
| N2 | Scene rebuild on a new game ≤ 1 s, with no GPU memory growth after 10 new games (resources disposed) |
| N3 | No change to the camera, pixel ratio, postprocessing or frame budget. Idle fps stays within 5% of the fixed board |
| N4 | Tokens stay readable and are never hidden by trees or buildings on any generated board (checked on many seeds) |

## 4. Proposed algorithm: generate, check, score, pick the best

The algorithm is deterministic and uses only the engine RNG.

1. **Terrain.** Shuffle `TERRAIN_SET` onto the 19 hexes in canonical order.
2. **Tokens with hard rules.** Place the 18 tokens by backtracking:
   - highest-pip tokens first (6, 8, 5, 9, …);
   - each goes on a random free non-desert hex where F2 holds.

   This always finds a valid layout in microseconds, with no blind retries.
3. **Score** the candidate with weighted penalties (weights are tuning knobs, fixed by tests):

   ```
   score = 3·sameResourcePairs + 4·max(0, 9 − minResourcePips)
         + 2·resourcePipSpread + 2·max(0, bestCorner − 13)
         + 1·(6/8 on fewer than 3 resources) + 1·portOnItsOwnRedNumber
   ```
4. **Best of K.** Make K = 64 candidates and keep the lowest score. Measure the time; K can drop
   if needed.
5. **Ports.** Shuffle the port kinds onto the 9 fixed edges as today, then score them inside the
   same candidate.

**Why not the official spiral (fixed A–R token order laid in a spiral)?** It is always legal and
simple. But layouts look alike, and the 6s and 8s keep the same relative positions. Keep it as an
option if the owner prefers it.

**Replay safety (F4).** Changing how `random` consumes the RNG would break saved replays of
`random` games. So add a **new preset `balanced`** and leave `random` and `standard-fixed`
untouched. `BoardPreset`, `checkSettings`, GAME_DESIGN §2.4/§11 and the replay format docs get one
new value each.

## 5. Proposed architecture for the scene (the main risk)

The engine part is small. The scene part is where the work and the risk are.

| Option | How | Cost | Risk |
|---|---|---|---|
| **A. Rebuild and remount (recommended)** | `src/scene/board.ts` gets `setSceneBoard(board)`, which refills `TILES`, `HARBORS`, `LEDGES`, `EDGES`, `VERTICES` and the module caches (Vegetation blockers, `GUY_SPOT`, textures). `<World key={boardHash}>` remounts the scene when the board changes. Resources are disposed on unmount | Small to medium; about 20 imports keep working | Any forgotten module-level cache shows the old board. Mitigation: an audit of every top-level `const`/`let` derived from `TILES`, plus a test that draws two different boards in a row |
| B. Board through React context | Every scene module reads the board from a context or store instead of imports | Large: touches ~20 files | Regressions in a stable, signed-off visual stack. That conflicts with "preserve working features / smallest safe scope" |
| C. Page reload with `?seed=` | Start a game by reloading the page | Tiny | Slow, flashes the page, loses online socket state. Not acceptable as the main path |

Notes for option A:
- Hex-specific dressing (trees, rocks, cliffs, mountain guy) is generated per hex from its biome
  and seed, so it already follows the terrain. The 3D look doesn't need new assets.
- The online client already receives `state.board`, so it calls `setSceneBoard(state.board)`
  instead of using `STANDARD_FIXED`.
- `?board=demo` stays as is.

## 6. Plan (each step is small and verified)

| Step | Content | Acceptance |
|---|---|---|
| **B1 Engine: `balanced` preset** | Backtracking token placement, scoring, best of K, port scoring; GAME_DESIGN §2.4 updated | Unit tests: hard rules hold on 10,000 seeds; same seed gives the same board; generation p99 ≤ 30 ms; the §2.1 metrics table re-measured and meets the F3 targets on ≥ 95% of seeds; old `random` and `standard-fixed` unchanged (hash tests) |
| **B2 Scene: draw any board** | `setSceneBoard` plus a module-cache audit plus a keyed remount; `?preset=balanced&seed=N` URL for checks | Screenshots of 6 seeds at the standard pose: tokens readable, no clipping, the mountain guy placed or hidden; 10 new games in a row with no memory growth; idle fps within 5%; no console errors |
| **B3 Menu and "play again"** | A Board choice in the start menu (EN/RU): **New balanced** (default) / **Classic**; remembered in localStorage; Victory "play again" uses it | Browser check in both languages; the hot-seat resume keeps its board |
| **B4 Online** | The host's choice goes to the server's `createGame`; clients draw the received board | Two-browser check: identical boards; server tests |
| **B5 Docs and regression** | ROADMAP row, GAME_DESIGN, screenshots | Full tests, build, perf-budget script |

Order B1 → B2 → B3 → B4. B1 and B2 can be reviewed on their own (B2 via the URL) before
anything changes for players.

## 7. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Stale module caches in the scene (§5 A) | Old trees or harbours over a new board | Audit plus a two-board test (B2) |
| Some layouts look worse (for example a mountain hex where the guy can't stand, or forest hiding a token at a new angle) | Visual regression | Multi-seed screenshot check; the existing token sightline rules in Vegetation already work per hex |
| Over-balanced boards feel samey | Less variety | Best of K (not "the global optimum"), with K tuned; Classic stays available |
| Replays or saved games from before the change | A broken resume | New preset value; saved games store their preset and seed |
| Online version skew (an old client, a new server) | Different boards | Clients draw the board sent by the server, never one generated locally |

## 8. Decisions for the owner

1. **Default for new games:** New balanced (recommended) or Classic?
2. **Strictness:** hard rules F2 plus the soft goals F3 (recommended), or only "6/8 apart" like
   the base game?
3. **Ports:** shuffle only the kinds on the fixed edges (recommended), or move the ports too?
4. Start with **B1 + B2** (engine plus scene, checkable via URL, nothing changes for players yet)?

## Sources

- [uhiyama-lab: Catan board generator](https://uhiyama-lab.com/en/tools/catan-board-generator/)
  and [its write-up](https://uhiyama-lab.com/en/blog/tooldev/catan-board-generator/). Covers 6/8
  and 2/12 separation, spreading 6/8 over resources, a minimum production per resource and
  shuffle with checks.
- [Instructables: Catan strategy guide](https://instructables.com/Catan-strategy-guide). Pip
  totals per corner; 12–15 is "excellent".
- [Japjappedulap/Catan on GitHub](https://github.com/Japjappedulap/Catan). A balanced generator,
  method not documented.
- No primary source describes Colonist's own generator (searched 2026-11-17). See GAME_DESIGN.md
  §2.4.
