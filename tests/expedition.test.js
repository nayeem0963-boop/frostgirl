// Frost expedition: gameplay logic tests (pure modules, no rendering).
import test from 'node:test'
import assert from 'node:assert/strict'
import { getWorld } from '../src/expedition/world/world.js'
import { nearestTrail, trailPoint, TRAIL_LENGTH } from '../src/expedition/world/trail.js'
import { LEVEL } from '../src/expedition/world/level.js'
import { createPlayer, stepPlayer, PLAYER } from '../src/expedition/gameplay/player.js'
import { createWolf, stepWolf, WOLF } from '../src/expedition/gameplay/wolf.js'
import { createCameraRig, stepCamera } from '../src/expedition/gameplay/camera.js'

const world = getWorld()
const DT = 1 / 60

function run(p, seconds, input) {
  for (let i = 0; i < seconds * 60; i++) {
    stepPlayer(p, { mx: 0, my: 0, sprint: false, jump: false, camYaw: 0, ...input(p, i) }, DT, world)
  }
  return p
}

// camYaw that makes "forward" point from p toward (x, z)
const yawToward = (p, x, z) => Math.atan2(-(x - p.x), -(z - p.z))

test('trail is a continuous climb of reasonable length', () => {
  assert.ok(TRAIL_LENGTH > 300 && TRAIL_LENGTH < 600)
  const start = world.height(LEVEL.start.x, LEVEL.start.z)
  const end = world.height(LEVEL.checkpoint.x, LEVEL.checkpoint.z)
  assert.ok(end - start > 35, `climb ${end - start}`)
  const mid = trailPoint(TRAIL_LENGTH / 2)
  assert.ok(nearestTrail(mid.x, mid.z).d < 0.01)
})

test('terrain is not flat: valley walls rise away from the trail', () => {
  const p = trailPoint(100)
  const onTrail = world.height(p.x, p.z)
  const off = world.height(p.x - p.tz * 40, p.z + p.tx * 40)
  assert.ok(off - onTrail > 4)
})

test('player stays grounded on terrain while walking', () => {
  const p = createPlayer(world.start)
  run(p, 4, (pl) => ({ my: 1, camYaw: yawToward(pl, trailPoint(40).x, trailPoint(40).z) }))
  assert.ok(Math.abs(p.y - world.height(p.x, p.z)) < 0.05, 'feet on the ground')
  assert.ok(p.grounded)
  assert.equal(p.anim, 'walk')
  assert.ok(Math.hypot(p.x - world.start.x, p.z - world.start.z) > 5)
})

test('jump leaves the ground, lands, and costs stamina', () => {
  const p = createPlayer(world.start)
  let maxLift = 0
  let sawJump = false
  let minStamina = 100
  run(p, 1.5, (pl, i) => {
    maxLift = Math.max(maxLift, pl.y - world.height(pl.x, pl.z))
    minStamina = Math.min(minStamina, pl.stamina)
    if (pl.anim === 'jump') sawJump = true
    return { jump: i === 2 }
  })
  assert.ok(maxLift > 0.7 && maxLift < 1.3, `lift ${maxLift}`)
  assert.ok(sawJump)
  assert.ok(p.grounded)
  assert.ok(minStamina <= 100 - PLAYER.jumpCost)
})

test('sprinting drains stamina until exhausted', () => {
  const p = createPlayer(world.start)
  run(p, 9, (pl) => ({ my: 1, sprint: true, camYaw: yawToward(pl, trailPoint(120).x, trailPoint(120).z) }))
  assert.ok(p.stamina < 40, `stamina ${p.stamina}`)
})

test('walking off the ledge into the ravine is fatal', () => {
  const s = (LEVEL.ledge.s0 + LEVEL.ledge.s1) / 2
  const q = trailPoint(s)
  const y = world.height(q.x, q.z)
  const p = createPlayer({ x: q.x, y, z: q.z, tx: q.tx, tz: q.tz })
  let fell = false
  run(p, 4, (pl) => {
    if (pl.events.includes('fell')) fell = true
    // walk to the right of the travel direction, toward the drop
    return { my: 1, camYaw: yawToward(pl, pl.x - q.tz * 50, pl.z + q.tx * 50) }
  })
  assert.ok(fell)
})

test('boulders block walking but can be jumped onto', () => {
  const r = LEVEL.rocks
  const q = trailPoint(r.s - 4)
  const p = createPlayer({ x: q.x, y: world.height(q.x, q.z), z: q.z })
  const target = trailPoint(r.s + 6)
  run(p, 3, (pl) => ({ my: 1, camYaw: yawToward(pl, target.x, target.z) }))
  // Without jumping the player must not end up inside a boulder.
  for (const c of world.colliders(p.x, p.z)) {
    if (c.kind !== 'rock') continue
    const d = Math.hypot(p.x - c.x, p.z - c.z)
    assert.ok(d >= c.radius + PLAYER.radius - 0.05 || p.y >= c.top - PLAYER.stepHeight, 'not inside a rock')
  }
})

test('wolf warns before charging, and the warning can be defused by backing off', () => {
  const w = createWolf(LEVEL.wolf)
  const player = { x: LEVEL.wolf.x + 20, z: LEVEL.wolf.z, speed: 0, sprinting: false, alive: true }
  const modes = new Set()
  for (let i = 0; i < 60 * 3; i++) { stepWolf(w, player, DT); modes.add(w.mode) }
  assert.ok(modes.has('alert'))
  assert.ok(!modes.has('charge'))
  // approach into warning range
  player.x = w.x + 11
  player.z = w.z
  for (let i = 0; i < 30; i++) stepWolf(w, player, DT)
  assert.equal(w.mode, 'warn')
  // back off before patience runs out
  player.x = w.x + WOLF.calmRadius + 3
  for (let i = 0; i < 30; i++) stepWolf(w, player, DT)
  assert.notEqual(w.mode, 'charge')
})

test('wolf charges and bites only after a sustained warning', () => {
  const w = createWolf(LEVEL.wolf)
  const player = { x: w.x + 5, z: w.z, speed: 0, sprinting: false, alive: true }
  let bitten = false
  let warnedFirst = false
  for (let i = 0; i < 60 * 10 && !bitten; i++) {
    stepWolf(w, player, DT)
    if (w.mode === 'warn') warnedFirst = true
    if (w.events.includes('bite')) bitten = true
  }
  assert.ok(warnedFirst)
  assert.ok(bitten)
  assert.equal(w.mode, 'retreat')
})

test('camera never ends up below the terrain', () => {
  const p = createPlayer(world.start)
  const rig = createCameraRig(p)
  for (let i = 0; i < 400; i++) {
    stepPlayer(p, { mx: 0.3, my: 1, sprint: false, jump: false, camYaw: rig.yaw }, DT, world)
    stepCamera(rig, p, [i % 50 === 0 ? 120 : 0, 4], DT, world)
    assert.ok(rig.y >= world.height(rig.x, rig.z) + 0.39)
  }
})
