// Pure runner simulation (no React / three): state machine, player physics,
// obstacle pool + spawner, and collision. Fixed-step so it is deterministic.
import { LANES, PLAYER, RUN, OBSTACLES, ANIM, ORBS, LEVEL, WOLF, SHARD } from '../config.js'
import { starsFor } from '../progress.js'
import { nextPattern, sig, openLanes } from './patterns.js'
import { themeFor } from '../../worlds/runnerThemes.js'

export const STEP = 1 / 120
export const POOL = 24
export const DIFFICULTY_SECONDS = 150 // run time until the generator is at full difficulty

export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Run-clip playback rate for a ground speed: the stance foot keeps pace with the ground. */
export const runRate = (speed) => Math.min(ANIM.maxRate, Math.max(ANIM.minRate, speed / ANIM.strideSpeed))
/** Fraction of the ground speed the feet do NOT cover at that playback rate (0 = no sliding). */
export const footSlip = (speed) => Math.max(0, 1 - (runRate(speed) * ANIM.strideSpeed) / speed)

/** Queue an event for the renderer and count it (counters survive for tests / stats). */
function emit(sim, name) {
  sim.events.push(name)
  sim.count[name] = (sim.count[name] ?? 0) + 1
}

export function createSim(seed = 1, world = themeFor('01')) {
  return {
    world, // this world's runner data (pattern weights, finish distance, ...): src/worlds/runnerThemes.js
    phase: 'ready', // ready | running | gameover | complete (crossed the finish line)
    paused: false,
    seed,
    rand: mulberry32(seed),
    time: 0,
    dist: 0,
    speed: 0,
    lane: 1, // target lane index
    queued: null, // one buffered lane change {dir, ttl}
    x: 0, vx: 0, laneFrom: 0, laneT: 1,
    y: 0, vy: 0, grounded: true,
    airT: 0, airTotal: 0, airP: 0, // jump progress 0..1 (drives the jump pose)
    jumpBuf: 0,
    duck: 0, // seconds of duck left (collider is low while > 0)
    duckT: 0, // 0..1 eased, for the pose / lean only
    landT: 0,
    anim: 'idle',
    gen: { n: 0, history: [], lastRow: null, lastPos: 0, done: false },
    hit: null, // the obstacle that ended the run
    hitT: 0, // seconds since the hit
    knock: 0, // 0..1 eased knock-back after a hit (visual)
    count: {}, // lifetime event counters: jump, duck, lane, land, hit, start
    events: [], // 'jump' | 'land' | 'lane' | 'duck' | 'hit' | 'start'
    obstacles: Array.from({ length: POOL }, () => ({ active: false, kind: 'wall', x: 0, dist: 0, id: 0 })),
    orbs: Array.from({ length: ORBS.pool }, () => ({ active: false, taken: false, takenT: 0, x: 0, y: 0, dist: 0, id: 0 })),
    stars: 0, // set on completion: 1 to 3
    doneT: 0, // seconds since crossing the line
    orbCount: 0, // orbs collected this run
    orbsSeen: 0, // orbs spawned this run
    auto: false, // Auto play: watch-only, the bot drives (see sim/bot.js)
    driver: null, // called before every fixed step in Auto play
    nextId: 1,
  }
}

export function startRun(sim, seed = sim.seed + 1, { auto = false } = {}) {
  sim.seed = seed
  sim.auto = auto
  if (!auto) sim.driver = null
  sim.rand = mulberry32(seed)
  Object.assign(sim, {
    phase: 'running', paused: false, time: 0, dist: 0, speed: RUN.startSpeed,
    lane: 1, queued: null, x: 0, vx: 0, laneFrom: 0, laneT: 1, y: 0, vy: 0, grounded: true,
    airT: 0, airTotal: 0, airP: 0, jumpBuf: 0, duck: 0, duckT: 0, landT: 0,
    anim: 'run', hit: null, hitT: 0, knock: 0, acc: 0,
    gen: { n: 0, history: [], lastRow: null, lastPos: RUN.startSpeed * RUN.safeSeconds, done: false },
  })
  for (const o of sim.obstacles) o.active = false
  for (const o of sim.orbs) { o.active = false; o.taken = false }
  sim.orbCount = 0; sim.orbsSeen = 0; sim.stars = 0; sim.doneT = 0
  sim.events.length = 0
  emit(sim, 'start')
  fillObstacles(sim)
}

export function resetToReady(sim) {
  startRun(sim)
  sim.phase = 'ready'
  sim.anim = 'idle'
  sim.speed = 0
  sim.events.length = 0
}

// ---- input commands ----------------------------------------------------------
export function command(sim, cmd, fromBot = false) {
  if (sim.phase !== 'running' || sim.paused) return false
  if (sim.auto && !fromBot) return false // Auto play is watch-only: player input is ignored
  if (cmd === 'left' || cmd === 'right') {
    const dir = cmd === 'left' ? -1 : 1
    if (sim.laneT < 0.5) { sim.queued = { dir, ttl: PLAYER.queueTime }; return false } // mid-glide: buffer ONE change
    const next = sim.lane + dir
    if (next < 0 || next > 2) return false
    sim.laneFrom = sim.x
    sim.lane = next
    sim.laneT = 0
    sim.queued = null
    emit(sim, 'lane')
    return true
  }
  if (cmd === 'jump') {
    if (!sim.grounded) { if (sim.vy < 0) sim.jumpBuf = PLAYER.jumpBuffer; return false } // buffered; never a double jump
    launch(sim)
    return true
  }
  if (cmd === 'duck') {
    if (!sim.grounded) { sim.vy = Math.min(sim.vy, PLAYER.fastFall); return false }
    if (sim.duck > 0) return false
    sim.duck = PLAYER.duckTime
    emit(sim, 'duck')
    return true
  }
  return false
}

function launch(sim) {
  sim.vy = PLAYER.jumpVelocity
  sim.grounded = false
  sim.duck = 0
  sim.airT = 0
  const apex = (PLAYER.jumpVelocity ** 2) / (2 * PLAYER.gravityUp)
  sim.airTotal = PLAYER.jumpVelocity / PLAYER.gravityUp + Math.sqrt((2 * apex) / PLAYER.gravityDown)
  emit(sim, 'jump')
}

// ---- collision geometry ------------------------------------------------------
export function playerBox(sim, out = {}, ducked = sim.duck > 0 && sim.grounded) {
  out.x0 = sim.x - PLAYER.halfWidth; out.x1 = sim.x + PLAYER.halfWidth
  out.z0 = -PLAYER.halfDepth; out.z1 = PLAYER.halfDepth
  out.y0 = sim.y
  out.y1 = sim.y + (ducked ? PLAYER.duckHeight : PLAYER.standHeight)
  return out
}

export function obstacleBox(o, out = {}) {
  const d = OBSTACLES[o.kind]
  out.x0 = o.x - d.halfW; out.x1 = o.x + d.halfW
  out.y0 = d.y0; out.y1 = d.y1
  out.dz0 = -d.halfD; out.dz1 = d.halfD // relative to the obstacle's own z
  return out
}

const pb = {}
const ob = {}
/** Swept in z: the obstacle moved from prevAhead to ahead (distance in front of the runner) this step. */
function hits(sim, o, prevAhead, ahead, ducked) {
  playerBox(sim, pb, ducked)
  obstacleBox(o, ob)
  if (pb.x1 <= ob.x0 || pb.x0 >= ob.x1) return false
  if (pb.y1 <= ob.y0 || pb.y0 >= ob.y1) return false
  // obstacle z-range over the step vs the player's z-range [-halfDepth, halfDepth] (ahead is measured toward -z)
  const lo = Math.min(ahead, prevAhead) + ob.dz0
  const hi = Math.max(ahead, prevAhead) + ob.dz1
  return hi > -pb.z1 && lo < -pb.z0
}

/** Would standing up right now put her head into an obstacle? (keeps her crouched under an arch) */
function standBlocked(sim) {
  for (const o of sim.obstacles) {
    if (!o.active) continue
    if (hits(sim, o, o.dist - sim.dist, o.dist - sim.dist, false)) return true
  }
  return false
}

// ---- spawner -----------------------------------------------------------------
const difficulty = (sim) => Math.min(1, sim.time / (sim.world.difficultySeconds ?? DIFFICULTY_SECONDS))
const speedAt = (sim, pos) => Math.min(RUN.maxSpeed, sim.speed + (RUN.accel * Math.max(0, pos - sim.dist)) / Math.max(sim.speed, 1))

/** Fall progress of a crystal shard: 0 until it is dropFrom metres ahead, 1 once it has landed (landAt metres ahead). */
export function shardFall(ahead) {
  return Math.min(1, Math.max(0, (SHARD.dropFrom - ahead) / (SHARD.dropFrom - SHARD.landAt)))
}

/** x of a lunging wolf: waits beside the trail, runs into its lane between WOLF.lungeFrom and WOLF.lungeTo metres ahead. */
export function wolfProgress(ahead) {
  const t = Math.min(1, Math.max(0, (WOLF.lungeFrom - ahead) / (WOLF.lungeFrom - WOLF.lungeTo)))
  return t * t * (3 - 2 * t)
}
export const wolfX = (o, ahead) => { const a = o.side * WOLF.sideX; return a + (LANES[o.lane] - a) * wolfProgress(ahead) }

function place(sim, row, at) {
  const slots = row.kind === 'wall' || row.kind === 'wolf' || row.kind === 'shard' ? row.lanes : [1]
  for (const lane of slots) {
    const o = sim.obstacles.find((q) => !q.active)
    if (!o) return
    o.active = true; o.kind = row.kind; o.id = sim.nextId++
    o.lane = lane; o.side = lane === 0 ? -1 : lane === 2 ? 1 : (row.side ?? 1) // each wolf comes from its nearer edge
    o.x = row.kind === 'wall' || row.kind === 'shard' ? LANES[lane] : row.kind === 'wolf' ? o.side * WOLF.sideX : 0
    o.dist = at
    o.row = sim.gen.n
  }
}

function putOrb(sim, x, y, dist) {
  const o = sim.orbs.find((q) => !q.active)
  if (!o) return false
  Object.assign(o, { active: true, taken: false, takenT: 0, x, y, dist, id: sim.nextId++ })
  sim.orbsSeen++
  return true
}

/**
 * Orbs for the gap between two obstacle rows: a ground line in a lane that is open in both rows (so collecting it
 * never asks for anything the rows do not already ask for), and a jump arc over every fallen pine. Orbs stay at least
 * 3.2 m away from any row, so they never overlap an obstacle.
 */
function placeOrbs(sim, prevRow, prevPos, row, pos) {
  const r = sim.rand
  const from = prevPos + 3.2
  const to = pos - 3.2
  if (to - from >= (3 - 1) * ORBS.spacing && r() < ORBS.chance) {
    const both = prevRow ? openLanes(prevRow).filter((l) => openLanes(row).includes(l)) : openLanes(row) // the first line also avoids the first wall's lane
    const lanes = both.length ? both : openLanes(row)
    const lane = lanes[Math.floor(r() * lanes.length)]
    const n = Math.min(5, Math.floor((to - from) / ORBS.spacing) + 1)
    const start = from + (to - from - (n - 1) * ORBS.spacing) / 2
    for (let i = 0; i < n; i++) putOrb(sim, LANES[lane], ORBS.groundY, start + i * ORBS.spacing)
  }
  if (row.kind === 'ridge') for (const d of [-1.6, 0, 1.6]) putOrb(sim, LANES[1], ORBS.arcY, pos + d)
}

function fillObstacles(sim) {
  const g = sim.gen
  const limit = sim.world.finishDistance - LEVEL.clearance // nothing is placed closer to the finish line than this
  while (g.lastPos - sim.dist < RUN.spawnAhead && !g.done) {
    const rows = nextPattern(g, sim.rand, difficulty(sim), sim.world.patternWeights)
    for (const { row, gap } of rows) {
      const prevRow = g.lastRow
      const prevPos = g.lastPos
      const pos = prevPos + gap * speedAt(sim, prevPos)
      if (pos > limit) { g.done = true; break } // the rest of the level is a clean run-in
      g.lastPos = pos
      place(sim, row, g.lastPos)
      placeOrbs(sim, prevRow, prevPos, row, g.lastPos)
      g.history.push(sig(row)); if (g.history.length > 8) g.history.shift()
      g.lastRow = row
      g.n++
    }
  }
}

// ---- stepping ----------------------------------------------------------------
const easeOut = (t) => 1 - (1 - t) * (1 - t) * (1 - t)

function stepPlayer(sim, dt) {
  // lane glide: ease-out cubic (responsive start, settles with no overshoot)
  const prevX = sim.x
  if (sim.laneT < 1) {
    sim.laneT = Math.min(1, sim.laneT + dt / PLAYER.laneTime)
    sim.x = sim.laneFrom + (LANES[sim.lane] - sim.laneFrom) * easeOut(sim.laneT)
  } else {
    sim.x = LANES[sim.lane]
  }
  sim.vx = (sim.x - prevX) / dt
  if (sim.queued) {
    sim.queued.ttl -= dt
    if (sim.queued.ttl <= 0) sim.queued = null
    else if (sim.laneT >= 0.5) { const q = sim.queued.dir; sim.queued = null; command(sim, q < 0 ? 'left' : 'right', true) }
  }
  // vertical
  if (!sim.grounded) {
    sim.vy -= (sim.vy > 0 ? PLAYER.gravityUp : PLAYER.gravityDown) * dt
    sim.y += sim.vy * dt
    sim.airT += dt
    sim.airP = Math.min(1, sim.airT / sim.airTotal)
    if (sim.y <= 0) {
      sim.y = 0; sim.vy = 0; sim.grounded = true; sim.airP = 0; sim.landT = PLAYER.landTime
      emit(sim, 'land')
      if (sim.jumpBuf > 0) { sim.jumpBuf = 0; launch(sim) }
    }
  }
  if (sim.jumpBuf > 0) sim.jumpBuf = Math.max(0, sim.jumpBuf - dt)
  if (sim.duck > 0) {
    sim.duck = Math.max(0, sim.duck - dt)
    if (sim.duck === 0 && standBlocked(sim)) sim.duck = 0.04 // never stand up into an arch
  }
  sim.duckT += ((sim.duck > 0 && sim.grounded ? 1 : 0) - sim.duckT) * Math.min(1, dt * (sim.duck > 0 ? 24 : 14))
  if (sim.landT > 0) sim.landT = Math.max(0, sim.landT - dt)
  sim.anim = !sim.grounded ? 'air' : sim.duck > 0 ? 'duck' : sim.landT > 0 ? 'land' : 'run'
}

const ob2 = {}
/** Orbs are swept in z like obstacles; the body box (standing or ducked, in the air or not) must touch the orb's box. */
function collectOrbs(sim, move) {
  playerBox(sim, ob2)
  for (const o of sim.orbs) {
    if (!o.active) continue
    const ahead = o.dist - sim.dist
    if (o.taken) { o.takenT += STEP; if (o.takenT >= ORBS.popTime) o.active = false; continue }
    if (ahead < -RUN.despawnBehind) { o.active = false; continue }
    if (ob2.x1 <= o.x - ORBS.radius || ob2.x0 >= o.x + ORBS.radius) continue
    if (ob2.y1 <= o.y - ORBS.radius || ob2.y0 >= o.y + ORBS.radius) continue
    const lo = ahead - ORBS.radius
    const hi = ahead + move + ORBS.radius
    if (hi > -ob2.z1 && lo < -ob2.z0) { o.taken = true; o.takenT = 0; sim.orbCount++; emit(sim, 'orb') }
  }
}

function stepOnce(sim, dt) {
  sim.time += dt
  sim.speed = Math.min(RUN.maxSpeed, sim.speed + RUN.accel * dt)
  const move = sim.speed * dt
  sim.dist += move
  stepPlayer(sim, dt)
  fillObstacles(sim)
  collectOrbs(sim, move)
  const ducked = sim.duck > 0 && sim.grounded
  for (const o of sim.obstacles) {
    if (!o.active) continue
    const prev = o.dist - (sim.dist - move)
    const ahead = o.dist - sim.dist
    if (ahead < -RUN.despawnBehind) { o.active = false; continue }
    if (o.kind === 'wolf') o.x = wolfX(o, ahead) // the collider follows the visible wolf
    if (hits(sim, o, prev, ahead, ducked)) {
      sim.phase = 'gameover'; sim.anim = 'hurt'; sim.hit = { id: o.id, kind: o.kind, x: o.x, dist: o.dist }
      sim.hitT = 0; sim.vx = 0
      emit(sim, 'hit')
      return
    }
  }
  if (sim.dist >= sim.world.finishDistance) {
    sim.phase = 'complete'; sim.anim = 'run'; sim.doneT = 0; sim.queued = null
    sim.stars = starsFor(sim.orbCount, sim.orbsSeen)
    emit(sim, 'complete')
  }
}

/** Advance by `dt` seconds of real time using fixed sub-steps. */
export function update(sim, dt) {
  if (sim.paused) return
  if (sim.phase === 'running') {
    sim.acc = (sim.acc ?? 0) + Math.min(dt, 0.05)
    while (sim.acc >= STEP && sim.phase === 'running') { if (sim.driver) sim.driver(sim); stepOnce(sim, STEP); sim.acc -= STEP }
  } else if (sim.phase === 'complete') {
    // coast to a stop past the line, then celebrate (the world keeps scrolling while she slows; nothing is left to hit)
    const d = Math.min(dt, 0.05)
    sim.doneT += d
    sim.speed = Math.max(0, sim.speed - LEVEL.stopDecel * d)
    sim.dist += sim.speed * d
    if (!sim.grounded) { sim.vy -= PLAYER.gravityDown * d; sim.y = Math.max(0, sim.y + sim.vy * d); if (sim.y === 0) { sim.grounded = true; sim.vy = 0 } }
    sim.anim = sim.speed > 2 || !sim.grounded ? 'run' : 'celebrate'
  } else if (sim.phase === 'gameover') {
    // the world stays where the collision happened; Aisha is knocked back (visual) and the speed readout winds down
    const d = Math.min(dt, 0.05)
    sim.hitT += d
    sim.knock = easeOut(Math.min(1, sim.hitT / 0.4))
    sim.speed = Math.max(0, sim.speed - 60 * d)
    if (!sim.grounded) { sim.vy -= PLAYER.gravityDown * d; sim.y = Math.max(0, sim.y + sim.vy * d); if (sim.y === 0) { sim.grounded = true; sim.vy = 0 } }
  }
}

/** Distance ahead of the runner (metres, + = in front) of an obstacle. */
export const aheadOf = (sim, o) => o.dist - sim.dist
