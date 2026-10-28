import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'))
  // The app opens from the cached copy; when a newer one arrives, switch to it the next time
  // the user leaves the app, so it never reloads in their hands.
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data !== 'app-updated') return
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') location.reload()
    })
  })
}
