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
    const currentPlaybackRate = playerStore.playbackRate
    const timelinePos = playStartPos + elapsedSec * currentPlaybackRate

    // === 2. 找到当前位置对应的 clip ===
    const found = findClipAtTime(timelinePos)
    let effectiveClip = null

    if (!found) {
      // 播放头在间隙中：精确找下一个在 timelinePos 之后的 clip
      const nextClip = findClipAfter(timelinePos)
      if (nextClip) {
        effectiveClip = nextClip
        playStartTime = now
        playStartPos = nextClip.startTime
      } else {
        finishPlayback()
        return
      }
    } else {
      const { clip } = found
      if (timelinePos >= clip.endTime) {
        // 已经超出当前 clip 的尾部
        const nextClip = findClipAfter(clip.endTime)
        if (nextClip) {
          effectiveClip = nextClip
          playStartTime = now
          playStartPos = nextClip.startTime
        } else {
          finishPlayback()
          return
        }
      } else {
        // 仍在当前 clip 范围内
        effectiveClip = clip
      }
    }

    // === 3. Clip 切换检测 ===
    if (effectiveClip.id !== activeClipId) {
      loadClipVideo(effectiveClip)
      activeClipId = effectiveClip.id
      const sourceOffset = effectiveClip.sourceStart || 0
      _applyClipSettings(effectiveClip)
      playVideoAt(sourceOffset)
    }

    // === 4. 更新 UI ===
    const displayPos = playStartPos + (now - playStartTime) / 1000 * currentPlaybackRate
    timelineStore.setPlayheadPosition(displayPos)
    playerStore.setTimelinePosition(displayPos)

    progressRAF = requestAnimationFrame(tick)
  }

  // 找在指定时间之后的第一个 clip（全局搜索，正确处理 gap）
  function findClipAfter(time) {
    const allClips = timelineStore.tracks.flatMap((track) =>
      track.clips.map(clip => ({ ...clip, trackId: track.id })))
    allClips.sort((a, b) => a.startTime - b.startTime)
    for (const clip of allClips) {
      if (clip.startTime > time + 0.001) return clip
    }
    return null
  }

  // 应用当前 clip 的音量和速度设置
  function _applyClipSettings(clip) {
    if (!videoRef.value) return
    // 全局音量 × clip 音量（clip.volume 默认 1）
    const vol = playerStore.volume * (clip && clip.volume != null ? clip.volume : 1)
    videoRef.value.volume = Math.max(0, Math.min(1, vol))
    // 全局速率 × clip 速率
    const rate = playerStore.playbackRate * (clip && clip.speed != null ? clip.speed : 1)
    videoRef.value.playbackRate = Math.max(0.1, Math.min(4, rate))
  }

  // 获取当前激活的 clip 对象
  function _getActiveClip() {
    if (!activeClipId) return null
    for (const track of timelineStore.tracks) {
      for (const clip of track.clips) {
        if (clip.id === activeClipId) return clip
      }
    }
    return null
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
      _applyClipSettings(found.clip)
      const sourceOffset = time - found.clip.startTime + (found.clip.sourceStart || 0)
      // scrub 时必须强制 seek，不管 video 是否在播放
      // — 播放时 video.currentTime 被主时钟控制，但 scrub 需要打断它
      // — 暂停时 video.currentTime 不会自动更新，必须显式设置
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

  /** 拖动 / 点击游标后 seek 到指定帧并冻结 */
  function freezeFrame(time) {
    if (!videoRef.value) return

    const found = findClipAtTime(time)

    if (found) {
      const triggeredLoad = loadClipVideo(found.clip)
      activeClipId = found.clip.id
      _applyClipSettings(found.clip)
      const sourceOffset = time - found.clip.startTime + found.clip.sourceStart

      // 如果触发了 load()，必须等 loadedmetadata 才能 seek
      if (triggeredLoad) {
        videoRef.value.addEventListener('loadedmetadata', function onReady() {
          videoRef.value.removeEventListener('loadedmetadata', onReady)
          // loadedmetadata 后 video 可能会自动播放，强制暂停
          videoRef.value.pause()
          // seeked 事件确保帧渲染完成后才彻底冻结
          videoRef.value.addEventListener('seeked', function onSeeked() {
            videoRef.value.removeEventListener('seeked', onSeeked)
            videoRef.value.pause()
          }, { once: true })
          videoRef.value.currentTime = sourceOffset
        }, { once: true })
      } else {
        // source 已加载，直接 seek + 冻结
        videoRef.value.addEventListener('seeked', function onSeeked() {
          videoRef.value.removeEventListener('seeked', onSeeked)
          videoRef.value.pause()
        }, { once: true })
        videoRef.value.pause()
        videoRef.value.currentTime = sourceOffset
      }
      playerStore.setCurrentTime(sourceOffset)
    } else {
      // 无 clip 时暂停 video（画面由 CSS 黑屏处理）
      videoRef.value.pause()
    }

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
    _applyClipSettings(targetClip)
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
      _applyClipSettings(found.clip)
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
    // 重新应用 per-clip 音量
    const clip = activeClipId ? _getActiveClip() : null
    _applyClipSettings(clip)
  }

  function toggleMute() {
    playerStore.toggleMute()
    if (videoRef.value) videoRef.value.muted = playerStore.isMuted
  }

  function setPlaybackRate(rate) {
    rate = Math.max(0.1, Math.min(4, rate))
    playerStore.setPlaybackRate(rate)
    // 重新应用 per-clip 速率
    const clip = activeClipId ? _getActiveClip() : null
    _applyClipSettings(clip)
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