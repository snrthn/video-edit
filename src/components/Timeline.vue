<template>
  <div class="timeline">
    <div class="timeline-header">
      <div class="track-controls">
        <button class="track-btn" @click="handleAddVideoTrack">+ 视频轨道</button>
        <button class="track-btn" @click="handleAddAudioTrack">+ 音频轨道</button>
      </div>
      <div class="zoom-control">
        <span>缩放:</span>
        <input
          type="range"
          min="0.1"
          max="5"
          step="0.1"
          :value="timelineStore.zoom"
          @input="handleZoomChange"
          class="zoom-slider"
        />
        <span>{{ timelineStore.zoom.toFixed(1) }}x</span>
      </div>
    </div>

    <div
      class="timeline-scroll-container"
      ref="scrollContainer"
      @scroll="handleScroll"
    >
      <div
        class="timeline-body"
        ref="timelineBody"
        @dragover.prevent="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
        @mousemove="handleMouseMove"
        @click="handleTimelineClick"
      >
        <div class="time-ruler" :style="{ width: `${timelineWidth}px` }">
          <div
            v-for="tick in timeTicks"
            :key="tick"
            class="time-tick"
            :class="{ major: tick % 10 === 0 }"
            :style="{ left: `${tick * 100 * timelineStore.zoom}px` }"
          >
            <span class="tick-label">{{ formatTime(tick) }}</span>
          </div>
        </div>

        <div class="playhead" :style="{ left: `${playheadLeft}px` }">
          <div class="playhead-head">▼</div>
          <div class="playhead-line"></div>
        </div>

        <div
          v-if="isDraggingOver"
          class="drop-preview-line"
          :style="{ left: `${dropPosition}px` }"
        ></div>

        <div class="tracks-wrapper" :style="{ width: `${timelineWidth}px` }">
          <div
            v-for="track in timelineStore.tracks"
            :key="track.id"
            class="track"
            :class="{ selected: track.id === timelineStore.selectedTrackId, muted: track.muted }"
            :style="{ height: `${track.height}px` }"
            @click="handleSelectTrack(track.id)"
          >
            <div class="track-label">
              <span class="track-name">{{ track.name }}</span>
              <button
                class="track-mute"
                :class="{ muted: track.muted }"
                @click.stop="handleToggleMute(track.id)"
              >
                {{ track.muted ? '🔇' : '🔊' }}
              </button>
            </div>

            <div class="track-clips">
              <div
                v-for="clip in track.clips"
                :key="clip.id"
                class="clip"
                :class="{
                  selected: timelineStore.selectedClipIds.includes(clip.id),
                  dragging: draggingClip?.id === clip.id
                }"
                :style="getClipStyle(clip, track)"
                @click.stop="handleSelectClip(clip.id, $event)"
                @dblclick="handleClipDoubleClick(clip)"
                @mousedown="handleClipMouseDown($event, clip, track)"
              >
                <div
                  class="clip-thumbnail"
                  :style="{ backgroundImage: `url(${getVideoThumbnail(clip.videoId)})` }"
                ></div>
                <div class="clip-overlay">
                  <span class="clip-name">{{ getVideoName(clip.videoId) }}</span>
                  <div class="clip-duration">{{ formatClipDuration(clip) }}</div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="timelineStore.tracks.length === 0" class="empty-timeline">
            <p>暂无轨道</p>
            <p class="hint">点击上方按钮添加轨道</p>
          </div>
        </div>
      </div>
    </div>

    <div class="timeline-toolbar">
      <button class="tool-btn" @click="handleUndo" :disabled="!canUndo">撤销</button>
      <button class="tool-btn" @click="handleRedo" :disabled="!canRedo">重做</button>
      <span class="divider"></span>
      <button class="tool-btn" @click="handleSplitClip" :disabled="!canSplit">分割</button>
      <button class="tool-btn" @click="handleDeleteClip" :disabled="timelineStore.selectedClipIds.length === 0">删除</button>
      <button class="tool-btn" @click="handleDuplicateClip" :disabled="timelineStore.selectedClipIds.length === 0">复制</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useTimelineStore, useProjectStore, usePlayerStore } from '../stores'
import { useVideoEditor } from '../hooks/useVideoEditor'
import { usePlayer } from '../hooks/usePlayer'

const timelineStore = useTimelineStore()
const projectStore = useProjectStore()
const playerStore = usePlayerStore()
const { splitClip, duplicateClip, trimClip, undo, redo } = useVideoEditor()
const { seek, play, pause, loadClipVideo } = usePlayer()

const scrollContainer = ref(null)
const timelineBody = ref(null)
const isDraggingOver = ref(false)
const dropPosition = ref(0)
const dropTargetTrack = ref(null)
const dropTrackTop = ref(0)
const dropTrackHeight = ref(0)
const scrollLeft = ref(0)

const draggingClip = ref(null)
const dragOffset = ref({ x: 0 })
const dragStartTime = ref(0)
const dragSourceTrack = ref(null)

const timelineWidth = computed(() => {
  const duration = timelineStore.duration || 60
  const contentWidth = duration * 100 * timelineStore.zoom
  const minWidth = 2000
  return Math.max(contentWidth, minWidth)
})

const timeTicks = computed(() => {
  const duration = timelineStore.duration || 60
  const containerWidth = scrollContainer.value?.clientWidth || 1200
  const zoom = timelineStore.zoom
  const maxTime = Math.max(duration, Math.ceil(containerWidth / (100 * zoom)))
  const ticks = []
  const interval = zoom < 0.5 ? 10 : zoom < 1 ? 5 : 1
  for (let i = 0; i <= maxTime; i += interval) {
    ticks.push(i)
  }
  return ticks
})

const playheadLeft = computed(() => {
  return 80 + timelineStore.playheadPosition * 100 * timelineStore.zoom
})

const canUndo = computed(() => timelineStore.historyIndex > 0)
const canRedo = computed(() => timelineStore.historyIndex < timelineStore.historyStack.length - 1)
const canSplit = computed(() => timelineStore.selectedClipIds.length === 1)

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function formatClipDuration(clip) {
  const duration = clip.endTime - clip.startTime
  return duration.toFixed(1) + 's'
}

function handleZoomChange(e) {
  timelineStore.setZoom(parseFloat(e.target.value))
}

function handleScroll(e) {
  scrollLeft.value = e.target.scrollLeft
}

function handleAddVideoTrack() {
  timelineStore.addTrack('video')
}

function handleAddAudioTrack() {
  timelineStore.addTrack('audio')
}

function handleSelectTrack(trackId) {
  timelineStore.selectTrack(trackId)
}

function handleToggleMute(trackId) {
  const track = timelineStore.tracks.find(t => t.id === trackId)
  if (track) {
    track.muted = !track.muted
    timelineStore.updateTrack(trackId, track)
  }
}

function handleSelectClip(clipId, event) {
  if (event.ctrlKey || event.metaKey) {
    const currentSelected = [...timelineStore.selectedClipIds]
    if (currentSelected.includes(clipId)) {
      timelineStore.selectClips(currentSelected.filter(id => id !== clipId))
    } else {
      timelineStore.selectClips([...currentSelected, clipId])
    }
  } else {
    timelineStore.selectClips([clipId])
  }
}

function handleClipDoubleClick(clip) {
  const track = timelineStore.tracks.find(t => t.id === clip.trackIndex)
  if (track && track.type === 'video') {
    loadClipVideo(clip)
    timelineStore.setPlayheadPosition(clip.startTime)
    setTimeout(() => {
      seek(0)
      play()
    }, 100)
  }
}

function getClipStyle(clip, track) {
  const left = clip.startTime * 100 * timelineStore.zoom
  const width = Math.max((clip.endTime - clip.startTime) * 100 * timelineStore.zoom, 60)
  return {
    left: `${left}px`,
    width: `${width}px`,
    backgroundColor: track.type === 'video' ? '#4a90d9' : '#50c878'
  }
}

function getVideoName(videoId) {
  const video = projectStore.getVideo(videoId)
  return video?.name || '未知视频'
}

function getVideoThumbnail(videoId) {
  const video = projectStore.getVideo(videoId)
  return video?.thumbnail || ''
}

function handleUndo() {
  undo()
}

function handleRedo() {
  redo()
}

function handleSplitClip() {
  if (timelineStore.selectedClipIds.length === 1) {
    splitClip(timelineStore.selectedClipIds[0], timelineStore.playheadPosition)
  }
}

function handleDeleteClip() {
  const clipIds = [...timelineStore.selectedClipIds]
  clipIds.forEach(id => timelineStore.removeClip(id))
  timelineStore.selectClips([])
}

function handleDuplicateClip() {
  if (timelineStore.selectedClipIds.length === 1) {
    duplicateClip(timelineStore.selectedClipIds[0])
  }
}

function handleDragOver(e) {
  isDraggingOver.value = true

  if (!timelineBody.value) return

  const rect = timelineBody.value.getBoundingClientRect()
  const scrollL = scrollContainer.value?.scrollLeft || 0
  const x = e.clientX - rect.left + scrollL
  dropPosition.value = x

  const tracks = timelineBody.value.querySelectorAll('.track')
  let foundTrack = null
  let trackTop = 0
  let trackHeight = 50

  tracks.forEach((trackEl, index) => {
    const trackRect = trackEl.getBoundingClientRect()
    if (e.clientY >= trackRect.top && e.clientY <= trackRect.bottom) {
      foundTrack = index
      trackTop = trackRect.top - rect.top + (scrollContainer.value?.scrollTop || 0)
      trackHeight = trackRect.height
    }
  })

  dropTargetTrack.value = foundTrack
  dropTrackTop.value = trackTop
  dropTrackHeight.value = trackHeight
}

function handleDragLeave() {
  isDraggingOver.value = false
  dropTargetTrack.value = null
}

function handleDrop(e) {
  isDraggingOver.value = false

  const videoId = e.dataTransfer.getData('videoId')
  if (!videoId) return

  if (!timelineBody.value) return

  const scrollL = scrollContainer.value?.scrollLeft || 0
  const x = e.clientX - 80 - scrollL + scrollL
  const dropTime = Math.max(0, x / (100 * timelineStore.zoom))

  let targetTrackIndex = dropTargetTrack.value

  if (targetTrackIndex === null || targetTrackIndex === -1) {
    targetTrackIndex = timelineStore.tracks.findIndex(t => t.type === 'video')
    if (targetTrackIndex === -1) {
      timelineStore.addTrack('video')
      targetTrackIndex = timelineStore.tracks.length - 1
    }
  } else {
    const targetTrack = timelineStore.tracks[targetTrackIndex]
    if (targetTrack.type !== 'video') {
      targetTrackIndex = timelineStore.tracks.findIndex(t => t.type === 'video')
      if (targetTrackIndex === -1) {
        timelineStore.addTrack('video')
        targetTrackIndex = timelineStore.tracks.length - 1
      }
    }
  }

  const video = projectStore.getVideo(videoId)
  if (video) {
    const track = timelineStore.tracks[targetTrackIndex]
    if (track) {
      const startTime = Math.max(0, dropTime)
      const endTime = startTime + (video.metadata?.duration || 10)
      timelineStore.addClip(track.id, videoId, startTime, endTime)
    }
  }

  dropTargetTrack.value = null
}

function handleMouseMove(e) {
}

function handleTimelineClick(e) {
  if (e.target.closest('.clip') || e.target.closest('.track-label')) return

  const scrollL = scrollContainer.value?.scrollLeft || 0
  const x = e.clientX - 80 + scrollL
  const time = Math.max(0, x / (100 * timelineStore.zoom))

  timelineStore.setPlayheadPosition(time)

  const clipAtTime = findClipAtTime(time)
  if (clipAtTime) {
    loadClipVideo(clipAtTime)
    setTimeout(() => {
      seek(time)
    }, 50)
  }
}

function findClipAtTime(time) {
  for (const track of timelineStore.tracks) {
    for (const clip of track.clips) {
      if (time >= clip.startTime && time < clip.endTime) {
        return clip
      }
    }
  }
  return null
}

function handleClipMouseDown(e, clip, track) {
  e.preventDefault()
  e.stopPropagation()

  draggingClip.value = clip
  dragStartTime.value = clip.startTime
  dragSourceTrack.value = track

  const scrollL = scrollContainer.value?.scrollLeft || 0
  const clipX = clip.startTime * 100 * timelineStore.zoom
  dragOffset.value = {
    x: e.clientX - clipX
  }

  document.addEventListener('mousemove', handleClipDrag)
  document.addEventListener('mouseup', handleClipDragEnd)
}

function handleClipDrag(e) {
  if (!draggingClip.value || !timelineBody.value) return

  const scrollL = scrollContainer.value?.scrollLeft || 0
  const x = e.clientX - 80 + scrollL - dragOffset.value.x
  const newStartTime = Math.max(0, x / (100 * timelineStore.zoom))

  const clipDuration = draggingClip.value.endTime - draggingClip.value.startTime
  const newEndTime = newStartTime + clipDuration

  const scrollT = scrollContainer.value?.scrollTop || 0
  const rect = timelineBody.value.getBoundingClientRect()

  const tracks = timelineBody.value.querySelectorAll('.track')
  let targetTrack = null
  let targetTrackIndex = -1

  tracks.forEach((trackEl, index) => {
    const trackRect = trackEl.getBoundingClientRect()
    if (e.clientY >= trackRect.top && e.clientY <= trackRect.bottom) {
      targetTrack = timelineStore.tracks[index]
      targetTrackIndex = index
    }
  })

  if (targetTrack && targetTrack.id !== dragSourceTrack.value.id) {
    timelineStore.removeClip(draggingClip.value.id)
    timelineStore.addClip(targetTrack.id, draggingClip.value.videoId, newStartTime, newEndTime)

    const newClip = targetTrack.clips[targetTrack.clips.length - 1]
    draggingClip.value = newClip
    dragSourceTrack.value = targetTrack
  } else {
    timelineStore.updateClip(draggingClip.value.id, {
      startTime: newStartTime,
      endTime: newEndTime
    })
  }
}

function handleClipDragEnd() {
  if (draggingClip.value) {
    timelineStore.saveToHistory('移动剪辑片段')
  }
  draggingClip.value = null
  dragSourceTrack.value = null

  document.removeEventListener('mousemove', handleClipDrag)
  document.removeEventListener('mouseup', handleClipDragEnd)
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
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background-color: #0f3460;
  border-bottom: 1px solid #1a1a2e;
  flex-shrink: 0;
}

.track-controls {
  display: flex;
  gap: 8px;
}

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

.track-btn:hover {
  background-color: #e94560;
}

.zoom-control {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #888;
}

.zoom-slider {
  width: 100px;
  accent-color: #e94560;
}

.timeline-scroll-container {
  flex: 1;
  overflow: auto;
  min-height: 0;
  position: relative;
}

.timeline-body {
  position: relative;
  min-height: 100%;
}

.time-ruler {
  height: 30px;
  background-color: #16213e;
  border-bottom: 1px solid #0f3460;
  position: sticky;
  top: 0;
  z-index: 10;
  min-width: 600px;
}

.time-tick {
  position: absolute;
  height: 100%;
  border-left: 1px solid #333;
}

.time-tick.major {
  border-left-color: #555;
}

.time-tick:first-child {
  border-left: none;
}

.tick-label {
  position: absolute;
  top: 4px;
  left: 4px;
  font-size: 10px;
  color: #888;
}

.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 100;
  pointer-events: none;
  width: 2px;
}

.playhead-head {
  position: absolute;
  top: -2px;
  left: 50%;
  transform: translateX(-50%);
  color: #e94560;
  font-size: 14px;
  text-align: center;
}

.playhead-line {
  width: 100%;
  height: 100%;
  background-color: #e94560;
}

.drop-preview-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background-color: #4ade80;
  z-index: 90;
  pointer-events: none;
}

.tracks-wrapper {
  min-width: 600px;
}

.track {
  display: flex;
  border-bottom: 1px solid #0f3460;
  position: relative;
  min-height: 50px;
}

.track.selected {
  background-color: rgba(233, 69, 96, 0.1);
}

.track.muted {
  opacity: 0.5;
}

.track-label {
  width: 80px;
  min-width: 80px;
  padding: 8px;
  background-color: #16213e;
  border-right: 1px solid #0f3460;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: #aaa;
  flex-shrink: 0;
  position: sticky;
  left: 0;
  z-index: 5;
}

.track-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-mute {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 0;
  opacity: 0.6;
}

.track-mute:hover {
  opacity: 1;
}

.track-mute.muted {
  opacity: 0.3;
}

.track-clips {
  flex: 1;
  position: relative;
  height: 100%;
  width: 100%;
  min-width: 520px;
}

.clip {
  position: absolute;
  top: 4px;
  bottom: 4px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0;
  overflow: hidden;
  border: 2px solid transparent;
  min-width: 60px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  transition: border-color 0.2s, transform 0.2s;
  background-color: #2a3f5f;
}

.clip:hover {
  border-color: rgba(255, 255, 255, 0.3);
  transform: translateY(-1px);
}

.clip.selected {
  border-color: #e94560;
  box-shadow: 0 0 0 1px #e94560, 0 2px 8px rgba(233, 69, 96, 0.3);
}

.clip.dragging {
  cursor: grabbing;
  border-color: #4ade80;
  box-shadow: 0 0 0 2px #4ade80, 0 4px 12px rgba(74, 222, 128, 0.4);
  opacity: 0.9;
  transform: scale(1.02);
}

.clip-thumbnail {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-size: auto 100%;
  background-position: left center;
  background-repeat: repeat-x;
  opacity: 0.7;
}

.clip-overlay {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  padding: 4px 8px;
  background: linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.8) 100%);
  min-height: 100%;
}

.clip-name {
  font-size: 11px;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
  text-shadow: 0 1px 2px rgba(0,0,0,0.8);
  text-align: left;
}

.clip-duration {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.8);
  margin-top: 2px;
  text-shadow: 0 1px 2px rgba(0,0,0,0.8);
}

.empty-timeline {
  text-align: center;
  padding: 40px 20px;
  color: #666;
}

.empty-timeline .hint {
  font-size: 12px;
  color: #444;
  margin-top: 8px;
}

.timeline-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
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

.tool-btn:hover:not(:disabled) {
  background-color: #16213e;
  border-color: #e94560;
}

.tool-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.divider {
  width: 1px;
  height: 20px;
  background-color: #333;
}
</style>
