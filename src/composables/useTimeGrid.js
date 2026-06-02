/**
 * useTimeGrid — 坐标系统 composable
 *
 * 作为 Vue 响应层和 TimelineEngine（纯计算）之间的桥梁。
 * 所有组件通过这个 composable 获取坐标换算，不直接调用 engine。
 *
 * @param {Ref} timelineStore - Pinia timeline store 的 ref 代理
 * @returns 坐标换算方法 + 刻度尺计算 + zoom 控制
 */

import { computed, ref, reactive } from 'vue'
import { engine } from '../core/timeline-engine'
import { BASE_PPS, ZOOM_MIN_DISPLAY, ZOOM_MAX_DISPLAY, ZOOM_STEP } from '../core/constants'

export function useTimeGrid() {
  // 同步 store 的 zoom 到 engine
  const displayZoom = ref(1)

  function syncZoomFromStore(storeZoom) {
    engine.setZoom(storeZoom * BASE_PPS)
    displayZoom.value = engine.displayZoom
  }

  function setZoom(level) {
    const clamped = Math.max(ZOOM_MIN_DISPLAY, Math.min(ZOOM_MAX_DISPLAY, level))
    engine.setZoom(clamped * BASE_PPS)
    displayZoom.value = engine.displayZoom
    return displayZoom.value // 返回给 store 同步
  }

  // === 坐标换算 ===

  function timeToPixel(time) {
    return engine.timeToPixel(time)
  }

  function pixelToTime(px) {
    return engine.pixelToTime(px)
  }

  // === clip 几何 ===

  function getClipRect(clip) {
    return engine.getClipRect(clip)
  }

  function getClipPixelWidth(clip) {
    return engine.getClipPixelWidth(clip)
  }

  // === 时间刻度 ===

  function getTimeRulerTicks(viewWidth, scrollLeft) {
    return engine.getTimeRulerTicks(viewWidth, scrollLeft)
  }

  // === 时间轴宽度 ===

  function getTimelineWidth(duration) {
    return engine.getTimelineWidth(duration)
  }

  // === 播放头位置 ===

  function getPlayheadPixel(playheadPosition) {
    return engine.timeToPixel(playheadPosition)
  }

  // === snap ===

  function buildSnapTargets(clips, playheadTime) {
    return engine.buildSnapTargets(clips, playheadTime)
  }

  function computeSnap(time, targets) {
    return engine.computeSnap(time, targets)
  }

  function computeSnapForRange(startTime, endTime, clips, playheadTime) {
    return engine.computeSnapForRange(startTime, endTime, clips, playheadTime)
  }

  // === overlap ===

  function findOverlaps(clip, trackClips) {
    return engine.findOverlaps(clip, trackClips)
  }

  function getMovableRange(clip, trackClips) {
    return engine.getMovableRange(clip, trackClips)
  }

  function canPlaceAt(clip, time, trackClips) {
    return engine.canPlaceAt(clip, time, trackClips)
  }

  // === 鼠标换算 ===

  function mouseToTime(mouseX, scrollLeft) {
    return engine.mouseToTime(mouseX, scrollLeft)
  }

  function dragToTime(mouseX, dragStartMouseX, originalStartTime) {
    return engine.dragToTime(mouseX, dragStartMouseX, originalStartTime)
  }

  // === zoom 控制 ===

  function zoomByWheel(deltaY) {
    const factor = deltaY > 0 ? 1 / 1.1 : 1.1
    engine.zoomBy(factor)
    displayZoom.value = engine.displayZoom
    return displayZoom.value
  }

  /**
   * 计算以指定像素位置为中心的缩放后 scrollLeft
   * @param {number} mousePixelX - 鼠标在视口内的像素位置
   * @param {number} currentScrollLeft - 当前滚动偏移
   * @param {number} timeAtMouse - 鼠标位置对应的时间
   * @returns {number} 新的 scrollLeft
   */
  function computeScrollAfterZoom(mousePixelX, currentScrollLeft, timeAtMouse) {
    const newPixelOfTime = engine.timeToPixel(timeAtMouse)
    return newPixelOfTime - mousePixelX
  }

  return {
    // 状态
    displayZoom,

    // 坐标
    timeToPixel,
    pixelToTime,
    getClipRect,
    getClipPixelWidth,

    // 时间尺
    getTimeRulerTicks,
    getTimelineWidth,
    getPlayheadPixel,

    // snap
    buildSnapTargets,
    computeSnap,
    computeSnapForRange,

    // overlap
    findOverlaps,
    getMovableRange,
    canPlaceAt,

    // 交互
    mouseToTime,
    dragToTime,

    // zoom
    syncZoomFromStore,
    setZoom,
    zoomByWheel,
    computeScrollAfterZoom
  }
}