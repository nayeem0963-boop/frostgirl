// The three.js half of the asset manager: turn downloaded bytes into a glTF scene or a texture, and free them again.
import { SRGBColorSpace, Texture } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

let gltfLoader = null

/** bytes -> { scene, animations, ... } (a model) or a Texture (an image). Same shapes drei's useGLTF / useTexture returned. */
export async function decode(id, bytes, meta) {
  if (meta.type === 'model') {
    gltfLoader ??= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder) // models are meshopt-compressed (scripts/compress-models.mjs)
    return gltfLoader.parseAsync(bytes, '')
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const t = new Texture(img)
    t.colorSpace = SRGBColorSpace
    t.needsUpdate = true
    return t
  } finally { URL.revokeObjectURL(url) }
}

function disposeTexture(t) {
  t.dispose() // frees the GPU copy
  t.source?.data?.close?.() // an ImageBitmap also holds memory of its own
}

/** Free the GPU (and decoded-image) memory of a glTF or a texture: every geometry, material, texture and skeleton under it. */
export function dispose(value) {
  if (!value) return
  if (value.isTexture) return disposeTexture(value)
  const done = new Set()
  value.scene?.traverse((o) => {
    o.geometry?.dispose()
    o.skeleton?.dispose?.()
    for (const m of [].concat(o.material ?? [])) {
      if (done.has(m)) continue
      done.add(m)
      for (const v of Object.values(m)) if (v?.isTexture && !done.has(v)) { done.add(v); disposeTexture(v) }
      m.dispose()
    }
  })
}
