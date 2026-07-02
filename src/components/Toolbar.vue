<template>
  <div class="toolbar">
    <div class="toolbar-left">
      <h1 class="project-name">视频编辑器</h1>
    </div>
    <div class="toolbar-center">
      <button class="tool-btn" @click="handleUndo" title="撤销">撤销</button>
      <button class="tool-btn" @click="handleRedo" title="重做">重做</button>
      <span class="divider"></span>
      <button class="tool-btn" @click="handleImport" title="导入视频">导入</button>
      <button class="tool-btn" @click="handleAddText" title="添加字幕">字幕</button>
      <button class="tool-btn primary" @click="openExportPanel" title="导出视频">导出</button>
    </div>
    <div class="toolbar-right">
      <span class="project-info">{{ projectStore.project.name }}</span>
    </div>

    <ExportPanel ref="exportPanelRef" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useProjectStore, useTimelineStore } from '../stores'
import { useVideoEditor } from '../hooks/useVideoEditor'
import { useVideoImporter } from '../hooks/useVideoImporter'
import ExportPanel from './ExportPanel.vue'

const projectStore = useProjectStore()
const timelineStore = useTimelineStore()
const { undo, redo } = useVideoEditor()
const { importFromLocalFiles } = useVideoImporter()

const exportPanelRef = ref(null)

function handleUndo() {
  undo()
}

function handleRedo() {
  redo()
}

async function handleImport() {
  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = 'video/*'
  fileInput.multiple = true
  fileInput.onchange = async (e) => {
    const files = Array.from(e.target.files)
    if (files.length > 0) {
      const results = await importFromLocalFiles(files)
      const failed = results.filter(r => !r.success)
      if (failed.length > 0) {
        console.warn(`${failed.length} 个视频导入失败:`, failed.map(f => f.fileName))
      }
    }
  }
  fileInput.click()
}

function openExportPanel() {
  exportPanelRef.value?.openPanel()
}

function handleAddText() {
  // 找到第一个字幕轨道，没有则创建一个
  let textTrack = timelineStore.tracks.find(t => t.type === 'text')
  if (!textTrack) {
    const trackCount = timelineStore.tracks.filter(t => t.type === 'text').length + 1
    textTrack = timelineStore.addTrack('text', `字幕轨道 ${trackCount}`)
  }
  if (textTrack) {
    // 在播放头位置添加一个 5 秒字幕
    const pos = Math.max(0, timelineStore.playheadPosition)
    timelineStore.addTextClip(textTrack.id, {
      startTime: pos,
      endTime: pos + 5,
      content: '输入字幕文字',
      textStyle: {
        fontSize: 36,
        color: '#ffffff',
        backgroundColor: 'transparent',
        x: 'center',
        y: 'bottom',
        bold: false,
        italic: false,
        shadow: true
      }
    })
    import('../main').then(m => m.triggerSave?.())
  }
}
</script>

<style scoped>
.toolbar {
  height: 50px;
  background-color: #0f3460;
  display: flex;
  align-items: center;
  padding: 0 16px;
  border-bottom: 1px solid #1a1a2e;
}

.toolbar-left {
  flex: 1;
}

.project-name {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: #e94560;
}

.toolbar-center {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-btn {
  padding: 6px 12px;
  background-color: #1a1a2e;
  border: 1px solid #333;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.tool-btn:hover {
  background-color: #16213e;
  border-color: #e94560;
}

.tool-btn.primary {
  background-color: #e94560;
  border-color: #e94560;
}

.tool-btn.primary:hover {
  background-color: #d63850;
}

.divider {
  width: 1px;
  height: 24px;
  background-color: #333;
  margin: 0 8px;
}

.toolbar-right {
  flex: 1;
  text-align: right;
}

.project-info {
  font-size: 13px;
  color: #888;
}
</style>