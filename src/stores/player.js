import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const usePlayerStore = defineStore('player', () => {
  const currentTime = ref(0)
  const duration = ref(0)
  const isPlaying = ref(false)
  const volume = ref(1)
  const playbackRate = ref(1)
  const isMuted = ref(false)
  const buffered = ref(0)
  const isFullscreen = ref(false)
  const showControls = ref(true)
  const currentVideoId = ref(null)
  const previewClipId = ref(null)
  const loopEnabled = ref(false)
  const inPoint = ref(null)
  const outPoint = ref(null)
  const currentClipId = ref(null)
  const timelinePosition = ref(0)

  const effectiveDuration = computed(() => {
    if (inPoint.value !== null && outPoint.value !== null) {
      return outPoint.value - inPoint.value
    }
    return duration.value
  })

  const effectiveCurrentTime = computed(() => {
    if (inPoint.value !== null) {
      return currentTime.value - inPoint.value
    }
    return currentTime.value
  })

  const progress = computed(() => {
    if (effectiveDuration.value === 0) return 0
    return (effectiveCurrentTime.value / effectiveDuration.value) * 100
  })

  function play() {
    isPlaying.value = true
  }

  function pause() {
    isPlaying.value = false
  }

  function togglePlay() {
    isPlaying.value = !isPlaying.value
  }

  function stop() {
    isPlaying.value = false
    currentTime.value = 0
  }

  function seek(time) {
    const clampedTime = Math.max(0, Math.min(duration.value, time))
    currentTime.value = clampedTime
  }

  function seekRelative(delta) {
    seek(currentTime.value + delta)
  }

  function setCurrentTime(time) {
    currentTime.value = time
  }

  function setDuration(d) {
    duration.value = d
  }

  function setVolume(v) {
    volume.value = Math.max(0, Math.min(2, v))
    if (v > 0 && isMuted.value) {
      isMuted.value = false
    }
  }

  function setPlaybackRate(rate) {
    playbackRate.value = Math.max(0.25, Math.min(4, rate))
  }

  function toggleMute() {
    isMuted.value = !isMuted.value
  }

  function setMuted(muted) {
    isMuted.value = muted
  }

  function setBuffered(b) {
    buffered.value = Math.max(0, Math.min(1, b))
  }

  function setFullscreen(fullscreen) {
    isFullscreen.value = fullscreen
  }

  function toggleFullscreen() {
    isFullscreen.value = !isFullscreen.value
  }

  function setShowControls(show) {
    showControls.value = show
  }

  function setCurrentVideo(videoId) {
    currentVideoId.value = videoId
  }

  function setPreviewClip(clipId) {
    previewClipId.value = clipId
  }

  function setInPoint(time) {
    inPoint.value = time
  }

  function setOutPoint(time) {
    outPoint.value = time
  }

  function clearInOutPoints() {
    inPoint.value = null
    outPoint.value = null
  }

  function toggleLoop() {
    loopEnabled.value = !loopEnabled.value
  }

  function setLoop(loop) {
    loopEnabled.value = loop
  }

  function setCurrentClip(clipId) {
    currentClipId.value = clipId
  }

  function setTimelinePosition(pos) {
    timelinePosition.value = pos
  }

  function getState() {
    return {
      currentTime: currentTime.value,
      duration: duration.value,
      isPlaying: isPlaying.value,
      volume: volume.value,
      playbackRate: playbackRate.value,
      isMuted: isMuted.value,
      buffered: buffered.value
    }
  }

  function setState(state) {
    if (state.currentTime !== undefined) currentTime.value = state.currentTime
    if (state.duration !== undefined) duration.value = state.duration
    if (state.isPlaying !== undefined) isPlaying.value = state.isPlaying
    if (state.volume !== undefined) volume.value = state.volume
    if (state.playbackRate !== undefined) playbackRate.value = state.playbackRate
    if (state.isMuted !== undefined) isMuted.value = state.isMuted
    if (state.buffered !== undefined) buffered.value = state.buffered
  }

  function reset() {
    currentTime.value = 0
    duration.value = 0
    isPlaying.value = false
    volume.value = 1
    playbackRate.value = 1
    isMuted.value = false
    buffered.value = 0
    isFullscreen.value = false
    showControls.value = true
    currentVideoId.value = null
    previewClipId.value = null
    loopEnabled.value = false
    inPoint.value = null
    outPoint.value = null
    currentClipId.value = null
    timelinePosition.value = 0
  }

  return {
    currentTime,
    duration,
    isPlaying,
    volume,
    playbackRate,
    isMuted,
    buffered,
    isFullscreen,
    showControls,
    currentVideoId,
    previewClipId,
    loopEnabled,
    inPoint,
    outPoint,
    currentClipId,
    timelinePosition,
    effectiveDuration,
    effectiveCurrentTime,
    progress,
    play,
    pause,
    togglePlay,
    stop,
    seek,
    seekRelative,
    setCurrentTime,
    setDuration,
    setVolume,
    setPlaybackRate,
    toggleMute,
    setMuted,
    setBuffered,
    setFullscreen,
    toggleFullscreen,
    setShowControls,
    setCurrentVideo,
    setPreviewClip,
    setInPoint,
    setOutPoint,
    clearInOutPoints,
    toggleLoop,
    setLoop,
    setCurrentClip,
    setTimelinePosition,
    getState,
    setState,
    reset
  }
})
