// Aisha's outfits (6.6 part 3): cosmetic colour variants of her outfit accents, unlocked by progress. No shop, no purchase, no gameplay effect:
// every outfit has the same body, collision box and physics. `hue` turns the blue parts of her texture (the sash and glints) by that much
// of a full colour circle; skin, hair and the dark parts keep their colours (the shader only moves blues). The default needs no shader at all.
import { totalStars } from './progress.js'

export const OUTFITS = [
  { id: 'frost', name: 'Frost', hue: 0, need: {} }, // her original look, always open
  { id: 'ember', name: 'Ember', hue: 0.4, need: { stars: 6 } },
  { id: 'aurora', name: 'Aurora', hue: -0.18, need: { stars: 12 } },
  { id: 'twilight', name: 'Twilight', hue: 0.17, need: { badges: 1 } },
  { id: 'gold', name: 'Gold', hue: 0.53, need: { badges: 4 } },
]
export const DEFAULT_OUTFIT = 'frost'

export const outfitById = (id) => OUTFITS.find((o) => o.id === id) ?? OUTFITS[0]
export const badgeCount = (progress) => Object.values(progress.worlds).filter((w) => w.challenge === true).length

/** What a player has earned so far: stars across all worlds and challenge badges. */
export const earned = (progress) => ({ stars: totalStars(progress), badges: badgeCount(progress) })

export const isOutfitUnlocked = (outfit, progress, unlockAll = false) => {
  if (unlockAll) return true
  const e = earned(progress)
  return e.stars >= (outfit.need.stars ?? 0) && e.badges >= (outfit.need.badges ?? 0)
}

export const unlockedOutfits = (progress, unlockAll = false) => OUTFITS.filter((o) => isOutfitUnlocked(o, progress, unlockAll))

/** The outfit to draw: the chosen one if it is open, else the default (e.g. after the save was reset). */
export const usableOutfit = (id, progress, unlockAll = false) => { const o = outfitById(id); return isOutfitUnlocked(o, progress, unlockAll) ? o : OUTFITS[0] }

/** The next outfit in the list that is open, after the current one (wraps around). */
export function nextOutfit(id, progress, unlockAll = false) {
  const open = unlockedOutfits(progress, unlockAll)
  const i = open.findIndex((o) => o.id === id)
  return open[(i + 1) % open.length]
}

/** The first outfit that is still locked, with what it needs ("6 stars", "1 challenge badge"), or null when all are open. */
export function nextLocked(progress, unlockAll = false) {
  const o = OUTFITS.find((x) => !isOutfitUnlocked(x, progress, unlockAll))
  if (!o) return null
  const e = earned(progress)
  const text = o.need.stars !== undefined ? `${o.need.stars}★ (you have ${e.stars})` : `${o.need.badges} challenge badge${o.need.badges === 1 ? '' : 's'} (you have ${e.badges})`
  return { outfit: o, text }
}
