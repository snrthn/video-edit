<template>
  <div class="video-edit-layout">
    <Toolbar />
    <div class="main-content">
      <aside class="left-panel">
        <VideoPanel />
      </aside>
      <main class="center-panel">
        <VideoPlayer />
        <ExportPanel />
      </main>
    </div>
    <footer class="bottom-panel">
      <Timeline />
    </footer>
  </div>
</template>

<script setup>
import { useKeyboard } from '../composables/useKeyboard'
import Toolbar from './Toolbar.vue'
import VideoPanel from './VideoPanel.vue'
import VideoPlayer from './VideoPlayer.vue'
import Timeline from './Timeline.vue'
import ExportPanel from './ExportPanel.vue'

useKeyboard()
</script>

<style scoped>
.video-edit-layout {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #1a1a2e;
  color: #fff;
  overflow: hidden;
}

.main-content {
  flex: 1;
  display: flex;
  min-height: 0;
}

.left-panel {
  width: 280px;
  background-color: #16213e;
  border-right: 1px solid #0f3460;
  overflow-y: auto;
}

.center-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.bottom-panel {
  height: 300px;
  background-color: #16213e;
  border-top: 1px solid #0f3460;
}
</style>
