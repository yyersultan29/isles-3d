# G9 — Easy for a new player: business and system analysis, plan

Status: plan approved by the owner on 2026-11-15 ("сначала четкий план … потом начинай делать").
Source of the findings: a fresh UX pass on 2026-11-15 (1440×900; new game, setup, mid-game, the robber)
plus a code read of `src/ui`, `src/store`, `src/game`, `src/net`.

## 1. Business analysis

### 1.1 Who plays and why

| Segment | Situation | What they need first |
|---|---|---|
| **Friends at one screen** (hot-seat) | One laptop, 2–4 people, often someone who has never played | Start in seconds; always know whose turn it is and what just happened |
| **Friends online** (link) | Each on their own device, voice chat on the side | A visible way to create a room and share the link; a history of what others did while they looked away |
| **Russian-speaking players** | The owner's audience; the game is English-only today | The interface in Russian |
| **Experienced players** | Know the genre | Speed: no extra clicks, clear numbers (dice sum, awards, knights) |

Positioning: a free browser game whose edge is the premium diorama look. The look gets a player
to try it; UX decides whether they finish a game and come back. Hosting stays free (Render Free +
GitHub Pages), so the plan adds no paid services and no backend features.

### 1.2 Problems, by impact on the first game

| # | Problem (seen 2026-11-15) | Who suffers | Impact |
|---|---|---|---|
| P1 | **No game log.** Rolls, production, steals, builds and trades are 4-second toasts; if you look away you lose them | Everyone, online most | High: players can't follow the game, ask "what happened?" |
| P2 | **Trade and development cards are two dim, unlabelled icons** in the bottom-left corner, far from the hand and the build menu | New players | High: the core actions are hard to find |
| P3 | **Dice sum not shown as a number**; the 3D dice must be read | Everyone | Medium |
| P4 | **No start menu.** The page drops straight into a 4-player hot-seat game named Blue/Red/Orange/White; online play exists only as a `?online` URL | New players, online players | High for first contact and for online |
| P5 | **English only** | Russian-speaking players | High for the target audience |
| P6 | **Setup: all ~54 corners look the same**; "choose a light spot" is unclear; the build panel is fully expanded with "After setup" rows; an empty hand plinth says "No resource cards" | New players | Medium |
| P7 | **Player cards show little**: "LR"/"LA" badges, no played knights | Everyone | Low–medium |

### 1.3 Goals and how we measure them

There is no analytics (and no backend for it), so success is measured by scripted UI checks and
screenshots, as in G6/G7:

| Goal | Measure | Target |
|---|---|---|
| Follow the game | The last roll, who got what, steals, builds, trades and awards appear in a visible log that survives a reload | 100% of public events of the last turns visible without hover |
| Find the core actions | Trade and development cards have visible text labels next to the hand | 0 unlabelled core actions |
| Start fast | Clicks from opening the page to the first placement, new hot-seat game | ≤ 3 |
| Play online without a URL trick | A visible "Play online" path that creates a room and shows a copyable link | present, ≤ 2 clicks to a link |
| Russian interface | Visible strings in Russian when selected; no layout overflow | 0 untranslated visible strings in audited states |
| No regressions | `ux-flows`, `g7-*`, `g6-audit` (axe 0, fit), 273 tests, build, framing and perf | unchanged or better |

### 1.4 Out of scope (needs a separate decision)

- **3 players.** The engine is fixed at 4 seats (`PlayerId` p1–p4, no `playerCount` setting);
  3-player games change rules, server, replays and golden tests. Not in G9.
- Phone-specific work (touch targets, 360×740) stays in G8.
- Chat, accounts, rankings, sound.

## 2. System analysis

### 2.1 What exists

- **Engine events** (`src/game/types.ts` `GameEvent`): typed, complete (rolls, production,
  discard, robber, steal, builds, dev cards, trades, awards, turns, victory). `eventsFor(events, viewer)`
  hides a stolen card's resource and a bought card's type from others.
- **Stores** (`src/store/gameStore.ts`, `onlineStore.ts`): `onEvents(listener)` fires per dispatch;
  `load()` replays a save **silently** (no events); `replayFile()` returns the full action log
  (local only). The online client skips missed events on reconnect (`notify(null)`).
- **Notices** (`src/ui/noticeQueue.ts`, `Notices.tsx`): `eventNotices(events)` is a pure,
  unit-tested text function; a small external store with timers renders toasts bottom-left
  (`HUD.tsx`, above the two action icons).
- **Names and colours**: `SEATS` in `src/ui/gameView.ts`, hard-coded; not in `GameSettings`
  or the save file (`ReplayFile { schemaVersion, engineVersion, settings, actions }`).
- **Text**: ~220 English strings across `src/ui`; `i18n.ts` covers only engine error codes.
- **Layout**: desktop HUD is a scaled root with fixed zones (logo top-left, players top-right,
  dice and build right, hand bottom-centre, notices + 2 icons bottom-left); compact HUD below
  900 px or portrait (`layout.ts`).

### 2.2 Design per step

**G9.1 Game log**
- `src/ui/gameLog.ts`: a pure `logEntries(events, turn)` → `{ id, turn, player?, kind, parts }`
  (text plus resource icons and dice values), reusing the notice wording; unit-tested.
- A log store (same pattern as the notice queue): subscribes to `store.onEvents`, keeps the
  last 200 entries, resets on `generation()` change.
- History after a reload: for the local store, rebuild by re-running the engine over
  `replayFile().actions` and collecting events (a few hundred actions, milliseconds). Online:
  the log starts at join, and a missed-events gap shows one "some events were missed" line.
- Hidden information: the hot-seat device is shared, so local events go through
  `eventsFor(events, 'spectator')`; online events already arrive projected for the viewer.
- UI: a panel in the bottom-left zone that the notices use today: the newest lines at the
  bottom, the last few visible, a button to expand and scroll. Game-event toasts move into the
  log (the newest line is highlighted for a few seconds); rejection messages stay as toasts.
  Compact HUD: a "Log" button opening a sheet. `role="log"` without live announcements
  (the existing announcer already speaks the events).

**G9.2 Core actions and the dice**
- Trade and development cards become labelled buttons next to the hand (text + icon + key hint).
- The dice plinth shows the last roll's sum as a number.

**G9.3 Start menu**
- A start screen before the hot-seat game: "Play on this device" (names, optional; colours as
  today), "Play online" (creates a room through the existing `?online` flow and shows the link),
  "Continue" when a save exists (replaces the separate Resume prompt).
- Names are UI data: an optional `names` map stored next to the save (a new optional field;
  old saves still load). The engine and protocol are unchanged.

**G9.4 Russian language**
- One message table per locale (`en`, `ru`) for all visible strings, a language switch in the
  start menu and help, the choice stored per device (try/catch). Split into sub-steps by area
  (HUD, dialogs, notices/log, lobby) so each stays reviewable.

**G9.5 Setup clarity and clutter**
- During setup, corners show their pip value (or a soft size/brightness scale); the phase text
  becomes plain ("place your first settlement on a free corner").
- The build panel collapses to one line during setup; the empty hand plinth shows nothing or a
  short hint.

**G9.6 Player cards**
- Awards spelled out (icon + "Longest Road"), played knights shown.

### 2.3 Risks and how we contain them

| Risk | Containment |
|---|---|
| The log panel covers ports or tokens on the left of the board | Same zone and width as today's notices; screenshot at 1440×900, 1280×720, 1920×1080 and 390×844 |
| Double announcements for screen readers | `role="log"` with live updates off; the existing announcer stays the only voice |
| Leaking hidden information in hot-seat | Project local events as spectator; unit test |
| History rebuild cost on very long games | Measured; capped at the last 200 entries |
| i18n touches many files | Sub-steps by area; drivers select by `data-*`, not English text, where they rely on text today |
| Camera or framing changes | None planned; every step compares with the current baseline |

### 2.4 Verification per step

Build, typecheck, 273+ tests, the existing drivers (`ux-flows`, `g6-audit`, `g7-*`), screenshots at a
fixed viewport before/after, `perf.mjs` when the scene is touched. One step at a time, reported
and reviewed by the owner before the next.

## 3. Order

1. **G9.1 Game log** (P1)
2. **G9.2 Labelled core actions + dice sum** (P2, P3)
3. **G9.3 Start menu with names and online** (P4)
4. **G9.4 Russian language** (P5)
5. **G9.5 Setup clarity and clutter** (P6)
6. **G9.6 Player cards** (P7)
7. **G9.7 Exit check**: all drivers, both languages, desktop + compact, owner review
