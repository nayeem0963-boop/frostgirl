// The asset manifest (Asset Management V2): every model and image the runner downloads, in one place, and which world needs which.
// Each file is referenced with `new URL('./x', import.meta.url)`, so Vite copies it to /assets/<name>-<content hash>.<ext> at build time:
// a file's address changes exactly when its bytes change, which is what lets the host cache it for a year (public/_headers).
// `bytes` is the size of the file on disk (tests/assets.test.js keeps it honest); the loader uses it for progress when a server omits Content-Length.
//   type      'model' (a GLB, decoded by assets/gpu.js) or 'image' (a texture)
//   required  the run cannot start without it; an optional asset that fails to load only costs some scenery (the painted horizon)
import { runnerThemes, worldIds } from '../worlds/runnerThemes.js'

export const ASSETS = {
  aisha: { type: 'model', required: true, bytes: 1569736, url: new URL('./models/aisha.glb', import.meta.url).href },
  spruces: { type: 'model', required: true, bytes: 3676292, url: new URL('./models/alpine-spruces.glb', import.meta.url).href },
  orb: { type: 'model', required: true, bytes: 100544, url: new URL('./models/orb_of_chi.glb', import.meta.url).href },
  massif: { type: 'model', required: true, bytes: 2966912, url: new URL('./models/mountain-massif.glb', import.meta.url).href }, // World 01's 3D mountains
  wolf: { type: 'model', required: true, bytes: 1198344, url: new URL('./models/wolf.glb', import.meta.url).href }, // Worlds 02 and 07
  // the painted horizon of Worlds 02-07 (World 01 draws the 3D massif instead and never uses its painting at runtime)
  'bg-02': { type: 'image', required: false, bytes: 309152, url: new URL('./backgrounds/world-02-whispering-ice-forest.webp', import.meta.url).href },
  'bg-03': { type: 'image', required: false, bytes: 334094, url: new URL('./backgrounds/world-03-crystal-mountains.webp', import.meta.url).href },
  'bg-04': { type: 'image', required: false, bytes: 317214, url: new URL('./backgrounds/world-04-frozen-ocean.webp', import.meta.url).href },
  'bg-05': { type: 'image', required: false, bytes: 279338, url: new URL('./backgrounds/world-05-frosted-dream-desert.webp', import.meta.url).href },
  'bg-06': { type: 'image', required: false, bytes: 304366, url: new URL('./backgrounds/world-06-sky-of-aurora.webp', import.meta.url).href },
  'bg-07': { type: 'image', required: false, bytes: 329430, url: new URL('./backgrounds/world-07-celestial-ice-palace.webp', import.meta.url).href },
}

/** Small crops of each painting for the Worlds screen cards (scripts/make-thumbnails.mjs). They are plain <img>/CSS images, not managed assets. */
export const THUMBS = {
  '01': { bytes: 17956, url: new URL('./thumbs/world-01.webp', import.meta.url).href },
  '02': { bytes: 32052, url: new URL('./thumbs/world-02.webp', import.meta.url).href },
  '03': { bytes: 28582, url: new URL('./thumbs/world-03.webp', import.meta.url).href },
  '04': { bytes: 18316, url: new URL('./thumbs/world-04.webp', import.meta.url).href },
  '05': { bytes: 17994, url: new URL('./thumbs/world-05.webp', import.meta.url).href },
  '06': { bytes: 23740, url: new URL('./thumbs/world-06.webp', import.meta.url).href },
  '07': { bytes: 25374, url: new URL('./thumbs/world-07.webp', import.meta.url).href },
}

/** Needed in every world, loaded once and kept for the whole session. */
export const CORE = ['aisha', 'spruces', 'orb']

/** What a world needs beyond CORE, from its theme: the 3D massif (no painted backdrop), the wolf, the painted horizon. */
export function worldAssets(id) {
  const t = runnerThemes[id]
  if (!t) return []
  const out = []
  if (!t.backdrop) out.push('massif')
  if (t.hazards?.wolf) out.push('wolf')
  if (t.backdrop) out.push(`bg-${id}`)
  return out
}

/** Everything the run needs in world `id`. */
export const activeSet = (id) => [...CORE, ...worldAssets(id)]

/** The world that finishing `id` opens (null after the last). */
export const nextWorld = (id) => worldIds[worldIds.indexOf(id) + 1] ?? null

/** The loading plan for a world: what to load now, and what to fetch quietly for the world after it (only what is not already part of the plan). */
export function planFor(id) {
  const active = activeSet(id)
  const n = nextWorld(id)
  const prefetch = n ? worldAssets(n).filter((a) => !active.includes(a)) : []
  return { active, prefetch }
}
