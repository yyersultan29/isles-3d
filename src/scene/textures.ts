import * as THREE from 'three'
import type { HarborKind } from './board'

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

// ---------- resource icons drawn with canvas paths (shared by signs) ----------
function drawSheep(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.save()
  g.translate(x, y)
  g.scale(s, s)
  g.fillStyle = '#2a2420'
  for (const lx of [-22, -8, 10, 22]) g.fillRect(lx - 3, 10, 6, 22)
  g.fillStyle = '#f6f2ea'
  g.strokeStyle = '#8f8678'
  g.lineWidth = 2
  for (const [cx, cy, r] of [[-18, -2, 16], [0, -10, 18], [16, -2, 16], [-8, 8, 16], [10, 8, 16], [0, 0, 18]] as const) {
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill(); g.stroke()
  }
  g.fillStyle = '#2a2420'
  g.beginPath(); g.ellipse(-34, -6, 11, 14, -0.3, 0, Math.PI * 2); g.fill()
  g.restore()
}
function drawLogs(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.save()
  g.translate(x, y)
  g.scale(s, s)
  for (const [ox, oy] of [[-14, 10], [14, 10], [0, -12]] as const) {
    g.fillStyle = '#8a4d22'
    g.beginPath()
    g.moveTo(ox - 34, oy - 11)
    g.lineTo(ox + 26, oy - 11)
    g.lineTo(ox + 26, oy + 11)
    g.lineTo(ox - 34, oy + 11)
    g.fill()
    g.fillStyle = '#d9a466'
    g.beginPath(); g.ellipse(ox + 26, oy, 8, 11, 0, 0, Math.PI * 2); g.fill()
    g.strokeStyle = '#8a4d22'; g.lineWidth = 2
    g.beginPath(); g.ellipse(ox + 26, oy, 4, 6, 0, 0, Math.PI * 2); g.stroke()
  }
  g.restore()
}
function drawBrick(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.save()
  g.translate(x, y)
  g.scale(s, s)
  const brick = (bx: number, by: number) => {
    g.fillStyle = '#b8432a'; g.fillRect(bx, by, 40, 18)
    g.fillStyle = '#e06b47'; g.fillRect(bx, by, 40, 5)
    g.strokeStyle = '#6e2414'; g.lineWidth = 2; g.strokeRect(bx, by, 40, 18)
  }
  brick(-42, 6); brick(0, 6); brick(-21, -14)
  g.restore()
}
function drawWheat(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.save()
  g.translate(x, y)
  g.scale(s, s)
  g.strokeStyle = '#a8761e'; g.lineWidth = 4
  g.beginPath(); g.moveTo(0, 36); g.quadraticCurveTo(4, 0, -6, -36); g.stroke()
  g.fillStyle = '#e8b53e'
  for (let i = 0; i < 6; i++) {
    const yy = 20 - i * 10
    for (const sgn of [-1, 1]) {
      g.save(); g.translate(-i * 1.2, yy); g.rotate(sgn * 0.6)
      g.beginPath(); g.ellipse(sgn * 8, 0, 9, 4.5, 0, 0, Math.PI * 2); g.fill()
      g.restore()
    }
  }
  g.restore()
}

function drawOre(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.save()
  g.translate(x, y)
  g.scale(s, s)
  const rock = (pts: [number, number][], fill: string, hi: string) => {
    g.fillStyle = fill
    g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.closePath(); g.fill()
    g.strokeStyle = '#3f444c'; g.lineWidth = 2; g.stroke()
    g.fillStyle = hi
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); g.lineTo(pts[1][0], pts[1][1]); g.lineTo((pts[0][0] + pts[2][0]) / 2, (pts[0][1] + pts[2][1]) / 2); g.closePath(); g.fill()
  }
  rock([[-40, 26], [-30, -4], [-8, -12], [4, 10], [-6, 28]], '#7d848e', '#b9c0c9')
  rock([[-2, 28], [8, -18], [28, -26], [40, 4], [32, 28]], '#8a919b', '#c8ced6')
  rock([[-20, 30], [-14, 12], [4, 8], [10, 30]], '#6b727c', '#a4abb4')
  g.restore()
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

export const ICONS: Record<HarborKind, (g: CanvasRenderingContext2D, x: number, y: number, s: number) => void> = {
  sheep3: drawSheep,
  generic: drawAny,
  sheep: drawSheep,
  ore: drawOre,
  wood: drawLogs,
  brick: drawBrick,
  wheat: drawWheat,
}

export function signTexture(kind: HarborKind, ratio: string) {
  return canvasTex(512, 300, (g) => {
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
    ICONS[kind](g, 175, 150, 2.4)
    g.fillStyle = '#2b2118'
    g.font = '700 118px Fredoka, "Trebuchet MS", sans-serif'
    g.textBaseline = 'middle'
    g.fillText(ratio, 290, 156)
  })
}
