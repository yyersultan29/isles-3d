import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { createRoomFromUrl } from './net/connect'

// Canvas textures (number tokens, harbour signs) draw text — wait for the web font first.
const fontsReady = Promise.race([
  Promise.all([document.fonts.load('700 100px Fredoka'), document.fonts.load('500 16px Inter')]),
  new Promise((r) => setTimeout(r, 2500)),
])

// G5.7: a free host may be asleep; before React mounts, a plain line says why the page waits
let waitNote: HTMLElement | null = null
const waiting = (seconds: number) => {
  if (!waitNote) {
    waitNote = document.createElement('p')
    waitNote.setAttribute('role', 'status')
    waitNote.style.cssText = 'position:fixed;inset:0;margin:0;display:grid;place-items:center;padding:16px;text-align:center;background:#08121c;color:#f4efe6;font:600 16px/1.5 Inter,system-ui,sans-serif'
    document.body.append(waitNote)
  }
  waitNote.textContent = `Waking up the game server… ${seconds} s (a free server sleeps when nobody plays; this takes up to a minute)`
}

// ?online first creates a room and moves to its link
Promise.all([fontsReady.catch(() => {}), createRoomFromUrl(waiting)]).then(([, moved]) => {
  if (moved) return
  waitNote?.remove()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
