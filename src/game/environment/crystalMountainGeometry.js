import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Vector3 } from 'three'
import { sampleSpiralTrack, SPIRAL_ROAD_HALF_WIDTH, trackPosition } from '../systems/spiralTrack.js'

export const MOUNTAIN_SECTION_HEIGHT = 16
export const MOUNTAIN_SECTION_COUNT = 24
export const SHELF_SECTION_LENGTH = 32
export const SHELF_SECTION_COUNT = 48
export const OUTER_SHELF_EDGE = 40
const MOUNTAIN_SIDES = 48
const MOUNTAIN_ROWS = 4
const SHELF_ROWS = 16
export const SHELF_COLUMNS = 9
const DOWN = new Vector3(0, -1, 0)

export function projectToShelf(mesh, ray, hits, frame, lateral, height, point, normal) {
  trackPosition(frame, lateral, 0, point)
  ray.set(point.setY(frame.position.y + 10), DOWN)
  ray.far = 25
  hits.length = 0
  ray.intersectObject(mesh, false, hits)
  if (hits.length === 0) throw new Error('Scenery placement does not intersect its terrain section')
  point.copy(hits[0].point).addScaledVector(DOWN, -height)
  normal.copy(hits[0].face.normal)
}

export function mountainRadius(angle, height) {
  return 70.65 + 1.35 * Math.sin(angle * 3 + height * 0.075)
    + 0.8 * Math.sin(angle * 7 - height * 0.12) + 0.5 * Math.sin(angle * 11 + height * 0.19)
}

export function innerShelfReach(frame) {
  const { position, right } = frame
  const projection = position.x * right.x + position.z * right.z
  const difference = position.x ** 2 + position.z ** 2 - 68 ** 2
  return -projection - Math.sqrt(projection ** 2 - difference)
}

export function shelfHeight(lateral, innerReach, distance = 0) {
  const edge = SPIRAL_ROAD_HALF_WIDTH
  if (lateral < 0) {
    const t = (Math.abs(lateral) - edge) / (OUTER_SHELF_EDGE - edge)
    const bank = 0.7 * Math.exp(-(((Math.abs(lateral) - 6) / 2.5) ** 2))
      * (0.7 + 0.3 * Math.sin(distance * 0.035 + 0.5))
    return -6 * t + Math.min(1, t * 5) * (
      0.6 * Math.sin(distance * 0.06 + lateral * 0.35)
      + 0.3 * Math.sin(distance * 0.14 - lateral * 0.22) + bank
      + 0.7 * t * Math.sin(distance * 0.045 + lateral * 0.21)
        * Math.sin(distance * 0.11 - lateral * 0.13))
  }
  const t = (lateral - edge) / (innerReach - edge)
  return -1.2 * t + Math.min(1, t * 4) * 0.25 * Math.sin(distance * 0.1 + lateral * 0.5)
}

function attributeGeometry(vertexCount, indices) {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertexCount * 3), 3).setUsage(DynamicDrawUsage))
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(vertexCount * 3), 3).setUsage(DynamicDrawUsage))
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(vertexCount * 3), 3).setUsage(DynamicDrawUsage))
  geometry.setIndex(indices)
  return geometry
}

export function createMountainSection() {
  const indices = []
  for (let row = 0; row < MOUNTAIN_ROWS; row += 1) {
    for (let side = 0; side < MOUNTAIN_SIDES; side += 1) {
      const a = row * (MOUNTAIN_SIDES + 1) + side
      const b = a + MOUNTAIN_SIDES + 1
      indices.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }
  return attributeGeometry((MOUNTAIN_ROWS + 1) * (MOUNTAIN_SIDES + 1), indices)
}

export function updateMountainSection(geometry, section) {
  const positions = geometry.attributes.position
  const normals = geometry.attributes.normal
  const colors = geometry.attributes.color
  for (let row = 0; row <= MOUNTAIN_ROWS; row += 1) {
    const height = (section + row / MOUNTAIN_ROWS) * MOUNTAIN_SECTION_HEIGHT
    for (let side = 0; side <= MOUNTAIN_SIDES; side += 1) {
      const angle = side * Math.PI * 2 / MOUNTAIN_SIDES
      const radius = mountainRadius(angle, height)
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      const angleDerivative = 4.05 * Math.cos(angle * 3 + height * 0.075)
        + 5.6 * Math.cos(angle * 7 - height * 0.12) + 5.5 * Math.cos(angle * 11 + height * 0.19)
      const heightDerivative = 0.10125 * Math.cos(angle * 3 + height * 0.075)
        - 0.096 * Math.cos(angle * 7 - height * 0.12) + 0.095 * Math.cos(angle * 11 + height * 0.19)
      const nx = cos + angleDerivative / radius * sin
      const ny = -heightDerivative
      const nz = sin - angleDerivative / radius * cos
      const normalLength = Math.hypot(nx, ny, nz)
      const index = row * (MOUNTAIN_SIDES + 1) + side
      positions.setXYZ(index, radius * cos, height - section * MOUNTAIN_SECTION_HEIGHT, radius * sin)
      normals.setXYZ(index, nx / normalLength, ny / normalLength, nz / normalLength)
      const altitude = Math.max(0, Math.min(1, height / 55))
      const snow = Math.max(0, Math.min(1, 0.2 + 2.4 * ny / normalLength
        + 0.3 * altitude + 0.18 * Math.sin(angle * 5 + height * 0.09)))
      const light = 0.025 * Math.sin(angle * 13 + height * 0.19)
      colors.setXYZ(index, 0.21 + 0.39 * snow + light, 0.24 + 0.4 * snow + light, 0.26 + 0.4 * snow + light)
    }
  }
  positions.needsUpdate = true
  normals.needsUpdate = true
  colors.needsUpdate = true
  geometry.computeBoundingSphere()
}

export function createShelfSection() {
  const indices = []
  for (let row = 0; row < SHELF_ROWS; row += 1) {
    const a = row * SHELF_COLUMNS
    const b = a + SHELF_COLUMNS
    for (const column of [0, 1, 2, 3, 5, 6]) {
      indices.push(a + column, a + column + 1, b + column, a + column + 1, b + column + 1, b + column)
    }
    indices.push(a + 8, a + 4, b + 8, a + 4, b + 4, b + 8)
  }
  return attributeGeometry((SHELF_ROWS + 1) * SHELF_COLUMNS, indices)
}

export function updateShelfSection(geometry, section, anchor, frame, point) {
  const start = section * SHELF_SECTION_LENGTH
  sampleSpiralTrack(start, frame)
  anchor.copy(frame.position)
  const positions = geometry.attributes.position
  const normals = geometry.attributes.normal
  const colors = geometry.attributes.color
  for (let row = 0; row <= SHELF_ROWS; row += 1) {
    const distance = start + row * SHELF_SECTION_LENGTH / SHELF_ROWS
    sampleSpiralTrack(distance, frame)
    const reach = innerShelfReach(frame)
    const offsets = [-OUTER_SHELF_EDGE, -25, -14, -7, -SPIRAL_ROAD_HALF_WIDTH,
      SPIRAL_ROAD_HALF_WIDTH, (SPIRAL_ROAD_HALF_WIDTH + reach) / 2, reach, -SPIRAL_ROAD_HALF_WIDTH]
    for (let column = 0; column < SHELF_COLUMNS; column += 1) {
      const lateral = offsets[column]
      const index = row * SHELF_COLUMNS + column
      const height = column === 8 ? -4.5 : shelfHeight(lateral, reach, distance)
      trackPosition(frame, lateral, height, point).sub(anchor)
      positions.setXYZ(index, point.x, point.y, point.z)
      if (column === 8) {
        normals.setXYZ(index, -frame.right.x, -frame.right.y, -frame.right.z)
      } else {
        const lateralSlope = (shelfHeight(lateral + 0.02, reach, distance)
          - shelfHeight(lateral - 0.02, reach, distance)) / 0.04
        const forwardSlope = (shelfHeight(lateral, reach, distance + 0.02)
          - shelfHeight(lateral, reach, distance - 0.02)) / 0.04
        const nx = frame.up.x - lateralSlope * frame.right.x - forwardSlope * frame.tangent.x
        const ny = frame.up.y - lateralSlope * frame.right.y - forwardSlope * frame.tangent.y
        const nz = frame.up.z - lateralSlope * frame.right.z - forwardSlope * frame.tangent.z
        const length = Math.hypot(nx, ny, nz)
        normals.setXYZ(index, nx / length, ny / length, nz / length)
      }
      const noise = Math.sin(distance * 0.16 + lateral * 0.41) * Math.sin(distance * 0.035 - lateral * 0.3)
      const altitude = Math.max(0, Math.min(1, frame.position.y / 50))
      const rock = column === 8 ? 0.82 : Math.max(0, noise + 0.05)
        * (column === 4 || column === 5 ? 0.1 : 0.9) * (1 - 0.35 * altitude)
      const edge = column === 3 || column === 6 ? 0.045 + 0.018 * Math.sin(distance * 0.07) : 0
      colors.setXYZ(index, 0.76 - rock * 0.51 - edge, 0.8 - rock * 0.53 - edge, 0.81 - rock * 0.51 - edge * 0.8)
    }
  }
  positions.needsUpdate = true
  normals.needsUpdate = true
  colors.needsUpdate = true
  geometry.computeBoundingSphere()
}
