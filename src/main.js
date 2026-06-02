import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import { useProjectStore, useTimelineStore, syncStoreWithDB, syncDBWithStore } from './stores'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)

async function initApp() {
  try {
    await syncStoreWithDB(useProjectStore(), useTimelineStore())
  } catch (error) {
    console.warn('Failed to sync with database:', error)
  } finally {
    app.mount('#app')
  }
}

initApp()

let debounceTimer = null

function scheduleSave() {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }
  debounceTimer = setTimeout(async () => {
    try {
      await syncDBWithStore(useProjectStore(), useTimelineStore())
      console.log('Auto-save completed')
    } catch (error) {
      console.warn('Auto-save failed:', error)
    }
  }, 1000)
}

window.addEventListener('beforeunload', async () => {
  try {
    await syncDBWithStore(useProjectStore(), useTimelineStore())
  } catch (error) {
    console.warn('Failed to save before unload:', error)
  }
})

export function triggerSave() {
  scheduleSave()
}
