import test from 'node:test'
import assert from 'node:assert/strict'
import { Bone, Group, Vector3 } from 'three'
import { AISHA_PREVIEW } from '../src/game/player/characterConfig.js'
import { createAishaRig, runningPhase, sprintLift } from '../src/game/player/aishaRig.js'
import { TRACK_SURFACE_Y } from '../src/game/systems/runGeometry.js'

function makeRig() {
  const scene = new Group()
  for (const name of [
    'mainAishaHip_L_0604', 'mainAishaHip_R_0491',
    'mainAishaKnee_L_0607', 'mainAishaKnee_R_0494',
    'mainAishaShoulder_L_0580', 'mainAishaShoulder_R_0511',
    'mainAishaElbow_L_0583', 'mainAishaElbow_R_0514',
    'mainAishaChest_M_0509', 'mainAishaHairs1_L_0571', 'mainAishaHairs1_R_0555',
  ]) {
    const bone = new Bone()
    bone.name = name
    scene.add(bone)
  }
  return { scene, rig: createAishaRig(scene) }
}

test('Aisha preview faces travel and keeps her sampled shoe sole on the road', () => {
  const forward = new Vector3(0, 0, 1).applyAxisAngle(new Vector3(0, 1, 0), AISHA_PREVIEW.rotationY)
  assert.ok(forward.z < -0.999)
  const soleY = TRACK_SURFACE_Y + (-0.065 + AISHA_PREVIEW.offset[1]) * AISHA_PREVIEW.scale
  assert.ok(Math.abs(soleY - TRACK_SURFACE_Y) < 0.01)
})

test('procedural stride is distance-driven, alternating, and does not accumulate on an unchanged mixer pose', () => {
  const { scene, rig } = makeRig()
  const move = { action: 'running', actionTime: 0, x: 0, lane: 0 }
  const run = { started: true, distance: Math.PI / (2 * 3.8) }
  const settings = { jumpDuration: 0.7, laneSpacing: 1.15 }
  rig.apply(move, run, settings, 1)
  const left = scene.getObjectByName('mainAishaHip_L_0604')
  const right = scene.getObjectByName('mainAishaHip_R_0491')
  const arm = scene.getObjectByName('mainAishaShoulder_L_0580')
  assert.ok(left.quaternion.x > 0 && right.quaternion.x < 0 && arm.quaternion.x < 0)
  const first = left.quaternion.clone()
  const hair = scene.getObjectByName('mainAishaHairs1_L_0571')
  const hairPose = hair.quaternion.clone()
  for (let index = 0; index < 100; index += 1) {
    rig.restore()
    rig.apply(move, run, settings, 0)
  }
  assert.ok(left.quaternion.angleTo(first) < 1e-7)
  assert.ok(hair.quaternion.angleTo(hairPose) < 1e-7)
  rig.reset()
  rig.apply(move, { started: false, distance: run.distance }, settings, 0)
  assert.ok(Math.abs(left.quaternion.x) < 1e-7)
})

test('jump pose blends in and returns to idle at landing without changing gameplay', () => {
  const { scene, rig } = makeRig()
  const settings = { jumpDuration: 0.7, laneSpacing: 1.15 }
  const run = { started: true, distance: 0 }
  const knee = scene.getObjectByName('mainAishaKnee_L_0607')
  const movement = { action: 'jumping', actionTime: 0, x: 0, lane: 0 }
  rig.apply(movement, run, settings, 0.1)
  assert.ok(Math.abs(knee.quaternion.x) < 1e-7)
  rig.restore()
  movement.actionTime = settings.jumpDuration / 2
  rig.apply(movement, run, settings, 0.1)
  assert.ok(knee.quaternion.x > 0)
  rig.restore()
  movement.actionTime = settings.jumpDuration
  rig.apply(movement, run, settings, 0.1)
  assert.ok(Math.abs(knee.quaternion.x) < 1e-7)
})

test('stride alternates over a shorter distance and fades while jumping', () => {
  const { scene, rig } = makeRig()
  const settings = { jumpDuration: 0.7, laneSpacing: 1.15 }
  const move = { action: 'running', actionTime: 0, x: 0, lane: 0 }
  const run = { started: true, distance: Math.PI / (2 * 3.8) }
  const left = scene.getObjectByName('mainAishaHip_L_0604')
  const right = scene.getObjectByName('mainAishaHip_R_0491')
  const knee = scene.getObjectByName('mainAishaKnee_L_0607')
  rig.apply(move, run, settings, 1)
  assert.ok(left.quaternion.x > 0.25 && right.quaternion.x < -0.25)
  assert.ok(knee.quaternion.x > 0.25)
  rig.restore()
  run.distance += Math.PI / 3.8
  rig.apply(move, run, settings, 0)
  assert.ok(left.quaternion.x < -0.25 && right.quaternion.x > 0.25)
  const startingCadence = runningPhase(3.4) / (2 * Math.PI)
  const maximumCadence = runningPhase(5) / (2 * Math.PI)
  assert.ok(startingCadence > 2 && maximumCadence > startingCadence)
  rig.restore()
  move.action = 'jumping'
  move.actionTime = settings.jumpDuration / 2
  rig.apply(move, run, settings, 0.3)
  assert.ok(Math.abs(left.quaternion.x - right.quaternion.x) < 1e-6)
})

test('hair responds to running, lane movement and jumping without accumulating offsets', () => {
  const { scene, rig } = makeRig()
  const settings = { jumpDuration: 0.7, laneSpacing: 1.15 }
  const movement = { action: 'running', actionTime: 0, x: 0, lane: 0 }
  const run = { started: true, distance: 0.4 }
  const hair = scene.getObjectByName('mainAishaHairs1_L_0571')
  rig.apply(movement, run, settings, 1)
  const running = hair.quaternion.clone()
  rig.restore()
  movement.lane = 1
  rig.apply(movement, run, settings, 0)
  assert.ok(hair.quaternion.angleTo(running) > 0.01)
  rig.restore()
  movement.lane = 0
  rig.apply(movement, run, settings, 0)
  assert.ok(hair.quaternion.angleTo(running) < 1e-7)
  rig.restore()
  movement.action = 'jumping'
  movement.actionTime = settings.jumpDuration / 2
  rig.apply(movement, run, settings, 1)
  assert.ok(hair.quaternion.angleTo(running) > 0.01)
})

test('sprint coordinates drive, recovery, bent arms and flight lift', () => {
  const { scene, rig } = makeRig()
  const move = { action: 'running', actionTime: 0, x: 0, lane: 0 }
  const settings = { jumpDuration: 0.7, laneSpacing: 1.15 }
  const run = { started: true, distance: 0 }
  const bone = (name) => scene.getObjectByName(`mainAisha${name}`).quaternion.x
  rig.apply(move, run, settings, 1)
  assert.ok(bone('Knee_L_0607') > 0 && bone('Knee_R_0494') > 0)
  assert.ok(bone('Elbow_L_0583') < 0 && bone('Elbow_R_0514') < 0)
  rig.restore()
  run.distance = Math.PI / (2 * 3.8)
  rig.apply(move, run, settings, 0)
  assert.ok(bone('Hip_L_0604') > 0 && bone('Shoulder_L_0580') < 0)
  assert.ok(bone('Hip_R_0491') < 0 && bone('Shoulder_R_0511') > 0)
  assert.ok(bone('Knee_L_0607') > bone('Knee_R_0494'))
  rig.restore()
  run.distance = 3 * Math.PI / (2 * 3.8)
  rig.apply(move, run, settings, 0)
  assert.ok(bone('Knee_R_0494') > bone('Knee_L_0607'))
  assert.ok(sprintLift((Math.PI + 0.8) / 2) > sprintLift(0.8 / 2))
})
