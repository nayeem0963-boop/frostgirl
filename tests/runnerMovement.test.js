import test from 'node:test'
import assert from 'node:assert/strict'
import { createRunnerMovement, runnerSettings } from '../src/game/systems/runnerMovement.js'
import { useRunnerControls } from '../src/game/systems/useRunnerControls.js'

test('lane inputs clamp at both boundaries and reverse without overshooting', () => {
  const runner = createRunnerMovement()
  for (let i = 0; i < 10; i += 1) runner.move(-1)
  assert.equal(runner.state.lane, -1)
  runner.update(0.1)
  assert.ok(runner.state.x < 0 && runner.state.x > -runnerSettings.laneSpacing)
  for (let i = 0; i < 10; i += 1) runner.move(1)
  assert.equal(runner.state.lane, 1)
  for (let i = 0; i < 120; i += 1) runner.update(1 / 120)
  assert.ok(runner.state.x <= runnerSettings.laneSpacing)
  assert.ok(runner.state.x > runnerSettings.laneSpacing - 0.001)
  runner.move(-1)
  assert.equal(runner.state.lane, 0)
})

test('lane movement remains consistent at different frame rates', () => {
  function simulate(fps) {
    const runner = createRunnerMovement()
    runner.move(1)
    for (let i = 0; i < fps; i += 1) runner.update(1 / fps)
    return runner.state.x
  }
  assert.ok(Math.abs(simulate(30) - simulate(120)) < 0.01)
  assert.ok(Math.abs(simulate(60) - simulate(120)) < 0.01)
})

test('jump reaches its configured height, lands, and rejects conflicting actions', () => {
  const runner = createRunnerMovement()
  assert.equal(runner.jump(), true)
  assert.equal(runner.jump(), false)
  assert.equal(runner.slide(), false)
  runner.update(runnerSettings.jumpDuration / 2)
  assert.equal(runner.state.action, 'jumping')
  assert.ok(Math.abs(runner.state.y - runnerSettings.jumpHeight) < 1e-10)
  runner.update(runnerSettings.jumpDuration / 2)
  assert.equal(runner.state.action, 'running')
  assert.equal(runner.state.y, 0)
  assert.equal(runner.jump(), true)
})

test('slide rejects conflicts and smoothly returns to the running pose', () => {
  const runner = createRunnerMovement()
  assert.equal(runner.slide(), true)
  assert.equal(runner.jump(), false)
  assert.equal(runner.slide(), false)
  runner.update(0.25)
  assert.equal(runner.state.action, 'sliding')
  assert.ok(runner.state.slideAmount > 0.9)
  runner.update(runnerSettings.slideDuration - 0.25)
  assert.equal(runner.state.action, 'running')
  const afterSlide = runner.state.slideAmount
  runner.update(0.1)
  assert.ok(runner.state.slideAmount < afterSlide)
  assert.equal(runner.jump(), true)
})

test('reset clears lane, position, action, and slide pose', () => {
  const runner = createRunnerMovement()
  runner.move(1)
  runner.slide()
  runner.update(0.2)
  runner.reset()
  assert.deepEqual(runner.state, {
    lane: 0, x: 0, y: 0, action: 'running', actionTime: 0, slideAmount: 0,
  })
  runner.jump()
  runner.update(0.2)
  runner.reset()
  assert.equal(runner.state.y, 0)
  assert.equal(runner.state.action, 'running')
})

test('custom movement settings control lane spacing and jump shape', () => {
  const runner = createRunnerMovement({ ...runnerSettings, laneSpacing: 2, jumpHeight: 2, jumpDuration: 2 })
  runner.move(1)
  runner.jump()
  runner.update(1)
  assert.equal(runner.state.y, 2)
  assert.ok(runner.state.x > 1.99 && runner.state.x <= 2)
  runner.update(1)
  assert.equal(runner.state.action, 'running')
})

test('repeated control commands accept lane changes during a jump and reject conflicting actions', () => {
  const movement = createRunnerMovement()
  const run = { state: { started: true, hitType: null, stalled: false } }
  const controls = useRunnerControls({ movement, run, paused: false, togglePaused() {} })
  controls.command('left')
  controls.command('jump')
  controls.command('right')
  controls.command('slide')
  assert.equal(movement.state.lane, 0)
  assert.equal(movement.state.action, 'jumping')
  movement.update(runnerSettings.jumpDuration)
  controls.command('slide')
  assert.equal(movement.state.action, 'sliding')
  movement.update(runnerSettings.slideDuration)
  controls.command('jump')
  assert.equal(movement.state.action, 'jumping')
  run.state.started = false
  controls.command('left')
  assert.equal(movement.state.lane, 0)
})
