import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, SETTINGS_KEY, sanitize, loadSettings, saveSettings, nextChoice, resolveReducedMotion, resolveQuality, showHint, HINT_MAX_METRES } from '../src/runner/settings.js'
import { HAPTICS_KEY } from '../src/runner/feel.js'

const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) } }

test('defaults: everything on its safe default, nothing hidden', () => {
  assert.deepEqual(DEFAULT_SETTINGS, { haptics: true, sound: true, music: true, motion: 'auto', quality: 'auto', leftHanded: false, highContrast: false, outfit: 'frost', difficulty: 'normal', hintSeen: false })
  assert.deepEqual(loadSettings(mem()), DEFAULT_SETTINGS)
})

test('settings round-trip through storage', () => {
  const st = mem()
  const s = { ...DEFAULT_SETTINGS, difficulty: 'hard', motion: 'on', quality: 'low', leftHanded: true, highContrast: true, haptics: false, hintSeen: true }
  saveSettings(s, st)
  assert.deepEqual(loadSettings(st), s)
})

test('bad or hand-edited saves fall back per field and never throw', () => {
  assert.deepEqual(sanitize({ difficulty: 'nightmare', motion: 'sideways', quality: 5, leftHanded: 'yes', haptics: 0, extra: 1 }), DEFAULT_SETTINGS)
  assert.equal(sanitize({ motion: 'off', leftHanded: true }).motion, 'off')
  assert.deepEqual(loadSettings(mem({ [SETTINGS_KEY]: '{oops' })), DEFAULT_SETTINGS)
  assert.deepEqual(sanitize(null), DEFAULT_SETTINGS)
  const broken = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') } }
  assert.deepEqual(loadSettings(broken), DEFAULT_SETTINGS); assert.doesNotThrow(() => saveSettings(DEFAULT_SETTINGS, broken))
})

test('the 6.3 vibration choice is carried over once, then the settings save wins', () => {
  assert.equal(loadSettings(mem({ [HAPTICS_KEY]: 'off' })).haptics, false)
  assert.equal(loadSettings(mem({ [HAPTICS_KEY]: 'on' })).haptics, true)
  assert.equal(loadSettings(mem({ [HAPTICS_KEY]: 'off', [SETTINGS_KEY]: JSON.stringify({ haptics: true }) })).haptics, true)
})

test('cycling choices visit every value and come back', () => {
  assert.deepEqual(['auto', 'on', 'off', 'auto'], ['auto', nextChoice('motion', 'auto'), nextChoice('motion', 'on'), nextChoice('motion', 'off')])
  assert.deepEqual(['auto', 'low', 'high', 'auto'], ['auto', nextChoice('quality', 'auto'), nextChoice('quality', 'low'), nextChoice('quality', 'high')])
})

test('reduce motion: the choice wins, auto follows the system', () => {
  assert.equal(resolveReducedMotion({ motion: 'auto' }, true), true)
  assert.equal(resolveReducedMotion({ motion: 'auto' }, false), false)
  assert.equal(resolveReducedMotion({ motion: 'on' }, false), true)
  assert.equal(resolveReducedMotion({ motion: 'off' }, true), false)
})

test('quality: the choice wins, auto uses the detected tier', () => {
  assert.equal(resolveQuality({ quality: 'auto' }, 'low'), 'low')
  assert.equal(resolveQuality({ quality: 'high' }, 'low'), 'high')
  assert.equal(resolveQuality({ quality: 'low' }, 'high'), 'low')
})

test('the first-run hint: only for a real first run, never in Auto play, and it times out', () => {
  const run = { auto: false, phase: 'running', dist: 20 }
  assert.equal(showHint(DEFAULT_SETTINGS, run), true)
  assert.equal(showHint({ ...DEFAULT_SETTINGS, hintSeen: true }, run), false)
  assert.equal(showHint(DEFAULT_SETTINGS, { ...run, auto: true }), false)
  assert.equal(showHint(DEFAULT_SETTINGS, { ...run, phase: 'gameover' }), false)
  assert.equal(showHint(DEFAULT_SETTINGS, { ...run, dist: HINT_MAX_METRES }), false)
})
