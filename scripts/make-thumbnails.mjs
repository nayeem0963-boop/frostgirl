// World-card thumbnails (Asset Management V2, Stage A). The Worlds screen only shows the top band of each painting behind a dark
// gradient, so it does not need the 300 KB full painting: this crops that band (same width, 3.6:1) and saves it at 800 px wide.
// The paintings themselves are never changed. Usage: node scripts/make-thumbnails.mjs   (needs the dev dependency sharp)
import { createRequire } from 'node:module'
import { readdirSync, mkdirSync, statSync } from 'node:fs'
const { default: sharp } = await import('sharp').catch(() => ({ default: createRequire(import.meta.url)('sharp') }))
const SRC = 'src/assets/backgrounds', OUT = 'src/assets/thumbs'
const RATIO = 3.6, WIDTH = 800, QUALITY = 72
mkdirSync(OUT, { recursive: true })
let total = 0
for (const f of readdirSync(SRC).filter((x) => x.endsWith('.webp')).sort()) {
  const id = f.match(/^world-(\d\d)-/)[1]
  const img = sharp(`${SRC}/${f}`)
  const { width } = await img.metadata()
  const out = `${OUT}/world-${id}.webp`
  await img.extract({ left: 0, top: 0, width, height: Math.round(width / RATIO) }).resize({ width: WIDTH }).webp({ quality: QUALITY, effort: 6 }).toFile(out)
  total += statSync(out).size
  console.log(`${out}  ${(statSync(out).size / 1024).toFixed(1)} KB`)
}
console.log(`total ${(total / 1024).toFixed(0)} KB`)
