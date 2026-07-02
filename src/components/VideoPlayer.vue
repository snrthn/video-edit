<template>
  <div class="video-player">
    <div class="player-container">
      <div class="video-wrapper" ref="wrapperRef">
        <video
          ref="videoRef"
          class="video-element"
          preload="auto"
          @timeupdate="handleTimeUpdate"
          @loadedmetadata="handleLoadedMetadata"
          @progress="handleProgress"
        >
          您的浏览器不支持视频播放
        </video>

        <!-- 文字叠加层 -->
        <TextOverlay
          :container-width="wrapperWidth"
          :container-height="wrapperHeight"
        />

        <!-- 空白区域黑屏遮罩 -->
        <div v-if="!hasVideoAtPosition" class="black-screen" />

        <div v-if="showPreviewThumbnail" class="preview-thumbnail">
          <img :src="nextClipThumbnail" alt="下一个视频预览" class="thumbnail-image" />
          <div class="preview-label">即将播放: {{ nextClipName }}</div>
        </div>

        <div v-if="!hasVideoAtPosition && !nextClip && !isPlayheadMoving" class="empty-player">
          <div class="empty-icon">🎬</div>
          <p>在时间线上添加视频后即可预览</p>
        </div>
      </div>

      <div class="player-controls">
        <div class="time-display">
          {{ formatTime(timelineStore.playheadPosition) }} / {{ formatTime(timelineStore.duration) }}
        </div>

        <div class="control-buttons">
          <button class="ctrl-btn" @click="handleSkipBack" title="后退5秒">⏪</button>
          <button class="ctrl-btn play-btn" @click="togglePlay">
            {{ playerStore.isPlaying ? '⏸' : '▶' }}
          </button>
          <button class="ctrl-btn" @click="handleSkipForward" title="前进5秒">⏩</button>
        </div>

        <div class="volume-control">
          <button class="ctrl-btn" @click="toggleMute">
            {{ playerStore.isMuted ? '🔇' : '🔊' }}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            :value="playerStore.volume"
            @input="handleVolumeChange"
            class="volume-slider"
          />
        </div>

        <div class="speed-control">
          <select :value="playerStore.playbackRate" @change="handleSpeedChange" class="speed-select">
            <option value="0.5">0.5x</option>
            <option value="1">1x</option>
            <option value="1.5">1.5x</option>
            <option value="2">2x</option>
          </select>
        </div>

        <button class="ctrl-btn" @click="toggleFullscreen" title="全屏">⛶</button>
      </div>

      <div class="progress-bar" @click="handleProgressClick">
        <div class="progress-played" :style="{ width: `${timelineProgress}%` }"></div>
        <div class="progress-handle" :style="{ left: `${timelineProgress}%` }"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch, onBeforeUnmount } from 'vue'
import { usePlayerStore, useTimelineStore, useProjectStore } from '../stores'
import { usePlayer } from '../hooks/usePlayer'
import TextOverlay from './TextOverlay.vue'

const playerStore = usePlayerStore()
const timelineStore = useTimelineStore()
const projectStore = useProjectStore()

const videoRef = ref(null)
const wrapperRef = ref(null)

const wrapperWidth = ref(640)
const wrapperHeight = ref(360)

let resizeObserver = null

onMounted(() => {
  if (wrapperRef.value) {
    wrapperWidth.value = wrapperRef.value.clientWidth || 640
    wrapperHeight.value = wrapperRef.value.clientHeight || 360
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        wrapperWidth.value = entry.contentRect.width
        wrapperHeight.value = entry.contentRect.height
      }
    })
    resizeObserver.observe(wrapperRef.value)
  }
  setupPlayer(videoRef.value)
  // 页面刷新后：playhead 位置已恢复，video 元素刚挂载
  // 主动加载当前 clip 并 seek，避免黑屏
  if (videoRef.value && timelineStore.tracks.length > 0) {
    scrub(timelineStore.playheadPosition)
  }
})

onBeforeUnmount(() => {
  if (resizeObserver && wrapperRef.value) {
    resizeObserver.unobserve(wrapperRef.value)
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (videoRef.value) {
    videoRef.value.pause()
    videoRef.value.src = ''
  }
})

const {
  setupPlayer,
  play,
  pause,
  seek,
  seekRelative,
  scrub,
  setVolume,
  toggleMute,
  setPlaybackRate,
  toggleFullscreen,
  findNextClip,
  isPlayheadMoving: checkPlayheadMoving
} = usePlayer()

const hasVideoAtPosition = computed(() => {
  const position = timelineStore.playheadPosition
  for (const track of timelineStore.tracks) {
    if (track.type !== 'video') continue
    for (const clip of track.clips) {
      if (position >= clip.startTime && position < clip.endTime) {
        return true
      }
    }
  }
  return false
})

// 监听播放头位置：暂停时主动 seek video，刷新后也能恢复画面
watch(() => timelineStore.playheadPosition, (newPos) => {
  if (!playerStore.isPlaying && videoRef.value) {
    scrub(newPos)
  }
}, { immediate: true })

const isPlayheadMoving = computed(() => {
  return checkPlayheadMoving()
})

const nextClip = computed(() => {
  return findNextClip(timelineStore.playheadPosition)
})

const nextClipThumbnail = computed(() => {
  if (!nextClip.value) return ''
  const video = projectStore.getVideo(nextClip.value.videoId)
  return video?.thumbnail || ''
})

const nextClipName = computed(() => {
  if (!nextClip.value) return ''
  const video = projectStore.getVideo(nextClip.value.videoId)
  return video?.name || '未知视频'
})

const showPreviewThumbnail = computed(() => {
  return !hasVideoAtPosition.value && isPlayheadMoving.value && nextClip.value
})

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

function togglePlay() {
  if (playerStore.isPlaying) {
    pause()
  } else {
    play()
  }
}

function handleSkipBack() {
  seekRelative(-5)
}

function handleSkipForward() {
  seekRelative(5)
}

function handleVolumeChange(e) {
  setVolume(parseFloat(e.target.value))
}

function handleSpeedChange(e) {
  setPlaybackRate(parseFloat(e.target.value))
}

// timeline 座标的进度百分比
const timelineProgress = computed(() => {
  const dur = timelineStore.duration || 1
  return Math.min((timelineStore.playheadPosition / dur) * 100, 100)
})

function handleProgressClick(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  const percent = (e.clientX - rect.left) / rect.width
  const time = percent * (timelineStore.duration || 1)
  seek(time)
}

function handleTimeUpdate() {
  if (videoRef.value) {
    playerStore.setCurrentTime(videoRef.value.currentTime)
  }
}

function handleLoadedMetadata() {
  if (videoRef.value) {
    playerStore.setDuration(videoRef.value.duration)

    // 页面刷新后，playhead 位置已从 IndexedDB 恢复
    // video 加载完成后主动 seek 到该位置，避免黑屏
    scrub(timelineStore.playheadPosition)
  }
}

function handleProgress() {
  if (videoRef.value && videoRef.value.buffered.length > 0) {
    const buffered = videoRef.value.buffered.end(videoRef.value.buffered.length - 1)
    playerStore.setBuffered(buffered / playerStore.duration)
  }
}
</script>

<style scoped>
.video-player {
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: #000;
  min-height: 0;
  overflow: hidden;
}

.player-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  min-height: 0;
}

.video-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  position: relative;
}

.video-element {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.video-element.hidden {
  opacity: 0;
}

.preview-thumbnail {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: #000;
}

.thumbnail-image {
  max-width: 100%;
  max-height: 80%;
  object-fit: contain;
  opacity: 0.8;
}

.preview-label {
  margin-top: 16px;
  padding: 8px 16px;
  background-color: rgba(0, 0, 0, 0.7);
  border-radius: 4px;
  color: #fff;
  font-size: 14px;
}

.empty-player {
  position: absolute;
  text-align: center;
  color: #666;
}

.black-screen {
  position: absolute;
  inset: 0;
  background: #000;
  z-index: 5;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.empty-player p {
  font-size: 16px;
  margin: 0;
}

.player-controls {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  background-color: #1a1a2e;
  border-top: 1px solid #0f3460;
}

.time-display {
  font-size: 13px;
  color: #ccc;
  min-width: 100px;
}

.control-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ctrl-btn {
  width: 36px;
  height: 36px;
  background-color: #0f3460;
  border: none;
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s;
}

.ctrl-btn:hover {
  background-color: #e94560;
}

.play-btn {
  width: 44px;
  height: 44px;
  font-size: 20px;
  background-color: #e94560;
}

.volume-control {
  display: flex;
  align-items: center;
  gap: 8px;
}

.volume-slider {
  width: 80px;
  height: 4px;
  cursor: pointer;
  accent-color: #e94560;
}

.speed-control {
  margin-left: auto;
}

.speed-select {
  padding: 6px 10px;
  background-color: #0f3460;
  border: none;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  font-size: 12px;
}

.progress-bar {
  height: 6px;
  background-color: #333;
  cursor: pointer;
  position: relative;
  margin: 0 8px 8px;
  border-radius: 3px;
}

.progress-buffered {
  position: absolute;
  height: 100%;
  background-color: #555;
  border-radius: 3px;
}

.progress-played {
  position: absolute;
  height: 100%;
  background-color: #e94560;
  border-radius: 3px;
}

.progress-handle {
  position: absolute;
  width: 14px;
  height: 14px;
  background-color: #e94560;
  border-radius: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  opacity: 0;
  transition: opacity 0.2s;
}

.progress-bar:hover .progress-handle {
  opacity: 1;
}
</style>
