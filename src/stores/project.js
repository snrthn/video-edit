import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

function generateId() {
  return `video_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export const useProjectStore = defineStore('project', () => {
  const project = ref({
    id: generateId(),
    name: '未命名项目',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    outputWidth: 1920,
    outputHeight: 1080,
    outputFrameRate: 30
  })

  const videos = ref(new Map())

  const videoList = computed(() => Array.from(videos.value.values()))

  const selectedVideoId = ref(null)

  const selectedVideo = computed(() =>
    selectedVideoId.value ? videos.value.get(selectedVideoId.value) : null
  )

  function setProjectName(name) {
    project.value.name = name
    project.value.updatedAt = Date.now()
  }

  function setOutputSettings(settings) {
    if (settings.outputWidth !== undefined) project.value.outputWidth = settings.outputWidth
    if (settings.outputHeight !== undefined) project.value.outputHeight = settings.outputHeight
    if (settings.outputFrameRate !== undefined) project.value.outputFrameRate = settings.outputFrameRate
    project.value.updatedAt = Date.now()
  }

  function addVideo(video) {
    const id = generateId()
    const newVideo = {
      ...video,
      id,
      addedAt: Date.now()
    }
    videos.value.set(id, newVideo)
    project.value.updatedAt = Date.now()
    return newVideo
  }

  function addVideoFromSource(source, name, metadata) {
    return addVideo({
      name,
      source,
      metadata,
      thumbnail: undefined
    })
  }

  function removeVideo(videoId) {
    videos.value.delete(videoId)
    if (selectedVideoId.value === videoId) {
      selectedVideoId.value = null
    }
    project.value.updatedAt = Date.now()
  }

  function getVideo(videoId) {
    return videos.value.get(videoId)
  }

  function selectVideo(videoId) {
    selectedVideoId.value = videoId
  }

  function updateVideo(videoId, updates) {
    const video = videos.value.get(videoId)
    if (video) {
      Object.assign(video, updates)
      project.value.updatedAt = Date.now()
    }
  }

  function resetProject() {
    project.value = {
      id: generateId(),
      name: '未命名项目',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      outputWidth: 1920,
      outputHeight: 1080,
      outputFrameRate: 30
    }
    videos.value.clear()
    selectedVideoId.value = null
  }

  return {
    project,
    videos,
    videoList,
    selectedVideoId,
    selectedVideo,
    setProjectName,
    setOutputSettings,
    addVideo,
    addVideoFromSource,
    removeVideo,
    getVideo,
    selectVideo,
    updateVideo,
    resetProject
  }
})