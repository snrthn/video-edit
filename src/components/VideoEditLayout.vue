<template>
  <div class="video-edit-layout" :style="layoutStyle">
    <Toolbar />
    <div class="main-content">
      <aside class="left-panel">
        <VideoPanel />
      </aside>
      <main class="center-panel">
        <VideoPlayer />
      </main>
      <aside class="right-panel">
        <ClipProperties />
        <FilterPanel />
      </aside>
    </div>
    <!-- 可拖拽分隔条 -->
    <div class="resize-handle" @mousedown="onResizeStart" />
    <footer class="bottom-panel">
      <Timeline />
    </footer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useKeyboard } from '../composables/useKeyboard'
import Toolbar from './Toolbar.vue'
import VideoPanel from './VideoPanel.vue'
import VideoPlayer from './VideoPlayer.vue'
import Timeline from './Timeline.vue'
import ExportPanel from './ExportPanel.vue'
import ClipProperties from './ClipProperties.vue'
import FilterPanel from './FilterPanel.vue'

useKeyboard()

// ========== 底部面板高度调节 ==========
const BOTTOM_KEY = 've-bottom-height'
const MIN_BOTTOM = 120
const MAX_BOTTOM_RATIO = 0.75

const bottomHeight = ref(parseInt(localStorage.getItem(BOTTOM_KEY)) || 300)

const layoutStyle = computed(() => ({
  '--bottom-height': `${bottomHeight.value}px`
}))

let resizeStartY = 0
let resizeStartH = 0

function onResizeStart(e) {
  e.preventDefault()
  resizeStartY = e.clientY
  resizeStartH = bottomHeight.value
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeEnd)
  document.body.style.cursor = 'row-resize'
  document.body.style.userSelect = 'none'
}

function onResizeMove(e) {
  const dy = resizeStartY - e.clientY   // 向上拖 → 增加底部高度
  const layoutEl = document.querySelector('.video-edit-layout')
  const totalH = layoutEl?.clientHeight || window.innerHeight
  const maxH = Math.floor(totalH * MAX_BOTTOM_RATIO)
  let newH = resizeStartH + dy
  if (newH < MIN_BOTTOM) newH = MIN_BOTTOM
  if (newH > maxH) newH = maxH
  bottomHeight.value = newH
  localStorage.setItem(BOTTOM_KEY, String(newH))
}

function onResizeEnd() {
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}
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
  width: 260px;
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

.right-panel {
  width: 280px;
  background-color: #16213e;
  border-left: 1px solid #0f3460;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.right-panel > :first-child {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.right-panel > :last-child {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  border-top: 1px solid #0f3460;
}

.bottom-panel {
  height: var(--bottom-height, 300px);
  min-height: 120px;
  background-color: #16213e;
  border-top: 1px solid #0f3460;
  flex-shrink: 0;
}

.resize-handle {
  height: 5px;
  cursor: row-resize;
  background-color: transparent;
  transition: background-color 0.15s;
  flex-shrink: 0;
  position: relative;
  z-index: 20;
}

.resize-handle:hover,
.resize-handle:active {
  background-color: #e94560;
}
</style>
