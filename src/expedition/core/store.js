// Minimal external store for UI-facing game state. Gameplay simulation keeps
// its own mutable objects; it publishes a throttled snapshot here.
import { useSyncExternalStore } from 'react'

function createStore(initial) {
  let state = initial
  const listeners = new Set()
  return {
    get: () => state,
    set(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch
      let changed = false
      for (const k in next) if (next[k] !== state[k]) { changed = true; break }
      if (!changed) return
      state = { ...state, ...next }
      listeners.forEach((l) => l())
    },
    subscribe(l) { listeners.add(l); return () => listeners.delete(l) },
  }
}

export const PHASES = ['menu', 'playing', 'paused', 'failed', 'complete']

export const gameStore = createStore({
  phase: 'menu',
  runId: 0,
  loaded: false,
  health: 100,
  stamina: 100,
  exhausted: false,
  progress: 0,
  altitude: 0,
  hint: '',
  warning: '',
  failReason: '',
  frost: 0,
  hurt: 0,
  stats: null,
  startedAt: 0,
})

export function useGame(selector) {
  return useSyncExternalStore(gameStore.subscribe, () => selector(gameStore.get()))
}

export const actions = {
  start() {
    gameStore.set((s) => ({
      phase: 'playing', runId: s.runId + 1, health: 100, stamina: 100, progress: 0,
      hint: '', warning: '', failReason: '', frost: 0, hurt: 0, stats: null, startedAt: performance.now(),
    }))
  },
  pause() { if (gameStore.get().phase === 'playing') gameStore.set({ phase: 'paused' }) },
  resume() { if (gameStore.get().phase === 'paused') gameStore.set({ phase: 'playing' }) },
  togglePause() {
    const p = gameStore.get().phase
    if (p === 'playing') actions.pause()
    else if (p === 'paused') actions.resume()
  },
  fail(reason) { gameStore.set({ phase: 'failed', failReason: reason, warning: '' }) },
  complete(stats) { gameStore.set({ phase: 'complete', stats, warning: '', hint: '' }) },
  menu() { gameStore.set({ phase: 'menu' }) },
}
