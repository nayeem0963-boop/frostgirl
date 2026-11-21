import test from 'node:test'
import assert from 'node:assert/strict'
import { createRunnerMovement } from '../src/game/systems/runnerMovement.js'
import { createRunSimulation, obstacleTypes, RUN_POOL_SIZE, runSettings } from '../src/game/systems/runSimulation.js'
import { CRYSTAL_HEIGHT, CRYSTAL_RADIUS, PLAYER_BASE_Y } from '../src/game/systems/runGeometry.js'

const testSettings = {
  ...runSettings,
  initialSpeed: 5,
  maximumSpeed: 5,
  acceleration: 0,
  readyDuration: 0,
  countdownInterval: 0,
  goDuration: 0,
}

function isolated() {
  const movement = createRunnerMovement()
  const run = createRunSimulation(movement, testSettings)
  run.state.obstacles.forEach((item, index) => { item.z = -1000 - index * 13 })
  run.state.collectibles.forEach((item, index) => { item.z = -1000 - index * 13 })
  return { movement, run }
}

test('a solid obstacle hits once and freezes subsequent simulation', () => {
  const { movement, run } = isolated()
  Object.assign(run.state.obstacles[0], { type: 'iceBlock', lane: 0, z: runSettings.playerZ - 2 })
  run.update(1)
  assert.equal(run.state.hitType, 'iceBlock')
  const distance = run.state.distance
  run.update(2)
  assert.equal(run.state.distance, distance)
  assert.equal(movement.state.action, 'running')
})

test('a suspended simulation stays frozen until it resumes', () => {
  const { run } = isolated()
  run.update(0.1)
  const distance = run.state.distance
  run.suspend()
  run.update(1)
  assert.equal(run.state.distance, distance)
  run.resume()
  run.update(0.1)
  assert.ok(run.state.distance > distance)
})

test('jump feedback fires at takeoff and actual landing, pauses, and resets', () => {
  const { movement, run } = isolated()
  const puff = run.state.snowEffect
  assert.equal(puff.active, false)
  movement.jump()
  run.update(0.1)
  assert.equal(puff.active, true)
  assert.equal(puff.landing, false)
  const takeoffAge = puff.age
  run.suspend()
  run.update(1)
  assert.equal(puff.age, takeoffAge)
  run.resume()
  run.update(0.61)
  assert.equal(movement.state.action, 'running')
  assert.equal(puff.active, true)
  assert.equal(puff.landing, true)
  assert.ok(puff.age < 0.03)
  run.update(0.41)
  assert.equal(puff.active, false)
  movement.jump()
  run.update(0.05)
  assert.equal(puff.landing, false)
  run.reset()
  movement.reset()
  assert.equal(puff.active, false)
})

test('a collision interrupts and clears temporary feedback without a false landing', () => {
  const { movement, run } = isolated()
  Object.assign(run.state.obstacles[0], { type: 'iceBlock', lane: 0, z: runSettings.playerZ - 1 })
  movement.jump()
  run.update(0.3)
  assert.equal(run.state.hitType, 'iceBlock')
  assert.equal(movement.state.action, 'jumping')
  assert.equal(run.state.snowEffect.active, false)
  assert.equal(run.state.effect.active, false)
})

test('snow barriers and fallen pines are clearable by a properly timed jump', () => {
  for (const type of ['snowBarrier', 'fallenPine']) {
    const { movement, run } = isolated()
    Object.assign(run.state.obstacles[0], { type, lane: 0, z: runSettings.playerZ - 1.75 })
    movement.jump()
    run.update(0.7)
    assert.equal(run.state.hitType, null, type)
    assert.equal(movement.state.action, 'running')
  }
})

test('every obstacle hits a standing runner but allows an adjacent lane', () => {
  for (const type of Object.keys(obstacleTypes)) {
    const standing = isolated()
    Object.assign(standing.run.state.obstacles[0], { type, lane: 0, z: runSettings.playerZ - 2 })
    standing.run.update(1)
    assert.equal(standing.run.state.hitType, type)
    const avoiding = isolated()
    avoiding.movement.move(-1)
    avoiding.run.update(0.6)
    Object.assign(avoiding.run.state.obstacles[0], { type, lane: 0, z: runSettings.playerZ - 2 })
    avoiding.run.update(1)
    assert.equal(avoiding.run.state.hitType, null, type)
  }
})

test('the tall ice block cannot be jumped and sliding does not clear any obstacle', () => {
  const jumping = isolated()
  Object.assign(jumping.run.state.obstacles[0], { type: 'iceBlock', lane: 0, z: runSettings.playerZ - 1.75 })
  jumping.movement.jump()
  jumping.run.update(0.7)
  assert.equal(jumping.run.state.hitType, 'iceBlock')
  for (const type of Object.keys(obstacleTypes)) {
    const sliding = isolated()
    Object.assign(sliding.run.state.obstacles[0], { type, lane: 0, z: runSettings.playerZ - 1.75 })
    sliding.movement.slide()
    sliding.run.update(0.7)
    assert.equal(sliding.run.state.hitType, type)
  }
})

test('collision boundaries follow obstacle width, depth and jump clearance', () => {
  for (const [type, shape] of Object.entries(obstacleTypes)) {
    const attempt = (x, y, z) => {
      const movement = { state: { x, y, action: 'running' }, settings: { laneSpacing: 1.15 }, update() {} }
      const run = createRunSimulation(movement, testSettings)
      run.state.obstacles.forEach((item, index) => { item.z = -1000 - index * 13 })
      Object.assign(run.state.obstacles[0], { type, lane: 0, z })
      run.update(1 / 120)
      return run.state.hitType
    }
    const edge = shape.width / 2 + 0.14
    const crossing = runSettings.playerZ - shape.halfDepth - 0.15
    assert.equal(attempt(edge - 0.01, 0, crossing), type)
    assert.equal(attempt(edge + 0.01, 0, crossing), null)
    assert.equal(attempt(0, 0, crossing - 0.2), null)
    if (shape.jumpable) {
      assert.equal(attempt(0, shape.height - 0.01, crossing), type)
      assert.equal(attempt(0, shape.height + 0.01, crossing), null)
    }
  }
})
test('a crystal is collected once, triggers an effect, and reset clears the run', () => {
  const { movement, run } = isolated()
  Object.assign(run.state.collectibles[0], { lane: 0, z: runSettings.playerZ - 0.6, active: true })
  run.update(0.2)
  assert.equal(run.state.crystals, 1)
  assert.equal(run.state.collectibles[0].active, false)
  assert.equal(run.state.effect.active, true)
  run.update(0.2)
  assert.equal(run.state.crystals, 1)
  movement.move(1)
  run.reset()
  movement.reset()
  assert.equal(run.state.crystals, 0)
  assert.equal(run.state.distance, 0)
  assert.equal(run.state.hitType, null)
  assert.equal(run.state.effect.active, false)
  assert.equal(movement.state.lane, 0)
  const initial = createRunSimulation(createRunnerMovement(), testSettings)
  assert.deepEqual(run.state.obstacles, initial.state.obstacles)
  assert.deepEqual(run.state.collectibles, initial.state.collectibles)
})

test('collection feedback follows the collected orb and expires without changing scoring', () => {
  const { run } = isolated()
  Object.assign(run.state.collectibles[0], { lane: 0, z: runSettings.playerZ - 0.6, active: true })
  run.update(0.1)
  assert.equal(run.state.crystals, 1)
  assert.equal(run.state.effect.y, CRYSTAL_HEIGHT)
  assert.equal(run.state.effect.x, 0)
  assert.ok(run.state.effect.z < runSettings.playerZ)
  run.suspend()
  const age = run.state.effect.age
  run.update(1)
  assert.equal(run.state.effect.age, age)
  run.resume()
  run.update(0.51)
  assert.equal(run.state.effect.active, false)
  assert.equal(run.state.crystals, 1)
})

test('crystals collect at all three player lane centers', () => {
  for (const lane of [-1, 0, 1]) {
    const { movement, run } = isolated()
    if (lane !== 0) movement.move(lane)
    run.update(0.6)
    Object.assign(run.state.collectibles[0], { lane, z: runSettings.playerZ - 1, active: true })
    run.update(0.3)
    assert.equal(run.state.crystals, 1, `lane ${lane}`)
    run.update(0.3)
    assert.equal(run.state.crystals, 1, `lane ${lane} collected twice`)
  }
})

test('a player above a crystal cannot collect it', () => {
  const { movement, run } = isolated()
  movement.state.y = 1.05
  Object.assign(run.state.collectibles[0], { lane: 0, z: runSettings.playerZ - 0.6, active: true })
  run.update(0.2)
  assert.equal(run.state.crystals, 0)
  assert.equal(run.state.collectibles[0].active, true)
})

test('crystal collection matches the ground-level height and depth', () => {
  const above = isolated()
  above.movement.state.y = CRYSTAL_HEIGHT + CRYSTAL_RADIUS - PLAYER_BASE_Y + 0.01
  Object.assign(above.run.state.collectibles[0], { lane: 0, z: runSettings.playerZ - 0.6, active: true })
  above.run.update(0.2)
  assert.equal(above.run.state.crystals, 0)

  const near = isolated()
  near.movement.state.y = CRYSTAL_HEIGHT + CRYSTAL_RADIUS - PLAYER_BASE_Y - 0.01
  Object.assign(near.run.state.collectibles[0], { lane: 0, z: runSettings.playerZ - 0.5, active: true })
  near.run.update(0.019)
  assert.equal(near.run.state.crystals, 0)
  near.run.update(0.002)
  assert.equal(near.run.state.crystals, 1)
})

test('crystal lane sequence is reachable and does not change initial obstacle lanes', () => {
  const movement = { state: { x: 100, y: 0, action: 'running' }, settings: { laneSpacing: 1.15 }, update() {} }
  const run = createRunSimulation(movement, testSettings)
  assert.deepEqual(run.state.obstacles.slice(0, 3).map((item) => item.lane), [-1, 1, -1])
  const lanes = run.state.collectibles.map((item) => item.lane)
  while (lanes.length < 19) {
    const positions = run.state.collectibles.map((item) => item.z)
    run.update(0.1)
    for (let index = 0; index < positions.length; index += 1) {
      if (run.state.collectibles[index].z < positions[index] - 1) {
        lanes.push(run.state.collectibles[index].lane)
      }
    }
  }
  assert.deepEqual(lanes.slice(0, 9), [-1, 0, 1, 1, 0, -1, -1, 0, 0])
  assert.notDeepEqual(lanes.slice(9, 18), lanes.slice(0, 9))
  for (let index = 1; index < lanes.length; index += 1) {
    assert.ok(Math.abs(lanes[index] - lanes[index - 1]) <= 1)
  }
})

test('spawn pools remain spaced, separated, and sufficiently far ahead when recycled', () => {
  const movement = { state: { x: 100, y: 0, action: 'running' }, settings: { laneSpacing: 1.15 }, update() {} }
  const run = createRunSimulation(movement, testSettings)
  const obstacles = [...run.state.obstacles]
  const crystals = [...run.state.collectibles]
  let recycledObstacles = 0
  let recycledCrystals = 0
  for (let frame = 0; frame < 2000; frame += 1) {
    const oldObstacles = run.state.obstacles.map((item) => item.z)
    const oldCrystals = run.state.collectibles.map((item) => item.z)
    run.update(0.1)
    for (let index = 0; index < RUN_POOL_SIZE; index += 1) {
      if (run.state.obstacles[index].z < oldObstacles[index] - 1) {
        recycledObstacles += 1
        assert.ok(run.state.obstacles[index].z <= runSettings.playerZ - runSettings.spawnDistance)
        assert.ok(run.state.obstacles[index].z <= runSettings.playerZ - runSettings.spawnFadeEnd)
      }
      if (run.state.collectibles[index].z < oldCrystals[index] - 1) {
        recycledCrystals += 1
        assert.ok(run.state.collectibles[index].z <= runSettings.playerZ - runSettings.spawnDistance)
        assert.ok(run.state.collectibles[index].z <= runSettings.playerZ - runSettings.spawnFadeEnd)
      }
    }
    const positions = run.state.obstacles.map((item) => item.z).sort((a, b) => a - b)
    for (let index = 1; index < positions.length; index += 1) {
      assert.ok(positions[index] - positions[index - 1] >= runSettings.obstacleSpacing - 1e-8)
    }
    for (const crystal of run.state.collectibles) {
      for (const obstacle of run.state.obstacles) {
        assert.ok(Math.abs(crystal.z - obstacle.z) >= runSettings.obstacleSpacing / 2 - 1e-8)
      }
    }
  }
  for (let index = 0; index < RUN_POOL_SIZE; index += 1) {
    assert.equal(run.state.obstacles[index], obstacles[index])
    assert.equal(run.state.collectibles[index], crystals[index])
  }
  assert.ok(recycledObstacles > RUN_POOL_SIZE)
  assert.ok(recycledCrystals > RUN_POOL_SIZE)
})

test('recycled obstacle types vary without blocking multiple lanes or repeating consecutively', () => {
  const movement = { state: { x: 100, y: 0, action: 'running' }, settings: { laneSpacing: 1.15 }, update() {} }
  const run = createRunSimulation(movement, testSettings)
  const generated = run.state.obstacles.map(({ type }) => type)
  assert.deepEqual(generated.slice(0, 4), ['snowBarrier', 'fallenPine', 'snowBarrier', 'fallenPine'])
  for (let frame = 0; frame < 60 * 200; frame += 1) {
    const old = run.state.obstacles.map((item) => item.z)
    run.update(1 / 60)
    for (let index = 0; index < old.length; index += 1) {
      if (run.state.obstacles[index].z < old[index] - 1) {
        generated.push(run.state.obstacles[index].type)
      }
    }
    const positions = run.state.obstacles.map((item) => item.z).sort((a, b) => a - b)
    for (let index = 1; index < positions.length; index += 1) {
      assert.ok(positions[index] - positions[index - 1] >= runSettings.obstacleSpacing - 1e-8)
    }
  }
  assert.deepEqual(new Set(generated), new Set(['snowBarrier', 'iceBlock', 'fallenPine']))
  for (let index = 1; index < generated.length; index += 1) {
    assert.notEqual(generated[index], generated[index - 1])
  }
})

test('a player can keep a continuous run going as difficulty progresses', () => {
  const movement = createRunnerMovement()
  const run = createRunSimulation(movement)
  const types = new Set()
  for (let frame = 0; frame < 60 * 180; frame += 1) {
    for (const obstacle of run.state.obstacles) types.add(obstacle.type)
    const nearest = run.state.obstacles
      .filter((item) => item.z < runSettings.playerZ)
      .sort((a, b) => b.z - a.z)[0]
    if (nearest && nearest.z > runSettings.playerZ - run.state.speed * 4 && movement.state.lane === nearest.lane) {
      movement.move(nearest.lane === 1 ? -1 : 1)
    }
    run.update(1 / 60)
    assert.equal(run.state.hitType, null)
  }
  assert.ok(run.state.elapsed > 175)
  assert.equal(run.state.speed, runSettings.maximumSpeed)
  assert.deepEqual(types, new Set(['snowBarrier', 'fallenPine', 'iceBlock']))
})

test('forward movement and swept collision are consistent at different frame rates', () => {
  function simulate(fps) {
    const { run } = isolated()
    Object.assign(run.state.obstacles[0], { type: 'iceBlock', lane: 0, z: runSettings.playerZ - 4 })
    for (let frame = 0; frame < fps * 2; frame += 1) run.update(1 / fps)
    return { hit: run.state.hitType, distance: run.state.distance }
  }
  const low = simulate(30)
  const high = simulate(120)
  assert.equal(low.hit, 'iceBlock')
  assert.equal(high.hit, 'iceBlock')
  assert.ok(Math.abs(low.distance - high.distance) < 1e-8)
})

test('forward speed and recycled positions agree at low and high frame rates', () => {
  function simulate(fps) {
    const movement = { state: { x: 100, y: 0, action: 'running' }, settings: { laneSpacing: 1.15 }, update() {} }
    const run = createRunSimulation(movement, testSettings)
    for (let frame = 0; frame < fps * 20; frame += 1) run.update(1 / fps)
    return {
      distance: run.state.distance,
      obstacles: run.state.obstacles.map((item) => item.z).sort((a, b) => a - b),
    }
  }
  const high = simulate(120)
  for (const fps of [10, 30, 60]) {
    const result = simulate(fps)
    assert.ok(Math.abs(result.distance - 20 * testSettings.initialSpeed) < 1e-7)
    for (let index = 0; index < result.obstacles.length; index += 1) {
      assert.ok(Math.abs(result.obstacles[index] - high.obstacles[index]) < 1e-7)
    }
  }
})

test('collision uses the actual lateral position, not a lane target', () => {
  const { movement, run } = isolated()
  movement.move(-1)
  Object.assign(run.state.obstacles[0], { type: 'iceBlock', lane: 0, z: runSettings.playerZ - 0.3 })
  run.update(1 / 120)
  assert.equal(run.state.hitType, 'iceBlock')
})

test('higher speeds preserve configured reaction time and spawn interval', () => {
  const movement = createRunnerMovement()
  const settings = { ...testSettings, initialSpeed: 10, maximumSpeed: 10, spawnInterval: 3 }
  const run = createRunSimulation(movement, settings)
  const distances = run.state.obstacles.map((item) => settings.playerZ - item.z)
  assert.ok(distances[0] / settings.maximumSpeed >= settings.minReactionTime)
  assert.ok((distances[1] - distances[0]) / settings.maximumSpeed >= settings.spawnInterval)
  assert.ok(settings.playerZ - run.state.collectibles[0].z >= settings.maximumSpeed * settings.minReactionTime)
})

test('countdown freezes travel, pauses, transitions to GO, and restarts on reset', () => {
  const run = createRunSimulation(createRunnerMovement())
  assert.equal(run.state.startMessage, 'READY')
  run.update(0.36)
  assert.equal(run.state.startMessage, '3')
  assert.equal(run.state.distance, 0)
  run.suspend()
  run.update(2)
  assert.equal(run.state.startMessage, '3')
  run.resume()
  run.update(0.55)
  assert.equal(run.state.startMessage, '2')
  run.update(0.55)
  assert.equal(run.state.startMessage, '1')
  run.update(0.6)
  assert.equal(run.state.startMessage, 'GO!')
  assert.ok(run.state.distance > 0)
  run.update(0.5)
  assert.equal(run.state.startMessage, null)
  run.reset()
  assert.equal(run.state.startMessage, 'READY')
  assert.equal(run.state.started, false)
  assert.equal(run.state.elapsed, 0)
})

test('the opening has a safe period and a novice can stay in the center for 30 seconds', () => {
  const run = createRunSimulation(createRunnerMovement())
  const intro = runSettings.readyDuration + 3 * runSettings.countdownInterval
  run.update(intro + runSettings.safeRunningTime)
  assert.equal(run.state.hitType, null)
  assert.ok(run.state.obstacles.every((item) => item.z < runSettings.playerZ))
  run.update(30 - runSettings.safeRunningTime)
  assert.equal(run.state.hitType, null)
  assert.ok(run.state.speed > runSettings.initialSpeed)
  assert.ok(run.state.speed < runSettings.maximumSpeed)
})

test('the first obstacle cannot hit before or at the safe-period boundary', () => {
  const settings = { ...testSettings, obstacleTypes: ['snowBarrier'] }
  const movement = createRunnerMovement()
  const run = createRunSimulation(movement, settings)
  movement.move(-1)
  run.update(settings.safeRunningTime - 0.06)
  assert.equal(run.state.hitType, null)
  run.update(0.06)
  assert.equal(run.state.hitType, null)
  run.update(0.05)
  assert.equal(run.state.hitType, 'snowBarrier')
  assert.ok(run.state.elapsed >= settings.safeRunningTime)
})

test('collision remains active as soon as the safe period ends', () => {
  const settings = { ...testSettings, obstacleTypes: ['iceBlock'] }
  const movement = createRunnerMovement()
  const run = createRunSimulation(movement, settings)
  movement.move(-1)
  run.update(settings.safeRunningTime - 0.001)
  assert.equal(run.state.hitType, null)
  run.update(0.001)
  assert.equal(run.state.hitType, null)
  run.update(0.001)
  assert.equal(run.state.hitType, 'iceBlock')
})

test('acceleration is capped and produces consistent distance across frame rates', () => {
  function simulate(fps) {
    const movement = { state: { x: 100, y: 0, action: 'running' }, settings: { laneSpacing: 1.15 }, update() {} }
    const run = createRunSimulation(movement, { ...runSettings, readyDuration: 0, countdownInterval: 0 })
    for (let frame = 0; frame < fps * 120; frame += 1) run.update(1 / fps)
    return run.state
  }
  const low = simulate(10)
  const high = simulate(120)
  assert.equal(low.speed, runSettings.maximumSpeed)
  assert.ok(Math.abs(low.distance - high.distance) < 1e-7)
})
