// Obstacle row generator: weighted patterns, checked for fairness against the
// previous row, deterministic for a given random source. Pure.
//
// A "row" is {kind: 'wall'|'ridge'|'arch', lanes: [lane indices]} (ridge/arch always span all lanes).
// Every row is reachable from any lane the player can be in after the previous row:
//   needed time = REACTION + lane shifts * SHIFT_TIME.
export const REACTION = 0.45
export const SHIFT_TIME = 0.24
export const ACTION_RECOVER = { wall: 0, wolf: 0, shard: 0, ridge: 1.15, arch: 1.1 } // min seconds between an action row and the next row

const ALL = [0, 1, 2]
/** Lanes a row leaves open: walls, wolves and crystal shards block their lanes, ridges and arches (jump / duck rows) block none. */
export const blocksLanes = (row) => row.kind === 'wall' || row.kind === 'wolf' || row.kind === 'shard'
export const openLanes = (row) => (blocksLanes(row) ? ALL.filter((l) => !row.lanes.includes(l)) : ALL)
const needsAction = (row) => row.kind !== 'wall'

/** Worst-case lane shifts needed to get from any lane in `from` to some lane in `to`. */
export function worstShift(from, to) {
  let worst = 0
  for (const p of from) {
    let best = 9
    for (const q of to) best = Math.min(best, Math.abs(p - q))
    worst = Math.max(worst, best)
  }
  return worst
}

/** Minimum seconds between two consecutive rows so that the second is always fair. */
export function minGap(prev, next) {
  if (!prev) return 0
  const shifts = worstShift(openLanes(prev), openLanes(next))
  let need = REACTION + shifts * SHIFT_TIME
  if (needsAction(prev)) need = Math.max(need, ACTION_RECOVER[prev.kind] + (needsAction(next) ? 0.1 : 0))
  return need
}

/** Gap (s) the generator aims for: wide at the start, tightening with `d` (0..1 difficulty). */
export const baseGap = (d) => 2.0 - 0.75 * d

export const sig = (row) => `${row.kind}:${row.lanes.join('')}`

// Patterns are sequences of rows; later rows of a pattern use `gapScale` of the base gap (never below minGap).
function patterns(r, d, n, last, w = {}) {
  const sideOf = (l) => (l === 0 ? -1 : l === 2 ? 1 : (r() < 0.5 ? -1 : 1)) // a wolf comes from the nearer edge of the trail (lane 1: either)
  const lane = () => Math.floor(r() * 3)
  const pick = (arr) => arr[Math.floor(r() * arr.length)]
  const list = []
  // `w` = a world's pattern-weight multipliers (default 1 each); a multiplier of 0 removes the pattern
  const add = (id, weight, make) => { const m = w[id] ?? 1; if (weight > 0 && m > 0) list.push({ weight: weight * m, make }) }
  add('wall1', n < 3 ? 6 : 4 - 2 * d, () => [{ kind: 'wall', lanes: [lane()] }])
  add('wall2', d > 0.12 && n > 3 ? 1.5 + 2.5 * d : 0, () => { const open = lane(); return [{ kind: 'wall', lanes: ALL.filter((l) => l !== open) }] })
  add('ridge', n >= 2 ? 2 : 0, () => [{ kind: 'ridge', lanes: ALL }])
  add('arch', n >= 3 ? 2 : 0, () => [{ kind: 'arch', lanes: ALL }])
  // two single walls in different lanes, close enough to feel like a slalom
  add('slalom', d > 0.2 ? 1.8 : 0, () => { const a = lane(); const b = pick(ALL.filter((l) => l !== a)); return [{ kind: 'wall', lanes: [a] }, { kind: 'wall', lanes: [b] }] })
  add('wallRidge', d > 0.3 ? 1.5 : 0, () => [{ kind: 'wall', lanes: [lane()] }, { kind: 'ridge', lanes: ALL }])
  add('archWall', d > 0.45 ? 1.5 : 0, () => [{ kind: 'arch', lanes: ALL }, { kind: 'wall', lanes: [lane()] }])
  add('zigzag', d > 0.6 ? 1.2 : 0, () => { const open = lane(); const open2 = pick(ALL.filter((l) => l !== open)); return [{ kind: 'wall', lanes: ALL.filter((l) => l !== open) }, { kind: 'wall', lanes: ALL.filter((l) => l !== open2) }] })
  // Hazards that only some worlds use: their weight is the world's own number (0 / missing = never), not a multiplier.
  const opt = (id, weight, make) => { const m = w[id] ?? 0; if (weight > 0 && m > 0) list.push({ weight: weight * m, make }) }
  opt('wolf', d > 0.06 && n > 2 ? 2 : 0, () => { const l = lane(); return [{ kind: 'wolf', lanes: [l], side: sideOf(l) }] })
  opt('wolfWall', d > 0.2 ? 1.6 : 0, () => { const a = lane(); const b = pick(ALL.filter((l) => l !== a)); return [{ kind: 'wolf', lanes: [a], side: sideOf(a) }, { kind: 'wall', lanes: [b] }] })
  opt('wolfPair', d > 0.4 ? 1.3 : 0, () => { const open = lane(); return [{ kind: 'wolf', lanes: ALL.filter((l) => l !== open), side: sideOf(1) }] }) // two wolves side by side, one lane open
  opt('shard', d > 0.06 && n > 2 ? 2 : 0, () => [{ kind: 'shard', lanes: [lane()] }])
  opt('shardWall', d > 0.2 ? 1.6 : 0, () => { const a = lane(); const b = pick(ALL.filter((l) => l !== a)); return [{ kind: 'shard', lanes: [a] }, { kind: 'wall', lanes: [b] }] })
  opt('shardPair', d > 0.4 ? 1.3 : 0, () => { const open = lane(); return [{ kind: 'shard', lanes: ALL.filter((l) => l !== open) }] }) // two spires side by side, one lane open
  void last
  return list
}

/**
 * Pick the next group of rows. `state` = {n, history: string[], lastRow}. Returns {rows: [{row, gap}], }
 * where `gap` is the seconds between the previous row and this one.
 */
export function nextPattern(state, r, d, weights = {}) {
  const list = patterns(r, d, state.n, state.lastRow, weights)
  for (let attempt = 0; attempt < 12; attempt++) {
    const total = list.reduce((s, p) => s + p.weight, 0)
    let x = r() * total
    const p = list.find((q) => (x -= q.weight) < 0) ?? list[0]
    const rows = p.make()
    // repetition: never the same row signature three times in a row; never the same action kind 3 times
    const h = state.history
    const bad = rows.some((row, i) => {
      const hist = [...h, ...rows.slice(0, i).map(sig)]
      const s = sig(row)
      if (hist.length >= 2 && hist[hist.length - 1] === s && hist[hist.length - 2] === s) return true
      if (needsAction(row)) { const k = hist.slice(-2).map((x) => x.split(':')[0]); if (k.length === 2 && k[0] === row.kind && k[1] === row.kind) return true }
      return false
    })
    if (bad) continue
    // fairness against the previous row (and inside the pattern)
    let prev = state.lastRow
    const out = []
    let ok = true
    for (let i = 0; i < rows.length; i++) {
      const gap = Math.max(baseGap(d) * (i === 0 ? 1 : 0.8), minGap(prev, rows[i]) + 0.12)
      if (i > 0 && gap > baseGap(d) * 0.8 + 0.5) { ok = false; break } // a combo whose rows cannot be close enough is dropped
      out.push({ row: rows[i], gap })
      prev = rows[i]
    }
    if (!ok) continue
    return out
  }
  const row = { kind: 'wall', lanes: [Math.floor(r() * 3)] }
  return [{ row, gap: Math.max(baseGap(d), minGap(state.lastRow, row) + 0.12) }]
}
