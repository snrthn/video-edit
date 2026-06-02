import { FFmpeg } from '@ffmpeg/ffmpeg'

class FFmpegWrapper {
  constructor() {
    this.ffmpeg = null
    this.isInitialized = false
    this.progressCallback = null
  }

  async init() {
    if (this.isInitialized) return

    this.ffmpeg = new FFmpeg({
      log: true,
      corePath: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/ffmpeg-core.js'
    })

    await this.ffmpeg.load()
    this.isInitialized = true
  }

  setProgressCallback(callback) {
    this.progressCallback = callback
  }

  async fetchFile(url) {
    const response = await fetch(url)
    const arrayBuffer = await response.arrayBuffer()
    return new Uint8Array(arrayBuffer)
  }

  async trim(inputPath, outputPath, startTime, duration) {
    await this.init()

    const inputFile = await this.fetchFile(inputPath)
    this.ffmpeg.FS('writeFile', 'input.mp4', inputFile)

    const args = [
      '-ss', startTime.toString(),
      '-i', 'input.mp4',
      '-t', duration.toString(),
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-strict', 'experimental',
      '-y',
      'output.mp4'
    ]

    await this.ffmpeg.run(...args)

    const outputData = this.ffmpeg.FS('readFile', 'output.mp4')
    const outputBlob = new Blob([outputData.buffer], { type: 'video/mp4' })

    this.ffmpeg.FS('unlink', 'input.mp4')
    this.ffmpeg.FS('unlink', 'output.mp4')

    return outputBlob
  }

  async merge(clips, outputPath) {
    await this.init()

    const fileList = []
    
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i]
      const inputFile = await this.fetchFile(clip.url)
      const fileName = `clip_${i}.mp4`
      
      this.ffmpeg.FS('writeFile', fileName, inputFile)
      fileList.push(fileName)
    }

    const concatFileContent = fileList.map(f => `file '${f}'`).join('\n')
    this.ffmpeg.FS('writeFile', 'concat.txt', new TextEncoder().encode(concatFileContent))

    const args = [
      '-f', 'concat',
      '-safe', '0',
      '-i', 'concat.txt',
      '-c', 'copy',
      '-y',
      'output.mp4'
    ]

    await this.ffmpeg.run(...args)

    const outputData = this.ffmpeg.FS('readFile', 'output.mp4')
    const outputBlob = new Blob([outputData.buffer], { type: 'video/mp4' })

    fileList.forEach(f => this.ffmpeg.FS('unlink', f))
    this.ffmpeg.FS('unlink', 'concat.txt')
    this.ffmpeg.FS('unlink', 'output.mp4')

    return outputBlob
  }

  async addAudio(inputVideoPath, inputAudioPath, outputPath) {
    await this.init()

    const videoFile = await this.fetchFile(inputVideoPath)
    const audioFile = await this.fetchFile(inputAudioPath)
    
    this.ffmpeg.FS('writeFile', 'input_video.mp4', videoFile)
    this.ffmpeg.FS('writeFile', 'input_audio.mp3', audioFile)

    const args = [
      '-i', 'input_video.mp4',
      '-i', 'input_audio.mp3',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-strict', 'experimental',
      '-y',
      'output.mp4'
    ]

    await this.ffmpeg.run(...args)

    const outputData = this.ffmpeg.FS('readFile', 'output.mp4')
    const outputBlob = new Blob([outputData.buffer], { type: 'video/mp4' })

    this.ffmpeg.FS('unlink', 'input_video.mp4')
    this.ffmpeg.FS('unlink', 'input_audio.mp3')
    this.ffmpeg.FS('unlink', 'output.mp4')

    return outputBlob
  }

  async applyFilter(inputPath, outputPath, filterType, filterParams) {
    await this.init()

    const inputFile = await this.fetchFile(inputPath)
    this.ffmpeg.FS('writeFile', 'input.mp4', inputFile)

    let filterArg = ''
    
    switch (filterType) {
      case 'brightness':
        filterArg = `eq=brightness=${filterParams.value || 0}`
        break
      case 'contrast':
        filterArg = `eq=contrast=${filterParams.value || 1}`
        break
      case 'saturation':
        filterArg = `eq=saturation=${filterParams.value || 1}`
        break
      case 'blur':
        filterArg = `gblur=sigma=${filterParams.sigma || 1}`
        break
      case 'grayscale':
        filterArg = 'hue=s=0'
        break
      default:
        filterArg = ''
    }

    const args = filterArg
      ? [
          '-i', 'input.mp4',
          '-vf', filterArg,
          '-c:a', 'copy',
          '-y',
          'output.mp4'
        ]
      : [
          '-i', 'input.mp4',
          '-c', 'copy',
          '-y',
          'output.mp4'
        ]

    await this.ffmpeg.run(...args)

    const outputData = this.ffmpeg.FS('readFile', 'output.mp4')
    const outputBlob = new Blob([outputData.buffer], { type: 'video/mp4' })

    this.ffmpeg.FS('unlink', 'input.mp4')
    this.ffmpeg.FS('unlink', 'output.mp4')

    return outputBlob
  }

  async export(inputPath, outputPath, settings = {}) {
    await this.init()

    const {
      format = 'mp4',
      quality = 'medium',
      resolution = '1080p',
      frameRate = 30
    } = settings

    const inputFile = await this.fetchFile(inputPath)
    this.ffmpeg.FS('writeFile', 'input.mp4', inputFile)

    const resolutionMap = {
      '480p': '854x480',
      '720p': '1280x720',
      '1080p': '1920x1080',
      '4k': '3840x2160'
    }

    const qualityMap = {
      low: ['-crf', '28', '-preset', 'fast'],
      medium: ['-crf', '23', '-preset', 'medium'],
      high: ['-crf', '18', '-preset', 'slow']
    }

    const args = [
      '-i', 'input.mp4',
      '-vf', `scale=${resolutionMap[resolution]}`,
      '-r', frameRate.toString(),
      ...qualityMap[quality],
      '-c:a', 'aac',
      '-b:a', '128k',
      '-y',
      `output.${format}`
    ]

    await this.ffmpeg.run(...args)

    const outputData = this.ffmpeg.FS('readFile', `output.${format}`)
    const mimeType = format === 'mp4' ? 'video/mp4' : 
                      format === 'webm' ? 'video/webm' : 'video/mp4'
    const outputBlob = new Blob([outputData.buffer], { type: mimeType })

    this.ffmpeg.FS('unlink', 'input.mp4')
    this.ffmpeg.FS('unlink', `output.${format}`)

    return outputBlob
  }

  async getInfo(inputPath) {
    await this.init()

    const inputFile = await this.fetchFile(inputPath)
    this.ffmpeg.FS('writeFile', 'input.mp4', inputFile)

    const args = [
      '-i', 'input.mp4'
    ]

    let info = ''
    const originalLog = console.log
    console.log = (...args) => {
      info += args.join(' ') + '\n'
    }

    try {
      await this.ffmpeg.run(...args)
    } catch (e) {
    } finally {
      console.log = originalLog
    }

    this.ffmpeg.FS('unlink', 'input.mp4')

    return info
  }

  destroy() {
    if (this.ffmpeg) {
      this.ffmpeg.exit()
      this.ffmpeg = null
      this.isInitialized = false
    }
  }
}

export const ffmpeg = new FFmpegWrapper()

export const videoFilters = [
  { id: 'brightness', name: '亮度', type: 'slider', min: -1, max: 1, step: 0.1, default: 0 },
  { id: 'contrast', name: '对比度', type: 'slider', min: 0, max: 2, step: 0.1, default: 1 },
  { id: 'saturation', name: '饱和度', type: 'slider', min: 0, max: 2, step: 0.1, default: 1 },
  { id: 'blur', name: '模糊', type: 'slider', min: 0, max: 10, step: 0.5, default: 0 },
  { id: 'grayscale', name: '灰度', type: 'toggle', default: false }
]

export const exportPresets = [
  { id: 'web-low', name: '网页低质量', quality: 'low', resolution: '720p', frameRate: 24 },
  { id: 'web-high', name: '网页高质量', quality: 'high', resolution: '1080p', frameRate: 30 },
  { id: 'social', name: '社交媒体', quality: 'medium', resolution: '1080p', frameRate: 30 },
  { id: '4k', name: '4K超清', quality: 'high', resolution: '4k', frameRate: 30 },
  { id: 'custom', name: '自定义', quality: 'medium', resolution: '1080p', frameRate: 30 }
]