/**
 * useTimelineZoom — 时间轴缩放
 *
 * - Ctrl + 滚轮：以鼠标位置为中心缩放
 * - 缩放滑块
 *
 * 所有缩放操作通过 engine 转发，最终同步回 store。
 */

import { ref } from 'vue'
import { useTimelineStore } from '../stores'
import { engine } from '../core/timeline-engine'
import {
  BASE_PPS, ZOOM_MIN_DISPLAY, ZOOM_MAX_DISPLAY, ZOOM_STEP, WHEEL_ZOOM_FACTOR
} from '../core/constants'
import { triggerSave } from '../main'

export function useTimelineZoom({ scrollContainerRef }) {
  const timelineStore = useTimelineStore()

  const isZooming = ref(false)

  // ===================== 滑块缩放 =====================

  function onSliderZoom(level) {
    engine.setZoom(level * BASE_PPS)
    timelineStore.syncZoomFromEngine()
    triggerSave()
  }

  // ===================== Ctrl+滚轮缩放 =====================

  function onWheel(e) {
    if (!e.ctrlKey && !e.metaKey) return // 只在 Ctrl+滚轮时缩放
    e.preventDefault()

    const container = scrollContainerRef.value
    if (!container) return

    const rect = container.getBoundingClientRect()
    const mouseX = e.clientX - rect.left // 鼠标在视口内的位置
    const currentScrollLeft = container.scrollLeft

    // 记录鼠标位置对应的时间
    const timeAtMouse = engine.pixelToTime(currentScrollLeft + mouseX)

    // 缩放
    const factor = e.deltaY > 0 ? 1 / WHEEL_ZOOM_FACTOR : WHEEL_ZOOM_FACTOR
    engine.zoomBy(factor)
    timelineStore.syncZoomFromEngine()

    // 缩放后调整 scrollLeft，保持鼠标位置的时间不变
    const newPixelOfTime = engine.timeToPixel(timeAtMouse)
    container.scrollLeft = Math.max(0, newPixelOfTime - mouseX)
    triggerSave()
  }

  // ===================== 缩放归位 =====================

  function resetZoom() {
    engine.setZoom(BASE_PPS)
    timelineStore.syncZoomFromEngine()
  }

  function zoomIn() {
    engine.zoomBy(WHEEL_ZOOM_FACTOR)
    timelineStore.syncZoomFromEngine()
  }

  function zoomOut() {
    engine.zoomBy(1 / WHEEL_ZOOM_FACTOR)
    timelineStore.syncZoomFromEngine()
  }

  return {
    isZooming,
    onSliderZoom,
    onWheel,
    resetZoom,
    zoomIn,
    zoomOut
  }
}