import test from 'node:test'
import assert from 'node:assert/strict'
import { createSim, startRun, update, aheadOf, DIFFICULTY_SECONDS } from '../src/runner/sim/sim.js'
import { createBot, botStep } from '../src/runner/sim/bot.js'
import { runnerThemes, themeFor, worldIds, PATTERN_IDS, defaultWorldId } from '../src/worlds/runnerThemes.js'
import { worlds } from '../src/worlds/config.js'
import { LANES } from '../src/runner/config.js'

const HEX = /^#[0-9a-f]{6}$/i
const rgb = (a) => Array.isArray(a) && a.length === 3 && a.every((v) => Number.isInteger(v) && v >= 0 && v <= 255)

// ---- World 01 is the original look and the original generator -----------------------------------------------------------
test('World 01 theme equals the runner\'s original hard-coded values', () => {
  const t = themeFor('01')
  assert.deepEqual(t.sky, { zenith: '#5b82b4', mid: '#9db7d4', horizon: '#dde5ee', sun: '#fff1d6' })
  assert.deepEqual(t.fog, { color: '#c9d6e3', near: 70, far: 520 })
  assert.deepEqual(t.light, { hemiSky: '#c4d8f0', hemiGround: '#7d8796', hemiIntensity: 1.15, ambient: '#b8c8e0', ambientIntensity: 0.15, sun: '#fff2de', sunIntensity: 2.5 })
  assert.deepEqual(t.snow, { color: '#ffffff', count: { high: 1100, low: 500 } })
  assert.equal(t.ground.base, '#f2f6fb')
  assert.deepEqual(t.ground.speck, [170, 195, 225]); assert.deepEqual(t.ground.spread, [50, 40, 25])
  assert.equal(t.trail.base, '#d3e1f0')
  assert.deepEqual(t.trail.speck, [150, 175, 205]); assert.deepEqual(t.trail.spread, [40, 35, 30])
  assert.deepEqual(t.trail.shade, [120, 160, 205]); assert.deepEqual(t.trail.divider, [70, 130, 205]); assert.deepEqual(t.trail.rail, [55, 115, 200])
  assert.equal(t.backdrop, null, 'World 01 keeps the 3D mountain massif')
  assert.deepEqual(t.patternWeights, {})
  assert.equal(t.finishDistance, 1500)
  assert.equal(t.difficultySeconds, DIFFICULTY_SECONDS)
})

// The first 14 obstacle rows of three seeds, recorded from the Phase 4.1 code (before worlds existed). World 01 must not change.
const BASELINE_ROWS = {"1":["wall:0@42","wall:0@57","wall:2@73","wall:1@88","wall:0@104","wall:0@120","ridge:1@137","wall:1@153","wall:2@169","arch:1@185","wall:0@202","wall:2@218","wall:0@235","wall:2@251"],"2":["wall:0@42","wall:1@57","ridge:1@73","wall:1@88","wall:2@104","wall:2@120","wall:0@137","wall:1@153","wall:1@169","ridge:1@185","arch:1@202","arch:1@218","ridge:1@235","wall:2@251"],"3":["wall:0@42","wall:1@57","wall:1@73","ridge:1@88","arch:1@104","wall:2@120","ridge:1@137","wall:2@153","ridge:1@169","ridge:1@185","wall:2@202","arch:1@218","wall:1@235","wall:02@251"]}
test('World 01 generates exactly the obstacle rows it generated before worlds existed', () => {
  for (const seed of [1, 2, 3]) {
    const s = createSim(seed); startRun(s, seed)
    const rows = new Map()
    for (let i = 0; i < 60 * 150; i++) {
      s.phase = 'running'; update(s, 1 / 60)
      for (const o of s.obstacles) if (o.active) { const k = o.dist.toFixed(2); const r = rows.get(k) ?? { kind: o.kind, lanes: [] }; r.lanes.push(o.kind === 'wall' ? LANES.indexOf(o.x) : 1); rows.set(k, r) }
    }
    const got = [...rows.entries()].sort((a, b) => a[0] - b[0]).slice(0, 14).map(([d, r]) => `${r.kind}:${[...new Set(r.lanes)].sort().join('')}@${Number(d).toFixed(0)}`)
    assert.deepEqual(got, BASELINE_ROWS[seed], `seed ${seed}`)
  }
})

test('World 01 in the registry keeps its original fields and gains the runner theme', () => {
  const w = worlds[0]
  assert.equal(w.id, '01'); assert.equal(w.name, 'Frozen Kingdom')
  assert.deepEqual(w.obstacles, ['iceBlock', 'snowBarrier', 'fallenPine'])
  assert.deepEqual(w.collectibles, ['crystal'])
  assert.deepEqual(w.palette, { sky: '#8ac5e9', snow: '#e5f7ff', ice: '#8fc8e3', forest: '#315b71' })
  assert.deepEqual(w.fog, { color: '#abcddd', near: 100, far: 190 }, 'the original game\'s fog is untouched')
  assert.equal(w.runner, runnerThemes['01'])
  assert.equal(worlds.length, 7)
  assert.deepEqual(worlds.map((x) => x.id), worldIds)
  for (const x of worlds) { assert.equal(x.runner, runnerThemes[x.id]); assert.ok(x.background.endsWith('.webp')) }
})

// ---- every world is well-formed -------------------------------------------------------------------------------------------
test('every world theme is complete and valid', () => {
  assert.equal(worldIds.length, 7)
  for (const id of worldIds) {
    const t = runnerThemes[id]
    for (const c of [t.sky.zenith, t.sky.mid, t.sky.horizon, t.sky.sun, t.fog.color, t.light.hemiSky, t.light.hemiGround, t.light.ambient, t.light.sun, t.snow.color, t.ground.base, t.trail.base]) assert.match(c, HEX, `world ${id}`)
    for (const a of [t.ground.speck, t.ground.spread, t.trail.speck, t.trail.spread, t.trail.shade, t.trail.divider, t.trail.rail]) assert.ok(rgb(a), `world ${id}: ${a}`)
    assert.ok(t.fog.near > 0 && t.fog.near < t.fog.far, `world ${id} fog range`)
    assert.ok(t.light.hemiIntensity > 0 && t.light.sunIntensity > 0 && t.light.ambientIntensity >= 0)
    assert.ok(t.snow.count.high > 0 && t.snow.count.low > 0 && t.snow.count.low <= t.snow.count.high)
    assert.ok(t.finishDistance >= 1500 && t.difficultySeconds > 0, `world ${id}`)
    for (const [k, v] of Object.entries(t.patternWeights)) { assert.ok(PATTERN_IDS.includes(k), `world ${id}: unknown pattern ${k}`); assert.ok(v >= 0) }
    if (id !== '01') assert.ok(t.backdrop && t.backdrop.crop > 0 && t.backdrop.crop < 1, `world ${id} uses its painting`)
  }
  assert.equal(themeFor('nope'), themeFor(defaultWorldId), 'unknown ids fall back to World 01')
})

test('worlds look different from each other (distinct sky and trail)', () => {
  const skies = new Set(worldIds.map((id) => runnerThemes[id].sky.zenith))
  const trails = new Set(worldIds.map((id) => runnerThemes[id].trail.base))
  assert.equal(skies.size, 7); assert.equal(trails.size, 7)
})

// ---- pattern weights ---------------------------------------------------------------------------------------------------------
function kinds(world, seed, seconds = 150) {
  const s = createSim(seed, world); startRun(s, seed)
  const rows = new Map()
  for (let i = 0; i < 60 * seconds; i++) { s.phase = 'running'; update(s, 1 / 60); for (const o of s.obstacles) if (o.active) rows.set(o.dist.toFixed(2), o.kind) }
  const c = { wall: 0, ridge: 0, arch: 0 }
  for (const k of rows.values()) c[k]++
  return c
}
const W = (patternWeights) => ({ ...themeFor('01'), patternWeights })

test('pattern weights steer the generator: 0 removes a pattern, a high weight makes it common', () => {
  let ridge0 = 0, arch0 = 0, base = { ridge: 0, wall: 0, arch: 0 }, heavy = { ridge: 0, wall: 0, arch: 0 }
  for (const seed of [1, 2, 3, 4]) {
    const a = kinds(W({ ridge: 0, wallRidge: 0 }), seed); ridge0 += a.ridge
    const b = kinds(W({ arch: 0, archWall: 0 }), seed); arch0 += b.arch
    const c = kinds(themeFor('01'), seed); const d = kinds(W({ ridge: 6 }), seed)
    for (const k of ['ridge', 'wall', 'arch']) { base[k] += c[k]; heavy[k] += d[k] }
  }
  assert.equal(ridge0, 0, 'no ridges when their patterns are weighted 0')
  assert.equal(arch0, 0, 'no arches when their patterns are weighted 0')
  assert.ok(heavy.ridge / (heavy.ridge + heavy.wall + heavy.arch) > base.ridge / (base.ridge + base.wall + base.arch) + 0.1, 'ridges become clearly more common')
})

test('worlds use their own finish distance and difficulty ramp', () => {
  const fast = { ...themeFor('01'), difficultySeconds: 30 }
  const a = createSim(7, fast); startRun(a, 7)
  const b = createSim(7); startRun(b, 7)
  for (let i = 0; i < 60 * 40; i++) { a.phase = 'running'; b.phase = 'running'; update(a, 1 / 60); update(b, 1 / 60) }
  const gap = (s) => { const d = [...new Set(s.obstacles.filter((o) => o.active).map((o) => o.dist))].sort((x, y) => x - y); return (d[d.length - 1] - d[0]) / Math.max(1, d.length - 1) / s.speed }
  assert.ok(gap(a) < gap(b), 'a world with a short ramp is already at tighter gaps')
  assert.equal(themeFor('03').finishDistance, 1600)
})

// ---- every world is playable ---------------------------------------------------------------------------------------------------
test('every world is survivable by the Auto play bot (2 seeds x 150 s each)', () => {
  for (const id of worldIds) {
    for (const seed of [31, 32]) {
      const s = createSim(seed, themeFor(id)); startRun(s, seed, { auto: true })
      const bot = createBot(); s.driver = (q) => botStep(q, bot)
      for (let t = 0; t < 150 && s.phase === 'running'; t += 1 / 60) update(s, 1 / 60)
      assert.equal(s.phase, 'running', `world ${id} seed ${seed}: bot died at ${s.time.toFixed(1)} s hitting ${s.hit?.kind} ahead ${s.hit && aheadOf(s, s.hit).toFixed(1)}`)
      assert.ok(s.orbCount > 10, `world ${id}: ${s.orbCount} orbs`)
    }
  }
})
