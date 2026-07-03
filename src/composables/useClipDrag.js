/**
 * useClipDrag — clip 拖拽 + trim 交互
 *
 * 托管 clip 的 mousedown → mousemove → mouseup 全生命周期。
 * 同时处理 clip 拖拽移动 和 trim（裁剪入/出点）。
 *
 * 从 ClipBlock → TrackRow → Timeline 经过 Vue emit 链，
 * 事件对象可能被多次转发，统一用 e.target.closest('.clip') 做 hit test，
 * 不依赖 e.currentTarget。
 */

import { ref } from 'vue'
import { useTimelineStore, useProjectStore } from '../stores'
import { engine } from '../core/timeline-engine'
import { CLIP_MIN_WIDTH } from '../core/constants'

export function useClipDrag({ timelineBodyRef, scrollContainerRef }) {
  const timelineStore = useTimelineStore()
  const projectStore = useProjectStore()

  // 拖拽状态
  const dragState = ref(null)
  const isDragging = ref(false)
  const snapGuide = ref(null)

  // trim 状态
  const isTrimming = ref(false)
  const trimState = ref(null)
  // { clipId, trackId, side: 'start'|'end', originalStart, originalEnd, startMouseX }

  let onCommitCallback = null

  // =========================================================
  // ClipBlock mousedown 入口 — 从 Template emit 链调用
  // =========================================================

  function onClipMouseDown(e, clip, track) {
    // e.currentTarget 经过 Vue emit 链后不可靠，用 target.closest 定位
    // 同时匹配 .clip (视频/文字) 和 .audio-clip (音频)
    const clipEl = e.target?.closest?.('.clip, .audio-clip')
    if (!clipEl) return { action: 'none' }

    const rect = clipEl.getBoundingClientRect()
    const offsetX = e.clientX - rect.left

    // ---- trim 手柄区域 ----
    if (offsetX < 8) {
      return startTrim(e, clip, track, 'start')
    }
    if (offsetX > rect.width - 8) {
      return startTrim(e, clip, track, 'end')
    }

    // ---- 中间区域：拖拽移动 ----
    return startDrag(e, clip, track)
  }

  // =========================================================
  // Trim
  // =========================================================

  function startTrim(e, clip, track, side) {
    e.preventDefault()
    e.stopPropagation()

    isTrimming.value = true
    trimState.value = {
      clipId: clip.id,
      trackId: track.id,
      side,
      originalStart: clip.startTime,
      originalEnd: clip.endTime,
      startMouseX: e.clientX
    }

    document.addEventListener('mousemove', onTrimMove)
    document.addEventListener('mouseup', onTrimEnd)

    return { action: `trim-${side}`, clip, track }
  }

  function onTrimMove(e) {
    if (!trimState.value) return

    const state = trimState.value
    const dx = e.clientX - state.startMouseX
    const dt = dx / engine.pps

    if (state.side === 'start') {
      // 裁剪入点：改变 startTime，保持 endTime 不变
      let newStart = +(state.originalStart + dt).toFixed(4)

      // 约束 1：不小于 0
      newStart = Math.max(0, newStart)
      // 约束 2：clip 时长不小于最小宽度
      newStart = Math.min(state.originalEnd - CLIP_MIN_WIDTH / engine.pps, newStart)
      // 约束 3：clip 时长不超过源视频时长
      const found = timelineStore.findClipById(state.clipId)
      if (found) {
        const video = projectStore.getVideo(found.clip.videoId)
        if (video?.metadata?.duration) {
          const minAllowedStart = state.originalEnd - video.metadata.duration
          newStart = Math.max(minAllowedStart, newStart)
        }
      }

      timelineStore.updateClip(state.clipId, { startTime: newStart })
    } else {
      // 裁剪出点：改变 endTime，保持 startTime 不变
      let newEnd = +(state.originalEnd + dt).toFixed(4)

      // 约束：不小于 startTime + 最小宽度
      const minEnd = state.originalStart + CLIP_MIN_WIDTH / engine.pps
      newEnd = Math.max(minEnd, newEnd)

      // 约束：不能超过源视频时长
      const found = timelineStore.findClipById(state.clipId)
      if (found) {
        const video = projectStore.getVideo(found.clip.videoId)
        if (video?.metadata?.duration) {
          const maxEnd = state.originalStart + video.metadata.duration
          newEnd = Math.min(maxEnd, newEnd)
        }
      }

      timelineStore.updateClip(state.clipId, { endTime: newEnd })
    }
  }

  function onTrimEnd() {
    document.removeEventListener('mousemove', onTrimMove)
    document.removeEventListener('mouseup', onTrimEnd)

    if (trimState.value) {
      const state = trimState.value
      const found = timelineStore.findClipById(state.clipId)
      if (found) {
        timelineStore.saveCommand(
          `裁剪片段${state.side === 'start' ? '入点' : '出点'}`,
          {
            clipId: state.clipId,
            startTime: found.clip.startTime,
            endTime: found.clip.endTime
          },
          {
            clipId: state.clipId,
            startTime: state.originalStart,
            endTime: state.originalEnd
          }
        )
      }
      if (onCommitCallback) onCommitCallback(state)
    }

    isTrimming.value = false
    trimState.value = null
  }

  // =========================================================
  // 拖拽移动
  // =========================================================

  function startDrag(e, clip, track) {
    e.preventDefault()
    e.stopPropagation()

    isDragging.value = true
    dragState.value = {
      clipId: clip.id,
      trackId: track.id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      originalStartTime: clip.startTime,
      originalEndTime: clip.endTime,
      originalTrackId: track.id
    }

    document.addEventListener('mousemove', onDragMove)
    document.addEventListener('mouseup', onDragEnd)

    return { action: 'drag', clip, track }
  }

  function onDragMove(e) {
    if (!dragState.value || !timelineBodyRef.value) return

    const state = dragState.value
    const dx = e.clientX - state.startMouseX
    const dt = dx / engine.pps
    const clipDuration = state.originalEndTime - state.originalStartTime
    let newStart = +(state.originalStartTime + dt).toFixed(4)

    // --- snap 检测 ---
    const currentTrack = timelineStore.tracks.find(t => t.id === state.trackId)
    if (currentTrack) {
      const otherClips = currentTrack.clips.filter(c => c.id !== state.clipId)
      const snapResult = engine.computeSnapForRange(
        newStart, newStart + clipDuration,
        otherClips,
        timelineStore.playheadPosition
      )

      if (snapResult) {
        newStart = +(newStart + snapResult.offset).toFixed(4)
        snapGuide.value = {
          pixel: engine.timeToPixel(snapResult.type === 'start' ? newStart : newStart + clipDuration),
          type: snapResult.type
        }
      } else {
        snapGuide.value = null
      }

      // --- overlap 约束 ---
      const range = engine.getMovableRange(
        { id: state.clipId, startTime: newStart, endTime: newStart + clipDuration },
        otherClips
      )
      newStart = Math.max(range.minStart, Math.min(range.maxStart, newStart))
    }

    // --- 跨轨道检测 ---
    checkTrackSwitch(e, state, newStart, clipDuration)

    // 更新 clip 预览位置
    timelineStore.updateClip(state.clipId, {
      startTime: newStart,
      endTime: +(newStart + clipDuration).toFixed(4)
    })
  }

  function checkTrackSwitch(e, state, newStart, clipDuration) {
    if (!timelineBodyRef.value) return

    const trackEls = timelineBodyRef.value.querySelectorAll('.track')
    let targetTrack = null

    trackEls.forEach((trackEl, index) => {
      const trackRect = trackEl.getBoundingClientRect()
      if (e.clientY >= trackRect.top && e.clientY <= trackRect.bottom) {
        targetTrack = timelineStore.tracks[index]
      }
    })

    if (targetTrack && targetTrack.id !== state.trackId) {
      const sourceTrack = timelineStore.tracks.find(t => t.id === state.trackId)
      if (sourceTrack && targetTrack.type === sourceTrack.type) {
        timelineStore.moveClip(state.clipId, targetTrack.id, newStart)
        state.trackId = targetTrack.id
        state.originalTrackId = targetTrack.id
      }
    }
  }

  function onDragEnd() {
    document.removeEventListener('mousemove', onDragMove)
    document.removeEventListener('mouseup', onDragEnd)

    if (dragState.value) {
      const state = dragState.value
      const found = timelineStore.findClipById(state.clipId)
      if (found && (found.clip.startTime !== state.originalStartTime || found.track.id !== state.originalTrackId)) {
        timelineStore.saveCommand(
          '移动剪辑片段',
          { clipId: state.clipId, startTime: found.clip.startTime, trackId: found.track.id },
          { clipId: state.clipId, startTime: state.originalStartTime, trackId: state.originalTrackId }
        )
        if (onCommitCallback) onCommitCallback(state)
      }
    }

    dragState.value = null
    isDragging.value = false
    snapGuide.value = null
  }

  function onCommit(fn) {
    onCommitCallback = fn
  }

  // =========================================================
  // 对外导出
  // =========================================================

  return {
    // 拖拽
    dragState,
    isDragging,
    snapGuide,
    onClipMouseDown,
    onCommit,

    // trim
    isTrimming,
    trimState
  }
}