# Visual specification — derived from `references/colonist-reference.png`

## Camera & composition
- Elevated three-quarter view, ~52° down-tilt, looking north. Mild perspective (narrow FOV ≈ 30°) — far rows
  only slightly smaller than near rows.
- Board centred slightly left of the viewport centre (HUD column on the right is wider than nav on the left);
  island spans ~70% of viewport width, ~85% of height. Top row clipped close to top edge, bottom harbour sign
  touches the resource-card tray.
- Corners: dark rocky cliffs (top-left with waterfall, left, bottom-left), out-of-focus foliage in the
  bottom-left / bottom-right corners → tilt-shift blur toward top & bottom edges.

## Board (pointy-top hexes, rows 3-4-5-4-3, top → bottom)
| Row | Tiles (number) |
|-----|----------------|
| 1 | Mountain 5 · Pasture 2 · Wheat 9 |
| 2 | Pasture 10 · Hills 10 · Mountain 3 · Forest 4 |
| 3 | Forest 8 · Wheat 11 · Desert (robber) · Pasture 11 · Hills 6 |
| 4 | Pasture 12 · Forest 5 · Forest 10 · Wheat 3 |
| 5 | Mountain 5 · Pasture 4 · Hills 8 |

- Tiles separated by raised wooden rails with small metal rivets at vertices; tile tops are slightly domed.
- Number tokens: cream wooden discs, dark serif-ish numerals, red for 6 and 8, slight drop shadow.
- Island rim: grey-brown rocky cliffs, ~0.6 tile tall, foam ring at the water line.

## Biomes
- Forest: dense dark-green pines (3 shades, varied scale), dark green ground.
- Wheat: saturated golden stalk field, rows/patches, lighter tips.
- Mountains: grey jagged multi-peak rock, white snow caps, strong self-shadowing.
- Pasture: bright yellow-green grass, white sheep with dark faces, bushes and stones.
- Hills: burnt orange / red clay mounds with eroded ridges, a few trees.
- Desert: pale sand with soft dunes, black robber pawn on a mound in the centre.

## Ocean
- Deep navy at distance → teal/turquoise near the island; animated swell; bright foam band hugging the coast;
  warm sun glints. Sailing ships (cream sails, wooden hulls) at W, SW, NE, SE.

## Players
- Red (NW: hills 10 / mountain 5 area), Blue (E: mountain 3 / forest 4 / pasture 11), White (W: forest 8 /
  pasture 12), Orange (S: forest 5 / forest 10 / wheat 3). Settlements = small gabled houses, cities = house +
  tower. Roads = coloured blocks along hex edges. Warm lit windows.

## Harbours (7)
3:1 sheep-icon signs at N-left, N-right, E; 2:1 wood (W), 2:1 brick (SW), 2:1 wheat (SE), 2:1 sheep (S).
Each: wooden pier + framed parchment sign + glowing lantern.

## Lighting & grade
- Low warm sun from the upper-left (golden hour), cool sky fill, long soft shadows to the lower-right.
- ACES filmic, slightly lifted saturation, warm highlights / cool shadows, vignette, bloom on lanterns.

## UI
- Top-left brand chip (hex logo + title, "3D" in gold). Left nav: Home (active, gold border), Game, Stats,
  Settings. Top-right: fullscreen + help square buttons; 4 player cards (avatar, name, trophy/VP, cards,
  green online dot, player-colour left accent). Right: dice pair on a wooden plinth + glossy gold "Roll Dice"
  pill. Bottom-centre: 5 resource cards with gold frames and count badges. Bottom-right: Build panel (road,
  settlement, city, dev card rows with cost icons + arrows). Bottom-left: undo + chat round buttons.
- Panels: near-black translucent (#0f141c @ 80%), 1px warm-gold border, 12–14px radius, deep shadows.

## Implementation plan
A. Vite/React/TS scaffold, Canvas, camera, lights, hex math, 19 tiles.
B. Terrain meshes per biome (displaced surfaces with vertex colour), cliffs, mountains, trees, wheat, grass.
C. Ocean shader with foam, ships, docks/signs, buildings, roads, rocks, scenery.
D. HUD in DOM with Tailwind.
E. Post-processing (AO, bloom, tilt-shift, vignette), animations (waves, sway, ships, lanterns, birds).
F. Headless-Chrome screenshot (`npm run shot`) and side-by-side iteration.
