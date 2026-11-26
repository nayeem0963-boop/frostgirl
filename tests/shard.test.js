import test from 'node:test'
import assert from 'node:assert/strict'
import { createSim, startRun, update, command, aheadOf, STEP, shardFall } from '../src/runner/sim/sim.js'
import { createBot, botStep } from '../src/runner/sim/bot.js'
import { minGap, openLanes, REACTION, SHIFT_TIME } from '../src/runner/sim/patterns.js'
import { themeFor, worldIds } from '../src/worlds/runnerThemes.js'
import { LANES, SHARD, OBSTACLES, RUN, PLAYER } from '../src/runner/config.js'

const run = (s, sec) => { for (let t = 0; t < sec; t += 1 / 60) update(s, 1 / 60) }
function started(seed = 1, id = '03') { const s = createSim(seed, themeFor(id)); startRun(s, seed); return s }
function clear(s) { for (const o of s.obstacles) o.active = false; for (const q of s.orbs) q.active = false; s.gen.lastPos = 1e9 }
function shard(s, lane, ahead) {
  const o = s.obstacles.find((q) => !q.active)
  Object.assign(o, { active: true, kind: 'shard', lane, side: 0, dist: s.dist + ahead, id: 5151, x: LANES[lane] })
  return o
}

test('shard: falls between 34 m and 16 m ahead (monotonic) and has landed 16 m before Aisha', () => {
  assert.equal(shardFall(80), 0); assert.equal(shardFall(SHARD.dropFrom), 0)
  assert.equal(shardFall(SHARD.landAt), 1); assert.equal(shardFall(5), 1)
  let last = 0
  for (let a = 60; a >= 0; a -= 0.25) { const f = shardFall(a); assert.ok(f >= last - 1e-9, 'never goes back up'); last = f }
  assert.ok(shardFall(25) > 0 && shardFall(25) < 1)
})

test('shard: it has landed early enough to react, even at top speed', () => {
  const need = REACTION + 2 * SHIFT_TIME
  assert.ok(SHARD.landAt / RUN.maxSpeed >= need + 0.15, `${(SHARD.landAt / RUN.maxSpeed).toFixed(2)} s after it lands vs ${need.toFixed(2)} s needed`)
  assert.ok(SHARD.dropFrom - SHARD.landAt >= 12, 'a readable, visible fall')
})

test('shard: it blocks its lane; a lane change dodges it; a jump does NOT clear it (2 m > the 1.7 m apex)', () => {
  const apex = PLAYER.jumpVelocity ** 2 / (2 * PLAYER.gravityUp)
  assert.ok(OBSTACLES.shard.y1 > apex + 0.2, 'taller than any jump')
  const a = started(); clear(a); shard(a, 1, 40)
  run(a, 6); assert.equal(a.phase, 'gameover'); assert.equal(a.hit.kind, 'shard')
  const b = started(); clear(b); const o = shard(b, 1, 40)
  while (aheadOf(b, o) > 12) update(b, STEP)
  command(b, 'right'); run(b, 5)
  assert.equal(b.phase, 'running', 'dodged')
  const c = started(); clear(c); const o2 = shard(c, 1, 40)
  while (aheadOf(c, o2) > c.speed * 0.28) update(c, STEP)
  command(c, 'jump'); run(c, 4)
  assert.equal(c.phase, 'gameover', 'jumping into a shard hits it')
})

test('shard: the lane it will fall into is the lane that blocks (static collider)', () => {
  const s = started(); clear(s)
  const o = shard(s, 2, 50)
  const x0 = o.x
  run(s, 3)
  assert.equal(o.x, x0, 'its collider never moves')
  assert.equal(o.x, LANES[2])
})

test('shard rows are fair: reaction time, reachability, never three lanes blocked', () => {
  assert.deepEqual(openLanes({ kind: 'shard', lanes: [0, 2] }), [1])
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const s = started(seed)
    const seen = new Map()
    for (let i = 0; i < 60 * 150; i++) {
      s.phase = 'running'; update(s, 1 / 60)
      for (const o of s.obstacles) if (o.active) { const k = o.dist.toFixed(3); const r = seen.get(k) ?? { dist: o.dist, kind: o.kind, lanes: [] }; const l = o.lane ?? 1; if (o.kind === 'wall' || o.kind === 'wolf' || o.kind === 'shard') { if (!r.lanes.includes(l)) r.lanes.push(l) }; seen.set(k, r) }
    }
    const rows = [...seen.values()].sort((a, b) => a.dist - b.dist)
    assert.ok(rows.filter((r) => r.kind === 'shard').length > 5, `seed ${seed}: shards present`)
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      if (['wall', 'wolf', 'shard'].includes(r.kind)) assert.ok(r.lanes.length <= 2, 'never all three lanes blocked')
      if (i === 0) continue
      const prev = rows[i - 1]
      const asRow = (x) => ({ kind: x.kind, lanes: ['wall', 'wolf', 'shard'].includes(x.kind) ? x.lanes : [0, 1, 2] })
      const speed = Math.min(RUN.maxSpeed, RUN.startSpeed + RUN.accel * (r.dist / RUN.startSpeed))
      const gap = (r.dist - prev.dist) / speed
      assert.ok(gap >= minGap(asRow(prev), asRow(r)) - 0.05, `seed ${seed} row ${i}: ${prev.kind}->${r.kind} gap ${gap.toFixed(2)}s`)
    }
  }
})

test('shards appear only in the worlds that turn them on', () => {
  for (const id of worldIds) {
    let seen = 0
    for (const seed of [3, 4]) {
      const s = createSim(seed, themeFor(id)); startRun(s, seed)
      for (let i = 0; i < 60 * 130; i++) { s.phase = 'running'; update(s, 1 / 60); for (const o of s.obstacles) if (o.active && o.kind === 'shard') seen++ }
    }
    if (id === '03' || id === '07') assert.ok(seen > 50, `World 03 has shards (${seen})`)
    else assert.equal(seen, 0, `world ${id} must have none`)
  }
  assert.equal(themeFor('03').hazards.shard, true); assert.equal(themeFor('02').hazards.shard, undefined)
})

test('the Auto play bot finishes World 03 with shards (4 seeds, whole level)', () => {
  for (const seed of [21, 22, 23, 24]) {
    const s = createSim(seed, themeFor('03')); startRun(s, seed, { auto: true })
    const bot = createBot(); s.driver = (q) => botStep(q, bot)
    const met = new Set()
    for (let t = 0; t < 320 && s.phase === 'running'; t += 1 / 60) { update(s, 1 / 60); for (const o of s.obstacles) if (o.active && o.kind === 'shard') met.add(o.id) }
    assert.equal(s.phase, 'complete', `seed ${seed}: ${s.phase} at ${s.time.toFixed(1)} s, hit ${s.hit?.kind}`)
    assert.ok(met.size >= 10, `seed ${seed}: met ${met.size} shards`)
  }
})
