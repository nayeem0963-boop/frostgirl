import test from 'node:test'
import assert from 'node:assert/strict'
import { OUTFITS, DEFAULT_OUTFIT, outfitById, earned, badgeCount, isOutfitUnlocked, unlockedOutfits, usableOutfit, nextOutfit, nextLocked } from '../src/runner/outfits.js'
import { emptyProgress, recordRun, totalStars } from '../src/runner/progress.js'
import { sanitize, loadSettings, saveSettings, DEFAULT_SETTINGS } from '../src/runner/settings.js'

const withStars = (n) => { let p = emptyProgress(); const ids = ['01', '02', '03', '04', '05', '06', '07']; let left = n; for (const id of ids) { const s = Math.min(3, left); left -= s; if (s) p = recordRun(p, id, { distance: 1500, orbs: 1, completed: true, stars: s }) } return p }
const withBadges = (n) => { let p = emptyProgress(); for (const id of ['01', '02', '03', '04', '05', '06', '07'].slice(0, n)) p = recordRun(p, id, { distance: 1500, orbs: 1, completed: true, stars: 1, challenge: true }); return p }

test('the outfit list: the original look first and always open, unique ids, distinct colours, sensible requirements', () => {
  assert.equal(OUTFITS[0].id, DEFAULT_OUTFIT); assert.equal(OUTFITS[0].hue, 0); assert.deepEqual(OUTFITS[0].need, {})
  assert.equal(new Set(OUTFITS.map((o) => o.id)).size, OUTFITS.length)
  const hues = OUTFITS.map((o) => ((o.hue % 1) + 1) % 1)
  for (let i = 0; i < hues.length; i++) for (let j = i + 1; j < hues.length; j++) assert.ok(Math.min(Math.abs(hues[i] - hues[j]), 1 - Math.abs(hues[i] - hues[j])) > 0.1, `${OUTFITS[i].id} vs ${OUTFITS[j].id} are too close`)
  for (const o of OUTFITS.slice(1)) assert.ok((o.need.stars ?? 0) > 0 || (o.need.badges ?? 0) > 0, `${o.id} needs something`)
  assert.ok(Math.max(...OUTFITS.map((o) => o.need.stars ?? 0)) <= 21, 'star requirements fit in the 21 stars there are')
  assert.ok(Math.max(...OUTFITS.map((o) => o.need.badges ?? 0)) <= 7, 'badge requirements fit in the 7 badges there are')
  assert.equal(outfitById('nope').id, DEFAULT_OUTFIT)
})

test('outfits unlock from stars and challenge badges, exactly at the requirement', () => {
  const ember = outfitById('ember'), aurora = outfitById('aurora'), twilight = outfitById('twilight'), gold = outfitById('gold')
  assert.equal(isOutfitUnlocked(ember, withStars(5)), false); assert.equal(isOutfitUnlocked(ember, withStars(6)), true)
  assert.equal(isOutfitUnlocked(aurora, withStars(11)), false); assert.equal(isOutfitUnlocked(aurora, withStars(12)), true)
  assert.equal(isOutfitUnlocked(twilight, emptyProgress()), false); assert.equal(isOutfitUnlocked(twilight, withBadges(1)), true)
  assert.equal(isOutfitUnlocked(gold, withBadges(3)), false); assert.equal(isOutfitUnlocked(gold, withBadges(4)), true)
  assert.deepEqual(earned(withBadges(2)), { stars: 2, badges: 2 }); assert.equal(badgeCount(emptyProgress()), 0)
  assert.equal(totalStars(withStars(9)), 9)
})

test('?unlock=all opens everything; a fresh save has only the original', () => {
  assert.deepEqual(unlockedOutfits(emptyProgress()).map((o) => o.id), ['frost'])
  assert.equal(unlockedOutfits(emptyProgress(), true).length, OUTFITS.length)
})

test('a locked choice (e.g. after a reset) is drawn as the original; an open one is used', () => {
  assert.equal(usableOutfit('gold', emptyProgress()).id, 'frost')
  assert.equal(usableOutfit('ember', withStars(6)).id, 'ember')
  assert.equal(usableOutfit('gold', emptyProgress(), true).id, 'gold')
  assert.equal(usableOutfit('unknown', withStars(21)).id, 'frost')
})

test('cycling goes through the open outfits only, in order, and wraps', () => {
  const p = withStars(12) // frost, ember, aurora
  assert.equal(nextOutfit('frost', p).id, 'ember'); assert.equal(nextOutfit('ember', p).id, 'aurora'); assert.equal(nextOutfit('aurora', p).id, 'frost')
  assert.equal(nextOutfit('frost', emptyProgress()).id, 'frost', 'with only one open outfit there is nothing to switch to')
  assert.equal(nextOutfit('gold', emptyProgress()).id, 'frost', 'a locked current choice goes back to an open one')
})

test('the next locked outfit is named with what it needs and what the player has', () => {
  assert.equal(nextLocked(emptyProgress()).outfit.id, 'ember'); assert.equal(nextLocked(emptyProgress()).text, '6★ (you have 0)')
  assert.equal(nextLocked(withStars(7)).outfit.id, 'aurora'); assert.match(nextLocked(withStars(7)).text, /12★ \(you have 7\)/)
  const p = recordRun(withStars(12), '01', { distance: 1500, orbs: 1, completed: true, stars: 3, challenge: true })
  assert.equal(nextLocked(p).outfit.id, 'gold'); assert.match(nextLocked(p).text, /4 challenge badges \(you have 1\)/)
  assert.equal(nextLocked(emptyProgress(), true), null, 'nothing is locked with ?unlock=all')
})

test('the chosen outfit is saved with the settings; junk values fall back to the original', () => {
  assert.equal(DEFAULT_SETTINGS.outfit, 'frost')
  const mem = new Map(); const st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) }
  saveSettings({ ...DEFAULT_SETTINGS, outfit: 'aurora' }, st); assert.equal(loadSettings(st).outfit, 'aurora')
  assert.equal(sanitize({ outfit: 42 }).outfit, 'frost'); assert.equal(sanitize({ outfit: 'Bad Value!' }).outfit, 'frost'); assert.equal(sanitize({ outfit: '' }).outfit, 'frost')
})
