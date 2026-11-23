import { actions, useGame } from '../core/store.js'

const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`

function Controls() {
  return (
    <div className="fr-controls">
      <div><kbd>W A S D</kbd> move</div>
      <div><kbd>Shift</kbd> sprint</div>
      <div><kbd>Space</kbd> jump</div>
      <div><kbd>Mouse</kbd> look (click to lock)</div>
      <div><kbd>Esc</kbd> pause</div>
    </div>
  )
}

export function Screens() {
  const phase = useGame((s) => s.phase)
  const loaded = useGame((s) => s.loaded)
  const failReason = useGame((s) => s.failReason)
  const stats = useGame((s) => s.stats)

  if (phase === 'playing') return null

  if (phase === 'menu') {
    return (
      <div className="fr-screen is-menu">
        <div className="fr-card fr-title-card">
          <p className="fr-kicker">Chapter I · The Frozen Trail</p>
          <h1 className="fr-title">FROST</h1>
          <p className="fr-sub">Aisha stands at the trailhead below a vast frozen massif. Climb through the snow pine forest to Ridge Camp before the light fades.</p>
          <button className="fr-btn" disabled={!loaded} onClick={actions.start}>
            {loaded ? 'Start expedition' : 'Preparing the mountain…'}
          </button>
          <Controls />
          <a className="fr-link" href="./">← Back to game selection</a>
        </div>
      </div>
    )
  }

  if (phase === 'paused') {
    return (
      <div className="fr-screen">
        <div className="fr-card">
          <h2>Paused</h2>
          <button className="fr-btn" onClick={actions.resume}>Resume</button>
          <button className="fr-btn is-ghost" onClick={actions.start}>Restart expedition</button>
          <Controls />
          <a className="fr-link" href="./">Quit to game selection</a>
        </div>
      </div>
    )
  }

  if (phase === 'failed') {
    return (
      <div className="fr-screen is-fail">
        <div className="fr-card">
          <h2>Expedition failed</h2>
          <p className="fr-sub">{failReason}</p>
          <button className="fr-btn" onClick={actions.start}>Try again</button>
          <a className="fr-link" href="./">Quit to game selection</a>
        </div>
      </div>
    )
  }

  if (phase === 'complete' && stats) {
    return (
      <div className="fr-screen is-complete">
        <div className="fr-card">
          <p className="fr-kicker">Checkpoint reached</p>
          <h2>Ridge Camp</h2>
          <dl className="fr-stats">
            <div><dt>Time</dt><dd>{fmt(stats.time)}</dd></div>
            <div><dt>Climbed</dt><dd>{stats.climb} m</dd></div>
            <div><dt>Altitude</dt><dd>{stats.altitude.toLocaleString()} m</dd></div>
            <div><dt>Wolf</dt><dd>{stats.wolf}</dd></div>
          </dl>
          <p className="fr-sub">The summit still towers above. The cold here feels… watchful.</p>
          <button className="fr-btn" onClick={actions.start}>Climb again</button>
          <a className="fr-link" href="./">Back to game selection</a>
        </div>
      </div>
    )
  }
  return null
}
