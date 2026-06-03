/**
 * useTimeGrid — 坐标系统 composable
 *
 * Vue 响应层和 TimelineEngine（纯计算）之间的桥梁。
 * 内部维护一个响应式的 pps，所有坐标函数都触达它，
 * 确保 zoom 变化时所有组件的 computed 自动重新计算。
 */

import { computed, ref } from 'vue'
import { useTimelineStore } from '../stores'
import { engine } from '../core/timeline-engine'
import { BASE_PPS } from '../core/constants'

export function useTimeGrid() {
  const timelineStore = useTimelineStore()

  /**
   * 响应式 pps —— 依赖 timelineStore.zoom 以便 Vue 追踪。
   * engine.pps 本身不是 reactive 的，不能作为 computed 的依赖源。
   * 所有坐标函数都通过读 _pps.value 来建立响应式链路。
   */
  const _pps = computed(() => {
    // 读 store.zoom 建立依赖；engine 已经由 useTimelineZoom/init 同步过了
    void timelineStore.zoom
    return engine.pps
  })

  // === 缩放状态 ===

  const displayZoom = ref(1)

  function syncZoomFromStore(storeZoom) {
    engine.setZoom(storeZoom * BASE_PPS)
    displayZoom.value = engine.displayZoom
  }

  function setZoom(level) {
    engine.setZoom(level * BASE_PPS)
    timelineStore.syncZoomFromEngine()
    displayZoom.value = engine.displayZoom
    return displayZoom.value
  }

  // === 坐标换算 ===

  function timeToPixel(time) {
    void _pps.value
    return engine.timeToPixel(time)
  }

  function pixelToTime(px) {
    void _pps.value
    return engine.pixelToTime(px)
  }

  function clipTimeToPixel(time) {
    void _pps.value
    return engine.clipTimeToPixel(time)
  }

  function clipPixelToTime(px) {
    void _pps.value
    return engine.clipPixelToTime(px)
  }

  // === clip 几何 ===

  function getClipRect(clip) {
    void _pps.value
    return engine.getClipRect(clip)
  }

  function getClipPixelWidth(clip) {
    void _pps.value
    return engine.getClipPixelWidth(clip)
  }

  // === 时间刻度尺 ===

  function getTimeRulerTicks(viewWidth, scrollLeft) {
    void _pps.value
    return engine.getTimeRulerTicks(viewWidth, scrollLeft)
  }

  // === 时间轴宽度 ===

  function getTimelineWidth(duration) {
    void _pps.value
    return engine.getTimelineWidth(duration)
  }

  // === 播放头位置 ===

  function getPlayheadPixel(playheadPosition) {
    void _pps.value
    return engine.timeToPixel(playheadPosition)
  }

  // === snap ===

  function buildSnapTargets(clips, playheadTime) {
    void _pps.value
    return engine.buildSnapTargets(clips, playheadTime)
  }

  function computeSnap(time, targets) {
    void _pps.value
    return engine.computeSnap(time, targets)
  }

  function computeSnapForRange(startTime, endTime, clips, playheadTime) {
    void _pps.value
    return engine.computeSnapForRange(startTime, endTime, clips, playheadTime)
  }

  // === overlap ===

  function findOverlaps(clip, trackClips) {
    void _pps.value
    return engine.findOverlaps(clip, trackClips)
  }

  function getMovableRange(clip, trackClips) {
    void _pps.value
    return engine.getMovableRange(clip, trackClips)
  }

  function canPlaceAt(clip, time, trackClips) {
    void _pps.value
    return engine.canPlaceAt(clip, time, trackClips)
  }

  // === 鼠标换算 ===

  function mouseToTime(mouseX, scrollLeft) {
    void _pps.value
    return engine.mouseToTime(mouseX, scrollLeft)
  }

  function dragToTime(mouseX, dragStartMouseX, originalStartTime) {
    void _pps.value
    return engine.dragToTime(mouseX, dragStartMouseX, originalStartTime)
  }

  // === zoom 控制 ===

  function zoomByWheel(deltaY) {
    const factor = deltaY > 0 ? 1 / 1.1 : 1.1
    engine.zoomBy(factor)
    timelineStore.syncZoomFromEngine()
    displayZoom.value = engine.displayZoom
    return displayZoom.value
  }

  function computeScrollAfterZoom(mousePixelX, currentScrollLeft, timeAtMouse) {
    void _pps.value
    const newPixelOfTime = engine.timeToPixel(timeAtMouse)
    return newPixelOfTime - mousePixelX
  }

  return {
    displayZoom,
    timeToPixel,
    pixelToTime,
    clipTimeToPixel,
    clipPixelToTime,
    getClipRect,
    getClipPixelWidth,
    getTimeRulerTicks,
    getTimelineWidth,
    getPlayheadPixel,
    buildSnapTargets,
    computeSnap,
    computeSnapForRange,
    findOverlaps,
    getMovableRange,
    canPlaceAt,
    mouseToTime,
    dragToTime,
    syncZoomFromStore,
    setZoom,
    zoomByWheel,
    computeScrollAfterZoom
  }
}