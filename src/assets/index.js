// The game's asset manager: one shared instance (manifest.js lists what exists, manager.js does the work, gpu.js talks to three.js)
// and the React hooks that read it.
import { useSyncExternalStore } from 'react'
import { ASSETS } from './manifest.js'
import { createAssetManager } from './manager.js'
import { decode, dispose } from './gpu.js'

export const assets = createAssetManager({ manifest: ASSETS, decode, dispose, releaseDelayMs: 400 })

/** Suspends until the model / texture is decoded (throws the load error if it failed after its retries). */
export const useAsset = (id) => assets.read(id)

/** Re-renders when anything in the manager changes (progress is throttled to ~10 per second). */
export function useAssetVersion() { return useSyncExternalStore(assets.subscribe, assets.getVersion) }

export { ASSETS, CORE, THUMBS, activeSet, nextWorld, planFor, worldAssets } from './manifest.js'
