import test from 'node:test'
import assert from 'node:assert/strict'
import { ROWS, S_MIN, S_MAX, STEP, SPREAD, bendAt, bendPoint, bendTable, curveFor, lookShift } from '../src/runner/bend.js'
import { runnerThemes, worldIds } from '../src/worlds/runnerThemes.js'
import { cameraFor, cameraTarget } from '../src/runner/sim/camera.js'
import { slopeFor, groundY, SLOPE } from '../src/runner/scene/scenery.js'

const SPIRAL = { turn: 0.0065, wobble: 0.4, rise: 0.02, hills: 0.7 }
const full = curveFor(SPIRAL, { finish: 1600 })

test('only the mountain worlds curve: World 01 gently, World 03 fully; the rest stay straight', () => {
  const curved = worldIds.filter((id) => runnerThemes[id].spiral)
  assert.deepEqual(curved, ['01', '03'])
  assert.ok(runnerThemes['01'].spiral.turn < runnerThemes['03'].spiral.turn)
  assert.equal(curveFor(null), null)
})

test('the trail is exactly under the runner: zero offset and heading at s = 0 for any distance and any world', () => {
  for (const id of worldIds) for (const d of [0, 37, 90, 400, 1234.5, 1599]) {
    const c = curveFor(runnerThemes[id].spiral, { finish: runnerThemes[id].finishDistance })
    const p = bendPoint(bendTable(c, d), 0, 0, 0)
    assert.ok(Math.abs(p.x) < 1e-9 && Math.abs(p.y) < 1e-9 && Math.abs(p.z) < 1e-9, `${id} @ ${d}`)
  }
})

test('every lane, at the runner, stays where the sim puts it (no drift while turning)', () => {
  for (const d of [200, 700, 1300]) for (const lane of [-2.2, 0, 2.2]) {
    const p = bendPoint(bendTable(full, d), lane, 0, 0)
    assert.ok(Math.abs(p.x - lane) < 1e-9 && Math.abs(p.z) < 1e-9)
  }
})

test('a straight world is the identity', () => {
  const t = bendTable(null, 800)
  for (const [x, y, s] of [[2.2, 0.5, 30], [-2.2, 0, 120], [10, 3, 300]]) {
    const p = bendPoint(t, x, y, s)
    assert.ok(Math.abs(p.x - x) < 1e-9 && Math.abs(p.y - y) < 1e-9 && Math.abs(p.z + s) < 1e-9)
  }
})

test('the trail starts straight, eases into the bend, and straightens again before the finish', () => {
  assert.ok(Math.abs(bendAt(bendTable(full, 0), 20).w) < 0.01, 'the first metres are straight') // the curve eases in over 90 m, and nothing curves before the start
  const early = Math.abs(bendAt(bendTable(full, 20), 100).x), mid = Math.abs(bendAt(bendTable(full, 700), 100).x)
  assert.ok(early < mid)
  const end = bendTable(full, 1599)
  assert.ok(Math.abs(bendAt(end, 60).w) < 0.02, 'no further turning at the finish')
  const endless = bendTable(curveFor(SPIRAL, {}), 1599)
  assert.ok(Math.abs(bendAt(endless, 60).w) > 0.1, 'Endless has no finish, so the curve carries on')
})

test('the path is smooth: arc length is conserved, no kinks, heading changes slowly', () => {
  for (const d of [150, 600, 1100]) {
    const t = bendTable(full, d)
    let prev = null
    for (let r = 0; r < ROWS; r++) {
      const q = { x: t[r * 4], z: t[r * 4 + 2], w: t[r * 4 + 3] }
      if (prev) {
        const chord = Math.hypot(q.x - prev.x, q.z - prev.z)
        assert.ok(chord <= STEP + 1e-6 && chord > STEP * 0.97, `chord ${chord} at row ${r}`) // chords of an arc: never longer than the arc
        assert.ok(Math.abs(q.w - prev.w) < 0.1, 'at most ~6 degrees per 8 m') // R >= ~80 m
      }
      prev = q
    }
  }
})

test('a fixed point on the trail moves continuously as the run advances: no jump from one frame to the next', () => {
  const STEP_D = 0.4 // about one frame at top speed
  for (let d = 0; d < 1700; d += STEP_D) {
    const a = bendTable(full, d), b = bendTable(full, d + STEP_D)
    for (const ahead of [-20, 10, 60, 160]) { // an object `ahead` metres in front at distance d
      const pa = bendPoint(a, 1, 0.5, ahead), pb = bendPoint(b, 1, 0.5, ahead - STEP_D)
      assert.ok(Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z) < STEP_D * 2.2, `jump at d=${d.toFixed(1)} ahead=${ahead}`) // it moves about the run's step, plus the sweep of the turn
    }
  }
})

test('the climb is gentle: the trail never rises or falls more than a few degrees', () => {
  for (const d of [300, 650, 1000, 1500]) {
    const t = bendTable(full, d)
    for (let r = 1; r < ROWS; r++) assert.ok(Math.abs(t[r * 4 + 1] - t[(r - 1) * 4 + 1]) / STEP < 0.09, `grade at d=${d} row ${r}`) // < ~5 degrees
  }
})

test('Reduce motion makes the curve gentler and steady (no wobble, no rolling hills)', () => {
  const calm = curveFor(SPIRAL, { reduce: true, finish: 1600 })
  assert.ok(calm.turn < full.turn && calm.wobble === 0 && calm.hills === 0 && calm.rise < full.rise)
  const a = bendAt(bendTable(calm, 800), 100), b = bendAt(bendTable(full, 800), 100)
  assert.ok(Math.abs(a.x) < Math.abs(b.x), `${a.x.toFixed(1)} m < ${b.x.toFixed(1)} m ahead at 100 m`)
  const t = bendTable(calm, 800), t2 = bendTable(calm, 801)
  for (let r = 0; r < ROWS; r += 7) assert.ok(Math.abs(t[r * 4 + 3] - t2[r * 4 + 3]) < 0.0013, 'steady curvature: the heading barely changes from one metre to the next')
})

test('far-off scenery shears instead of swinging, and the table covers the camera to the end of the ground', () => {
  const t = bendTable(full, 900)
  const near = bendPoint(t, 30, 0, 100), far = bendPoint(t, 200, 0, 100)
  const w = bendAt(t, 100).w
  assert.ok(Math.abs((far.x - near.x) - (160 + (SPREAD - 30) * Math.cos(w))) < 1e-9, 'beyond the spread limit points only slide sideways')
  assert.ok(Math.abs((far.z - near.z) - (SPREAD - 30) * Math.sin(w)) < 1e-9)
  assert.ok(S_MIN <= -35 && S_MAX >= 400, 'camera is at s = -5.6, the ground ends 380 m ahead')
})

test('the camera turns into the bend, and is unchanged on a straight trail', () => {
  const rig = cameraFor(16 / 9), sim = { x: 0, y: 0 }
  const straight = cameraTarget(rig, sim, {}, lookShift(bendTable(null, 800)))
  assert.equal(straight.lx, 0)
  const bent = cameraTarget(rig, sim, {}, lookShift(bendTable(full, 800)))
  assert.ok(bent.lx > 0.3 && bent.lx < 2.5, `aim shifts ${bent.lx.toFixed(2)} m into the turn`)
  assert.equal(cameraTarget(rig, sim, {}).lx, 0)
})

test('mountain worlds get a steeper snow ridge; the others keep the original terrain', () => {
  assert.equal(slopeFor(runnerThemes['02']), SLOPE)
  assert.ok(slopeFor(runnerThemes['03']) > SLOPE)
  assert.equal(groundY(5), groundY(5, slopeFor(runnerThemes['03']))) // the running surface and the shoulder are the same everywhere
  assert.ok(groundY(40, slopeFor(runnerThemes['03'])) > groundY(40))
})
