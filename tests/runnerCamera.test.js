import test from 'node:test'
import assert from 'node:assert/strict'
import { PerspectiveCamera, Vector3 } from 'three'
import { configureRunnerCamera } from '../src/game/systems/runnerCamera.js'
import { CAMERA_FAR, TRACK_SURFACE_Y } from '../src/game/systems/runGeometry.js'
import { runSettings } from '../src/game/systems/runSimulation.js'
import { lanePosition, runnerSettings } from '../src/game/systems/runnerMovement.js'

test('runner camera keeps the player, lanes and distant approach visible across viewports', () => {
  const camera = new PerspectiveCamera(42, 1, 0.1, CAMERA_FAR)
  for (const viewport of [{ width: 1012, height: 873 }, { width: 390, height: 844 }, { width: 320, height: 900 }, { width: 844, height: 390 }]) {
    configureRunnerCamera(camera, viewport, runSettings.playerZ)
    const player = new Vector3(0, TRACK_SURFACE_Y, runSettings.playerZ).project(camera)
    assert.ok(player.y < -0.3 && player.y > -0.8, `${viewport.width}x${viewport.height}: player should be in lower viewport`)
    for (const lane of [-1, 0, 1]) {
      for (const edge of [-0.4, 0.4]) {
        const point = new Vector3(lanePosition(lane, runnerSettings.laneSpacing) + edge, TRACK_SURFACE_Y, runSettings.playerZ).project(camera)
        assert.ok(Math.abs(point.x) < 1, `${viewport.width}x${viewport.height}: lane is clipped`)
      }
    }
    for (const depth of [runSettings.spawnFadeStart, runSettings.spawnFadeEnd]) {
      const point = new Vector3(0, TRACK_SURFACE_Y, runSettings.playerZ - depth).project(camera)
      assert.ok(Math.abs(point.x) < 1 && Math.abs(point.y) < 1 && point.z < 1 && point.z > -1)
    }
    assert.equal(camera.view, null)
  }
})
