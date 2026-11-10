# CLAUDE.md — Isles 3D

## Project mission
Isles 3D is a browser-based, premium stylized 3D hexagonal strategy-board experience inspired by the visual language of tabletop island games. The immediate priority is **visual quality and usability**, not gameplay.

Use `ROADMAP.md` as the source of truth for milestones and acceptance criteria. This file defines how to work. If the roadmap and this file conflict, explain the conflict and ask before making a consequential change.

## Before every task
1. Read `ROADMAP.md` and inspect the relevant existing source files.
2. Identify the current milestone and the smallest safe scope for the request.
3. State a short plan, including which files are likely to change.
4. Preserve working features; prefer targeted edits to rewrites.
5. Do not start another milestone without explicit approval.

## Current technical direction
- React + TypeScript + Three.js + React Three Fiber / Drei.
- Keep the 3D scene modular: terrain, vegetation, ocean, scenery, pieces, camera and lighting should have clear responsibilities.
- Keep HUD elements in React/DOM where practical, separate from 3D scene logic.
- Reuse geometry, materials and instancing for repeated objects.
- Inspect `package.json` and the existing architecture before choosing commands or introducing dependencies. Do not assume a library is installed.
- Use existing project conventions rather than imposing a new architecture.

## Visual art direction
Target: **premium stylized-realistic miniature diorama**, not a flat low-poly demo and not photorealism at the expense of readability.

- The 19-hex board must remain visually legible, with recognizable biomes and clear tile boundaries.
- Keep number tokens readable and avoid obstructing them with trees, buildings or effects.
- Prefer distinctive silhouettes, organic variation, believable materials and restrained details.
- The ocean should support the board, not dominate it with glare or noise.
- Keep shoreline foam, rocks, buildings and foliage visually coherent.
- Player colors, roads and settlements must remain easy to distinguish.
- Preserve good contrast between the board and the HUD.
- Treat `references/colonist-reference.png` as a visual reference if the file exists; do not embed it as a scene background.

## Camera and rendering — regression guardrails
We previously encountered severe whole-scene blur. **Do not introduce depth of field, tilt-shift, motion blur or aggressive temporal accumulation** unless explicitly requested and verified.

- Preserve sharp, readable rendering across the full playable board.
- Do not change camera angle, zoom, framing, orbit limits, pixel ratio or postprocessing unless the task requires it.
- Never fix composition by blindly increasing zoom until board edges or ports are clipped.
- Any camera change must be tested at common desktop sizes and must keep all board tiles accessible.
- Prefer a crisp baseline render over cinematic effects that hide detail.
- Avoid excessive bloom, saturation, reflection intensity and specular noise.

## Assets and performance
- Prefer appropriately licensed GLB/GLTF assets or efficient procedural meshes where they materially improve quality.
- Record asset sources and license obligations; do not silently import copyrighted assets.
- Reuse geometries and materials, use instancing for repeated vegetation, and avoid unnecessary draw calls.
- Avoid per-frame React state updates for animation; use frame loops and refs appropriately.
- Clean up GPU resources where necessary.
- Do not add heavyweight packages without explaining the trade-off.
- Measure performance before claiming improvements; prioritize responsive interaction on a modern desktop browser.

## Scope control
- Current priority: visual milestones in `ROADMAP.md`.
- No multiplayer, backend, authentication, trading or full game rules until the relevant milestone is approved.
- Do not redesign the HUD, rewrite the renderer or restructure the app unless explicitly requested.
- Do not add unrelated features while completing a visual task.

## Quality and verification
After each meaningful change:
1. Run the project's existing typecheck, lint and build commands where available. At minimum run the production build.
2. Test the changed scene in a browser when tools are available.
3. Capture a screenshot at a consistent viewport and camera pose if screenshot tooling is available.
4. Compare it with the previous baseline and the reference, focusing on framing, sharpness, readability and art quality.
5. Report verified results separately from assumptions and untested items.
6. Update `ROADMAP.md` checkboxes only for tasks that actually satisfy their acceptance criteria.

Never claim pixel-perfect fidelity or a visual improvement without a real comparison. If browser access is unavailable, say so.

## Git safety
- Before a risky visual change, check `git status` and suggest a checkpoint commit or branch.
- Never discard uncommitted user work.
- Do not run destructive Git commands, force-push or rewrite history without explicit permission.
- Commit only when asked, with a descriptive message. Push only when explicitly requested.
- Keep changes scoped and reviewable.

## Communication and delivery
- Explain decisions concisely, in Russian unless asked otherwise; code and identifiers may be in English.
- Before coding, summarize the goal, files involved and risks.
- After coding, report: changed files, visual impact, validation results, known limitations and the next roadmap item.
- Ask for approval before moving to the next milestone.
- When a requirement is ambiguous and could materially change the design, ask one focused question.

## Definition of done
A milestone is complete only when its roadmap acceptance criteria are met, the project builds, the scene remains sharp and readable, regressions are checked, and the user has reviewed the outcome.
