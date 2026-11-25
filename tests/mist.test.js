import test from 'node:test'
import assert from 'node:assert/strict'
import { createSim, startRun, update } from '../src/runner/sim/sim.js'
import { createBot, botStep } from '../src/runner/sim/bot.js'
import { mistAt, fogAt, visibleAt, visionRange, VISIBLE_ENOUGH } from '../src/runner/sim/mist.js'
import { REACTION, SHIFT_TIME } from '../src/runner/sim/patterns.js'
import { themeFor, worldIds } from '../src/worlds/runnerThemes.js'
import { RUN, LEVEL } from '../src/runner/config.js'

const w5 = themeFor('05')
const M = w5.mist

test('mist: none before the first bank or between banks, full in the middle of a bank, periodic', () => {
  assert.equal(mistAt(0, M), 0); assert.equal(mistAt(M.startAt - 1, M), 0)
  assert.equal(mistAt(M.startAt + M.length / 2, M), 1)
  assert.equal(mistAt(M.startAt + M.length + 5, M), 0, 'clear again after the bank')
  assert.equal(mistAt(M.startAt + M.period + M.length / 2, M), 1, 'the next bank')
  assert.equal(mistAt(1000, null), 0, 'a world without mist never has any')
  for (let d = 0; d < 2200; d += 1) { const m = mistAt(d, M); assert.ok(m >= 0 && m <= 1) }
})

test('mist: it thickens and clears smoothly (no sudden wall of fog)', () => {
  let last = mistAt(M.startAt, M)
  for (let d = M.startAt; d < M.startAt + M.length; d += 0.5) { const m = mistAt(d, M); assert.ok(Math.abs(m - last) < 0.06, `jump of ${(m - last).toFixed(3)} at ${d}`); last = m }
  assert.ok(mistAt(M.startAt + M.ramp / 2, M) > 0 && mistAt(M.startAt + M.ramp / 2, M) < 1, 'ramping in')
})

test('mist: the fog eases between the normal range and the mist range', () => {
  const fog = w5.fog
  assert.deepEqual(fogAt(0, fog, M), { near: fog.near, far: fog.far })
  assert.deepEqual(fogAt(1, fog, M), { near: M.near, far: M.far })
  const mid = fogAt(0.5, fog, M)
  assert.ok(mid.far < fog.far && mid.far > M.far)
  assert.deepEqual(fogAt(1, fog, null), { near: fog.near, far: fog.far })
})

test('mist is fair: an obstacle is still almost fully visible at the distance needed to dodge it, at top speed', () => {
  const full = fogAt(1, w5.fog, M)
  const need = (REACTION + 2 * SHIFT_TIME) * RUN.maxSpeed // 0.93 s of running at top speed
  assert.ok(visibleAt(need, full) >= 0.95, `${(visibleAt(need, full) * 100).toFixed(0)}% visible at ${need.toFixed(1)} m`)
  assert.ok(visionRange(full) >= need * 3, `can see ${visionRange(full).toFixed(0)} m ahead in full mist, need ${need.toFixed(1)} m`)
  assert.ok(visibleAt(visionRange(full), full) <= VISIBLE_ENOUGH + 1e-9)
  assert.ok(visionRange(fogAt(0, w5.fog, M)) > 300, 'without mist the vision is effectively unlimited')
  assert.ok(visibleAt(0, full) === 1 && visibleAt(500, full) === 0)
})

test('the last stretch before the finish line is always clear of mist', () => {
  for (const id of worldIds) {
    const t = themeFor(id)
    if (!t.mist) continue
    for (let d = t.finishDistance - 100; d <= t.finishDistance + 20; d += 1) assert.equal(mistAt(d, t.mist), 0, `world ${id} at ${d} m`)
    assert.ok(t.mist.length >= 2 * t.mist.ramp, 'a bank is long enough to thicken and clear')
    assert.ok(t.mist.period > t.mist.length + 100, 'real clear stretches between banks')
    assert.ok(t.mist.startAt >= 150, 'the opening stretch is clear')
  }
})

test('only World 05 has mist (data and in play)', () => {
  assert.deepEqual(worldIds.filter((id) => themeFor(id).mist), ['05'])
  for (const id of worldIds) {
    const s = createSim(3, themeFor(id)); startRun(s, 3, { auto: true })
    const bot = createBot(); s.driver = (q) => botStep(q, bot)
    let peak = 0, thickFrames = 0, frames = 0, minVision = 1e9
    for (let t = 0; t < 120 && s.phase === 'running'; t += 1 / 60) { update(s, 1 / 60); peak = Math.max(peak, s.mist); if (s.mist > 0.99) thickFrames++; frames++; minVision = Math.min(minVision, s.vision) }
    if (id === '05') { assert.ok(peak > 0.99, `peak ${peak}`); assert.ok(thickFrames / frames > 0.05, 'a real share of the run is in thick mist'); assert.ok(minVision < 45 && minVision > 30, `vision ${minVision}`) }
    else { assert.equal(peak, 0, `world ${id}`); assert.ok(minVision > 1e8) }
  }
})

test('the Auto play bot, which only reacts to what the mist lets it see, finishes World 05 (4 seeds, whole level)', () => {
  for (const seed of [51, 52, 53, 54]) {
    const s = createSim(seed, w5); startRun(s, seed, { auto: true })
    const bot = createBot(); s.driver = (q) => botStep(q, bot)
    let thick = 0
    for (let t = 0; t < 340 && s.phase === 'running'; t += 1 / 60) { update(s, 1 / 60); if (s.mist > 0.99) thick++ }
    assert.equal(s.phase, 'complete', `seed ${seed}: ${s.phase} at ${s.time.toFixed(1)} s, hit ${s.hit?.kind}`)
    assert.ok(thick > 60 * 10, `seed ${seed}: ${(thick / 60).toFixed(0)} s in thick mist`)
  }
})

test('World 05 mist keeps the reaction rule even with a stricter bot (sees only the distance it needs plus a margin)', () => {
  // a harsher test than the real fog: the bot sees 1.4 x the distance it needs to dodge at top speed
  const need = (REACTION + 2 * SHIFT_TIME) * RUN.maxSpeed
  for (const seed of [61, 62]) {
    const s = createSim(seed, w5); startRun(s, seed, { auto: true })
    const bot = createBot()
    s.driver = (q) => { q.vision = Math.max(need * 1.4, 16); botStep(q, bot) }
    for (let t = 0; t < 340 && s.phase === 'running'; t += 1 / 60) update(s, 1 / 60)
    assert.equal(s.phase, 'complete', `seed ${seed}: ${s.phase} at ${s.time.toFixed(1)} s, hit ${s.hit?.kind}`)
  }
  assert.ok(LEVEL.clearance > 0)
})
