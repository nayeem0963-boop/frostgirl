#!/usr/bin/env node
/**
 * Frost expedition asset pipeline.
 *
 * Converts the large source GLBs in `assets-source/` (kept out of Git) into
 * small, web-ready runtime GLBs in `public/assets/expedition/`.
 *
 *   node scripts/build-expedition-assets.mjs [path/to/assets-source] [only]
 *
 * `only` can be one of: aisha, wolf, massif, forest (default: all).
 *
 * What it does:
 *  - Aisha: takes the skinned mesh from Aisha_Idle.glb, merges every clip
 *    from the seven animation exports into it (remapping the Mixamo bone
 *    names of the Walking/Running export onto the Meshy skeleton), decimates
 *    the mesh and shrinks textures to 1K WebP.
 *  - Wolf: keeps the rigged mesh with its Walking/Running clips, 1K WebP.
 *  - Mountain massif / snow pine forest: heavy decimation + WebP textures.
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
 * The scanned forest is millions of tiny UV islands, so topology-preserving
 * simplification stalls at ~18%. Use meshopt's "sloppy" simplifier, which
 * ignores seams, to reach a midground-friendly triangle budget.
 */
function sloppySimplify(doc, targetTriangles) {
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION').getArray()
      const indices = prim.getIndices()
      const index = new Uint32Array(indices.getArray())
      const [out] = MeshoptSimplifier.simplifySloppy(index, pos, 3, null, targetTriangles * 3, 0.02)
      indices.setArray(new Uint32Array(out))
    }
  }
}

async function buildForest() {
  const doc = await io.read(src('natures/alpine_winter_forest_.glb'))
  await doc.transform(dedup(), weld())
  sloppySimplify(doc, 36000)
  await finish(doc, 'snow-pine-forest.glb', { size: 1024 })
}

const jobs = { aisha: buildAisha, wolf: buildWolf, massif: buildMassif, forest: buildForest }
for (const [name, job] of Object.entries(jobs)) {
  if (!ONLY || ONLY === name) await job()
}
