// Stage C candidates (Asset Management V2): AVIF versions of the world paintings and of every texture inside the four GLB models, written
// NEXT TO the originals' extracted copies in asset-candidates/ (git-ignored; nothing under src/ or public/ is touched or replaced), plus
// asset-candidates/index.html: a side-by-side slider for every image with its size and a PSNR figure (higher is closer; above ~40 dB
// differences are rarely visible, but only your eyes decide). Resolution is never changed: a 2048 px texture stays 2048 px.
// Usage: node scripts/make-avif-candidates.mjs [quality=50]      (needs the dev dependency sharp)
import { createRequire } from 'node:module'
import { readFileSync, readdirSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
const sharp = createRequire(import.meta.url)('sharp')
const Q = Number(process.argv[2] ?? 50)
const OUT = 'asset-candidates'
mkdirSync(`${OUT}/orig`, { recursive: true }); mkdirSync(`${OUT}/avif`, { recursive: true })

function glbImages(path) {
  const b = readFileSync(path)
  const jl = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20 + jl).toString('utf8')), bin = b.subarray(20 + jl + 8)
  const use = {}
  j.materials.forEach((m) => {
    const p = m.pbrMetallicRoughness ?? {}
    if (p.baseColorTexture) use[p.baseColorTexture.index] = 'baseColor'
    if (p.metallicRoughnessTexture) use[p.metallicRoughnessTexture.index] = 'metalRough'
    if (m.normalTexture) use[m.normalTexture.index] = 'normal'
  })
  return j.images.map((im, i) => {
    const bv = j.bufferViews[im.bufferView]
    const tex = j.textures.findIndex((t) => (t.extensions?.EXT_texture_webp?.source ?? t.source) === i)
    return { role: use[tex] ?? `image${i}`, bytes: bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength) }
  })
}

const items = []
for (const f of readdirSync('src/assets/backgrounds').filter((x) => x.endsWith('.webp')).sort()) items.push({ name: f.replace('.webp', ''), group: 'World paintings', bytes: readFileSync(`src/assets/backgrounds/${f}`) })
for (const f of readdirSync('src/assets/models').filter((x) => x.endsWith('.glb') && x !== 'orb_of_chi.glb').sort()) for (const im of glbImages(`src/assets/models/${f}`)) items.push({ name: `${f.replace('.glb', '')}-${im.role}`, group: `Textures in ${f}`, bytes: im.bytes, normal: im.role === 'normal' })

const rows = []
for (const it of items) {
  const orig = sharp(it.bytes)
  const meta = await orig.metadata()
  await orig.clone().toFile(`${OUT}/orig/${it.name}.webp`)
  // normal maps keep full-resolution colour channels (4:4:4): they are data, not a picture
  const avif = await orig.clone().avif({ quality: Q, effort: 6, chromaSubsampling: it.normal ? '4:4:4' : '4:2:0' }).toBuffer()
  writeFileSync(`${OUT}/avif/${it.name}.avif`, avif)
  const a = await sharp(it.bytes).removeAlpha().raw().toBuffer(), b = await sharp(avif).removeAlpha().raw().toBuffer()
  let se = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; se += d * d }
  const psnr = 10 * Math.log10((255 * 255) / (se / a.length || 1e-9))
  rows.push({ ...it, w: meta.width, h: meta.height, before: it.bytes.length, after: avif.length, psnr })
  console.log(`${it.name.padEnd(36)} ${meta.width}x${meta.height}  ${(it.bytes.length / 1024).toFixed(0).padStart(5)} KB -> ${(avif.length / 1024).toFixed(0).padStart(5)} KB  PSNR ${psnr.toFixed(1)} dB`)
}
const total = (k) => rows.reduce((n, r) => n + r[k], 0)
console.log(`TOTAL ${(total('before') / 1048576).toFixed(2)} MB -> ${(total('after') / 1048576).toFixed(2)} MB (AVIF quality ${Q})`)

const groups = [...new Set(rows.map((r) => r.group))]
writeFileSync(`${OUT}/index.html`, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Frost: AVIF candidates</title>
<style>body{font:15px system-ui;margin:16px;background:#14181f;color:#e8eef7}h2{margin:28px 0 8px}table{border-collapse:collapse;margin:8px 0}td,th{padding:4px 10px;text-align:right;border-bottom:1px solid #2a3340}td:first-child,th:first-child{text-align:left}
.cmp{position:relative;display:inline-block;max-width:100%;margin:6px 0 2px;background:repeating-conic-gradient(#222 0 25%,#2a2a2a 0 50%) 0 0/16px 16px}.cmp img{display:block;max-width:min(92vw,900px);height:auto}.cmp .top{position:absolute;left:0;top:0;overflow:hidden;width:50%}.cmp .top img{max-width:none}
.row{margin:18px 0}.lbl{font-size:13px;opacity:.8}input[type=range]{width:min(92vw,900px)}</style>
<h1>Frost: AVIF candidates (quality ${Q})</h1><p>Left of the slider: the current WebP. Right: the AVIF candidate. Same pixel size. Normal maps are data, so judge them on the lit result in the game, not here. Total: ${(total('before') / 1048576).toFixed(2)} MB now, ${(total('after') / 1048576).toFixed(2)} MB as AVIF.</p>
${groups.map((g) => `<h2>${g}</h2><table><tr><th>image</th><th>size</th><th>now</th><th>AVIF</th><th>saves</th><th>PSNR</th></tr>${rows.filter((r) => r.group === g).map((r) => `<tr><td>${r.name}</td><td>${r.w}x${r.h}</td><td>${(r.before / 1024).toFixed(0)} KB</td><td>${(r.after / 1024).toFixed(0)} KB</td><td>${(100 - (100 * r.after) / r.before).toFixed(0)}%</td><td>${r.psnr.toFixed(1)} dB</td></tr>`).join('')}</table>`).join('')}
<h2>Side by side</h2>${rows.map((r, i) => `<div class="row"><div class="lbl">${r.name} · ${r.w}x${r.h} · ${(r.before / 1024).toFixed(0)} KB → ${(r.after / 1024).toFixed(0)} KB · ${r.psnr.toFixed(1)} dB</div><div class="cmp" id="c${i}"><img src="avif/${r.name}.avif" alt="AVIF"><div class="top"><img src="orig/${r.name}.webp" alt="current WebP" style="width:${Math.min(900, r.w)}px"></div></div><br><input type="range" min="0" max="100" value="50" oninput="const c=document.getElementById('c${i}');c.querySelector('.top').style.width=this.value+'%'"></div>`).join('')}`)
console.log(`open ${OUT}/index.html in a browser`)
