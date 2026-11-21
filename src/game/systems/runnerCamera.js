export function configureRunnerCamera(camera, viewport, playerZ) {
  const aspect = viewport.width / viewport.height
  const playerDistance = 9.5
  const minimumFov = 48
  const laneFov = 2 * Math.atan(2 / (playerDistance * aspect)) * 180 / Math.PI
  camera.clearViewOffset()
  camera.aspect = aspect
  camera.fov = Math.max(minimumFov, laneFov)
  camera.position.set(0, 3.6, playerZ + playerDistance)
  camera.lookAt(0, 0.8, playerZ - 15)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
}
