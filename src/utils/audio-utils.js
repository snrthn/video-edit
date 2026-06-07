/**
 * 音频工具 — 波形提取 & 渲染
 *
 * 从视频文件中提取音频数据，生成峰值波形数组，
 * 用于 AudioClipBlock 的 canvas 渲染。
 */

// 全局 AudioContext（懒初始化，浏览器限制单例）
let _audioContext = null

function getAudioContext() {
  if (!_audioContext) {
    _audioContext = new (window.AudioContext || window.webkitAudioContext)()
  }
  return _audioContext
}

// ============================================================
// 波形数据提取
// ============================================================

/**
 * 从视频 Blob/URL 提取音频并生成峰值波形数组
 *
 * @param {string|Blob} source - 视频 blob URL 或 Blob 对象
 * @param {number} [samplesPerSecond=100] - 每秒采样点数（决定波形精度）
 * @returns {Promise<{ peaks: number[], duration: number, sampleRate: number }>}
 */
export async function extractWaveform(source, samplesPerSecond = 100) {
  const ctx = getAudioContext()

  // 1. 获取 ArrayBuffer
  let arrayBuffer
  if (typeof source === 'string') {
    const response = await fetch(source)
    arrayBuffer = await response.arrayBuffer()
  } else if (source instanceof Blob) {
    arrayBuffer = await source.arrayBuffer()
  } else {
    throw new Error('Invalid audio source')
  }

  // 2. 解码音频
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer)

  // 3. 计算峰值
  const duration = audioBuffer.duration
  const totalSamples = Math.max(1, Math.ceil(duration * samplesPerSecond))
  const peaks = new Array(totalSamples)

  // 合并所有声道计算 RMS 峰值
  const channelCount = audioBuffer.numberOfChannels
  const channelData = []
  for (let c = 0; c < channelCount; c++) {
    channelData.push(audioBuffer.getChannelData(c))
  }

  const samplesPerPeak = Math.floor(audioBuffer.length / totalSamples)

  for (let i = 0; i < totalSamples; i++) {
    const start = i * samplesPerPeak
    const end = Math.min(start + samplesPerPeak, audioBuffer.length)
    let maxPeak = 0

    for (let j = start; j < end; j++) {
      // 取所有声道中幅值最大的
      let sum = 0
      for (let c = 0; c < channelCount; c++) {
        sum += Math.abs(channelData[c][j])
      }
      const avg = sum / channelCount
      if (avg > maxPeak) maxPeak = avg
    }

    // 使用对数刻度让视觉更好看
    peaks[i] = Math.min(1, maxPeak * 2)
  }

  return {
    peaks,
    duration,
    sampleRate: audioBuffer.sampleRate
  }
}

// ============================================================
// Canvas 波形渲染
// ============================================================

/**
 * 在 canvas 上绘制波形
 *
 * @param {HTMLCanvasElement} canvas
 * @param {number[]} peaks - 峰值数组
 * @param {Object} options
 * @param {number} options.viewStartTime - 可视范围起始时间 (秒)
 * @param {number} options.viewDuration - 可视范围时长 (秒)
 * @param {string} [options.color='#50c878'] - 波形颜色
 * @param {string} [options.bgColor] - 背景色
 */
export function renderWaveform(canvas, peaks, options = {}) {
  const {
    viewStartTime = 0,
    viewDuration,
    color = '#50c878',
    bgColor = null
  } = options

  const ctx = canvas.getContext('2d')
  const width = canvas.width
  const height = canvas.height

  if (width <= 0 || height <= 0) return

  // 背景
  if (bgColor) {
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, width, height)
  } else {
    ctx.clearRect(0, 0, width, height)
  }

  if (!peaks || peaks.length === 0) return

  // 可视范围内的峰值索引
  const secondsPerPeak = viewDuration ? viewDuration / peaks.length : 1
  const startIndex = Math.floor(viewStartTime / secondsPerPeak)
  const endIndex = Math.ceil((viewStartTime + (viewDuration || viewStartTime + 1)) / secondsPerPeak)
  const visiblePeaks = peaks.slice(
    Math.max(0, startIndex),
    Math.min(peaks.length, endIndex + 1)
  )

  if (visiblePeaks.length === 0) return

  const barWidth = Math.max(1, width / visiblePeaks.length - 0.5)
  const halfHeight = height / 2

  // 绘制波形条
  ctx.fillStyle = color

  for (let i = 0; i < visiblePeaks.length; i++) {
    const peak = visiblePeaks[i]
    const barHeight = Math.max(1, peak * halfHeight)
    const x = i * (barWidth + 0.5)

    // 上下对称
    ctx.fillRect(x, halfHeight - barHeight, barWidth, barHeight * 2)
  }
}

/**
 * 为 canvas 设置合适的尺寸（考虑 devicePixelRatio）
 */
export function resizeWaveformCanvas(canvas, width, height, dpr = window.devicePixelRatio || 1) {
  canvas.width = width * dpr
  canvas.height = height * dpr
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
}

// ============================================================
// 波形缓存
// ============================================================

const waveformCache = new Map()

/**
 * 获取或生成波形数据（带缓存）
 */
export async function getWaveformData(videoId, sourceUrl, forceRefresh = false) {
  if (!forceRefresh && waveformCache.has(videoId)) {
    return waveformCache.get(videoId)
  }

  try {
    const data = await extractWaveform(sourceUrl)
    waveformCache.set(videoId, data)
    return data
  } catch (err) {
    console.warn(`Failed to extract waveform for ${videoId}:`, err)
    return null
  }
}

export function clearWaveformCache(videoId) {
  if (videoId) {
    waveformCache.delete(videoId)
  } else {
    waveformCache.clear()
  }
}
