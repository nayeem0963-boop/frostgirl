import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Box3, Object3D } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createOrbHaloGeometry, createOrbParts, setOrbTransform } from '../src/game/objects/orbGeometry.js'
import { CRYSTAL_HEIGHT, CRYSTAL_RADIUS, TRACK_SURFACE_Y } from '../src/game/systems/runGeometry.js'

test('orb asset is batched, centered in every lane, and clears the track throughout its animation', async () => {
  const bytes = await readFile(new URL('../public/assets/collectibles/orb_of_chi.glb', import.meta.url))
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  const gltf = await new Promise((resolve, reject) => {
    new GLTFLoader().parse(data, '', resolve, reject)
  })
  const parts = createOrbParts(gltf.scene, () => {})
  assert.ok(parts.length > 0 && parts.length < 11)
  const localBounds = new Box3()
  for (const part of parts) {
    part.geometry.computeBoundingBox()
    localBounds.union(part.geometry.boundingBox)
  }
  const diameter = localBounds.max.y - localBounds.min.y
  assert.ok(diameter >= 0.54 * 1.2 && diameter <= 0.54 * 1.25)
  const halo = createOrbHaloGeometry()
  halo.computeBoundingBox()
  const transform = new Object3D()
  for (const lane of [-1, 0, 1]) {
    for (let distance = 0; distance < 20; distance += 0.2) {
      setOrbTransform(transform, { lane, z: -12, active: true }, 1.15, distance)
      const bounds = localBounds.clone().applyMatrix4(transform.matrix)
      const haloBounds = halo.boundingBox.clone().applyMatrix4(transform.matrix)
      assert.ok(bounds.min.y > TRACK_SURFACE_Y)
      assert.ok(haloBounds.min.y > TRACK_SURFACE_Y)
      assert.ok(Math.abs(transform.position.y - (CRYSTAL_HEIGHT + diameter / 2 - CRYSTAL_RADIUS * 0.9)) <= 0.01201)
      assert.equal(transform.position.x, lane * 1.15)
      assert.ok(haloBounds.min.x > lane * 1.15 - 1.15 / 2)
      assert.ok(haloBounds.max.x < lane * 1.15 + 1.15 / 2)
      assert.ok(bounds.max.y - bounds.min.y <= diameter * 1.021)
    }
  }
  setOrbTransform(transform, { lane: 0, z: -12, active: false }, 1.15, 0)
  assert.equal(transform.scale.x, 0)
  halo.dispose()
  for (const { geometry, material } of parts) {
    geometry.dispose()
    material.dispose()
  }
})
