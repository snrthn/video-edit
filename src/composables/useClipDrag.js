/**
 * useClipDrag — clip 拖拽交互
 *
 * 接管 clip 的 mousedown → mousemove → mouseup 全生命周期，
 * 集成 snap 吸附 + overlap 约束 + 跨轨道移动。
 */

import { ref } from 'vue'
import { useTimelineStore } from '../stores'
import { engine } from '../core/timeline-engine'
import { SNAP_THRESHOLD, CLIP_MIN_WIDTH } from '../core/constants'

export function useClipDrag({ timelineBodyRef, scrollContainerRef }) {
  const timelineStore = useTimelineStore()

  // 拖拽状态（暴露给模板，用于 UI 反馈）
  const dragState = ref(null)
  // { clipId, trackId, startMouseX, startMouseY, originalStartTime, originalEndTime, originalTrackId }

  const isDragging = ref(false)
  const snapGuide = ref(null) // { pixel, type: 'start'|'end' } | null

  let onCommitCallback = null

  // ===================== mousedown =====================

  function onClipMouseDown(e, clip, track) {
    // 判断点击位置：trim 区域还是中间拖拽区域
    const rect = e.currentTarget.getBoundingClientRect()
    const offsetX = e.clientX - rect.left

    // trim 手柄返回特殊 action（由外层处理）
    if (offsetX < 8) return { action: 'trim-start', clip, track }
    if (offsetX > rect.width - 8) return { action: 'trim-end', clip, track }

    // 开始拖拽
    e.preventDefault()
    e.stopPropagation()

    dragState.value = {
      clipId: clip.id,
      trackId: track.id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      originalStartTime: clip.startTime,
      originalEndTime: clip.endTime,
      originalTrackId: track.id
    }
    isDragging.value = true

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)

    return { action: 'drag', clip, track }
  }

  // ===================== mousemove =====================

  function onMouseMove(e) {
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
      const snapResult = engine.computeSnapForRange(newStart, newStart + clipDuration, otherClips, timelineStore.playheadPosition)

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
    const rect = timelineBodyRef.value.getBoundingClientRect()
    const tracks = timelineBodyRef.value.querySelectorAll('.track')

    let targetTrack = null
    tracks.forEach((trackEl, index) => {
      const trackRect = trackEl.getBoundingClientRect()
      if (e.clientY >= trackRect.top && e.clientY <= trackRect.bottom) {
        targetTrack = timelineStore.tracks[index]
      }
    })

    if (targetTrack && targetTrack.id !== state.trackId && targetTrack.type === timelineStore.tracks.find(t => t.id === state.trackId)?.type) {
      // 跨轨道移动
      timelineStore.moveClip(state.clipId, targetTrack.id, newStart)
      state.trackId = targetTrack.id
      state.originalTrackId = targetTrack.id
    }
  }

  // ===================== mouseup =====================

  function onMouseUp(e) {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)

    if (dragState.value) {
      const state = dragState.value
      const found = timelineStore.findClipById(state.clipId)
      if (found && (found.clip.startTime !== state.originalStartTime || found.track.id !== state.originalTrackId)) {
        timelineStore.saveCommand('移动剪辑片段',
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

  return {
    dragState,
    isDragging,
    snapGuide,
    onClipMouseDown,
    onCommit
  }
}