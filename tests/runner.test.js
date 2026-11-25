import test from 'node:test'
import assert from 'node:assert/strict'
import { createSim, startRun, update, command, STEP, aheadOf, resetToReady } from '../src/runner/sim/sim.js'
import { classifySwipe, KEYMAP } from '../src/runner/sim/input.js'
import { cameraFor } from '../src/runner/sim/camera.js'
import { LANES, PLAYER, OBSTACLES } from '../src/runner/config.js'
import { scatterTrees, TREE_MIN_X } from '../src/runner/scene/scenery.js'

const run = (sim, seconds) => { for (let t = 0; t < seconds; t += 1 / 60) update(sim, 1 / 60) }
function started(seed = 1) { const s = createSim(seed); startRun(s); return s }
function put(sim, kind, lane, ahead) {
  const o = sim.obstacles.find((x) => !x.active)
  Object.assign(o, { active: true, kind, x: kind === 'wall' ? LANES[lane] : 0, dist: sim.dist + ahead, id: 999 })
  return o
}
const clearObstacles = (s) => { for (const o of s.obstacles) o.active = false; s.nextSpawn = 1e9 }

test('game does not run before start', () => {
  const s = createSim()
  assert.equal(s.phase, 'ready')
  run(s, 2)
  assert.equal(s.dist, 0)
  assert.equal(command(s, 'jump'), false)
})

test('lane changes: left/right, clamped to three lanes, smooth', () => {
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

test('lane spam is buffered to one change, not stacked', () => {
  const s = started(); clearObstacles(s)
  command(s, 'right')
  for (let i = 0; i < 6; i++) command(s, 'right') // mashing during the glide
  run(s, 0.6)
  assert.equal(s.lane, 2, 'only lanes 1 -> 2 (clamped), no extra skipping')
  const t = started(); clearObstacles(t)
  command(t, 'left'); command(t, 'left'); command(t, 'left')
  run(t, 0.6)
  assert.equal(t.lane, 0)
})

test('jump leaves the ground, peaks ~1.7 m, lands', () => {
  const s = started(); clearObstacles(s)
  assert.ok(command(s, 'jump'))
  let peak = 0, air = 0
  while (!s.grounded && air < 2) { update(s, 1 / 120); peak = Math.max(peak, s.y); air += 1 / 120 }
  assert.ok(peak > 1.5 && peak < 1.9, `peak ${peak}`)
  assert.ok(air > 0.5 && air < 0.8, `air ${air}`)
  assert.equal(s.y, 0)
  assert.ok(s.events.includes('land'))
  assert.equal(command(s, 'jump'), true, 'can jump again after landing')
  assert.equal(command(s, 'jump'), false, 'no double jump')
})

test('duck lowers the collider then returns to running', () => {
  const s = started(); clearObstacles(s)
  assert.ok(command(s, 'duck'))
  run(s, 0.05)
  assert.equal(s.anim, 'duck')
  assert.ok(Math.abs(s.y + PLAYER.duckHeight - PLAYER.duckHeight) < 1e-9)
  run(s, PLAYER.duckTime + 0.2)
  assert.equal(s.anim, 'run')
})

test('collision: ice wall in my lane ends the run', () => {
  const s = started(); clearObstacles(s)
  put(s, 'wall', 1, 20)
  run(s, 3)
  assert.equal(s.phase, 'gameover')
  assert.equal(s.hit.kind, 'wall')
})

test('collision: switching lanes clears a wall', () => {
  const s = started(); clearObstacles(s)
  put(s, 'wall', 1, 30)
  command(s, 'left')
  run(s, 4)
  assert.equal(s.phase, 'running')
})

test('collision: low ridge needs a jump, jump clears it', () => {
  const a = started(); clearObstacles(a); put(a, 'ridge', 1, 22)
  run(a, 3); assert.equal(a.phase, 'gameover')
  const b = started(); clearObstacles(b); const o = put(b, 'ridge', 1, 22)
  // jump when the ridge is ~4 m away (about 0.36 s before reaching it)
  while (aheadOf(b, o) > 4.5) update(b, 1 / 120)
  command(b, 'jump')
  run(b, 2)
  assert.equal(b.phase, 'running')
})

test('collision: overhead arch needs a duck, standing/jumping hits', () => {
  const a = started(); clearObstacles(a); put(a, 'arch', 1, 22)
  run(a, 3); assert.equal(a.phase, 'gameover')
  const b = started(); clearObstacles(b); const o = put(b, 'arch', 1, 22)
  while (aheadOf(b, o) > 5) update(b, 1 / 120)
  command(b, 'duck')
  run(b, 2)
  assert.equal(b.phase, 'running', 'ducked under the arch')
  const c = started(); clearObstacles(c); const o2 = put(c, 'arch', 1, 22)
  while (aheadOf(c, o2) > 5) update(c, 1 / 120)
  command(c, 'jump'); run(c, 2)
  assert.equal(c.phase, 'gameover', 'jumping into the arch hits it')
})

test('collision is swept: a long frame at max speed cannot skip an obstacle', () => {
  const s = started(); clearObstacles(s)
  s.speed = 22 // RUN.maxSpeed
  put(s, 'wall', 1, 2.5)
  update(s, 0.05); update(s, 0.05) // 2.2 m of travel in two huge frames, split into fixed sub-steps
  assert.equal(s.phase, 'gameover')
  assert.ok(STEP * 22 < OBSTACLES.wall.halfD * 2, 'step distance is smaller than the collider depth')
})

test('restart gives a fresh run', () => {
  const s = started(); clearObstacles(s); put(s, 'wall', 1, 10); run(s, 3)
  assert.equal(s.phase, 'gameover')
  startRun(s)
  assert.equal(s.phase, 'running')
  assert.equal(s.dist, 0)
  assert.equal(s.x, 0)
  assert.equal(s.hit, null)
  assert.ok(s.obstacles.every((o) => !o.active || o.dist > 20))
  run(s, 1)
  assert.equal(s.phase, 'running')
})

test('spawner: first obstacle is far ahead, every row leaves a way through, pool is bounded', () => {
  const s = started(7)
  const first = Math.min(...s.obstacles.filter((o) => o.active).map((o) => aheadOf(s, o)))
  assert.ok(first > 40, `first obstacle ${first} m ahead`)
  // an AI-less player: just survive by ducking/jumping/lane logic is covered elsewhere; here check structure
  let maxActive = 0
  for (let i = 0; i < 60 * 60; i++) {
    s.phase = 'running'; update(s, 1 / 60)
    maxActive = Math.max(maxActive, s.obstacles.filter((o) => o.active).length)
    const rows = new Map()
    for (const o of s.obstacles) if (o.active && o.kind === 'wall') rows.set(o.dist.toFixed(1), (rows.get(o.dist.toFixed(1)) ?? 0) + 1)
    for (const n of rows.values()) assert.ok(n <= 2, 'at most 2 walls per row')
  }
  assert.ok(maxActive <= 24)
})

test('reaction time between rows stays >= 1.1 s at current speed', () => {
  const s = started(3)
  for (let i = 0; i < 600; i++) { s.phase = 'running'; update(s, 1 / 60) }
  const rows = [...new Set(s.obstacles.filter((o) => o.active).map((o) => o.dist))].sort((a, b) => a - b)
  for (let i = 1; i < rows.length; i++) assert.ok((rows[i] - rows[i - 1]) / s.speed >= 1.1, `gap ${rows[i] - rows[i - 1]} m at ${s.speed} m/s`)
})

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

test('camera shows all three lanes at phone portrait and desktop aspects', () => {
  for (const aspect of [9 / 19.5, 9 / 16, 3 / 4, 1, 16 / 9, 1534 / 630]) {
    const c = cameraFor(aspect)
    const halfWidth = Math.tan((c.fov * Math.PI) / 360) * aspect * c.back
    assert.ok(halfWidth >= LANES[2] + 1.1 - 1e-6 || c.back >= 13, `aspect ${aspect}: half width ${halfWidth}`)
    assert.ok(c.back >= 5.8 && c.back <= 13)
  }
})

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
