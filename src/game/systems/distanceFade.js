export function configureDistanceFade(shader, settings) {
  // Fade each instance by world depth without changing its perspective-scaled geometry.
  shader.uniforms.journeyPlayerZ = { value: settings.playerZ }
  shader.uniforms.journeyFadeStart = { value: settings.spawnFadeStart }
  shader.uniforms.journeyFadeEnd = { value: settings.spawnFadeEnd }
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying float journeyOpacity;\nuniform float journeyPlayerZ;\nuniform float journeyFadeStart;\nuniform float journeyFadeEnd;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\njourneyOpacity = 1.0 - smoothstep(journeyFadeStart, journeyFadeEnd, journeyPlayerZ - (modelMatrix * instanceMatrix[3]).z);')
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float journeyOpacity;')
    .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= journeyOpacity;')
}
