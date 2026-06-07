import { computed } from 'vue'
import { useExportStore, useProjectStore, useTimelineStore } from '../stores'
import { ffmpeg } from '../utils/ffmpeg-wrapper'
import { blobToUrl } from '../utils/video-utils'

export function useExport() {
  const exportStore = useExportStore()
  const projectStore = useProjectStore()
  const timelineStore = useTimelineStore()

  const isExporting = computed(() => exportStore.isExporting)
  const currentJob = computed(() => exportStore.currentJob)
  const jobs = computed(() => exportStore.jobHistory)
  const progress = computed(() => exportStore.progress)

  // ============================================================
  // 导出入口
  // ============================================================

  async function startExport(settings) {
    try {
      exportStore.startExport(settings)

      // 接线 FFmpeg 进度
      ffmpeg.onProgress((pct) => {
        // 映射到 30-90 区间（前后留给 init 和 finalize）
        const mapped = 30 + Math.round(pct * 0.6)
        exportStore.updateProgress(mapped)
      })

      exportStore.updateProgress(10, '初始化 FFmpeg')
      await ffmpeg.init()

      const clips = collectClips()
      if (clips.length === 0) throw new Error('时间线上没有剪辑片段')

      exportStore.updateProgress(25, '裁剪片段')

      let finalBlob

      if (clips.length === 1) {
        const clip = clips[0]
        const video = projectStore.getVideo(clip.videoId)
        if (!video) throw new Error('视频素材不存在')

        const duration = clip.endTime - clip.startTime
        finalBlob = await ffmpeg.trimAndExport(
          video.source.url,
          clip.sourceStart || 0,
          duration,
          settings
        )
      } else {
        // 多片段：逐个裁剪 → 拼接 → 统一编码
        const segments = []
        const progressPerClip = 20 / clips.length

        for (let i = 0; i < clips.length; i++) {
          const clip = clips[i]
          const video = projectStore.getVideo(clip.videoId)
          if (!video) continue

          const duration = clip.endTime - clip.startTime
          const segmentBlob = await ffmpeg.trim(
            video.source.url,
            clip.sourceStart || 0,
            duration
          )

          const url = URL.createObjectURL(segmentBlob)
          segments.push({ url, duration })
          exportStore.updateProgress(25 + Math.round((i + 1) * progressPerClip),
            `裁剪片段 ${i + 1}/${clips.length}`)
        }

        if (segments.length === 0) throw new Error('没有可导出的片段')
        if (segments.length === 1) {
          finalBlob = await ffmpeg.export(segments[0].url, settings)
        } else {
          exportStore.updateProgress(50, '拼接片段')
          const mergedBlob = await ffmpeg.merge(segments)

          const mergedUrl = URL.createObjectURL(mergedBlob)
          exportStore.updateProgress(60, '最终编码')
          finalBlob = await ffmpeg.export(mergedUrl, settings)
          URL.revokeObjectURL(mergedUrl)
        }

        // 清理临时 URL
        segments.forEach(s => URL.revokeObjectURL(s.url))
      }

      exportStore.updateProgress(95, '生成文件')
      const outputUrl = blobToUrl(finalBlob)
      exportStore.completeExport(outputUrl)

      downloadFile(finalBlob, `导出_${Date.now()}`, settings.format || 'mp4')

      // 断开进度回调
      ffmpeg.onProgress(null)
    } catch (error) {
      exportStore.failExport(error.message)
      ffmpeg.onProgress(null)
      throw error
    }
  }

  function cancelExport() {
    exportStore.cancelExport()
  }

  // ============================================================
  // 工具
  // ============================================================

  function collectClips() {
    // 只收集视频轨上的 clip（音频轨由视频轨联动，不需要单独导出）
    const allClips = []
    timelineStore.tracks.forEach(track => {
      if (track.type !== 'video') return
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
    setTimeout(() => URL.revokeObjectURL(url), 60000)
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
    startExport,
    cancelExport,
    clearHistory,
    getDefaultSettings
  }
}