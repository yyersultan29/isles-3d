# Isles 3D — visual recreation

A real-time React Three Fiber recreation of `references/colonist-reference.png`. It's visual only: there's no gameplay, networking or rules.

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # tsc + vite production build
npm run server       # local game server (G5): http://127.0.0.1:8787, WebSocket at /ws; PORT/HOST override, ORIGINS=https://a,https://b limits the pages allowed to connect; logs are JSON lines
npm run shot -- http://localhost:5173/ shots/out.png 2000 1130   # headless Chrome screenshot (dev server must be running)
```

### Playing online (local server)

1. `npm run dev` and, in a second terminal, `npm run server`.
2. Open http://localhost:5173/?online. A room is created and the address becomes `?room=<id>`.
3. Send the invite link from the lobby to the other players, or open it in three more tabs. Each tab is one seat; a fifth visitor watches.
4. The first player starts the game once all four seats are taken.

A reload, a dropped connection or a closed tab reopened from the invite link rejoins the same seat: the seat token is kept per tab, and the browser remembers its tokens for the room. Rooms live in the server's memory, so restarting `npm run server` ends the games on it; a room with nobody connected for 10 minutes is removed. Another computer on the same network needs `HOST=0.0.0.0 npm run server` and `npx vite --host`; it then opens the invite link with this computer's address. The game server is local only and is not part of the GitHub Pages deployment.


Debug URL params:
- `?cam=x,y,z&tgt=x,y,z` overrides the camera.
- `?nofx` turns off post-processing.
- `?off=ao,bloom` turns off individual effects.

The visual spec and plan are in `VISUAL_SPEC.md`. The latest render is `references/render-latest.png`.

## Structure
| File | Contents |
|---|---|
| `src/scene/board.ts` | Board layout (3-4-5-4-3, same as the reference), hex maths, per-biome height functions, player pieces, harbours, island outline |
| `src/scene/Terrain.tsx` | Subdivided, displaced hex surfaces with vertex colour per biome. Mountains and hills are faceted. Wooden rails and brass rivets |
| `src/scene/Island.tsx` | Rocky cliff ring with strata, a grassy lip and a wet waterline band |
| `src/scene/Ocean.tsx` | PBR water with procedural swell normals, depth colouring and wave crests, plus an animated foam band that follows the cliff outline |
| `src/scene/Vegetation.tsx` | Instanced pines (3 variants), about 14k wheat stalks, grass tufts, bushes, rocks and sheep. Wind sway runs in the shader |
| `src/scene/Pieces.tsx` | Number tokens (lathe disc + canvas texture), robber, settlements and cities with lit windows, roads, flickering lanterns |
| `src/scene/Harbors.tsx` | Piers (ramp + deck, planks, posts, rope rails), parchment trade signs, lantern point lights |
| `src/scene/Ships.tsx` | Lofted hulls, billowing cloth sails, bobbing and drifting |
| `src/scene/Scenery.tsx` | Corner sea cliffs, waterfall, foreground foliage, seagulls |
| `src/scene/World.tsx` | Camera, golden-hour lighting, Lightformer environment, post-processing (N8AO, bloom, ACES, vignette, SMAA) |
| `src/ui/*` | HUD (Tailwind) and hand-drawn SVG resource icons and avatars |
| `src/brand.ts` | HUD brand name |

## Assets — transparency note
No external GLB/GLTF files are used. Every model is built in code: lofted, lathed, extruded and noise-displaced geometry, merged and vertex-coloured, and instanced where repeated. So there are no third-party licences to record. Models that would gain the most from authored GLB replacements:

1. **Buildings.** The settlements and cities are simple gabled forms. The reference has more ornate timber-and-stone miniatures.
2. **Ships.** The hull and rigging are simplified.
3. **Mountains.** These are a faceted heightfield. A sculpted rock mesh would read closer to the reference's massive snow-capped peaks.
4. **Sheep and pines.** They're stylised and good at board scale, but basic up close.
5. **Corner cliffs and foreground foliage.** These are displaced blobs and work only because they're blurred at the frame edges.

Good CC0 sources include Kenney (kenney.nl), Quaternius (quaternius.com) and Poly Haven (polyhaven.com). The instancing code in `Vegetation.tsx` takes any `BufferGeometry`, so a loaded GLB mesh can be dropped in with `useGLTF`.

## Known differences from the reference
- The reference is a painted concept, so its micro-detail, such as individual wheat ears and rock texture, can't be matched exactly with real-time procedural geometry.
- Avatars are stylised SVG faces, not painted portraits.
- At 16:10 and 16:9 the south harbour sign sits behind the card tray, and the east 2:1 sign sits behind the dice panel. They're visible at 4:3.
- The decorative corner cliffs and waterfall are mostly outside the frame or behind the HUD at 16:10 and 16:9. They only show on narrow or 4:3 windows, or when you orbit the camera.
- The ocean has sun glints and wave crests, but it lacks the reference's painterly highlights and reads slightly flatter.
- Trees are procedural, not hand-modelled: six tiered conifers with lobed, drooping branches and two broadleaf variants. The reference's painted trees still have finer needle detail.

## Framing
`CameraRig` in `World.tsx` keeps a fixed 43° camera angle. On every resize it solves for camera distance and pan so the board fills the screen area the HUD doesn't cover:
- The hex corners must stay clear of the left nav, the right HUD column and the card tray.
- The harbour signs must stay below the top edge.
- The west signs and the island rim must stay on screen. You can override the framing for testing with `?cam=x,y,z&tgt=x,y,z`.

## Deploy
Live at **https://yyersultan29.github.io/isles-3d/**.

`npm run deploy` runs `scripts/deploy.sh`. The script typechecks the project, builds with base path `/isles-3d/`, and force-pushes `dist/` to the `gh-pages` branch. GitHub Pages serves that branch. The `main` branch is never touched by a deploy.
