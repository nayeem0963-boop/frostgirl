import { Vector3 } from 'three'

export const SPIRAL_ROAD_HALF_WIDTH = 3.2
export const SPIRAL_SECTION_LENGTH = 16
export const SPIRAL_SECTION_COUNT = 96
export const SPIRAL_FOG_END = 105

const PERIOD = Math.PI * 4
const STEPS = 4096
const STEP = PERIOD / STEPS
const distances = new Float64Array(STEPS + 1)

function coordinates(angle, target) {
  const radius = 85 + 3 * Math.sin(angle * 0.5) + 4 * Math.sin(angle * 5)
  target.set(
    radius * Math.sin(angle),
    2 * angle + 0.5 * Math.sin(angle * 0.5),
    -radius * Math.cos(angle),
  )
  return target
}

const previous = new Vector3()
const current = new Vector3()
coordinates(0, previous)
for (let index = 1; index <= STEPS; index += 1) {
  coordinates(index * STEP, current)
  distances[index] = distances[index - 1] + current.distanceTo(previous)
  previous.copy(current)
}
const PERIOD_LENGTH = distances[STEPS]
const WORLD_UP = new Vector3(0, 1, 0)

export function createTrackFrame() {
  return {
    position: new Vector3(),
    tangent: new Vector3(),
    right: new Vector3(),
    up: new Vector3(),
  }
}

export function sampleSpiralTrack(distance, frame) {
  const cycle = Math.floor(distance / PERIOD_LENGTH)
  const local = distance - cycle * PERIOD_LENGTH
  let low = 0
  let high = STEPS
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2)
    if (distances[middle] <= local) low = middle
    else high = middle
  }
  const fraction = (local - distances[low]) / (distances[high] - distances[low])
  const angle = cycle * PERIOD + (low + fraction) * STEP
  const radius = 85 + 3 * Math.sin(angle * 0.5) + 4 * Math.sin(angle * 5)
  const radiusDerivative = 1.5 * Math.cos(angle * 0.5) + 20 * Math.cos(angle * 5)
  coordinates(angle, frame.position)
  frame.tangent.set(
    radiusDerivative * Math.sin(angle) + radius * Math.cos(angle),
    2 + 0.25 * Math.cos(angle * 0.5),
    -radiusDerivative * Math.cos(angle) + radius * Math.sin(angle),
  ).normalize()
  frame.right.crossVectors(frame.tangent, WORLD_UP).normalize()
  frame.up.crossVectors(frame.right, frame.tangent).normalize()
  return frame
}

export function trackPosition(frame, lateral, height, target) {
  return target.copy(frame.position)
    .addScaledVector(frame.right, lateral)
    .addScaledVector(frame.up, height)
}
