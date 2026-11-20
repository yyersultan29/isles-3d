# G10.5 — Solo play against bots: plan

Status: approved by the owner on 2026-11-20 with one difficulty level ("ок один уровень"). G10.5a done.
Scope: one human against three bots on this device. No engine rules, protocol, camera or renderer changes.

## 1. Why

Today a game needs four people at one screen or four online. One person who opens the page alone cannot play.
Solo play also lets a new player learn at their own pace (the owner decided against a tutorial on 2026-11-19).

## 2. What already exists (reused, not rewritten)

| Piece | Where | Use for bots |
|---|---|---|
| `legalActions(s, p)` gives every legal move; `apply` checks and applies it | `src/game/engine.ts` | The bot only picks from this list, so it can never break a rule |
| A "random legal bot", 1,000 test games finish | `src/game/__tests__/helpers.ts` `botMove` | The weak baseline the new bot must beat |
| Fallback choices for an absent player: best corner by dots, robber on the leader, random discard | `src/server/timeouts.ts` `timeoutAction` | The starting heuristics for setup and robber; shared, not copied |
| "Whose screen is this" for one fixed seat (online `me`) | `useSeat()` in `GameProvider.tsx`, `usePrivacy()` | Solo = the screen always belongs to the human seat: no pass screen, bot hands stay hidden |
| Start menu: new game, names, board | `src/ui/StartMenu.tsx` | Adds "Play vs bots" |
| Autosave as a replay file | `src/store/autosave.ts` | Bot moves are ordinary actions in the log: save and replay unchanged |

## 3. Design

- **Bot brain: a pure module** `src/game/bot.ts`: `botAction(state, player) → Action | null` (deterministic; no RNG needed). It is plain TypeScript with no React, the same style as the engine, and it is tested without a browser.
  - It scores every legal action with simple rules and takes the best one:
    1. **Setup:** pick the corner by dots, resource variety and a port bonus. The road points toward the next good corner.
    2. **Turn:** build a city, then a settlement, then a development card, then a road toward a free good corner. Trade with the bank only when the trade completes a build this turn.
    3. **Robber:** block the leader's best tile but never its own tile, then steal from the leader.
    4. **Discard:** keep the cards closest to the next build.
    5. **Development cards:** play a knight when the robber sits on its tile or when it wins Largest Army. Monopoly and Year of Plenty finish a build. Road Building is played when roads are useful.
    6. **Trades with the human:** a bot accepts an offer when it gets something it needs and gives away something it has extra of. In v1 bots do not propose trades to the human.
  - Its own random numbers are separate from the game's dice (as in `timeoutAction`), so a bot never changes the dice sequence.
- **Runner in the store:** `src/store/bots.ts`.
  - It subscribes to the store. When the game waits for a bot seat, it waits a short delay and then dispatches the bot's action.
  - Delays: about 700 ms between actions and about 1.2 s after a dice roll. This lets the human follow the bot's moves in the log and on the board.
  - One timer at a time, cancelled on reset, load and leaving the page. No React state per frame.
  - Discards on a seven: every bot discards at once, and the human gets their normal prompt.
- **Screen owner:** a solo game sets a fixed seat (the human's, p1) through the same path online uses. The HUD, the hand and the dialogs show only the human's view. The pass-device screen does not appear.
- **Which seats are bots** is saved under its own key, next to the names (like `names.ts`). The replay format stays the same, and old saves load as hot-seat games.
- **Menu:**
  - "Play vs bots" sits next to "New game on this device".
  - Bots get names such as "Bot Ada" / "Бот Ада", plus a small bot mark on the player card.
  - Continuing a solo save restores the bots.

**Not in this step:**
- bots in online rooms (needs server and protocol changes);
- bots proposing trades;
- 2 or 3 players (the engine has 4 fixed seats);
- running the bot in a Web Worker. The choice should take under 5 ms; this will be measured, and a worker is only needed if it is slower.

## 4. Steps (one at a time, each checked before the next)

| Step | What | Check |
|---|---|---|
| **G10.5a** Bot brain | `src/game/bot.ts` plus unit tests | Every chosen action is in `legalActions` and passes `validate`. 500 bot-vs-bot games all finish (no turn cap), with average length recorded. Our bot vs 3 random bots: wins ≥ 80% of 200 games. Choice time p95 < 5 ms |
| **G10.5b** Runner and fixed seat | `src/store/bots.ts`; solo mode in the store and provider | Store test with fake timers: the bots play a whole game to the end with no human input. The human's hand never shows bot cards. Reset, load and victory stop the timer |
| **G10.5c** Menu, names, save | StartMenu "Play vs bots", bot mark, bot seats saved | Browser: menu → first placement in ≤ 3 clicks. Reload mid-game → Continue restores bots and they keep playing. The old hot-seat save still loads. EN and RU, no overflow |
| **G10.5d** Feel and polish | Delays, the log shows bot moves, trade replies from bots | Scripted game at 1440×900, 1280×720, 390×844: no page errors, axe 0 (g6-audit), "End turn" never covered. FPS and fan behaviour the same as hot-seat |

Every step: `npm test`, typecheck, build. Steps C and D also get screenshots. ROADMAP checkboxes are ticked only after the checks pass.

## 5. Risks

- **The bot is too weak or too strong.** The step A win-rate test catches "too weak". "Too strong" is unlikely with simple rules, and the owner can judge after step C.
- **A bot gets stuck in a loop**, e.g. it trades back and forth. Bank trades are allowed only toward a build in the same turn, and the bot ends the turn when nothing scores higher. The 500-game test catches loops.
- **A timer fires after reset or load and dispatches into the new game.** The runner checks the store generation before each dispatch.
- **Animations** (dice, camera reset) overlap fast bot moves. The delays come after events, and the actual feel is checked in step D.

## 6. Decision for the owner

**Bot difficulty.** Recommended: **one level** in v1, a decent "normal" bot.
- Difficulty is a weight table inside `bot.ts`, so adding "easy" (more random choices) and "hard" later is a small separate step that changes no other code.
- Choosing difficulty now adds a menu option and triples the balance checks before we know if the base bot is fun.
