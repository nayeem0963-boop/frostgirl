import test from 'node:test'
import assert from 'node:assert/strict'
import { createSim, startRun, update } from '../src/runner/sim/sim.js'
import { createBot, botStep } from '../src/runner/sim/bot.js'
import { nextPattern, minGap, baseGap } from '../src/runner/sim/patterns.js'
import { DIFFICULTIES, DIFFICULTY_IDS, HAZARD_PATTERNS, weightsFor, modeOf } from '../src/runner/sim/difficulty.js'
import { themeFor, worldIds } from '../src/worlds/runnerThemes.js'
import { mulberry32 } from '../src/runner/sim/sim.js'

test('Normal is the identity: same weights object, same generator, same rows as before the option existed', () => {
  assert.deepEqual(DIFFICULTIES.normal, { ramp: 1, gap: 1, hazard: 1 })
  for (const id of worldIds) { const w = themeFor(id); assert.equal(weightsFor(w.patternWeights, 'normal'), w.patternWeights) }
  assert.equal(weightsFor({ wolf: 2 }, undefined) && modeOf('???').gap, 1) // unknown id behaves as Normal
  for (const id of ['01', '02', '07']) for (const seed of [3, 4]) {
    const a = createSim(seed, themeFor(id)); startRun(a, seed)
    const b = createSim(seed, themeFor(id)); startRun(b, seed, { difficulty: 'normal' })
    assert.deepEqual(a.obstacles.map((o) => [o.kind, o.lane, o.dist]), b.obstacles.map((o) => [o.kind, o.lane, o.dist]))
  }
})

test('levels are ordered: easy < normal < hard for gap, ramp speed and hazard share; physics constants are not part of a level', () => {
  const [e, n, h] = DIFFICULTY_IDS.map((i) => DIFFICULTIES[i])
  assert.ok(e.gap > n.gap && n.gap > h.gap)
  assert.ok(e.ramp > n.ramp && n.ramp > h.ramp)
  assert.ok(e.hazard < n.hazard && n.hazard < h.hazard)
  assert.deepEqual(Object.keys(DIFFICULTIES.hard).sort(), ['gap', 'hazard', 'ramp'])
})

test('hazard weights scale only the signature hazard patterns', () => {
  const base = { wolf: 1.6, wolfWall: 1, zigzag: 1.2, slalom: 1.5 }
  const hard = weightsFor(base, 'hard'), easy = weightsFor(base, 'easy')
  assert.equal(hard.wolf, 1.6 * 1.3); assert.equal(easy.wolfWall, 0.6)
  assert.equal(hard.zigzag, 1.2); assert.equal(easy.slalom, 1.5)
  assert.deepEqual(base, { wolf: 1.6, wolfWall: 1, zigzag: 1.2, slalom: 1.5 }, 'the world data is never modified')
  assert.equal(HAZARD_PATTERNS.length, 9)
})

test('the fairness floor holds at every difficulty: no gap is ever shorter than the reaction rule needs', () => {
  for (const id of ['02', '04', '07']) {
    const w = themeFor(id)
    for (const mode of DIFFICULTY_IDS) {
      const m = DIFFICULTIES[mode]
      const weights = weightsFor(w.patternWeights, mode)
      for (const seed of [1, 2, 3]) {
        const r = mulberry32(seed); const st = { n: 0, history: [], lastRow: null }
        for (let i = 0; i < 80; i++) {
          const d = Math.min(1, i / 60)
          let prev = st.lastRow
          for (const { row, gap } of nextPattern(st, r, d, weights, m.gap)) {
            assert.ok(gap >= minGap(prev, row) + 0.12 - 1e-9, `${id}/${mode}: gap ${gap.toFixed(2)} < floor ${(minGap(prev, row) + 0.12).toFixed(2)}`)
            prev = row; st.history.push(`${row.kind}:${row.lanes.join('')}`); st.lastRow = row; st.n++
          }
        }
      }
    }
  }
})

test('harder levels really place obstacles closer together, and easy ones further apart (mean time gap over many rows)', () => {
  const meanGap = (mode) => {
    let sum = 0, cnt = 0
    for (const seed of [1, 2, 3, 4]) {
      const r = mulberry32(seed); const st = { n: 0, history: [], lastRow: null }
      for (let i = 0; i < 60; i++) for (const { row, gap } of nextPattern(st, r, 1, weightsFor({}, mode), DIFFICULTIES[mode].gap)) { sum += gap; cnt++; st.history.push(`${row.kind}:${row.lanes.join('')}`); st.lastRow = row; st.n++ }
    }
    return sum / cnt
  }
  const [e, n, h] = ['easy', 'normal', 'hard'].map(meanGap)
  assert.ok(e > n && n > h, `easy ${e.toFixed(2)} > normal ${n.toFixed(2)} > hard ${h.toFixed(2)}`)
  assert.ok(Math.abs(n - baseGap(1)) < 0.5)
})

test('hazard share: easy < normal < hard in a hazard world', () => {
  const share = (mode) => {
    let hz = 0, all = 0
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const r = mulberry32(seed); const st = { n: 0, history: [], lastRow: null }
      for (let i = 0; i < 80; i++) for (const { row } of nextPattern(st, r, 1, weightsFor(themeFor('04').patternWeights, mode), 1)) { all++; if (row.kind === 'hole') hz++; st.history.push(`${row.kind}:${row.lanes.join('')}`); st.lastRow = row; st.n++ }
    }
    return hz / all
  }
  const [e, n, h] = ['easy', 'normal', 'hard'].map(share)
  assert.ok(e < n && n < h, `easy ${e.toFixed(3)} < normal ${n.toFixed(3)} < hard ${h.toFixed(3)}`)
})

test('the Auto play bot (the regression gate) finishes every world on every difficulty', () => {
  for (const id of worldIds) for (const mode of DIFFICULTY_IDS) for (const seed of [41, 42]) {
    const s = createSim(seed, themeFor(id)); startRun(s, seed, { auto: true, difficulty: mode })
    const bot = createBot(); s.driver = (q) => botStep(q, bot)
    for (let t = 0; t < 420 && s.phase === 'running'; t += 1 / 60) update(s, 1 / 60)
    assert.equal(s.phase, 'complete', `world ${id} ${mode} seed ${seed}: ${s.phase} at ${s.dist.toFixed(0)} m, hit ${s.hit?.kind}`)
  }
})
