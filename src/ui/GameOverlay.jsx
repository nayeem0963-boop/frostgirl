function Snowflake({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M16 3v26M4.7 9.5l22.6 13M4.7 22.5l22.6-13M12.5 6.5 16 10l3.5-3.5M12.5 25.5 16 22l3.5 3.5M5.5 13l4.8-1.3-1.2-4.8M26.5 19l-4.8 1.3 1.2 4.8M5.5 19l4.8 1.3-1.2 4.8M26.5 13l-4.8-1.3 1.2-4.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const obstacleLabels = {
  iceBlock: 'an ice block',
  snowBarrier: 'a snow barrier',
  fallenPine: 'a fallen pine',
}

export function GameOverlay({ world, paused, hit, crystals, startMessage, onTogglePaused, onReset, onCommand }) {
  const stopped = paused || hit !== null || (startMessage !== null && startMessage !== 'GO!')
  const introducing = startMessage !== null && startMessage !== 'GO!' && !hit
  return (
    <div className="game-overlay">
      {hit && <div className="impact-feedback" aria-hidden="true" />}
      <header className="top-bar">
        <div className="brand">
          <Snowflake className="brand-icon" />
          <span>FROST <strong>GIRL</strong><small>AN ENCHANTED JOURNEY</small></span>
        </div>
        <div className="world-indicator">
          <span className="world-indicator-label">NOW EXPLORING</span>
          <span><span className="world-number">{world.id}</span> <span className="world-separator">/</span> 07</span>
        </div>
        <div className="top-actions">
          <button className="motion-button reset-button" type="button" onClick={onReset} aria-label="Reset runner" title="Reset runner">↺</button>
          <button className="motion-button" type="button" onClick={onTogglePaused} disabled={hit !== null} aria-pressed={paused} aria-label={paused ? 'Resume game' : 'Pause game'}>
            {paused ? <span className="play-icon" /> : <span className="pause-icon"><i /><i /></span>}
            <span className="motion-label">{paused ? 'RESUME' : 'PAUSE'}</span>
          </button>
        </div>
      </header>

      <div className="crystal-counter" aria-live="polite"><span aria-hidden="true">◆</span> <strong>{crystals}</strong> <small>CRYSTALS</small></div>
      {!introducing && <div className="active-world">WORLD {world.id} · {world.name}</div>}
      {startMessage && !hit && <div className="start-message" role="status">{paused ? 'PAUSED' : startMessage}</div>}
      {hit && <div className="collision-message" role="alert"><strong>RUN ENDED</strong><span>Hit {obstacleLabels[hit]}. Reset to try again.</span></div>}

      {introducing && <div className="scene-caption" aria-hidden="true">
        <span className="caption-line" />
        <span>A LITTLE MAGIC AWAITS</span>
      </div>}

      {introducing && <section className="story-panel" aria-labelledby="world-title">
        <div className="story-copy">
          <p className="eyebrow"><span className="eyebrow-star">✦</span> WORLD {world.id} <span className="eyebrow-rule" /> THE BEGINNING</p>
          <h1 id="world-title">{world.name}</h1>
          <p className="story-description">Focus the scene, then use arrow keys or WASD.<br />Space to jump · Esc to pause.</p>
        </div>
        <div className="scene-status">
          <span className="status-dot" />
          <div><strong>{hit ? 'RUN ENDED' : paused ? 'GAME PAUSED' : 'RUNNING'}</strong><small>PHASE 03 · FROZEN KINGDOM</small></div>
        </div>
      </section>}
      <nav className="runner-controls" aria-label="Runner controls">
        <div className="control-group">
          <button type="button" className="control-button" onClick={() => onCommand('left')} disabled={stopped} aria-label="Move left"><span aria-hidden="true">←</span><small>LEFT</small></button>
          <button type="button" className="control-button" onClick={() => onCommand('right')} disabled={stopped} aria-label="Move right"><span aria-hidden="true">→</span><small>RIGHT</small></button>
        </div>
        <div className="control-group">
          <button type="button" className="control-button" onClick={() => onCommand('jump')} disabled={stopped} aria-label="Jump"><span aria-hidden="true">↑</span><small>JUMP</small></button>
          <button type="button" className="control-button" onClick={() => onCommand('slide')} disabled={stopped} aria-label="Slide"><span aria-hidden="true">↓</span><small>SLIDE</small></button>
        </div>
      </nav>
      <footer className="bottom-bar">
        <span>AN ADVENTURE IN THE MAKING</span>
        <span className="bottom-ornament">✧</span>
        <span>FROST GIRL <span className="footer-year">/ 01</span></span>
      </footer>
    </div>
  )
}
