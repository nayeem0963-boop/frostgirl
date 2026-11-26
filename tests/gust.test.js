import test from 'node:test'
import assert from 'node:assert/strict'
import { createSim, startRun, update, aheadOf } from '../src/runner/sim/sim.js'
import { createBot, botStep } from '../src/runner/sim/bot.js'
import { gustAt, nextGustIndex, avoidGust } from '../src/runner/sim/gust.js'
import { REACTION, SHIFT_TIME } from '../src/runner/sim/patterns.js'
import { themeFor, worldIds } from '../src/worlds/runnerThemes.js'
import { GUST, RUN, LANES } from '../src/runner/config.js'

const w6 = themeFor('06')
const G = w6.gust

function started(seed = 1, id = '06') { const s = createSim(seed, themeFor(id)); startRun(s, seed); return s }
function clear(s) { for (const o of s.obstacles) o.active = false; for (const q of s.orbs) q.active = false; s.gen.lastPos = 1e9 }
const runTo = (s, dist) => { for (let i = 0; i < 60 * 60 && s.dist < dist && s.phase === 'running'; i++) update(s, 1 / 60) }

test('gusts: deterministic, irregular, spaced about a period apart, never in the opening or near the finish', () => {
  for (let k = 0; k < 12; k++) assert.deepEqual(gustAt(k, G), gustAt(k, G))
  const list = Array.from({ length: 12 }, (_, k) => gustAt(k, G))
  assert.ok(list[0].at >= G.startAt, 'the opening stretch is gust-free')
  for (let k = 1; k < list.length; k++) { const gap = list[k].at - list[k - 1].at; assert.ok(gap > G.period - G.jitter && gap < G.period + G.jitter, `gap ${gap.toFixed(0)}`) }
  assert.ok(list.every((g) => g.dir === -1 || g.dir === 1))
  assert.ok(new Set(list.map((g) => g.dir)).size === 2, 'both directions occur')
  assert.ok(new Set(list.map((g) => (g.at - G.startAt) % G.period)).size > 5, 'irregular, not a metronome')
  const inLevel = list.filter((g) => g.at < w6.finishDistance)
  assert.ok(inLevel.length >= 7, `${inLevel.length} gusts in the level`)
  assert.ok(inLevel[inLevel.length - 1].at <= w6.finishDistance - 100, 'the last gust is well before the finish')
})

test('gusts: nextGustIndex finds the first gust still ahead', () => {
  assert.equal(nextGustIndex(0, G), 0)
  const g1 = gustAt(1, G).at
  assert.equal(nextGustIndex(g1 - 1, G), 1)
  assert.equal(nextGustIndex(g1, G), 2, 'a gust has blown once she is at its line')
  assert.equal(nextGustIndex(g1 + 5, G), 2)
})

test('avoidGust: a row inside a gust window moves to just after it; others stay; it never moves a row earlier', () => {
  const { at } = gustAt(2, G)
  assert.equal(avoidGust(at - GUST.pre - 0.5, G), at - GUST.pre - 0.5)
  assert.equal(avoidGust(at + GUST.post + 0.5, G), at + GUST.post + 0.5)
  for (const d of [-GUST.pre, -1, 0, 5, GUST.post]) assert.ok(avoidGust(at + d, G) > at + GUST.post)
  for (let p = 100; p < 2000; p += 0.7) assert.ok(avoidGust(p, G) >= p)
  const out = []
  for (let p = 100; p < 2000; p += 0.7) out.push(avoidGust(p, G))
  for (let k = 0; k < 10; k++) { const a = gustAt(k, G).at; assert.ok(out.every((p) => p < a - GUST.pre || p > a + GUST.post), `a result inside gust ${k}'s window`) }
})

test('the keep-clear window leaves time to recover from the shove, even at top speed', () => {
  const need = (REACTION + 2 * SHIFT_TIME) * RUN.maxSpeed // from any lane to any lane
  assert.ok(GUST.post > need + 1.5, `${GUST.post} m after the line vs ${need.toFixed(1)} m needed`)
  assert.ok(GUST.post / RUN.maxSpeed >= REACTION + 2 * SHIFT_TIME + 0.2)
})

test('a gust shoves Aisha one lane the way it blows; at an edge lane it has nothing to push', () => {
  for (let k = 0; k < 6; k++) {
    const { at, dir } = gustAt(k, G)
    for (const start of [0, 1, 2]) {
      const s = started(); clear(s)
      s.dist = at - 6; s.gen.lastPos = 1e9; s.nextGust = k
      s.lane = start; s.x = LANES[start]; s.laneFrom = s.x; s.laneT = 1
      runTo(s, at + 3)
      const want = Math.min(2, Math.max(0, start + dir))
      assert.equal(s.lane, want, `gust ${k} (${dir > 0 ? 'right' : 'left'}) from lane ${start}`)
      for (let i = 0; i < 30; i++) update(s, 1 / 60)
      assert.equal(s.x, LANES[want], 'the glide ends exactly in the lane')
      assert.equal(s.count.gust, 1, 'one gust event')
    }
  }
})

test('a gust blows once, whatever the frame rate, and the shove is a smooth glide', () => {
  const { at, dir } = gustAt(0, G)
  const s = started(); clear(s); s.dist = at - 4; s.gen.lastPos = 1e9; s.lane = dir > 0 ? 0 : 2; s.x = LANES[s.lane]; s.laneFrom = s.x
  const xs = []
  for (let i = 0; i < 120; i++) { update(s, 0.05); xs.push(s.x) }
  assert.equal(s.count.gust, 1)
  for (let i = 1; i < xs.length; i++) assert.ok(dir > 0 ? xs[i] >= xs[i - 1] - 1e-9 : xs[i] <= xs[i - 1] + 1e-9, 'monotonic')
})

test('the generator never places a row (or leaves one) in a gust window, in World 06', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const s = started(seed)
    const rows = new Set()
    for (let i = 0; i < 60 * 150; i++) { s.phase = 'running'; update(s, 1 / 60); for (const o of s.obstacles) if (o.active) rows.add(o.dist.toFixed(3)) }
    assert.ok(rows.size > 30)
    for (let k = 0; k < 12; k++) {
      const { at } = gustAt(k, G)
      for (const d of rows) { const x = Number(d); assert.ok(x < at - GUST.pre || x > at + GUST.post, `seed ${seed}: a row at ${x} in gust ${k}'s window (${at - GUST.pre}..${at + GUST.post})`) }
    }
  }
})

test('gusts only blow in Worlds 06 and 07', () => {
  assert.deepEqual(worldIds.filter((id) => themeFor(id).gust), ['06', '07'])
  for (const id of worldIds) {
    const s = started(7, id); clear(s)
    s.gen.lastPos = 1e9
    for (let i = 0; i < 60 * 40; i++) { s.phase = 'running'; update(s, 1 / 60); for (const o of s.obstacles) o.active = false }
    if (id === '06' || id === '07') assert.ok(s.count.gust >= 1, `world 06 blows (${s.dist.toFixed(0)} m run)`)
    else assert.equal(s.count.gust ?? 0, 0, `world ${id} (${s.dist.toFixed(0)} m run)`)
  }
  assert.equal(themeFor('06').hazards.gust, true)
})

test('the Auto play bot finishes World 06 through every gust (4 seeds, whole level)', () => {
  for (const seed of [71, 72, 73, 74]) {
    const s = createSim(seed, w6); startRun(s, seed, { auto: true })
    const bot = createBot(); s.driver = (q) => botStep(q, bot)
    for (let t = 0; t < 360 && s.phase === 'running'; t += 1 / 60) update(s, 1 / 60)
    assert.equal(s.phase, 'complete', `seed ${seed}: ${s.phase} at ${s.time.toFixed(1)} s, ${s.dist.toFixed(0)} m, hit ${s.hit?.kind} ahead ${s.hit && aheadOf(s, s.hit).toFixed(1)}`)
    assert.ok(s.count.gust >= 7, `seed ${seed}: ${s.count.gust} gusts`)
  }
})
