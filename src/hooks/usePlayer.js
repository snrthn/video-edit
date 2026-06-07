import { ref, onUnmounted } from 'vue'
import { usePlayerStore, useTimelineStore, useProjectStore } from '../stores'
import {
  PLAYHEAD_MOVE_STEP, PLAYHEAD_REACH_THRESHOLD
} from '../core/constants'
import { triggerSave } from '../main'

export function usePlayer() {
  const playerStore = usePlayerStore()
  const timelineStore = useTimelineStore()
  const projectStore = useProjectStore()

  const videoRef = ref(null)
  const isReady = ref(false)

  let progressRAF = null
  let playheadRAF = null

  // === Master clock state ===
  // timelinePos = playStartPos + (performance.now() - playStartTime) / 1000 * rate
  let playStartTime = 0
  let playStartPos = 0
  let activeClipId = null

  function setupPlayer(videoElement) {
    videoRef.value = videoElement
    isReady.value = true
    if (!videoRef.value) return
    videoRef.value.volume = playerStore.volume
    videoRef.value.playbackRate = playerStore.playbackRate
    // 不监听 timeupdate/ended — 主时钟不依赖 video 事件
    videoRef.value.addEventListener('loadedmetadata', handleLoadedMetadata)
  }

  // ============================================================
  // Clip 查找
  // ============================================================

  function findClipAtTime(time) {
    for (const track of timelineStore.tracks) {
      for (const clip of track.clips) {
        if (time >= clip.startTime && time < clip.endTime) return { clip, track }
      }
    }
    return null
  }

  function findNextClip(currentTime) {
    const allClips = timelineStore.tracks.flatMap((track) =>
      track.clips.map(clip => ({ ...clip, trackId: track.id })))
    allClips.sort((a, b) => a.startTime - b.startTime)
    for (const clip of allClips) {
      if (clip.startTime > currentTime + 0.001) return clip
    }
    return null
  }

  function findFirstClip() {
    const allClips = timelineStore.tracks.flatMap((track) =>
      track.clips.map(clip => ({ ...clip, trackId: track.id })))
    if (allClips.length === 0) return null
    return allClips.reduce((earliest, clip) =>
      clip.startTime < earliest.startTime ? clip : earliest)
  }

  // ============================================================
  // Video 元素控制（纯粹 IO，不参与时序）
  // ============================================================

  function loadClipVideo(clip) {
    if (!videoRef.value || !clip) return false
    const video = projectStore.getVideo(clip.videoId)
    if (!video) return false

    const isSameSource = playerStore.currentVideoId === clip.videoId
    playerStore.setCurrentClip(clip.id)
    let triggeredLoad = false
    if (!isSameSource) {
      playerStore.setCurrentVideo(clip.videoId)
      videoRef.value.src = video.source.url
      videoRef.value.load()
      triggeredLoad = true
    }
    return triggeredLoad
  }

  /** 将 video 元素 seek 到指定的 source offset，然后确保它在播放 */
  function playVideoAt(sourceOffset) {
    if (!videoRef.value) return
    videoRef.value.currentTime = sourceOffset
    // seek 后 video 可能暂停，强制恢复
    setTimeout(() => {
      if (videoRef.value && videoRef.value.paused) {
        videoRef.value.play().catch(() => {})
      }
    }, 15)
  }

  function handleLoadedMetadata() {
    if (videoRef.value) playerStore.setDuration(videoRef.value.duration)
  }

  // ============================================================
  // 主时钟 rAF 循环 — 唯一时序来源
  // ============================================================

  function startMasterClock() {
    if (progressRAF) return
    playStartTime = performance.now()
    playStartPos = timelineStore.playheadPosition
    progressRAF = requestAnimationFrame(tick)
  }

  function stopMasterClock() {
    if (progressRAF) {
      cancelAnimationFrame(progressRAF)
      progressRAF = null
    }
  }

  function resetMasterClock() {
    stopMasterClock()
    playStartTime = performance.now()
    playStartPos = timelineStore.playheadPosition
  }

  function tick(now) {
    if (!playerStore.isPlaying) {
      progressRAF = null
      return
    }

    // === 1. 主时钟计算当前 timeline 位置 ===
    const elapsedSec = (now - playStartTime) / 1000
    const timelinePos = playStartPos + elapsedSec * playerStore.playbackRate

    // === 2. 找到当前位置对应的 clip ===
    const found = findClipAtTime(timelinePos)
    let effectiveClip = null

    if (!found) {
      // 播放头在间隙中：找下一个 clip
      const nextClip = findNextClip(timelinePos)
      if (nextClip) {
        effectiveClip = nextClip
        // 跳播：重置时钟起点到下一个 clip 的起始
        playStartTime = now
        playStartPos = nextClip.startTime
      } else {
        // 没有下一个 clip，停止
        finishPlayback()
        return
      }
    } else if (timelinePos >= found.clip.endTime) {
      // 到达 clip 末尾
      const nextClip = findNextClip(found.clip.endTime - 0.001)
      if (nextClip) {
        effectiveClip = nextClip
        playStartTime = now
        playStartPos = nextClip.startTime
      } else {
        finishPlayback()
        return
      }
    } else {
      effectiveClip = found.clip
    }

    // === 3. Clip 切换检测 ===
    if (effectiveClip.id !== activeClipId) {
      loadClipVideo(effectiveClip)
      activeClipId = effectiveClip.id
      // 新 clip 的 sourceOffset
      const sourceOffset = playStartPos - effectiveClip.startTime + effectiveClip.sourceStart
      playVideoAt(sourceOffset)
    }

    // === 4. 更新 UI ===
    const displayPos = playStartPos + (now - playStartTime) / 1000 * playerStore.playbackRate
    timelineStore.setPlayheadPosition(displayPos)
    playerStore.setTimelinePosition(displayPos)

    progressRAF = requestAnimationFrame(tick)
  }

  function finishPlayback() {
    playerStore.pause()
    if (videoRef.value) videoRef.value.pause()
    stopMasterClock()
  }

  // ============================================================
  // 滑动预览（不改变播放状态，只 seek video 显示对应帧）
  // ============================================================

  function scrub(time) {
    if (!videoRef.value) return
    const found = findClipAtTime(time)
    if (found) {
      loadClipVideo(found.clip)
      activeClipId = found.clip.id
      const sourceOffset = time - found.clip.startTime + found.clip.sourceStart
      videoRef.value.currentTime = sourceOffset
      playerStore.setCurrentTime(sourceOffset)
    }
    timelineStore.setPlayheadPosition(time)
    playerStore.setTimelinePosition(time)
  }

  function clearPreview() {
    if (!videoRef.value) return
    activeClipId = null
    playerStore.setCurrentClip(null)
    playerStore.setCurrentVideo(null)
    videoRef.value.removeAttribute('src')
    videoRef.value.load()
  }

  /** 拖动 / 点击游标后 seek 到指定帧 */
  function freezeFrame(time) {
    if (!videoRef.value) return
    const found = findClipAtTime(time)
    if (found) {
      const triggeredLoad = loadClipVideo(found.clip)
      activeClipId = found.clip.id
      const sourceOffset = time - found.clip.startTime + found.clip.sourceStart
      const doSeek = () => {
        if (!videoRef.value) return
        videoRef.value.currentTime = sourceOffset
        videoRef.value.pause()
      }
      if (triggeredLoad) {
        videoRef.value.addEventListener('loadedmetadata', function onReady() {
          videoRef.value.removeEventListener('loadedmetadata', onReady)
          doSeek()
        })
      } else {
        doSeek()
      }
      playerStore.setCurrentTime(sourceOffset)
    }
    // 无 clip 时不做任何事 - 已由 CSS 处理黑屏
    timelineStore.setPlayheadPosition(time)
    playerStore.setTimelinePosition(time)
  }

  // ============================================================
  // 播放头移动动画（纯 UI 动画，不涉及 video）
  // ============================================================

  function startPlayheadMove(targetPosition, onReachCallback) {
    stopPlayheadMove()
    function tick() {
      const pos = timelineStore.playheadPosition
      if (pos >= targetPosition - PLAYHEAD_REACH_THRESHOLD) {
        timelineStore.setPlayheadPosition(targetPosition)
        playerStore.setTimelinePosition(targetPosition)
        stopPlayheadMove()
        if (onReachCallback) onReachCallback()
        return
      }
      const np = pos + PLAYHEAD_MOVE_STEP
      timelineStore.setPlayheadPosition(Math.min(np, targetPosition))
      playerStore.setTimelinePosition(Math.min(np, targetPosition))
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

  // ============================================================
  // 播放控制 API
  // ============================================================

  function play() {
    if (!videoRef.value) return
    stopPlayheadMove()

    const found = findClipAtTime(timelineStore.playheadPosition)
    const firstClip = findFirstClip()
    if (!firstClip) return

    let targetClip
    let targetTimelinePos

    if (found) {
      targetClip = found.clip
      targetTimelinePos = timelineStore.playheadPosition
    } else {
      targetClip = firstClip
      targetTimelinePos = firstClip.startTime
      timelineStore.setPlayheadPosition(targetTimelinePos)
    }

    const sourceOffset = targetTimelinePos - targetClip.startTime + targetClip.sourceStart
    loadClipVideo(targetClip)
    activeClipId = targetClip.id
    playVideoAt(sourceOffset)
    playerStore.play()
    startMasterClock()
  }

  function pause() {
    stopPlayheadMove()
    stopMasterClock()
    if (videoRef.value) videoRef.value.pause()
    playerStore.pause()
    triggerSave()
  }

  function stop() {
    stopPlayheadMove()
    stopMasterClock()
    if (videoRef.value) videoRef.value.pause()
    playerStore.pause()
    timelineStore.setPlayheadPosition(0)
    playerStore.setTimelinePosition(0)
    triggerSave()
  }

  function seek(time) {
    const wasPlaying = playerStore.isPlaying
    stopPlayheadMove()
    if (wasPlaying) stopMasterClock()

    if (!videoRef.value) return
    const found = findClipAtTime(time)
    if (found) {
      loadClipVideo(found.clip)
      activeClipId = found.clip.id
      const sourceOffset = time - found.clip.startTime + found.clip.sourceStart
      videoRef.value.currentTime = sourceOffset
      videoRef.value.pause()
      playerStore.setCurrentTime(sourceOffset)
    }
    timelineStore.setPlayheadPosition(time)
    playerStore.setTimelinePosition(time)

    if (wasPlaying) {
      playStartTime = performance.now()
      playStartPos = time
      playerStore.play()
      startMasterClock()
    }
    triggerSave()
  }

  function seekRelative(delta) {
    seek(playerStore.timelinePosition + delta)
  }

  // ============================================================
  // 音量 / 速率 / 全屏
  // ============================================================

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

  // ============================================================
  // 清理
  // ============================================================

  onUnmounted(() => {
    stopMasterClock()
    stopPlayheadMove()
  })

  return {
    videoRef, isReady, setupPlayer,
    play, pause, stop, seek, seekRelative, scrub, freezeFrame, clearPreview,
    setVolume, toggleMute, setPlaybackRate, toggleFullscreen, loadVideo,
    findClipAtTime, loadClipVideo, findNextClip, findFirstClip,
    isPlayheadMoving, startPlayheadMove, stopPlayheadMove
  }
}