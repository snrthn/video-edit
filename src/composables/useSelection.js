/**
 * useSelection — 选择系统
 *
 * 支持：
 * - 单击选中 clip
 * - Ctrl/Cmd 多选 toggle
 * - 框选（拖拽空白区域画矩形选中范围内 clips）
 * - Shift 范围选择（预留）
 *
 * 选择状态直接操作 timelineStore。
 */

import { ref, reactive } from 'vue'
import { useTimelineStore } from '../stores'
import { engine } from '../core/timeline-engine'

export function useSelection({ timelineBodyRef, scrollContainerRef }) {
  const timelineStore = useTimelineStore()

  // 框选状态
  const selectionRect = ref(null)
  // { x1, y1, x2, y2 } — 屏幕坐标
  const isRectSelecting = ref(false)

  // ===================== 单击 Clip =====================

  function handleClipClick(clipId, event) {
    if (event.ctrlKey || event.metaKey) {
      // Ctrl/Cmd: toggle 选择
      const currentSelected = [...timelineStore.selectedClipIds]
      if (currentSelected.includes(clipId)) {
        timelineStore.selectClips(currentSelected.filter(id => id !== clipId))
      } else {
        timelineStore.selectClips([...currentSelected, clipId])
      }
    } else {
      // 普通点击：单选
      timelineStore.selectClips([clipId])
    }
  }

  // ===================== 单击空白区域（开始框选） =====================

  function handleEmptyAreaMouseDown(e) {
    // 忽略 clip 和 track-label 上的点击
    if (e.target.closest('.clip')) return
    if (e.target.closest('.track-label')) return

    // 取消当前选中
    timelineStore.selectClips([])
    timelineStore.selectTrack(null)

    // 开始框选
    const bodyRect = timelineBodyRef.value?.getBoundingClientRect()
    if (!bodyRect) return

    const scrollLeft = scrollContainerRef.value?.scrollLeft || 0
    const scrollTop = scrollContainerRef.value?.scrollTop || 0

    // 直接存相对于 timeline-body 的坐标（已加滚动偏移），视觉矩形无需再换算
    const relX = e.clientX - bodyRect.left + scrollLeft
    const relY = e.clientY - bodyRect.top + scrollTop

    isRectSelecting.value = true
    selectionRect.value = {
      x1: relX,
      y1: relY,
      x2: relX,
      y2: relY,
      _clientX1: e.clientX,
      _clientY1: e.clientY,
      _bodyLeft: bodyRect.left,
      _bodyTop: bodyRect.top,
      _scrollLeft: scrollLeft,
      _scrollTop: scrollTop
    }

    document.addEventListener('mousemove', onRectMouseMove)
    document.addEventListener('mouseup', onRectMouseUp)
  }

  function onRectMouseMove(e) {
    if (!selectionRect.value || !isRectSelecting.value) return
    const s = selectionRect.value
    const dx = e.clientX - s._clientX1
    const dy = e.clientY - s._clientY1
    selectionRect.value = {
      ...s,
      x2: s.x1 + dx,
      y2: s.y1 + dy
    }
  }

  function onRectMouseUp(e) {
    document.removeEventListener('mousemove', onRectMouseMove)
    document.removeEventListener('mouseup', onRectMouseUp)

    if (!selectionRect.value || !timelineBodyRef.value) {
      isRectSelecting.value = false
      selectionRect.value = null
      return
    }

    const rect = selectionRect.value

    // 判断是否真的画了矩形（不是单击）
    const dx = Math.abs(rect.x2 - rect.x1)
    const dy = Math.abs(rect.y2 - rect.y1)
    if (dx < 3 && dy < 3) {
      // 这就是单击空白区域，不做框选
      isRectSelecting.value = false
      selectionRect.value = null
      return
    }

    // 坐标已经是 timeline-body 相对坐标（含滚动偏移），直接使用
    const x1 = Math.min(rect.x1, rect.x2)
    const x2 = Math.max(rect.x1, rect.x2)
    const y1 = Math.min(rect.y1, rect.y2)
    const y2 = Math.max(rect.y1, rect.y2)

    const timeStart = engine.pixelToTime(x1)
    const timeEnd = engine.pixelToTime(x2)

    // 找出矩形范围内的 clips
    const selectedIds = []
    const timelineBody = timelineBodyRef.value
    const bodyRect = timelineBody.getBoundingClientRect()

    timelineStore.tracks.forEach((track, index) => {
      const trackEl = timelineBody.querySelectorAll('.track')[index]
      if (!trackEl) return

      const trackRect = trackEl.getBoundingClientRect()
      const trackTop = trackRect.top - bodyRect.top + (scrollContainerRef.value?.scrollTop || 0)
      const trackBottom = trackTop + trackRect.height

      // Y 方向相交检测
      if (trackBottom >= y1 && trackTop <= y2) {
        track.clips.forEach(clip => {
          // X 方向：用 engine 转为像素再做相交检测
          const clipLeft = engine.timeToPixel(clip.startTime)
          const clipRight = engine.timeToPixel(clip.endTime)
          if (clipRight > x1 && clipLeft < x2) {
            selectedIds.push(clip.id)
          }
        })
      }
    })

    if (selectedIds.length > 0) {
      timelineStore.selectClips(selectedIds)
    }

    isRectSelecting.value = false
    selectionRect.value = null
  }

  // ===================== 选择工具 =====================

  function selectAll() {
    const allIds = []
    timelineStore.tracks.forEach(track => {
      track.clips.forEach(clip => allIds.push(clip.id))
    })
    timelineStore.selectClips(allIds)
  }

  function clearSelection() {
    timelineStore.selectClips([])
    timelineStore.selectTrack(null)
  }

  return {
    selectionRect,
    isRectSelecting,
    handleClipClick,
    handleEmptyAreaMouseDown,
    selectAll,
    clearSelection
  }
}