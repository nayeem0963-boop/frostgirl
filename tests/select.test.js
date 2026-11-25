import test from 'node:test'
import assert from 'node:assert/strict'
import { worlds } from '../src/worlds/config.js'
import { pickWorld, unlockAllRequested } from '../src/runner/worlds.js'
import { describeWorlds, emptyProgress, recordRun } from '../src/runner/progress.js'

const finished = (p, id, stars = 1) => recordRun(p, id, { distance: 1500, orbs: 10, completed: true, stars })

test('world select: a fresh save has only World 01 open', () => {
  const cards = describeWorlds(emptyProgress(), worlds)
  assert.equal(cards.length, 7)
  assert.deepEqual(cards.map((c) => c.locked), [false, true, true, true, true, true, true])
  assert.equal(cards[1].unlockedBy, 'Frozen Kingdom', 'tells the player what unlocks it')
  assert.equal(cards[0].unlockedBy, null)
  assert.ok(cards.every((c) => c.finish >= 1500 && c.name))
})

test('world select: finishing a world opens the next one, stars and bests are shown', () => {
  let p = recordRun(emptyProgress(), '01', { distance: 700, orbs: 3, completed: false, stars: 0 })
  assert.equal(describeWorlds(p, worlds)[1].locked, true, 'a crash does not unlock')
  p = finished(p, '01', 2)
  let cards = describeWorlds(p, worlds)
  assert.equal(cards[1].locked, false); assert.equal(cards[2].locked, true)
  assert.equal(cards[0].stars, 2); assert.equal(cards[0].best, 1500); assert.equal(cards[0].completed, true)
  for (const id of ['02', '03', '04', '05', '06']) p = finished(p, id)
  cards = describeWorlds(p, worlds)
  assert.equal(cards[6].locked, false, 'world 07 opens after world 06')
  assert.equal(cards.filter((c) => c.locked).length, 0)
})

test('world select: ?unlock=all opens everything (QA / previews) without touching the save', () => {
  const cards = describeWorlds(emptyProgress(), worlds, true)
  assert.ok(cards.every((c) => !c.locked))
  assert.equal(unlockAllRequested('?unlock=all'), true)
  assert.equal(unlockAllRequested('?unlock=yes'), false)
  assert.equal(unlockAllRequested(''), false)
})

test('pickWorld: honours an unlocked world, falls back to 01 for locked or unknown ones', () => {
  assert.equal(pickWorld('', emptyProgress()).id, '01')
  assert.equal(pickWorld('?world=02', emptyProgress()).id, '01', 'locked -> World 01')
  assert.equal(pickWorld('?world=99', emptyProgress()).id, '01', 'unknown -> World 01')
  assert.equal(pickWorld('?world=03&unlock=all', emptyProgress()).id, '03')
  const p = finished(emptyProgress(), '01')
  assert.equal(pickWorld('?world=02', p).id, '02')
  assert.equal(pickWorld('?world=03', p).id, '01')
  assert.equal(pickWorld('?game=frost&world=07&unlock=all', p).id, '07')
})
