// Balance report (6.5): runs the Auto play bot over every world and difficulty and prints how dense and how tight each level is.
// Node only, no browser. Usage: node scripts/difficulty-report.mjs [seeds=6]
// What the numbers mean (they are measurements of the generated levels and of the bot, NOT of how a person feels):
//   rows/100m    obstacle rows per 100 m: density
//   s/row        seconds of running per row (bigger = more breathing room)
//   hazard%      share of obstacles that are a world's signature hazard (wolf, shard, hole)
//   close/100m   near misses of the bot per 100 m: a proxy for how tight the passes are
//   orbs%        share of orbs the bot collected
//   done         runs finished out of runs started
import { createSim, startRun, update } from '../src/runner/sim/sim.js'
import { createBot, botStep } from '../src/runner/sim/bot.js'
import { themeFor, worldIds } from '../src/worlds/runnerThemes.js'
import { DIFFICULTY_IDS } from '../src/runner/sim/difficulty.js'

const seeds = Number(process.argv[2] ?? 6)
const HAZARD = new Set(['wolf', 'shard', 'hole'])
const rows = []
for (const id of worldIds) {
  for (const mode of DIFFICULTY_IDS) {
    let done = 0, n = 0, dist = 0, time = 0, genRows = 0, obst = 0, haz = 0, close = 0, orbs = 0, seen = 0
    for (let k = 1; k <= seeds; k++) {
      const seed = 1000 * Number(id) + k
      const s = createSim(seed, themeFor(id)); startRun(s, seed, { auto: true, difficulty: mode })
      const bot = createBot(); s.driver = (q) => botStep(q, bot)
      const ids = new Map()
      for (let t = 0; t < 600 && s.phase === 'running'; t += 1 / 60) { update(s, 1 / 60); for (const o of s.obstacles) if (o.active) ids.set(o.id, o.kind) }
      n++; if (s.phase === 'complete') done++
      dist += s.dist; time += s.time; genRows += s.gen.n; obst += ids.size
      for (const kind of ids.values()) if (HAZARD.has(kind)) haz++
      close += s.count.nearMiss ?? 0; orbs += s.orbCount; seen += s.orbsSeen
    }
    rows.push({ world: id, mode, 'rows/100m': +(genRows / dist * 100).toFixed(1), 's/row': +(time / genRows).toFixed(2), 'hazard%': +(haz / obst * 100).toFixed(0), 'close/100m': +(close / dist * 100).toFixed(2), 'orbs%': +(orbs / seen * 100).toFixed(0), done: `${done}/${n}` })
  }
}
console.table(rows)
const fails = rows.filter((r) => r.done.split('/')[0] !== r.done.split('/')[1])
if (fails.length) { console.log('The bot did NOT finish:', fails.map((r) => `${r.world}/${r.mode}`).join(', ')); process.exit(1) }
console.log('The bot finished every run.')
