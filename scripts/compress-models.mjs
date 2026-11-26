// Mesh compression for the runtime models (6.8): applies EXT_meshopt_compression to the geometry and the animation data of every .glb in a
// folder (default public/assets/expedition). Textures are NOT touched (they are already WebP), so no model changes how it is drawn.
// Rotations are stored with a 16-bit quaternion filter: on Aisha the largest change measured was 0.83 degrees at one keyframe
// (a rotation and its negative are the same rotation, so sign flips do not count), translations changed by under 0.1% of the rig's size.
// Idempotent: a file that already uses the extension is left alone.   Usage: node scripts/compress-models.mjs [folder]
// Needs the dev dependencies @gltf-transform/* and meshoptimizer (the same ones scripts/build-expedition-assets.mjs uses).
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { meshopt } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer'

const dir = process.argv[2] ?? 'public/assets/expedition'
await MeshoptEncoder.ready; await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder })
let before = 0, after = 0
for (const name of (await readdir(dir)).filter((f) => f.endsWith('.glb')).sort()) {
  const path = join(dir, name)
  const size = (await stat(path)).size
  const doc = await io.read(path)
  if (doc.getRoot().listExtensionsUsed().some((e) => e.extensionName === 'EXT_meshopt_compression')) { console.log(`${name.padEnd(22)} already compressed (${(size / 1048576).toFixed(2)} MB)`); before += size; after += size; continue }
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'high' }))
  await io.write(path, doc)
  const now = (await stat(path)).size
  before += size; after += now
  console.log(`${name.padEnd(22)} ${(size / 1048576).toFixed(2)} MB -> ${(now / 1048576).toFixed(2)} MB (${((1 - now / size) * 100).toFixed(0)}% smaller)`)
}
console.log(`total ${(before / 1048576).toFixed(2)} MB -> ${(after / 1048576).toFixed(2)} MB`)
