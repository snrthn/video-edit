import { FFmpeg } from '@ffmpeg/ffmpeg'

class FFmpegWrapper {
  constructor() {
    this.ffmpeg = null
    this.isInitialized = false
    this._onProgress = null
  }

  async init() {
    if (this.isInitialized) return
    this.ffmpeg = new FFmpeg({
      log: true,
      corePath: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/ffmpeg-core.js'
    })
    // 监听 FFmpeg.wasm 内置进度事件
    this.ffmpeg.on('progress', ({ progress, time }) => {
      if (this._onProgress) {
        this._onProgress(Math.min(100, Math.round(progress * 100)))
      }
    })
    await this.ffmpeg.load()
    this.isInitialized = true
  }

  onProgress(callback) {
    this._onProgress = callback
  }

  async fetchFile(url) {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`无法获取文件: ${response.status}`)
    const arrayBuffer = await response.arrayBuffer()
    return new Uint8Array(arrayBuffer)
  }

  // ============================================================
  // Trim — 从源文件裁剪片段
  // ============================================================

  async trim(inputPath, startTime, duration) {
    await this.init()

    const inputFile = await this.fetchFile(inputPath)
    this.ffmpeg.writeFile('input.mp4', inputFile)

    // -ss 放在 -i 之前做快速 seek
    const args = [
      '-ss', startTime.toString(),
      '-i', 'input.mp4',
      '-t', duration.toString(),
      '-c', 'copy',
      '-avoid_negative_ts', 'make_zero',
      '-y',
      'output.mp4'
    ]

    await this.ffmpeg.exec(args)

    const outputData = await this.ffmpeg.readFile('output.mp4')
    const outputBlob = new Blob([outputData.buffer], { type: 'video/mp4' })

    // 清理虚拟文件系统
    try { await this.ffmpeg.deleteFile('input.mp4') } catch {}
    try { await this.ffmpeg.deleteFile('output.mp4') } catch {}

    return outputBlob
  }

  // ============================================================
  // Merge — 拼接多个片段
  // ============================================================

  async merge(clips) {
    await this.init()

    const fileList = []

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i]
      const inputFile = await this.fetchFile(clip.url)
      const fileName = `clip_${i}.mp4`
      this.ffmpeg.writeFile(fileName, inputFile)
      fileList.push(fileName)
    }

    const concatContent = fileList.map(f => `file '${f}'`).join('\n')
    this.ffmpeg.writeFile('concat.txt', concatContent)

    // 先用 concat demuxer 拼接，再统一做最终编码（见 export 方法）
    const args = [
      '-f', 'concat',
      '-safe', '0',
      '-i', 'concat.txt',
      '-c', 'copy',
      '-y',
      'output_merged.mp4'
    ]

    await this.ffmpeg.exec(args)

    const outputData = await this.ffmpeg.readFile('output_merged.mp4')
    const outputBlob = new Blob([outputData.buffer], { type: 'video/mp4' })

    // 清理
    for (const f of fileList) { try { await this.ffmpeg.deleteFile(f) } catch {} }
    try { await this.ffmpeg.deleteFile('concat.txt') } catch {}
    try { await this.ffmpeg.deleteFile('output_merged.mp4') } catch {}

    return outputBlob
  }

  // ============================================================
  // Export — 最终编码（质量 / 分辨率 / 帧率）
  // ============================================================

  async export(inputBlobOrUrl, settings = {}) {
    await this.init()

    const {
      format = 'mp4',
      quality = 'high',
      resolution = '1080p',
      frameRate = 30
    } = settings

    let inputFile
    if (typeof inputBlobOrUrl === 'string') {
      inputFile = await this.fetchFile(inputBlobOrUrl)
    } else if (inputBlobOrUrl instanceof Blob) {
      inputFile = new Uint8Array(await inputBlobOrUrl.arrayBuffer())
    } else {
      throw new Error('export: 不支持的输入类型')
    }

    this.ffmpeg.writeFile('input_final.mp4', inputFile)

    const resolutionMap = {
      '480p': '854:480',
      '720p': '1280:720',
      '1080p': '1920:1080',
      '4k': '3840:2160'
    }

    const qualityMap = {
      low:    ['-crf', '28', '-preset', 'fast'],
      medium: ['-crf', '23', '-preset', 'medium'],
      high:   ['-crf', '18', '-preset', 'slow']
    }

    const scale = resolutionMap[resolution] || '1920:1080'
    const qual = qualityMap[quality] || qualityMap.high

    const args = [
      '-i', 'input_final.mp4',
      '-vf', `scale=${scale}`,
      '-r', frameRate.toString(),
      ...qual,
      '-c:a', 'aac',
      '-b:a', '128k',
      '-y',
      `output_final.${format}`
    ]

    await this.ffmpeg.exec(args)

    const outputData = await this.ffmpeg.readFile(`output_final.${format}`)
    const mimeType = format === 'mp4' ? 'video/mp4'
                   : format === 'webm' ? 'video/webm'
                   : 'video/mp4'
    const outputBlob = new Blob([outputData.buffer], { type: mimeType })

    try { await this.ffmpeg.deleteFile('input_final.mp4') } catch {}
    try { await this.ffmpeg.deleteFile(`output_final.${format}`) } catch {}

    return outputBlob
  }

  // ============================================================
  // 部分导出（单 clip 直接走裁剪 + 编码）
  // ============================================================

  async trimAndExport(inputPath, startTime, duration, settings = {}) {
    const trimmed = await this.trim(inputPath, startTime, duration)
    return await this.export(trimmed, settings)
  }

  // ============================================================
  // 辅助
  // ============================================================

  async addAudio(inputVideoPath, inputAudioPath) {
    await this.init()
    const videoFile = await this.fetchFile(inputVideoPath)
    const audioFile = await this.fetchFile(inputAudioPath)
    this.ffmpeg.writeFile('input_video.mp4', videoFile)
    this.ffmpeg.writeFile('input_audio.mp3', audioFile)
    await this.ffmpeg.exec([
      '-i', 'input_video.mp4', '-i', 'input_audio.mp3',
      '-c:v', 'copy', '-c:a', 'aac', '-strict', 'experimental', '-y',
      'output.mp4'
    ])
    const outputData = await this.ffmpeg.readFile('output.mp4')
    const outputBlob = new Blob([outputData.buffer], { type: 'video/mp4' })
    try { await this.ffmpeg.deleteFile('input_video.mp4') } catch {}
    try { await this.ffmpeg.deleteFile('input_audio.mp3') } catch {}
    try { await this.ffmpeg.deleteFile('output.mp4') } catch {}
    return outputBlob
  }

  async applyFilter(inputPath, filterType, filterParams) {
    await this.init()
    const inputFile = await this.fetchFile(inputPath)
    this.ffmpeg.writeFile('input.mp4', inputFile)

    let filterArg = ''
    switch (filterType) {
      case 'brightness': filterArg = `eq=brightness=${filterParams.value || 0}`; break
      case 'contrast':   filterArg = `eq=contrast=${filterParams.value || 1}`; break
      case 'saturation': filterArg = `eq=saturation=${filterParams.value || 1}`; break
      case 'blur':       filterArg = `gblur=sigma=${filterParams.sigma || 1}`; break
      case 'grayscale':  filterArg = 'hue=s=0'; break
    }

    await this.ffmpeg.exec(filterArg
      ? ['-i', 'input.mp4', '-vf', filterArg, '-c:a', 'copy', '-y', 'output.mp4']
      : ['-i', 'input.mp4', '-c', 'copy', '-y', 'output.mp4'])

    const outputData = await this.ffmpeg.readFile('output.mp4')
    const outputBlob = new Blob([outputData.buffer], { type: 'video/mp4' })
    try { await this.ffmpeg.deleteFile('input.mp4') } catch {}
    try { await this.ffmpeg.deleteFile('output.mp4') } catch {}
    return outputBlob
  }

  destroy() {
    if (this.ffmpeg) {
      this.ffmpeg.terminate()
      this.ffmpeg = null
      this.isInitialized = false
    }
  }
}

export const ffmpeg = new FFmpegWrapper()

export const videoFilters = [
  { id: 'brightness', name: '亮度', type: 'slider', min: -1, max: 1, step: 0.1, default: 0 },
  { id: 'contrast',   name: '对比度', type: 'slider', min: 0, max: 2, step: 0.1, default: 1 },
  { id: 'saturation', name: '饱和度', type: 'slider', min: 0, max: 2, step: 0.1, default: 1 },
  { id: 'blur',       name: '模糊',   type: 'slider', min: 0, max: 10, step: 0.5, default: 0 },
  { id: 'grayscale',  name: '灰度',   type: 'toggle', default: false }
]

export const exportPresets = [
  { id: 'web-low',  name: '网页低质量', quality: 'low',  resolution: '720p',  frameRate: 24 },
  { id: 'web-high', name: '网页高质量', quality: 'high', resolution: '1080p', frameRate: 30 },
  { id: 'social',   name: '社交媒体',   quality: 'medium', resolution: '1080p', frameRate: 30 },
  { id: '4k',       name: '4K超清',     quality: 'high', resolution: '4k',     frameRate: 30 },
  { id: 'custom',   name: '自定义',     quality: 'medium', resolution: '1080p', frameRate: 30 }
]