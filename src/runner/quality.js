// Render quality tiers (6.1) and the frame-time meter that steps down when a device cannot keep up.
// Pure rules only (no React, no three, no clock): the meter is fed frame times, so tests can drive it with made-up sequences.
//
// A tier only changes how the scene is drawn: pixel ratio, snow flakes and tree detail. It never touches the simulation.
// Antialiasing is fixed when the canvas is created, so a live step-down cannot change it (it keeps what the start tier chose).
export const TIERS = ['high', 'low', 'min']
export const TIER_DATA = {
  high: { dpr: [1, 2], snow: 'high', lods: [24, 80] },
  low: { dpr: [1, 1.5], snow: 'low', lods: [14, 55] },
  min: { dpr: [1, 1], snow: 'half', lods: [10, 40] },
}

export const nextTierDown = (tier) => TIERS[TIERS.indexOf(tier) + 1] ?? null
/** The lower (cheaper) of two tiers. */
export const lowerTier = (a, b) => (TIERS.indexOf(a) >= TIERS.indexOf(b) ? a : b)

/** Snow flakes for a theme at a tier: the theme's own high/low counts, and half of low at the lowest tier. */
export function snowCount(theme, tier) {
  const c = theme.snow.count
  const kind = (TIER_DATA[tier] ?? TIER_DATA.high).snow
  return kind === 'half' ? Math.round(c.low / 2) : (c[kind] ?? c.high)
}

// ---- the meter -------------------------------------------------------------------------------------------------
export const METER = {
  window: 90, // frames judged together (about 1.5 s at 60 fps, 3 s at 30)
  warmup: 2.5, // seconds of running before the first verdict: shaders compile and models upload in the first moments
  slowMs: 28, // average frame time above this (under ~36 fps) is "cannot keep up"
  cooldown: 4, // seconds to wait after a step-down before judging again, so the new tier gets a fair look
  capMs: 250, // a longer frame counts as this long: one tab switch or hitch is one capped frame, while a device whose every frame is that slow still reads as slow
}

export class FrameMeter {
  constructor(opts = {}) {
    this.o = { ...METER, ...opts }
    this.reset()
  }

  reset() {
    this.ring = []
    this.runTime = 0 // seconds of running seen since reset
    this.coolUntil = 0
  }

  /** One frame while the game is running. `ms` = frame time. */
  push(ms) {
    if (!(ms > 0)) return
    ms = Math.min(ms, this.o.capMs)
    this.runTime += ms / 1000
    this.ring.push(ms)
    if (this.ring.length > this.o.window) this.ring.shift()
  }

  stats() {
    const n = this.ring.length
    if (n === 0) return { n: 0, fps: 0, avg: 0, p95: 0 }
    const sorted = [...this.ring].sort((a, b) => a - b)
    const avg = this.ring.reduce((s, v) => s + v, 0) / n
    return { n, fps: 1000 / avg, avg, p95: sorted[Math.min(n - 1, Math.floor(n * 0.95))] }
  }

  /** 'down' when the last window of frames was too slow (after warm-up and cooldown), else null. After 'down' the meter starts a fresh window. */
  verdict() {
    if (this.runTime < this.o.warmup || this.runTime < this.coolUntil || this.ring.length < this.o.window) return null
    if (this.stats().avg <= this.o.slowMs) return null
    this.coolUntil = this.runTime + this.o.cooldown
    this.ring = []
    return 'down'
  }
}

// ---- remembering what a device can do ----------------------------------------------------------------------------
export const TIER_KEY = 'frost-runner-tier-v1'
const store = () => (typeof localStorage === 'undefined' ? null : localStorage)
export const loadTier = (storage = store()) => { try { const t = storage?.getItem(TIER_KEY); return TIERS.includes(t) ? t : null } catch { return null } }
export const saveTier = (tier, storage = store()) => { try { storage?.setItem(TIER_KEY, tier) } catch { /* private mode: it just lasts for this visit */ } }
export const clearTier = (storage = store()) => { try { storage?.removeItem(TIER_KEY) } catch { /* nothing to clear */ } }

/** The tier a visit starts on: what the screen suggests, or lower if this device was measured to need it. */
export const startTier = (detected, saved) => (saved ? lowerTier(detected, saved) : detected)

/** Which tier is used. A manual Graphics choice ('low' / 'high') is exact and never changes; 'auto' follows the adaptive tier. */
export const activeTier = (settingQuality, autoTier) => (settingQuality === 'auto' ? autoTier : settingQuality)
