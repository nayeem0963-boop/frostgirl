import test from 'node:test'
import assert from 'node:assert/strict'
import { PerspectiveCamera, Vector3 } from 'three'
import { createSpiralSection, SPIRAL_EDGES, SPIRAL_ROWS, updateSpiralSection } from '../src/game/environment/spiralGeometry.js'
import { createSpiralCameraState, updateSpiralCamera } from '../src/game/systems/spiralCamera.js'
import { configureRunnerCamera } from '../src/game/systems/runnerCamera.js'
import { createRunnerMovement, runnerSettings } from '../src/game/systems/runnerMovement.js'
import { createRunSimulation, runSettings } from '../src/game/systems/runSimulation.js'
import { createTrackFrame, sampleSpiralTrack, SPIRAL_FOG_END, SPIRAL_ROAD_HALF_WIDTH, SPIRAL_SECTION_COUNT, SPIRAL_SECTION_LENGTH, trackPosition } from '../src/game/systems/spiralTrack.js'

test('spiral frames stay continuous, orthonormal, upright and distance-based through both turn directions', () => {
  const frame = createTrackFrame()
  const next = createTrackFrame()
  let left = false
  let right = false
  for (let distance = -32; distance < 1200; distance += 0.5) {
    sampleSpiralTrack(distance, frame)
    sampleSpiralTrack(distance + 0.01, next)
    assert.ok(Math.abs(frame.position.distanceTo(next.position) - 0.01) < 0.00002)
    assert.ok(frame.tangent.dot(next.tangent) > 0.99999)
    assert.ok(frame.right.dot(next.right) > 0.99999)
    assert.ok(frame.up.dot(next.up) > 0.99999)
    assert.ok(Math.abs(frame.tangent.dot(frame.right)) < 1e-10)
    assert.ok(Math.abs(frame.tangent.dot(frame.up)) < 1e-10)
    assert.ok(Math.abs(frame.right.dot(frame.up)) < 1e-10)
    assert.ok(Math.abs(frame.right.length() - 1) < 1e-10)
    assert.ok(frame.up.y > 0.999 && frame.tangent.y > 0 && frame.tangent.y < 0.04)
    const turn = frame.tangent.x * next.tangent.z - frame.tangent.z * next.tangent.x
    left ||= turn < -1e-6
    right ||= turn > 1e-6
  }
  assert.ok(left && right)
})

test('pooled road sections meet at full width with matching normals and upward-facing surfaces', () => {
  const frame = createTrackFrame()
  const first = createSpiralSection()
  const second = createSpiralSection()
  const firstAnchor = new Vector3()
  const secondAnchor = new Vector3()
  const point = new Vector3()
  const strips = SPIRAL_EDGES.length - 1
  for (const section of [-1, 0, 7, 33, 1000]) {
    updateSpiralSection(first, section, firstAnchor, frame, point)
    updateSpiralSection(second, section + 1, secondAnchor, frame, point)
    const a = first.attributes.position
    const b = second.attributes.position
    const an = first.attributes.normal
    const bn = second.attributes.normal
    for (let vertex = 0; vertex < strips * 2; vertex += 1) {
      const last = SPIRAL_ROWS * strips * 2 + vertex
      const p1 = new Vector3().fromBufferAttribute(a, last).add(firstAnchor)
      const p2 = new Vector3().fromBufferAttribute(b, vertex).add(secondAnchor)
      assert.ok(p1.distanceTo(p2) < 0.00001)
      assert.ok(new Vector3().fromBufferAttribute(an, last).distanceTo(new Vector3().fromBufferAttribute(bn, vertex)) < 1e-6)
    }
    const left = new Vector3().fromBufferAttribute(a, 0)
    const right = new Vector3().fromBufferAttribute(a, strips * 2 - 1)
    assert.ok(Math.abs(left.distanceTo(right) - SPIRAL_ROAD_HALF_WIDTH * 2) < 0.00001)
    const indices = first.index
    const p0 = new Vector3().fromBufferAttribute(a, indices.getX(0))
    const p1 = new Vector3().fromBufferAttribute(a, indices.getX(1))
    const p2 = new Vector3().fromBufferAttribute(a, indices.getX(2))
    assert.ok(p1.sub(p0).cross(p2.sub(p0)).dot(new Vector3().fromBufferAttribute(an, 0)) > 0)
  }
  first.dispose()
  second.dispose()
})

test('nonadjacent spiral turns maintain vertical clearance across the full road width', () => {
  const a = createTrackFrame()
  const b = createTrackFrame()
  for (let s = 0; s < 1200; s += 4) {
    sampleSpiralTrack(s, a)
    for (let other = s + 24; other < 1200; other += 4) {
      sampleSpiralTrack(other, b)
      const horizontal = Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z)
      if (horizontal < 2 * SPIRAL_ROAD_HALF_WIDTH + 1) {
        assert.ok(Math.abs(a.position.y - b.position.y) > 4)
      }
    }
  }
})

test('prototype controls remain track-relative and disabled objects cannot cause invisible hits or scores', () => {
  const movement = createRunnerMovement()
  const run = createRunSimulation(movement, {
    ...runSettings, readyDuration: 0, countdownInterval: 0, goDuration: 0,
  }, { interactiveObjects: false })
  Object.assign(run.state.obstacles[0], { type: 'iceBlock', lane: 0, z: runSettings.playerZ - 1 })
  Object.assign(run.state.collectibles[0], { lane: 0, z: runSettings.playerZ - 1, active: true })
  run.update(1)
  assert.equal(run.state.hitType, null)
  assert.equal(run.state.crystals, 0)
  movement.move(1)
  run.update(0.5)
  assert.ok(Math.abs(movement.state.x - runnerSettings.laneSpacing) < 0.01)
  const frame = sampleSpiralTrack(run.state.distance, createTrackFrame())
  const point = trackPosition(frame, movement.state.x, 0, new Vector3())
  assert.ok(Math.abs(point.sub(frame.position).dot(frame.right) - movement.state.x) < 1e-10)
  assert.ok(movement.jump())
  run.update(runnerSettings.jumpDuration / 2)
  assert.ok(Math.abs(movement.state.y - runnerSettings.jumpHeight) < 0.001)
  run.update(runnerSettings.jumpDuration / 2 + 0.001)
  assert.equal(movement.state.y, 0)
  assert.ok(movement.slide())
  run.update(runnerSettings.slideDuration + 0.01)
  assert.equal(movement.state.action, 'running')
  movement.move(-1)
  run.update(0.5)
  assert.ok(Math.abs(movement.state.x) < 0.01)
  run.reset()
  movement.reset()
  assert.equal(run.state.distance, 0)
  assert.equal(movement.state.x, 0)
})

test('camera follows smoothly and keeps obstacle-width lane positions visible at reaction distance', () => {
  for (const size of [{ width: 950, height: 819 }, { width: 390, height: 844 }]) {
    const camera = new PerspectiveCamera()
    configureRunnerCamera(camera, size, runSettings.playerZ)
    const state = createSpiralCameraState()
    const direction = new Vector3()
    const previous = new Vector3()
    const frame = createTrackFrame()
    const player = createTrackFrame()
    const point = new Vector3()
    const step = 5 / 60
    for (let distance = 0; distance < 1200; distance += step) {
      updateSpiralCamera(camera, state, distance, 1 / 60, distance === 0)
      camera.updateMatrixWorld()
      camera.getWorldDirection(direction)
      if (distance > 0) assert.ok(direction.angleTo(previous) < 0.01)
      previous.copy(direction)
      if (Math.round(distance / step) % 12 !== 0) continue
      sampleSpiralTrack(distance, player)
      sampleSpiralTrack(distance + 5 * runSettings.minReactionTime, frame)
      for (const lateral of [-runnerSettings.laneSpacing - 0.49, runnerSettings.laneSpacing + 0.49]) {
        trackPosition(frame, lateral, 0.6, point)
        point.y -= player.position.y
        point.project(camera)
        assert.ok(Math.abs(point.x) < 1 && Math.abs(point.y) < 1 && point.z < 1, `${size.width} at ${distance}: ${point.x}, ${point.y}`)
      }
    }
  }
})

test('recycled end sections are outside the view or fully faded at section transitions', () => {
  for (const size of [{ width: 950, height: 819 }, { width: 390, height: 844 }]) {
    const camera = new PerspectiveCamera()
    configureRunnerCamera(camera, size, runSettings.playerZ)
    const state = createSpiralCameraState()
    const player = createTrackFrame()
    const frame = createTrackFrame()
    const point = new Vector3()
    const view = new Vector3()
    for (let distance = 0; distance < 4000; distance += SPIRAL_SECTION_LENGTH) {
      updateSpiralCamera(camera, state, distance, 0, true)
      camera.updateMatrixWorld()
      sampleSpiralTrack(distance, player)
      for (let offset = -SPIRAL_SECTION_LENGTH; offset <= SPIRAL_SECTION_LENGTH; offset += 2) {
        for (const sign of [-1, 1]) {
          sampleSpiralTrack(distance + sign * SPIRAL_SECTION_COUNT / 2 * SPIRAL_SECTION_LENGTH + offset, frame)
          for (const lateral of [-SPIRAL_ROAD_HALF_WIDTH, 0, SPIRAL_ROAD_HALF_WIDTH]) {
            trackPosition(frame, lateral, 0, point)
            point.y -= player.position.y
            view.copy(point).applyMatrix4(camera.matrixWorldInverse)
            point.project(camera)
            const onScreen = Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1 && point.z >= -1 && point.z <= 1
            assert.ok(!onScreen || -view.z >= SPIRAL_FOG_END)
          }
        }
      }
    }
  }
})
