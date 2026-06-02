<template>
  <div class="video-panel">
    <div class="panel-header">
      <h2>视频列表</h2>
      <div class="header-actions">
        <button class="action-btn" @click="triggerFileInput">本地导入</button>
        <button class="action-btn" @click="showUrlInput = !showUrlInput">URL导入</button>
      </div>
      <input
        ref="fileInputRef"
        type="file"
        accept="video/*"
        multiple
        style="display: none"
        @change="handleFileSelect"
      />
    </div>

    <div v-if="showUrlInput" class="url-input-area">
      <input
        v-model="urlInput"
        type="text"
        placeholder="输入视频URL地址"
        class="url-input"
        @keyup.enter="handleImportUrl"
      />
      <button class="confirm-btn" @click="handleImportUrl" :disabled="isImporting">
        {{ isImporting ? '导入中...' : '确认' }}
      </button>
    </div>

    <div v-if="isImporting" class="import-progress">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: `${importProgress}%` }"></div>
      </div>
      <span class="progress-text">{{ importProgress }}%</span>
    </div>

    <div v-if="importError" class="error-message">
      {{ importError }}
      <button @click="importError = null">×</button>
    </div>

    <div class="video-list">
      <div
        v-for="video in projectStore.videoList"
        :key="video.id"
        class="video-item"
        :class="{ selected: video.id === projectStore.selectedVideoId, dragging: draggingVideoId === video.id }"
        draggable="true"
        @dragstart="handleDragStart($event, video)"
        @dragend="handleDragEnd"
        @click="handleSelectVideo(video.id)"
        @dblclick="addToTimeline(video.id)"
      >
        <div class="video-thumbnail">
          <img v-if="video.thumbnail" :src="video.thumbnail" alt="" />
          <div v-else class="placeholder-thumb">🎬</div>
        </div>
        <div class="video-info">
          <span class="video-name">{{ video.name }}</span>
          <span class="video-duration">{{ formatDuration(video.metadata?.duration) }}</span>
        </div>
        <button class="delete-btn" @click.stop="handleRemoveVideo(video.id)">×</button>
      </div>

      <div v-if="projectStore.videoList.length === 0" class="empty-state">
        <div class="empty-icon">📁</div>
        <p>暂无视频</p>
        <p class="hint">点击上方按钮导入视频</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useProjectStore } from '../stores'
import { useVideoImporter } from '../hooks/useVideoImporter'
import { useTimelineStore } from '../stores'

const projectStore = useProjectStore()
const timelineStore = useTimelineStore()
const { isImporting, importProgress, importError, importFromUrl, importFromLocalFiles, removeVideo } = useVideoImporter()

const showUrlInput = ref(false)
const urlInput = ref('')
const fileInputRef = ref(null)
const draggingVideoId = ref(null)

function triggerFileInput() {
  fileInputRef.value?.click()
}

async function handleFileSelect(event) {
  const files = Array.from(event.target.files)
  if (files.length > 0) {
    await importFromLocalFiles(files)
  }
  event.target.value = ''
}

async function handleImportUrl() {
  if (urlInput.value.trim()) {
    try {
      await importFromUrl(urlInput.value.trim())
      urlInput.value = ''
      showUrlInput.value = false
    } catch (error) {
      console.error('Import failed:', error)
    }
  }
}

function handleSelectVideo(videoId) {
  projectStore.selectVideo(videoId)
}

function handleDragStart(event, video) {
  draggingVideoId.value = video.id
  event.dataTransfer.setData('videoId', video.id)
  event.dataTransfer.setData('videoName', video.name)
  event.dataTransfer.effectAllowed = 'copy'
}

function handleDragEnd() {
  draggingVideoId.value = null
}

function addToTimeline(videoId) {
  const trackIndex = timelineStore.tracks.findIndex(t => t.type === 'video')
  if (trackIndex === -1) {
    timelineStore.addTrack('video')
  }
  const targetTrackIndex = timelineStore.tracks.findIndex(t => t.type === 'video')
  const video = projectStore.getVideo(videoId)
  if (video) {
    timelineStore.addClip({
      id: `clip_${Date.now()}`,
      videoId,
      startTime: 0,
      endTime: video.metadata?.duration || 10,
      trackIndex: targetTrackIndex,
      filters: [],
      volume: 1,
      speed: 1
    }, targetTrackIndex)
  }
}

function handleRemoveVideo(videoId) {
  removeVideo(videoId)
}

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}
</script>

<style scoped>
.video-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.panel-header {
  padding: 16px;
  border-bottom: 1px solid #0f3460;
}

.panel-header h2 {
  font-size: 14px;
  margin: 0 0 12px 0;
  color: #e94560;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  flex: 1;
  padding: 8px;
  background-color: #1a1a2e;
  border: 1px solid #e94560;
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  background-color: #e94560;
}

.url-input-area {
  padding: 12px 16px;
  border-bottom: 1px solid #0f3460;
  display: flex;
  gap: 8px;
}

.url-input {
  flex: 1;
  padding: 8px;
  background-color: #1a1a2e;
  border: 1px solid #0f3460;
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
}

.url-input:focus {
  outline: none;
  border-color: #e94560;
}

.confirm-btn {
  padding: 8px 16px;
  background-color: #e94560;
  border: none;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  font-size: 12px;
  transition: background-color 0.2s;
}

.confirm-btn:hover:not(:disabled) {
  background-color: #d63850;
}

.confirm-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.import-progress {
  padding: 8px 16px;
  border-bottom: 1px solid #0f3460;
  display: flex;
  align-items: center;
  gap: 12px;
}

.progress-bar {
  flex: 1;
  height: 4px;
  background-color: #333;
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background-color: #e94560;
  transition: width 0.3s;
}

.progress-text {
  font-size: 11px;
  color: #888;
  min-width: 35px;
}

.error-message {
  padding: 8px 16px;
  background-color: rgba(233, 69, 96, 0.2);
  border-bottom: 1px solid #0f3460;
  color: #e94560;
  font-size: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.error-message button {
  background: none;
  border: none;
  color: #e94560;
  cursor: pointer;
  font-size: 16px;
}

.video-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.video-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  position: relative;
  margin-bottom: 8px;
  background-color: #1a1a2e;
  transition: background-color 0.2s;
}

.video-item:hover {
  background-color: #0f3460;
}

.video-item.selected {
  background-color: #0f3460;
  border: 1px solid #e94560;
}

.video-item.dragging {
  opacity: 0.5;
  transform: scale(0.98);
}

.video-thumbnail {
  width: 80px;
  height: 45px;
  border-radius: 4px;
  overflow: hidden;
  background-color: #333;
  flex-shrink: 0;
}

.video-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.placeholder-thumb {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.video-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.video-name {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.video-duration {
  font-size: 11px;
  color: #888;
}

.delete-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  background-color: rgba(233, 69, 96, 0.8);
  border: none;
  border-radius: 50%;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  opacity: 0;
  transition: opacity 0.2s;
}

.video-item:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background-color: #e94560;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #666;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.empty-state .hint {
  font-size: 12px;
  color: #444;
  margin-top: 8px;
}
</style>
