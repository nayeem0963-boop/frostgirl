import test from 'node:test'
import assert from 'node:assert/strict'
import { createForestGeometries } from '../src/game/environment/forestGeometry.js'
import { forestPlacement, TREES_PER_SEGMENT } from '../src/game/environment/forestLayout.js'
import { mountainPlacement } from '../src/game/environment/mountainLayout.js'
import { SEGMENT_COUNT, SEGMENT_LENGTH, segmentPosition } from '../src/game/systems/trackMotion.js'
import { runSettings } from '../src/game/systems/runSimulation.js'
import { runnerSettings } from '../src/game/systems/runnerMovement.js'

test('forest variants remain outside the playable lanes and include small and bare trees', () => {
  const geometries = createForestGeometries()
  const extents = geometries.map((geometry) => {
    geometry.computeBoundingBox()
    const box = geometry.boundingBox
    assert.ok(geometry.attributes.position.count > 0)
    assert.equal(geometry.attributes.color.count, geometry.attributes.position.count)
    for (const value of geometry.attributes.position.array) assert.ok(Number.isFinite(value))
    return {
      radius: Math.hypot(
        Math.max(Math.abs(box.min.x), Math.abs(box.max.x)),
        Math.max(Math.abs(box.min.z), Math.abs(box.max.z)),
      ),
      height: Math.max(Math.abs(box.min.y), Math.abs(box.max.y)),
    }
  })
  const seen = new Set()
  const heights = []
  for (let index = 0; index < SEGMENT_COUNT * TREES_PER_SEGMENT; index += 1) {
    const tree = forestPlacement(index)
    if (tree.visible) {
      seen.add(tree.variant)
      heights.push(tree.height)
      const extent = extents[tree.variant]
      const reach = extent.radius * tree.width + extent.height * tree.height * Math.abs(Math.sin(tree.lean))
      assert.ok(Math.abs(tree.x) - reach > runnerSettings.laneSpacing * 1.5 + 0.5)
    }
    assert.ok(tree.localZ > -12 && tree.localZ < 12)
  }
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3, 4, 5])
  assert.ok(Math.min(...heights) < 0.8 && Math.max(...heights) <= 1.35)
  geometries.forEach((geometry) => geometry.dispose())
})

test('forest clusters have deterministic openings without clearing either roadside', () => {
  const clusterSizes = new Set()
  for (let segment = 0; segment < SEGMENT_COUNT; segment += 1) {
    for (let side = 0; side < 2; side += 1) {
      const trees = [0, 1, 2].map((group) => {
        const index = segment * TREES_PER_SEGMENT + group * 2 + side
        const tree = forestPlacement(index)
        assert.deepEqual(tree, forestPlacement(index))
        return tree
      })
      const count = trees.filter((tree) => tree.visible).length
      assert.ok(count >= 2)
      clusterSizes.add(count)
    }
  }
  assert.deepEqual([...clusterSizes].sort(), [2, 3])
})

test('trees follow their segment and recycle beyond the visible approach', () => {
  for (let index = 0; index < SEGMENT_COUNT * TREES_PER_SEGMENT; index += 1) {
    const segment = Math.floor(index / TREES_PER_SEGMENT)
    const { localZ } = forestPlacement(index)
    const position = (distance) => segmentPosition(segment, distance) + SEGMENT_LENGTH / 2 + localZ
    assert.ok(Math.abs((position(1) - position(0.1)) - 0.9) < 1e-8)
  }
  for (let index = 0; index < TREES_PER_SEGMENT; index += 1) {
    const { localZ } = forestPlacement(index)
    const before = segmentPosition(0, 0) + SEGMENT_LENGTH / 2 + localZ
    const after = segmentPosition(0, 0.01) + SEGMENT_LENGTH / 2 + localZ
    assert.ok(before > runSettings.playerZ + 9.5)
    assert.ok(runSettings.playerZ - after > runSettings.spawnFadeEnd)
  }
})

test('mountain scenery remains outside lanes and wraps behind the camera and far fade', () => {
  for (let index = 0; index < SEGMENT_COUNT * 2; index += 1) {
    const mountain = mountainPlacement(index)
    const segment = Math.floor(index / 2)
    assert.ok(Math.abs(mountain.x) - mountain.radius * 1.28 > runnerSettings.laneSpacing * 1.5 + 0.5)
    const position = (distance) => segmentPosition(segment, distance) + SEGMENT_LENGTH / 2 + mountain.localZ
    assert.ok(Math.abs((position(1) - position(0.1)) - 0.9) < 1e-8)
  }
  for (let index = 0; index < 2; index += 1) {
    const { radius, depth, localZ } = mountainPlacement(index)
    const reach = radius * depth * 1.28
    const before = segmentPosition(0, 0) + SEGMENT_LENGTH / 2 + localZ - reach
    const after = segmentPosition(0, 0.01) + SEGMENT_LENGTH / 2 + localZ + reach
    assert.ok(before > runSettings.playerZ + 9.5)
    assert.ok(runSettings.playerZ - after > runSettings.spawnFadeEnd)
  }
})
