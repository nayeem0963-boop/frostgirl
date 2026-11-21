import { DataTexture, Float32BufferAttribute, LinearFilter, PlaneGeometry, RepeatWrapping, RGBAFormat, SRGBColorSpace } from 'three'
import { SEGMENT_LENGTH } from '../systems/trackMotion.js'

export function snowHeight(x, z) {
  const edge = Math.max(0, Math.min(1, (Math.abs(x) - 2.7) / 3))
  const blend = edge * edge * (3 - 2 * edge)
  const phase = z * Math.PI * 2 / SEGMENT_LENGTH
  const wave = 0.62 + 0.24 * Math.cos(phase) + 0.16 * Math.cos(phase * 2)
    + 0.11 * Math.sin(phase) * Math.sin(x * 0.35)
  return blend * wave
}

export function createSnowSegment() {
  const geometry = new PlaneGeometry(40, SEGMENT_LENGTH, 60, 16)
  const position = geometry.attributes.position
  const colors = []
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index)
    const z = -position.getY(index)
    position.setZ(index, snowHeight(x, z))
    const edge = Math.max(0, Math.min(1, (Math.abs(x) - 1.65) / 2.1))
    const blend = edge * edge * (3 - 2 * edge)
    const phase = z * Math.PI * 2 / SEGMENT_LENGTH
    const variation = 0.035 * Math.cos(phase) * Math.cos(x * 0.8)
      + 0.025 * (1 - blend) * Math.cos(phase * 2 + x * 1.3)
      + 0.012 * (1 - blend) * Math.sin(phase * 3 - x * 2.1)
      + 0.014 * blend * Math.cos(phase * 2 + x * 0.42)
    const border = Math.max(0, 1 - Math.abs(Math.abs(x) - 3.1) / 0.8) * (0.035 + 0.012 * Math.cos(phase))
    colors.push(0.48 + blend * 0.37 + variation + border, 0.64 + blend * 0.26 + variation + border, 0.79 + blend * 0.15 + variation + border)
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.rotateX(-Math.PI / 2)
  geometry.computeVertexNormals()
  return geometry
}

export function configureIceSurface(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying float iceAmount;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\niceAmount = 1.0 - smoothstep(1.65, 3.75, abs(position.x));')
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float iceAmount;')
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= mix(1.0, 0.62, iceAmount);')
}

export function createSnowTexture() {
  const size = 128
  const pixels = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size * Math.PI * 2
      const v = y / size * Math.PI * 2
      const variation = 7 * Math.sin(u * 3 + Math.sin(v * 2)) * Math.cos(v * 3 - u)
        + 4 * Math.cos(u * 7 + v * 5) + Math.sin(u * 13 - v * 11)
      const value = 232 + variation
      pixels.set([value, Math.min(255, value + 3), Math.min(255, value + 5), 255], (y * size + x) * 4)
    }
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(4, 2)
  texture.colorSpace = SRGBColorSpace
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  texture.needsUpdate = true
  return texture
}

