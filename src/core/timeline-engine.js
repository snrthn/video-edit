/**
 * TimelineEngine — 时间轴核心计算引擎
 *
 * 纯 JS 类，无 Vue 依赖，所有坐标换算、snap、overlap 检测
 * 都通过这个类完成。不操作 DOM，不依赖任何 store。
 *
 * 设计原则：
 * - 单一入口：所有 time↔pixel 换算走 timeToPixel/pixelToTime
 * - 不可变：不修改传入的 clip 对象，需要修改的由调用方处理
 * - 浮点安全：使用 toFixed(4) 避免精度问题
 */

import {
  BASE_PPS, MIN_PPS, MAX_PPS,
  TRACK_LABEL_WIDTH, CLIP_MIN_WIDTH,
  SNAP_THRESHOLD, RULER_HEIGHT,
  TICK_MIN_PIXEL_GAP, TICK_INTERVALS, MAJOR_TICK_EVERY
} from './constants'

export class TimelineEngine {
  // =========================================================
  // 构造 & 缩放
  // =========================================================

  constructor() {
    this.pps = BASE_PPS  // pixels per second — 当前缩放下的像素/秒
  }

  /** 设置缩放级别 */
  setZoom(pps) {
    this.pps = Math.max(MIN_PPS, Math.min(MAX_PPS, pps))
  }

  /** 调整缩放（相对） */
  zoomBy(factor) {
    this.setZoom(this.pps * factor)
  }

  /** 获取 zoom 显示值（滑条用，BASE_PPS=1.0） */
  get displayZoom() {
    return +this.pps / BASE_PPS
  }

  // =========================================================
  // 坐标换算 — 唯一入口
  // =========================================================

  /** 时间 → 像素位置 */
  timeToPixel(time) {
    return +(TRACK_LABEL_WIDTH + time * this.pps).toFixed(2)
  }

  /** 像素位置 → 时间（仅返回 ≥ 0 的值） */
  pixelToTime(px) {
    return +Math.max(0, (px - TRACK_LABEL_WIDTH) / this.pps).toFixed(4)
  }

  // =========================================================
  // Clip 几何计算
  // =========================================================

  /**
   * 获取 clip 的渲染矩形
   * @returns {{ left: number, width: number }}
   */
  getClipRect(clip) {
    const left = this.timeToPixel(clip.startTime)
    const duration = clip.endTime - clip.startTime
    const width = Math.max(duration * this.pps, CLIP_MIN_WIDTH)
    return { left: +left.toFixed(2), width: +width.toFixed(2) }
  }

  /** clip 的像素宽度 */
  getClipPixelWidth(clip) {
    return Math.max((clip.endTime - clip.startTime) * this.pps, CLIP_MIN_WIDTH)
  }

  // =========================================================
  // 时间刻度尺
  // =========================================================

  /**
   * 计算当前视口内的时间刻度
   * @param {number} viewWidth - 视口像素宽度
   * @param {number} scrollLeft - 横向滚动偏移
   * @returns {{ ticks: Array<{time, pixel, isMajor}>, interval: number }}
   */
  getTimeRulerTicks(viewWidth, scrollLeft) {
    // 根据 pps 选合适的刻度间隔
    let interval = TICK_INTERVALS[0]
    for (const iv of TICK_INTERVALS) {
      if (iv * this.pps >= TICK_MIN_PIXEL_GAP) {
        interval = iv
        break
      }
    }

    const startTime = Math.max(0, this.pixelToTime(scrollLeft))
    const endTime = this.pixelToTime(scrollLeft + viewWidth)
    const ticks = []

    let t = Math.floor(startTime / interval) * interval
    while (t <= endTime + interval) {
      ticks.push({
        time: t,
        pixel: +this.timeToPixel(t).toFixed(2),
        isMajor: t % (interval * MAJOR_TICK_EVERY) === 0 && t !== 0
      })
      t = +(t + interval).toFixed(4)
    }

    return { ticks, interval }
  }

  // =========================================================
  // 时间轴总宽度
  // =========================================================

  /**
   * @param {number} duration - 时间轴总时长（秒）
   * @param {number} [minWidth=2000] - 最小渲染宽度
   */
  getTimelineWidth(duration, minWidth = 2000) {
    const contentWidth = Math.max(duration || 60, 1) * this.pps
    return Math.max(contentWidth + TRACK_LABEL_WIDTH, minWidth)
  }

  // =========================================================
  // Snap 吸附
  // =========================================================

  /**
   * 构建吸附目标点集合
   * @param {Array} clips - 所有 clip（排除正在拖拽的）
   * @param {number|null} playheadTime - 播放头位置
   * @returns {number[]}
   */
  buildSnapTargets(clips = [], playheadTime = null) {
    const points = new Set([0])

    if (playheadTime !== null) points.add(playheadTime)

    for (const clip of clips) {
      points.add(+clip.startTime.toFixed(4))
      points.add(+(clip.endTime).toFixed(4))
    }

    return [...points]
  }

  /**
   * 单点吸附：找到最近的吸附点
   * @returns {{ snappedTime: number, sourceTime: number } | null}
   */
  computeSnap(time, targets = []) {
    const targetPx = this.timeToPixel(time)

    let best = null
    let bestDist = Infinity

    for (const t of targets) {
      const tPx = this.timeToPixel(t)
      const dist = Math.abs(targetPx - tPx)
      if (dist < SNAP_THRESHOLD && dist < bestDist) {
        bestDist = dist
        best = { snappedTime: t, sourceTime: time }
      }
    }

    return best
  }

  /**
   * 范围吸附：同时检测范围的 start 和 end 两端
   * @returns {{ type: 'start'|'end', offset: number } | null}
   */
  computeSnapForRange(startTime, endTime, clips, playheadTime) {
    const targets = this.buildSnapTargets(clips, playheadTime)
    const results = []

    const startPx = this.timeToPixel(startTime)
    const endPx = this.timeToPixel(endTime)

    for (const t of targets) {
      const tPx = this.timeToPixel(t)

      // 检测 start 对齐
      const startDist = Math.abs(startPx - tPx)
      if (startDist < SNAP_THRESHOLD) {
        results.push({ type: 'start', offset: t - startTime, dist: startDist })
      }

      // 检测 end 对齐
      const endDist = Math.abs(endPx - tPx)
      if (endDist < SNAP_THRESHOLD) {
        results.push({ type: 'end', offset: t - endTime, dist: endDist })
      }
    }

    // 取最近的吸附
    results.sort((a, b) => a.dist - b.dist)
    return results[0] || null
  }

  // =========================================================
  // Overlap 检测
  // =========================================================

  /**
   * 找出与指定 clip 重叠的其他 clip
   * @param {Object} clip - { id, startTime, endTime }
   * @param {Array} trackClips - 同一轨道的所有 clip
   * @returns {Array} 重叠的 clip 列表
   */
  findOverlaps(clip, trackClips) {
    const start = clip.startTime
    const end = clip.endTime

    return trackClips.filter(c =>
      c.id !== clip.id &&
      c.startTime < end &&
      c.endTime > start
    )
  }

  /**
   * 计算 clip 在同轨道内的可移动范围（不产生重叠）
   * @returns {{ minStart: number, maxStart: number }}
   */
  getMovableRange(clip, trackClips) {
    const sorted = [...trackClips]
      .filter(c => c.id !== clip.id)
      .sort((a, b) => a.startTime - b.startTime)

    const clipDuration = clip.endTime - clip.startTime
    let minStart = 0
    let maxEnd = Infinity

    for (const c of sorted) {
      if (c.endTime <= clip.startTime) {
        minStart = Math.max(minStart, c.endTime)
      }
      if (c.startTime >= clip.endTime) {
        maxEnd = Math.min(maxEnd, c.startTime)
        break
      }
    }

    return {
      minStart: +minStart.toFixed(4),
      maxStart: +(Math.max(minStart, maxEnd - clipDuration)).toFixed(4)
    }
  }

  /**
   * 检测 clip 是否可以放在指定位置（不产生重叠）
   */
  canPlaceAt(clip, time, trackClips) {
    const testClip = {
      id: clip.id,
      startTime: time,
      endTime: time + (clip.endTime - clip.startTime)
    }
    return this.findOverlaps(testClip, trackClips).length === 0
  }

  // =========================================================
  // 根据像素位置计算拖拽相关的值
  // =========================================================

  /**
   * 从鼠标像素位置计算对应的时间
   * @param {number} mouseX - 鼠标在时间轴 body 内的像素位置
   * @param {number} scrollLeft - 滚动偏移
   */
  mouseToTime(mouseX, scrollLeft = 0) {
    return this.pixelToTime(mouseX + scrollLeft - TRACK_LABEL_WIDTH)
  }

  /**
   * 从鼠标像素位置和 clip 偏移计算新 startTime
   * @param {number} mouseX - 当前鼠标 X（client）
   * @param {number} dragStartMouseX - 拖拽起始鼠标 X（client）
   * @param {number} originalStartTime - clip 原始 startTime
   */
  dragToTime(mouseX, dragStartMouseX, originalStartTime) {
    const dx = mouseX - dragStartMouseX
    const dt = dx / this.pps
    return +(originalStartTime + dt).toFixed(4)
  }
}

// 全局单例，所有组件和 composable 共用
export const engine = new TimelineEngine()