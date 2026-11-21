import { Vector3 } from 'three'
import { createTrackFrame, sampleSpiralTrack } from './spiralTrack.js'

export function createSpiralCameraState() {
  return {
    player: createTrackFrame(),
    ahead: createTrackFrame(),
    desiredPosition: new Vector3(),
    desiredTarget: new Vector3(),
    target: new Vector3(),
  }
}

export function updateSpiralCamera(camera, state, distance, delta, snap) {
  const { player, ahead, desiredPosition, desiredTarget, target } = state
  sampleSpiralTrack(distance, player)
  sampleSpiralTrack(distance + 15, ahead)
  desiredPosition.copy(player.position).addScaledVector(player.tangent, -9.5)
  desiredPosition.y += 3.6 - player.position.y
  desiredTarget.copy(player.position).addScaledVector(player.tangent, 12).lerp(ahead.position, 0.4)
  desiredTarget.y += 0.8 - player.position.y
  if (snap) {
    camera.position.copy(desiredPosition)
    target.copy(desiredTarget)
  } else {
    const blend = 1 - Math.exp(-4 * Math.min(delta, 0.05))
    camera.position.lerp(desiredPosition, blend)
    target.lerp(desiredTarget, blend)
  }
  camera.up.set(0, 1, 0)
  camera.lookAt(target)
}
