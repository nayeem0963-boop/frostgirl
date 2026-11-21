import { Quaternion, Vector3 } from 'three'

const JOINTS = {
  leftHip: 'mainAishaHip_L_0604',
  rightHip: 'mainAishaHip_R_0491',
  leftKnee: 'mainAishaKnee_L_0607',
  rightKnee: 'mainAishaKnee_R_0494',
  leftShoulder: 'mainAishaShoulder_L_0580',
  rightShoulder: 'mainAishaShoulder_R_0511',
  leftElbow: 'mainAishaElbow_L_0583',
  rightElbow: 'mainAishaElbow_R_0514',
  chest: 'mainAishaChest_M_0509',
  leftHair: 'mainAishaHairs1_L_0571',
  rightHair: 'mainAishaHairs1_R_0555',
}

export function runningPhase(distance) {
  return distance * 3.8
}

export function sprintLift(phase) {
  return 0.018 + 0.035 * (1 - Math.cos(phase * 2 - 0.8)) / 2
}

export function createAishaRig(scene) {
  scene.updateWorldMatrix(true, true)
  const sceneRotation = scene.getWorldQuaternion(new Quaternion())
  const axis = new Vector3(1, 0, 0).applyQuaternion(sceneRotation)
  const swayAxis = new Vector3(0, 0, 1).applyQuaternion(sceneRotation)
  const twistAxis = new Vector3(0, 1, 0).applyQuaternion(sceneRotation)
  const joints = {}
  for (const [key, name] of Object.entries(JOINTS)) {
    const bone = scene.getObjectByName(name)
    if (!bone || !bone.isBone) throw new Error(`Aisha rig is missing bone "${name}"`)
    const inverseRotation = bone.getWorldQuaternion(new Quaternion()).invert()
    joints[key] = {
      bone,
      axis: axis.clone().applyQuaternion(inverseRotation).normalize(),
      swayAxis: swayAxis.clone().applyQuaternion(inverseRotation).normalize(),
      twistAxis: twistAxis.clone().applyQuaternion(inverseRotation).normalize(),
      base: bone.quaternion.clone(),
    }
  }
  const records = Object.values(joints)
  const rotation = new Quaternion()
  let runningWeight = 0

  function restore() {
    for (const joint of records) joint.bone.quaternion.copy(joint.base)
  }

  function turn(joint, angle, axis = joint.axis) {
    joint.bone.quaternion.multiply(rotation.setFromAxisAngle(axis, angle))
  }

  function apply(movement, run, settings, delta) {
    for (const joint of records) joint.base.copy(joint.bone.quaternion)
    const target = run.started && movement.action === 'running' ? 1 : 0
    runningWeight += (target - runningWeight) * (1 - Math.exp(-14 * delta))
    const airborne = movement.action === 'jumping'
      ? Math.sin(Math.PI * Math.min(1, movement.actionTime / settings.jumpDuration))
      : 0
    const phase = runningPhase(run.distance)
    const sprintWeight = runningWeight * (1 - airborne)
    const stride = Math.sin(phase)
    const recovery = Math.sin(phase - 0.7)
    const asymmetry = Math.sin(phase * 2) * 0.06
    const leftHip = (stride * 0.6 + asymmetry) * sprintWeight
    const rightHip = (-stride * 0.6 + asymmetry) * sprintWeight

    turn(joints.leftHip, leftHip - airborne * 0.16)
    turn(joints.rightHip, rightHip - airborne * 0.16)
    turn(joints.leftKnee, (0.17 + 0.35 * (1 + recovery)) * sprintWeight + airborne * 0.48)
    turn(joints.rightKnee, (0.17 + 0.35 * (1 - recovery)) * sprintWeight + airborne * 0.48)
    turn(joints.leftShoulder, -stride * 0.46 * sprintWeight - airborne * 0.16)
    turn(joints.rightShoulder, stride * 0.46 * sprintWeight - airborne * 0.16)
    turn(joints.leftElbow, (-0.45 + stride * 0.06) * sprintWeight - airborne * 0.25)
    turn(joints.rightElbow, (-0.45 - stride * 0.06) * sprintWeight - airborne * 0.25)
    turn(joints.chest, stride * 0.035 * sprintWeight)
    turn(joints.chest, stride * 0.045 * sprintWeight, joints.chest.twistAxis)
    const hairPitch = 0.68 + Math.sin(phase - 0.7) * 0.035 * runningWeight + airborne * 0.04
    const lateralOffset = movement.x - movement.lane * settings.laneSpacing
    const hairSway = Math.sin(phase - 0.8) * 0.035 * runningWeight
      + Math.max(-0.04, Math.min(0.04, lateralOffset * 0.04))
    turn(joints.leftHair, hairPitch)
    turn(joints.rightHair, hairPitch)
    turn(joints.leftHair, hairSway + 0.1 * runningWeight, joints.leftHair.swayAxis)
    turn(joints.rightHair, hairSway - 0.1 * runningWeight, joints.rightHair.swayAxis)
  }

  function reset() {
    restore()
    runningWeight = 0
  }

  return { apply, reset, restore }
}
