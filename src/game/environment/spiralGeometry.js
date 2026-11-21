import { BufferAttribute, BufferGeometry, DynamicDrawUsage } from 'three'
import { sampleSpiralTrack, SPIRAL_ROAD_HALF_WIDTH, SPIRAL_SECTION_LENGTH, trackPosition } from '../systems/spiralTrack.js'

export const SPIRAL_ROWS = 8
export const SPIRAL_EDGES = [-SPIRAL_ROAD_HALF_WIDTH, -3.04, -0.595, -0.555, 0.555, 0.595, 3.04, SPIRAL_ROAD_HALF_WIDTH]
const STRIPS = SPIRAL_EDGES.length - 1
const COLORS = [
  [0.66, 0.72, 0.72], [0.51, 0.63, 0.65], [0.68, 0.77, 0.77],
  [0.51, 0.63, 0.65], [0.68, 0.77, 0.77], [0.51, 0.63, 0.65],
  [0.66, 0.72, 0.72],
]

export function createSpiralSection() {
  const geometry = new BufferGeometry()
  const vertexCount = (SPIRAL_ROWS + 1) * STRIPS * 2
  const positions = new BufferAttribute(new Float32Array(vertexCount * 3), 3)
  const normals = new BufferAttribute(new Float32Array(vertexCount * 3), 3)
  const colors = new BufferAttribute(new Float32Array(vertexCount * 3), 3)
  const indices = []
  positions.setUsage(DynamicDrawUsage)
  normals.setUsage(DynamicDrawUsage)
  for (let row = 0; row <= SPIRAL_ROWS; row += 1) {
    for (let strip = 0; strip < STRIPS; strip += 1) {
      const vertex = (row * STRIPS + strip) * 2
      colors.setXYZ(vertex, ...COLORS[strip])
      colors.setXYZ(vertex + 1, ...COLORS[strip])
      if (row < SPIRAL_ROWS) {
        const next = vertex + STRIPS * 2
        indices.push(vertex, vertex + 1, next, vertex + 1, next + 1, next)
      }
    }
  }
  geometry.setAttribute('position', positions)
  geometry.setAttribute('normal', normals)
  geometry.setAttribute('color', colors)
  geometry.setIndex(indices)
  return geometry
}

export function updateSpiralSection(geometry, section, anchor, frame, point) {
  const start = section * SPIRAL_SECTION_LENGTH
  sampleSpiralTrack(start, frame)
  anchor.copy(frame.position)
  const positions = geometry.attributes.position
  const normals = geometry.attributes.normal
  const colors = geometry.attributes.color
  for (let row = 0; row <= SPIRAL_ROWS; row += 1) {
    const distance = start + row * SPIRAL_SECTION_LENGTH / SPIRAL_ROWS
    sampleSpiralTrack(distance, frame)
    for (let strip = 0; strip < STRIPS; strip += 1) {
      for (let edge = 0; edge < 2; edge += 1) {
        const vertex = (row * STRIPS + strip) * 2 + edge
        trackPosition(frame, SPIRAL_EDGES[strip + edge], 0, point).sub(anchor)
        positions.setXYZ(vertex, point.x, point.y, point.z)
        normals.setXYZ(vertex, frame.up.x, frame.up.y, frame.up.z)
        const variation = 0.035 * Math.sin(distance * 0.11 + SPIRAL_EDGES[strip + edge] * 1.3)
          + 0.025 * Math.sin(distance * 0.31 - SPIRAL_EDGES[strip + edge] * 2)
        const base = COLORS[strip]
        colors.setXYZ(vertex, base[0] + variation, base[1] + variation, base[2] + variation)
      }
    }
  }
  positions.needsUpdate = true
  normals.needsUpdate = true
  colors.needsUpdate = true
  geometry.computeBoundingSphere()
}
