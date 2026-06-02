import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

function generateId() {
  return `export_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export const useExportStore = defineStore('export', () => {
  const currentJob = ref(null)
  const jobHistory = ref([])

  const isExporting = computed(() => {
    if (!currentJob.value) return false
    return ['preparing', 'encoding'].includes(currentJob.value.status)
  })

  const progress = computed(() => {
    return currentJob.value?.progress ?? 0
  })

  const status = computed(() => {
    return currentJob.value?.status ?? 'idle'
  })

  const error = computed(() => {
    return currentJob.value?.error ?? null
  })

  const outputUrl = computed(() => {
    return currentJob.value?.outputUrl ?? null
  })

  const canExport = computed(() => {
    return !isExporting.value
  })

  function createJob(settings) {
    if (currentJob.value && isExporting.value) {
      throw new Error('已有导出任务正在进行中')
    }

    const job = {
      id: generateId(),
      settings,
      status: 'idle',
      progress: 0,
      currentStep: '准备中'
    }

    currentJob.value = job
    return job
  }

  function startExport(settings) {
    const job = createJob(settings)
    job.status = 'preparing'
    job.startedAt = Date.now()
    job.currentStep = '初始化 FFmpeg'
    job.progress = 0
  }

  function updateProgress(progress, step) {
    if (!currentJob.value) return
    currentJob.value.progress = Math.max(0, Math.min(100, progress))
    if (step) {
      currentJob.value.currentStep = step
    }
  }

  function setStatus(status) {
    if (!currentJob.value) return
    currentJob.value.status = status

    if (status === 'encoding') {
      currentJob.value.currentStep = '编码中'
    }
  }

  function completeExport(outputUrl) {
    if (!currentJob.value) return
    currentJob.value.status = 'complete'
    currentJob.value.progress = 100
    currentJob.value.currentStep = '导出完成'
    currentJob.value.outputUrl = outputUrl
    currentJob.value.completedAt = Date.now()

    jobHistory.value.unshift({ ...currentJob.value })
  }

  function failExport(errorMessage) {
    if (!currentJob.value) return
    currentJob.value.status = 'error'
    currentJob.value.error = errorMessage
    currentJob.value.completedAt = Date.now()

    jobHistory.value.unshift({ ...currentJob.value })
  }

  function cancelExport() {
    if (!currentJob.value) return

    const cancelledJob = {
      ...currentJob.value,
      status: 'error',
      error: '用户取消导出',
      completedAt: Date.now()
    }

    jobHistory.value.unshift(cancelledJob)
    currentJob.value = null
  }

  function clearCurrentJob() {
    currentJob.value = null
  }

  function clearHistory() {
    jobHistory.value = []
  }

  function getDefaultSettings() {
    return {
      format: 'mp4',
      quality: 'high',
      resolution: {
        width: 1920,
        height: 1080
      }
    }
  }

  function reset() {
    currentJob.value = null
  }

  return {
    currentJob,
    jobHistory,
    isExporting,
    progress,
    status,
    error,
    outputUrl,
    canExport,
    createJob,
    startExport,
    updateProgress,
    setStatus,
    completeExport,
    failExport,
    cancelExport,
    clearCurrentJob,
    clearHistory,
    getDefaultSettings,
    reset
  }
})