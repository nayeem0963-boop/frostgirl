import test from 'node:test'
import assert from 'node:assert/strict'
import { createSim, startRun, update, command, aheadOf, STEP, holeOpen } from '../src/runner/sim/sim.js'
import { createBot, botStep } from '../src/runner/sim/bot.js'
import { minGap, openLanes, REACTION, SHIFT_TIME } from '../src/runner/sim/patterns.js'
import { themeFor, worldIds } from '../src/worlds/runnerThemes.js'
import { LANES, HOLE, OBSTACLES, RUN, ORBS } from '../src/runner/config.js'

const run = (s, sec) => { for (let t = 0; t < sec; t += 1 / 60) update(s, 1 / 60) }
function started(seed = 1, id = '04') { const s = createSim(seed, themeFor(id)); startRun(s, seed); return s }
function clear(s) { for (const o of s.obstacles) o.active = false; for (const q of s.orbs) q.active = false; s.gen.lastPos = 1e9 }
function hole(s, lane, ahead) {
  const o = s.obstacles.find((q) => !q.active)
  Object.assign(o, { active: true, kind: 'hole', lane, side: 0, dist: s.dist + ahead, id: 8181, x: LANES[lane] })
  return o
}
/** Does a jump started at `trigger` metres before the hole's centre clear it, at ground speed v? */
function jumpClears(v, trigger) {
  const s = started(); clear(s); s.speed = v
  const o = hole(s, 1, 40)
  while (aheadOf(s, o) > trigger && s.phase === 'running') update(s, STEP) // (a trigger past the hole's danger zone means it was already hit)
  command(s, 'jump'); run(s, 3)
  return s.phase === 'running'
}

test('hole: the ice cracks first and has broken open by 20 m ahead (1.6 s at top speed)', () => {
  assert.equal(holeOpen(60), 0); assert.equal(holeOpen(HOLE.breakFrom), 0)
  assert.equal(holeOpen(HOLE.breakTo), 1); assert.equal(holeOpen(4), 1)
  let last = 0
  for (let a = 60; a >= 0; a -= 0.25) { const h = holeOpen(a); assert.ok(h >= last - 1e-9); last = h }
  assert.ok(HOLE.breakTo / RUN.maxSpeed >= REACTION + 2 * SHIFT_TIME + 0.15, `${(HOLE.breakTo / RUN.maxSpeed).toFixed(2)} s`)
})

test('hole: staying in its lane is a hit; a lane change dodges it; its collider never moves', () => {
  const a = started(); clear(a); hole(a, 1, 40)
  run(a, 6); assert.equal(a.phase, 'gameover'); assert.equal(a.hit.kind, 'hole')
  const b = started(); clear(b); const o = hole(b, 1, 40)
  const x0 = o.x
  while (aheadOf(b, o) > 14) update(b, STEP)
  command(b, 'left'); run(b, 5)
  assert.equal(b.phase, 'running'); assert.equal(o.x, x0, 'static')
})

test('hole: a jump at the usual moment clears it, at every speed, with real timing margin', () => {
  for (const v of [RUN.startSpeed, 10, RUN.maxSpeed]) {
    // the usual jump trigger of a player / the ridge bot: 0.28 s of running before the obstacle
    assert.ok(jumpClears(v, v * 0.25), `speed ${v}: a jump 0.25 s before the hole clears it`)
    // timing margin: the range of jump moments (as seconds before the hole's centre) that clear it
    let ok = []
    for (let t = 0.05; t <= 0.6; t += 0.01) if (jumpClears(v, v * t)) ok.push(t)
    const width = ok.length ? ok[ok.length - 1] - ok[0] + 0.01 : 0
    assert.ok(width >= 0.12, `speed ${v}: jump window ${width.toFixed(2)} s wide (${ok[0]?.toFixed(2)}..${ok[ok.length - 1]?.toFixed(2)})`)
  }
})

test('hole: jumping too early lands in it, too late runs into it', () => {
  assert.equal(jumpClears(RUN.startSpeed, RUN.startSpeed * 0.75), false, 'too early: lands in the water')
  assert.equal(jumpClears(RUN.startSpeed, RUN.startSpeed * 0.02), false, 'too late')
  assert.ok(OBSTACLES.hole.y1 < 0.5 && OBSTACLES.hole.y1 > 0, 'only a runner on the ground is hit')
})

test('hole: a jump over it collects the arc of orbs above it', () => {
  const s = started(); clear(s)
  const o = hole(s, 1, 40)
  for (const d of [-1.2, 0, 1.2]) { const q = s.orbs.find((x) => !x.active); Object.assign(q, { active: true, taken: false, takenT: 0, x: 0, y: ORBS.arcY, dist: o.dist + d, id: 900 + d }) }
  while (aheadOf(s, o) > s.speed * 0.25) update(s, STEP)
  command(s, 'jump'); run(s, 3)
  assert.equal(s.phase, 'running'); assert.ok(s.orbCount >= 2, `${s.orbCount} orbs`)
})

test('the generator puts an arc of orbs over every hole', () => {
  const s = started(5)
  const holes = new Map(), arcs = []
  for (let i = 0; i < 60 * 120; i++) {
    s.phase = 'running'; update(s, 1 / 60)
    for (const o of s.obstacles) if (o.active && o.kind === 'hole') holes.set(o.id, o.dist)
    for (const q of s.orbs) if (q.active && q.y === ORBS.arcY) arcs.push(q.dist)
  }
  assert.ok(holes.size > 5)
  let covered = 0
  for (const d of holes.values()) if (arcs.some((a) => Math.abs(a - d) < 1.5)) covered++
  assert.equal(covered, holes.size, 'every hole has orbs over it')
})

test('hole rows are fair: reaction time, reachability, never three lanes blocked', () => {
  assert.deepEqual(openLanes({ kind: 'hole', lanes: [0, 1] }), [2])
  const BLOCK = ['wall', 'wolf', 'shard', 'hole']
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const s = started(seed)
    const seen = new Map()
    for (let i = 0; i < 60 * 150; i++) {
      s.phase = 'running'; update(s, 1 / 60)
      for (const o of s.obstacles) if (o.active) { const k = o.dist.toFixed(3); const r = seen.get(k) ?? { dist: o.dist, kind: o.kind, lanes: [] }; const l = o.lane ?? 1; if (BLOCK.includes(o.kind) && !r.lanes.includes(l)) r.lanes.push(l); seen.set(k, r) }
    }
    const rows = [...seen.values()].sort((a, b) => a.dist - b.dist)
    assert.ok(rows.filter((r) => r.kind === 'hole').length > 5, `seed ${seed}: holes present`)
    for (let i = 0; i < rows.length; i++) {
      if (BLOCK.includes(rows[i].kind)) assert.ok(rows[i].lanes.length <= 2, 'never all three lanes blocked')
      if (i === 0) continue
      const asRow = (x) => ({ kind: x.kind, lanes: BLOCK.includes(x.kind) ? x.lanes : [0, 1, 2] })
      const speed = Math.min(RUN.maxSpeed, RUN.startSpeed + RUN.accel * (rows[i].dist / RUN.startSpeed))
      const gap = (rows[i].dist - rows[i - 1].dist) / speed
      assert.ok(gap >= minGap(asRow(rows[i - 1]), asRow(rows[i])) - 0.05, `seed ${seed} row ${i}: ${rows[i - 1].kind}->${rows[i].kind} gap ${gap.toFixed(2)}s`)
    }
  }
})

test('holes appear only in the worlds that turn them on', () => {
  for (const id of worldIds) {
    let seen = 0
    for (const seed of [3, 4]) {
      const s = createSim(seed, themeFor(id)); startRun(s, seed)
      for (let i = 0; i < 60 * 130; i++) { s.phase = 'running'; update(s, 1 / 60); for (const o of s.obstacles) if (o.active && o.kind === 'hole') seen++ }
    }
    if (id === '04' || id === '07') assert.ok(seen > 50, `World 04 has holes (${seen})`)
    else assert.equal(seen, 0, `world ${id} must have none`)
  }
  assert.equal(themeFor('04').hazards.hole, true); assert.equal(themeFor('03').hazards.hole, undefined)
})

test('the Auto play bot finishes World 04 with holes (4 seeds, whole level)', () => {
  for (const seed of [41, 42, 43, 44]) {
    const s = createSim(seed, themeFor('04')); startRun(s, seed, { auto: true })
    const bot = createBot(); s.driver = (q) => botStep(q, bot)
    const met = new Set()
    for (let t = 0; t < 340 && s.phase === 'running'; t += 1 / 60) { update(s, 1 / 60); for (const o of s.obstacles) if (o.active && o.kind === 'hole') met.add(o.id) }
    assert.equal(s.phase, 'complete', `seed ${seed}: ${s.phase} at ${s.time.toFixed(1)} s, hit ${s.hit?.kind} ahead ${s.hit && aheadOf(s, s.hit).toFixed(1)}`)
    assert.ok(met.size >= 10, `seed ${seed}: met ${met.size} holes`)
  }
})
