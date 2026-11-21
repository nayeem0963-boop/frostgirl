import test from 'node:test'
import assert from 'node:assert/strict'
import { CapsuleGeometry, PerspectiveCamera, Vector3 } from 'three'
import { configureRunnerCamera } from '../src/game/systems/runnerCamera.js'
import {
  CAMERA_FAR, PLAYER_BASE_Y, PLAYER_LEG_CENTER_Y, PLAYER_LEG_HIP_Y, PLAYER_LEG_LENGTH,
  PLAYER_LEG_RADIUS, PLAYER_MODEL_SCALE, TRACK_NEAR_Z, TRACK_SURFACE_Y,
} from '../src/game/systems/runGeometry.js'
import { createRunSimulation, runSettings } from '../src/game/systems/runSimulation.js'
import { SEGMENT_COUNT, SEGMENT_LENGTH, SEAM_SPACING, TRACK_DETAIL_CYCLE, segmentPosition, trackDetailPosition } from '../src/game/systems/trackMotion.js'
import { createSnowSegment, snowHeight } from '../src/game/environment/frozenTerrain.js'

test('surface seams travel with obstacles and stop during countdown, pause, and reset', () => {
  const movement = { state: { x: 100, y: 0, action: 'running' }, settings: { laneSpacing: 1.15 }, update() {} }
  const run = createRunSimulation(movement)
  const before = trackDetailPosition(10 * SEAM_SPACING, run.state.distance)
  run.update(1)
  assert.equal(trackDetailPosition(10 * SEAM_SPACING, run.state.distance), before)
  run.update(1.5)
  const seam = trackDetailPosition(10 * SEAM_SPACING, run.state.distance)
  const segment = segmentPosition(3, run.state.distance)
  const obstacle = run.state.obstacles[0].z
  run.update(0.5)
  assert.ok(Math.abs((trackDetailPosition(10 * SEAM_SPACING, run.state.distance) - seam) - (run.state.obstacles[0].z - obstacle)) < 1e-8)
  assert.ok(Math.abs((segmentPosition(3, run.state.distance) - segment) - (run.state.obstacles[0].z - obstacle)) < 1e-8)
  run.suspend()
  const paused = trackDetailPosition(10 * SEAM_SPACING, run.state.distance)
  const pausedSegment = segmentPosition(3, run.state.distance)
  run.update(2)
  assert.equal(trackDetailPosition(10 * SEAM_SPACING, run.state.distance), paused)
  assert.equal(segmentPosition(3, run.state.distance), pausedSegment)
  run.reset()
  assert.equal(trackDetailPosition(10 * SEAM_SPACING, run.state.distance), before)
  assert.equal(segmentPosition(3, run.state.distance), segmentPosition(3, 0))
})

test('snow segments cover the track without gaps and recycle outside the visible approach', () => {
  const cycle = SEGMENT_COUNT * SEGMENT_LENGTH
  for (const distance of [0, 0.01, 7, 23.99, 24, 126.5, cycle, cycle + 0.01]) {
    const positions = Array.from({ length: SEGMENT_COUNT }, (_, index) => segmentPosition(index, distance)).sort((a, b) => a - b)
    for (let index = 1; index < positions.length; index += 1) {
      assert.ok(Math.abs(positions[index] - positions[index - 1] - SEGMENT_LENGTH) < 1e-8)
    }
    assert.ok(positions[0] <= runSettings.playerZ - runSettings.spawnFadeEnd)
    assert.ok(positions.at(-1) + SEGMENT_LENGTH >= TRACK_NEAR_Z)
  }
  assert.equal(segmentPosition(0, 0), TRACK_NEAR_Z)
  assert.ok(Math.abs(segmentPosition(0, 0.01) - (TRACK_NEAR_Z - cycle + 0.01)) < 1e-8)
  assert.ok(runSettings.playerZ - (TRACK_NEAR_Z - cycle + SEGMENT_LENGTH) > runSettings.spawnFadeEnd)
})

test('snow terrain joins at segment edges and keeps the playable lanes level', () => {
  const geometry = createSnowSegment()
  const positions = geometry.attributes.position
  const colors = geometry.attributes.color
  const edges = new Map()
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index)
    const z = positions.getZ(index)
    if (Math.abs(x) <= 2.5) assert.ok(Math.abs(positions.getY(index)) < 1e-6)
    if (Math.abs(Math.abs(z) - SEGMENT_LENGTH / 2) < 1e-6) {
      const values = [positions.getY(index), colors.getX(index), colors.getY(index), colors.getZ(index)]
      if (edges.has(x)) {
        values.forEach((value, component) => assert.ok(Math.abs(value - edges.get(x)[component]) < 1e-6))
      } else {
        edges.set(x, values)
      }
    }
    assert.ok(Math.abs(positions.getY(index) - snowHeight(x, z)) < 1e-6)
  }
  assert.ok(edges.size > 0)
  geometry.dispose()
})

test('the frozen path stays level while blending into raised snowbanks', () => {
  for (const z of [-12, -6, 0, 6, 12]) {
    for (const x of [-2.7, -1.15, 0, 1.15, 2.7]) {
      assert.equal(snowHeight(x, z), 0)
    }
    assert.ok(snowHeight(6, z) > 0)
  }
  const geometry = createSnowSegment()
  const positions = geometry.attributes.position
  const colors = geometry.attributes.color
  let ice
  let snow
  for (let index = 0; index < positions.count; index += 1) {
    if (Math.abs(positions.getZ(index)) > 1e-6) continue
    if (Math.abs(positions.getX(index)) < 1e-6) ice = [colors.getX(index), colors.getZ(index)]
    if (Math.abs(positions.getX(index) - 8) < 1e-6) snow = [colors.getX(index), colors.getZ(index)]
  }
  assert.ok(ice && snow)
  assert.ok(ice[1] - ice[0] > snow[1] - snow[0])
  assert.ok(snow[0] - ice[0] > 0.25)
  geometry.dispose()
})

test('seams recycle behind the camera and reappear beyond the distance fade', () => {
  const farZ = TRACK_NEAR_Z - TRACK_DETAIL_CYCLE
  assert.ok(runSettings.playerZ - farZ > runSettings.spawnFadeEnd)
  for (const viewport of [{ width: 1012, height: 873 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const camera = new PerspectiveCamera(42, 1, 0.1, CAMERA_FAR)
    configureRunnerCamera(camera, viewport, runSettings.playerZ)
    const near = new Vector3(0, TRACK_SURFACE_Y, TRACK_NEAR_Z).project(camera)
    assert.ok(near.z > 1 || near.y < -1)
    const closeA = new Vector3(0, TRACK_SURFACE_Y, -3).project(camera)
    const closeB = new Vector3(0, TRACK_SURFACE_Y, -2).project(camera)
    const farA = new Vector3(0, TRACK_SURFACE_Y, -40).project(camera)
    const farB = new Vector3(0, TRACK_SURFACE_Y, -39).project(camera)
    assert.ok(Math.abs(closeA.y - closeB.y) > Math.abs(farA.y - farB.y))
  }
  assert.equal(trackDetailPosition(0, 0), TRACK_NEAR_Z)
  assert.ok(Math.abs(trackDetailPosition(0, 0.01) - (farZ + 0.01)) < 1e-8)
})

test('the standing leg geometry meets the actual running surface', () => {
  const leg = new CapsuleGeometry(PLAYER_LEG_RADIUS, PLAYER_LEG_LENGTH, 4, 8)
  leg.computeBoundingBox()
  const bottom = PLAYER_BASE_Y + PLAYER_MODEL_SCALE * (PLAYER_LEG_HIP_Y + PLAYER_LEG_CENTER_Y + leg.boundingBox.min.y)
  assert.ok(Math.abs(bottom - TRACK_SURFACE_Y) < 1e-7)
  leg.dispose()
})
