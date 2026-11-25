// Shared HUD class tokens (DESIGN_SYSTEM.md). No React and no imports, so any UI file can use them.

// Shared HUD tokens: panels use r-12, controls and cards r-8/9; type is 14/15 UI and 20 display.
export const panel =
  'bg-[linear-gradient(180deg,rgba(28,32,40,0.88),rgba(12,14,19,0.9))] backdrop-blur-md border border-[#c9a45c]/35 shadow-[0_10px_30px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)]'

/** Frosted glass for the right column (players, build): the board shows through, blurred, under a light rim. */
export const glass =
  'bg-[linear-gradient(180deg,rgba(120,138,158,0.30),rgba(22,28,38,0.55))] backdrop-blur-lg border border-white/25 shadow-[0_12px_32px_rgba(0,0,0,0.40),inset_0_1px_0_rgba(255,255,255,0.28)] [text-shadow:0_1px_2px_rgba(0,0,0,0.55)]'

/** Visible keyboard focus that reads over both water and panels. */
export const focusRing = 'outline-none focus-visible:ring-2 focus-visible:ring-[#f2b544] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1018]'
