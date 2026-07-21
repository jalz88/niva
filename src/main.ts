import './styles/tailwind.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'

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

app.mount('#app')
