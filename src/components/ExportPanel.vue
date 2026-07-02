<template>
  <div class="export-panel" v-if="showPanel">
    <div class="export-overlay"></div>
    <div class="export-modal">
      <div class="modal-header">
        <h2>导出视频</h2>
        <button class="close-btn" @click="closePanel">×</button>
      </div>

      <div class="modal-body">
        <div class="form-group">
          <label>格式</label>
          <div class="format-options">
            <button
              v-for="fmt in formats"
              :key="fmt.value"
              class="format-btn"
              :class="{ active: settings.format === fmt.value }"
              @click="settings.format = fmt.value"
            >
              {{ fmt.label }}
            </button>
          </div>
        </div>

        <div class="form-group">
          <label>质量</label>
          <select v-model="settings.quality" class="form-select">
            <option value="low">低 (文件小)</option>
            <option value="medium">中</option>
            <option value="high">高 (推荐)</option>
          </select>
        </div>

        <div class="form-group">
          <label>分辨率</label>
          <div class="resolution-options">
            <button
              v-for="res in resolutions"
              :key="res.label"
              class="res-btn"
              :class="{ active: isResolutionActive(res) }"
              @click="applyResolution(res)"
            >
              {{ res.label }}
            </button>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="cancel-btn" @click="closePanel">
          {{ isExporting ? '取消导出' : '取消' }}
        </button>
        <button
          class="export-btn"
          @click="handleStartExport"
          :disabled="isExporting"
        >
          {{ isExporting ? '导出中...' : '开始导出' }}
        </button>
      </div>

      <div v-if="currentJob && currentJob.error" class="export-error">
        <span>导出失败：{{ currentJob.error }}</span>
      </div>

      <div v-if="isExporting && currentJob" class="export-progress">
        <div class="progress-bar">
          <div
            class="progress-fill"
            :style="{ width: `${currentJob.progress}%` }"
          ></div>
        </div>
        <div class="progress-info">
          <span>{{ getStatusText(currentJob.status) }}</span>
          <span>{{ currentJob.progress.toFixed(0) }}%</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useExport } from '../hooks/useExport'

const { isExporting, currentJob, startExport, cancelExport, clearCurrentJob } = useExport()

const showPanel = ref(false)

const settings = reactive({
  format: 'mp4',
  quality: 'high',
  resolution: 'original'
})

const formats = [
  { label: 'MP4', value: 'mp4' },
  { label: 'WEBM', value: 'webm' }
]

const resolutions = [
  { label: '与原视频相同', value: 'original' },
  { label: '1080p', value: '1080p' },
  { label: '720p', value: '720p' },
  { label: '480p', value: '480p' }
]

function openPanel() {
  if (currentJob.value && !isExporting.value) {
    clearCurrentJob()
  }
  showPanel.value = true
}

function closePanel() {
  if (isExporting.value) {
    if (!confirm('导出正在进行中，确定要取消导出并关闭吗？')) return
    cancelExport()
  }
  showPanel.value = false
}

function isResolutionActive(res) {
  return settings.resolution === res.value
}

function applyResolution(res) {
  settings.resolution = res.value
}

async function handleStartExport() {
  try {
    await startExport({
      format: settings.format,
      quality: settings.quality,
      resolution: settings.resolution
    })
  } catch (error) {
    console.error('Export failed:', error)
  }
}

function getStatusText(status) {
  const statusMap = {
    idle: '等待中',
    preparing: '准备中',
    encoding: '编码中',
    complete: '导出完成',
    error: '导出失败',
    cancelled: '已取消'
  }
  return statusMap[status] || status
}

defineExpose({ openPanel })
</script>

<style scoped>
.export-panel {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.export-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.7);
}

.export-modal {
  position: relative;
  width: 480px;
  background-color: #16213e;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  background-color: #0f3460;
  border-bottom: 1px solid #1a1a2e;
}

.modal-header h2 {
  margin: 0;
  font-size: 18px;
  color: #fff;
}

.close-btn {
  width: 32px;
  height: 32px;
  background-color: transparent;
  border: none;
  color: #888;
  font-size: 24px;
  cursor: pointer;
}

.close-btn:hover {
  color: #e94560;
}

.modal-body {
  padding: 24px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  color: #ccc;
}

.format-options {
  display: flex;
  gap: 8px;
}

.format-btn {
  flex: 1;
  padding: 12px;
  background-color: #1a1a2e;
  border: 2px solid #333;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.format-btn.active {
  border-color: #e94560;
  background-color: rgba(233, 69, 96, 0.1);
}

.format-btn:hover {
  border-color: #e94560;
}

.form-select {
  width: 100%;
  padding: 12px;
  background-color: #1a1a2e;
  border: 1px solid #333;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}

.resolution-options {
  display: flex;
  gap: 8px;
}

.res-btn {
  flex: 1;
  padding: 10px;
  background-color: #1a1a2e;
  border: 2px solid #333;
  border-radius: 6px;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.res-btn.active {
  border-color: #e94560;
}

.res-btn:hover {
  border-color: #e94560;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  background-color: #0f3460;
  border-top: 1px solid #1a1a2e;
}

.cancel-btn {
  padding: 10px 24px;
  background-color: transparent;
  border: 1px solid #333;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.cancel-btn:hover:not(:disabled) {
  background-color: #1a1a2e;
}

.cancel-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.export-btn {
  padding: 10px 32px;
  background-color: #e94560;
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s;
}

.export-btn:hover:not(:disabled) {
  background-color: #d63050;
}

.export-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.export-progress {
  padding: 16px 24px;
  border-top: 1px solid #1a1a2e;
}

.export-error {
  padding: 12px 24px;
  border-top: 1px solid #1a1a2e;
  background-color: rgba(233, 69, 96, 0.08);
  color: #e94560;
  font-size: 13px;
  word-break: break-all;
}

.progress-bar {
  height: 6px;
  background-color: #1a1a2e;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  background-color: #e94560;
  transition: width 0.3s ease;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #888;
}
</style>