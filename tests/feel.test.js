import test from 'node:test'
import assert from 'node:assert/strict'
import { createSim, startRun, update, clearance } from '../src/runner/sim/sim.js'
import { createBot, botStep } from '../src/runner/sim/bot.js'
import { themeFor, worldIds } from '../src/worlds/runnerThemes.js'
import { NEAR_MISS, PLAYER, LANES } from '../src/runner/config.js'
import { HAPTIC_PATTERNS, hapticFor, buzz, hapticsSupported, loadHaptics, saveHaptics, HAPTICS_KEY } from '../src/runner/feel.js'

const started = (seed = 5, id = '01') => { const s = createSim(seed, themeFor(id)); startRun(s, seed); s.phase = 'running'; return s }
const clear = (s) => { for (const o of s.obstacles) o.active = false; s.gen.lastPos = 1e9 }
const put = (s, o) => { const q = s.obstacles.find((x) => !x.active); Object.assign(q, { active: true, passed: false, id: 9000 + Math.random(), lane: 1, side: 0, ...o }); return q }
const run = (s, seconds) => { for (let t = 0; t < seconds * 120 && s.phase === 'running'; t++) update(s, 1 / 120) }

test('clearance is the gap between her body and the obstacle (0 when they overlap in both axes)', () => {
  const s = started(); clear(s)
  const wall = put(s, { kind: 'wall', x: LANES[2], dist: s.dist + 20 })
  // centre lane vs a wall in the right lane: 2.2 - 0.95 (wall half width) - 0.32 (her half width)
  assert.ok(Math.abs(clearance(s, wall) - (2.2 - 0.95 - PLAYER.halfWidth)) < 1e-9)
  s.x = 1.6
  assert.equal(clearance(s, wall), 0)
})

test('an obstacle that brushes past her raises one nearMiss, a wide pass raises none', () => {
  const close = started(); clear(close)
  put(close, { kind: 'wall', x: close.x + 0.95 + PLAYER.halfWidth + 0.12, dist: close.dist + 12, lane: 2 }) // 0.12 m of clearance
  run(close, 3)
  assert.equal(close.phase, 'running'); assert.equal(close.count.nearMiss, 1)
  const wide = started(); clear(wide)
  put(wide, { kind: 'wall', x: LANES[2], dist: wide.dist + 12, lane: 2 }) // a full lane away
  run(wide, 3)
  assert.equal(wide.phase, 'running'); assert.equal(wide.count.nearMiss ?? 0, 0)
})

test('a hit is a hit, not a near miss; near misses never change the run', () => {
  const s = started(); clear(s)
  put(s, { kind: 'wall', x: 0, dist: s.dist + 10, lane: 1 })
  run(s, 3)
  assert.equal(s.phase, 'gameover'); assert.equal(s.count.nearMiss ?? 0, 0)
  // identical state with and without a listener: the sim does not read its own events
  const a = started(11), b = started(11)
  run(a, 30); run(b, 30); b.events.length = 0
  assert.equal(a.dist, b.dist); assert.equal(a.orbCount, b.orbCount)
})

test('each obstacle is judged once (no repeated nearMiss for one obstacle)', () => {
  const s = started(); clear(s)
  put(s, { kind: 'wall', x: s.x + 0.95 + PLAYER.halfWidth + 0.1, dist: s.dist + 10, lane: 2 })
  run(s, 6)
  assert.equal(s.count.nearMiss, 1)
})

test('the Auto play bot still finishes every world with the new event in place', () => {
  for (const id of ['01', '07']) {
    const s = createSim(61, themeFor(id)); startRun(s, 61, { auto: true })
    const bot = createBot(); s.driver = (q) => botStep(q, bot)
    for (let t = 0; t < 420 && s.phase === 'running'; t += 1 / 60) update(s, 1 / 60)
    assert.equal(s.phase, 'complete', `world ${id}: ${s.phase} hit ${s.hit?.kind}`)
  }
  assert.ok(NEAR_MISS > 0 && NEAR_MISS < 1 && worldIds.length === 7)
})

test('haptics: patterns exist for the felt events and stay short', () => {
  for (const e of ['orb', 'nearMiss', 'gust', 'hit', 'complete']) assert.ok(hapticFor(e) !== null, e)
  assert.equal(hapticFor('lane'), null)
  for (const p of Object.values(HAPTIC_PATTERNS)) assert.ok([p].flat().reduce((a, b) => a + b, 0) < 400, 'under 0.4 s')
})

test('haptics: buzz respects the setting, Auto play, and missing support', () => {
  const calls = []
  const nav = { vibrate: (p) => { calls.push(p); return true } }
  assert.equal(buzz('hit', { nav }), true); assert.deepEqual(calls, [HAPTIC_PATTERNS.hit])
  assert.equal(buzz('hit', { nav, enabled: false }), false)
  assert.equal(buzz('hit', { nav, auto: true }), false)
  assert.equal(buzz('lane', { nav }), false)
  assert.equal(buzz('hit', { nav: {} }), false); assert.equal(hapticsSupported({}), false)
  assert.equal(buzz('hit', { nav: { vibrate: () => { throw new Error('blocked') } } }), false)
  assert.equal(calls.length, 1)
})

test('haptics: the setting is remembered, defaults to on, and survives broken storage', () => {
  const mem = new Map(); const st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) }
  assert.equal(loadHaptics(st), true)
  saveHaptics(false, st); assert.equal(mem.get(HAPTICS_KEY), 'off'); assert.equal(loadHaptics(st), false)
  saveHaptics(true, st); assert.equal(loadHaptics(st), true)
  const broken = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') } }
  assert.equal(loadHaptics(broken), true); assert.doesNotThrow(() => saveHaptics(false, broken))
})
