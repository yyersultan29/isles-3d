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

// ?online first creates a room and moves to its link
Promise.all([fontsReady.catch(() => {}), createRoomFromUrl()]).then(([, moved]) => {
  if (moved) return
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
