// Runtime asset URLs (optimised by scripts/build-expedition-assets.mjs).
const base = `${import.meta.env.BASE_URL}assets/expedition/`

export const ASSETS = {
  aisha: `${base}aisha.glb`,
  wolf: `${base}wolf.glb`,
  massif: `${base}mountain-massif.glb`,
  spruces: `${base}alpine-spruces.glb`,
}

// Clip names baked into aisha.glb by the asset pipeline (verified on export).
export const AISHA_CLIPS = ['idle', 'walk', 'run', 'sprint', 'jump', 'land', 'slide', 'celebrate']
export const WOLF_CLIPS = ['walk', 'run']
