import { Component, Suspense } from 'react'
import { AishaPreview } from './AishaPreview'
import { MeshyAisha } from './MeshyAisha'
import { ACTIVE_CHARACTER } from './characterConfig'
import { FrostGirl } from './FrostGirl'

class CharacterErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    console.error('Aisha character preview failed to load:', error)
    this.props.onPreviewError()
  }

  render() {
    if (this.state.failed) {
      return <FrostGirl {...this.props.playerProps} />
    }
    return this.props.children
  }
}

export function Player({ onPreviewError, ...props }) {
  if (ACTIVE_CHARACTER === 'placeholder') return <FrostGirl {...props} />
  if (ACTIVE_CHARACTER !== 'aisha' && ACTIVE_CHARACTER !== 'aisha-sketchfab') throw new Error(`Unknown character: ${ACTIVE_CHARACTER}`)
  return (
    <CharacterErrorBoundary playerProps={props} onPreviewError={onPreviewError}>
      <Suspense fallback={<FrostGirl {...props} />}>
        {ACTIVE_CHARACTER === 'aisha-sketchfab' ? <AishaPreview {...props} /> : <MeshyAisha {...props} />}
      </Suspense>
    </CharacterErrorBoundary>
  )
}
