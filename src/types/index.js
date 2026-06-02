export type VideoSourceType = 'local' | 'url' | 'hls'

export type ExportFormat = 'mp4' | 'webm' | 'gif'

export type ExportStatus = 'idle' | 'preparing' | 'encoding' | 'complete' | 'error'

export type TrackType = 'video' | 'audio' | 'text'

export interface VideoMetadata {
  duration: number
  width: number
  height: number
  frameRate: number
  videoCodec: string
  audioCodec: string
  bitrate: number
}

export interface VideoSource {
  type: VideoSourceType
  url: string
  file?: File
}

export interface Video {
  id: string
  name: string
  source: VideoSource
  metadata: VideoMetadata
  thumbnail?: string
  addedAt: number
}

export interface ClipFilter {
  type: string
  params: Record<string, any>
  enabled: boolean
}

export interface Clip {
  id: string
  videoId: string
  startTime: number
  endTime: number
  trackIndex: number
  filters: ClipFilter[]
  volume: number
  speed: number
}

export interface Track {
  id: string
  type: TrackType
  name: string
  clips: Clip[]
  muted: boolean
  locked: boolean
  height: number
}

export interface Timeline {
  tracks: Track[]
  duration: number
  zoom: number
  scrollX: number
  scrollY: number
  playheadPosition: number
  selection: {
    clipIds: string[]
    trackId: string | null
  }
}

export interface Project {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  outputWidth: number
  outputHeight: number
  outputFrameRate: number
}

export interface ExportSettings {
  format: ExportFormat
  quality: 'low' | 'medium' | 'high' | 'original'
  resolution: {
    width: number
    height: number
  }
  startTime?: number
  endTime?: number
}

export interface ExportJob {
  id: string
  settings: ExportSettings
  status: ExportStatus
  progress: number
  currentStep: string
  outputUrl?: string
  error?: string
  startedAt?: number
  completedAt?: number
}

export interface PlayerState {
  currentTime: number
  duration: number
  isPlaying: boolean
  volume: number
  playbackRate: number
  isMuted: boolean
  buffered: number
}

export interface PlaybackMarker {
  id: string
  time: number
  label?: string
  color?: string
}

export interface HistoryState {
  timeline: Timeline
  timestamp: number
  description: string
}
