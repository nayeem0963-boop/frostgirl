import test from 'node:test'
import assert from 'node:assert/strict'
import { createSim, startRun, update, command, aheadOf, STEP, wolfX, wolfProgress } from '../src/runner/sim/sim.js'
import { createBot, botStep } from '../src/runner/sim/bot.js'
import { minGap, openLanes, REACTION, SHIFT_TIME } from '../src/runner/sim/patterns.js'
import { themeFor, worldIds } from '../src/worlds/runnerThemes.js'
import { LANES, WOLF, OBSTACLES, RUN, PLAYER } from '../src/runner/config.js'

const run = (s, sec) => { for (let t = 0; t < sec; t += 1 / 60) update(s, 1 / 60) }
function started(seed = 1, id = '02') { const s = createSim(seed, themeFor(id)); startRun(s, seed); return s }
function clear(s) { for (const o of s.obstacles) o.active = false; for (const q of s.orbs) q.active = false; s.gen.lastPos = 1e9 }
function wolf(s, lane, ahead, side) {
  const o = s.obstacles.find((q) => !q.active)
  Object.assign(o, { active: true, kind: 'wolf', lane, side: side ?? (lane === 0 ? -1 : 1), dist: s.dist + ahead, id: 4242 })
  o.x = wolfX(o, ahead)
  return o
}

test('wolf: waits beside the trail, lunges into its lane between 26 m and 14 m, and the lunge is monotonic', () => {
  const o = { lane: 0, side: -1 }
  assert.equal(wolfProgress(40), 0); assert.equal(wolfProgress(WOLF.lungeFrom), 0)
  assert.equal(wolfProgress(WOLF.lungeTo), 1); assert.equal(wolfProgress(3), 1)
  assert.equal(wolfX(o, 40), -WOLF.sideX); assert.equal(wolfX(o, 14), LANES[0]); assert.equal(wolfX(o, 0), LANES[0])
  let last = wolfX(o, 40)
  for (let a = 40; a >= 0; a -= 0.25) { const x = wolfX(o, a); assert.ok(x >= last - 1e-9, 'moves toward its lane only'); last = x }
  const mid = { lane: 1, side: 1 }
  assert.equal(wolfX(mid, 40), WOLF.sideX); assert.equal(wolfX(mid, 10), 0)
  assert.ok(WOLF.sideX > LANES[2] + OBSTACLES.wall.halfW + 1, 'it waits outside the trail')
})

test('wolf: the lunge leaves a fair reaction time even at top speed', () => {
  const need = REACTION + 2 * SHIFT_TIME // the worst case: two lane changes
  assert.ok(WOLF.lungeTo / RUN.maxSpeed >= need + 0.15, `${(WOLF.lungeTo / RUN.maxSpeed).toFixed(2)} s after it settles vs ${need.toFixed(2)} s needed`)
  assert.ok(WOLF.lungeFrom > WOLF.lungeTo + 8, 'a visible, readable run-in')
})

test('wolf: staying in its lane is a hit, switching lanes is safe, and so is jumping it', () => {
  const a = started(); clear(a); wolf(a, 1, 30)
  run(a, 6); assert.equal(a.phase, 'gameover'); assert.equal(a.hit.kind, 'wolf')
  const b = started(); clear(b); const w = wolf(b, 1, 30)
  while (aheadOf(b, w) > 11) update(b, STEP)
  command(b, 'left'); run(b, 5)
  assert.equal(b.phase, 'running', 'dodged')
  const c = started(); clear(c); const w2 = wolf(c, 1, 30)
  while (aheadOf(c, w2) > c.speed * 0.28) update(c, STEP)
  command(c, 'jump'); run(c, 4)
  assert.equal(c.phase, 'running', 'a jump at the usual moment clears a 1 m wolf')
})

test('wolf: it cannot hurt a runner in another lane, even while it is crossing the trail', () => {
  const s = started(); clear(s)
  command(s, 'right'); run(s, 0.4) // lane 2
  const w = wolf(s, 0, 40, 1) // comes from the RIGHT edge, runs across lane 2 and lane 1 to lane 0
  run(s, 8)
  assert.equal(s.phase, 'running')
  assert.ok(w.x <= LANES[0] + 1e-6 || !w.active)
})

test('wolf: a wolf row blocks its lane like a wall (fairness uses openLanes)', () => {
  const row = { kind: 'wolf', lanes: [2] }
  assert.deepEqual(openLanes(row), [0, 1])
  assert.ok(minGap({ kind: 'wolf', lanes: [0, 1] }, { kind: 'wall', lanes: [2] }) > minGap({ kind: 'wolf', lanes: [0, 1] }, { kind: 'wall', lanes: [1] }), 'moving from the only open lane to a far one needs more time')
})

test('wolves appear only in worlds that turn them on; World 01 never sees one', () => {
  for (const id of worldIds) {
    const w = themeFor(id)
    let seen = 0
    for (const seed of [3, 4, 5]) {
      const s = createSim(seed, w); startRun(s, seed)
      for (let i = 0; i < 60 * 140; i++) { s.phase = 'running'; update(s, 1 / 60); for (const o of s.obstacles) if (o.active && o.kind === 'wolf') seen++ }
    }
    if (id === '02') assert.ok(seen > 50, `World 02 has wolves (${seen})`)
    else assert.equal(seen, 0, `world ${id} must have none`)
  }
  assert.equal(themeFor('02').hazards.wolf, true); assert.deepEqual(themeFor('01').hazards, {})
})

test('World 02 rows with wolves are fair: reaction time, reachability, never three lanes blocked', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const s = started(seed)
    const seen = new Map()
    for (let i = 0; i < 60 * 150; i++) {
      s.phase = 'running'; update(s, 1 / 60)
      for (const o of s.obstacles) if (o.active) { const k = o.dist.toFixed(3); const r = seen.get(k) ?? { dist: o.dist, kind: o.kind, lanes: [] }; const l = o.lane ?? 1; if (o.kind === 'wall' || o.kind === 'wolf') { if (!r.lanes.includes(l)) r.lanes.push(l) }; seen.set(k, r) }
    }
    const rows = [...seen.values()].sort((a, b) => a.dist - b.dist)
    assert.ok(rows.filter((r) => r.kind === 'wolf').length > 5, `seed ${seed}: wolves present`)
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      if (r.kind === 'wall' || r.kind === 'wolf') assert.ok(r.lanes.length <= 2, 'never all three lanes blocked')
      if (i === 0) continue
      const prev = rows[i - 1]
      const asRow = (x) => ({ kind: x.kind, lanes: x.kind === 'wall' || x.kind === 'wolf' ? x.lanes : [0, 1, 2] })
      const speed = Math.min(RUN.maxSpeed, RUN.startSpeed + RUN.accel * (r.dist / RUN.startSpeed))
      const gap = (r.dist - prev.dist) / speed
      assert.ok(gap >= minGap(asRow(prev), asRow(r)) - 0.05, `seed ${seed} row ${i}: ${prev.kind}->${r.kind} gap ${gap.toFixed(2)}s`)
    }
  }
})

test('the Auto play bot finishes World 02 with wolves (4 seeds, whole level) and meets many of them', () => {
  for (const seed of [11, 12, 13, 14]) {
    const s = createSim(seed, themeFor('02')); startRun(s, seed, { auto: true })
    const bot = createBot(); s.driver = (q) => botStep(q, bot)
    const wolves = new Set()
    for (let t = 0; t < 300 && s.phase === 'running'; t += 1 / 60) { update(s, 1 / 60); for (const o of s.obstacles) if (o.active && o.kind === 'wolf') wolves.add(o.id) }
    assert.equal(s.phase, 'complete', `seed ${seed}: ${s.phase} at ${s.time.toFixed(1)} s, hit ${s.hit?.kind}`)
    assert.ok(wolves.size >= 10, `seed ${seed}: bot met ${wolves.size} wolves`)
  }
})

test('wolf collider is lower than a jump apex and matches the model scale', () => {
  const apex = PLAYER.jumpVelocity ** 2 / (2 * PLAYER.gravityUp)
  assert.ok(OBSTACLES.wolf.y1 < apex - 0.5, 'a jump clears it with room to spare')
  assert.ok(OBSTACLES.wolf.y1 <= 1.62 * WOLF.scale, 'collider no taller than the scaled wolf (1.62 m model height)')
  assert.ok(OBSTACLES.wolf.halfD * 2 <= 1.9 * WOLF.scale + 0.05, 'collider no longer than the scaled wolf (1.9 m model length)')
})
