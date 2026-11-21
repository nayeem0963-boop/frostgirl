import { Color, ConeGeometry, CylinderGeometry, Float32BufferAttribute, SphereGeometry } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

function tint(geometry, color) {
  const shade = new Color(color)
  const colors = []
  for (let index = 0; index < geometry.attributes.position.count; index += 1) {
    colors.push(shade.r, shade.g, shade.b)
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return geometry
}

function merge(parts) {
  const geometry = mergeGeometries(parts)
  parts.forEach((part) => part.dispose())
  return geometry
}

function pine(variant, mountain = false) {
  const shapes = [
    { radii: [0.85, 0.68, 0.46], levels: [0.72, 1.24, 1.75], counts: [6, 5, 4], green: '#315f59', snow: 2 },
    { radii: [0.68, 0.53, 0.34], levels: [0.92, 1.49, 2.03], counts: [5, 5, 4], green: '#355e63', snow: 3 },
    { radii: [1.0, 0.8, 0.51], levels: [0.67, 1.18, 1.68], counts: [7, 6, 5], green: '#396a5d', snow: 1 },
    { radii: [0.94, 0.67, 0.4], levels: [0.84, 1.37, 1.84], counts: [6, 4, 3], green: '#2c5951', snow: 2 },
  ]
  const style = shapes[variant]
  const width = mountain ? [1.08, 0.8, 1.17, 0.91][variant] : 1
  const lean = mountain ? [0.025, -0.035, 0.018, -0.055][variant] : 0
  const top = style.levels[2] + 0.65
  const parts = [
    tint(new CylinderGeometry(0.065, 0.14, top, 6).translate(0, top / 2, 0), '#6f746a'),
    tint(new CylinderGeometry(0.08, 0.38, top - 0.6, 8).translate(0, (top + 0.6) / 2, 0), style.green),
  ]
  for (let tier = 0; tier < style.radii.length; tier += 1) {
    const count = style.counts[tier]
    for (let branch = 0; branch < count; branch += 1) {
      const angle = branch * Math.PI * 2 / count + tier * 0.51 + variant * 0.23
      const asymmetry = (variant === 3 ? 0.22 : 0.07) * Math.cos(angle + tier * 0.8)
      const length = style.radii[tier] * width * (1 + asymmetry
        + (mountain ? 0.18 : 0.1) * Math.sin(branch * 4 + tier))
      const drop = 0.22 + 0.06 * Math.sin(branch + tier)
      const thickness = 0.39 - tier * 0.04
      const foliage = new ConeGeometry(thickness, length, 6)
        .translate(0, length / 2, 0)
        .rotateZ(-Math.PI / 2 - drop)
        .rotateY(-angle)
        .translate(0, style.levels[tier], 0)
      parts.push(tint(foliage, style.green))
      const snowCoverage = mountain ? [2, 3, 2, 1][variant] : style.snow
      if ((branch + tier + variant) % 4 < snowCoverage) {
        const snow = new SphereGeometry(1, 6, 4)
          .scale(length * 0.4, 0.09, thickness * 0.8)
          .translate(length * 0.43, thickness * 1.08, 0)
          .rotateZ(-drop)
          .rotateY(-angle)
          .translate(0, style.levels[tier], 0)
        parts.push(tint(snow, '#e0f0ef'))
      }
    }
  }
  parts.push(tint(new ConeGeometry(style.radii[2] * 0.55, 0.8, 7).translate(0, top - 0.15, 0), style.green))
  return merge(parts).rotateZ(lean)
}

function bareTree() {
  const parts = [tint(new CylinderGeometry(0.055, 0.15, 2.65, 6).translate(0, 1.325, 0), '#647b7a')]
  for (let branch = 0; branch < 7; branch += 1) {
    const side = branch % 2 === 0 ? 1 : -1
    const height = 0.8 + branch * 0.23
    const length = 0.62 - branch * 0.045
    const twig = new CylinderGeometry(0.018, 0.055, length, 5)
      .rotateZ(-side * 0.9)
      .translate(side * length * 0.37, height + length * 0.3, (branch % 3 - 1) * 0.1)
    parts.push(tint(twig, '#6d8584'))
    const snow = new SphereGeometry(1, 6, 4)
      .scale(length * 0.3, 0.045, 0.075)
      .rotateZ(side * 0.16)
      .translate(side * length * 0.55, height + length * 0.53, (branch % 3 - 1) * 0.1)
    parts.push(tint(snow, '#d5eaed'))
  }
  return merge(parts)
}

function distantPine() {
  return merge([
    tint(new CylinderGeometry(0.06, 0.12, 0.65, 6).translate(0, 0.325, 0), '#6f746a'),
    tint(new ConeGeometry(0.67, 1.9, 7).translate(0, 1.45, 0), '#426d68'),
    tint(new ConeGeometry(0.33, 0.92, 7).translate(0, 1.96, 0), '#d9ecee'),
  ])
}

export function createForestGeometries() {
  return [pine(0), pine(1), pine(2), pine(3), bareTree(), distantPine()]
}

export function createMountainForestGeometries() {
  return [pine(0, true), pine(1, true), pine(2, true), pine(3, true)]
}
