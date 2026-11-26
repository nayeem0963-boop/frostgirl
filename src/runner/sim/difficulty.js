// Difficulty levels (6.5). They change only how often and how tightly the generator places obstacles: never the physics (speed curve,
// jump, lane glide, collision boxes), the fairness floor (REACTION / SHIFT_TIME in patterns.js still bound every gap) or the world's own
// atmosphere (mist banks and gust lines stay where they are). Normal is the identity, so the game and its saved bests are unchanged.
export const DIFFICULTY_IDS = ['easy', 'normal', 'hard']
export const DEFAULT_DIFFICULTY = 'normal'

export const DIFFICULTIES = {
  easy: { ramp: 1.5, gap: 1.2, hazard: 0.6 }, // slower build-up (x1.5 the seconds to full difficulty), 20% wider gaps, 40% fewer signature hazards
  normal: { ramp: 1, gap: 1, hazard: 1 },
  hard: { ramp: 0.7, gap: 0.92, hazard: 1.3 }, // quicker build-up, 8% tighter gaps (never below the fairness floor), 30% more signature hazards
}

/** The patterns that carry a world's signature hazard (wolf, crystal shard, ice hole). */
export const HAZARD_PATTERNS = ['wolf', 'wolfWall', 'wolfPair', 'shard', 'shardWall', 'shardPair', 'hole', 'holeWall', 'holePair']

export const modeOf = (id) => DIFFICULTIES[id] ?? DIFFICULTIES[DEFAULT_DIFFICULTY]

/** A world's pattern weights for a difficulty. Normal returns the very same object, so nothing about it can differ. */
export function weightsFor(base, id) {
  const m = modeOf(id)
  if (m.hazard === 1) return base
  const out = { ...base }
  for (const k of HAZARD_PATTERNS) if (typeof out[k] === 'number') out[k] = out[k] * m.hazard
  return out
}
