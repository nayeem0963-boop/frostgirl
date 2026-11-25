// Which world the runner renders. 4.2: chosen with ?world=01..07 (default 01, the original look); the world-select screen
// that sets this arrives in 4.4. Unknown ids fall back to World 01.
import { worlds } from '../worlds/config.js'
import { defaultWorldId } from '../worlds/runnerThemes.js'

export function pickWorld(search = window.location.search) {
  const id = new URLSearchParams(search).get('world')
  return worlds.find((w) => w.id === id) ?? worlds.find((w) => w.id === defaultWorldId)
}
