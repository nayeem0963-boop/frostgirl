import test from 'node:test'
import assert from 'node:assert/strict'
import { LEVEL, SCALE, orbHz, BASE_ORB_HZ, ComboTracker, COMBO_WINDOW, STEP_METRES, stepsBetween, CUES, cueDue, RECIPES, orbRecipe, stepRecipe, panFor, SOUND_EVENTS, ambientFor } from '../src/runner/audio/sounds.js'
import { WOLF, SHARD, HOLE, RUN } from '../src/runner/config.js'
import { createSim, startRun, update } from '../src/runner/sim/sim.js'
import { themeFor } from '../src/worlds/runnerThemes.js'

test('orb pitch climbs a pentatonic ladder and is clamped at both ends', () => {
  assert.equal(orbHz(0), BASE_ORB_HZ)
  for (let i = 1; i < SCALE.length; i++) assert.ok(orbHz(i) > orbHz(i - 1))
  assert.equal(orbHz(99), orbHz(SCALE.length - 1)); assert.equal(orbHz(-5), BASE_ORB_HZ)
  assert.ok(Math.abs(orbHz(5) - BASE_ORB_HZ * 2) < 1e-6, 'step 5 is exactly an octave up')
})

test('a chain of orbs climbs one step each, a pause starts over, and it tops out', () => {
  const c = new ComboTracker()
  assert.equal(c.hit(10), 0)
  assert.equal(c.hit(10.5), 1); assert.equal(c.hit(11.2), 2)
  assert.equal(c.hit(11.2 + COMBO_WINDOW + 0.1), 0, 'too long a gap: back to the bottom')
  let s = 0; for (let t = 20; t < 40; t += 0.5) s = c.hit(t)
  assert.equal(s, SCALE.length - 1)
  c.reset(); assert.equal(c.hit(50), 0)
})

test('footsteps are spaced by the run cycle and alternate feet', () => {
  assert.equal(STEP_METRES, 1.26)
  assert.equal(stepsBetween(0, 0).count, 0); assert.equal(stepsBetween(5, 3).count, 0)
  assert.equal(stepsBetween(0, STEP_METRES * 10 + 0.01).count, 10)
  let total = 0, d = 0
  while (d < 100) { const n = d + 0.37; total += stepsBetween(d, n).count; d = n }
  assert.ok(Math.abs(total - Math.floor(d / STEP_METRES)) <= 1, `${total} steps in ${d.toFixed(1)} m`)
  // the cycle is 2 steps; at any run speed the cadence matches the animation: steps per second = speed / 1.26
  assert.ok(Math.abs(RUN.startSpeed / STEP_METRES - 5.95) < 0.05)
  const a = stepsBetween(0, STEP_METRES * 1.1), b = stepsBetween(STEP_METRES * 1.1, STEP_METRES * 2.1)
  assert.notEqual(a.startRight, b.startRight, 'left then right')
})

test('hazard warnings start when the telegraph starts, and only while the hazard is ahead', () => {
  assert.equal(CUES.shard, SHARD.dropFrom); assert.ok(CUES.wolf >= WOLF.lungeFrom); assert.ok(CUES.hole >= HOLE.breakFrom)
  assert.equal(cueDue('shard', SHARD.dropFrom + 5), false)
  assert.equal(cueDue('shard', SHARD.dropFrom), true)
  assert.equal(cueDue('wolf', 10), true); assert.equal(cueDue('wolf', -1), false, 'not once it is behind her')
  assert.equal(cueDue('wall', 10), false, 'plain walls make no warning sound')
  // each warning leaves a sensible reaction time even at top speed
  for (const k of ['wolf', 'shard', 'hole']) assert.ok(CUES[k] / RUN.maxSpeed >= 1.5, `${k}: ${(CUES[k] / RUN.maxSpeed).toFixed(2)} s of warning at top speed`)
})

test('every sound event has a recipe, every recipe is well formed and short', () => {
  for (const e of SOUND_EVENTS) { if (e === 'orb') continue; assert.ok(RECIPES[e]?.length > 0, e) }
  const all = [...Object.values(RECIPES), orbRecipe(0), orbRecipe(8), stepRecipe(true), stepRecipe(false)]
  for (const r of all) for (const l of r) {
    assert.ok(l.kind === 'tone' || l.kind === 'noise')
    assert.ok(l.dur > 0 && l.dur <= 1.4, `dur ${l.dur}`); assert.ok(l.gain > 0 && l.gain <= 0.55, `gain ${l.gain}`)
    assert.ok(l.f0 > 20 && l.f0 < 8000 && l.f1 > 20 && l.f1 < 8000)
    assert.ok(l.delay >= 0 && l.delay + l.dur < 2)
  }
  for (const k of ['wolf', 'shard', 'hole']) assert.ok(RECIPES[k])
  assert.notDeepEqual(stepRecipe(true), stepRecipe(false))
})

test('the loudest moment is the crash, and nothing is startlingly loud', () => {
  const peak = (r) => r.reduce((s, l) => s + l.gain, 0)
  assert.ok(peak(RECIPES.hit) >= peak(RECIPES.jump) && peak(RECIPES.hit) >= peak(orbRecipe(3)))
  for (const r of Object.values(RECIPES)) assert.ok(peak(r) <= 1.3)
})

test('every loudness trim names a real sound and is a sane multiplier', () => {
  const names = new Set([...Object.keys(RECIPES), 'orb', 'step'])
  for (const [k, v] of Object.entries(LEVEL)) { assert.ok(names.has(k), `${k} is not a sound`); assert.ok(v > 0.5 && v < 15, `${k} x${v}`) }
  for (const n of names) assert.ok(LEVEL[n] !== undefined, `${n} has no level`)
})

test('panning follows the side something happens on, within -1..1', () => {
  assert.ok(panFor('lane', { dir: -1 }) < 0 && panFor('lane', { dir: 1 }) > 0)
  assert.ok(panFor('wolf', { x: -5.6 }) < -0.9 && panFor('wolf', { x: 5.6 }) > 0.9)
  assert.equal(panFor('orb', { x: 0 }), 0); assert.equal(panFor('orb', { x: 99 }), 1)
})

test('ambient wind: silent when not running, muffled by mist, a little fuller when fast', () => {
  assert.equal(ambientFor({ running: false }).gain, 0)
  const clear = ambientFor({ running: true, mist: 0, speed: 7.5 }), thick = ambientFor({ running: true, mist: 1, speed: 7.5 }), fast = ambientFor({ running: true, speed: 12.5 })
  assert.ok(thick.cutoff < clear.cutoff); assert.ok(fast.gain > clear.gain); assert.ok(clear.gain < 0.1)
})

test('the sim really emits the events the sound table covers (a bot-free sanity run)', () => {
  const s = createSim(3, themeFor('06')); startRun(s, 3); s.phase = 'running'
  const seen = new Set()
  for (let i = 0; i < 120 * 30; i++) { s.phase = 'running'; if (i === 200) s.jumpBuf = 0.1; update(s, 1 / 120); for (const e of s.events) seen.add(e); s.events.length = 0 }
  assert.ok(seen.has('hit') || seen.has('gust') || seen.has('nearMiss') || seen.has('orb'), [...seen].join())
  for (const e of seen) assert.ok(SOUND_EVENTS.includes(e) || ['complete'].includes(e), `unexpected event ${e}`)
})
