import { runnerThemes } from './runnerThemes.js'

const background = (filename) =>
  `${import.meta.env?.BASE_URL ?? '/'}assets/backgrounds/worlds/${filename}` // (optional chaining: lets Node tests import the registry)

// The world registry: id, name, the painting shown on the world-select card and (Worlds 02-07) as the horizon, and the runner theme
// (colours, hazards, pattern weights and finish distance live in runnerThemes.js).
const world = (id, name, filename) => ({ id, name, background: background(filename), runner: runnerThemes[id] })

export const worlds = [
  world('01', 'Frozen Kingdom', 'world-01-frozen-kingdom.webp'),
  world('02', 'Whispering Ice Forest', 'world-02-whispering-ice-forest.webp'),
  world('03', 'Crystal Mountains', 'world-03-crystal-mountains.webp'),
  world('04', 'Frozen Ocean', 'world-04-frozen-ocean.webp'),
  world('05', 'Frosted Dream Desert', 'world-05-frosted-dream-desert.webp'),
  world('06', 'Sky of Aurora', 'world-06-sky-of-aurora.webp'),
  world('07', 'Celestial Ice Palace', 'world-07-celestial-ice-palace.webp'),
]
