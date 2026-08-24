import './styles/tailwind.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { registerSW } from 'virtual:pwa-register'

import App from './App.vue'
import router from './router'
import { i18n } from './i18n'

// autoUpdate (vite.config.ts) makes a newly-deployed service worker take
// over in the background, but the browser only rechecks for a new deploy on
// its own throttled schedule (can be hours) — an installed PWA left open,
// or reopened specifically to check a fix that just shipped, could sit on a
// stale build until something else forced a reload. 2026-08-26, in response
// to Jalie hitting exactly this ("cache gets stuck"). Force a recheck every
// time the tab regains focus, and apply+reload immediately once a newer
// version is found rather than prompting — matches the autoUpdate choice.
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update()
    })
  },
  onNeedRefresh() {
    updateSW(true)
  },
})

// Every admin sub-screen is a lazily-loaded route (see router/index.ts),
// so its JS lives in its own content-hashed chunk file. When we ship a
// new deploy, only the chunks that actually changed get a new hash —
// Cloudflare's static assets serve whatever's in the *latest* deploy, so
// any old-hashed chunk file a still-open tab is holding a reference to is
// simply gone. Clicking into that route then fails silently (no error UI,
// since it's an unhandled module-fetch rejection) until the tab is
// refreshed and picks up the current index.html + current chunk hashes.
// This is exactly what real-user testing hit: only Currencies "worked"
// because its source hadn't changed across the last few deploys, so its
// chunk hash happened to still be valid — everything else had.
// Vite's own recommended fix: listen for this event and reload once.
window.addEventListener('vite:preloadError', () => {
  window.location.reload()
})

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(i18n)

app.mount('#app')
