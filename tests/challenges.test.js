import test from 'node:test'
import assert from 'node:assert/strict'
import { CHALLENGES, hasChallenge, evaluateChallenge, progressLabel } from '../src/runner/challenges.js'
import { emptyProgress, recordRun, recordEndless, sanitize, describeWorlds, totalStars, isUnlocked } from '../src/runner/progress.js'
import { createSim, startRun, update } from '../src/runner/sim/sim.js'
import { createBot, botStep } from '../src/runner/sim/bot.js'
import { themeFor, worldIds } from '../src/worlds/runnerThemes.js'
import { worlds } from '../src/worlds/config.js'

const tally = (o = {}) => ({ passed: {}, close: {}, closeInMist: 0, closeAfterGust: 0, holesJumped: 0, lastGust: -1e9, ...o })
const run = (o = {}) => ({ completed: true, endless: false, orbs: 0, seen: 100, tally: tally(), ...o })

test('every world has exactly one challenge with a goal that needs more than nothing', () => {
  assert.deepEqual(Object.keys(CHALLENGES).sort(), [...worldIds].sort())
  for (const id of worldIds) { assert.ok(hasChallenge(id)); const c = CHALLENGES[id]; assert.ok(c.text.length > 8 && c.goal >= 1); assert.equal(evaluateChallenge(id, run()).done, false, `${id} is not met by an empty run`) }
  assert.equal(evaluateChallenge('99', run()), null); assert.equal(hasChallenge('99'), false)
})

test('each challenge is met exactly at its goal, from its own tally', () => {
  const at = { '01': run({ orbs: 90 }), '02': run({ tally: tally({ close: { wolf: 3 } }) }), '03': run({ tally: tally({ close: { shard: 3 } }) }), '04': run({ tally: tally({ holesJumped: 4 }) }), '05': run({ tally: tally({ closeInMist: 5 }) }), '06': run({ tally: tally({ closeAfterGust: 2 }) }), '07': run({ tally: tally({ close: { wolf: 1, shard: 1, hole: 1 } }) }) }
  const below = { '01': run({ orbs: 89 }), '02': run({ tally: tally({ close: { wolf: 2 } }) }), '03': run({ tally: tally({ close: { shard: 2 } }) }), '04': run({ tally: tally({ holesJumped: 3 }) }), '05': run({ tally: tally({ closeInMist: 4 }) }), '06': run({ tally: tally({ closeAfterGust: 1 }) }), '07': run({ tally: tally({ close: { wolf: 5, shard: 5, hole: 0 } }) }) }
  for (const id of worldIds) { assert.equal(evaluateChallenge(id, at[id]).done, true, `${id} at goal`); assert.equal(evaluateChallenge(id, below[id]).done, false, `${id} just below`) }
})

test('only a completed level run counts: a crash or an Endless run never earns the badge', () => {
  const great = { orbs: 100, tally: tally({ close: { wolf: 9, shard: 9, hole: 9 }, holesJumped: 9, closeInMist: 9, closeAfterGust: 9 }) }
  for (const id of worldIds) {
    assert.equal(evaluateChallenge(id, run({ ...great, completed: false })).done, false, `${id} crash`)
    assert.equal(evaluateChallenge(id, run({ ...great, endless: true })).done, false, `${id} endless`)
    assert.equal(evaluateChallenge(id, run(great)).done, true, `${id} completed`)
  }
})

test('progress is shown capped at the goal, with a unit where it has one', () => {
  const r = evaluateChallenge('02', run({ tally: tally({ close: { wolf: 7 } }) }))
  assert.equal(r.value, 3); assert.equal(progressLabel(r), '3 / 3')
  assert.equal(progressLabel(evaluateChallenge('01', run({ orbs: 62 }))), '62% / 90%')
})

test('the badge is saved only by a completed run, kept for good, and changes nothing else', () => {
  const p0 = emptyProgress()
  const crashed = recordRun(p0, '02', { distance: 700, orbs: 10, completed: false, stars: 0, challenge: true })
  assert.equal('challenge' in crashed.worlds['02'], false, 'a crash with the flag set earns nothing')
  const done = recordRun(p0, '02', { distance: 1500, orbs: 100, completed: true, stars: 1, challenge: true })
  assert.deepEqual(done.worlds['02'], { best: 1500, bestOrbs: 100, stars: 1, completed: true, challenge: true })
  const later = recordRun(done, '02', { distance: 1500, orbs: 100, completed: true, stars: 1, challenge: false })
  assert.equal(later.worlds['02'].challenge, true, 'a later run without it keeps the badge')
  assert.equal(recordEndless(done, '02', { distance: 3000 }).worlds['02'].challenge, true)
  assert.equal(totalStars(done), 1); assert.equal(isUnlocked(done, '03', worldIds), true)
  const noBadge = recordRun(p0, '02', { distance: 1500, orbs: 100, completed: true, stars: 1 })
  assert.deepEqual(noBadge.worlds['02'], { best: 1500, bestOrbs: 100, stars: 1, completed: true }, 'old shape unchanged')
})

test('the saved badge survives a round trip, bad values are dropped, and the world cards report it', () => {
  const done = recordRun(emptyProgress(), '03', { distance: 1600, orbs: 100, completed: true, stars: 2, challenge: true })
  assert.equal(sanitize(JSON.parse(JSON.stringify(done))).worlds['03'].challenge, true)
  assert.equal('challenge' in sanitize({ version: 1, worlds: { '03': { best: 1, challenge: 'yes' } } }).worlds['03'], false)
  const cards = describeWorlds(done, worlds)
  assert.equal(cards.find((c) => c.id === '03').challenge, true); assert.equal(cards.find((c) => c.id === '01').challenge, false)
})

test('the sim tallies what the challenges read: passes, close calls by kind, holes jumped, mist and gust windows', () => {
  const fresh = () => { const s = createSim(3, themeFor('07')); startRun(s, 3); s.phase = 'running'; for (const o of s.obstacles) o.active = false; s.gen.lastPos = 1e9; return s }
  const put = (s, o) => { const q = s.obstacles.find((x) => !x.active); Object.assign(q, { active: true, passed: false, lane: 1, side: 0, id: 7000 + Math.random(), ...o }); return q }
  const run = (s, steps) => { for (let i = 0; i < steps; i++) update(s, 1 / 120) }
  // a crystal brushing past (close, by kind), another a lane away (a pass, not close), and a wolf passing wide
  const a = fresh()
  put(a, { kind: 'shard', x: a.x + 0.75 + 0.32 + 0.1, dist: a.dist + 10, lane: 2 })
  put(a, { kind: 'shard', x: -2.2, dist: a.dist + 14, lane: 0 })
  put(a, { kind: 'wolf', lane: 2, dist: a.dist + 12 })
  run(a, 120 * 3)
  assert.equal(a.phase, 'running')
  assert.equal(a.tally.passed.shard, 2); assert.equal(a.tally.close.shard, 1)
  assert.equal(a.tally.passed.wolf, 1); assert.equal(a.tally.close.wolf ?? 0, 0)
  // a hole passed while she is in the air counts as jumped; one passed on the ground does not (she would fall: it is a hit)
  const b = fresh()
  put(b, { kind: 'hole', x: 0, dist: b.dist + 6 })
  run(b, 40)
  for (let i = 0; i < 160; i++) { b.y = 0.7; b.grounded = false; b.vy = 0; update(b, 1 / 120) }
  assert.equal(b.phase, 'running'); assert.equal(b.tally.passed.hole, 1); assert.equal(b.tally.holesJumped, 1)
  const c = fresh()
  put(c, { kind: 'hole', x: 0, dist: c.dist + 6 })
  run(c, 160)
  assert.equal(c.phase, 'gameover', 'walking into a hole is a hit, so it never counts as jumped'); assert.equal(c.tally.holesJumped, 0)
  // a close pass while the mist is thick, and one shortly after a gust
  const d = fresh()
  d.dist = 950 // inside World 07's first thick mist bank (the mist follows the distance run)
  put(d, { kind: 'shard', x: d.x + 0.75 + 0.32 + 0.1, dist: d.dist + 8, lane: 2 }); run(d, 120 * 2)
  assert.equal(d.tally.closeInMist, 1)
  const e = fresh()
  e.tally.lastGust = e.dist - 5; put(e, { kind: 'shard', x: e.x + 0.75 + 0.32 + 0.1, dist: e.dist + 8, lane: 2 }); run(e, 120 * 2)
  assert.equal(e.tally.closeAfterGust, 1)
  const f = fresh()
  put(f, { kind: 'shard', x: f.x + 0.75 + 0.32 + 0.1, dist: f.dist + 8, lane: 2 }); run(f, 120 * 2)
  assert.equal(f.tally.closeAfterGust, 0, 'no gust yet: not counted')
  // a new run starts from zero
  startRun(a, 4); assert.deepEqual(a.tally.passed, {}); assert.equal(a.tally.closeInMist, 0); assert.equal(a.tally.holesJumped, 0); assert.equal(a.tally.lastGust, -1e9)
})

test('a normal bot run (wide margins, no risks) finishes every world but earns no close-call badge: the challenges ask for something extra', () => {
  for (const id of ['02', '03', '04', '06', '07']) {
    const s = createSim(61, themeFor(id)); startRun(s, 61, { auto: true }); const bot = createBot(); s.driver = (q) => botStep(q, bot)
    for (let t = 0; t < 420 && s.phase === 'running'; t += 1 / 60) update(s, 1 / 60)
    assert.equal(s.phase, 'complete', id)
    const r = evaluateChallenge(id, { completed: true, endless: false, orbs: s.orbCount, seen: s.orbsSeen, tally: s.tally })
    assert.equal(r.done, false, `${id}: the bot should not get its challenge for free (${r.value}/${r.goal})`)
  }
})
