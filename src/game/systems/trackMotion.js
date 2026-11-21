import { TRACK_NEAR_Z } from './runGeometry.js'

export const SEAM_ROWS = 42
export const SEAM_SPACING = 4.5
export const TRACK_DETAIL_CYCLE = SEAM_ROWS * SEAM_SPACING
export const SEGMENT_LENGTH = 24
export const SEGMENT_COUNT = 10

export function recycledPosition(initialOffset, distance, cycle) {
  const offset = ((initialOffset - distance) % cycle + cycle) % cycle
  return TRACK_NEAR_Z - offset
}

export function trackDetailPosition(initialOffset, distance) {
  return recycledPosition(initialOffset, distance, TRACK_DETAIL_CYCLE)
}

export function segmentPosition(index, distance) {
  return recycledPosition(index * SEGMENT_LENGTH, distance, SEGMENT_COUNT * SEGMENT_LENGTH)
}
