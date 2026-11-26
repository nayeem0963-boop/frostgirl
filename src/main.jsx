import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Launcher from './launcher/Launcher.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Launcher />
  </StrictMode>,
)

// Faster second visits and offline play after a full first visit (public/sw.js). Production builds only: in `vite dev` a worker would cache stale modules.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => { /* private mode or blocked: the game works without it */ }) })
}
