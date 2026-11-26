// One optional challenge per world (6.6): a goal tied to the world's signature hazard that asks for skill, not just for finishing.
// Pure rules over the run's tallies (sim.tally). Only a COMPLETED level run counts (not Endless, not a crash). The result is saved as a
// small badge per world; it changes nothing else (no stars, no unlocks, no advantage in play). Thresholds are first guesses: the
// Auto play bot keeps wide margins and never takes the close calls, so they are not validated against a human player.
const close = (run, kind) => run.tally.close[kind] ?? 0

export const CHALLENGES = {
  '01': { text: 'Collect 90% of the orbs', goal: 90, unit: '%', measure: (r) => Math.floor((100 * r.orbs) / Math.max(1, r.seen)) },
  '02': { text: 'Three close calls with wolves', goal: 3, measure: (r) => close(r, 'wolf') },
  '03': { text: 'Three close calls with falling crystals', goal: 3, measure: (r) => close(r, 'shard') },
  '04': { text: 'Jump over four holes in the ice', goal: 4, measure: (r) => r.tally.holesJumped },
  '05': { text: 'Five close calls inside the mist', goal: 5, measure: (r) => r.tally.closeInMist },
  '06': { text: 'Two close calls right after a gust', goal: 2, measure: (r) => r.tally.closeAfterGust },
  '07': { text: 'A close call with a wolf, a crystal and a hole', goal: 1, measure: (r) => Math.min(close(r, 'wolf'), close(r, 'shard'), close(r, 'hole')) },
}

export const hasChallenge = (worldId) => worldId in CHALLENGES

/** The challenge's text and how far this run got. `done` needs a completed level run. */
export function evaluateChallenge(worldId, run) {
  const c = CHALLENGES[worldId]
  if (!c) return null
  const value = Math.max(0, c.measure(run))
  return { text: c.text, goal: c.goal, value: Math.min(value, c.goal), unit: c.unit ?? '', done: run.completed === true && !run.endless && value >= c.goal }
}

/** "2 / 3" style progress for a result screen. */
export const progressLabel = (r) => `${r.value}${r.unit} / ${r.goal}${r.unit}`
