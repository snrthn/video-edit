/**
 * usePlayhead — 播放头交互
 *
 * - 单击时间轴空白区域 → 跳转播放头
 * - 拖拽播放头手柄 → 实时 seek
 */

import { ref } from 'vue'
import { useTimelineStore } from '../stores'
import { engine } from '../core/timeline-engine'

export function usePlayhead({ timelineBodyRef, scrollContainerRef }) {
  const timelineStore = useTimelineStore()

  const isDraggingPlayhead = ref(false)

  // ===================== 点击时间轴跳转 =====================

  function handleTimelineClick(e, { findClipAtTime, loadClipVideo, seek }) {
    if (isDraggingPlayhead.value) return
    if (e.target.closest('.clip')) return
    if (e.target.closest('.track-label')) return
    if (e.target.closest('.playhead-head')) return // 播放头拖拽由 playhead mousedown 处理

    const bodyRect = timelineBodyRef.value?.getBoundingClientRect()
    const scrollL = scrollContainerRef.value?.scrollLeft || 0
    // bodyX = 点击位置相对于 timeline-body 的像素（含滚动偏移）
    // pixelToTime 内部会减去 TRACK_LABEL_WIDTH，外部不应再减
    const bodyX = (bodyRect ? e.clientX - bodyRect.left : 0) + scrollL
    const time = Math.max(0, engine.pixelToTime(bodyX))

    timelineStore.setPlayheadPosition(time)

    if (findClipAtTime && loadClipVideo && seek) {
      const found = findClipAtTime(time)
      if (found?.clip) {
        loadClipVideo(found.clip)
        setTimeout(() => seek(time), 50)
      }
    }
  }

  // ===================== 播放头拖拽 =====================

  function onPlayheadMouseDown(e, { loadClipVideo, seek }) {
    e.preventDefault()
    e.stopPropagation()
    isDraggingPlayhead.value = true

    const scrollContainer = scrollContainerRef.value
    const bodyRect = timelineBodyRef.value?.getBoundingClientRect()

    function onMove(ev) {
      if (!scrollContainer || !bodyRect) return
      const scrollL = scrollContainer.scrollLeft || 0
      const x = ev.clientX - bodyRect.left + scrollL
      const time = Math.max(0, engine.pixelToTime(x))

      timelineStore.setPlayheadPosition(time)

      // 实时预览
      if (findClipAtTime && loadClipVideo && seek) {
        const found = findClipAtTime(time)
        if (found?.clip) {
          loadClipVideo(found.clip)
          setTimeout(() => seek(time), 30)
        }
      }
    }

    function onUp() {
      isDraggingPlayhead.value = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // ===================== 键盘控制 =====================

  function seekToStart() {
    timelineStore.setPlayheadPosition(0)
  }

  function seekToEnd() {
    timelineStore.setPlayheadPosition(timelineStore.duration)
  }

  return {
    isDraggingPlayhead,
    handleTimelineClick,
    onPlayheadMouseDown,
    seekToStart,
    seekToEnd
  }
}