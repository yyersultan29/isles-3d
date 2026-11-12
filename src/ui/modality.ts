// Last input modality (G4.7 fix for G4.6a): keyboard-only conveniences such as moving focus to the
// board picker on their own must not fire for mouse or touch users. Chrome treats programmatic focus
// with no prior interaction as keyboard focus, which showed the picker's hint to everyone on load.

let keyboard = false
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => { if (!e.metaKey && !e.ctrlKey && !e.altKey) keyboard = true }, true)
  window.addEventListener('pointerdown', () => { keyboard = false }, true)
}

/** True when the most recent input was a key press (not a pointer or touch). */
export const usingKeyboard = () => keyboard
