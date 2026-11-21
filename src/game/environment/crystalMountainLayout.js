import { SHELF_SECTION_LENGTH } from './crystalMountainGeometry.js'

function random(index, salt) {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453
  return value - Math.floor(value)
}

function smooth(start, end, value) {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)))
  return t * t * (3 - 2 * t)
}

export function mountainZone(distance) {
  return {
    forest: 1 - smooth(450, 1450, distance),
    crystals: smooth(250, 1500, distance),
    clouds: smooth(850, 1550, distance),
  }
}

export function mountainPlacements(section) {
  const distance = (section + 0.18 + random(section, 1) * 0.64) * SHELF_SECTION_LENGTH
  const zone = mountainZone(distance)
  const trees = []
  const cluster = random(section, 5)
  for (let index = 0; index < 4; index += 1) {
    const density = index === 0 ? 0.9 : cluster > 0.75 ? 0.95 : index === 3 ? 0 : 0.25 + cluster * 0.55
    if (random(section, 2 + index) < zone.forest * density) {
      trees.push({
        distance: distance + index * (2.1 + random(section, 26 + index) * 2.4),
        lateral: -10 - random(section, 7 + index) * 10,
        variant: Math.floor(random(section, 12 + index) * 4),
        scale: 0.85 + random(section, 17 + index) * 0.95,
        width: 0.8 + random(section, 51 + index) * 0.35,
        lean: (random(section, 55 + index) - 0.5) * 0.08,
        rotation: random(section, 22 + index) * Math.PI * 2,
      })
    }
  }
  const crystals = []
  if (random(section, 31) < 0.1 + zone.crystals * 0.22) {
    crystals.push({
      distance: distance + 5,
      lateral: 6.4 + random(section, 32) * 1.8,
      scale: 0.55 + zone.crystals * 0.55 + random(section, 33) * 0.3,
      color: Math.floor(random(section, 34) * 3),
      rotation: random(section, 35) * Math.PI * 2,
    })
  }
  const lake = zone.forest > 0.3 && random(section, 42) < 0.16
    ? { distance: distance - 5, lateral: -14 } : null
  const cloud = random(section, 43) < zone.clouds * 0.3
    ? { distance: distance + 8, lateral: -28, height: -8 - random(section, 44) * 4 } : null
  const ridge = random(section, 45) < 0.6
    ? { distance: distance + 12, lateral: -32, rotation: random(section, 46) * Math.PI * 2 } : null
  return { distance, trees, crystals, lake, cloud, ridge }
}
