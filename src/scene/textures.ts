import * as THREE from 'three'
import { createElement, type ComponentType, type SVGProps } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import type { HarborKind } from './board'
import { Brick, Logs, Ore, SheepIcon, WheatIcon } from '../ui/icons'

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  draw(g)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

export const PIPS: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 }

const tokenCache = new Map<number, THREE.Texture>()
export function tokenTexture(n: number) {
  let t = tokenCache.get(n)
  if (t) return t
  t = canvasTex(512, 512, (g) => {
    const grd = g.createRadialGradient(230, 210, 30, 256, 256, 256)
    grd.addColorStop(0, '#fbf1d8')
    grd.addColorStop(0.75, '#eedcb2')
    grd.addColorStop(1, '#cdb184')
    g.fillStyle = grd
    g.fillRect(0, 0, 512, 512)
    // wood grain rings
    g.globalAlpha = 0.07
    g.strokeStyle = '#7a5a30'
    for (let r = 30; r < 256; r += 13 + (r % 7)) {
      g.lineWidth = 2
      g.beginPath()
      g.ellipse(250, 262, r, r * 0.96, 0.2, 0, Math.PI * 2)
      g.stroke()
    }
    g.globalAlpha = 1
    // inner bevel ring
    g.strokeStyle = 'rgba(120,85,40,0.35)'
    g.lineWidth = 6
    g.beginPath()
    g.arc(256, 256, 226, 0, Math.PI * 2)
    g.stroke()
    const red = n === 6 || n === 8
    g.fillStyle = red ? '#b3261e' : '#2b2118'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = `700 ${n >= 10 ? 236 : 280}px Fredoka, "Trebuchet MS", sans-serif`
    g.shadowColor = 'rgba(0,0,0,0.25)'
    g.shadowOffsetY = 4
    g.shadowBlur = 6
    g.fillText(String(n), 256, 236)
    g.shadowColor = 'transparent'
    const pips = PIPS[n] ?? 0
    for (let i = 0; i < pips; i++) {
      g.beginPath()
      g.arc(256 + (i - (pips - 1) / 2) * 34, 392, 11, 0, Math.PI * 2)
      g.fill()
    }
  })
  tokenCache.set(n, t)
  return t
}

/** Generic 3:1 port: a neutral "any resource" mark (question mark in a coin). */
function drawAny(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.save()
  g.translate(x, y)
  g.scale(s, s)
  g.fillStyle = '#e9d6a6'; g.strokeStyle = '#6b4524'; g.lineWidth = 4
  g.beginPath(); g.arc(0, 0, 34, 0, Math.PI * 2); g.fill(); g.stroke()
  g.fillStyle = '#6b4524'
  g.font = '700 50px Fredoka, "Trebuchet MS", sans-serif'
  g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillText('?', 0, 3)
  g.restore()
}

// ---------- harbour sign icons ----------
// A3/A4: a resource sign shows the same SVG illustration as the resource card (src/ui/icons.tsx),
// rasterised into the sign's canvas, so each resource has one picture everywhere. Only the 3:1 "?"
// coin is drawn here. React renders the icon to markup outside any render pass (a timeout), then an
// <img> decodes it and the canvas texture updates.
const ICON_OF: Partial<Record<HarborKind, ComponentType<SVGProps<SVGSVGElement>>>> = {
  sheep3: SheepIcon, sheep: SheepIcon, wood: Logs, brick: Brick, wheat: WheatIcon, ore: Ore,
}
/** Drawn width per kind: the SVGs leave different margins in their 5:4 box (the sheaf is narrow). */
const ICON_W: Partial<Record<HarborKind, number>> = { generic: 190, wheat: 320, sheep: 280, sheep3: 280 }
const markupCache = new Map<HarborKind, string>()
function iconMarkup(kind: HarborKind) {
  let m = markupCache.get(kind)
  if (m !== undefined) return m
  const C = ICON_OF[kind]!
  const div = document.createElement('div')
  const root = createRoot(div)
  flushSync(() => root.render(createElement(C, { xmlns: 'http://www.w3.org/2000/svg', width: 400, height: 320 })))
  m = div.innerHTML
  root.unmount()
  markupCache.set(kind, m)
  return m
}
/** Draws the kind's icon centred at (x, y), `w` wide (icons are 5:4); an SVG icon arrives later and calls `done`. */
function drawIcon(g: CanvasRenderingContext2D, kind: HarborKind, x: number, y: number, w: number, done: () => void) {
  if (!ICON_OF[kind]) { drawAny(g, x, y, w / 80); return } // drawn now, before the texture exists
  setTimeout(() => {
    const img = new Image()
    img.onload = () => { g.drawImage(img, x - w / 2, y - (w * 0.8) / 2, w, w * 0.8); done() }
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(iconMarkup(kind))
  }, 0)
}

export function signTexture(kind: HarborKind, ratio: string) {
  const tex: THREE.CanvasTexture = canvasTex(512, 300, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 300)
    grd.addColorStop(0, '#f4e7c8')
    grd.addColorStop(1, '#dcc597')
    g.fillStyle = grd
    g.fillRect(0, 0, 512, 300)
    // paper texture
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(110,80,40,${Math.random() * 0.06})`
      g.fillRect(Math.random() * 512, Math.random() * 300, 2 + Math.random() * 4, 1 + Math.random() * 2)
    }
    g.strokeStyle = '#6b4524'
    g.lineWidth = 18
    g.strokeRect(9, 9, 494, 282)
    g.strokeStyle = 'rgba(80,50,20,0.35)'
    g.lineWidth = 3
    g.strokeRect(30, 30, 452, 240)
    drawIcon(g, kind, 158, 150, ICON_W[kind] ?? 260, () => { tex.needsUpdate = true })
    g.fillStyle = '#2b2118'
    g.font = '700 118px Fredoka, "Trebuchet MS", sans-serif'
    g.textBaseline = 'middle'
    g.fillText(ratio, 290, 156)
  })
  return tex
}
