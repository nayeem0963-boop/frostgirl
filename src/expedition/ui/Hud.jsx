import { actions, useGame } from '../core/store.js'

function Bar({ label, value, tone, dim }) {
  return (
    <div className={`fr-bar ${dim ? 'is-dim' : ''}`} aria-label={`${label} ${value}`}>
      <span className="fr-bar-label">{label}</span>
      <span className="fr-bar-track"><span className={`fr-bar-fill ${tone}`} style={{ transform: `scaleX(${value / 100})` }} /></span>
    </div>
  )
}

export function Hud() {
  const phase = useGame((s) => s.phase)
  const health = useGame((s) => s.health)
  const stamina = useGame((s) => s.stamina)
  const exhausted = useGame((s) => s.exhausted)
  const progress = useGame((s) => s.progress)
  const altitude = useGame((s) => s.altitude)
  const hint = useGame((s) => s.hint)
  const warning = useGame((s) => s.warning)
  const frost = useGame((s) => s.frost)
  const hurt = useGame((s) => s.hurt)
  if (phase === 'menu') return null
  return (
    <>
      <div className="fr-vignette" style={{ opacity: frost * 0.9 }} />
      <div className="fr-hurt" style={{ opacity: hurt * 0.8 }} />
      {phase === 'playing' && (
        <div className="fr-hud">
          <div className="fr-hud-top">
            <div className="fr-bars">
              <Bar label="Health" value={health} tone={health < 35 ? 'is-low' : 'is-health'} />
              <Bar label="Stamina" value={stamina} tone="is-stamina" dim={exhausted} />
            </div>
            <div className="fr-progress">
              <div className="fr-alt">{altitude.toLocaleString()} m</div>
              <div className="fr-route"><span style={{ width: `${progress * 100}%` }} /></div>
              <div className="fr-route-label">Ridge Camp</div>
            </div>
            <button className="fr-icon-btn" onClick={actions.pause} aria-label="Pause">❚❚</button>
          </div>
          {warning ? <div className="fr-warning" role="alert">{warning}</div> : hint ? <div className="fr-hint">{hint}</div> : null}
        </div>
      )}
    </>
  )
}
