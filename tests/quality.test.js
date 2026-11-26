import test from 'node:test'
import assert from 'node:assert/strict'
import { TIERS, TIER_DATA, nextTierDown, lowerTier, snowCount, METER, FrameMeter, TIER_KEY, loadTier, saveTier, clearTier, startTier, activeTier } from '../src/runner/quality.js'
import { themeFor, worldIds } from '../src/worlds/runnerThemes.js'

const feed = (m, ms, seconds) => { let out = null; for (let t = 0; t < seconds * 1000; t += ms) { m.push(ms); out = m.verdict() ?? out } return out }

test('tiers step down high -> low -> min and then stop; the lower of two tiers is the cheaper one', () => {
  assert.deepEqual(TIERS, ['high', 'low', 'min'])
  assert.equal(nextTierDown('high'), 'low'); assert.equal(nextTierDown('low'), 'min'); assert.equal(nextTierDown('min'), null)
  assert.equal(lowerTier('high', 'low'), 'low'); assert.equal(lowerTier('min', 'high'), 'min'); assert.equal(lowerTier('low', 'low'), 'low')
})

test('each tier is strictly cheaper: pixel ratio, snow, tree detail ranges', () => {
  const [h, l, m] = TIERS.map((t) => TIER_DATA[t])
  assert.ok(h.dpr[1] > l.dpr[1] && l.dpr[1] > m.dpr[1])
  assert.ok(h.lods[0] > l.lods[0] && l.lods[0] > m.lods[0] && h.lods[1] > l.lods[1] && l.lods[1] > m.lods[1])
  for (const id of worldIds) {
    const t = themeFor(id)
    assert.ok(snowCount(t, 'high') > snowCount(t, 'low') && snowCount(t, 'low') > snowCount(t, 'min'), id)
    assert.equal(snowCount(t, 'high'), t.snow.count.high); assert.equal(snowCount(t, 'low'), t.snow.count.low)
  }
  assert.equal(snowCount(themeFor('01'), 'nonsense'), themeFor('01').snow.count.high, 'an unknown tier falls back to high')
})

test('the meter reports fps, mean and the 95th percentile of the last window', () => {
  const m = new FrameMeter({ window: 100 })
  for (let i = 0; i < 100; i++) m.push(i < 95 ? 16 : 50)
  const s = m.stats()
  assert.equal(s.n, 100); assert.ok(Math.abs(s.avg - (95 * 16 + 5 * 50) / 100) < 1e-9)
  assert.equal(s.p95, 50); assert.ok(Math.abs(s.fps - 1000 / s.avg) < 1e-9)
  assert.deepEqual(new FrameMeter().stats(), { n: 0, fps: 0, avg: 0, p95: 0 })
})

test('a steady 60 fps (or 40 fps) device is never stepped down', () => {
  assert.equal(feed(new FrameMeter(), 16.7, 60), null)
  assert.equal(feed(new FrameMeter(), 25, 60), null)
})

test('a device whose every frame is very slow (2.5 fps, longer than the cap) is still stepped down', () => {
  const m = new FrameMeter()
  let verdict = null
  for (let i = 0; i < 300 && !verdict; i++) { m.push(400); verdict = m.verdict() }
  assert.equal(verdict, 'down')
  assert.ok(m.stats().p95 <= METER.capMs)
})

test('a device stuck at 20 fps is stepped down, but not during warm-up', () => {
  const m = new FrameMeter()
  assert.equal(feed(m, 50, METER.warmup - 0.3), null, 'no verdict in the first seconds (shader compile, model upload)')
  assert.equal(feed(m, 50, 10), 'down')
})

test('one long hitch or a tab switch counts as one capped frame, and a short slow patch does not trigger', () => {
  const m = new FrameMeter()
  feed(m, 16.7, 5)
  m.push(900); m.push(5000) // tab hidden, GC pause
  assert.equal(m.verdict(), null)
  assert.ok(m.stats().avg < METER.slowMs, `two capped frames barely move the mean (${m.stats().avg.toFixed(1)} ms)`)
  assert.equal(m.stats().p95 <= METER.capMs, true)
  assert.equal(feed(m, 16.7, 3), null)
  for (let i = 0; i < 10; i++) m.push(60) // a brief stutter inside a healthy window
  assert.equal(m.verdict(), null)
})

test('after a step-down the new tier gets a fair look: cooldown, then another verdict if it is still too slow', () => {
  const m = new FrameMeter()
  const verdicts = []
  for (let i = 0; i < 20 * 20 && verdicts.length < 2; i++) { m.push(50); if (m.verdict() === 'down') verdicts.push(m.runTime) } // 20 fps for up to 20 s
  assert.equal(verdicts.length, 2, 'a device that stays slow is stepped down again')
  assert.ok(verdicts[1] - verdicts[0] >= METER.cooldown - 1e-9, `second verdict ${(verdicts[1] - verdicts[0]).toFixed(2)} s after the first`)
  assert.ok(verdicts[1] - verdicts[0] >= (METER.window * 50) / 1000 - 1e-9, 'and only on a fresh full window of frames')
  // if the new tier is fine, nothing more happens
  const ok = new FrameMeter(); feed(ok, 50, 6); assert.equal(feed(ok, 16.7, 30), null)
})

test('the saved tier round-trips, a bad value is ignored, broken storage is survived', () => {
  const mem = new Map(); const st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) }
  assert.equal(loadTier(st), null)
  saveTier('low', st); assert.equal(mem.get(TIER_KEY), 'low'); assert.equal(loadTier(st), 'low')
  mem.set(TIER_KEY, 'ultra'); assert.equal(loadTier(st), null)
  clearTier(st); assert.equal(loadTier(st), null)
  const broken = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') }, removeItem: () => { throw new Error('x') } }
  assert.equal(loadTier(broken), null); assert.doesNotThrow(() => saveTier('low', broken)); assert.doesNotThrow(() => clearTier(broken))
})

test('a visit starts on the screen-suggested tier, or lower if this device was measured to need it; manual choices are exact', () => {
  assert.equal(startTier('high', null), 'high')
  assert.equal(startTier('high', 'low'), 'low')
  assert.equal(startTier('low', 'high'), 'low', 'a saved high never raises what the screen suggests')
  assert.equal(startTier('low', 'min'), 'min')
  assert.equal(activeTier('auto', 'low'), 'low')
  assert.equal(activeTier('high', 'min'), 'high'); assert.equal(activeTier('low', 'high'), 'low')
})
