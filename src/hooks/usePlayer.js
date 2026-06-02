import { ref, onUnmounted } from 'vue'
import { usePlayerStore, useTimelineStore, useProjectStore } from '../stores'
import {
  PLAYHEAD_PROGRESS_INTERVAL, PLAYHEAD_MOVE_INTERVAL,
  PLAYHEAD_MOVE_STEP, PLAYHEAD_REACH_THRESHOLD,
  PLAYHEAD_MOVE_GAP_THRESHOLD, CLIP_SWITCH_DELAY
} from '../core/constants'

export function usePlayer() {
  const playerStore = usePlayerStore()
  const timelineStore = useTimelineStore()
  const projectStore = useProjectStore()

  const videoRef = ref(null)
  const isReady = ref(false)

  // rAF IDs（替代 setInterval）
  let progressRAF = null
  let playheadRAF = null

  function setupPlayer(videoElement) {
    videoRef.value = videoElement
    isReady.value = true
    if (!videoRef.value) return

    videoRef.value.volume = playerStore.volume
    videoRef.value.playbackRate = playerStore.playbackRate
    videoRef.value.addEventListener('timeupdate', handleTimeUpdate)
    videoRef.value.addEventListener('loadedmetadata', handleLoadedMetadata)
    videoRef.value.addEventListener('progress', handleProgress)
    videoRef.value.addEventListener('play', handlePlay)
    videoRef.value.addEventListener('pause', handlePause)
    videoRef.value.addEventListener('ended', handleEnded)
  }

  // ===================== Clip 查找 =====================

  function findClipAtTime(time) {
    for (const track of timelineStore.tracks) {
      for (const clip of track.clips) {
        if (time >= clip.startTime && time < clip.endTime) {
          return { clip, track }
        }
      }
    }
    return null
  }

  function findNextClip(currentTime) {
    const allClips = timelineStore.tracks.flatMap((track) =>
      track.clips.map(clip => ({ ...clip, trackId: track.id }))
    )
    allClips.sort((a, b) => a.startTime - b.startTime)
    for (const clip of allClips) {
      if (clip.startTime > currentTime + 0.1) {
        return clip
      }
    }
    return null
  }

  function findFirstClip() {
    const allClips = timelineStore.tracks.flatMap((track) =>
      track.clips.map(clip => ({ ...clip, trackId: track.id }))
    )
    if (allClips.length === 0) return null
    return allClips.reduce((earliest, clip) =>
      clip.startTime < earliest.startTime ? clip : earliest
    )
  }

  // ===================== Clip 视频加载 =====================

  function loadClipVideo(clip) {
    if (!videoRef.value || !clip) return
    const video = projectStore.getVideo(clip.videoId)
    if (video) {
      playerStore.setCurrentClip(clip.id)
      playerStore.setCurrentVideo(clip.videoId)
      videoRef.value.src = video.source.url
      videoRef.value.load()
    }
  }

  // ===================== 音视频事件处理 =====================

  function handleTimeUpdate() {
    if (!videoRef.value) return
    playerStore.setCurrentTime(videoRef.value.currentTime)

    const found = findClipAtTime(timelineStore.playheadPosition)
    if (found) {
      const timelinePosition = found.clip.startTime + videoRef.value.currentTime
      timelineStore.setPlayheadPosition(timelinePosition)
      playerStore.setTimelinePosition(timelinePosition)
    }
  }

  function handleLoadedMetadata() {
    if (videoRef.value) {
      playerStore.setDuration(videoRef.value.duration)
    }
  }

  function handleProgress() {
    if (videoRef.value && videoRef.value.buffered.length > 0) {
      const buffered = videoRef.value.buffered.end(videoRef.value.buffered.length - 1)
      playerStore.setBuffered(buffered / playerStore.duration)
    }
  }

  function handlePlay() {
    playerStore.play()
    startProgressUpdate()
  }

  function handlePause() {
    playerStore.pause()
    stopProgressUpdate()
  }

  function handleEnded() {
    const currentTime = timelineStore.playheadPosition
    const nextClip = findNextClip(currentTime)

    if (nextClip) {
      loadClipVideo(nextClip)
      const gap = nextClip.startTime - currentTime

      if (gap > PLAYHEAD_MOVE_GAP_THRESHOLD) {
        startPlayheadMove(nextClip.startTime, () => {
          if (videoRef.value) {
            videoRef.value.currentTime = 0
            videoRef.value.play()
          }
        })
      } else {
        setTimeout(() => {
          timelineStore.setPlayheadPosition(nextClip.startTime)
          if (videoRef.value) {
            videoRef.value.currentTime = 0
            videoRef.value.play()
          }
        }, CLIP_SWITCH_DELAY)
      }
      return
    }

    playerStore.pause()
    stopProgressUpdate()
  }

  // ===================== 进度 & 播放头同步（rAF） =====================

  function startProgressUpdate() {
    if (progressRAF) return

    function tick() {
      if (videoRef.value && playerStore.isPlaying) {
        playerStore.setCurrentTime(videoRef.value.currentTime)
        const found = findClipAtTime(timelineStore.playheadPosition)
        if (found) {
          const timelinePosition = found.clip.startTime + videoRef.value.currentTime
          timelineStore.setPlayheadPosition(timelinePosition)
        }
        progressRAF = requestAnimationFrame(tick)
      }
    }
    progressRAF = requestAnimationFrame(tick)
  }

  function stopProgressUpdate() {
    if (progressRAF) {
      cancelAnimationFrame(progressRAF)
      progressRAF = null
    }
  }

  // ===================== 播放头移动动画 =====================

  function startPlayheadMove(targetPosition, onReachCallback) {
    stopPlayheadMove()

    function tick() {
      const currentPosition = timelineStore.playheadPosition

      if (currentPosition >= targetPosition - PLAYHEAD_REACH_THRESHOLD) {
        timelineStore.setPlayheadPosition(targetPosition)
        playerStore.setTimelinePosition(targetPosition)
        if (onReachCallback) onReachCallback()
        return
      }

      const newPosition = currentPosition + PLAYHEAD_MOVE_STEP
      timelineStore.setPlayheadPosition(Math.min(newPosition, targetPosition))
      playerStore.setTimelinePosition(Math.min(newPosition, targetPosition))
      playheadRAF = requestAnimationFrame(tick)
    }
    playheadRAF = requestAnimationFrame(tick)
  }

  function stopPlayheadMove() {
    if (playheadRAF) {
      cancelAnimationFrame(playheadRAF)
      playheadRAF = null
    }
  }

  function isPlayheadMoving() {
    return playheadRAF !== null
  }

  // ===================== 播放控制 =====================

  function play() {
    if (!videoRef.value) return

    stopPlayheadMove()

    const found = findClipAtTime(timelineStore.playheadPosition)
    const firstClip = findFirstClip()

    if (!firstClip) return

    if (!found) {
      // 播放头不在任何 clip 上，跳到第一个 clip
      const targetPosition = firstClip.startTime
      loadClipVideo(firstClip)

      startPlayheadMove(targetPosition, () => {
        if (videoRef.value) {
          videoRef.value.currentTime = 0
          videoRef.value.play()
        }
      })
    } else {
      // 播放头在当前 clip 上
      if (found.clip.id !== playerStore.currentClipId) {
        loadClipVideo(found.clip)
        setTimeout(() => {
          if (videoRef.value) {
            const clipOffset = timelineStore.playheadPosition - found.clip.startTime
            videoRef.value.currentTime = clipOffset
            videoRef.value.play()
          }
        }, CLIP_SWITCH_DELAY)
      } else {
        videoRef.value.play()
      }
    }
  }

  function pause() {
    stopPlayheadMove()
    if (videoRef.value) videoRef.value.pause()
  }

  function stop() {
    stopPlayheadMove()
    if (!videoRef.value) return
    videoRef.value.pause()
    seek(0)
  }

  function seek(time) {
    stopPlayheadMove()
    if (!videoRef.value) return

    const found = findClipAtTime(time)
    if (found) {
      loadClipVideo(found.clip)
      const clipOffset = time - found.clip.startTime
      videoRef.value.currentTime = clipOffset
      playerStore.setCurrentTime(clipOffset)
      timelineStore.setPlayheadPosition(time)
    } else {
      time = Math.max(0, Math.min(time, playerStore.duration || Infinity))
      videoRef.value.currentTime = time
      playerStore.setCurrentTime(time)
      timelineStore.setPlayheadPosition(time)
    }
  }

  function seekRelative(delta) {
    const newTime = playerStore.timelinePosition + delta
    seek(newTime)
  }

  // ===================== 音量 / 速率 / 全屏 =====================

  function setVolume(volume) {
    volume = Math.max(0, Math.min(1, volume))
    playerStore.setVolume(volume)
    if (videoRef.value) videoRef.value.volume = volume
  }

  function toggleMute() {
    playerStore.toggleMute()
    if (videoRef.value) videoRef.value.muted = playerStore.isMuted
  }

  function setPlaybackRate(rate) {
    rate = Math.max(0.1, Math.min(4, rate))
    playerStore.setPlaybackRate(rate)
    if (videoRef.value) videoRef.value.playbackRate = rate
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
    playerStore.toggleFullscreen()
  }

  function loadVideo(video) {
    if (!videoRef.value || !video) return
    videoRef.value.src = video.source.url
    videoRef.value.load()
  }

  // ===================== 清理 =====================

  onUnmounted(() => {
    stopProgressUpdate()
    stopPlayheadMove()
    if (videoRef.value) {
      videoRef.value.removeEventListener('timeupdate', handleTimeUpdate)
      videoRef.value.removeEventListener('loadedmetadata', handleLoadedMetadata)
      videoRef.value.removeEventListener('progress', handleProgress)
      videoRef.value.removeEventListener('play', handlePlay)
      videoRef.value.removeEventListener('pause', handlePause)
      videoRef.value.removeEventListener('ended', handleEnded)
    }
  })

  return {
    videoRef,
    isReady,
    setupPlayer,
    play,
    pause,
    stop,
    seek,
    seekRelative,
    setVolume,
    toggleMute,
    setPlaybackRate,
    toggleFullscreen,
    loadVideo,
    findClipAtTime,
    loadClipVideo,
    findNextClip,
    findFirstClip,
    isPlayheadMoving,
    startPlayheadMove,
    stopPlayheadMove
  }
}