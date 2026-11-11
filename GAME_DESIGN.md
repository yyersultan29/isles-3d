# Isles 3D — Game Design & Rules Specification

**Version:** 1.2 (systems review, 2026-11-11) · **Mode:** base game, 4 players · **Status:** implementation specification, not Colonist.io source code

> Version 1.2 is a systems-analysis pass over v1.1. Sections 1–16 keep their numbers so existing
> references (ROADMAP.md, CLAUDE.md) stay valid. Corrections are listed in §0.2 and marked
> "(v1.2)" inline. Sections 17–25 are new and cover what v1.1 left out: visibility, interaction
> flows, errors, timers, multiplayer, persistence, quality requirements and product scope.

## 0. Audit log

### 0.1 v1.0 → v1.1 (rules audit)

| # | Topic | v1.0 said | v1.1 | Basis |
|---|---|---|---|---|
| 1 | Bank shortage | Pay none unless exactly one player is entitled **and supply suffices** | If one player is entitled, they take **what is left** (e.g. the last card for a city). If several are entitled and supply is short, nobody gets that resource | [BLOG-RULES] |
| 2 | Gifting / zero-quantity trades | [DESIGN] | Documented rule: every trade exchanges cards on both sides; gifting is not allowed. Future trades aren't binding | [BLOG-RULES] |
| 3 | Dev card before rolling | "allow" | Documented: dev cards can be played before the dice roll | [OFFICIAL] |
| 4 | Longest Road tie at 5 | not covered | The first player to reach 5 keeps it; a tie never takes the award | [OFFICIAL], [BLOG-FAQ] |
| 5 | VP cards | "counted privately" | Hidden; revealed when the owner reaches the target. VP cards are exempt from the one-card limit | [OFFICIAL], [BLOG-RULES] |
| 6 | Board composition, number tokens, ports | "[DESIGN, standard preset]" | Re-tagged [STANDARD]: Colonist's pages don't list them; they come from the published base game | — |
| 7 | Snake setup order | stated as fact | Re-tagged [STANDARD]: not stated on Colonist's pages | — |
| 8 | Win "on own turn" | "verify" | [STANDARD] + [DESIGN]: Colonist doesn't document it. Rule and handling defined in §10.4 | — |
| 9 | Friendly Robber, discard limit, VP target | missing | Added as **optional settings**, defaults off/7/10 (§3.3) | [BLOG-1V1] |
| 10 | Hidden information | "hands private" | Card **counts** are public on Colonist; card identities are private | [BLOG-RULES] |
| 11 | Dev card purchases | missing | Only on your own turn; any number per turn | [BLOG-FAQ], [BLOG-RULES] |
| 12 | Hex coordinates, algorithms, state machine | outline | Fully specified (§2, §4–§10) | [DESIGN] |
| 13 | Current 3D demo board | missing | Documented deviations from the standard board (§2.5) | code audit |

### 0.2 v1.1 → v1.2 (systems review)

**Defects fixed** (v1.1 was wrong, contradictory or not implementable as written):

| # | Topic | Problem in v1.1 | v1.2 |
|---|---|---|---|
| D1 | Dev cards before the roll | §4.1 only modelled a Knight before the roll. `roadBuilding` always returned to `actions`, so Road Building before the roll would skip the dice | Any non-VP card may be played in `preRoll`. `roadBuilding` carries `resume` (§4.1, §8) |
| D2 | Production pseudo-code | Used `state.robberTile` (the field is `robber`), and `payOnly(player, Math.min(owed, …))` mixed a map with a number | Rewritten as runnable logic (§5) |
| D3 | `apply` contract | "invalid → unchanged + error" but the return type had no error | `Result` union with an error code (§11, §19) |
| D4 | Actor identity | `DISCARD` and `RESPOND_TRADE` carried a `player` field next to the `player` argument, so a caller could act for someone else | Actor is only the `player` argument (§11) |
| D5 | Turn order | `order` existed but nothing said how it is chosen | Seeded shuffle at `createGame` (§4.2) |
| D6 | RNG leak | `rngState` and `deck` order sit in `GameState`. A client that sees them can predict every roll, steal and card | Never included in any view; server-only in multiplayer (§17, §21) |
| D7 | Port positions | "fixed set of 9 coastal edges" was never listed | Explicit edge list, script-verified (§2.6) |
| D8 | `standard-fixed` preset | "a curated legal layout" was never defined | Explicit layout, script-verified (§2.6) |
| D9 | Year of Plenty | `take: [Resource, Resource]` can't express the "bank has 1 card" case that §8 allows | `take: Resource[]` of length 1–2 (§8, §11) |
| D10 | Longest Road award | Rules were prose only; the reassignment order was ambiguous | Single `resolveLongestRoad` function (§10.2) |
| D11 | Victory check | "after every action" didn't say whose total or when during phase changes | `checkVictory` procedure (§10.4) |
| D12 | Event list | Ended in "…etc." | Complete list with per-player redaction (§11, §17) |
| D13 | `BANK_TRADE.count` | Meaning undefined | `count` = cards received; cost = `rate × count` (§9) |
| D14 | Robber with no legal tile | Friendly Robber could exclude every tile when the robber already stands on the desert | Defined fallback (§6) |

**Additions:** provenance tags [CATAN-FAQ] and [COMMUNITY] (§1.1); trade protocol details (§9);
settings validation (§3.3); RNG consumption order (§11); §17 visibility matrix; §18 interaction
flows; §19 error catalog; §20 timers and absent players; §21 multiplayer architecture;
§22 persistence and replays; §23 quality requirements and test strategy; §24 product scope
against Colonist; §25 naming and IP.

**Verification done for v1.2:** a script built the graph from §2.2–2.3 and confirmed 19 tiles,
54 vertices, 72 edges, vertex degree 2–3, 30 coastal edges and 30 coastal vertices, and that the
corner table in §2.3 matches the world positions in §2.2. The same script produced §2.6.
Colonist's own pages could not be re-fetched in this pass; see §15 for what remains unconfirmed.

## 1. Scope and provenance

This document adapts the publicly documented **Colonist.io base-game rules** into an independent
technical specification for Isles 3D. It does **not** describe Colonist.io's proprietary code,
internal algorithms, matchmaking or server implementation, and we have no access to any of these.
Don't copy Colonist branding, artwork, interface text or assets.

### 1.1 Provenance tags

| Tag | Meaning |
|---|---|
| **[OFFICIAL]** | Stated on Colonist's base rules page, https://colonist.io/catan-rules (4-player tab) |
| **[BLOG-FAQ]** | Colonist blog, "Most Common Catan Questions Answered", https://blog.colonist.io/catan-faq/ (2023) |
| **[BLOG-RULES]** | Colonist blog, "Settling the Rules of Catan", https://blog.colonist.io/settling-the-rules-of-catan/ (2021) |
| **[BLOG-1V1]** | Colonist blog, "Ranked 1v1 – A Comprehensive Strategy Guide", https://blog.colonist.io/ranked-1v1-comprehensive-strategy-guide-colonist-io/ (2023), for settings only |
| **[CATAN-FAQ]** | (v1.2) Publisher's base-game FAQ, https://www.catan.com/faq/basegame. Authority for the tabletop rule, not for Colonist's behaviour |
| **[COMMUNITY]** | (v1.2) Player reports on Colonist's public suggestion board, https://colonist.featureupvote.com. Weak evidence: individual users, various dates, sometimes contradictory. Never the only basis for a rule |
| **[STANDARD]** | Standard published base-game rule that Colonist's pages don't state; assumed to match Colonist, to be confirmed in-app |
| **[INFERRED]** | Our reading of an ambiguous or implied source sentence |
| **[DESIGN]** | Our own implementation decision for Isles 3D |

Also consulted, with no base-rule content found: https://blog.colonist.io/colonist-101-how-to-play/
(modes and lobby options only, states bots use "a random Colonist map"),
https://blog.colonist.io/transitioning-from-board-game-to-colonist-io/ and
https://blog.colonist.io/introduction-to-settlers-of-catan/ (general background).
v1.0 also cited https://colonist.io/ru/catan-rules (Russian translation of the same page); it was
not re-read in the v1.1 or v1.2 passes.

**Out of scope for the first implementation:** 5–6 / 7–8 players, Seafarers, Cities & Knights,
Colonist Rush, ranked play, "balanced dice", bot AI, monetization. §24 lists the full product
surface and where each item sits.

## 2. Board topology and generation

### 2.1 Composition [STANDARD]

- 19 land hexes in rows of 3–4–5–4–3, surrounded by sea.
- Terrain: 4 forest (lumber), 4 pasture (wool), 4 fields (grain), 3 hills (brick), 3 mountains (ore), 1 desert (none).
- Number tokens (18): 2 and 12 once each; 3, 4, 5, 6, 8, 9, 10, 11 twice each. The desert gets none. 7 is never a token.
- Ports (9): four generic 3:1 and five 2:1, one for each resource. Each port sits on one coastal edge and serves that edge's **two** vertices.
- The robber starts on the desert.
- The base-game graph has **54 vertices** and **72 edges**, of which **30 edges and 30 vertices are coastal**. Use these counts as a topology unit test. (v1.2: confirmed by script.)
- Bank: 19 cards of each resource [OFFICIAL]. Development deck: 25 cards [OFFICIAL] (§8).

The token probability weight ("pips") of n is `6 − |7 − n|`: 2/12 → 1, 6/8 → 5 [STANDARD]. It is used by the UI (dots on tokens) and the generator.

### 2.2 Hex coordinate system [DESIGN]

Use **axial coordinates `(q, r)`**, pointy-top orientation (matching the scene, `src/scene/board.ts`),
with `s = −q − r`. A land hex satisfies `max(|q|, |r|, |s|) ≤ 2`.

Mapping from the scene's `(row, col)` (row 0 = north) to axial:

```ts
r = row - 2
q = col - (rowLength - 1) / 2 - r / 2   // integer for every valid tile
// world position (HEX_R = 1): x = √3 · (q + r/2),  z = 1.5 · r   (identical to TILES[].x/.z)
```

Neighbour directions (pointy-top): `E(+1,0) W(−1,0) NE(+1,−1) NW(0,−1) SE(0,+1) SW(−1,+1)`, with north = −z.

### 2.3 Vertex and edge IDs [DESIGN]

Every corner of a pointy-top hex grid is **either the north (N) or the south (S) corner of
exactly one hex**, counting sea hexes. Every side is the **NE, NW or W side of exactly one hex**.
So the canonical IDs are:

```ts
type VertexId = `${number},${number},${'N' | 'S'}`        // e.g. "0,-2,N"
type EdgeId   = `${number},${number},${'NE' | 'NW' | 'W'}` // e.g. "1,0,W"
```

Hex `(q,r)`'s six corners in scene order (`corner(k)`: k=5 top … k=2 bottom):

| scene k | corner | canonical vertex |
|---|---|---|
| 5 | N | `(q, r, N)` |
| 0 | NE | `(q+1, r−1, S)` |
| 1 | SE | `(q, r+1, N)` |
| 2 | S | `(q, r, S)` |
| 3 | SW | `(q−1, r+1, N)` |
| 4 | NW | `(q, r−1, S)` |

Hex sides and the corners they join (v1.2 adds the corner pairs):

| side | canonical edge | joins corners |
|---|---|---|
| NE | `(q, r, NE)` | N – NE |
| E | `(q+1, r, W)` | NE – SE |
| SE | `(q, r+1, NW)` | SE – S |
| SW | `(q−1, r+1, NE)` | S – SW |
| W | `(q, r, W)` | SW – NW |
| NW | `(q, r, NW)` | NW – N |

- Build `tiles`, `vertices`, `edges` and the adjacency maps **once** from the land hexes:
  `vertex→tiles (1–3)`, `vertex→edges (2–3)`, `vertex→vertices`, `edge→vertices (exactly 2)`, `tile→vertices (6)`.
  A vertex or edge is a land feature if at least one adjacent hex is land.
- **Never use floating-point positions for rule decisions.** The scene receives positions derived from IDs, never the other way round.
- IDs are strings with no spaces, e.g. `"-1,3,NE"`. Sea hexes appear in IDs (`"3,-2,W"`), which is expected.
- G1 must add an adapter test that maps every scene `Building {tile, corner}` and `Road {tile, edge}` to an ID and back. The scene's edge numbering hasn't been confirmed yet.

### 2.4 Board generation [DESIGN]

- `generateBoard(rng, preset)` is deterministic: a seeded PRNG (mulberry32, copied into the engine so it doesn't import `src/scene/noise.ts`), then Fisher–Yates shuffles.
- Presets: `standard-fixed` (§2.6, used for tests and as the default first), `random`.
- Random-board constraints (Colonist's generator is undocumented): terrain and token multisets as in §2.1; the desert has no token; **6 and 8 tokens are never adjacent** [STANDARD variable-setup rule]; optionally no equal tokens adjacent. Reject and reshuffle with a bounded retry count (200), then fall back to `standard-fixed`.
- Ports: the 9 edges in §2.6 are fixed; `random` shuffles only the port kinds.
- (v1.2) Iterate tiles in a fixed canonical order when assigning shuffled terrain and tokens: sort by `r`, then `q`. The result must not depend on object key order.

### 2.5 Current 3D demo board vs the standard board (code audit)

`src/scene/board.ts` is a **visual showcase layout**, not a legal standard board:

| Item | Scene now | Standard |
|---|---|---|
| Pasture / fields | 5 / 3 | 4 / 4 |
| Tokens 5 and 10 | 3 each | 2 each |
| Tokens 6 and 9 | 1 each | 2 each |
| Ports | 7 (3 generic, wood, brick, wheat, sheep 2:1; no ore port; generic ports use the `sheep3` kind name) | 9 (4 generic + 5 specific) |
| Pieces | 10 demo buildings, 13 demo roads, not validated | engine state |

G4 must drive the scene from engine state. Changing the board composition changes the scene, so
that needs an explicit art decision: keep the showcase layout as a "demo" preset, or render the
generated board.

### 2.6 Fixed data: ports and the `standard-fixed` layout (v1.2) [DESIGN]

Both tables were generated and checked by script against §2.1 and §2.4. They are our own layout,
not a copy of any published board.

**Port edges.** Walk the 30 coastal edges clockwise starting at `0,-2,NW`. Ports follow the
pattern *port, 2 free, port, 2 free, port, 3 free*, three times. The 18 port vertices are distinct.

| # | Edge | Vertices | Land hex | Kind in `standard-fixed` |
|---|---|---|---|---|
| 1 | `0,-2,NW` | `0,-3,S`, `0,-2,N` | `0,-2` | generic |
| 2 | `1,-2,NE` | `1,-2,N`, `2,-3,S` | `1,-2` | grain |
| 3 | `3,-2,W` | `3,-3,S`, `2,-1,N` | `2,-2` | ore |
| 4 | `3,0,W` | `3,-1,S`, `2,1,N` | `2,0` | generic |
| 5 | `1,2,NW` | `1,2,N`, `1,1,S` | `1,1` | wool |
| 6 | `-1,3,NE` | `0,2,S`, `-1,3,N` | `0,2` | generic |
| 7 | `-3,3,NE` | `-2,2,S`, `-3,3,N` | `-2,2` | generic |
| 8 | `-2,1,W` | `-3,2,N`, `-2,0,S` | `-2,1` | brick |
| 9 | `-2,0,NW` | `-2,-1,S`, `-2,0,N` | `-2,0` | lumber |

**`standard-fixed` tiles** (`q,r` terrain token), rows north to south:

| r | tiles |
|---|---|
| −2 | `0,-2` hills 5 · `1,-2` mountains 3 · `2,-2` fields 8 |
| −1 | `-1,-1` fields 4 · `0,-1` forest 11 · `1,-1` hills 9 · `2,-1` pasture 10 |
| 0 | `-2,0` mountains 6 · `-1,0` hills 2 · `0,0` desert — · `1,0` forest 6 · `2,0` fields 12 |
| 1 | `-2,1` forest 5 · `-1,1` pasture 11 · `0,1` mountains 4 · `1,1` pasture 9 |
| 2 | `-2,2` forest 10 · `-1,2` pasture 3 · `0,2` fields 8 |

Checked properties: correct terrain and token multisets; no adjacent 6/8; no adjacent equal
tokens; highest vertex pip total is 12; pips per resource: lumber 14, grain 14, wool 11, ore 10,
brick 9. The robber starts on `0,0`.

## 3. Players, inventory and settings

### 3.1 Inventory
- Resources: `lumber`, `brick`, `wool`, `grain`, `ore`; the bank starts with 19 of each [OFFICIAL].
- Piece limits per player: 15 roads, 5 settlements, 4 cities [OFFICIAL]. A city upgrade returns the settlement piece to supply [STANDARD].
- Development deck: 25 cards [OFFICIAL] — 14 Knight, 2 Road Building, 2 Year of Plenty, 2 Monopoly, 5 Victory Point.
- (v1.2) Canonical resource order, used wherever order matters (random steal, serialization, UI): `lumber, brick, wool, grain, ore`.

### 3.2 Hidden information
- Every player's **resource-card count** is public, and so is the bank's remaining count per resource [BLOG-RULES].
- Resource identities and development-card identities are private. Showing another player a specific card isn't allowed [BLOG-RULES].
- [DESIGN] The count of unplayed dev cards per player and played knights are public.
- The engine stores the full state. A `viewFor(playerId)` projection redacts it for UI and later multiplayer. §17 is the full visibility matrix.

### 3.3 Game settings [DESIGN, values from BLOG-1V1 where noted]
```ts
interface GameSettings {
  vpToWin: number          // default 10 [OFFICIAL]; Colonist allows other targets (1v1 uses 15 [BLOG-1V1])
  discardLimit: number     // default 7: players with MORE than this discard on a 7 [OFFICIAL]; 1v1 allows 9 [BLOG-1V1]
  friendlyRobber: boolean  // default false. When on, players with < 3 public VP can't be blocked or robbed [BLOG-1V1]
  boardPreset: 'standard-fixed' | 'random'
  seed: number             // uint32
}
```
(v1.2) `createGame` validates settings and rejects with `INVALID_SETTINGS`: `vpToWin` integer
3–20, `discardLimit` integer 2–20, `seed` integer 0–2³²−1, known `boardPreset`.

Turn timers and "balanced dice" are Colonist settings with undocumented behaviour. Balanced dice
stay out of scope; timers are our own design in §20.

## 4. Game phases and turn state machine

### 4.1 Phases
```ts
type Resume = 'preRoll' | 'actions'
type Phase =
  | { kind: 'setup'; round: 1 | 2; step: 'settlement' | 'road'; lastSettlement?: VertexId }
  | { kind: 'preRoll' }              // may play one non-VP dev card before rolling
  | { kind: 'discard'; pending: Partial<Record<PlayerId, number>> } // after a 7
  | { kind: 'moveRobber'; source: 'seven' | 'knight'; resume: Resume }
  | { kind: 'steal'; tile: TileId; candidates: PlayerId[]; resume: Resume }
  | { kind: 'actions' }              // trade, build, buy, play one dev card
  | { kind: 'roadBuilding'; remaining: 1 | 2; resume: Resume }   // v1.2: resume added (D1)
  | { kind: 'gameOver'; winner: PlayerId }
```

```
setup(1, forward) ──► setup(2, reverse) ──► preRoll(order[0])
preRoll ──ROLL≠7──► actions
preRoll ──ROLL=7──► discard? ──► moveRobber(resume=actions) ──► steal? ──► actions
preRoll ──PLAY_KNIGHT──► moveRobber(resume=preRoll) ──► steal? ──► preRoll   (still must roll)
preRoll ──PLAY_ROAD_BUILDING──► roadBuilding(resume=preRoll) ──► preRoll
preRoll ──PLAY_YEAR_OF_PLENTY / PLAY_MONOPOLY──► preRoll
actions ──PLAY_KNIGHT──► moveRobber(resume=actions) ──► steal? ──► actions
actions ──PLAY_ROAD_BUILDING──► roadBuilding(resume=actions) ──► actions
actions ──END_TURN──► preRoll(next player)
any state ──(active player's totalVP ≥ vpToWin, §10.4)──► gameOver
```

Who may act in each phase (v1.2). Anything not listed is rejected with `WRONG_PHASE` or `NOT_YOUR_TURN`.

| Phase | Actor | Legal actions |
|---|---|---|
| `setup/settlement` | active | `PLACE_SETTLEMENT` |
| `setup/road` | active | `PLACE_ROAD` (edge touching `lastSettlement`) |
| `preRoll` | active | `ROLL`, one `PLAY_*` (if `!playedDevThisTurn`) |
| `discard` | each player in `pending` | `DISCARD` |
| `moveRobber` | active | `MOVE_ROBBER` |
| `steal` | active | `STEAL` |
| `actions` | active | `BUILD_*`, `BUY_DEV`, one `PLAY_*`, `BANK_TRADE`, `PROPOSE_TRADE`, `CONFIRM_TRADE`, `CANCEL_TRADE`, `END_TURN` |
| `actions` | non-active, addressed by an open trade | `RESPOND_TRADE` |
| `roadBuilding` | active | `BUILD_ROAD` (free) |
| `gameOver` | nobody | none |

### 4.2 Initial placement
- (v1.2) **Seating order** [DESIGN]: `order` is a seeded shuffle of the four players at `createGame`. The tabletop game rolls dice for it [STANDARD]; Colonist's method isn't documented.
- Each player places two settlements and two roads, each road attached to one of their settlements [OFFICIAL].
- Order: round 1 forward (`order[0]`→`order[3]`), round 2 reverse. The last player places twice in a row [STANDARD].
- In each round the road must touch the settlement **just placed** [STANDARD]. A legal road always exists: the distance rule keeps all three neighbouring vertices empty, so no earlier road can occupy those edges.
- The distance rule applies: "All settlements must be at least two roads apart" [OFFICIAL]. Setup settlements need no road connection [STANDARD].
- The **2nd** settlement yields one resource per adjacent producing tile [OFFICIAL]. The desert gives nothing. This is subject to bank stock, which is always enough at setup.
- Setup placements are free and score 1 VP each.
- (v1.2) `turn` is 0 during setup and becomes 1 when the first `preRoll` starts. It increases by 1 on every `END_TURN`. No dev card can be bought or played during setup.

### 4.3 Normal turn
1. **preRoll:** the active player may play one non-VP dev card [OFFICIAL: dev cards can be played before the roll], then must roll. (v1.2: all four playable types are legal here, not only the Knight.)
2. **Roll:** two independent fair d6 [OFFICIAL]. On 7, run §6; otherwise production (§5).
3. **actions:** trade (§9), build (§7), buy dev cards (§8) and play at most one dev card, in any order and any number of times [STANDARD; Colonist doesn't document the order]. [DESIGN] No trading or building before the roll.
4. **End turn.** Cancels any open trade and resets `playedDevThisTurn` for the next player.
- One non-VP dev card per turn in total, before or after the roll. A card bought this turn can't be played this turn [OFFICIAL].
- [DESIGN] While `discard`, `moveRobber`, `steal` or `roadBuilding` is unresolved, no other action is legal.
- (v1.2) [DESIGN] `END_TURN` is always legal in `actions`. There is no forced action and no turn limit; see §20 for timers and §23.3 for stalemates.

## 5. Dice and resource production

Dice: `d1 = 1 + floor(rng() * 6)`, then `d2` the same way, in that order.

```ts
function produce(state: GameState, roll: number): Partial<Record<PlayerId, Partial<ResourceCounts>>> {
  // 1. entitlements: resource -> player -> amount
  const owed = new Map<Resource, Map<PlayerId, number>>()
  for (const tile of tilesWithToken(state.board, roll)) {
    if (tile.id === state.robber) continue            // desert has no token, so it never appears here
    const res = resourceOf(tile.terrain)
    for (const v of state.board.topo.tileVertices[tile.id]) {
      const b = state.buildings[v]
      if (b) addTo(owed, res, b.owner, b.type === 'city' ? 2 : 1)
    }
  }
  // 2. bank shortage, resolved per resource type [BLOG-RULES]
  const gains = {}
  for (const res of RESOURCE_ORDER) {
    const perPlayer = owed.get(res); if (!perPlayer) continue
    const total = sum(perPlayer.values()), stock = state.bank[res]
    if (total <= stock)            for (const [p, n] of perPlayer) pay(gains, p, res, n)
    else if (perPlayer.size === 1) { const [p] = perPlayer.keys(); if (stock > 0) pay(gains, p, res, stock) }
    // else: several players entitled and not enough stock -> nobody receives this resource
  }
  return gains   // caller moves cards bank -> players and emits RESOURCES_PRODUCED
}
```

- A settlement yields 1, a city 2 [OFFICIAL]. No production on 7, from the desert, or from the robber's tile [OFFICIAL].
- A player with buildings on two tiles of the rolled number, or two buildings on one tile, is owed the sum.
- **Invariant:** for every resource, `bank + Σ players == 19`, checked after every action in tests.

## 6. Seven, robber and discard

1. **Discard:** every player holding **more than `discardLimit` (default: 8 or more)** resource cards discards `floor(count / 2)` of their choice to the bank [OFFICIAL]. All discards complete before the robber moves [STANDARD]. Colonist resolves discards in parallel. [DESIGN] Hot-seat collects them sequentially in turn order; the engine accepts them in any order.
   - (v1.2) `pending[p]` is fixed when the 7 is rolled. A `DISCARD` must total exactly `pending[p]` and contain only cards the player holds. The roller discards too if over the limit. Dev cards don't count towards the hand size. If `pending` is empty the phase is skipped.
2. **Move robber:** the roller must move the robber [BLOG-FAQ] to a **different** land tile [STANDARD; the Knight text says "another tile" OFFICIAL]. The desert is allowed [STANDARD].
3. **Steal:** choose one opponent with a settlement or city on that tile **who holds at least one resource card**. Take one card chosen uniformly at random from their hand (so weighted by count) [OFFICIAL: "steal one random resource"]. If there are no candidates, skip. If there's exactly one, [DESIGN] auto-select them.
   - (v1.2) Random pick: lay the victim's hand out in canonical resource order, `i = floor(rng() * handSize)`, take card `i`. `rng` is consumed only when a steal happens.
- A Knight runs steps 2–3 only, with no discards [OFFICIAL].
- **Friendly Robber** (setting): the robber may not be placed on a tile that touches a player with fewer than 3 **public** VP (buildings, Longest Road and Largest Army count; VP cards don't) [BLOG-1V1]. [DESIGN] The mover's own buildings don't protect a tile, and the desert is always allowed. The victim filter in step 3 applies the same rule.
   - (v1.2, D14) If no tile other than the current one is legal (robber on the desert, every other tile protected), the robber stays, there is no steal, and the phase resolves to `resume`. `legalActions` then offers `MOVE_ROBBER` with the current tile only.

## 7. Construction and placement validation

| Action | Cost [OFFICIAL] | VP | Limit [OFFICIAL] |
|---|---|---|---|
| Road | 1 lumber + 1 brick | 0 | 15 |
| Settlement | 1 lumber + 1 brick + 1 wool + 1 grain | 1 | 5 on board |
| City (upgrade) | 2 grain + 3 ore | 2 total (net +1) | 4 |
| Development card | 1 wool + 1 grain + 1 ore | varies | deck size |

```ts
canBuildRoad(s, p, e):     edge free && pieces.roads>0 && (affordable || freeRoad) &&
                           e.vertices.some(v => ownBuilding(v,p) ||
                             (!opponentBuilding(v,p) && v.edges.some(x => x!==e && road(x)===p)))
canBuildSettlement(s,p,v): vertex free && v.neighbours.every(n => !building(n)) &&   // distance rule
                           pieces.settlements>0 && affordable && (setup || v.edges.some(x => road(x)===p))
canBuildCity(s, p, v):     building(v) is p's settlement && pieces.cities>0 && affordable
```
- You **can't extend a road through** a vertex holding an opponent's building [STANDARD], but a road may end there.
- [STANDARD] A settlement may be placed on a vertex where an opponent's roads meet, as long as it is connected to your own road. This is how a road gets "broken" [BLOG-FAQ].
- Validation and payment are one transaction. An invalid command returns an error and **leaves the state untouched**.
- (v1.2) All payments go to the bank. A city upgrade does `pieces.cities −1`, `pieces.settlements +1`. With 5 settlements on the board a player must upgrade one before placing another.
- (v1.2) After every `BUILD_ROAD`, `BUILD_SETTLEMENT` and setup placement: recompute Longest Road (§10.2), then run `checkVictory` (§10.4).

## 8. Development cards

- Buy only on your own turn [BLOG-FAQ], any number per turn [BLOG-RULES], from a shuffled hidden deck. Can't buy from an empty deck. (v1.2) Only in `actions`, so never before the roll. The buyer takes `deck[0]`.
- (v1.2) A dev card may be played in `preRoll` or `actions` of your own turn, never in another player's turn [CATAN-FAQ] and never during `discard`, `moveRobber`, `steal` or `roadBuilding`.
- **Knight (14):** move the robber to another tile and steal (§6). +1 to played knights [OFFICIAL]. Recompute Largest Army when the card is played, before the robber moves.
- **Road Building (2):** place 2 roads for free [OFFICIAL]. [DESIGN] If the player has only 1 road piece or only 1 legal edge, place 1. The card can't be played if there are 0 legal edges. Roads are placed one at a time, so the second may extend from the first. (v1.2) If no legal edge remains after the first road, the phase ends early.
- **Year of Plenty (2):** take any 2 resources from the bank [OFFICIAL]. Both may be the same type. [DESIGN] Only types the bank has. If the bank has fewer than 2 cards in total, take what's there. The card can't be played on an empty bank. (v1.2) `take` has 2 entries unless the whole bank holds exactly 1 card.
- **Monopoly (2):** name a resource; every opponent gives you all their cards of that type [OFFICIAL]. Naming a type nobody holds is legal and wastes the card.
- **Victory Point (5):** hidden +1 VP, revealed at victory [OFFICIAL]. VP cards are never "played", so they don't use the one-card-per-turn allowance. They count the moment you hold them, which can win on the purchase turn [BLOG-RULES: multiple VP cards are allowed if that wins].
- One non-VP card per turn, never on the turn it was bought [OFFICIAL]. [DESIGN] Track `boughtOnTurn` per card; playable when `boughtOnTurn < state.turn`.
- (v1.2) A played card is removed from the hand and not returned to the deck. Dev cards can't be traded, stolen or discarded.

## 9. Trade

- **Bank:** 4 identical → 1 of your choice [OFFICIAL].
- **Ports:** with a settlement **or city** [INFERRED: a city keeps its port] on one of a port's two vertices: generic 3 identical → 1; specific 2 of that resource → 1 [OFFICIAL]. The best available rate per resource is used automatically.
- The bank must hold the requested card. [DESIGN] Requesting a type you give is pointless and rejected.
- (v1.2, D13) `BANK_TRADE { give, get, count = 1 }`: the player pays `rate(give) × count` and receives `count` cards. The bank must hold `count` of `get`.
- **Players:** any number or combination for any number or combination, **but not the same type on both sides** [OFFICIAL]. Both sides must be non-empty: no gifting [BLOG-RULES]. Promises of future cards aren't binding and aren't modelled [BLOG-RULES].
- [STANDARD] Every player trade involves the active player, during their `actions` phase. Other players can't trade with each other.
- [DESIGN] The flow is `PROPOSE_TRADE(offer, request, to?: PlayerId[])`, then responses `accept | reject`, then the active player `CONFIRM_TRADE(withPlayer)`. Both hands are re-validated at confirmation, then the swap is atomic. A new proposal or the end of the turn cancels open offers.

Protocol details (v1.2) [DESIGN]:
- One open proposal at a time. `to` defaults to all opponents. Quantities are positive integers.
- The proposer must hold the full `offer` when proposing (`INSUFFICIENT_RESOURCES`).
- A responder may accept only while holding the full `request`; otherwise only reject. A response can be changed until confirmation.
- `CONFIRM_TRADE` requires the chosen player in `accepted`. If either hand no longer covers its side, reject with `TRADE_STALE` and keep the proposal open.
- Any action by the active player that changes their hand (build, buy, bank trade, dev card) cancels the open proposal.
- Counter-offers are a UI feature, not an engine action: the responder rejects and the UI pre-fills a suggestion for the active player to propose. This keeps "every trade involves the active player" enforceable.
- Anti-spam: at most 20 `PROPOSE_TRADE` per turn (`TRADE_LIMIT`).
- Colonist has a per-player embargo feature [COMMUNITY]. Not modelled; `to` already lets a player exclude someone.

## 10. Awards and scoring

### 10.1 Points
Settlement 1, city 2, VP card 1, Longest Road 2, Largest Army 2 [OFFICIAL].
`publicVP` excludes VP cards; `totalVP` includes them.

### 10.2 Longest Road
- Needs at least **5 connected roads**. The first player to reach it takes the award. To take it away, a player needs **strictly more** [OFFICIAL], [BLOG-FAQ].
- An opponent's settlement on a vertex **breaks** the road there [BLOG-FAQ]. Your own buildings never break your road [CATAN-FAQ].
- Length = the longest **trail** (no edge reused; vertices may be revisited, so loops count) in the player's road subgraph. You can't pass *through* a vertex with an opponent's building.
  ```ts
  function longestRoad(p): number {      // DFS from every vertex touching p's roads
    let best = 0
    const dfs = (v, used: Set<EdgeId>, len) => {
      best = Math.max(best, len)
      if (len > 0 && opponentBuilding(v, p)) return          // can end here, can't pass through
      for (const e of v.edges) if (road(e) === p && !used.has(e)) { used.add(e); dfs(other(e, v), used, len + 1); used.delete(e) }
    }
    for (const v of verticesTouchingRoadsOf(p)) dfs(v, new Set(), 0)
    return best
  }
  ```
  At most 15 edges per player, so exhaustive DFS is cheap. Start from **every** touching vertex, not only dead ends: a pure loop has no dead end.
- **Recompute** all four players after every road, settlement (it can break a road) and Road Building placement.
- Rules after a road is broken [STANDARD 5th-edition rulebook; Colonist only documents "keep on tie"]:
  - If the holder still has the strictly longest road, or is tied for longest at 5 or more, they keep it.
  - Otherwise, if exactly one player has the longest road at 5 or more, that player takes it.
  - If several players tie for longest, or nobody has 5 or more, nobody holds it until a unique leader emerges.
- (v1.2, D10) One function covers the normal case and the broken-road case:
  ```ts
  function resolveLongestRoad(prev: PlayerId | null, len: Record<PlayerId, number>, order: PlayerId[]): PlayerId | null {
    const max = Math.max(...Object.values(len))
    if (max < 5) return null
    const leaders = order.filter(p => len[p] === max)
    if (prev && leaders.includes(prev)) return prev   // holder keeps it on a tie
    return leaders.length === 1 ? leaders[0] : null   // unique leader takes it; otherwise set aside
  }
  ```
  Emit `AWARD_CHANGED` only when the result differs from `prev`.

### 10.3 Largest Army
At least 3 played knights; the first to reach it holds it, and a challenger needs strictly more [OFFICIAL]. Played knights never decrease.
```ts
function resolveLargestArmy(prev, knights, justPlayed) {
  if (knights[justPlayed] < 3) return prev
  return prev === null || knights[justPlayed] > knights[prev] ? justPlayed : prev
}
```

### 10.4 Victory
- The first player to reach `vpToWin` (10) wins [OFFICIAL]. Hidden VP cards count and are revealed [OFFICIAL].
- [STANDARD] A player can only win **during their own turn** [CATAN-FAQ]. Check after every action by the active player and at the start of each turn.
- [DESIGN] A non-active player who gets to ≥10 off-turn (e.g. Longest Road reassigned to them when someone breaks another player's road) wins when their next turn starts. One [COMMUNITY] report describes exactly this on Colonist (the game ended at the start of the player's turn, not when they reached 10); an older report describes an instant off-turn win. Unconfirmed, see §15.
- (v1.2, D11) Procedure, run at the end of every successful `apply` and when a turn starts:
  ```ts
  function checkVictory(s: GameState): GameState {
    if (s.phase.kind === 'setup' || s.phase.kind === 'gameOver') return s
    const p = s.order[s.active]
    return totalVP(s, p) >= s.settings.vpToWin ? { ...s, phase: { kind: 'gameOver', winner: p }, trade: null } : s
  }
  ```
  Only the active player's total is tested. Victory interrupts any phase, including `preRoll`
  (a Knight that gives Largest Army wins before the roll) and `roadBuilding`. If two players have
  ≥ `vpToWin`, the active one wins; if neither is active, the next of them in turn order wins.
- `GAME_WON` carries final totals and every player's revealed VP cards.

## 11. TypeScript domain model

```ts
// src/game/types.ts — no imports from react, three or src/scene
export type Resource = 'lumber' | 'brick' | 'wool' | 'grain' | 'ore'
export const RESOURCE_ORDER: Resource[] = ['lumber', 'brick', 'wool', 'grain', 'ore']
export type Terrain = 'forest' | 'pasture' | 'fields' | 'hills' | 'mountains' | 'desert'
export type PlayerId = 'p1' | 'p2' | 'p3' | 'p4'
export type TileId = `${number},${number}`
export type ResourceCounts = Record<Resource, number>
export type DevCardType = 'knight' | 'roadBuilding' | 'yearOfPlenty' | 'monopoly' | 'victoryPoint'

export interface Tile { id: TileId; q: number; r: number; terrain: Terrain; token: number | null }
export interface Port { edge: EdgeId; vertices: [VertexId, VertexId]; kind: Resource | 'generic' }
export interface Board {           // immutable after generation
  tiles: Record<TileId, Tile>; ports: Port[]
  topo: Topology                   // adjacency maps from §2.3, built once
}
export interface Building { owner: PlayerId; type: 'settlement' | 'city' }
export interface DevCard { id: number; type: DevCardType; boughtOnTurn: number }
export interface PlayerState {
  id: PlayerId; resources: ResourceCounts; devCards: DevCard[]
  playedKnights: number; playedDevThisTurn: boolean
  pieces: { roads: number; settlements: number; cities: number } // remaining in supply
}
export interface PendingTrade {
  id: number; from: PlayerId; offer: Partial<ResourceCounts>; request: Partial<ResourceCounts>
  to: PlayerId[]; responses: Partial<Record<PlayerId, 'accept' | 'reject'>>
}
export interface GameState {
  schemaVersion: 1
  settings: GameSettings; board: Board
  rngState: number                 // SECRET: never leaves the engine/server (§17)
  players: PlayerState[]; order: PlayerId[]; active: number; turn: number
  phase: Phase; dice: [number, number] | null
  buildings: Partial<Record<VertexId, Building>>; roads: Partial<Record<EdgeId, PlayerId>>
  robber: TileId; bank: ResourceCounts
  deck: DevCard[]                  // SECRET: order and contents
  longestRoad: PlayerId | null; largestArmy: PlayerId | null
  trade: PendingTrade | null; tradesProposedThisTurn: number
  actionCount: number              // increments on every successful apply; used as a sequence number
}

// The actor is always the `player` argument of validate/apply, never a field of the action (D4).
export type Action =
  | { type: 'PLACE_SETTLEMENT'; vertex: VertexId } | { type: 'PLACE_ROAD'; edge: EdgeId }
  | { type: 'ROLL' } | { type: 'DISCARD'; cards: Partial<ResourceCounts> }
  | { type: 'MOVE_ROBBER'; tile: TileId } | { type: 'STEAL'; victim: PlayerId }
  | { type: 'BUILD_ROAD'; edge: EdgeId } | { type: 'BUILD_SETTLEMENT'; vertex: VertexId } | { type: 'BUILD_CITY'; vertex: VertexId }
  | { type: 'BUY_DEV' } | { type: 'PLAY_KNIGHT' } | { type: 'PLAY_ROAD_BUILDING' }
  | { type: 'PLAY_YEAR_OF_PLENTY'; take: Resource[] }            // length 1–2 (D9)
  | { type: 'PLAY_MONOPOLY'; resource: Resource }
  | { type: 'BANK_TRADE'; give: Resource; get: Resource; count?: number }
  | { type: 'PROPOSE_TRADE'; offer: Partial<ResourceCounts>; request: Partial<ResourceCounts>; to?: PlayerId[] }
  | { type: 'RESPOND_TRADE'; tradeId: number; accept: boolean }
  | { type: 'CONFIRM_TRADE'; tradeId: number; with: PlayerId } | { type: 'CANCEL_TRADE' }
  | { type: 'END_TURN' }

// Events are the full, unredacted record. eventsFor(player) redacts them (§17).
export type GameEvent =
  | { type: 'GAME_STARTED'; order: PlayerId[] }
  | { type: 'SETUP_PLACED'; what: 'settlement' | 'road'; at: string; by: PlayerId }
  | { type: 'SETUP_RESOURCES'; player: PlayerId; gains: Partial<ResourceCounts> }
  | { type: 'TURN_STARTED'; player: PlayerId; turn: number }
  | { type: 'DICE_ROLLED'; by: PlayerId; dice: [number, number] }
  | { type: 'RESOURCES_PRODUCED'; gains: Partial<Record<PlayerId, Partial<ResourceCounts>>>; shortfall: Resource[] }
  | { type: 'DISCARD_REQUIRED'; pending: Partial<Record<PlayerId, number>> }
  | { type: 'DISCARDED'; player: PlayerId; cards: Partial<ResourceCounts> }
  | { type: 'ROBBER_MOVED'; by: PlayerId; from: TileId; to: TileId }
  | { type: 'CARD_STOLEN'; from: PlayerId; to: PlayerId; resource: Resource }   // resource redacted for third parties
  | { type: 'BUILT'; what: 'road' | 'settlement' | 'city'; at: string; by: PlayerId; free: boolean }
  | { type: 'DEV_BOUGHT'; by: PlayerId; card: DevCardType }                     // card redacted for others
  | { type: 'DEV_PLAYED'; by: PlayerId; card: Exclude<DevCardType, 'victoryPoint'> }
  | { type: 'YEAR_OF_PLENTY_TAKEN'; by: PlayerId; cards: Partial<ResourceCounts> }
  | { type: 'MONOPOLY_RESOLVED'; by: PlayerId; resource: Resource; taken: Partial<Record<PlayerId, number>> }
  | { type: 'BANK_TRADED'; by: PlayerId; gave: Partial<ResourceCounts>; got: Partial<ResourceCounts> }
  | { type: 'TRADE_PROPOSED'; trade: PendingTrade } | { type: 'TRADE_RESPONDED'; tradeId: number; player: PlayerId; accept: boolean }
  | { type: 'TRADE_COMPLETED'; tradeId: number; from: PlayerId; with: PlayerId; gave: Partial<ResourceCounts>; got: Partial<ResourceCounts> }
  | { type: 'TRADE_CANCELLED'; tradeId: number; reason: 'cancelled' | 'replaced' | 'handChanged' | 'turnEnded' }
  | { type: 'AWARD_CHANGED'; award: 'longestRoad' | 'largestArmy'; from: PlayerId | null; to: PlayerId | null }
  | { type: 'TURN_ENDED'; player: PlayerId }
  | { type: 'GAME_WON'; by: PlayerId; totals: Record<PlayerId, number>; vpCards: Record<PlayerId, number> }
```

Core API (pure, deterministic):
```ts
type Result =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: { code: ErrorCode; message: string } }   // the input state is never mutated; the caller keeps using it

createGame(settings): Result
legalActions(state, player): LegalAction[]       // drives UI highlights (valid vertices and edges)
validate(state, player, action): { ok: true } | { ok: false; error: { code: ErrorCode; message: string } }
apply(state, player, action): Result             // never throws on bad input
viewFor(state, player | 'spectator'): PublicGameState
eventsFor(events, player | 'spectator'): PublicGameEvent[]
```

(v1.2) `legalActions` returns every concrete action for enumerable types (placements, robber
tiles, steal victims, `ROLL`, `END_TURN`, `BUY_DEV`, card plays, `BANK_TRADE` pairs at
`count: 1`). For open-ended types it returns a marker instead of an enumeration:
`{ type: 'DISCARD', count: n }` and `{ type: 'PROPOSE_TRADE' }`. Contract test:
every action it returns passes `validate`.

Randomness (dice, shuffles, steals) comes only from `state.rngState` (mulberry32), so replaying a
seed plus an action log reproduces a game exactly. React components and Three.js meshes never
decide legality.

(v1.2) **RNG consumption order is part of the replay format.** `createGame` consumes in this
order: board terrain shuffle, token shuffle (with retries), port-kind shuffle (`random` preset
only), seating-order shuffle, dev-deck shuffle. After that: 2 draws per `ROLL`, 1 per steal.
Changing this order is a breaking change and bumps `schemaVersion`. No `Math.random`, `Date.now`
or locale-dependent call may appear in `src/game`.

## 12. Proposed code organization [DESIGN]

```text
src/game/                 # pure TypeScript; may not import react, three, @react-three/*, src/scene, src/ui
  types.ts  rng.ts  topology.ts  board.ts (generation + presets)
  rules/    setup.ts production.ts robber.ts build.ts trade.ts devcards.ts awards.ts victory.ts
  engine.ts (validate/apply/legalActions)
  view.ts   (viewFor/eventsFor)
  errors.ts (ErrorCode catalog, §19)
  __tests__/              # vitest, deterministic fixtures
src/scene/                # read-only projection of the view; emits intents
src/ui/                   # HUD reads viewFor(); dispatches Actions
```
Enforce the boundary with a lint rule or a test that scans imports in `src/game`.
(v1.2) In G5 the same `src/game` folder runs on the server, so it must stay free of DOM and Node
built-ins. Moving it to a workspace package at that point is a mechanical change.

## 13. Edge cases and test scenarios

**Topology:** 19 tiles, 54 vertices, 72 edges; 30 coastal edges; every edge has 2 vertices; vertex
degree is 2–3; the scene `(row,col)` mapping round-trips; the corner table in §2.3 matches
`corner(k)`; the 9 port edges in §2.6 are coastal and share no vertex.

**Board:** `standard-fixed` equals §2.6; `random` with 1,000 seeds always yields legal multisets,
no adjacent 6/8, robber on the desert; the same seed yields the same board.

**Setup:** snake order; adjacent settlement rejected; road not touching the just-placed
settlement rejected; 2nd settlement grants 1 per adjacent producing tile and 0 for the desert;
`BUY_DEV` and `ROLL` rejected during setup.

**Production:** a roll hits two tiles with the same number; a city yields 2; the robber blocks
one tile only; desert never produces.
**Bank shortage:** 1 grain left and one player owed 2 (city) → gets 1 [BLOG-RULES]. 1 left and two
players owed 1 → nobody. 0 left → nobody. Other resources from the same roll still pay out.
Conservation holds after every action.

**Seven:** hands of 7 (no discard), 8 (discard 4), 9 (discard 4); several discarders; a discard of
the wrong size or with cards not held is rejected; robber can't stay on the same tile (except the D14 Friendly Robber fallback); desert
allowed; steal from a 0-card player impossible; no candidates → skip; the stolen card is
distributed by hand weights (statistical test with a fixed seed). Friendly Robber blocks tiles
touching a player with 2 public VP even if they hold a VP card; Friendly Robber with no legal
tile leaves the robber in place.

**Building:** each cost deducted exactly; insufficient resources rejected; 16th road, 6th
settlement and 5th city rejected; city on an opponent's or an empty vertex rejected; road through
an opponent's settlement can't extend; settlement off your road network rejected outside setup;
a city upgrade frees a settlement piece.

**Dev cards:** bought-this-turn card can't be played; a second non-VP card in the same turn is
rejected; Knight before the roll, then rolling a 7 moves the robber twice; **Road Building, Year
of Plenty and Monopoly before the roll return to `preRoll` and the roll is still required (D1)**;
Road Building with 1 road piece left; Year of Plenty when the bank has 1 card; Monopoly when
nobody holds the type; a VP card bought that reaches 10 wins immediately on your turn; empty deck
→ BUY_DEV rejected; dev card play rejected during another player's turn.

**Trade:** 4:1 always; 3:1 and 2:1 only with a building on a port vertex; a city on a port keeps
the rate; `count: 2` at 2:1 costs 4; same type on both sides rejected; empty side (gift) rejected;
a trade between two non-active players rejected; proposer lacking the offer rejected; responder
lacking the request can't accept; the responder's hand changed before confirmation →
`TRADE_STALE`; building while a proposal is open cancels it; the 21st proposal in a turn rejected.

**Longest Road:** a loop of 6 counts 6; a fork counts the longest branch; a 5-vs-5 tie keeps the
first holder; an opponent's settlement splitting 7 into 3+4 removes the award; the
broken-road tie → nobody; Road Building completes 5 mid-card; your own settlement in the middle
doesn't break your road.
**Largest Army:** 3 knights awards it; a 3-vs-3 tie keeps the holder; 4 takes it.

**Victory:** reaching 10 on your own turn ends the game; reaching 10 off-turn wins at the start of
your turn; Largest Army in `preRoll` wins before the roll; hidden VP cards are revealed in the
GAME_WON event; no action is legal after `gameOver`.

**Visibility (v1.2):** `viewFor` output never contains `rngState`, `deck` contents, other
players' resource identities or dev-card types; `eventsFor` hides the stolen resource from third
parties and the bought card type from everyone but the buyer; a JSON search of every view in a
full playout finds no secret field.

**Robustness:** every invalid action leaves state deep-equal; resources and pieces never go
negative; replaying a seed plus an action log is bit-identical; §23.2 playout tests.

## 14. Implementation milestones

ROADMAP.md §5 is the source of truth (G1–G4 expanded there from this spec, multiplayer moved to
G5). Summary: **G1** topology, state, setup, dice and production → **G2** construction, robber and
awards → **G3** trading, dev cards, victory, a full local hot-seat game → **G4** 3D/UI integration →
**G5** multiplayer.

Where the v1.2 sections land:

| Section | Milestone |
|---|---|
| §2.6 fixed data, §11 `Result`/RNG order, §19 error codes | G1 |
| §17 `viewFor`/`eventsFor` | G1 (types), complete by G3 |
| §23.2 playout tests with the random legal bot | G3 exit criterion |
| §18 interaction flows | G4 |
| §20 timers, §21 multiplayer, §22 persistence | G5 |

The v1.0 "G0 — rules validation" step is mostly covered by the audits. The open questions in §15
are decided at the start of G1.

## 15. Open questions (to confirm in-app or decide before G1)

1. Win timing off-turn (§10.4) — [COMMUNITY] reports conflict; the newer one matches our rule. Confirm with a hands-on test.
2. Broken Longest Road tie handling — Colonist only documents "keep on tie".
3. Whether Colonist allows trading or building before the roll — we chose no.
4. Friendly Robber default for 4-player rooms; we chose off.
5. Board generator constraints (6/8 adjacency, port placement) — undocumented.
6. Whether the scene keeps its showcase layout or renders generated boards (§2.5).
7. Test runner: the project has none. Proposal: add `vitest` as a dev dependency in G1, pending approval.
8. (v1.2) Whether Colonist shows discarded cards and Monopoly/Year of Plenty details to all players. We chose public (§17).
9. (v1.2) Seating order method on Colonist. We chose a seeded shuffle.
10. (v1.2) Re-read [OFFICIAL], [BLOG-FAQ] and [BLOG-RULES] directly; this pass could not fetch them.
11. (v1.2) Product decisions for G5 in §20–§21: timer lengths, what happens to an absent player, hosting.

## 16. Instructions to Claude Code

1. Read `CLAUDE.md`, `ROADMAP.md` and this file before implementing gameplay.
2. Inspect the current code and map existing components to domain IDs. Preserve existing visuals.
3. Don't claim this spec exposes Colonist.io's private implementation.
4. Implement one milestone at a time. Write tests before wiring UI.
5. Don't silently resolve ambiguous rules: record the decision and its source tag here.
6. Never change the camera, post-processing or scene art as part of rules work unless explicitly approved.
7. Run typecheck, tests and build; report the results and update the roadmap after verified completion.
8. (v1.2) Treat §2.6 as data to copy exactly; don't regenerate it.
9. (v1.2) Sections 20–22 are design targets for G5. Don't build any of it before G4 is verified.

---

## 17. Information visibility (v1.2) [DESIGN unless tagged]

`viewFor` and `eventsFor` are the only way state reaches a screen or a network socket.

| Data | Owner | Other players | Spectator |
|---|---|---|---|
| Board, tokens, ports, robber, buildings, roads | yes | yes | yes |
| Dice result, active player, phase, turn | yes | yes | yes |
| Bank count per resource [BLOG-RULES] | yes | yes | yes |
| Dev deck: cards remaining | yes | yes | yes |
| Dev deck: order and contents | **no** | **no** | **no** |
| `rngState`, `seed` (while the game runs) | **no** | **no** | **no** |
| Resource hand: total count [BLOG-RULES] | yes | yes | yes |
| Resource hand: identities | yes | no | no |
| Dev cards: count of unplayed | yes | yes | yes |
| Dev cards: types, `boughtOnTurn` | yes | no | no |
| Played knights, awards, public VP | yes | yes | yes |
| Total VP including VP cards | yes | no (until `GAME_WON`) | no |
| Pieces left in supply | yes | yes | yes |
| Open trade: offer, request, responses | yes | yes | yes |
| Discard: number each player owes | yes | yes | yes |

Event redaction:

| Event | Rule |
|---|---|
| `CARD_STOLEN` | `resource` visible to thief and victim only |
| `DEV_BOUGHT` | `card` visible to the buyer only |
| `DISCARDED` | cards public (open question 8) |
| `RESOURCES_PRODUCED`, `SETUP_RESOURCES`, `BANK_TRADED`, `TRADE_COMPLETED`, `YEAR_OF_PLENTY_TAKEN`, `MONOPOLY_RESOLVED` | fully public; these happen in the open at a table |
| all others | public |

Consequences to accept: gains and trades are public, so a careful player can track most of each
hand. That matches a physical table. Stolen cards are the only hidden transfers.

`PublicGameState` is `GameState` without `rngState`, `deck` (replaced by `deckCount`), and with
other players' `resources` and `devCards` replaced by `resourceCount` and `devCardCount`. The
`seed` is removed from `settings` until `gameOver`, then included so the game can be replayed.

## 18. Interaction flows (v1.2) [DESIGN]

The UI is a function of `viewFor(me)` plus `legalActions(state, me)`. It never computes legality.

| Phase (for the acting player) | Prompt | Scene affordance | HUD |
|---|---|---|---|
| `setup/settlement` | "Place a settlement" | highlight legal vertices | — |
| `setup/road` | "Place a road" | highlight legal edges around the new settlement | — |
| `preRoll` | "Roll the dice" | — | Roll button; playable dev cards enabled |
| `discard` (me in `pending`) | "Discard N cards" | — | modal hand picker, confirm enabled at exactly N |
| `moveRobber` | "Move the robber" | highlight legal tiles | — |
| `steal` (2+ candidates) | "Steal from…" | highlight candidate buildings | player chooser with card counts |
| `actions` | — | — | Build menu (items enabled by `legalActions`), Buy card, Trade, End turn |
| `actions` + build mode road/settlement/city | "Choose a spot" | highlight legal edges/vertices; Esc cancels | cost reminder |
| `roadBuilding` | "Place free road (k of 2)" | highlight legal edges | — |
| Trade proposed to me | "P offers …" | — | accept / reject; accept disabled if I can't pay |
| `gameOver` | winner banner | camera free | final score table with revealed VP cards, rematch |

Waiting players see whose turn it is and what the game is waiting for ("P3 is discarding").

Required UI elements: per-player panel (colour, resource count, dev-card count, knights, roads
length, public VP, award badges), bank panel with counts, own hand, dice display, game log built
from `eventsFor`, build-cost reference card, pip dots on tokens.

Feedback rules: every rejected action shows the message for its `ErrorCode` (§19). Scene
animations (dice, card fly, robber move) are driven by events and never delay the state: the
engine state is already final when an animation starts. Hot-seat adds a "pass the device to P"
screen that hides the previous hand before the next player's view renders, including between
sequential discards.

## 19. Error catalog (v1.2) [DESIGN]

`ErrorCode` is a closed string union. Messages are i18n keys resolved in the UI, not engine text.

| Code | When |
|---|---|
| `INVALID_SETTINGS` | `createGame` validation failed |
| `GAME_OVER` | any action after the game ended |
| `NOT_YOUR_TURN` | actor isn't the player the phase is waiting for |
| `WRONG_PHASE` | action type not legal in the current phase |
| `UNKNOWN_LOCATION` | vertex, edge or tile ID not on the board |
| `OCCUPIED` | vertex or edge already taken |
| `DISTANCE_RULE` | adjacent vertex has a building |
| `NOT_CONNECTED` | road or settlement not connected to the actor's network; setup road not at `lastSettlement` |
| `BLOCKED_BY_OPPONENT` | only connection runs through an opponent's building |
| `NOT_YOUR_SETTLEMENT` | city upgrade target isn't the actor's settlement |
| `NO_PIECES_LEFT` | supply for that piece is empty |
| `INSUFFICIENT_RESOURCES` | can't pay a cost, offer, or bank-trade rate |
| `BANK_EMPTY` | bank lacks the requested cards |
| `DECK_EMPTY` | `BUY_DEV` on an empty deck |
| `CARD_NOT_HELD` | no card of that type in hand |
| `CARD_BOUGHT_THIS_TURN` | card can't be played on its purchase turn |
| `DEV_ALREADY_PLAYED` | a non-VP card was already played this turn |
| `CARD_NOT_PLAYABLE` | Road Building with no legal edge; Year of Plenty on an empty bank; wrong `take` length |
| `INVALID_DISCARD` | wrong total, cards not held, or player owes nothing |
| `ROBBER_SAME_TILE` | robber must move to a different tile (not raised in the D14 fallback, §6, where the current tile is the only legal target) |
| `ROBBER_PROTECTED` | Friendly Robber forbids that tile |
| `INVALID_VICTIM` | victim not on the tile, has no cards, is the actor, or is protected |
| `INVALID_TRADE` | empty side, same resource on both sides, non-positive quantity, give = get, bad recipient |
| `NO_OPEN_TRADE` | respond/confirm/cancel without a matching open trade ID |
| `NOT_ADDRESSED` | responder isn't in the proposal's `to` list |
| `TRADE_NOT_ACCEPTED` | confirm with a player who hasn't accepted |
| `TRADE_STALE` | a hand no longer covers its side at confirmation |
| `TRADE_LIMIT` | too many proposals this turn |
| `MALFORMED_ACTION` | payload fails schema validation (unknown type, missing field, non-integer) |

Rule: validation runs in the order schema → game over → actor/phase → target → resources, and
returns the first failure. Tests assert codes, not message text.

## 20. Timers and absent players (v1.2, G5) [DESIGN]

Not needed for hot-seat. Colonist has selectable timer speeds, a bot that takes over for a player
who leaves or times out, and automatic setup placement on timeout [COMMUNITY]; its exact values
and bot logic aren't documented, so everything below is our own.

Timers live **outside** the pure engine. A server-side scheduler holds one deadline per pending
decision and, on expiry, submits an ordinary action for that player. Replays stay deterministic
because the log records the action, not the clock.

| Decision | Default limit | On timeout |
|---|---|---|
| Setup settlement / road | 60 s each | auto-place: legal vertex with the highest pip total (ties: canonical ID order); first legal edge |
| Roll | 15 s | auto `ROLL` |
| Discard | 30 s | discard at random using a dedicated, non-game RNG |
| Move robber / steal | 30 s | legal tile that hurts the current public-VP leader (not self); random victim |
| Actions phase | 90 s, +15 s per completed trade, cap 180 s | `END_TURN` |
| Trade response | until the proposer's turn timer or cancel | counts as no response |

Presets: `relaxed` ×2, `normal` ×1, `fast` ×0.5, `off` (friends' rooms).

Absent players: 2 consecutive turn timeouts or a dropped connection for more than 60 s marks a
player `away`. An away player's decisions resolve at once with the timeout defaults, and they
reject all trades. They return to `present` on their next input. A game with no present humans
is abandoned after 5 minutes. Random choices made for timeouts use a separate RNG so they don't
shift the game's dice sequence — but the resulting actions are logged like any other.

## 21. Multiplayer architecture (v1.2, G5) [DESIGN]

Principles:
1. **Authoritative server.** The server owns `GameState` and runs the same `src/game` code. Clients send intents and render views. A client never receives `rngState`, the deck, or another player's hand (§17).
2. **Server-side randomness.** The seed is generated on the server from a cryptographic source and revealed only at `gameOver`.
3. **One writer per game.** Actions for a game are processed strictly one at a time, in arrival order.

Protocol (WebSocket, JSON):

| Direction | Message | Purpose |
|---|---|---|
| C→S | `join { roomId, token }` | authenticate and attach to a seat or as spectator |
| C→S | `action { clientSeq, action }` | submit an intent; `clientSeq` makes retries idempotent |
| S→C | `snapshot { seq, view, legal }` | full `viewFor(me)` on join and reconnect |
| S→C | `update { seq, events, view, legal }` | after each applied action; `seq = state.actionCount` |
| S→C | `rejected { clientSeq, error }` | §19 error; client state unchanged |
| S→C | `timer { decision, player, deadline }` | deadlines as server timestamps |
| S→C | `presence { player, status }` | present / away / disconnected |

- Reconnect: the client rejoins, gets a `snapshot`, and discards local state. A gap in `seq` triggers the same resync.
- Sending the full view on each update is fine at this size (a few KB) and removes a class of desync bugs. Optimise to diffs only if measurements require it.
- Rooms: create with settings, share a link, 4 seats, ready check, host starts. Lobby, matchmaking and accounts are product scope (§24), not engine scope.
- Server validation: every inbound message passes schema validation before reaching the engine (`MALFORMED_ACTION`), with a per-connection rate limit.
- Hosting constraint to settle before G5: the game needs a long-lived process or a managed WebSocket service with a per-game lock; a static/SSR host alone can't hold game rooms. Decide between one small stateful Node service and a serverless WebSocket gateway with a state store.
- Chat is optional and outside the engine. If added, it needs rate limiting and a mute control.

## 22. Persistence, versioning and replays (v1.2) [DESIGN]

- **Replay file:** `{ schemaVersion, engineVersion, settings (with seed), actions: [{ player, action }] }`. Replaying it through `createGame` + `apply` must reproduce the final state exactly (tested, §13).
- **Snapshots:** `GameState` is plain JSON (no `Map`, `Set`, class instances or `undefined`), so it can be stored and restored as is. The server stores the action log plus a snapshot every N actions for crash recovery.
- **Versioning:** `schemaVersion` changes when state shape or RNG consumption changes. An unfinished game is always completed on the engine version it started with; replays are loaded only by a matching major version.
- **Hot-seat (G3–G4):** autosave the replay file to local storage after each action and offer "resume game". Wrap storage access in try/catch.
- **Match record (G5):** id, settings, players, winner, final scores, turn count, duration, replay reference.

## 23. Quality requirements (v1.2) [DESIGN]

### 23.1 Non-functional targets

| Area | Target |
|---|---|
| Determinism | same seed + actions → identical state on any JS engine; integers only in rules |
| Engine speed | `apply` < 1 ms and `legalActions` < 5 ms on a mid-range phone |
| Purity | `src/game` has no I/O, timers, globals or mutation of its inputs (inputs frozen in tests) |
| Coverage | every rule bullet in §4–§10 maps to at least one named test; every `ErrorCode` is asserted at least once |
| Rendering | rules work doesn't lower the scene's frame rate; state updates don't remount the board |
| Input | every action reachable by mouse, touch and keyboard |
| Colour | player colours distinguishable under common colour-vision deficiencies; pieces also differ by a non-colour cue in the HUD |
| i18n | all player-facing text through keys (error codes, prompts, log lines); no text in the engine |
| Network (G5) | action round trip < 200 ms at p95; reconnect restores the view in < 2 s |

### 23.2 Test strategy
1. **Unit tests** per rules module, from §13.
2. **Scenario tests:** scripted games from a fixed seed with asserted intermediate states.
3. **Random playouts:** a "random legal bot" (pick uniformly from `legalActions`; for `DISCARD` pick random cards; never proposes trades) plays 1,000 seeded games to `gameOver`. After every action assert: resource conservation, piece counts within limits, award consistency (`resolve*` is idempotent), `legalActions ⊆ validate`, views contain no secrets. This bot is a test tool and the timeout fallback, not a product feature.
4. **Golden replays:** a few replay files stored in the repo with their final state hash, to catch accidental rule or RNG changes.
5. **Adapter tests** between scene indices and canonical IDs (§2.3).

### 23.3 Known limits accepted
- No stalemate rule: a game where nobody can progress continues until players leave. In G5 the abandonment rule in §20 ends it. Random playouts use a 2,000-turn cap and report (not fail) on hitting it.
- Fixed at 4 players. `PlayerId` and `order` are written so 2–3 players is a settings change later, but it isn't tested.

## 24. Product scope against Colonist (v1.2)

What this spec covers and what it doesn't. "Documented" means a public Colonist page or blog
post describes it; behaviour details remain unknown in every row.

| Capability | On Colonist | Isles 3D |
|---|---|---|
| Base-game rules, 4 players | yes [OFFICIAL] | **in scope, §2–§10** |
| Rule settings: VP target, discard limit, Friendly Robber | yes [BLOG-1V1] | in scope as settings |
| Private rooms, ready check | yes (Colonist 101 post, §1.1) | G5 |
| Turn timers with speeds | yes [COMMUNITY] | G5, own design (§20) |
| Bot takeover for absent players | yes [COMMUNITY] | G5, minimal fallback only (§20) |
| Play vs bots | yes (Colonist 101 post) | out of scope; needs a real AI |
| Trade embargo | yes [COMMUNITY] | not planned |
| Balanced dice | yes (setting; undocumented) | out of scope |
| Ranked play, leaderboards | yes (Colonist 101 post) | out of scope |
| 1v1 mode | yes [BLOG-1V1] | out of scope; settings already allow 15 VP |
| More players, Cities & Knights, Rush and other modes | yes (Colonist Rush FAQ, https://blog.colonist.io/colonist-rush-faq/) | out of scope |
| Accounts, profiles, cosmetics, store | not verified in this pass | out of scope |
| Chat | not verified in this pass | optional in G5 |
| Spectators, replays | not verified | spectator view and replay file exist in the design (§17, §22) |

So the answer to "is the game mechanism specified end to end?": the **rules engine** is, as far
as public sources allow, with the open questions in §15. The **product** around it is defined
here only to the depth needed to build G1–G5.

## 25. Naming and IP (v1.2)

Not legal advice; get a professional opinion before a public launch.
- Use our own names in the product: "Isles 3D", "raider" or similar instead of trademarked terms, and our own resource/terrain names if desired. Internal code identifiers in this spec are descriptive and can stay.
- Don't use the original game's name, logo, artwork, card art, rulebook text or Colonist's UI, text and assets anywhere in the product or its marketing.
- All art, icons, sounds and fonts must be original or properly licensed; keep a licence list in the repo.
