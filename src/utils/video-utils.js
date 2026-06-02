export function getProxyUrl(originalUrl) {
  try {
    const url = new URL(originalUrl)
    if (url.hostname === 'aigccdn.hzaiyue.com') {
      return `/video-proxy${url.pathname}`
    }
    return originalUrl
  } catch {
    return originalUrl
  }
}

export async function getVideoMetadata(videoUrl) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.preload = 'metadata'

    video.onloadedmetadata = () => {
      resolve({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
        frameRate: video.videoTracks?.[0]?.frameRate || 30
      })
      video.remove()
    }

    video.onerror = (error) => {
      reject(new Error(`Failed to load video metadata: ${error.message}`))
      video.remove()
    }

    video.src = videoUrl
  })
}

export async function generateThumbnail(videoUrl, time = 0) {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.preload = 'auto'
    video.currentTime = time

    const timeoutId = setTimeout(() => {
      resolve(getDefaultThumbnail())
      video.remove()
    }, 10000)

    video.onloadeddata = () => {
      try {
        const canvas = document.createElement('canvas')
        const videoWidth = video.videoWidth || 640
        const videoHeight = video.videoHeight || 360
        const aspectRatio = videoWidth / videoHeight

        if (aspectRatio >= 1) {
          canvas.width = 320
          canvas.height = 320 / aspectRatio
        } else {
          canvas.height = 180
          canvas.width = 180 * aspectRatio
        }

        const ctx = canvas.getContext('2d')
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const thumbnail = canvas.toDataURL('image/jpeg', 0.8)

        clearTimeout(timeoutId)
        resolve(thumbnail)
        video.remove()
        canvas.remove()
      } catch (error) {
        clearTimeout(timeoutId)
        resolve(getDefaultThumbnail())
        video.remove()
      }
    }

    video.onerror = () => {
      clearTimeout(timeoutId)
      resolve(getDefaultThumbnail())
      video.remove()
    }

    video.src = videoUrl
  })
}

function getDefaultThumbnail() {
  const canvas = document.createElement('canvas')
  canvas.width = 320
  canvas.height = 180
  const ctx = canvas.getContext('2d')

  const gradient = ctx.createLinearGradient(0, 0, 320, 180)
  gradient.addColorStop(0, '#1a1a2e')
  gradient.addColorStop(1, '#0f3460')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 320, 180)

  ctx.fillStyle = '#e94560'
  ctx.font = '48px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('▶', 160, 90)

  const thumbnail = canvas.toDataURL('image/jpeg', 0.8)
  canvas.remove()
  return thumbnail
}

export async function getVideoFrames(videoUrl, frameCount = 10) {
  try {
    const metadata = await getVideoMetadata(videoUrl)
    const thumbnails = []

    for (let i = 0; i < frameCount; i++) {
      const time = (metadata.duration / frameCount) * i
      const thumbnail = await generateThumbnail(videoUrl, time)
      thumbnails.push({ time, thumbnail })
    }

    return thumbnails
  } catch {
    return []
  }
}

export function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00:00'

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

export function parseDuration(timeStr) {
  const parts = timeStr.split(':').reverse()
  let seconds = 0

  if (parts[0]) seconds += parseInt(parts[0]) || 0
  if (parts[1]) seconds += (parseInt(parts[1]) || 0) * 60
  if (parts[2]) seconds += (parseInt(parts[2]) || 0) * 3600

  return seconds
}

export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function calculateAspectRatio(width, height) {
  const gcd = (a, b) => b === 0 ? a : gcd(b, a % b)
  const ratio = gcd(width, height)
  return `${width / ratio}:${height / ratio}`
}

export function resizeCanvas(canvas, maxWidth, maxHeight) {
  let { width, height } = canvas

  if (width > maxWidth) {
    height = (height * maxWidth) / width
    width = maxWidth
  }

  if (height > maxHeight) {
    width = (width * maxHeight) / height
    height = maxHeight
  }

  const newCanvas = document.createElement('canvas')
  newCanvas.width = width
  newCanvas.height = height

  const ctx = newCanvas.getContext('2d')
  ctx.drawImage(canvas, 0, 0, width, height)

  return newCanvas
}

export async function fetchBlob(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.status}`)
  }
  return await response.blob()
}

export function blobToUrl(blob) {
  return URL.createObjectURL(blob)
}

export function revokeUrl(url) {
  URL.revokeObjectURL(url)
}
