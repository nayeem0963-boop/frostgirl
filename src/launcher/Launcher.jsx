// Entry point. Frost, the runner, opens directly: there is no game-selection screen any more. The only other thing reachable is the earlier
// third-person expedition prototype at ?game=frost&mode=expedition. Every other address, including old ?game=original bookmarks, opens Frost.
import { lazy, Suspense } from 'react'

const FrostRunner = lazy(() => import('../runner/RunnerGame.jsx'))
const Expedition = lazy(() => import('../expedition/ExpeditionGame.jsx'))
// Dev-only asset viewer; compiled out of production builds.
const ClipViewer = import.meta.env.DEV ? lazy(() => import('../expedition/dev/ClipViewer.jsx')) : null

const query = () => new URLSearchParams(window.location.search)
export const selectedGame = () => query().get('game')

const LOADING = { position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: '#0a1c38', color: '#f5fbff', font: '600 16px system-ui, sans-serif', letterSpacing: '0.1em' }
function Loading() {
  return <div style={LOADING}>Loading Frost…</div>
}

export default function Launcher() {
  const q = query()
  if (import.meta.env.DEV && q.has('viewer')) return <Suspense fallback={<Loading />}><ClipViewer /></Suspense>
  if (q.get('mode') === 'expedition') return <Suspense fallback={<Loading />}><Expedition /></Suspense>
  return <Suspense fallback={<Loading />}><FrostRunner /></Suspense>
}
