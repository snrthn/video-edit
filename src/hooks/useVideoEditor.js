import { computed } from 'vue'
import { useTimelineStore, useProjectStore } from '../stores'
import { generateId } from '../utils/video-utils'
import { triggerSave } from '../main'
import { NEW_CLIP_DEFAULT_DURATION, CLIP_DUPLICATE_GAP } from '../core/constants'

export function useVideoEditor() {
  const timelineStore = useTimelineStore()
  const projectStore = useProjectStore()

  const selectedTrack = computed(() =>
    timelineStore.tracks.find(t => t.id === timelineStore.selectedTrackId)
  )

  const selectedClips = computed(() => {
    return timelineStore.selectedClipIds
      .map(id => timelineStore.findClipById(id)?.clip)
      .filter(Boolean)
  })

  // ===================== 轨道 =====================

  function addTrack(type = 'video') {
    const track = timelineStore.addTrack(type)
    triggerSave()
    return track
  }

  function removeTrack(trackId) {
    timelineStore.removeTrack(trackId)
    triggerSave()
  }

  function toggleMuteTrack(trackId) {
    timelineStore.toggleTrackMute(trackId)
    triggerSave()
  }

  // ===================== Clip CRUD =====================

  function addClip(videoId, trackId, startTime = 0) {
    const video = projectStore.getVideo(videoId)
    if (!video) return null

    const endTime = startTime + (video.metadata?.duration || NEW_CLIP_DEFAULT_DURATION)
    const clip = timelineStore.addClip(trackId, videoId, startTime, endTime)
    triggerSave()
    return clip
  }

  function removeClip(clipId) {
    timelineStore.removeClip(clipId)
    triggerSave()
  }

  function moveClip(clipId, targetTrackId, newStartTime) {
    timelineStore.moveClip(clipId, targetTrackId, newStartTime)
    triggerSave()
  }

  function splitClip(clipId, time) {
    const found = timelineStore.findClipById(clipId)
    if (!found) return null
    const { clip } = found
    if (time <= clip.startTime || time >= clip.endTime) return null

    timelineStore.splitClip(clipId, time)
    triggerSave()

    // 返回新创建的 clip
    const newClips = found.track.clips.filter(c => c.id !== clipId)
    return newClips[newClips.length - 1] || null
  }

  function trimClip(clipId, newStart, newEnd) {
    // trim 操作：调整 clip 的 startTime/endTime（时间轴上的位置）
    const found = timelineStore.findClipById(clipId)
    if (!found) return false

    const video = projectStore.getVideo(found.clip.videoId)
    const maxEnd = video?.metadata?.duration || 100

    const startTime = Math.max(0, newStart)
    const endTime = Math.min(maxEnd, Math.max(startTime + 0.1, newEnd))

    timelineStore.updateClip(clipId, { startTime, endTime })
    triggerSave()
    return true
  }

  function duplicateClip(clipId) {
    const found = timelineStore.findClipById(clipId)
    if (!found) return null
    const { clip, track } = found

    const duration = clip.endTime - clip.startTime
    const newStart = clip.endTime + CLIP_DUPLICATE_GAP

    const newClip = timelineStore.addClip(
      track.id,
      clip.videoId,
      newStart,
      newStart + duration
    )

    if (newClip) {
      // 复制滤镜、音量、速度
      timelineStore.updateClip(newClip.id, {
        filters: JSON.parse(JSON.stringify(clip.filters)),
        volume: clip.volume,
        speed: clip.speed,
        sourceStart: clip.sourceStart
      })
    }
    triggerSave()
    return newClip
  }

  // ===================== 滤镜 =====================

  function addFilter(clipId, filterType, params = {}) {
    const found = timelineStore.findClipById(clipId)
    if (!found) return false

    const filter = {
      id: generateId('filter'),
      type: filterType,
      params
    }
    timelineStore.addFilterToClip(clipId, filter)
    triggerSave()
    return filter
  }

  function removeFilter(clipId, filterId) {
    const found = timelineStore.findClipById(clipId)
    if (!found) return false
    const index = found.clip.filters.findIndex(f => f.id === filterId)
    if (index === -1) return false
    timelineStore.removeFilterFromClip(clipId, index)
    triggerSave()
    return true
  }

  function updateFilter(clipId, filterId, params) {
    const found = timelineStore.findClipById(clipId)
    if (!found) return false

    const filter = found.clip.filters.find(f => f.id === filterId)
    if (!filter) return false

    filter.params = { ...filter.params, ...params }
    triggerSave()
    return true
  }

  // ===================== 属性 =====================

  function setClipVolume(clipId, volume) {
    timelineStore.updateClip(clipId, {
      volume: Math.max(0, Math.min(1, volume))
    })
    triggerSave()
    return true
  }

  function setClipSpeed(clipId, speed) {
    timelineStore.updateClip(clipId, {
      speed: Math.max(0.1, Math.min(4, speed))
    })
    triggerSave()
    return true
  }

  // ===================== 选择 =====================

  function selectClip(clipId, multiSelect = false) {
    if (multiSelect) {
      const currentSelected = [...timelineStore.selectedClipIds]
      if (currentSelected.includes(clipId)) {
        timelineStore.selectClips(currentSelected.filter(id => id !== clipId))
      } else {
        timelineStore.selectClips([...currentSelected, clipId])
      }
    } else {
      timelineStore.selectClips([clipId])
    }
  }

  function selectTrack(trackId) {
    timelineStore.selectTrack(trackId)
  }

  function clearSelection() {
    timelineStore.selectClips([])
    timelineStore.selectTrack(null)
  }

  // ===================== 历史 =====================

  function undo() {
    const result = timelineStore.undo()
    if (result) triggerSave()
    return result
  }

  function redo() {
    const result = timelineStore.redo()
    if (result) triggerSave()
    return result
  }

  return {
    selectedTrack,
    selectedClips,

    addTrack,
    removeTrack,
    toggleMuteTrack,

    addClip,
    removeClip,
    moveClip,
    splitClip,
    trimClip,
    duplicateClip,

    addFilter,
    removeFilter,
    updateFilter,

    setClipVolume,
    setClipSpeed,

    selectClip,
    selectTrack,
    clearSelection,

    undo,
    redo
  }
}