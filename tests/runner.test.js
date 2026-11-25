import test from 'node:test'
import assert from 'node:assert/strict'
import { createSim, startRun, update, command, STEP, aheadOf, resetToReady, runRate, footSlip, playerBox, DIFFICULTY_SECONDS } from '../src/runner/sim/sim.js'
import { classifySwipe, KEYMAP } from '../src/runner/sim/input.js'
import { cameraFor, cameraTarget } from '../src/runner/sim/camera.js'
import { minGap, openLanes, worstShift, baseGap } from '../src/runner/sim/patterns.js'
import { LANES, PLAYER, OBSTACLES, RUN, ANIM, ORBS } from '../src/runner/config.js'
import { createBot, botStep } from '../src/runner/sim/bot.js'
import { scatterTrees, TREE_MIN_X } from '../src/runner/scene/scenery.js'

const run = (sim, seconds) => { for (let t = 0; t < seconds; t += 1 / 60) update(sim, 1 / 60) }
function started(seed = 1) { const s = createSim(seed); startRun(s); return s }
function put(sim, kind, lane, ahead) {
  const o = sim.obstacles.find((x) => !x.active)
  Object.assign(o, { active: true, kind, x: kind === 'wall' ? LANES[lane] : 0, dist: sim.dist + ahead, id: 999 })
  return o
}
const clearObstacles = (s) => { for (const o of s.obstacles) o.active = false; for (const o of s.orbs) o.active = false; s.gen.lastPos = 1e9 }
const putOrbAt = (sim, lane, y, ahead) => { const o = sim.orbs.find((q) => !q.active); Object.assign(o, { active: true, taken: false, takenT: 0, x: LANES[lane], y, dist: sim.dist + ahead, id: 777 }); return o }
const laneOf = (o) => LANES.indexOf(o.x)

// The real Auto play bot (sim/bot.js): it acts only through command(), so surviving proves the generated patterns are playable.
function botRun(seed, seconds) {
  const s = createSim(seed)
  startRun(s, seed, { auto: true })
  const bot = createBot()
  s.driver = (q) => botStep(q, bot)
  for (let t = 0; t < seconds && s.phase === 'running'; t += 1 / 60) update(s, 1 / 60)
  return s
}

test('game does not run before start', () => {
  const s = createSim()
  assert.equal(s.phase, 'ready')
  run(s, 2)
  assert.equal(s.dist, 0)
  assert.equal(command(s, 'jump'), false)
})

// ---- lanes -------------------------------------------------------------------
test('lane changes: left/right, clamped to three lanes', () => {
  const s = started(); clearObstacles(s)
  assert.equal(command(s, 'left'), true)
  run(s, 0.05)
  assert.ok(s.x < 0 && s.x > LANES[0], 'mid-glide')
  run(s, 0.3)
  assert.equal(s.x, LANES[0])
  assert.equal(command(s, 'left'), false, 'cannot leave the left lane')
  command(s, 'right'); run(s, 0.3); command(s, 'right'); run(s, 0.3)
  assert.equal(s.x, LANES[2])
  assert.equal(command(s, 'right'), false)
})

test('lane glide: monotonic, finishes in laneTime, never overshoots the lane', () => {
  for (const [from, dir] of [[1, 'left'], [1, 'right'], [0, 'right'], [2, 'left']]) {
    const s = started(); clearObstacles(s)
    s.lane = from; s.x = LANES[from]; s.laneFrom = s.x
    const target = LANES[from + (dir === 'left' ? -1 : 1)]
    command(s, dir)
    let last = s.x, t = 0
    while (s.laneT < 1 && t < 1) { update(s, STEP); t += STEP; assert.ok(dir === 'left' ? s.x <= last + 1e-9 : s.x >= last - 1e-9, 'monotonic'); assert.ok(dir === 'left' ? s.x >= target - 1e-9 : s.x <= target + 1e-9, 'no overshoot'); last = s.x }
    assert.ok(Math.abs(t - PLAYER.laneTime) < 0.03, `took ${t}s`)
    assert.equal(s.x, target)
    assert.equal(s.vx !== undefined, true)
  }
})

test('lane spam is buffered to one change and expires', () => {
  const s = started(); clearObstacles(s)
  command(s, 'right')
  for (let i = 0; i < 6; i++) command(s, 'right')
  run(s, 0.6)
  assert.equal(s.lane, 2, 'clamped, no extra skipping')
  const t = started(); clearObstacles(t)
  command(t, 'left'); command(t, 'right') // right pressed mid-glide is buffered...
  assert.ok(t.queued)
  run(t, PLAYER.queueTime + 0.3)
  assert.equal(t.queued, null)
  assert.ok(t.lane === 0 || t.lane === 1)
  const u = started(); clearObstacles(u)
  command(u, 'left'); command(u, 'left'); command(u, 'left')
  run(u, 0.6)
  assert.equal(u.lane, 0)
})

test('queued lane change fires once the glide is half done', () => {
  const s = started(); clearObstacles(s)
  command(s, 'left'); command(s, 'right')
  run(s, 0.5)
  assert.equal(s.lane, 1, 'left then right ends back in the centre')
})

test('collision tracks the player during a lane transition', () => {
  // a wall in the left lane: gliding left partially (x between lanes) overlaps its edge
  const a = started(); clearObstacles(a)
  const w = put(a, 'wall', 0, 30)
  command(a, 'left')
  while (aheadOf(a, w) > 1) update(a, STEP)
  assert.equal(a.phase === 'running' ? a.laneT : 1, 1, 'glide already finished well before the wall')
  // now inside the wall lane -> hit
  run(a, 1)
  assert.equal(a.phase, 'gameover')
  // wall in the left lane while we only glide for a moment: x is mid-way at the pass time
  const b = started(); clearObstacles(b)
  const w2 = put(b, 'wall', 0, 8)
  b.speed = 9
  while (aheadOf(b, w2) > 0.9) update(b, STEP) // wall about to reach the player
  command(b, 'left')
  run(b, 0.2)
  assert.equal(b.phase, 'gameover', 'a late dodge into the wall lane is a hit')
  // and a timely dodge away from a centre wall is not
  const c = started(); clearObstacles(c)
  const w3 = put(c, 'wall', 1, 8)
  while (aheadOf(c, w3) > 4) update(c, STEP)
  command(c, 'right')
  run(c, 2)
  assert.equal(c.phase, 'running')
  // the collision box follows the glide x exactly
  const d = started(); clearObstacles(d)
  command(d, 'right'); run(d, 0.05)
  const box = playerBox(d)
  assert.ok(Math.abs((box.x0 + box.x1) / 2 - d.x) < 1e-9)
  assert.ok(d.x > 0 && d.x < LANES[2])
})

// ---- jump --------------------------------------------------------------------
test('jump: ~1.7 m apex, ~0.57 s, lands, no double jump', () => {
  const s = started(); clearObstacles(s)
  assert.ok(command(s, 'jump'))
  let peak = 0, air = 0, lastP = 0
  while (!s.grounded && air < 2) { update(s, STEP); peak = Math.max(peak, s.y); air += STEP; if (s.grounded) break; assert.ok(s.airP >= lastP - 1e-9, 'airP never goes backwards'); lastP = s.airP }
  assert.ok(peak > 1.6 && peak < 1.8, `peak ${peak}`)
  assert.ok(air > 0.52 && air < 0.62, `air ${air}`)
  assert.equal(s.y, 0)
  assert.equal(s.airP, 0)
  assert.ok(s.events.includes('land'))
  assert.equal(command(s, 'jump'), true, 'can jump again after landing')
  command(s, 'jump'); command(s, 'jump') // while rising: nothing happens
  run(s, 0.1)
  assert.ok(s.vy < PLAYER.jumpVelocity, 'no second impulse')
})

test('jump: gravity is heavier on the way down (crisp arc), rise is smooth', () => {
  const s = started(); clearObstacles(s)
  command(s, 'jump')
  let vyPrev = s.vy, up = 0, down = 0
  while (!s.grounded) { update(s, STEP); if (s.grounded) break; if (s.vy > 0) up += STEP; else down += STEP; assert.ok(s.vy <= vyPrev + 1e-9, 'vertical velocity decreases smoothly'); vyPrev = s.vy }
  assert.ok(down < up, `fall ${down} faster than rise ${up}`)
})

test('jump buffer: pressing just before landing jumps on touch-down; too early does not', () => {
  const s = started(); clearObstacles(s)
  command(s, 'jump')
  while (!(s.vy < 0 && s.y < 0.25)) update(s, STEP)
  assert.equal(command(s, 'jump'), false)
  assert.ok(s.jumpBuf > 0)
  while (s.grounded === false && s.count.jump === 1) update(s, STEP)
  assert.equal(s.count.jump, 2, 'buffered jump fired on landing')
  const t = started(); clearObstacles(t)
  command(t, 'jump')
  update(t, 0.05)
  assert.equal(t.vy > 0, true)
  command(t, 'jump') // rising: ignored, not buffered
  assert.equal(t.jumpBuf, 0)
})

test('landing is reliable: grounded, y exactly 0, brief land state, then running', () => {
  const s = started(); clearObstacles(s)
  command(s, 'jump')
  while (!s.grounded) update(s, STEP)
  assert.equal(s.y, 0); assert.equal(s.vy, 0)
  assert.equal(s.anim, 'land')
  run(s, PLAYER.landTime + 0.1)
  assert.equal(s.anim, 'run')
})

// ---- duck --------------------------------------------------------------------
test('duck lowers the collision box, then restores the standing height', () => {
  const s = started(); clearObstacles(s)
  assert.equal(playerBox(s).y1, PLAYER.standHeight)
  assert.ok(command(s, 'duck'))
  run(s, 0.05)
  assert.equal(s.anim, 'duck')
  assert.equal(playerBox(s).y1, PLAYER.duckHeight)
  assert.ok(PLAYER.duckHeight < OBSTACLES.arch.y0, 'ducked Aisha fits under the arch')
  assert.ok(PLAYER.standHeight > OBSTACLES.arch.y0, 'standing Aisha does not')
  run(s, PLAYER.duckTime + 0.1)
  assert.equal(s.anim, 'run')
  assert.equal(playerBox(s).y1, PLAYER.standHeight, 'collision restored the moment the duck ends')
  assert.equal(s.x, 0, 'no lateral drift')
  run(s, 0.4)
  assert.ok(s.duckT < 0.05, 'pose blend returns to running')
})

test('a duck cannot end while an arch is overhead (no standing up into it)', () => {
  const s = started(); clearObstacles(s)
  const arch = put(s, 'arch', 1, 0) // directly overhead
  command(s, 'duck')
  s.duck = 0.01
  run(s, 0.06)
  assert.equal(s.phase, 'running')
  assert.ok(s.duck > 0, 'kept crouching under the arch')
  while (aheadOf(s, arch) > -2) update(s, STEP)
  run(s, 0.1)
  assert.equal(s.duck, 0)
  assert.equal(s.phase, 'running')
})

test('duck in the air is a fast fall, not a crouch', () => {
  const s = started(); clearObstacles(s)
  command(s, 'jump'); run(s, 0.15)
  command(s, 'duck')
  assert.ok(s.vy <= PLAYER.fastFall)
  while (!s.grounded) update(s, STEP)
  assert.equal(s.duck, 0)
})

test('jump cancels a duck', () => {
  const s = started(); clearObstacles(s)
  command(s, 'duck'); run(s, 0.1); assert.ok(s.duck > 0)
  command(s, 'jump')
  assert.equal(s.duck, 0)
})

// ---- collisions ----------------------------------------------------------------
test('collision: ice wall in my lane ends the run', () => {
  const s = started(); clearObstacles(s)
  put(s, 'wall', 1, 20)
  run(s, 4)
  assert.equal(s.phase, 'gameover')
  assert.equal(s.hit.kind, 'wall')
})

test('collision: switching lanes clears a wall', () => {
  const s = started(); clearObstacles(s)
  put(s, 'wall', 1, 30)
  command(s, 'left')
  run(s, 5)
  assert.equal(s.phase, 'running')
})

test('collision: low ridge needs a jump, jump clears it', () => {
  const a = started(); clearObstacles(a); put(a, 'ridge', 1, 22)
  run(a, 4); assert.equal(a.phase, 'gameover')
  const b = started(); clearObstacles(b); const o = put(b, 'ridge', 1, 22)
  while (aheadOf(b, o) > b.speed * 0.28) update(b, STEP)
  command(b, 'jump')
  run(b, 2)
  assert.equal(b.phase, 'running')
})

test('collision: overhead arch needs a duck, standing/jumping hits', () => {
  const a = started(); clearObstacles(a); put(a, 'arch', 1, 22)
  run(a, 4); assert.equal(a.phase, 'gameover')
  const b = started(); clearObstacles(b); const o = put(b, 'arch', 1, 22)
  while (aheadOf(b, o) > b.speed * 0.3) update(b, STEP)
  command(b, 'duck')
  run(b, 2)
  assert.equal(b.phase, 'running', 'ducked under the arch')
  const c = started(); clearObstacles(c); const o2 = put(c, 'arch', 1, 22)
  while (aheadOf(c, o2) > c.speed * 0.3) update(c, STEP)
  command(c, 'jump'); run(c, 2)
  assert.equal(c.phase, 'gameover', 'jumping into the arch hits it')
})

test('collision is swept: a long frame at max speed cannot skip an obstacle', () => {
  const s = started(); clearObstacles(s)
  s.speed = RUN.maxSpeed
  put(s, 'wall', 1, 1.4)
  update(s, 0.05); update(s, 0.05)
  assert.equal(s.phase, 'gameover')
  assert.ok(STEP * RUN.maxSpeed < OBSTACLES.wall.halfD * 2, 'step distance is smaller than the collider depth')
})

test('game over: world stays put, knock-back eases in, restart is clean', () => {
  const s = started(); clearObstacles(s); put(s, 'wall', 1, 10); run(s, 3)
  assert.equal(s.phase, 'gameover')
  const d = s.dist
  run(s, 1)
  assert.equal(s.dist, d, 'distance frozen at the hit')
  assert.ok(s.hitT >= 0.9)
  assert.ok(s.knock > 0.99)
  assert.equal(s.anim, 'hurt')
  command(s, 'left'); assert.equal(s.lane, 1, 'no input after the hit')
  // restart: everything back to a fresh run
  startRun(s)
  assert.equal(s.phase, 'running')
  assert.equal(s.dist, 0); assert.equal(s.x, 0); assert.equal(s.y, 0)
  assert.equal(s.hit, null); assert.equal(s.hitT, 0); assert.equal(s.knock, 0)
  assert.equal(s.duck, 0); assert.equal(s.jumpBuf, 0); assert.equal(s.queued, null)
  assert.equal(s.speed, RUN.startSpeed); assert.equal(s.time, 0)
  assert.ok(s.obstacles.every((o) => !o.active || o.dist > 30))
  run(s, 1)
  assert.equal(s.phase, 'running')
})

test('restart is deterministic for the same seed', () => {
  const a = createSim(); startRun(a, 42)
  const b = createSim(); startRun(b, 42)
  run(a, 30); run(b, 30)
  const snap = (s) => s.obstacles.filter((o) => o.active).map((o) => `${o.kind}@${o.dist.toFixed(2)}:${o.x}`).join()
  assert.equal(snap(a), snap(b))
})

// ---- generator fairness ---------------------------------------------------------
test('generator: first obstacle is far ahead; pool stays bounded', () => {
  const s = started(7)
  const first = Math.min(...s.obstacles.filter((o) => o.active).map((o) => aheadOf(s, o)))
  assert.ok(first > RUN.startSpeed * RUN.safeSeconds, `first obstacle ${first} m ahead`)
  assert.ok(first > 40)
  let maxActive = 0
  for (let i = 0; i < 60 * 120; i++) {
    update(s, 1 / 60)
    if (s.phase !== 'running') { startRun(s, s.seed + 1) }
    maxActive = Math.max(maxActive, s.obstacles.filter((o) => o.active).length)
  }
  assert.ok(maxActive <= 24)
})

test('generator: every row is fair (reaction time, reachability, never all lanes walled)', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const s = started(seed)
    const seen = new Map() // row distance -> kinds/lanes
    for (let i = 0; i < 60 * DIFFICULTY_SECONDS; i++) {
      s.phase = 'running'; update(s, 1 / 60)
      for (const o of s.obstacles) if (o.active) { const k = o.dist.toFixed(3); if (!seen.has(k)) seen.set(k, { dist: o.dist, kind: o.kind, lanes: [] }); const r = seen.get(k); if (!r.lanes.includes(laneOf(o))) r.lanes.push(laneOf(o)) }
    }
    const rows = [...seen.values()].sort((a, b) => a.dist - b.dist)
    assert.ok(rows.length > 40)
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      if (r.kind === 'wall') assert.ok(r.lanes.length <= 2, 'never all three lanes walled')
      else assert.equal(r.lanes.length, 1, 'ridge/arch are one object')
      if (i === 0) continue
      const prev = rows[i - 1]
      const prevRow = { kind: prev.kind, lanes: prev.kind === 'wall' ? prev.lanes : [0, 1, 2] }
      const row = { kind: r.kind, lanes: r.kind === 'wall' ? r.lanes : [0, 1, 2] }
      const speed = Math.min(RUN.maxSpeed, RUN.startSpeed + RUN.accel * (r.dist / RUN.startSpeed)) // upper bound of the speed at that distance
      const gap = (r.dist - prev.dist) / speed
      assert.ok(gap >= minGap(prevRow, row) - 0.05, `seed ${seed} row ${i}: gap ${gap.toFixed(2)}s < needed ${minGap(prevRow, row).toFixed(2)}s`)
      assert.ok(gap >= 0.9, `gap ${gap.toFixed(2)}s`)
    }
  }
})

test('generator: patterns vary, no signature three times in a row, difficulty rises', () => {
  const s = started(11)
  const rowMap = new Map()
  for (let i = 0; i < 60 * DIFFICULTY_SECONDS; i++) {
    s.phase = 'running'; update(s, 1 / 60)
    for (const o of s.obstacles) if (o.active) { const k = o.dist.toFixed(3); const r = rowMap.get(k) ?? { dist: o.dist, kind: o.kind, lanes: [] }; if (!r.lanes.includes(laneOf(o))) r.lanes.push(laneOf(o)); rowMap.set(k, r) }
  }
  const list = [...rowMap.values()].sort((a, b) => a.dist - b.dist)
  const sigOf = (r) => `${r.kind}:${r.lanes.sort().join('')}`
  assert.deepEqual([...new Set(list.map((r) => r.kind))].sort(), ['arch', 'ridge', 'wall'])
  assert.ok(new Set(list.map(sigOf)).size >= 8, 'a decent variety of rows')
  for (let i = 2; i < list.length; i++) {
    const [a, b, c] = [list[i - 2], list[i - 1], list[i]]
    assert.ok(!(sigOf(a) === sigOf(b) && sigOf(b) === sigOf(c)), `same row three times: ${sigOf(a)}`)
    if (a.kind !== 'wall') assert.ok(!(a.kind === b.kind && b.kind === c.kind), 'same action kind three times')
  }
  assert.ok(baseGap(1) < baseGap(0), 'gaps tighten with difficulty')
  const early = list.slice(0, 8), late = list.slice(-8)
  const mean = (l) => l.slice(1).reduce((s2, r, i) => s2 + (r.dist - l[i].dist), 0) / (l.length - 1)
  assert.ok(mean(late) / RUN.maxSpeed < mean(early) / RUN.startSpeed, 'late rows are closer in time than early rows')
})

test('generator: patterns are survivable by the Auto play bot, from 1 to 180 s, for many seeds', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const s = botRun(seed, DIFFICULTY_SECONDS + 30)
    assert.notEqual(s.phase, 'gameover', `seed ${seed}: bot died at ${s.time.toFixed(1)}s hitting ${s.hit?.kind} lane ${s.hit && LANES.indexOf(s.hit.x)} (lane ${s.lane})`)
    assert.equal(s.phase, 'complete', `seed ${seed}: the bot finishes the 1,500 m level within the time limit`)
  }
})

test('minGap / reachability helpers', () => {
  const wall = (...l) => ({ kind: 'wall', lanes: l })
  assert.deepEqual(openLanes(wall(0, 1)), [2])
  assert.equal(worstShift([2], [0]), 2)
  assert.equal(worstShift([0, 2], [1]), 1)
  assert.ok(minGap(wall(0, 1), wall(1, 2)) > minGap(wall(1), wall(1)), 'far open lanes need more time')
  assert.ok(minGap({ kind: 'ridge', lanes: [0, 1, 2] }, { kind: 'arch', lanes: [0, 1, 2] }) >= 1.1)
  assert.equal(minGap(null, wall(1)), 0)
})

// ---- animation ---------------------------------------------------------------------
test('run animation rate follows ground speed (feet do not slide)', () => {
  assert.ok(Math.abs(runRate(RUN.startSpeed) * ANIM.strideSpeed - RUN.startSpeed) < 1e-9, 'matched at the start speed')
  assert.equal(footSlip(RUN.startSpeed), 0)
  assert.equal(footSlip(ANIM.maxRate * ANIM.strideSpeed), 0, 'matched up to the max playback rate')
  assert.ok(footSlip(RUN.maxSpeed) < 0.25, `slip at top speed ${footSlip(RUN.maxSpeed)}`)
  let prev = 0
  for (let v = 0; v <= 14; v += 0.5) { const r = runRate(v); assert.ok(r >= prev); assert.ok(r >= ANIM.minRate && r <= ANIM.maxRate); prev = r }
})

// ---- input -----------------------------------------------------------------------
test('input: keys and swipes map to commands', () => {
  assert.equal(KEYMAP.ArrowLeft, 'left'); assert.equal(KEYMAP.KeyA, 'left')
  assert.equal(KEYMAP.ArrowRight, 'right'); assert.equal(KEYMAP.KeyD, 'right')
  for (const k of ['ArrowUp', 'KeyW', 'Space']) assert.equal(KEYMAP[k], 'jump')
  for (const k of ['ArrowDown', 'KeyS']) assert.equal(KEYMAP[k], 'duck')
  assert.equal(classifySwipe(-60, 5), 'left')
  assert.equal(classifySwipe(60, -5), 'right')
  assert.equal(classifySwipe(4, -70), 'jump')
  assert.equal(classifySwipe(-4, 70), 'duck')
  assert.equal(classifySwipe(10, 10), null, 'tiny movement is a tap')
  assert.equal(classifySwipe(50, 48), null, 'diagonal is ambiguous')
})

// ---- camera ------------------------------------------------------------------------
test('camera: Aisha and the upcoming lanes stay in view at every aspect, without zooming out far', () => {
  for (const aspect of [9 / 19.5, 9 / 16, 3 / 4, 1, 16 / 9, 1534 / 630, 844 / 390]) {
    const c = cameraFor(aspect)
    const tanH = Math.tan((c.fov * Math.PI) / 360) * aspect
    for (const lane of [0, 1, 2]) {
      const t = cameraTarget(c, { x: LANES[lane], y: 0 }, {})
      assert.ok(Math.abs(LANES[lane] - t.px) + 0.55 <= tanH * c.back + 1e-6, `aspect ${aspect}: Aisha in lane ${lane} visible`)
      // all lanes (outer edges) fully visible by 14 m ahead of her
      const reach = Math.max(...LANES.map((x) => Math.abs(x + (x < 0 ? -1 : 1) * 1.1 - t.px)))
      assert.ok((c.back + 14) * tanH >= reach - 1e-6, `aspect ${aspect}, lane ${lane}: lanes visible 14 m ahead`)
    }
    assert.ok(c.back >= 5.4 && c.back <= 8.6, `aspect ${aspect}: back ${c.back}`)
  }
})

test('camera: jump camera is damped, framing does not jump', () => {
  const c = cameraFor(16 / 9)
  const ground = cameraTarget(c, { x: 0, y: 0 }, {})
  const apex = cameraTarget(c, { x: 0, y: 1.71 }, {})
  assert.ok(apex.py - ground.py < 1.71 * 0.4, 'camera rises less than 40% of the jump height')
  assert.ok(apex.ly - ground.ly < 1.71 * 0.4)
})

// ---- scenery -----------------------------------------------------------------------
test('decorative pines never sit on the lanes or the camera path', () => {
  const trees = scatterTrees()
  assert.ok(trees.length > 40)
  for (const t of trees) {
    assert.ok(Math.abs(t.x) >= TREE_MIN_X, `tree at x=${t.x}`)
    assert.ok(Math.abs(t.x) - t.h * 0.22 > LANES[2] + OBSTACLES.wall.halfW + 0.5, 'crown clear of the outer lane')
  }
})

test('ready state resets', () => {
  const s = started(); run(s, 1); resetToReady(s)
  assert.equal(s.phase, 'ready'); assert.equal(s.dist, 0)
})

// ---- Orbs of Chi ---------------------------------------------------------------------
test('orbs: running through an orb collects it once; other lanes are untouched', () => {
  const s = started(); clearObstacles(s)
  const mine = putOrbAt(s, 1, ORBS.groundY, 12)
  const other = putOrbAt(s, 0, ORBS.groundY, 12)
  run(s, 3)
  assert.equal(s.orbCount, 1)
  assert.equal(mine.taken, true)
  assert.equal(other.taken, false)
  assert.equal(s.count.orb, 1)
  run(s, 1)
  assert.equal(s.orbCount, 1, 'never counted twice')
  assert.equal(mine.active, false, 'collected orbs are removed after the pop animation')
})

test('orbs: a fast long frame cannot skip an orb', () => {
  const s = started(); clearObstacles(s)
  s.speed = RUN.maxSpeed
  putOrbAt(s, 1, ORBS.groundY, 1.0)
  update(s, 0.05); update(s, 0.05)
  assert.equal(s.orbCount, 1)
})

test('orbs: jump arcs over a ridge need a jump; standing and ducking do not reach them', () => {
  assert.ok(ORBS.arcY - ORBS.radius > PLAYER.standHeight, 'an orb in the arc is above a standing Aisha')
  const a = started(); clearObstacles(a); putOrbAt(a, 1, ORBS.arcY, 10)
  run(a, 3); assert.equal(a.orbCount, 0, 'running under it collects nothing')
  const b = started(); clearObstacles(b); const o = putOrbAt(b, 1, ORBS.arcY, 12)
  while (aheadOf(b, o) > b.speed * 0.28) update(b, STEP)
  command(b, 'jump'); run(b, 2)
  assert.equal(b.orbCount, 1, 'a jump at the usual moment collects it')
})

test('orbs: a collected-orb count and pool reset on restart', () => {
  const s = started(); clearObstacles(s); putOrbAt(s, 1, ORBS.groundY, 8); run(s, 2)
  assert.equal(s.orbCount, 1)
  startRun(s)
  assert.equal(s.orbCount, 0); assert.equal(s.orbsSeen > 0, true)
  assert.ok(s.orbs.every((q) => !q.taken))
})

test('orbs: spawned in gaps only, clear of every obstacle, deterministic, within the pool', () => {
  for (const seed of [1, 2, 3, 4]) {
    const s = started(seed)
    const rows = new Map(), orbs = new Map()
    for (let i = 0; i < 60 * 120; i++) {
      s.phase = 'running'; update(s, 1 / 60)
      for (const o of s.obstacles) if (o.active) rows.set(o.id, { dist: o.dist, kind: o.kind, x: o.x })
      for (const q of s.orbs) if (q.active) orbs.set(q.id, { dist: q.dist, x: q.x, y: q.y })
    }
    assert.ok(orbs.size > 40, `seed ${seed}: ${orbs.size} orbs`)
    for (const q of orbs.values()) {
      for (const r of rows.values()) {
        const d = Math.abs(q.dist - r.dist)
        if (q.y === ORBS.arcY) { assert.ok(d >= 1.5 - 1e-9 || r.kind === 'ridge', 'arc orbs sit over a ridge only'); continue }
        assert.ok(d >= 3 - 1e-6, `seed ${seed}: ground orb ${d.toFixed(2)} m from a ${r.kind}`)
      }
    }
  }
  const a = started(5), b = started(5)
  run(a, 20); run(b, 20)
  const snap = (s) => s.orbs.filter((o) => o.active).map((o) => `${o.x}@${o.dist.toFixed(2)}:${o.y}`).join()
  assert.equal(snap(a), snap(b))
})

// ---- Auto play -----------------------------------------------------------------------
test('auto play: watch-only (player commands ignored), survives, and collects orbs', () => {
  for (const seed of [21, 22, 23]) {
    const s = botRun(seed, 120)
    assert.equal(s.phase, 'running', `seed ${seed}: bot died at ${s.time.toFixed(1)} s`)
    assert.equal(s.auto, true)
    assert.ok(s.orbCount >= s.orbsSeen * 0.4, `seed ${seed}: collected ${s.orbCount} of ${s.orbsSeen}`)
  }
  const s = botRun(24, 5)
  const lane = s.lane
  assert.equal(command(s, 'left'), false, 'manual left ignored')
  assert.equal(command(s, 'right'), false)
  assert.equal(command(s, 'jump'), false)
  assert.equal(command(s, 'duck'), false)
  assert.equal(s.lane, lane)
})

test('auto play: a manual run is not affected and clears the driver', () => {
  const s = createSim(); startRun(s, 3, { auto: true }); s.driver = () => {}
  assert.equal(s.auto, true)
  startRun(s, 4)
  assert.equal(s.auto, false); assert.equal(s.driver, null)
  assert.equal(command(s, 'left'), true)
})
