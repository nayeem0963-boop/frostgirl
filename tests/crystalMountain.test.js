import test from 'node:test'
import assert from 'node:assert/strict'
import { DoubleSide, Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Vector3 } from 'three'
import {
  createMountainSection, createShelfSection, innerShelfReach, MOUNTAIN_SECTION_HEIGHT,
  mountainRadius, projectToShelf, SHELF_COLUMNS, SHELF_SECTION_LENGTH, shelfHeight, updateMountainSection, updateShelfSection,
} from '../src/game/environment/crystalMountainGeometry.js'
import { mountainPlacements, mountainZone } from '../src/game/environment/crystalMountainLayout.js'
import { createMountainForestGeometries } from '../src/game/environment/forestGeometry.js'
import { configureRunnerCamera } from '../src/game/systems/runnerCamera.js'
import { createSpiralCameraState, updateSpiralCamera } from '../src/game/systems/spiralCamera.js'
import { runSettings } from '../src/game/systems/runSimulation.js'
import { createTrackFrame, sampleSpiralTrack, SPIRAL_ROAD_HALF_WIDTH, trackPosition } from '../src/game/systems/spiralTrack.js'

test('mountain and shelf sections connect and remain outside the road', () => {
  const first = createMountainSection()
  const second = createMountainSection()
  const shelfA = createShelfSection()
  const shelfB = createShelfSection()
  const frame = createTrackFrame()
  const anchorA = new Vector3()
  const anchorB = new Vector3()
  const point = new Vector3()
  for (const section of [-10, 0, 7, 1000]) {
    updateMountainSection(first, section)
    updateMountainSection(second, section + 1)
    const a = first.attributes.position
    const b = second.attributes.position
    const rowSize = b.count / 5
    for (let i = 0; i < rowSize; i += 1) {
      const top = new Vector3().fromBufferAttribute(a, rowSize * 4 + i).add(new Vector3(0, section * MOUNTAIN_SECTION_HEIGHT, 0))
      const bottom = new Vector3().fromBufferAttribute(b, i).add(new Vector3(0, (section + 1) * MOUNTAIN_SECTION_HEIGHT, 0))
      assert.ok(top.distanceTo(bottom) < 1e-5)
      const normal = new Vector3().fromBufferAttribute(first.attributes.normal, i)
      assert.ok(normal.dot(new Vector3(a.getX(i), 0, a.getZ(i))) > 0)
    }
    updateShelfSection(shelfA, section, anchorA, frame, point)
    updateShelfSection(shelfB, section + 1, anchorB, frame, point)
    for (let i = 0; i < SHELF_COLUMNS; i += 1) {
      const end = new Vector3().fromBufferAttribute(shelfA.attributes.position, 16 * SHELF_COLUMNS + i).add(anchorA)
      const start = new Vector3().fromBufferAttribute(shelfB.attributes.position, i).add(anchorB)
      assert.ok(end.distanceTo(start) < 1e-5)
      const endNormal = new Vector3().fromBufferAttribute(shelfA.attributes.normal, 16 * SHELF_COLUMNS + i)
      const startNormal = new Vector3().fromBufferAttribute(shelfB.attributes.normal, i)
      assert.ok(endNormal.distanceTo(startNormal) < 1e-6)
    }
  }
  for (let distance = 0; distance < 4000; distance += 0.5) {
    sampleSpiralTrack(distance, frame)
    const reach = innerShelfReach(frame)
    assert.ok(Number.isFinite(reach) && reach > SPIRAL_ROAD_HALF_WIDTH)
    assert.ok(Math.abs(shelfHeight(SPIRAL_ROAD_HALF_WIDTH, reach)) < 1e-10)
    trackPosition(frame, SPIRAL_ROAD_HALF_WIDTH, 0, point)
    // The global maximum radius bounds the whole faceted core, not only sampled angles.
    assert.ok(Math.hypot(point.x, point.z) > 71.4 + 1 + 0.65 + 0.35 + 1)
    assert.ok(mountainRadius(Math.atan2(point.z, point.x), point.y) < Math.hypot(point.x, point.z))
  }
  for (const geometry of [first, second, shelfA, shelfB]) geometry.dispose()
})

test('scenery is projected onto the actual recycled shelf rather than an approximate height', () => {
  const geometry = createShelfSection()
  const material = new MeshBasicMaterial()
  const mesh = new Mesh(geometry, material)
  const ray = new Raycaster()
  const hits = []
  const frame = createTrackFrame()
  const anchor = new Vector3()
  const point = new Vector3()
  const normal = new Vector3()
  for (let section = -5; section < 130; section += 1) {
    const placements = mountainPlacements(section)
    const objects = [...placements.trees, ...placements.crystals, ...(placements.lake ? [placements.lake] : [])]
    for (const object of objects) {
      updateShelfSection(geometry, Math.floor(object.distance / SHELF_SECTION_LENGTH), anchor, frame, point)
      mesh.position.copy(anchor)
      mesh.updateMatrixWorld()
      sampleSpiralTrack(object.distance, frame)
      projectToShelf(mesh, ray, hits, frame, object.lateral, -0.1, point, normal)
      assert.ok(Math.abs(point.y - (hits[0].point.y - 0.1)) < 1e-8)
      assert.ok(normal.y > 0.5)
    }
  }
  sampleSpiralTrack(0, frame)
  assert.throws(() => projectToShelf(mesh, ray, hits, frame, 0, 0, point, normal), /does not intersect/)
  geometry.dispose()
  material.dispose()
})

test('zone transitions and scenery are deterministic, bounded and outside nearby road sections', () => {
  let previous = mountainZone(0)
  const frame = createTrackFrame()
  const nearby = createTrackFrame()
  const position = new Vector3()
  for (let distance = 1; distance <= 2200; distance += 1) {
    const zone = mountainZone(distance)
    assert.ok(zone.forest <= previous.forest && zone.crystals >= previous.crystals && zone.clouds >= previous.clouds)
    assert.ok(Math.abs(zone.forest - previous.forest) < 0.01)
    assert.ok(Math.abs(zone.crystals - previous.crystals) < 0.01)
    assert.ok(Math.abs(zone.clouds - previous.clouds) < 0.01)
    previous = zone
  }
  for (let section = -5; section < 130; section += 1) {
    const placements = mountainPlacements(section)
    assert.deepEqual(placements, mountainPlacements(section))
    assert.ok(placements.trees.length <= 4 && placements.crystals.length <= 1)
    const objects = [
      ...placements.trees.map((tree) => [tree, tree.scale * Math.max(1, tree.width) * 1.5]),
      ...placements.crystals.map((crystal) => [crystal, crystal.scale * 1.1]),
      ...(placements.lake ? [[placements.lake, 3.2]] : []),
      ...(placements.ridge ? [[placements.ridge, 17]] : []),
    ]
    for (const [object, radius] of objects) {
      sampleSpiralTrack(object.distance, frame)
      trackPosition(frame, object.lateral, 0, position)
      for (let offset = -24; offset <= 24; offset += 2) {
        sampleSpiralTrack(object.distance + offset, nearby)
        const horizontal = Math.hypot(position.x - nearby.position.x, position.z - nearby.position.z)
        assert.ok(horizontal > SPIRAL_ROAD_HALF_WIDTH + radius, `section ${section}, offset ${offset}`)
      }
    }
  }
})

test('pines include openings, isolated trees, varied clusters and sizes', () => {
  const sections = Array.from({ length: 30 }, (_, section) => mountainPlacements(section).trees)
  assert.ok(sections.some((trees) => trees.length === 0))
  assert.ok(sections.some((trees) => trees.length === 1))
  assert.ok(sections.some((trees) => trees.length === 4))
  const sizes = sections.flat().map((tree) => tree.scale)
  assert.ok(Math.min(...sizes) < 1 && Math.max(...sizes) > 1.6)
  const widths = sections.flat().map((tree) => tree.width)
  assert.ok(Math.max(...widths) - Math.min(...widths) > 0.25)
})

test('mountain pines do not obscure lane sightlines at representative distances', () => {
  const geometries = createMountainForestGeometries()
  const shelf = new Mesh(createShelfSection(), new MeshBasicMaterial())
  const material = new MeshBasicMaterial({ side: DoubleSide })
  const frame = createTrackFrame()
  const anchor = new Vector3()
  const point = new Vector3()
  const normal = new Vector3()
  const groundRay = new Raycaster()
  const hits = []
  const camera = new PerspectiveCamera()
  configureRunnerCamera(camera, { width: 390, height: 844 }, runSettings.playerZ)
  for (const distance of [20, 300, 650, 950, 1400, 1740]) {
    updateSpiralCamera(camera, createSpiralCameraState(), distance, 0, true)
    camera.updateMatrixWorld()
    sampleSpiralTrack(distance, frame)
    const height = frame.position.y
    const trees = []
    const section = Math.floor(distance / SHELF_SECTION_LENGTH)
    for (let offset = -3; offset <= 3; offset += 1) {
      for (const tree of mountainPlacements(section + offset).trees) {
        updateShelfSection(shelf.geometry, Math.floor(tree.distance / SHELF_SECTION_LENGTH), anchor, frame, point)
        shelf.position.copy(anchor)
        shelf.updateMatrixWorld()
        sampleSpiralTrack(tree.distance, frame)
        projectToShelf(shelf, groundRay, hits, frame, tree.lateral, -0.1, point, normal)
        const mesh = new Mesh(geometries[tree.variant], material)
        mesh.position.copy(point)
        mesh.position.y -= height
        mesh.rotation.set(0, tree.rotation, tree.lean)
        mesh.scale.set(tree.scale * tree.width, tree.scale, tree.scale * tree.width)
        mesh.updateMatrixWorld()
        trees.push(mesh)
      }
    }
    sampleSpiralTrack(distance + 5 * runSettings.minReactionTime, frame)
    for (const lane of [-2, 0, 2]) {
      trackPosition(frame, lane, 0.6, point)
      point.y -= height
      const ray = new Raycaster(camera.position, new Vector3().subVectors(point, camera.position).normalize(), 0, camera.position.distanceTo(point) - 0.05)
      assert.equal(ray.intersectObjects(trees).length, 0, `distance ${distance}, lane ${lane}`)
    }
  }
  geometries.forEach((geometry) => geometry.dispose())
  shelf.geometry.dispose()
  shelf.material.dispose()
  material.dispose()
})

test('shoulders meet the road and their varied outer surfaces stay below the gameplay corridor', () => {
  const geometry = createShelfSection()
  const frame = createTrackFrame()
  const anchor = new Vector3()
  const point = new Vector3()
  let minimum = Infinity
  let maximum = -Infinity
  for (let section = 0; section < 100; section += 1) {
    updateShelfSection(geometry, section, anchor, frame, point)
    for (let row = 0; row <= 16; row += 1) {
      const distance = section * SHELF_SECTION_LENGTH + row * 2
      sampleSpiralTrack(distance, frame)
      const positions = geometry.attributes.position
      for (const [column, lateral] of [[4, -SPIRAL_ROAD_HALF_WIDTH], [5, SPIRAL_ROAD_HALF_WIDTH]]) {
        const actual = new Vector3().fromBufferAttribute(positions, row * SHELF_COLUMNS + column).add(anchor)
        const roadEdge = trackPosition(frame, lateral, 0, point)
        assert.ok(actual.distanceTo(roadEdge) < 1e-5)
      }
      const height = shelfHeight(-14, innerShelfReach(frame), distance)
      minimum = Math.min(minimum, height)
      maximum = Math.max(maximum, height)
      assert.ok(height < 0)
    }
  }
  assert.ok(maximum - minimum > 0.8)
  geometry.dispose()
})

test('core and nearby shelves do not block lane sightlines at reaction distance', () => {
  const material = new MeshBasicMaterial({ side: DoubleSide })
  const mountain = Array.from({ length: 5 }, () => new Mesh(createMountainSection(), material))
  const shelves = Array.from({ length: 11 }, () => new Mesh(createShelfSection(), material))
  const frame = createTrackFrame()
  const anchor = new Vector3()
  const point = new Vector3()
  const camera = new PerspectiveCamera()
  configureRunnerCamera(camera, { width: 390, height: 844 }, runSettings.playerZ)
  for (let distance = 0; distance < 4000; distance += 16) {
    updateSpiralCamera(camera, createSpiralCameraState(), distance, 0, true)
    camera.updateMatrixWorld()
    sampleSpiralTrack(distance, frame)
    const height = frame.position.y
    const mountainSection = Math.floor(height / MOUNTAIN_SECTION_HEIGHT)
    mountain.forEach((mesh, index) => {
      const section = mountainSection + index - 2
      updateMountainSection(mesh.geometry, section)
      mesh.position.y = section * MOUNTAIN_SECTION_HEIGHT - height
      mesh.updateMatrixWorld()
    })
    shelves.forEach((mesh, index) => {
      const section = Math.floor(distance / SHELF_SECTION_LENGTH) + index - 5
      updateShelfSection(mesh.geometry, section, anchor, frame, point)
      mesh.position.copy(anchor)
      mesh.position.y -= height
      mesh.updateMatrixWorld()
    })
    sampleSpiralTrack(distance + 5 * runSettings.minReactionTime, frame)
    for (const lane of [-2, 0, 2]) {
      trackPosition(frame, lane, 0.6, point)
      point.y -= height
      const ray = new Raycaster(camera.position, new Vector3().subVectors(point, camera.position).normalize(), 0, camera.position.distanceTo(point) - 0.05)
      assert.equal(ray.intersectObjects([...mountain, ...shelves]).length, 0, `distance ${distance}, lane ${lane}`)
    }
  }
  for (const mesh of [...mountain, ...shelves]) mesh.geometry.dispose()
  material.dispose()
})
