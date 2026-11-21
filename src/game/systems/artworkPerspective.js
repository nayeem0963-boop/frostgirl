import { TRACK_SURFACE_Y } from './runGeometry.js'

export function configureArtworkCamera(camera, viewport, calibration, playerZ) {
  const { width, height, horizonY, focalLength, cameraHeight, playerGroundViewportY, backgroundPositionY } = calibration
  // Match CSS background-size: cover and background-position before projecting into the crop.
  const scale = Math.max(viewport.width / width, viewport.height / height)
  const viewWidth = viewport.width / scale
  const viewHeight = viewport.height / scale
  const offsetY = (height - viewHeight) * backgroundPositionY
  const playerGroundY = offsetY + viewHeight * playerGroundViewportY
  const pitch = Math.atan((height / 2 - horizonY) / focalLength)
  const depth = focalLength * cameraHeight / (Math.cos(pitch) * (playerGroundY - horizonY))
  const distance = (depth - cameraHeight * Math.sin(pitch)) / Math.cos(pitch)
  const cameraY = TRACK_SURFACE_Y + cameraHeight
  const cameraZ = playerZ + distance

  camera.position.set(0, cameraY, cameraZ)
  camera.fov = 2 * Math.atan(height / (2 * focalLength)) * 180 / Math.PI
  camera.lookAt(0, cameraY - Math.tan(pitch), cameraZ - 1)

  camera.setViewOffset(width, height, (width - viewWidth) / 2, offsetY, viewWidth, viewHeight)
  camera.updateMatrixWorld()
}
