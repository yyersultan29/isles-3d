# Isles 3D

A browser board game about settling a hexagonal island, played on a stylised 3D miniature diorama.
Four players, on one device (pass-the-device) or online, in English or Russian.

**Play:** https://yyersultan29.github.io/isles-3d/

## What's in it
- The full base game: setup placement, dice and production, the robber and discards, roads, settlements and
  cities, bank and port trades, player trades, development cards, Longest Road, Largest Army, and victory at 10 points.
- A balanced random board or the classic layout.
- Hot-seat play with a pass-the-device screen that hides the next player's cards, autosave and resume.
- Online rooms on a small Node WebSocket server: the server runs the same rules engine, rolls the dice and
  validates every move; turn timers; reconnect to the same seat.
- A game log, keyboard play for every action, screen-reader announcements, graphics quality levels.

## How to play, in short
1. Each player places two settlements and two roads. The second settlement gives its first resources.
2. On your turn, roll the dice. Every tile with that number pays its resource to the settlements (1) and cities (2) on its corners.
3. Spend resources to build: roads, settlements, cities, development cards. Trade with the bank, ports or other players.
4. A 7 moves the robber: it blocks a tile and steals a card; players with more than 7 cards discard half.
5. Settlements are worth 1 point, cities 2, Longest Road and Largest Army 2 each. The first to 10 points wins.

## Run locally
```bash
npm install
npm run dev          # http://localhost:5173
npm test             # rules engine, store, UI logic and server tests (vitest)
npm run build        # tsc + vite production build
npm run server       # local game server: http://127.0.0.1:8787, WebSocket at /ws; PORT/HOST override, ORIGINS=https://a,https://b limits the pages allowed to connect; logs are JSON lines
npm run shot -- http://localhost:5173/ shots/out.png 2000 1130   # headless Chrome screenshot (dev server must be running)
```

### Playing online (local server)

1. `npm run dev` and, in a second terminal, `npm run server`.
2. Open http://localhost:5173/?online. A room is created and the address becomes `?room=<id>`.
3. Send the invite link from the lobby to the other players, or open it in three more tabs. Each tab is one seat; a fifth visitor watches.
4. The first player starts the game once all four seats are taken.

A reload, a dropped connection or a closed tab reopened from the invite link rejoins the same seat: the seat token is kept per tab, and the browser remembers its tokens for the room. Rooms live in the server's memory, so restarting `npm run server` ends the games on it; a room with nobody connected for 10 minutes is removed. Another computer on the same network needs `HOST=0.0.0.0 npm run server` and `npx vite --host`; it then opens the invite link with this computer's address.

### Hosting the game server on Render (free)

The client stays on GitHub Pages; the game server runs as a free Render web service described by `render.yaml` (Frankfurt, Node 22, health check `/health`). Its build runs `scripts/build-server.sh`, which installs only esbuild and ws and bundles the server into `server-dist/main.mjs`; the full `npm ci` ran the free build machine out of memory. `npm run build:server` does the same locally.

1. On render.com, sign in with GitHub, choose **New → Blueprint** and pick this repository. Render reads `render.yaml` and creates `isles-3d-server`.
2. Once it is live, note its address, e.g. `isles-3d-server.onrender.com`, and check `https://<address>/health`.
3. Build the site against it: `GAME_SERVER=<address> npm run deploy`. Then `https://<user>.github.io/isles-3d/?online` creates a room on the server.

What the free plan means:
- The service sleeps after 15 minutes without inbound requests or WebSocket messages and takes about a minute to wake. `?online` says it is waking the server and keeps asking for 90 s. Open pages send a keep-alive every 4 minutes, so a lobby or a slow game keeps the server awake.
- Rooms live in memory: a sleep, a restart or a redeploy ends them. `buildFilter` redeploys only on server-side changes (`src/server`, `src/net`, `src/game`, package files).
- `ORIGINS` admits only the GitHub Pages site, and `TRUST_PROXY=1` takes each player's address from Render's proxy for the per-address limits.


Debug URL params:
- `?cam=x,y,z&tgt=x,y,z` overrides the camera.
- `?nofx` turns off post-processing.
- `?off=ao,bloom` turns off individual effects.

Product and design docs: `GAME_DESIGN.md` (rules), `UX_PRODUCT_SPEC.md`, `VISUAL_SPEC.md`, milestones in `ROADMAP.md`.

## Structure
| Path | Contents |
|---|---|
| `src/game/` | Pure rules engine: state, actions, events, per-viewer projections, seeded RNG, replays. No React or Three.js |
| `src/store/` | Local and online game stores, autosave, placement targets, UI state |
| `src/ui/` | HUD in React + Tailwind: start menu, players, dice, hand, build, trades, dev cards, game log, notices, i18n |
| `src/scene/` | The React Three Fiber scene: terrain, island, ocean, vegetation, pieces, harbours, ships, characters, camera and lighting, frame budget |
| `src/server/`, `src/net/` | Game server (rooms, timers, limits) and the client–server protocol |
| `scripts/` | Screenshot, playthrough, performance and asset-build scripts |

## Assets
Almost everything is generated in code (procedural meshes, canvas textures, inline SVG). The exceptions are a few
character models in `public/models/`, built from owner-supplied AI-generated exports by `scripts/build-character.mjs`.
Sources and licence notes are in `ASSETS.md`.

## Framing
`CameraRig` in `World.tsx` keeps a fixed 43° camera angle and, on every resize, solves the camera distance and pan so
the board fills the area the HUD doesn't cover, with the harbour signs and island rim on screen.

## Deploy
Live at **https://yyersultan29.github.io/isles-3d/**.

`npm run deploy` runs `scripts/deploy.sh`. The script typechecks the project, builds with base path `/isles-3d/`, and force-pushes `dist/` to the `gh-pages` branch. GitHub Pages serves that branch. The `main` branch is never touched by a deploy.
