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
    const rect = timelineBodyRef.value?.getBoundingClientRect()
    if (!rect) return

    const scrollLeft = scrollContainerRef.value?.scrollLeft || 0
    const scrollTop = scrollContainerRef.value?.scrollTop || 0

    isRectSelecting.value = true
    selectionRect.value = {
      x1: e.clientX,
      y1: e.clientY,
      x2: e.clientX,
      y2: e.clientY,
      originX: e.clientX,
      originY: e.clientY,
      scrollLeft,
      scrollTop
    }

    document.addEventListener('mousemove', onRectMouseMove)
    document.addEventListener('mouseup', onRectMouseUp)
  }

  function onRectMouseMove(e) {
    if (!selectionRect.value || !isRectSelecting.value) return
    selectionRect.value = {
      ...selectionRect.value,
      x2: e.clientX,
      y2: e.clientY
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

    // 转换为时间轴坐标
    const bodyRect = timelineBodyRef.value.getBoundingClientRect()
    const scrollL = scrollContainerRef.value?.scrollLeft || 0
    const scrollT = scrollContainerRef.value?.scrollTop || 0

    const x1 = Math.min(rect.x1, rect.x2) - bodyRect.left + scrollL
    const x2 = Math.max(rect.x1, rect.x2) - bodyRect.left + scrollL
    const y1 = Math.min(rect.y1, rect.y2) - bodyRect.top + scrollT
    const y2 = Math.max(rect.y1, rect.y2) - bodyRect.top + scrollT

    const timeStart = engine.pixelToTime(x1)
    const timeEnd = engine.pixelToTime(x2)

    // 找出矩形范围内的 clips
    const selectedIds = []
    const timelineBody = timelineBodyRef.value
    const trackEls = timelineBody.querySelectorAll('.track')

    trackEls.forEach((trackEl, index) => {
      const trackRect = trackEl.getBoundingClientRect()
      const trackTop = trackRect.top - bodyRect.top + scrollT
      const trackBottom = trackTop + trackRect.height

      // Y 方向相交检测
      if (trackBottom >= y1 && trackTop <= y2) {
        const track = timelineStore.tracks[index]
        if (!track) return

        track.clips.forEach(clip => {
          const clipEndTime = clip.endTime
          // X 方向相交检测
          if (clip.endTime >= timeStart && clip.startTime <= timeEnd) {
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