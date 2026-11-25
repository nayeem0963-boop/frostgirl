// Saved progress (localStorage) and star rules. Pure functions + a thin storage wrapper that never throws
// (private mode, blocked or corrupt storage all fall back to an empty save).
import { LEVEL } from './config.js'

export const PROGRESS_KEY = 'frost-runner-progress-v1'
const LEGACY_BEST = 'frost-runner-best' // Phase 1-3: one global best distance

/** 1 star for finishing, 2 / 3 for collecting enough of the orbs that were on the level. */
export function starsFor(orbs, seen) {
  const ratio = seen > 0 ? orbs / seen : 1
  return ratio >= LEVEL.threeStars ? 3 : ratio >= LEVEL.twoStars ? 2 : 1
}

export const emptyProgress = () => ({ version: 1, worlds: {} })

const blank = () => ({ best: 0, bestOrbs: 0, stars: 0, completed: false })
const num = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0)

/** Defensive parse: anything unexpected becomes a clean value rather than a crash. */
export function sanitize(raw) {
  const p = emptyProgress()
  if (!raw || typeof raw !== 'object' || raw.version !== 1 || typeof raw.worlds !== 'object' || raw.worlds === null) return p
  for (const [id, w] of Object.entries(raw.worlds)) {
    if (!/^\d{2}$/.test(id) || !w || typeof w !== 'object') continue
    p.worlds[id] = { best: num(w.best), bestOrbs: num(w.bestOrbs), stars: Math.min(3, num(w.stars)), completed: w.completed === true }
  }
  return p
}

export function loadProgress(storage = globalThis.localStorage) {
  try {
    const text = storage?.getItem(PROGRESS_KEY)
    if (text) return sanitize(JSON.parse(text))
    // first run after Phase 3: carry the old global best distance over to World 01
    const legacy = num(Number(storage?.getItem(LEGACY_BEST)))
    const p = emptyProgress()
    if (legacy > 0) p.worlds['01'] = { ...blank(), best: legacy }
    return p
  } catch {
    return emptyProgress()
  }
}

export function saveProgress(progress, storage = globalThis.localStorage) {
  try { storage?.setItem(PROGRESS_KEY, JSON.stringify(progress)); return true } catch { return false }
}

/**
 * Record a finished attempt (a crash or a completion). Returns a NEW progress object; bests and stars only ever go up.
 * `run` = {distance, orbs, completed, stars}
 */
export function recordRun(progress, worldId, run) {
  const cur = progress.worlds[worldId] ?? blank()
  const next = {
    best: Math.max(cur.best, num(run.distance)),
    bestOrbs: Math.max(cur.bestOrbs, num(run.orbs)),
    stars: run.completed ? Math.max(cur.stars, Math.min(3, num(run.stars))) : cur.stars,
    completed: cur.completed || run.completed === true,
  }
  return { ...progress, worlds: { ...progress.worlds, [worldId]: next } }
}

/** World 01 is always open; completing world N opens world N+1. */
export function isUnlocked(progress, worldId, worldIds) {
  const i = worldIds.indexOf(worldId)
  if (i <= 0) return i === 0
  return progress.worlds[worldIds[i - 1]]?.completed === true
}

export const nextWorldId = (worldId, worldIds) => worldIds[worldIds.indexOf(worldId) + 1] ?? null
export const totalStars = (progress) => Object.values(progress.worlds).reduce((n, w) => n + w.stars, 0)

/** One card per world for the world-select screen: what to show, and whether it can be played. */
export function describeWorlds(progress, worlds, unlockAll = false) {
  const ids = worlds.map((w) => w.id)
  return worlds.map((w, i) => {
    const saved = progress.worlds[w.id] ?? { best: 0, bestOrbs: 0, stars: 0, completed: false }
    const open = unlockAll || isUnlocked(progress, w.id, ids)
    return {
      id: w.id, name: w.name, finish: w.runner.finishDistance, stars: saved.stars, best: saved.best, completed: saved.completed,
      locked: !open, unlockedBy: open || i === 0 ? null : worlds[i - 1].name, // "Finish <name> to unlock"
    }
  })
}
