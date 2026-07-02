import { FFmpeg } from '@ffmpeg/ffmpeg'

class FFmpegWrapper {
  constructor() {
    this.ffmpeg = null
    this.isInitialized = false
    this._onProgress = null
  }

  async init() {
    if (this.isInitialized) return

    // @ffmpeg/ffmpeg v0.12.x 正确参数：
    // - load() 接受 classWorkerURL（指定 worker 文件，放在 public/ 下 Vite 不处理）
    // - load() 的 data 里传 coreURL（指定 core.js 路径）
    const base = window.location.origin
    const workerURL = `${base}/ffmpeg-esm-worker.js`    // public/ 下的 ESM worker
    const coreURL   = `${base}/ffmpeg-core-dist/esm/ffmpeg-core.js`  // ESM 格式 core

    console.log('[FFmpeg] init, classWorkerURL =', workerURL, ', coreURL =', coreURL)

    this.ffmpeg = new FFmpeg({ log: true })

    // 监听进度事件
    this.ffmpeg.on('progress', ({ progress, time }) => {
      if (this._onProgress) {
        this._onProgress(Math.min(100, Math.round(progress * 100)))
      }
    })

    // 监听 FFmpeg 日志（stderr 输出），方便排查导出失败原因
    this.ffmpeg.on('log', ({ type, message }) => {
      if (type === 'fferr') {
        console.warn('[FFmpeg stderr]', message)
      } else {
        console.log('[FFmpeg]', message)
      }
    })

    // 超时保护
    const LOAD_TIMEOUT_MS = 120000
    await Promise.race([
      this.ffmpeg.load({
        classWorkerURL: workerURL,   // 指定用 public/ 下的 worker（Vite 不处理）
        coreURL: coreURL              // 告诉 worker 加载本地的 core.js
      }),
      new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error('FFmpeg 加载超时（2分钟），请检查网络或刷新重试')),
          LOAD_TIMEOUT_MS
        )
      })
    ])

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
      resolution = 'original',   // 'original' | '1080p' | '720p' | '480p' | '4k'
      frameRate = 30,
      sourceWidth,
      sourceHeight,
      textClips = []   // 文字 clip 列表，用于字幕渲染
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

    // 分辨率处理：original = 保持原尺寸，其他按选项缩放（保持宽高比）
    let scaleArg = null
    if (resolution === 'original') {
      // 不缩放，保持原尺寸
      scaleArg = null
    } else {
      const resolutionMap = {
        '480p':  { w: 854,  h: 480  },
        '720p':  { w: 1280, h: 720   },
        '1080p': { w: 1920, h: 1080  },
        '4k':    { w: 3840, h: 2160  }
      }
      const target = resolutionMap[resolution] || resolutionMap['1080p']

      if (sourceWidth && sourceHeight) {
        // 有原尺寸：保持宽高比，缩放到目标分辨率内，不足部分加黑边
        scaleArg = `scale=${target.w}:${target.h}:force_original_aspect_ratio=decrease,pad=${target.w}:${target.h}:(ow-iw)/2:(oh-ih)/2:black`
      } else {
        // 无原尺寸：直接缩放（可能拉伸，但这是降级行为）
        scaleArg = `scale=${target.w}:${target.h}`
      }
    }

    const qualityMap = {
      low:    ['-crf', '28', '-preset', 'fast'],
      medium: ['-crf', '23', '-preset', 'medium'],
      high:   ['-crf', '18', '-preset', 'slow']
    }

    const qual = qualityMap[quality] || qualityMap.high

    // 构建 video filter 链（缩放 + 字幕）
    const vfParts = []
    if (scaleArg) vfParts.push(scaleArg)

    // 字幕：drawtext 滤镜（FFmpeg.wasm 字体兼容性问题暂未启用）
    // 如需启用字幕，需将兼容的 TTF 字体放入 public/fonts/ 下
    // 并在下方取消注释
    if (false && textClips.length > 0) {
      let fontVfsPath = null
      const fontUrl = '/fonts/NotoSansCJKsc-Regular.ttf'
      try {
        const fontResp = await fetch(fontUrl)
        if (fontResp.ok) {
          const fontData = new Uint8Array(await fontResp.arrayBuffer())
          this.ffmpeg.writeFile('subtitle_font.ttf', fontData)
          fontVfsPath = 'subtitle_font.ttf'
        }
      } catch (e) {}

      if (fontVfsPath) {
        textClips.forEach(tc => {
          const drawtextArg = this._buildDrawtextArg(tc, fontVfsPath)
          if (drawtextArg) vfParts.push(drawtextArg)
        })
      } else {
        console.warn('[FFmpeg] 未找到字体文件，字幕不会被渲染')
      }
    }
    const vfArg = vfParts.length > 0 ? vfParts.join(',') : null

    const args = ['-i', 'input_final.mp4']
    if (vfArg) args.push('-vf', vfArg)
    args.push('-c:v', 'libx264', '-r', frameRate.toString(), ...qual, '-c:a', 'aac', '-b:a', '128k', '-y', `output_final.${format}`)

    console.log('[FFmpeg] export exec args:', args)
    const exitCode = await this.ffmpeg.exec(args)
    console.log('[FFmpeg] export exec done, exitCode=', exitCode)

    if (exitCode !== 0) {
      throw new Error(`FFmpeg 导出失败（exitCode=${exitCode}），请打开控制台查看 [FFmpeg stderr] 日志`)
    }

    // 检查输出文件大小
    const outputData = await this.ffmpeg.readFile(`output_final.${format}`)
    console.log('[FFmpeg] output file size:', outputData.buffer.byteLength, 'bytes')
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

  // ============================================================
  // TrimClip — 裁剪 + 变速 + 滤镜 + 音量（一次过）
  // ============================================================

  async trimClip(inputPath, options = {}) {
    await this.init()

    const {
      startTime = 0,
      duration,
      filters = [],
      speed = 1,
      volume = 1
    } = options

    // 没有任何变换 → 走快路径（-c copy）
    const noTransforms = speed === 1 && volume === 1 && filters.length === 0
    if (noTransforms) {
      return this.trim(inputPath, startTime, duration)
    }

    const inputFile = await this.fetchFile(inputPath)
    this.ffmpeg.writeFile('input_clip.mp4', inputFile)

    const vfParts = []
    const afParts = []

    // 变速
    if (speed !== 1) {
      vfParts.push(`setpts=${(1 / speed).toFixed(4)}*PTS`)
      afParts.push(this._buildAtempoChain(speed))
    }

    // 视觉滤镜
    for (const filter of filters) {
      if (filter.enabled === false) continue
      const fs = this._buildFilterFragment(filter)
      if (fs) vfParts.push(fs)
    }

    // 音量
    if (volume !== 1) {
      afParts.push(`volume=${Number(volume).toFixed(2)}`)
    }

    const args = [
      '-ss', startTime.toString(),
      '-i', 'input_clip.mp4',
      '-t', duration.toString()
    ]

    if (vfParts.length > 0) args.push('-vf', vfParts.join(','))
    if (afParts.length > 0) args.push('-af', afParts.join(','))

    args.push('-c:v', 'libx264', '-c:a', 'aac', '-y', 'output_clip.mp4')

    await this.ffmpeg.exec(args)

    const outputData = await this.ffmpeg.readFile('output_clip.mp4')
    const outputBlob = new Blob([outputData.buffer], { type: 'video/mp4' })

    try { await this.ffmpeg.deleteFile('input_clip.mp4') } catch {}
    try { await this.ffmpeg.deleteFile('output_clip.mp4') } catch {}

    return outputBlob
  }

  // 将单个滤镜描述转为 FFmpeg filter 片段
  _buildFilterFragment(filter) {
    const { type, params = {} } = filter
    switch (type) {
      case 'brightness': return `eq=brightness=${params.value || 0}`
      case 'contrast':   return `eq=contrast=${params.value || 1}`
      case 'saturation': return `eq=saturation=${params.value || 1}`
      case 'blur':       return `gblur=sigma=${params.sigma || 1}`
      case 'grayscale':  return 'hue=s=0'
      case 'huerotate':  return `hue=h=${params.value || 0}`
      case 'opacity':    return `format=rgba,colorchannelmixer=aa=${params.value || 1}`
      default:           return null
    }
  }

  // 将文字 clip 转为 FFmpeg drawtext 滤镜参数
  _buildDrawtextArg(textClip, fontPath) {
    const { content, startTime, endTime, textStyle } = textClip
    if (!content || !textStyle) return null

    // 转义文字内容（FFmpeg drawtext 需要转义特殊字符）
    const escaped = content
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "'\\''")
      .replace(/:/g, '\\:')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;')

    // 位置映射
    let xExpr, yExpr
    const margin = 20
    switch (textStyle.x) {
      case 'left':   xExpr = margin; break
      case 'right':  xExpr = `w-${margin}-text_w`; break
      default:       xExpr = `(w-text_w)/2`; break   // center
    }
    switch (textStyle.y) {
      case 'top':    yExpr = margin; break
      case 'bottom': yExpr = `h-${margin}-text_h`; break
      default:       yExpr = `(h-text_h)/2`; break   // center
    }

    // 时间范围
    const enableExpr = `between(t,${startTime},${endTime})`

    // 字体参数（可选，不指定则用默认字体）
    // 注意：fontfile 路径不含特殊字符时不需要引号；含空格时用单引号包裹
    let fontArgs = ''
    if (fontPath) {
      // fontPath 是 FFmpeg 虚拟文件系统里的路径（如 subtitle_font.otf）
      // 不含逗号/冒号等特殊字符时直接写，不含空格也不需要引号
      const needsQuote = /[\s'":,;\\]/.test(fontPath)
      fontArgs = needsQuote ? `:fontfile='${fontPath}'` : `:fontfile=${fontPath}`
    }
    if (textStyle.fontSize) {
      fontArgs += `:fontsize=${textStyle.fontSize}`
    }
    if (textStyle.color) {
      // FFmpeg drawtext 的 fontcolor 支持 #RRGGBB 格式
      fontArgs += `:fontcolor=${textStyle.color}`
    }

    return `drawtext=text='${escaped}':x=${xExpr}:y=${yExpr}:enable='${enableExpr}'${fontArgs}`
  }

  // atempo 串联（FFmpeg atempo 单次只支持 0.5-2.0）
  _buildAtempoChain(speed) {
    const clamp = (v) => Math.max(0.5, Math.min(2.0, v))
    const parts = []
    let remaining = speed
    while (remaining > 2.0) {
      parts.push('atempo=2.0')
      remaining /= 2.0
    }
    while (remaining < 0.5) {
      parts.push('atempo=0.5')
      remaining /= 0.5
    }
    parts.push(`atempo=${remaining.toFixed(2)}`)
    return parts.join(',')
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
