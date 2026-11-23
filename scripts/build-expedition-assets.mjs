#!/usr/bin/env node
/**
 * Frost expedition asset pipeline.
 *
 * Converts the large source GLBs in `assets-source/` (kept out of Git) into
 * small, web-ready runtime GLBs in `public/assets/expedition/`.
 *
 *   node scripts/build-expedition-assets.mjs [path/to/assets-source] [only]
 *
 * `only` can be one of: aisha, wolf, massif, spruces (default: all).
 *
 * What it does:
 *  - Aisha: takes the skinned mesh from Aisha_Idle.glb, merges every clip
 *    from the seven animation exports into it (remapping the Mixamo bone
 *    names of the Walking/Running export onto the Meshy skeleton), decimates
 *    the mesh and shrinks textures to 1K WebP.
 *  - Wolf: keeps the rigged mesh with its Walking/Running clips, 1K WebP.
 *  - Mountain massif: decimation + WebP textures.
 *  - Spruces: individual trees cut from the Meshy forest scan, 3 LODs each.
 */
import fs from 'node:fs'
import path from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import {
  dedup, prune, weld, simplify, textureCompress, resample, quantize,
} from '@gltf-transform/functions'
import { MeshoptSimplifier } from 'meshoptimizer'
import sharp from 'sharp'

const SOURCE = path.resolve(process.argv[2] || 'assets-source')
const ONLY = process.argv[3]
const OUT = path.resolve('public/assets/expedition')
fs.mkdirSync(OUT, { recursive: true })

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
await MeshoptSimplifier.ready

const src = (...p) => path.join(SOURCE, ...p)
const triangles = (doc) => doc.getRoot().listMeshes().reduce((sum, mesh) =>
  sum + mesh.listPrimitives().reduce((s, prim) =>
    s + (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION').getCount()) / 3, 0), 0)

async function finish(doc, name, { ratio, error = 0.001, size = 1024 }) {
  const before = triangles(doc)
  const steps = [dedup(), weld()]
  if (ratio && ratio < 1) steps.push(simplify({ simplifier: MeshoptSimplifier, ratio, error }))
  steps.push(
    resample(),
    prune({ keepAttributes: false }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size], quality: 82 }),
    quantize({ quantizeNormal: 10, quantizeTexcoord: 14 }),
  )
  await doc.transform(...steps)
  const file = path.join(OUT, name)
  await io.write(file, doc)
  const kb = (fs.statSync(file).size / 1024).toFixed(0)
  const clips = doc.getRoot().listAnimations().map((a) => a.getName())
  console.log(`${name}: ${Math.round(before)} -> ${Math.round(triangles(doc))} tris, ${kb} KB, clips [${clips.join(', ')}]`)
}

/** Copy one animation from another document onto nodes (matched by name). */
function copyAnimation(target, sourceAnim, clipName, mapName = (n) => n) {
  const nodesByName = new Map(target.getRoot().listNodes().map((n) => [n.getName(), n]))
  const anim = target.createAnimation(clipName)
  const buffer = target.getRoot().listBuffers()[0]
  let missing = 0
  for (const channel of sourceAnim.listChannels()) {
    const srcNode = channel.getTargetNode()
    const node = nodesByName.get(mapName(srcNode.getName()))
    if (!node) { missing++; continue }
    const s = channel.getSampler()
    const input = target.createAccessor().setType('SCALAR').setArray(s.getInput().getArray().slice()).setBuffer(buffer)
    const output = target.createAccessor().setType(s.getOutput().getType())
      .setArray(s.getOutput().getArray().slice()).setBuffer(buffer)
    const sampler = target.createAnimationSampler().setInput(input).setOutput(output)
      .setInterpolation(s.getInterpolation())
    anim.addSampler(sampler).addChannel(
      target.createAnimationChannel().setTargetNode(node).setTargetPath(channel.getTargetPath()).setSampler(sampler),
    )
  }
  if (missing) console.warn(`  ${clipName}: ${missing} channels had no matching bone`)
}

// Mixamo export (Walking/Running) -> Meshy skeleton used by every other export.
// Matched by hierarchy, not by name: Meshy's spine chain is
// Hips > Spine02 > Spine01 > Spine, the reverse of Mixamo's numbering.
const MIXAMO_TO_MESHY = {
  'mixamorig:HeadTop_End': 'head_end', 'mixamorig:Neck': 'neck',
  'mixamorig:Spine': 'Spine02', 'mixamorig:Spine1': 'Spine01', 'mixamorig:Spine2': 'Spine',
}
const fromMixamo = (n) => MIXAMO_TO_MESHY[n] ?? n.replace(/^mixamorig:/, '')

async function buildAisha() {
  const doc = await io.read(src('aisha/animations/Aisha_Idle.glb'))
  doc.getRoot().listAnimations().forEach((a) => a.setName('idle'))
  const exports = [
    ['aisha/Meshy_AI_Aisha_Rigged_20261122_animated_mixamo_All_animation.glb', { Walking: 'walk', Running: 'run' }, fromMixamo],
    ['aisha/animations/Aisha_Sprint.glb', { run_fast_5: 'sprint' }],
    ['aisha/animations/Aisha_Jump.glb', { 'Armature|Jump_Over_Obstacle_inplace|baselayer': 'jump' }],
    ['aisha/animations/Aisha_Landing_REPAIRED.glb', { 'Armature|Regular_Jump|baselayer': 'land' }],
    ['aisha/animations/Aisha_Slide.glb', { 'Armature|slide_right|baselayer': 'slide' }],
    ['aisha/animations/Aisha_Celebration.glb', { 'Armature|Victory_Cheer|baselayer': 'celebrate' }],
  ]
  for (const [file, names, mapName] of exports) {
    const other = await io.read(src(file))
    for (const anim of other.getRoot().listAnimations()) {
      const clip = names[anim.getName()]
      if (!clip) { console.warn(`  skipping unexpected clip ${anim.getName()} in ${file}`); continue }
      copyAnimation(doc, anim, clip, mapName)
    }
  }
  // Sprint and slide were exported with ~4 m of forward root motion on the
  // hips. The game drives movement itself, so remove the linear drift.
  for (const anim of doc.getRoot().listAnimations()) {
    if (!['sprint', 'slide'].includes(anim.getName())) continue
    for (const channel of anim.listChannels()) {
      if (channel.getTargetNode().getName() !== 'Hips' || channel.getTargetPath() !== 'translation') continue
      const input = channel.getSampler().getInput()
      const output = channel.getSampler().getOutput()
      const n = output.getCount()
      const t0 = input.getScalar(0)
      const t1 = input.getScalar(n - 1)
      const z0 = output.getElement(0, [])[2]
      const z1 = output.getElement(n - 1, [])[2]
      for (let i = 0; i < n; i++) {
        const v = output.getElement(i, [])
        v[2] -= (z1 - z0) * (input.getScalar(i) - t0) / (t1 - t0)
        output.setElement(i, v)
      }
    }
  }
  await finish(doc, 'aisha.glb', { ratio: 0.28, error: 0.002, size: 1024 })
}

async function buildWolf() {
  const doc = await io.read(src('natures/animated/Meshy_AI_frost_wolf_rigged_20261123_animated_All_animation.glb'))
  for (const a of doc.getRoot().listAnimations()) a.setName({ Walking: 'walk', Running: 'run' }[a.getName()] ?? a.getName())
  await finish(doc, 'wolf.glb', { size: 1024 })
}

async function buildMassif() {
  const doc = await io.read(src('natures/frost_mountain_massif.glb'))
  await finish(doc, 'mountain-massif.glb', { ratio: 0.06, error: 0.004, size: 2048 })
}

/**
 * Individual spruces cut out of the Meshy forest scan.
 *
 * The scan is one fused mesh: a snow mound with ~9 spruces on it. We find
 * each tree's crown (local height maxima), drop the mound, assign every
 * remaining triangle to the nearest crown, and export each tree normalised
 * to height 1 with its trunk base at the origin, in two LODs:
 *   spruce<i>_lod0 (~8k tris), _lod1 (~1.8k), _lod2 (~340), _lod3 (~90).
 * All trees share one material and texture.
 */
async function buildSpruces() {
  const doc = await io.read(src('natures/alpine_winter_forest_.glb'))
  await doc.transform(dedup(), weld())
  const root = doc.getRoot()
  const srcMesh = root.listMeshes()[0]
  const srcPrim = srcMesh.listPrimitives()[0]
  const material = srcPrim.getMaterial()
  const P = srcPrim.getAttribute('POSITION').getArray()
  const N = srcPrim.getAttribute('NORMAL')?.getArray()
  const UV = srcPrim.getAttribute('TEXCOORD_0').getArray()
  const I = srcPrim.getIndices().getArray()
  const triCount = I.length / 3

  // Height maps over the scan footprint (x,z in [-1, 1]).
  const G = 96
  const cell = (v) => Math.min(G - 1, Math.max(0, Math.floor((v + 1) / 2 * G)))
  const top = new Float32Array(G * G).fill(-Infinity)
  const bottom = new Float32Array(G * G).fill(Infinity)
  const cx = new Float32Array(triCount)
  const cy = new Float32Array(triCount)
  const cz = new Float32Array(triCount)
  for (let t = 0; t < triCount; t++) {
    const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3
    cx[t] = (P[a] + P[b] + P[c]) / 3
    cy[t] = (P[a + 1] + P[b + 1] + P[c + 1]) / 3
    cz[t] = (P[a + 2] + P[b + 2] + P[c + 2]) / 3
    const k = cell(cz[t]) * G + cell(cx[t])
    if (cy[t] > top[k]) top[k] = cy[t]
    if (cy[t] < bottom[k]) bottom[k] = cy[t]
  }
  // Smoothed ground: lowest surface in a neighbourhood (trunks punch through it).
  const ground = new Float32Array(G * G)
  for (let z = 0; z < G; z++) for (let x = 0; x < G; x++) {
    let m = Infinity
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const zz = z + dz, xx = x + dx
      if (zz >= 0 && zz < G && xx >= 0 && xx < G) m = Math.min(m, bottom[zz * G + xx])
    }
    ground[z * G + x] = m
  }
  // Crowns: local maxima clearly above the ground.
  const peaks = []
  for (let z = 0; z < G; z++) for (let x = 0; x < G; x++) {
    const k = z * G + x
    const h = top[k] - ground[k]
    if (!(h > 0.3)) continue
    let isMax = true
    for (let dz = -6; dz <= 6 && isMax; dz++) for (let dx = -6; dx <= 6; dx++) {
      const zz = z + dz, xx = x + dx
      if ((dx || dz) && zz >= 0 && zz < G && xx >= 0 && xx < G && top[zz * G + xx] > top[k]) { isMax = false; break }
    }
    if (isMax) peaks.push({ x: (x + 0.5) / G * 2 - 1, z: (z + 0.5) / G * 2 - 1, top: top[k], ground: ground[k], h, tris: [] })
  }
  peaks.sort((a, b) => b.h - a.h)
  console.log(`  found ${peaks.length} crowns:`, peaks.map((p) => p.h.toFixed(2)).join(' '))

  // Assign triangles to crowns; drop the mound and stray scraps.
  for (let t = 0; t < triCount; t++) {
    const g = ground[cell(cz[t]) * G + cell(cx[t])]
    if (cy[t] < g + 0.02) continue
    let best = null
    let bd = Infinity
    for (const p of peaks) {
      const d = Math.hypot(cx[t] - p.x, cz[t] - p.z) / (0.35 + p.h)
      if (d < bd) { bd = d; best = p }
    }
    const radial = Math.hypot(cx[t] - best.x, cz[t] - best.z)
    if (radial > best.h * 0.42 + 0.03) continue
    // Low, wide surfaces around the trunk are the snow mound, not branches.
    if (cy[t] < best.ground + best.h * 0.1 && radial > best.h * 0.045) continue
    best.tris.push(t)
  }

  const buffer = root.listBuffers()[0]
  const scene = root.listScenes()[0]
  for (const n of scene.listChildren()) n.dispose()
  // The smallest crown sits in a rock outcrop; keep the eight clean spruces.
  const keep = peaks.filter((p) => p.tris.length > 20000 && p.h > 0.6)
  keep.forEach((p, ti) => {
    // Trunk base: lowest geometry right next to the trunk axis. Trees on the
    // scan's raised mound sit well above the smoothed ground estimate.
    let base = Infinity
    for (const t of p.tris) {
      if (Math.hypot(cx[t] - p.x, cz[t] - p.z) < p.h * 0.03) base = Math.min(base, cy[t])
    }
    if (!Number.isFinite(base)) base = p.ground
    p.ground = Math.max(p.ground, base)
    // Drop leftover mound: anything below the trunk base, or low and wide.
    p.tris = p.tris.filter((t) => {
      const rel = cy[t] - p.ground
      const radial = Math.hypot(cx[t] - p.x, cz[t] - p.z)
      return rel > -0.01 && !(rel < p.h * 0.12 && radial > p.h * 0.05)
    })
    // Compact this tree's vertices, normalise to height 1, base at origin.
    const remap = new Map()
    const idx = new Uint32Array(p.tris.length * 3)
    const pos = []
    const nor = []
    const uv = []
    const h = p.top - p.ground
    let o = 0
    for (const t of p.tris) for (let k = 0; k < 3; k++) {
      const v = I[t * 3 + k]
      let nv = remap.get(v)
      if (nv === undefined) {
        nv = remap.size
        remap.set(v, nv)
        pos.push((P[v * 3] - p.x) / h, (P[v * 3 + 1] - p.ground) / h, (P[v * 3 + 2] - p.z) / h)
        if (N) nor.push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2])
        uv.push(UV[v * 2], UV[v * 2 + 1])
      }
      idx[o++] = nv
    }
    const posArr = new Float32Array(pos)
    const lods = [
      { name: 'lod0', target: 8000 }, // close: beside the trail (< ~18 m)
      { name: 'lod1', target: 1800 }, // near: < ~55 m
      { name: 'lod2', target: 340, silhouette: true }, // mid: valley forest
      { name: 'lod3', target: 90, silhouette: true }, // far: distant slopes
    ]
    for (const lod of lods) {
      // UV-aware so collapses across texture seams don't smear the bark/needles.
      const uvArr = new Float32Array(uv)
      // Distant LODs only need the silhouette: plain geometric simplification.
      let [out] = lod.silhouette
        ? MeshoptSimplifier.simplify(idx, posArr, 3, lod.target * 3, 0.08, ['Permissive', 'Prune'])
        : MeshoptSimplifier.simplifyWithAttributes(idx, posArr, 3, uvArr, 2, [2.5, 2.5], null, lod.target * 3, 0.08, ['Permissive', 'Prune'])
      if (out.length / 3 > lod.target * 1.3) [out] = MeshoptSimplifier.simplifySloppy(idx, posArr, 3, null, lod.target * 3, 0.2)
      const prim = doc.createPrimitive()
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(posArr.slice()).setBuffer(buffer))
        .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(uv)).setBuffer(buffer))
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(out)).setBuffer(buffer))
        .setMaterial(material)
      if (N) prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(nor)).setBuffer(buffer))
      const mesh = doc.createMesh(`spruce${ti}_${lod.name}`).addPrimitive(prim)
      scene.addChild(doc.createNode(`spruce${ti}_${lod.name}`).setMesh(mesh).setExtras({ sourceHeight: h, sourceTris: p.tris.length }))
      console.log(`  spruce${ti}_${lod.name}: ${p.tris.length} -> ${out.length / 3} tris (height ${h.toFixed(2)})`)
    }
  })
  srcMesh.dispose()
  await doc.transform(prune({ keepAttributes: false }))
  await finish(doc, 'alpine-spruces.glb', { size: 2048 })
}

const jobs = { aisha: buildAisha, wolf: buildWolf, massif: buildMassif, spruces: buildSpruces }
for (const [name, job] of Object.entries(jobs)) {
  if (!ONLY || ONLY === name) await job()
}
