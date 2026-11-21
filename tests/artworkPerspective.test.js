import test from 'node:test'
import assert from 'node:assert/strict'
import { PerspectiveCamera, Vector3 } from 'three'
import { configureArtworkCamera } from '../src/game/systems/artworkPerspective.js'
import { CAMERA_FAR, TRACK_FAR_Z, TRACK_SURFACE_Y } from '../src/game/systems/runGeometry.js'
import { runSettings } from '../src/game/systems/runSimulation.js'
import { lanePosition, runnerSettings } from '../src/game/systems/runnerMovement.js'
import { frozenKingdomPerspective as artwork } from '../src/worlds/frozenKingdomPerspective.js'

const playerZ = -3
const viewports = [
  { width: 1012, height: 873 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]

function project(camera, viewport, x, y, z) {
  const point = new Vector3(x, y, z).project(camera)
  return { x: (point.x + 1) * viewport.width / 2, y: (1 - point.y) * viewport.height / 2 }
}

function imagePoint(viewport, point) {
  const scale = Math.max(viewport.width / artwork.width, viewport.height / artwork.height)
  return {
    x: (point.x - (viewport.width - artwork.width * scale) / 2) / scale,
    y: (point.y - (viewport.height - artwork.height * scale) * artwork.backgroundPositionY) / scale,
  }
}

test('camera projection follows the background crop and keeps the player in place on resize', () => {
  const camera = new PerspectiveCamera(42, 1, 0.1, 65)
  for (const viewport of viewports) {
    configureArtworkCamera(camera, viewport, artwork, playerZ)
    const player = project(camera, viewport, 0, TRACK_SURFACE_Y, playerZ)
    assert.ok(Math.abs(player.x - viewport.width / 2) < 1e-8)
    assert.ok(Math.abs(player.y / viewport.height - artwork.playerGroundViewportY) < 1e-8)

    const vanishing = imagePoint(viewport, project(camera, viewport, 0, TRACK_SURFACE_Y, -1e9))
    assert.ok(Math.abs(vanishing.x - artwork.width / 2) < 1e-6)
    assert.ok(Math.abs(vanishing.y - 610) < 1e-5)
  }
})

test('the distant approach remains within the camera and extends over the bridge', () => {
  for (const viewport of viewports) {
    const camera = new PerspectiveCamera(42, 1, 0.1, CAMERA_FAR)
    configureArtworkCamera(camera, viewport, artwork, playerZ)
    for (const distance of [runSettings.spawnFadeStart, runSettings.spawnFadeEnd]) {
      const z = playerZ - distance
      assert.ok(z > TRACK_FAR_Z)
      const center = new Vector3(0, TRACK_SURFACE_Y, z).project(camera)
      assert.ok(center.z < 1 && center.z > -1, `${viewport.width}x${viewport.height} clips distance ${distance}`)
      const point = project(camera, viewport, 0, TRACK_SURFACE_Y, z)
      const image = imagePoint(viewport, point)
      assert.ok(image.y > artwork.horizonY)
      assert.ok(image.y < 800)
      const crystalEdge = project(camera, viewport, 0.3, TRACK_SURFACE_Y, z)
      assert.ok((crystalEdge.x - point.x) * 2 > 2, 'distant crystal is smaller than two pixels')
    }
  }
})

test('all lanes and the track edges project within the illustrated bridge at multiple depths', () => {
  const camera = new PerspectiveCamera(42, 1, 0.1, 65)
  const bridgeSamples = [
    { y: 650, left: 416, right: 510 },
    { y: 800, left: 320, right: 620 },
    { y: 1000, left: 190, right: 765 },
    { y: 1200, left: 55, right: 890 },
  ]
  for (const viewport of viewports) {
    configureArtworkCamera(camera, viewport, artwork, playerZ)
    let checked = 0
    let previousLaneOffset = Infinity
    for (const z of [-3, -10, -25, -40]) {
      const points = [-2.6, -1, 0, 1, 2.6].map((x, index) => {
        const worldX = index > 0 && index < 4 ? lanePosition(x, runnerSettings.laneSpacing) : x
        return imagePoint(viewport, project(camera, viewport, worldX, TRACK_SURFACE_Y, z))
      })
      const laneOffset = points[3].x - points[2].x
      assert.ok(laneOffset < previousLaneOffset, `lane separation at depth ${z}`)
      previousLaneOffset = laneOffset
      const y = points[2].y
      const upper = bridgeSamples.findIndex((sample) => sample.y >= y)
      if (upper <= 0) continue
      checked += 1
      const a = bridgeSamples[upper - 1]
      const b = bridgeSamples[upper]
      const fraction = (y - a.y) / (b.y - a.y)
      const left = a.left + (b.left - a.left) * fraction
      const right = a.right + (b.right - a.right) * fraction
      assert.ok(Math.abs(points[0].x - left) < 30, `left edge at ${y}`)
      assert.ok(Math.abs(points[4].x - right) < 30, `right edge at ${y}`)
      for (const point of points.slice(1, 4)) assert.ok(point.x > left && point.x < right)
    }
    assert.ok(checked >= 3, 'expected multiple depths within the measured bridge')
  }
})
