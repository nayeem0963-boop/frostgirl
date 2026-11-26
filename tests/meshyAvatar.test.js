import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MESHY_AISHA, MESHY_STATES, meshyState, meshyRunRate } from '../src/game/player/meshyAishaConfig.js'
import { ACTIVE_CHARACTER } from '../src/game/player/characterConfig.js'

function glbJson(path) {
  const b = readFileSync(path)
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'))
}

test('the original game uses the Meshy Aisha; the earlier model and the placeholder stay as fallbacks', () => {
  assert.equal(ACTIVE_CHARACTER, 'aisha')
  const cfg = readFileSync(new URL('../src/game/player/characterConfig.js', import.meta.url), 'utf8')
  assert.match(cfg, /aisha-sketchfab/)
  const player = readFileSync(new URL('../src/game/player/Player.jsx', import.meta.url), 'utf8')
  assert.match(player, /MeshyAisha/); assert.match(player, /AishaPreview/); assert.match(player, /FrostGirl/)
})

test('the clips the avatar plays exist in the Meshy aisha.glb', () => {
  const names = glbJson('public/assets/expedition/aisha.glb').animations.map((a) => a.name)
  for (const [key, def] of Object.entries(MESHY_STATES)) assert.ok(names.includes(def.clip), `${key} -> ${def.clip}`)
})

test('state follows the movement: run, jump, slide, and idle before the start', () => {
  assert.equal(meshyState({ action: 'running' }, { started: true }), 'run')
  assert.equal(meshyState({ action: 'running' }, { started: false }), 'idle')
  assert.equal(meshyState({ action: 'jumping' }, { started: true }), 'air')
  assert.equal(meshyState({ action: 'sliding' }, { started: true }), 'duck')
})

test('run cadence follows ground speed within the clip limits, so the feet keep pace', () => {
  assert.equal(meshyRunRate(0), MESHY_AISHA.minRate)
  assert.equal(meshyRunRate(8), 2)
  assert.equal(meshyRunRate(100), MESHY_AISHA.maxRate)
})

test('she faces the direction of travel (-z) and is drawn at a sensible size', () => {
  assert.ok(Math.cos(MESHY_AISHA.rotationY) < -0.999)
  assert.ok(MESHY_AISHA.scale > 0.5 && MESHY_AISHA.scale < 1.3)
})
