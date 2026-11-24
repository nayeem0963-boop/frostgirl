// Pure runner simulation (no React / three): state machine, player physics,
// obstacle pool + spawner, and collision. Fixed-step so it is deterministic.
import { LANES, PLAYER, RUN, OBSTACLES } from '../config.js'

export const STEP = 1 / 120
export const POOL = 24

export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Queue an event for the renderer and count it (counters survive for tests / stats). */
function emit(sim, name) {
  sim.events.push(name)
  sim.count[name] = (sim.count[name] ?? 0) + 1
}

export function createSim(seed = 1) {
  const sim = {
    phase: 'ready', // ready | running | gameover
    paused: false,
    seed,
    rand: mulberry32(seed),
    time: 0,
    dist: 0,
    speed: 0,
    lane: 1, // target lane index
    queued: null, // one buffered lane change (-1 / +1)
    x: 0, laneFrom: 0, laneT: 1,
    y: 0, vy: 0, grounded: true,
    duck: 0, // seconds of duck left
    landFlash: 0,
    anim: 'idle',
    nextSpawn: 0, lastLane: 1, lastKind: '', patternCount: 0,
    hit: null, // the obstacle that ended the run
    count: {}, // lifetime event counters: jump, duck, lane, land, hit, start
    events: [], // 'jump' | 'land' | 'lane' | 'duck' | 'hit' | 'start' (drained by the renderer)
    obstacles: Array.from({ length: POOL }, () => ({ active: false, kind: 'wall', x: 0, dist: 0, id: 0 })),
    nextId: 1,
  }
  return sim
}

export function startRun(sim, seed = sim.seed + 1) {
  sim.seed = seed
  sim.rand = mulberry32(seed)
  Object.assign(sim, {
    phase: 'running', paused: false, time: 0, dist: 0, speed: RUN.startSpeed,
    lane: 1, queued: null, x: 0, laneFrom: 0, laneT: 1, y: 0, vy: 0, grounded: true, duck: 0, landFlash: 0,
    anim: 'run', hit: null, lastLane: 1, lastKind: '', patternCount: 0,
    nextSpawn: RUN.startSpeed * RUN.safeSeconds + 22,
  })
  for (const o of sim.obstacles) o.active = false
  emit(sim, 'start')
}

export function resetToReady(sim) {
  startRun(sim)
  sim.phase = 'ready'
  sim.anim = 'idle'
  sim.speed = 0
  sim.events.length = 0
}

// ---- input commands ----------------------------------------------------------
export function command(sim, cmd) {
  if (sim.phase !== 'running' || sim.paused) return false
  if (cmd === 'left' || cmd === 'right') {
    const dir = cmd === 'left' ? -1 : 1
    if (sim.laneT < 0.55) { sim.queued = dir; return false } // mid-glide: buffer ONE change, no spamming
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
    if (!sim.grounded) return false
    sim.vy = PLAYER.jumpVelocity
    sim.grounded = false
    sim.duck = 0
    emit(sim, 'jump')
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

// ---- collision geometry ------------------------------------------------------
export function playerBox(sim, out = {}) {
  out.x0 = sim.x - PLAYER.halfWidth; out.x1 = sim.x + PLAYER.halfWidth
  out.z0 = -PLAYER.halfDepth; out.z1 = PLAYER.halfDepth
  out.y0 = sim.y
  out.y1 = sim.y + (sim.duck > 0 && sim.grounded ? PLAYER.duckHeight : PLAYER.standHeight)
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
function hits(sim, o, prevAhead, ahead) {
  playerBox(sim, pb)
  obstacleBox(o, ob)
  if (pb.x1 <= ob.x0 || pb.x0 >= ob.x1) return false
  if (pb.y1 <= ob.y0 || pb.y0 >= ob.y1) return false
  // obstacle z-range over the step vs the player's z-range [-halfDepth, halfDepth] (obstacle ahead = -z)
  const lo = Math.min(ahead, prevAhead) + ob.dz0
  const hi = Math.max(ahead, prevAhead) + ob.dz1
  return hi > -pb.z1 && lo < -pb.z0 // ahead is measured toward -z
}

// ---- spawner -----------------------------------------------------------------
function acquire(sim) {
  return sim.obstacles.find((o) => !o.active) ?? null
}

function spawnPattern(sim) {
  const r = sim.rand
  const n = sim.patternCount++
  const speed = sim.speed
  const reaction = Math.max(1.15, 1.7 - n * 0.02) // seconds between obstacle rows
  const at = sim.nextSpawn
  const place = (kind, lane) => {
    const o = acquire(sim)
    if (!o) return
    o.active = true; o.kind = kind; o.id = sim.nextId++
    o.x = kind === 'wall' ? LANES[lane] : 0
    o.dist = at
  }
  // First rows are gentle: single walls that leave the other lanes open.
  let kind
  const roll = r()
  if (n < 2) kind = 'wall'
  else if (roll < 0.5) kind = 'wall'
  else if (roll < 0.75) kind = sim.lastKind === 'ridge' ? 'wall' : 'ridge'
  else kind = sim.lastKind === 'arch' ? 'wall' : 'arch'
  if (kind === 'wall') {
    // one or (later) two walls; always leave at least one lane open
    const open = Math.floor(r() * 3)
    const lanes = [0, 1, 2].filter((l) => l !== open)
    const count = n > 5 && r() < 0.35 ? 2 : 1
    const pick = count === 2 ? lanes : [lanes[Math.floor(r() * lanes.length)]]
    for (const l of pick) place('wall', l)
  } else {
    place(kind, 1)
  }
  sim.lastKind = kind
  sim.nextSpawn = at + speed * reaction + 4
}

// ---- stepping ----------------------------------------------------------------
function stepPlayer(sim, dt) {
  // lane glide (smoothstep), queued change when finished enough
  if (sim.laneT < 1) {
    sim.laneT = Math.min(1, sim.laneT + dt / PLAYER.laneTime)
    const k = sim.laneT * sim.laneT * (3 - 2 * sim.laneT)
    sim.x = sim.laneFrom + (LANES[sim.lane] - sim.laneFrom) * k
  } else {
    sim.x = LANES[sim.lane]
  }
  if (sim.queued && sim.laneT >= 0.55) { const q = sim.queued; sim.queued = null; command(sim, q < 0 ? 'left' : 'right') }
  // vertical
  if (!sim.grounded) {
    sim.vy -= PLAYER.gravity * dt
    sim.y += sim.vy * dt
    if (sim.y <= 0) {
      sim.y = 0; sim.vy = 0; sim.grounded = true; sim.landFlash = 0.22
      emit(sim, 'land')
    }
  }
  if (sim.duck > 0) sim.duck = Math.max(0, sim.duck - dt)
  if (sim.landFlash > 0) sim.landFlash = Math.max(0, sim.landFlash - dt)
  sim.anim = !sim.grounded ? (sim.vy > 2 ? 'jump' : 'fall') : sim.landFlash > 0 ? 'land' : sim.duck > 0 ? 'duck' : 'run'
}

function stepOnce(sim, dt) {
  sim.time += dt
  sim.speed = Math.min(RUN.maxSpeed, sim.speed + RUN.accel * dt)
  const move = sim.speed * dt
  sim.dist += move
  stepPlayer(sim, dt)
  // spawn
  while (sim.nextSpawn - sim.dist < RUN.spawnAhead) spawnPattern(sim)
  // move + collide
  for (const o of sim.obstacles) {
    if (!o.active) continue
    const prev = o.dist - (sim.dist - move)
    const ahead = o.dist - sim.dist
    if (ahead < -RUN.despawnBehind) { o.active = false; continue }
    if (hits(sim, o, prev, ahead)) {
      sim.phase = 'gameover'; sim.anim = 'hurt'; sim.hit = { id: o.id, kind: o.kind, x: o.x, dist: o.dist }
      emit(sim, 'hit')
      return
    }
  }
}

/** Advance by `dt` seconds of real time using fixed sub-steps. */
export function update(sim, dt) {
  if (sim.paused) return
  if (sim.phase === 'running') {
    sim.acc = (sim.acc ?? 0) + Math.min(dt, 0.05)
    while (sim.acc >= STEP && sim.phase === 'running') { stepOnce(sim, STEP); sim.acc -= STEP }
  } else if (sim.phase === 'gameover') {
    sim.speed = Math.max(0, sim.speed - 40 * dt)
  }
}

/** Distance ahead of the runner (metres, + = in front) of an obstacle. */
export const aheadOf = (sim, o) => o.dist - sim.dist
