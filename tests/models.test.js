import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'

const DIR = 'src/assets/models'
const glbJson = (path) => { const b = readFileSync(path); return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8')) }
const all = readdirSync(DIR).filter((f) => f.endsWith('.glb')).sort()
const files = all.filter((f) => f !== 'orb_of_chi.glb') // the orb is a small untextured model (checked below); the other four are the compressed, textured ones

test('the runtime models are the four the game loads, plus the orb', () => {
  assert.deepEqual(files, ['alpine-spruces.glb', 'aisha.glb', 'mountain-massif.glb', 'wolf.glb'].sort())
  assert.ok(all.includes('orb_of_chi.glb'))
})

test('every runtime model is mesh-compressed (EXT_meshopt_compression): a regenerated model must go through scripts/compress-models.mjs', () => {
  for (const f of files) {
    const j = glbJson(`${DIR}/${f}`)
    assert.ok(j.extensionsUsed?.includes('EXT_meshopt_compression'), `${f} is not compressed: run  node scripts/compress-models.mjs`)
    assert.ok(j.extensionsUsed.includes('EXT_texture_webp'), `${f} keeps its WebP textures`)
  }
})

test('the models stay within a download budget (total and each)', () => {
  const sizes = Object.fromEntries(files.map((f) => [f, statSync(`${DIR}/${f}`).size / 1048576]))
  const total = Object.values(sizes).reduce((a, b) => a + b, 0)
  assert.ok(total <= 9.5, `models total ${total.toFixed(2)} MB (budget 9.5)`)
  for (const [f, mb] of Object.entries(sizes)) assert.ok(mb <= 3.7, `${f} is ${mb.toFixed(2)} MB (budget 3.7)`)
})

test("Aisha and the wolf keep their rig and clips after compression (nothing the game plays went missing)", () => {
  const a = glbJson(`${DIR}/aisha.glb`)
  assert.deepEqual(a.animations.map((x) => x.name).sort(), ['celebrate', 'idle', 'jump', 'land', 'run', 'slide', 'sprint', 'walk'])
  assert.equal(a.skins.length, 1); assert.equal(a.skins[0].joints.length, 24)
  const w = glbJson(`${DIR}/wolf.glb`)
  assert.deepEqual(w.animations.map((x) => x.name).sort(), ['run', 'walk'])
  assert.equal(w.skins.length, 1); assert.equal(w.skins[0].joints.length, 41)
  assert.equal(glbJson(`${DIR}/mountain-massif.glb`).meshes.length, 1)
  assert.equal(glbJson(`${DIR}/alpine-spruces.glb`).meshes.length, 32)
})
