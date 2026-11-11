# Locked default camera (V7)

**Pose.** FOV 30°, elevation 43°, azimuth −0.019 rad (`src/scene/World.tsx`: `FOV`, `ELEVATION`, `AZIMUTH`).
The distance and pan are solved per viewport by `CameraRig`, so the board fills the area the HUD leaves free:
- Desktop: the side columns and bottom tray are kept clear and harbour signs never clip.
- Compact (narrow or portrait, `isCompact` in `src/ui/layout.ts`): the board and all signs sit between the top bar and the bottom dock.

At 1440×900 the result is camera ≈ (0.20, 9.13, 10.77), target ≈ (0.39, −0.50, 0.44), distance ≈ 14.1.

**Limits (OrbitControls + `CameraInteraction.tsx`)**
- Zoom distance: 6 to max(22, 1.25 × home distance). The zoom-out limit is never closer than home.
- Tilt: polar angle 0.25 to 1.2 rad, so the lowest view is ≈ 21° above the horizon and you can't look under the board.
- Pan: the target stays within 2.6 units of home on the ground plane and at home height. Clamping moves the camera and target together.

**Reset.** Double-click the canvas or press `R`. It's a 0.7 s ease, or instant under reduced motion.

**URL presets (screenshots and debugging)**
| Param | Effect |
|---|---|
| `?view=top` | near-overhead, whole board |
| `?view=low` | lowest allowed tilt, three-quarter view |
| `?view=close` | 0.55 × distance, detail check |
| `?nohover` | disables the tile hover ring (for clean captures) |
| `?nofx`, `?off=ao,bloom` | post-processing toggles |
| `?reducedmotion` | forces reduced motion |
| `?cam=x,y,z&tgt=x,y,z` | exact pose; disables auto-fit |

**Render target.** Canvas buffer = CSS size × min(devicePixelRatio, 2) (`dpr={[1,2]}`). This was verified at DPR 1, 2 and 3, where DPR 3 is capped at 2.
There's no DOF, motion blur, tilt-shift or temporal accumulation. The post chain is N8AO (half-res AO only), Bloom (threshold 1.7), HueSaturation, BrightnessContrast, ACES, Vignette and SMAA.

**Reproducible capture.** `DPR=2 WAIT=10000 node scripts/screenshot.mjs "http://localhost:5173/?nohover" out.png 1440 900`
