// Game selection. Each game is lazy-loaded on its own and launched through a
// full page navigation (?game=...), so the two never share runtime state.
import { lazy, Suspense } from 'react'
import './launcher.css'

const OriginalGame = lazy(() => import('../App.jsx'))
const FrostGame = lazy(() => import('../expedition/ExpeditionGame.jsx'))
// Dev-only asset viewer; compiled out of production builds.
const ClipViewer = import.meta.env.DEV ? lazy(() => import('../expedition/dev/ClipViewer.jsx')) : null

export function selectedGame() {
  return new URLSearchParams(window.location.search).get('game')
}

function Loading() {
  return <div className="launcher-loading">Loading…</div>
}

function GameSelect() {
  return (
    <main className="launcher">
      <h1 className="launcher-title">Choose your adventure</h1>
      <div className="launcher-grid">
        <a className="launcher-card is-original" href="?game=original">
          <span className="launcher-tag">Endless runner</span>
          <strong>Frost Girl</strong>
          <span>Race through the Frozen Kingdom, dodge obstacles and collect orbs.</span>
        </a>
        <a className="launcher-card is-frost" href="?game=frost">
          <span className="launcher-tag">3D expedition · new</span>
          <strong>Frost</strong>
          <span>Guide Aisha up a vast frozen mountain trail — wildlife, ice and something stranger.</span>
        </a>
      </div>
    </main>
  )
}

export default function Launcher() {
  const game = selectedGame()
  if (game === 'original') return <Suspense fallback={<Loading />}><OriginalGame /></Suspense>
  if (game === 'frost' && import.meta.env.DEV && new URLSearchParams(window.location.search).has('viewer')) {
    return <Suspense fallback={<Loading />}><ClipViewer /></Suspense>
  }
  if (game === 'frost') return <Suspense fallback={<Loading />}><FrostGame /></Suspense>
  return <GameSelect />
}
