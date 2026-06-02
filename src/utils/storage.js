class VideoEditStorage {
  constructor() {
    this.dbName = 'VideoEditDB'
    this.dbVersion = 3
    this.db = null
  }

  async open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion)

      request.onerror = () => reject(request.error)

      request.onsuccess = () => {
        this.db = request.result
        resolve(this.db)
      }

      request.onupgradeneeded = (event) => {
        const db = event.target.result

        if (!db.objectStoreNames.contains('projects')) {
          const projectStore = db.createObjectStore('projects', { keyPath: 'id' })
          projectStore.createIndex('updatedAt', 'updatedAt', { unique: false })
        }

        if (!db.objectStoreNames.contains('videos')) {
          const videoStore = db.createObjectStore('videos', { keyPath: 'id' })
          videoStore.createIndex('projectId', 'projectId', { unique: false })
          videoStore.createIndex('addedAt', 'addedAt', { unique: false })
        }

        if (!db.objectStoreNames.contains('timelines')) {
          const timelineStore = db.createObjectStore('timelines', { keyPath: 'projectId' })
        }

        if (!db.objectStoreNames.contains('videoData')) {
          const videoDataStore = db.createObjectStore('videoData', { keyPath: 'videoId' })
        }
      }
    })
  }

  async close() {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  serializeData(data) {
    return JSON.parse(JSON.stringify(data, (key, value) => {
      if (value instanceof Blob) {
        return undefined
      }
      if (value instanceof File) {
        return undefined
      }
      if (typeof value === 'function') {
        return undefined
      }
      return value
    }))
  }

  async addProject(project) {
    await this.ensureOpen()
    const cleanProject = this.serializeData(project)

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['projects'], 'readwrite')
      const store = transaction.objectStore('projects')
      const request = store.put(cleanProject)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async getProject(projectId) {
    await this.ensureOpen()
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['projects'], 'readonly')
      const store = transaction.objectStore('projects')
      const request = store.get(projectId)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async getAllProjects() {
    await this.ensureOpen()
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['projects'], 'readonly')
      const store = transaction.objectStore('projects')
      const request = store.getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async deleteProject(projectId) {
    await this.ensureOpen()
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['projects', 'videos', 'timelines', 'videoData'], 'readwrite')
      const projectStore = transaction.objectStore('projects')
      const videoStore = transaction.objectStore('videos')
      const timelineStore = transaction.objectStore('timelines')
      const videoDataStore = transaction.objectStore('videoData')

      projectStore.delete(projectId)

      const videoRequest = videoStore.index('projectId').getAll(projectId)
      videoRequest.onsuccess = (event) => {
        event.target.result.forEach(video => {
          videoDataStore.delete(video.id)
        })
      }

      videoStore.index('projectId').openCursor(projectId).onsuccess = (event) => {
        const cursor = event.target.result
        if (cursor) {
          cursor.delete()
          cursor.continue()
        }
      }

      timelineStore.delete(projectId)

      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  }

  async addVideo(video, projectId) {
    await this.ensureOpen()

    const videoCopy = { ...video, projectId }
    const blobToSave = video.source?.blob

    if (blobToSave instanceof Blob) {
      await this.saveVideoBlob(video.id, blobToSave)
      videoCopy.source = { ...video.source }
      delete videoCopy.source.blob
      delete videoCopy.source.url
    }

    const cleanVideo = this.serializeData(videoCopy)

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['videos'], 'readwrite')
      const store = transaction.objectStore('videos')
      const request = store.put(cleanVideo)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async getVideosByProject(projectId) {
    await this.ensureOpen()
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['videos'], 'readonly')
      const store = transaction.objectStore('videos')
      const index = store.index('projectId')
      const request = index.getAll(projectId)
      request.onsuccess = async (event) => {
        const videos = event.target.result || []
        const loadedVideos = await Promise.all(videos.map(video => this.restoreVideoBlob(video)))
        resolve(loadedVideos)
      }
      request.onerror = () => reject(request.error)
    })
  }

  async deleteVideo(videoId) {
    await this.ensureOpen()
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['videos', 'videoData'], 'readwrite')
      const videoStore = transaction.objectStore('videos')
      const videoDataStore = transaction.objectStore('videoData')

      videoStore.delete(videoId)
      videoDataStore.delete(videoId)

      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  }

  async saveVideoBlob(videoId, blob) {
    await this.ensureOpen()
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['videoData'], 'readwrite')
      const store = transaction.objectStore('videoData')
      const request = store.put({ videoId, blob })
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getVideoBlob(videoId) {
    await this.ensureOpen()
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['videoData'], 'readonly')
      const store = transaction.objectStore('videoData')
      const request = store.get(videoId)
      request.onsuccess = () => {
        const data = request.result
        resolve(data ? data.blob : null)
      }
      request.onerror = () => reject(request.error)
    })
  }

  async restoreVideoBlob(video) {
    if (video.source && !video.source.url) {
      const blob = await this.getVideoBlob(video.id)
      if (blob) {
        video.source = video.source || {}
        video.source.url = URL.createObjectURL(blob)
        video.source.blob = blob
      }
    }
    return video
  }

  async saveTimeline(projectId, timelineData) {
    await this.ensureOpen()
    const cleanData = this.serializeData(timelineData)

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['timelines'], 'readwrite')
      const store = transaction.objectStore('timelines')
      const request = store.put({ projectId, ...cleanData })
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async getTimeline(projectId) {
    await this.ensureOpen()
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['timelines'], 'readonly')
      const store = transaction.objectStore('timelines')
      const request = store.get(projectId)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async ensureOpen() {
    if (!this.db) {
      await this.open()
    }
  }
}

export const storage = new VideoEditStorage()

export async function syncStoreWithDB(projectStore, timelineStore) {
  try {
    const projects = await storage.getAllProjects()

    if (projects.length > 0) {
      const latestProject = projects.reduce((latest, p) =>
        p.updatedAt > latest.updatedAt ? p : latest
      )

      projectStore.project = { ...latestProject }

      const videos = await storage.getVideosByProject(latestProject.id)
      videos.forEach(video => {
        const { projectId, ...videoWithoutProject } = video
        projectStore.videos.set(video.id, videoWithoutProject)
      })

      const timeline = await storage.getTimeline(latestProject.id)
      if (timeline) {
        timelineStore.tracks = timeline.tracks ? JSON.parse(JSON.stringify(timeline.tracks)) : []
        timelineStore.playheadPosition = 0
        timelineStore.zoom = timeline.zoom || 100
      }
    }
  } catch (error) {
    console.warn('Failed to sync store with DB:', error)
  }
}

export async function syncDBWithStore(projectStore, timelineStore) {
  try {
    await storage.addProject(projectStore.project)

    const videoList = projectStore.videoList
    const currentVideoIds = new Set(videoList.map(v => v.id))

    const dbVideos = await storage.getVideosByProject(projectStore.project.id)
    for (const dbVideo of dbVideos) {
      if (!currentVideoIds.has(dbVideo.id)) {
        await storage.deleteVideo(dbVideo.id)
      }
    }

    for (const video of videoList) {
      await storage.addVideo(video, projectStore.project.id)
    }

    await storage.saveTimeline(projectStore.project.id, {
      tracks: timelineStore.tracks,
      playheadPosition: timelineStore.playheadPosition,
      zoom: timelineStore.zoom
    })
  } catch (error) {
    console.warn('Failed to sync DB with store:', error)
    throw error
  }
}
