import test from 'node:test'
import assert from 'node:assert/strict'
import { createSim, startRun, update, command, aheadOf } from '../src/runner/sim/sim.js'
import { createBot, botStep } from '../src/runner/sim/bot.js'
import { themeFor, worldIds } from '../src/worlds/runnerThemes.js'
import { LEVEL, ORBS } from '../src/runner/config.js'
import {
  PROGRESS_KEY, starsFor, emptyProgress, sanitize, loadProgress, saveProgress, recordRun, isUnlocked, nextWorldId, totalStars,
} from '../src/runner/progress.js'

const memory = (init = {}) => { const m = { ...init }; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v) }, _m: m } }

function botFinish(id, seed = 5) {
  const s = createSim(seed, themeFor(id)); startRun(s, seed, { auto: true })
  const bot = createBot(); s.driver = (q) => botStep(q, bot)
  for (let t = 0; t < 400 && s.phase === 'running'; t += 1 / 60) update(s, 1 / 60)
  return s
}

// ---- the finish line --------------------------------------------------------------------------------------------------
test('crossing the finish line completes the level once, then Aisha coasts to a stop and celebrates', () => {
  const s = botFinish('01')
  assert.equal(s.phase, 'complete')
  assert.equal(s.count.complete, 1, 'one complete event')
  assert.ok(s.dist >= themeFor('01').finishDistance)
  const at = s.dist
  for (let i = 0; i < 60 * 3; i++) update(s, 1 / 60)
  assert.equal(s.speed, 0, 'stopped')
  assert.ok(s.dist > at && s.dist - at < 12, `coasted ${(s.dist - at).toFixed(1)} m`)
  assert.equal(s.anim, 'celebrate')
  assert.equal(command(s, 'left', true), false, 'no commands after the line')
  assert.equal(s.count.complete, 1)
})

test('nothing is placed within the clearance of the finish line, and nothing beyond it', () => {
  for (const id of worldIds) {
    const w = themeFor(id)
    const s = createSim(9, w); startRun(s, 9)
    let last = 0
    for (let i = 0; i < 60 * 330 && s.phase === 'running'; i++) {
      s.driver = null
      update(s, 1 / 60)
      for (const o of s.obstacles) if (o.active) last = Math.max(last, o.dist)
      for (const q of s.orbs) if (q.active) last = Math.max(last, q.dist)
      // keep it alive: remove whatever is about to be hit (this test only watches what the generator places)
      for (const o of s.obstacles) if (o.active && aheadOf(s, o) < 3) o.active = false
    }
    assert.ok(last <= w.finishDistance - LEVEL.clearance + 1e-6, `world ${id}: something placed at ${last.toFixed(1)} of ${w.finishDistance}`)
    assert.ok(last > w.finishDistance - 200, `world ${id}: the level is populated almost to the end (${last.toFixed(0)})`)
    assert.equal(s.phase, 'complete', `world ${id}`)
  }
})

test('a level completed by the bot earns stars from its orb share, and finishing alone is one star', () => {
  const s = botFinish('01')
  assert.equal(s.stars, starsFor(s.orbCount, s.orbsSeen))
  assert.ok(s.orbsSeen > 30, `${s.orbsSeen} orbs on the level`)
  assert.equal(starsFor(0, 100), 1)
  assert.equal(starsFor(49, 100), 1)
  assert.equal(starsFor(50, 100), 2)
  assert.equal(starsFor(74, 100), 2)
  assert.equal(starsFor(75, 100), 3)
  assert.equal(starsFor(100, 100), 3)
  assert.equal(starsFor(0, 0), 3, 'nothing was missed on a level without orbs')
  assert.ok(LEVEL.twoStars < LEVEL.threeStars)
})

test('a crash before the line is not a completion; restart resets the level', () => {
  const s = createSim(2); startRun(s, 2)
  const o = s.obstacles.find((q) => !q.active); Object.assign(o, { active: true, kind: 'wall', x: 0, dist: s.dist + 9, id: 5 })
  for (let i = 0; i < 60 * 4; i++) update(s, 1 / 60)
  assert.equal(s.phase, 'gameover'); assert.equal(s.stars, 0); assert.equal(s.count.complete ?? 0, 0)
  startRun(s)
  assert.equal(s.phase, 'running'); assert.equal(s.doneT, 0); assert.equal(s.gen.done, false); assert.equal(s.dist, 0)
})

test('the stars on a level are within reach of the bot in World 01 (3 stars need 75% of the orbs)', () => {
  const ratios = [5, 6, 7].map((seed) => { const s = botFinish('01', seed); return s.orbCount / s.orbsSeen })
  assert.ok(Math.max(...ratios) >= LEVEL.twoStars, `bot collects ${ratios.map((r) => (r * 100).toFixed(0) + '%').join(', ')}`)
  void ORBS
})

// ---- saved progress ------------------------------------------------------------------------------------------------------
test('progress: recording runs only ever raises bests and stars', () => {
  let p = emptyProgress()
  p = recordRun(p, '01', { distance: 500, orbs: 12, completed: false, stars: 0 })
  assert.deepEqual(p.worlds['01'], { best: 500, bestOrbs: 12, stars: 0, completed: false })
  p = recordRun(p, '01', { distance: 1500, orbs: 30, completed: true, stars: 2 })
  assert.deepEqual(p.worlds['01'], { best: 1500, bestOrbs: 30, stars: 2, completed: true })
  p = recordRun(p, '01', { distance: 200, orbs: 3, completed: false, stars: 0 })
  assert.deepEqual(p.worlds['01'], { best: 1500, bestOrbs: 30, stars: 2, completed: true }, 'a bad run changes nothing')
  p = recordRun(p, '01', { distance: 1500, orbs: 10, completed: true, stars: 1 })
  assert.equal(p.worlds['01'].stars, 2, 'a worse finish never lowers the stars')
  p = recordRun(p, '01', { distance: 1500, orbs: 40, completed: true, stars: 3 })
  assert.equal(p.worlds['01'].stars, 3)
  assert.equal(totalStars(p), 3)
})

test('progress: completing a world unlocks the next; World 01 is always open', () => {
  const ids = worldIds
  let p = emptyProgress()
  assert.equal(isUnlocked(p, '01', ids), true)
  assert.equal(isUnlocked(p, '02', ids), false)
  p = recordRun(p, '01', { distance: 900, orbs: 5, completed: false, stars: 0 })
  assert.equal(isUnlocked(p, '02', ids), false, 'a crash does not unlock')
  p = recordRun(p, '01', { distance: 1500, orbs: 5, completed: true, stars: 1 })
  assert.equal(isUnlocked(p, '02', ids), true)
  assert.equal(isUnlocked(p, '03', ids), false)
  assert.equal(isUnlocked(p, 'zz', ids), false)
  assert.equal(nextWorldId('01', ids), '02'); assert.equal(nextWorldId('07', ids), null)
})

test('progress: save and load round-trip; corrupt, hostile or unavailable storage never throws', () => {
  const st = memory()
  const p = recordRun(emptyProgress(), '02', { distance: 1600, orbs: 20, completed: true, stars: 3 })
  assert.equal(saveProgress(p, st), true)
  assert.deepEqual(loadProgress(st), p)
  for (const bad of ['not json', '{"version":2,"worlds":{}}', '{"version":1}', '[]', 'null', '{"version":1,"worlds":{"01":{"best":"x","stars":99,"completed":"yes"},"../x":{"best":5}}}']) {
    const out = loadProgress(memory({ [PROGRESS_KEY]: bad }))
    assert.equal(out.version, 1)
    for (const w of Object.values(out.worlds)) { assert.ok(w.stars <= 3 && w.best >= 0); assert.equal(typeof w.completed, 'boolean') }
    assert.ok(!('../x' in out.worlds))
  }
  const broken = { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') } }
  assert.deepEqual(loadProgress(broken), emptyProgress())
  assert.equal(saveProgress(p, broken), false)
  assert.deepEqual(loadProgress(undefined), emptyProgress())
  assert.deepEqual(sanitize(undefined), emptyProgress())
})

test('progress: the old global best distance carries over to World 01 once', () => {
  const out = loadProgress(memory({ 'frost-runner-best': '640' }))
  assert.equal(out.worlds['01'].best, 640)
  assert.equal(out.worlds['02'], undefined)
  const kept = loadProgress(memory({ 'frost-runner-best': '640', [PROGRESS_KEY]: JSON.stringify(recordRun(emptyProgress(), '01', { distance: 900, orbs: 0, completed: false, stars: 0 })) }))
  assert.equal(kept.worlds['01'].best, 900, 'the new save wins over the legacy key')
})
