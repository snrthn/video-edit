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
          db.createObjectStore('timelines', { keyPath: 'projectId' })
        }
        if (!db.objectStoreNames.contains('videoData')) {
          db.createObjectStore('videoData', { keyPath: 'videoId' })
        }
      }
    })
  }

  async close() {
    if (this.db) { this.db.close(); this.db = null }
  }

  async ensureOpen() {
    if (!this.db) await this.open()
  }

  serializeData(data) {
    return JSON.parse(JSON.stringify(data, (key, value) => {
      if (value instanceof Blob) return undefined
      if (value instanceof File) return undefined
      if (typeof value === 'function') return undefined
      return value
    }))
  }

  // === Projects ===

  async addProject(project) {
    await this.ensureOpen()
    const clean = this.serializeData(project)
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['projects'], 'readwrite')
      const req = tx.objectStore('projects').put(clean)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  async getProject(projectId) {
    await this.ensureOpen()
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['projects'], 'readonly')
      const req = tx.objectStore('projects').get(projectId)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  async getAllProjects() {
    await this.ensureOpen()
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['projects'], 'readonly')
      const req = tx.objectStore('projects').getAll()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  async deleteProject(projectId) {
    await this.ensureOpen()
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['projects', 'videos', 'timelines', 'videoData'], 'readwrite')
      const ps = tx.objectStore('projects')
      const vs = tx.objectStore('videos')
      const ts = tx.objectStore('timelines')
      const vd = tx.objectStore('videoData')

      ps.delete(projectId)
      ts.delete(projectId)

      const vr = vs.index('projectId').getAll(projectId)
      vr.onsuccess = (e) => e.target.result.forEach(v => vd.delete(v.id))

      vs.index('projectId').openCursor(projectId).onsuccess = (e) => {
        const cursor = e.target.result
        if (cursor) { cursor.delete(); cursor.continue() }
      }

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  // === Videos ===

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

    const clean = this.serializeData(videoCopy)
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['videos'], 'readwrite')
      const req = tx.objectStore('videos').put(clean)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  async getVideosByProject(projectId) {
    await this.ensureOpen()
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['videos'], 'readonly')
      const req = tx.objectStore('videos').index('projectId').getAll(projectId)
      req.onsuccess = async (e) => {
        const videos = e.target.result || []
        resolve(await Promise.all(videos.map(v => this.restoreVideoBlob(v))))
      }
      req.onerror = () => reject(req.error)
    })
  }

  async deleteVideo(videoId) {
    await this.ensureOpen()
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['videos', 'videoData'], 'readwrite')
      tx.objectStore('videos').delete(videoId)
      tx.objectStore('videoData').delete(videoId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  // === Video Blobs ==

  async saveVideoBlob(videoId, blob) {
    await this.ensureOpen()
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['videoData'], 'readwrite')
      const req = tx.objectStore('videoData').put({ videoId, blob })
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  async getVideoBlob(videoId) {
    await this.ensureOpen()
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['videoData'], 'readonly')
      const req = tx.objectStore('videoData').get(videoId)
      req.onsuccess = () => resolve(req.result?.blob ?? null)
      req.onerror = () => reject(req.error)
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

  // === Timeline ===

  async saveTimeline(projectId, timelineData) {
    await this.ensureOpen()
    const clean = this.serializeData(timelineData)
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['timelines'], 'readwrite')
      const req = tx.objectStore('timelines').put({ projectId, ...clean })
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  async getTimeline(projectId) {
    await this.ensureOpen()
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['timelines'], 'readonly')
      const req = tx.objectStore('timelines').get(projectId)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
}

export const storage = new VideoEditStorage()

// === Store <-> DB 同步 ===

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
        const { projectId, ...v } = video
        projectStore.videos.set(v.id, v)
      })

      const timeline = await storage.getTimeline(latestProject.id)
      if (timeline) {
        timelineStore.setTracksFromDB(timeline.tracks)
        timelineStore.playheadPosition = timeline.playheadPosition || 0
        if (timeline.zoom) timelineStore.setZoom(timeline.zoom)
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
      tracks: timelineStore.getCleanTracks(),
      playheadPosition: timelineStore.playheadPosition,
      zoom: timelineStore.zoom
    })
  } catch (error) {
    console.warn('Failed to sync DB with store:', error)
    throw error
  }
}
