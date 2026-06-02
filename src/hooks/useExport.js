import { ref, computed } from 'vue'
import { useExportStore, useProjectStore, useTimelineStore } from '../stores'
import { ffmpeg } from '../utils/ffmpeg-wrapper'
import { blobToUrl, generateId } from '../utils/video-utils'

export function useExport() {
  const exportStore = useExportStore()
  const projectStore = useProjectStore()
  const timelineStore = useTimelineStore()

  const isExporting = computed(() => exportStore.isExporting)
  const currentJob = computed(() => exportStore.currentJob)
  const jobs = computed(() => exportStore.jobHistory)
  const progress = computed(() => exportStore.progress)

  // ===================== 导出生命周期 =====================

  function createExportJob(settings = {}) {
    return exportStore.createJob({
      format: settings.format || 'mp4',
      quality: settings.quality || 'high',
      fps: settings.frameRate || 30,
      ...settings
    })
  }

  async function startExport(settings) {
    try {
      exportStore.startExport(settings)
      exportStore.updateProgress(10, '初始化 FFmpeg')
      await ffmpeg.init()

      const clips = collectClips()
      if (clips.length === 0) throw new Error('时间线上没有剪辑片段')
      exportStore.updateProgress(30, '开始编码')

      let outputBlob
      if (clips.length === 1) {
        outputBlob = await processSingleClip(clips[0], settings)
      } else {
        outputBlob = await processMultipleClips(clips, settings)
      }

      exportStore.updateProgress(90, '生成文件')
      const outputUrl = blobToUrl(outputBlob)

      exportStore.completeExport(outputUrl)
      downloadFile(outputBlob, `导出_${Date.now()}`, settings.format || 'mp4')
    } catch (error) {
      exportStore.failExport(error.message)
      throw error
    }
  }

  function cancelExport() {
    exportStore.cancelExport()
  }

  // ===================== FFmpeg 处理 =====================

  async function processSingleClip(clip, settings) {
    const video = projectStore.getVideo(clip.videoId)
    if (!video) throw new Error('视频不存在')

    const duration = clip.endTime - clip.startTime
    let outputBlob = await ffmpeg.trim(video.source.url, null, clip.startTime, duration)

    if (clip.filters?.length > 0) {
      for (const filter of clip.filters) {
        outputBlob = await ffmpeg.applyFilter(
          URL.createObjectURL(outputBlob), null, filter.type, filter.params
        )
      }
    }
    return outputBlob
  }

  async function processMultipleClips(clips, settings) {
    const processedClips = []
    const progressPerClip = 50 / clips.length

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i]
      const video = projectStore.getVideo(clip.videoId)
      if (!video) continue

      const duration = clip.endTime - clip.startTime
      let clipBlob = await ffmpeg.trim(video.source.url, null, clip.startTime, duration)

      if (clip.filters?.length > 0) {
        for (const filter of clip.filters) {
          const tempUrl = URL.createObjectURL(clipBlob)
          clipBlob = await ffmpeg.applyFilter(tempUrl, null, filter.type, filter.params)
          URL.revokeObjectURL(tempUrl)
        }
      }

      const url = URL.createObjectURL(clipBlob)
      processedClips.push({ url, duration })
      exportStore.updateProgress(30 + Math.floor((i + 1) * progressPerClip), `处理片段 ${i + 1}/${clips.length}`)
    }

    const mergedBlob = await ffmpeg.merge(processedClips.map(c => ({ url: c.url })), null)
    processedClips.forEach(c => URL.revokeObjectURL(c.url))
    return mergedBlob
  }

  // ===================== 工具 =====================

  function collectClips() {
    const allClips = []
    timelineStore.tracks.forEach(track => {
      track.clips.forEach(clip => {
        allClips.push({ ...clip, trackId: track.id })
      })
    })
    allClips.sort((a, b) => a.startTime - b.startTime)
    return allClips
  }

  function downloadFile(blob, name, format) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name}.${format}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function clearHistory() {
    exportStore.clearHistory()
  }

  function getDefaultSettings() {
    return exportStore.getDefaultSettings()
  }

  return {
    isExporting,
    currentJob,
    jobs,
    progress,
    createExportJob,
    startExport,
    cancelExport,
    clearHistory,
    getDefaultSettings
  }
}
