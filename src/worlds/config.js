import { runnerThemes } from './runnerThemes.js'
import { ASSETS, THUMBS } from '../assets/manifest.js'

// The world registry: id, name, the card thumbnail for the world-select screen, the full painting used as the horizon of Worlds 02-07
// (null for World 01, which draws the 3D massif), and the runner theme (colours, hazards, pattern weights and finish distance live in
// runnerThemes.js). The files and their hashed addresses are listed in src/assets/manifest.js.
const world = (id, name) => ({ id, name, thumb: THUMBS[id].url, background: ASSETS[`bg-${id}`]?.url ?? null, runner: runnerThemes[id] })

export const worlds = [
  world('01', 'Frozen Kingdom'),
  world('02', 'Whispering Ice Forest'),
  world('03', 'Crystal Mountains'),
  world('04', 'Frozen Ocean'),
  world('05', 'Frosted Dream Desert'),
  world('06', 'Sky of Aurora'),
  world('07', 'Celestial Ice Palace'),
]
