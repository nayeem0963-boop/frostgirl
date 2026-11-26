import test from 'node:test'
import assert from 'node:assert/strict'
import { createSim, startRun, update } from '../src/runner/sim/sim.js'
import { createBot, botStep } from '../src/runner/sim/bot.js'
import { themeFor, worldIds } from '../src/worlds/runnerThemes.js'
import { gustAt } from '../src/runner/sim/gust.js'

const w7 = themeFor('07')

test('World 07 is the finale: every signature hazard is switched on, in its own data', () => {
  assert.deepEqual(w7.hazards, { wolf: true, shard: true, hole: true, gust: true, mist: true })
  assert.ok(w7.gust && w7.mist)
  // each hazard is rarer than in its own world
  for (const [id, key] of [['02', 'wolf'], ['03', 'shard'], ['04', 'hole']]) assert.ok(w7.patternWeights[key] < themeFor(id).patternWeights[key], key)
  assert.ok(w7.mist.length < themeFor('05').mist.length)
  assert.ok(w7.gust.period > themeFor('06').gust.period)
})

test('World 07 leaves the approach to the finish clear of mist and gusts', () => {
  const fin = w7.finishDistance
  const lastBankEnd = w7.mist.startAt + Math.floor((fin - w7.mist.startAt) / w7.mist.period) * w7.mist.period + w7.mist.length
  assert.ok(lastBankEnd < fin - 200, `last mist bank ends ${lastBankEnd}`)
  let k = 0; while (gustAt(k + 1, w7.gust).at < fin) k++
  assert.ok(gustAt(k, w7.gust).at <= fin - 100, `last gust at ${gustAt(k, w7.gust).at}`)
})

test('the other worlds are unchanged by World 07 (hazard flags stay as before)', () => {
  const flags = Object.fromEntries(worldIds.map((id) => [id, Object.keys(themeFor(id).hazards).sort().join(',')]))
  assert.deepEqual(flags, { '01': '', '02': 'wolf', '03': 'shard', '04': 'hole', '05': 'mist', '06': 'gust', '07': 'gust,hole,mist,shard,wolf' })
})

test('the Auto play bot finishes World 07 on 4 seeds and meets every hazard on the way', () => {
  for (const seed of [81, 82, 83, 84]) {
    const s = createSim(seed, w7); startRun(s, seed, { auto: true })
    const bot = createBot(); s.driver = (q) => botStep(q, bot)
    const kinds = new Set(); let thick = 0
    for (let t = 0; t < 420 && s.phase === 'running'; t += 1 / 60) {
      update(s, 1 / 60)
      for (const o of s.obstacles) if (o.active) kinds.add(o.kind)
      if (s.mist > 0.99) thick++
    }
    assert.equal(s.phase, 'complete', `seed ${seed}: ${s.phase} at ${s.time.toFixed(1)} s, ${s.dist.toFixed(0)} m, hit ${s.hit?.kind}`)
    for (const k of ['wall', 'wolf', 'shard', 'hole']) assert.ok(kinds.has(k), `seed ${seed} saw ${k}`)
    assert.ok((s.count.gust ?? 0) >= 4, `seed ${seed}: ${s.count.gust} gusts`)
    assert.ok(thick > 60 * 4, `seed ${seed}: ${(thick / 60).toFixed(0)} s in thick mist`)
  }
})
