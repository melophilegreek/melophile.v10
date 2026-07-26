import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Feature (OS notifications work when packaged as an APK): registering
// this is what unlocks ServiceWorkerRegistration.showNotification() on
// Android -- see public/sw.js and src/lib/notifications.ts for why. Kept
// out of the render path and behind 'load' so it never delays first paint;
// registration failing (unsupported browser, blocked by a privacy
// extension, etc.) is caught and ignored since background notifications
// are an enhancement, not something the app depends on.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* no-op */ });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
