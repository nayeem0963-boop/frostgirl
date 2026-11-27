// Runtime asset URLs for the expedition prototype and the dev clip viewer. The files and their hashed addresses are listed in
// src/assets/manifest.js (the loader that downloads and releases them is src/assets/index.js).
import { ASSETS as MANIFEST } from '../assets/manifest.js'

export const ASSETS = {
  aisha: MANIFEST.aisha.url,
  wolf: MANIFEST.wolf.url,
  massif: MANIFEST.massif.url,
  spruces: MANIFEST.spruces.url,
}

// Clip names baked into aisha.glb by the asset pipeline (verified on export).
export const AISHA_CLIPS = ['idle', 'walk', 'run', 'sprint', 'jump', 'land', 'slide', 'celebrate']
export const WOLF_CLIPS = ['walk', 'run']
