// Which world the runner renders at start. ?world=01..07 asks for one; a world that is not unlocked yet (progress.js) falls back
// to World 01 unless ?unlock=all is given (QA / previews). Unknown ids fall back to World 01. The world-select screen switches
// worlds in-page (RunnerGame.selectWorld) and keeps ?world= in the address bar in sync.
import { worlds } from '../worlds/config.js'
import { defaultWorldId } from '../worlds/runnerThemes.js'
import { isUnlocked, emptyProgress } from './progress.js'

export const unlockAllRequested = (search = window.location.search) => new URLSearchParams(search).get('unlock') === 'all'

export function pickWorld(search = window.location.search, progress = emptyProgress()) {
  const q = new URLSearchParams(search)
  const wanted = worlds.find((w) => w.id === q.get('world'))
  const ids = worlds.map((w) => w.id)
  if (wanted && (unlockAllRequested(search) || isUnlocked(progress, wanted.id, ids))) return wanted
  return worlds.find((w) => w.id === defaultWorldId)
}
