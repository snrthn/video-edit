import { ref } from 'vue'
import { useTimelineStore } from '../stores'
import { engine } from '../core/timeline-engine'
import { triggerSave } from '../main'

export function usePlayhead({ timelineBodyRef, scrollContainerRef }) {
  const timelineStore = useTimelineStore()
  const isDraggingPlayhead = ref(false)

  function pixelToTimelineTime(e) {
    const bodyRect = timelineBodyRef.value?.getBoundingClientRect()
    const scrollL = scrollContainerRef.value?.scrollLeft || 0
    const bodyX = (bodyRect ? e.clientX - bodyRect.left : 0) + scrollL
    return Math.max(0, engine.pixelToTime(bodyX))
  }

  // ===================== 点击时间轴跳转 =====================

  function handleTimelineClick(e, { freezeFrame }) {
    if (isDraggingPlayhead.value) return
    if (e.target.closest('.clip')) return
    if (e.target.closest('.track-label')) return
    if (e.target.closest('.playhead-head')) return

    const time = pixelToTimelineTime(e)
    timelineStore.setPlayheadPosition(time)
    freezeFrame(time)
    triggerSave()
  }

  // ===================== 播放头拖拽擦除 =====================

  function onPlayheadMouseDown(e, { scrub, clearPreview, freezeFrame }) {
    e.preventDefault()
    e.stopPropagation()
    isDraggingPlayhead.value = true

    function onMove(ev) {
      const time = pixelToTimelineTime(ev)
      timelineStore.setPlayheadPosition(time)
      scrub(time)
    }

    function onUp() {
      isDraggingPlayhead.value = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      // 释放后冻结在最终位置
      freezeFrame(timelineStore.playheadPosition)
      triggerSave()
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return {
    isDraggingPlayhead,
    handleTimelineClick,
    onPlayheadMouseDown
  }
}