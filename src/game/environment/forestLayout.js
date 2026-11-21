export const TREES_PER_SEGMENT = 6

export function forestPlacement(index) {
  const segment = Math.floor(index / TREES_PER_SEGMENT)
  const side = index % 2 === 0 ? -1 : 1
  const group = Math.floor((index % TREES_PER_SEGMENT) / 2)
  const variation = (1 + Math.sin(index * 2.17 + segment * 0.83)) / 2
  const clusterShift = Math.sin(segment * 1.7 + side * 0.9) * 1.1
  return {
    x: side * (5.85 + group * 2 + Math.sin(index * 1.31) * 0.3),
    localZ: -7 + group * 3.3 + clusterShift + (variation - 0.5) * 1.4,
    height: [1.03, 0.76, 0.58][group] + variation * [0.32, 0.34, 0.32][group],
    width: 0.74 + variation * 0.25,
    lean: Math.sin(index * 1.73 + segment * 0.5) * 0.045,
    visible: group !== 2 || (segment * 3 + (side > 0 ? 1 : 0)) % 4 !== 0,
    variant: (segment * 3 + index * 7) % 23 === 0 ? 4
      : group === 2 && (segment + index) % 2 === 0 ? 5 : (segment * 7 + index * 3) % 4,
  }
}
