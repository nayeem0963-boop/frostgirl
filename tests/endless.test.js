import test from 'node:test'
import assert from 'node:assert/strict'
import { createSim, startRun, update } from '../src/runner/sim/sim.js'
import { createBot, botStep } from '../src/runner/sim/bot.js'
import { themeFor, worldIds } from '../src/worlds/runnerThemes.js'
import { emptyProgress, recordRun, recordEndless, endlessOpen, sanitize, isUnlocked, totalStars } from '../src/runner/progress.js'

const botRun = (id, seed, opts, seconds, until) => {
  const s = createSim(seed, themeFor(id)); startRun(s, seed, { auto: true, ...opts })
  const bot = createBot(); s.driver = (q) => botStep(q, bot)
  let beyond = 0
  for (let t = 0; t < seconds && s.phase === 'running'; t += 1 / 60) {
    update(s, 1 / 60)
    if (s.dist > themeFor(id).finishDistance) for (const o of s.obstacles) if (o.active && o.dist > themeFor(id).finishDistance) beyond++
    if (until?.(s)) break
  }
  return { s, beyond }
}

test('Endless goes past the finish line: no completion, obstacles keep coming, on every world', () => {
  for (const id of worldIds) {
    const fin = themeFor(id).finishDistance
    const { s, beyond } = botRun(id, 71, { endless: true }, 600, (q) => q.dist > fin + 700)
    assert.equal(s.phase, 'running', `world ${id}: ${s.phase} at ${s.dist.toFixed(0)} m, hit ${s.hit?.kind}`)
    assert.ok(s.dist > fin + 700, `world ${id} reached ${s.dist.toFixed(0)}`)
    assert.ok(beyond > 0, `world ${id}: obstacles past the old finish line`)
    assert.equal(s.stars, 0); assert.equal(s.count.complete ?? 0, 0)
  }
})

test('a normal level is unchanged: it still ends at the finish line', () => {
  const { s } = botRun('01', 71, {}, 600)
  assert.equal(s.phase, 'complete'); assert.equal(s.endless, false)
})

test("the world's own hazards carry on in Endless: mist banks and gusts keep their rhythm past the finish", () => {
  const mist = botRun('05', 72, { endless: true }, 700, (q) => q.dist > 2100)
  assert.equal(mist.s.phase, 'running', `${mist.s.phase} hit ${mist.s.hit?.kind}`)
  let peak = 0
  { const s = createSim(72, themeFor('05')); startRun(s, 72, { auto: true, endless: true }); const bot = createBot(); s.driver = (q) => botStep(q, bot)
    for (let t = 0; t < 700 && s.phase === 'running' && s.dist < 2100; t += 1 / 60) { update(s, 1 / 60); if (s.dist > 1800) peak = Math.max(peak, s.mist) } }
  assert.ok(peak > 0.99, 'a mist bank past 1800 m (1860-1990)')
  const gust = botRun('06', 73, { endless: true }, 700, (q) => q.dist > 2300)
  assert.equal(gust.s.phase, 'running')
  assert.ok(gust.s.count.gust >= 9, `gusts blown ${gust.s.count.gust}`)
})

test('Endless runs obey the difficulty level too', () => {
  for (const difficulty of ['easy', 'hard']) {
    const { s } = botRun('02', 74, { endless: true, difficulty }, 600, (q) => q.dist > 2000)
    assert.equal(s.phase, 'running', `${difficulty}: ${s.phase} hit ${s.hit?.kind}`)
  }
})

test('Endless saves only its own best: level bests, stars and unlocks are never touched', () => {
  const p0 = recordRun(emptyProgress(), '01', { distance: 1500, orbs: 300, completed: true, stars: 3 })
  const p1 = recordEndless(p0, '01', { distance: 3200 })
  assert.deepEqual(p1.worlds['01'], { best: 1500, bestOrbs: 300, stars: 3, completed: true, bestEndless: 3200 })
  assert.equal(recordEndless(p1, '01', { distance: 2000 }).worlds['01'].bestEndless, 3200, 'bests only go up')
  assert.equal(recordEndless(p1, '01', { distance: 4100 }).worlds['01'].bestEndless, 4100)
  assert.equal(totalStars(p1), 3)
  assert.equal(isUnlocked(recordEndless(emptyProgress(), '01', { distance: 900 }), '02', worldIds), false, 'endless never unlocks the next world')
  // a later level run keeps the endless best
  assert.equal(recordRun(p1, '01', { distance: 1200, orbs: 10, completed: false, stars: 0 }).worlds['01'].bestEndless, 3200)
})

test('saved Endless best survives a round trip, bad values are dropped, and old saves have no field at all', () => {
  const p = recordEndless(recordRun(emptyProgress(), '02', { distance: 800, orbs: 5, completed: false, stars: 0 }), '02', { distance: 1234 })
  assert.equal(sanitize(JSON.parse(JSON.stringify(p))).worlds['02'].bestEndless, 1234)
  assert.equal('bestEndless' in sanitize({ version: 1, worlds: { '03': { best: 5, bestEndless: -4 } } }).worlds['03'], false)
  assert.equal('bestEndless' in sanitize({ version: 1, worlds: { '03': { best: 5, bestEndless: 'x' } } }).worlds['03'], false)
  assert.equal('bestEndless' in recordRun(emptyProgress(), '01', { distance: 10, orbs: 0, completed: false, stars: 0 }).worlds['01'], false)
})

test('Endless opens when the world is finished, or with ?unlock=all', () => {
  assert.equal(endlessOpen(emptyProgress(), '01'), false)
  assert.equal(endlessOpen(emptyProgress(), '01', true), true)
  assert.equal(endlessOpen(recordRun(emptyProgress(), '01', { distance: 1500, orbs: 1, completed: true, stars: 1 }), '01'), true)
  assert.equal(endlessOpen(recordRun(emptyProgress(), '01', { distance: 900, orbs: 1, completed: false, stars: 0 }), '01'), false)
})

test('a long Endless run is stable: the bot survives 5 km on Hard in Worlds 01, 04 and 07 (pools, generator and fairness hold)', () => {
  for (const id of ['01', '04', '07']) {
    const { s } = botRun(id, 81, { endless: true, difficulty: 'hard' }, 1200, (q) => q.dist > 5000)
    assert.equal(s.phase, 'running', `world ${id}: ${s.phase} at ${s.dist.toFixed(0)} m, hit ${s.hit?.kind}`)
    assert.ok(s.dist > 5000)
  }
})
