// Procedural textures (generated once, tiny, no downloads).
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, NoColorSpace, LinearMipmapLinearFilter } from 'three'
import { createNoise2D, fbm } from '../core/noise.js'

let snowNormal = null

/** Tileable snow-grain normal map (wind ripples + granular crust). */
export function getSnowNormalMap() {
  if (snowNormal) return snowNormal
  const S = 256
  const noise = createNoise2D(5)
  const hgt = new Float32Array(S * S)
  // Tileable by sampling noise on a torus.
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const a = (x / S) * Math.PI * 2
      const b = (y / S) * Math.PI * 2
      const nx = Math.cos(a) * 1.6
      const ny = Math.sin(a) * 1.6
      const nz = Math.cos(b) * 1.6
      const nw = Math.sin(b) * 1.6
      const n1 = fbm(noise, nx + nz * 0.7, ny + nw * 0.7, 3)
      const ripple = Math.sin((x / S) * Math.PI * 2 * 6 + n1 * 3) * 0.35
      const grain = noise(nx * 9 + nz * 13, ny * 9 + nw * 13) * 0.35
      hgt[y * S + x] = n1 * 0.6 + ripple + grain
    }
  }
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = S
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(S, S)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const l = hgt[y * S + ((x + S - 1) % S)]
      const r = hgt[y * S + ((x + 1) % S)]
      const u = hgt[((y + S - 1) % S) * S + x]
      const d = hgt[((y + 1) % S) * S + x]
      let dx = (l - r) * 2.2
      let dy = (u - d) * 2.2
      const len = Math.hypot(dx, dy, 1)
      const i = (y * S + x) * 4
      img.data[i] = ((dx / len) * 0.5 + 0.5) * 255
      img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const tex = new CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.colorSpace = NoColorSpace
  tex.minFilter = LinearMipmapLinearFilter
  tex.anisotropy = 4
  snowNormal = tex
  return tex
}

let flake = null
export function getSnowflakeTexture() {
  if (flake) return flake
  const c = document.createElement('canvas')
  c.width = c.height = 32
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.75)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 32, 32)
  flake = new CanvasTexture(c)
  flake.colorSpace = SRGBColorSpace
  return flake
}

export function makeSignTexture(lines, { w = 512, h = 256, bg = '#5a3d27', fg = '#f4ead8' } = {}) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)
  // wood grain
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = `rgba(30,18,10,${0.08 + Math.random() * 0.12})`
    ctx.lineWidth = 1 + Math.random() * 2
    ctx.beginPath()
    const y = Math.random() * h
    ctx.moveTo(0, y)
    ctx.bezierCurveTo(w * 0.3, y + 6, w * 0.6, y - 6, w, y + 3)
    ctx.stroke()
  }
  ctx.fillStyle = fg
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  lines.forEach((line, i) => {
    ctx.font = `${i === 0 ? 'bold 64px' : '34px'} Georgia, serif`
    ctx.fillText(line, w / 2, h * (lines.length === 1 ? 0.5 : 0.34 + i * 0.34))
  })
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}
