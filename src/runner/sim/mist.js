// World 05's dream mist: banks of mist roll in at fixed distances and the fog closes in, so obstacles stay hidden until they are
// near. Pure functions of the run distance (predictable and testable); the renderer reads them for the fog, and the Auto play bot
// only "sees" as far as the fog lets it, so a bot that finishes a mist world is a real fairness check.
//
//   mist = { startAt, period, length, ramp, near, far } (see src/worlds/runnerThemes.js): the first bank starts at `startAt` metres,
//   a bank lasts `length` metres and repeats every `period`; the mist thickens and clears over `ramp` metres at each end.

const smooth = (t) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x) }

/** Mist intensity 0..1 at a distance. 0 outside the banks. */
export function mistAt(dist, mist) {
  if (!mist || dist < mist.startAt) return 0
  const local = (dist - mist.startAt) % mist.period
  if (local > mist.length) return 0
  return smooth(local / mist.ramp) * smooth((mist.length - local) / mist.ramp)
}

/** The fog range at an intensity: the world's normal fog eased toward the mist's. */
export function fogAt(t, fog, mist) {
  if (!mist) return { near: fog.near, far: fog.far }
  return { near: fog.near + (mist.near - fog.near) * t, far: fog.far + (mist.far - fog.far) * t }
}

/** Fraction of an object at `d` metres that is still visible through linear fog with that range (1 = clear, 0 = gone). */
export const visibleAt = (d, range) => Math.min(1, Math.max(0, 1 - (d - range.near) / (range.far - range.near)))

/** How far ahead things can still be seen (at least a quarter visible). Effectively unlimited without mist. */
export const VISIBLE_ENOUGH = 0.25
export const visionRange = (range) => range.near + (1 - VISIBLE_ENOUGH) * (range.far - range.near)
