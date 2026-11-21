export function mountainPlacement(index) {
  const segment = Math.floor(index / 2)
  const side = index % 2 === 0 ? -1 : 1
  return {
    x: side * (18 + (index * 7) % 4 * 1.15),
    height: 12 + (index * 11) % 6 * 1.5,
    radius: 7.5 + (index * 5) % 4 * 0.65,
    depth: 0.36 + (segment % 3) * 0.04,
    localZ: Math.sin(index * 1.7 + segment * 0.4) * 3,
    rotation: index * 0.47,
  }
}
