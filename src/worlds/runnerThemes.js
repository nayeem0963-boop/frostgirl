// Per-world data for the Frost runner. PURE data (no three.js, no import.meta) so the simulation and its tests can read it.
// World 01 (Frozen Kingdom) reproduces the runner's original look and generator EXACTLY: tests/worlds.test.js pins it.
//
//   sky / fog / light   what Scene renders (see src/runner/RunnerGame.jsx and the shared Sky)
//   snow                snowfall tint and flake counts (desktop / phone)
//   ground / trail      canvas-texture colours of the powder beside the trail and of the packed trail with its lane rails
//   backdrop            null = the 3D mountain massif (World 1); {crop} = the world's painting (its top part) as the horizon
//   patternWeights      multipliers (default 1) per obstacle pattern, see PATTERNS in src/runner/sim/patterns.js
//   finishDistance      metres to finish the level; difficultySeconds: run time until the generator is at full difficulty

export const PATTERN_IDS = ['wall1', 'wall2', 'ridge', 'arch', 'slalom', 'wallRidge', 'archWall', 'zigzag', 'wolf', 'wolfWall', 'wolfPair']
// `hazards`: signature hazards a world turns on (each needs its pattern weights too, see sim/patterns.js `opt`)

const WORLD_1 = {
  sky: { zenith: '#5b82b4', mid: '#9db7d4', horizon: '#dde5ee', sun: '#fff1d6' },
  fog: { color: '#c9d6e3', near: 70, far: 520 },
  light: { hemiSky: '#c4d8f0', hemiGround: '#7d8796', hemiIntensity: 1.15, ambient: '#b8c8e0', ambientIntensity: 0.15, sun: '#fff2de', sunIntensity: 2.5 },
  snow: { color: '#ffffff', count: { high: 1100, low: 500 } },
  ground: { base: '#f2f6fb', speck: [170, 195, 225], spread: [50, 40, 25] },
  trail: { base: '#d3e1f0', speck: [150, 175, 205], spread: [40, 35, 30], shade: [120, 160, 205], divider: [70, 130, 205], rail: [55, 115, 200] },
  backdrop: null,
  hazards: {},
  patternWeights: {},
  finishDistance: 1500,
  difficultySeconds: 150,
}

const world = (over) => ({
  ...WORLD_1,
  ...over,
  sky: { ...WORLD_1.sky, ...over.sky },
  fog: { ...WORLD_1.fog, ...over.fog },
  light: { ...WORLD_1.light, ...over.light },
  snow: { ...WORLD_1.snow, ...over.snow },
  ground: { ...WORLD_1.ground, ...over.ground },
  trail: { ...WORLD_1.trail, ...over.trail },
})

export const runnerThemes = {
  '01': WORLD_1,
  // Whispering Ice Forest: teal dusk, dense groves -> more slaloms
  '02': world({
    sky: { zenith: '#4d8b9c', mid: '#8cc0cc', horizon: '#d6ecee', sun: '#fff0d8' },
    fog: { color: '#bcdadd' },
    light: { hemiSky: '#b6dce2', hemiGround: '#6f8a8c', ambient: '#a8d0d4', sun: '#fff0d8' },
    snow: { color: '#f2ffff' },
    ground: { base: '#eaf7f5', speck: [160, 205, 210] },
    trail: { base: '#c9e4e4', speck: [140, 185, 190], shade: [100, 160, 165], divider: [50, 140, 150], rail: [35, 125, 140] },
    backdrop: { crop: 0.42 },
    hazards: { wolf: true }, // the wolf waits at the trail's edge, then lunges into a lane (wolf.glb)
    patternWeights: { slalom: 1.5, wall2: 1.25, wolf: 1.6, wolfWall: 1.0, wolfPair: 0.8 },
    finishDistance: 1500,
  }),
  // Crystal Mountains: violet-blue, big drops -> ridges and arches
  '03': world({
    sky: { zenith: '#6a7cc0', mid: '#a5b3e1', horizon: '#e4eaf9', sun: '#f6f0ff' },
    fog: { color: '#c8d2ee' },
    light: { hemiSky: '#c0cdf0', hemiGround: '#7b84a0', ambient: '#b4bfe6', sun: '#f4f0ff' },
    snow: { color: '#f6f8ff' },
    ground: { base: '#eef3ff', speck: [175, 190, 235] },
    trail: { base: '#d2dcf2', speck: [155, 170, 215], shade: [125, 140, 210], divider: [90, 105, 200], rail: [75, 90, 190] },
    backdrop: { crop: 0.42 },
    patternWeights: { ridge: 1.4, archWall: 1.3 },
    finishDistance: 1600,
  }),
  // Frozen Ocean: glassy cyan, wide open -> arches and wall+ridge
  '04': world({
    sky: { zenith: '#3f86ad', mid: '#86bcd6', horizon: '#d3eaf3', sun: '#f4fbff' },
    fog: { color: '#b6d9e7' },
    light: { hemiSky: '#aadbea', hemiGround: '#67868f', ambient: '#9fcfdf', sun: '#f4fbff' },
    snow: { color: '#f4ffff' },
    ground: { base: '#e7f6fb', speck: [150, 200, 220] },
    trail: { base: '#c4e3ee', speck: [130, 180, 200], shade: [90, 160, 190], divider: [40, 140, 190], rail: [20, 125, 185] },
    backdrop: { crop: 0.42 },
    patternWeights: { arch: 1.4, wallRidge: 1.3 },
    finishDistance: 1700,
  }),
  // Frosted Dream Desert: rose and peach drifts -> long gaps, ridges
  '05': world({
    sky: { zenith: '#b98ab2', mid: '#e3b9cf', horizon: '#fbe7e1', sun: '#fff0e6' },
    fog: { color: '#efd4da' },
    light: { hemiSky: '#f0cfe0', hemiGround: '#92788c', ambient: '#e6c4d8', sun: '#fff0e2' },
    snow: { color: '#fff8f5' },
    ground: { base: '#fff4f1', speck: [225, 190, 205] },
    trail: { base: '#efd6df', speck: [210, 170, 190], shade: [200, 140, 175], divider: [190, 100, 160], rail: [175, 80, 150] },
    backdrop: { crop: 0.42 },
    patternWeights: { ridge: 1.5, wall1: 1.2 },
    finishDistance: 1800,
  }),
  // Sky of Aurora: indigo night, dimmer sun -> zigzags
  '06': world({
    sky: { zenith: '#43458f', mid: '#7e86cb', horizon: '#c8d6f4', sun: '#d6e4ff' },
    fog: { color: '#9ea8d9' },
    light: { hemiSky: '#9aa8e0', hemiGround: '#5a6290', hemiIntensity: 1.05, ambient: '#8c98d6', sun: '#d6e4ff', sunIntensity: 2.1 },
    snow: { color: '#eef2ff' },
    ground: { base: '#e9eeff', speck: [150, 165, 225] },
    trail: { base: '#c6d0f0', speck: [130, 145, 205], shade: [100, 115, 200], divider: [70, 95, 210], rail: [55, 80, 205] },
    backdrop: { crop: 0.42 },
    patternWeights: { zigzag: 1.6, slalom: 1.2 },
    finishDistance: 1900,
  }),
  // Celestial Ice Palace: pale gold and blue, everything at once
  '07': world({
    sky: { zenith: '#6683c8', mid: '#a6bce8', horizon: '#eef3fd', sun: '#fff0cf' },
    fog: { color: '#d5dff5' },
    light: { hemiSky: '#c6d6f4', hemiGround: '#8591ad', ambient: '#bccbee', sun: '#fff1d2', sunIntensity: 2.7 },
    snow: { color: '#fffaf0' },
    ground: { base: '#f4f8ff', speck: [185, 205, 240] },
    trail: { base: '#d9e5f6', speck: [165, 185, 225], shade: [140, 165, 215], divider: [105, 140, 210], rail: [90, 125, 205] },
    backdrop: { crop: 0.42 },
    patternWeights: { zigzag: 1.4, archWall: 1.3, wallRidge: 1.3 },
    finishDistance: 2000,
  }),
}

export const defaultWorldId = '01'
export const worldIds = Object.keys(runnerThemes)
/** The runner theme for a world id; unknown ids fall back to World 01. */
export const themeFor = (id) => runnerThemes[id] ?? runnerThemes[defaultWorldId]
