<template>
  <div class="timeline" @wheel="onWheel">
    <!-- 头部工具栏 -->
    <div class="timeline-header">
      <div class="track-controls">
        <button class="track-btn" @click="handleAddVideoTrack">+ 视频轨道</button>
        <button class="track-btn" @click="handleAddAudioTrack">+ 音频轨道</button>
      </div>
      <div class="zoom-control">
        <span>缩放:</span>
        <input
          type="range"
          :min="0.1" :max="10" :step="0.1"
          :value="timelineStore.zoom"
          @input="e => onSliderZoom(parseFloat(e.target.value))"
          class="zoom-slider"
        />
        <span>{{ timelineStore.zoom.toFixed(1) }}x</span>
      </div>
    </div>

    <!-- 时间轴滚动区域 -->
    <div
      class="timeline-scroll-container"
      ref="scrollContainerRef"
      @scroll="onScroll"
    >
      <div
        class="timeline-body"
        ref="timelineBodyRef"
        @dragover.prevent="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
        @click="onTimelineClick"
        @mousedown="handleEmptyAreaMouseDown"
      >
        <!-- 时间刻度尺 -->
        <TimeRuler
          :width="timelineWidth"
          :view-width="viewWidth"
          :scroll-left="scrollLeft"
        />

        <!-- 播放头 -->
        <PlayheadLine
          :pixel-x="playheadPixel"
          :is-dragging="isDraggingPlayhead"
          @mousedown="e => onPlayheadMouseDown(e, { scrub, clearPreview, freezeFrame })"
        />

        <!-- Drop 预览线 -->
        <div v-if="isDraggingOver" class="drop-preview-line" :style="{ left: `${dropPixelX}px` }" />

        <!-- 吸附参考线 -->
        <div v-if="snapGuide" class="snap-guide-line" :style="{ left: `${snapGuide.pixel}px` }" />

        <!-- 框选矩形 -->
        <div
          v-if="isRectSelecting && selectionRect"
          class="selection-rect"
          :style="selectionRectStyle"
        />

        <!-- 轨道列表 -->
        <div class="tracks-wrapper" :style="{ width: `${timelineWidth}px` }">
          <TrackRow
            v-for="(track, idx) in timelineStore.tracks"
            :key="track.id"
            :track="track"
            :is-selected="track.id === timelineStore.selectedTrackId"
            :selected-clip-ids="timelineStore.selectedClipIds"
            :dragging-clip-id="isDragging ? dragState?.clipId : null"
            :deletable="timelineStore.tracks.filter(t => t.type === track.type).length > 1"
            :get-video-name="getVideoName"
            :get-video-thumbnail="getVideoThumbnail"
            @select-track="timelineStore.selectTrack"
            @toggle-mute="handleToggleMute"
            @delete-track="handleRemoveTrack"
            @click-clip="(id, e) => { handleClipClick(id, e) }"
            @dblclick-clip="handleClipDoubleClick"
            @mousedown-clip="onClipMouseDown"
          />
          <div v-if="timelineStore.tracks.length === 0" class="empty-timeline">
            <p>暂无轨道</p>
            <p class="hint">点击上方按钮添加轨道</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部工具栏 -->
    <div class="timeline-toolbar">
      <button class="tool-btn" @click="handleUndo" :disabled="!timelineStore.canUndo">撤销</button>
      <button class="tool-btn" @click="handleRedo" :disabled="!timelineStore.canRedo">重做</button>
      <span class="divider" />
      <button class="tool-btn" @click="handleSplitClip" :disabled="timelineStore.selectedClipIds.length !== 1">分割</button>
      <button class="tool-btn" @click="handleDeleteClip" :disabled="timelineStore.selectedClipIds.length === 0">删除</button>
      <button class="tool-btn" @click="handleDuplicateClip" :disabled="timelineStore.selectedClipIds.length !== 1">复制</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useTimelineStore, useProjectStore, usePlayerStore } from '../stores'
import { useVideoEditor } from '../hooks/useVideoEditor'
import { usePlayer } from '../hooks/usePlayer'
import { useTimeGrid } from '../composables/useTimeGrid'
import { useClipDrag } from '../composables/useClipDrag'
import { useSelection } from '../composables/useSelection'
import { usePlayhead } from '../composables/usePlayhead'
import { useTimelineZoom } from '../composables/useTimelineZoom'
import { engine } from '../core/timeline-engine'
import { triggerSave } from '../main'
import TimeRuler from './timeline/TimeRuler.vue'
import TrackRow from './timeline/TrackRow.vue'
import PlayheadLine from './timeline/PlayheadLine.vue'

// ===================== Stores & Composable =====================

const timelineStore = useTimelineStore()
const projectStore = useProjectStore()
const playerStore = usePlayerStore()
const { splitClip, duplicateClip, undo, redo, addTrack, removeTrack } = useVideoEditor()
const { seek: playerSeek, scrub, clearPreview, freezeFrame, play, pause, loadClipVideo, findClipAtTime, findNextClip } = usePlayer()
const { timeToPixel, getTimelineWidth, getPlayheadPixel } = useTimeGrid()

// Refs
const scrollContainerRef = ref(null)
const timelineBodyRef = ref(null)
const viewWidth = ref(1200)
const scrollLeft = ref(0)

// ===================== Interaction Composables =====================

const {
  dragState, isDragging, snapGuide,
  onClipMouseDown, onCommit
} = useClipDrag({ timelineBodyRef, scrollContainerRef })

onCommit(() => {
  triggerSave()
})

const {
  selectionRect, isRectSelecting,
  handleClipClick, handleEmptyAreaMouseDown,
  clearSelection
} = useSelection({ timelineBodyRef, scrollContainerRef })

const {
  isDraggingPlayhead,
  handleTimelineClick,
  onPlayheadMouseDown
} = usePlayhead({ timelineBodyRef, scrollContainerRef })

const {
  onSliderZoom, onWheel
} = useTimelineZoom({ scrollContainerRef })

// ===================== 计算 =====================

const timelineWidth = computed(() => getTimelineWidth(timelineStore.duration))

const playheadPixel = computed(() => getPlayheadPixel(timelineStore.playheadPosition))

const selectionRectStyle = computed(() => {
  if (!selectionRect.value) return {}
  return {
    position: 'absolute',
    left: `${Math.min(selectionRect.value.x1, selectionRect.value.x2)}px`,
    top: `${Math.min(selectionRect.value.y1, selectionRect.value.y2)}px`,
    width: `${Math.abs(selectionRect.value.x2 - selectionRect.value.x1)}px`,
    height: `${Math.abs(selectionRect.value.y2 - selectionRect.value.y1)}px`,
    border: '1px dashed #e94560',
    backgroundColor: 'rgba(233,69,96,0.1)',
    zIndex: 80,
    pointerEvents: 'none'
  }
})

// ===================== 缩放同步 =====================

// 初始化 engine zoom 与 store zoom 同步
engine.setZoom(timelineStore.zoom * 100)

// ===================== 点击时间轴跳转播放头 =====================

function onTimelineClick(e) {
  handleTimelineClick(e, { freezeFrame })
}

// ===================== 拖入（从 VideoPanel 拖入时间轴） =====================

const isDraggingOver = ref(false)
const dropPixelX = ref(0)
const dropTargetTrackIdx = ref(null)

function handleDragOver(e) {
  isDraggingOver.value = true
  if (!timelineBodyRef.value) return
  const rect = timelineBodyRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left + (scrollContainerRef.value?.scrollLeft || 0)
  dropPixelX.value = x

  const tracks = timelineBodyRef.value.querySelectorAll('.track')
  tracks.forEach((el, idx) => {
    const tr = el.getBoundingClientRect()
    if (e.clientY >= tr.top && e.clientY <= tr.bottom) dropTargetTrackIdx.value = idx
  })
}

function handleDragLeave() {
  isDraggingOver.value = false
  dropTargetTrackIdx.value = null
}

function handleDrop(e) {
  isDraggingOver.value = false
  const videoId = e.dataTransfer.getData('videoId')
  if (!videoId) return

  const scrollL = scrollContainerRef.value?.scrollLeft || 0
  const dropTime = Math.max(0, engine.pixelToTime(dropPixelX.value - scrollL + scrollL))

  let targetTrack = null
  if (dropTargetTrackIdx.value != null) {
    targetTrack = timelineStore.tracks[dropTargetTrackIdx.value]
  }
  if (!targetTrack || targetTrack.type !== 'video') {
    targetTrack = timelineStore.tracks.find(t => t.type === 'video')
    if (!targetTrack) targetTrack = timelineStore.addTrack('video')
  }

  const video = projectStore.getVideo(videoId)
  if (video && targetTrack) {
    const endTime = dropTime + (video.metadata?.duration || 10)
    timelineStore.addClip(targetTrack.id, videoId, dropTime, endTime)
  }
  dropTargetTrackIdx.value = null
}

function onScroll() {
  scrollLeft.value = scrollContainerRef.value?.scrollLeft || 0
  viewWidth.value = scrollContainerRef.value?.clientWidth || 1200
}

onMounted(() => {
  viewWidth.value = scrollContainerRef.value?.clientWidth || 1200
  // Ctrl+滚轮缩放由 @wheel 模板事件处理
})

// ===================== 工具函数 =====================

function getVideoName(videoId) {
  return projectStore.getVideo(videoId)?.name || '未知视频'
}

function getVideoThumbnail(videoId) {
  return projectStore.getVideo(videoId)?.thumbnail || ''
}

// ===================== 事件处理 =====================

function handleAddVideoTrack() { addTrack('video') }
function handleAddAudioTrack() { addTrack('audio') }
function handleRemoveTrack(trackId) { removeTrack(trackId) }
function handleToggleMute(trackId) { timelineStore.toggleTrackMute(trackId) }

function handleClipDoubleClick(clip) {
  const found = timelineStore.findClipById(clip.id)
  if (found && found.track.type === 'video') {
    loadClipVideo(clip)
    timelineStore.setPlayheadPosition(clip.startTime)
    setTimeout(() => { playerSeek(0); play() }, 100)
  }
}

function handleUndo() { undo() }
function handleRedo() { redo() }

function handleSplitClip() {
  if (timelineStore.selectedClipIds.length === 1) {
    splitClip(timelineStore.selectedClipIds[0], timelineStore.playheadPosition)
  }
}

function handleDeleteClip() {
  const ids = [...timelineStore.selectedClipIds]
  ids.forEach(id => timelineStore.removeClip(id))
  timelineStore.selectClips([])
  triggerSave()
}

function handleDuplicateClip() {
  if (timelineStore.selectedClipIds.length === 1) {
    duplicateClip(timelineStore.selectedClipIds[0])
  }
}
</script>

<style scoped>
.timeline {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: #1a1a2e;
  overflow: hidden;
}
.timeline-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 16px;
  background-color: #0f3460;
  border-bottom: 1px solid #1a1a2e;
  flex-shrink: 0;
}
.track-controls { display: flex; gap: 8px; }
.track-btn {
  padding: 4px 12px;
  background-color: #1a1a2e;
  border: 1px solid #e94560;
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  transition: background-color 0.2s;
}
.track-btn:hover { background-color: #e94560; }
.zoom-control { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #888; }
.zoom-slider { width: 100px; accent-color: #e94560; }

.timeline-scroll-container {
  flex: 1;
  overflow: auto;
  min-height: 0;
  position: relative;
}
.timeline-body { position: relative; min-height: 100%; }

.tracks-wrapper { min-width: 600px; }

.drop-preview-line {
  position: absolute; top: 0; bottom: 0;
  width: 2px; background-color: #4ade80;
  z-index: 90; pointer-events: none;
}
.snap-guide-line {
  position: absolute; top: 0; bottom: 0;
  width: 2px; background-color: #facc15;
  z-index: 95; pointer-events: none; opacity: 0.8;
}

.empty-timeline { text-align: center; padding: 40px 20px; color: #666; }
.empty-timeline .hint { font-size: 12px; color: #444; margin-top: 8px; }

.timeline-toolbar {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 16px;
  background-color: #0f3460;
  border-top: 1px solid #1a1a2e;
  flex-shrink: 0;
}
.tool-btn {
  padding: 6px 12px;
  background-color: #1a1a2e;
  border: 1px solid #333;
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}
.tool-btn:hover:not(:disabled) { background-color: #16213e; border-color: #e94560; }
.tool-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.divider { width: 1px; height: 20px; background-color: #333; }
</style>
