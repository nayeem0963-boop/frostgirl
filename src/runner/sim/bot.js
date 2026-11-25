// Auto play: a watch-only driver. It reads the same obstacle rows and orbs the renderer shows and acts ONLY through
// command(sim, cmd, true), exactly like the keyboard does, so the game it plays is the real game.
import { command, aheadOf } from './sim.js'
import { LANES } from '../config.js'

// walls and wolves block one lane; a wolf's x is still moving while it lunges, so its lane is stored on it
const laneOf = (o) => o.lane ?? LANES.indexOf(o.x)
const blocksLane = (o) => o.kind === 'wall' || o.kind === 'wolf'

export function createBot() {
  return { done: new Set() } // rows already acted on
}

/** Call once per fixed step (sim.driver). */
export function botStep(sim, bot) {
  if (sim.phase !== 'running' || sim.paused) return
  const v = sim.speed
  const near = sim.obstacles.filter((o) => o.active && aheadOf(sim, o) > -0.9)
  if (near.length) {
    const first = Math.min(...near.map((o) => aheadOf(sim, o)))
    const row = near.filter((o) => Math.abs(aheadOf(sim, o) - first) < 0.01)
    const id = row[0].id
    if (row[0].kind === 'ridge') {
      if (first <= v * 0.28 && !bot.done.has(id)) { bot.done.add(id); command(sim, 'jump', true) }
    } else if (row[0].kind === 'arch') {
      if (first <= v * 0.3 && !bot.done.has(id)) { bot.done.add(id); command(sim, 'duck', true) }
    } else if (first <= v * 1.0) {
      const blocked = new Set(row.map(laneOf))
      if (blocked.has(sim.lane)) {
        const open = [0, 1, 2].filter((l) => !blocked.has(l)).sort((a, b) => Math.abs(a - sim.lane) - Math.abs(b - sim.lane))
        command(sim, open[0] < sim.lane ? 'left' : 'right', true)
        return
      }
    }
  }
  steerToOrbs(sim)
}

/** When nothing needs dodging, drift toward the nearest orb line, but only into a lane that stays open in every wall row before it. */
function steerToOrbs(sim) {
  if (sim.laneT < 1 || sim.queued) return
  let best = null
  for (const o of sim.orbs) {
    if (!o.active || o.taken) continue
    const a = aheadOf(sim, o)
    if (a < 1.5 || a > 40) continue
    if (!best || a < best.a) best = { a, lane: LANES.indexOf(o.x), y: o.y }
  }
  if (!best || best.lane === sim.lane) return
  // every wall row up to (and just past) the orb must leave the target lane open, and so must the next wall row
  // whenever it is close enough that a dodge from the new lane would be rushed
  const next = sim.lane + Math.sign(best.lane - sim.lane) // one lane at a time: the lane in between must be safe too
  for (const o of sim.obstacles) {
    if (!o.active || !blocksLane(o) || (laneOf(o) !== best.lane && laneOf(o) !== next)) continue
    const a = aheadOf(sim, o)
    if (a > -0.9 && (a < best.a + 4 || a < sim.speed * 2.2)) return
  }
  // and the lane we leave must not be needed right now: a wall row very close in our current lane is handled above
  command(sim, best.lane < sim.lane ? 'left' : 'right', true)
}
