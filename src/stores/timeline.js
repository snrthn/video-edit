import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

const MAX_HISTORY_SIZE = 50

export const useTimelineStore = defineStore('timeline', () => {
  const tracks = ref([
    {
      id: generateId('track'),
      type: 'video',
      name: '视频轨道 1',
      clips: [],
      muted: false,
      locked: false,
      height: 80
    },
    {
      id: generateId('track'),
      type: 'audio',
      name: '音频轨道 1',
      clips: [],
      muted: false,
      locked: false,
      height: 60
    }
  ])

  const duration = ref(0)
  const zoom = ref(1)
  const scrollX = ref(0)
  const scrollY = ref(0)
  const playheadPosition = ref(0)
  const selectedClipIds = ref([])
  const selectedTrackId = ref(null)
  const markers = ref([])
  const historyStack = ref([])
  const historyIndex = ref(-1)

  const allClips = computed(() => {
    return tracks.value.flatMap(track => track.clips)
  })

  const selectedClips = computed(() => {
    return allClips.value.filter(clip => selectedClipIds.value.includes(clip.id))
  })

  const selectedTrack = computed(() => {
    return tracks.value.find(track => track.id === selectedTrackId.value) || null
  })

  function saveToHistory(description) {
    const state = {
      timeline: {
        tracks: JSON.parse(JSON.stringify(tracks.value)),
        duration: duration.value,
        zoom: zoom.value,
        scrollX: scrollX.value,
        scrollY: scrollY.value,
        playheadPosition: playheadPosition.value,
        selection: {
          clipIds: [...selectedClipIds.value],
          trackId: selectedTrackId.value
        }
      },
      timestamp: Date.now(),
      description
    }

    if (historyIndex.value < historyStack.value.length - 1) {
      historyStack.value = historyStack.value.slice(0, historyIndex.value + 1)
    }

    historyStack.value.push(state)

    if (historyStack.value.length > MAX_HISTORY_SIZE) {
      historyStack.value.shift()
    } else {
      historyIndex.value++
    }
  }

  function undo() {
    if (historyIndex.value > 0) {
      historyIndex.value--
      restoreFromHistory(historyStack.value[historyIndex.value])
    }
  }

  function redo() {
    if (historyIndex.value < historyStack.value.length - 1) {
      historyIndex.value++
      restoreFromHistory(historyStack.value[historyIndex.value])
    }
  }

  function restoreFromHistory(state) {
    tracks.value = JSON.parse(JSON.stringify(state.timeline.tracks))
    duration.value = state.timeline.duration
    zoom.value = state.timeline.zoom
    scrollX.value = state.timeline.scrollX
    scrollY.value = state.timeline.scrollY
    playheadPosition.value = state.timeline.playheadPosition
    selectedClipIds.value = [...state.timeline.selection.clipIds]
    selectedTrackId.value = state.timeline.selection.trackId
  }

  function addTrack(type, name) {
    const trackCount = tracks.value.filter(t => t.type === type).length + 1
    const defaultName = type === 'video' ? `视频轨道 ${trackCount}` : type === 'audio' ? `音频轨道 ${trackCount}` : `字幕轨道 ${trackCount}`

    const track = {
      id: generateId('track'),
      type,
      name: name || defaultName,
      clips: [],
      muted: false,
      locked: false,
      height: type === 'video' ? 80 : 60
    }

    if (type === 'video') {
      const videoIndex = tracks.value.findIndex(t => t.type !== 'video')
      if (videoIndex === -1) {
        tracks.value.push(track)
      } else {
        tracks.value.splice(videoIndex, 0, track)
      }
    } else {
      tracks.value.push(track)
    }

    saveToHistory(`添加${defaultName}`)
    return track
  }

  function removeTrack(trackId) {
    const index = tracks.value.findIndex(t => t.id === trackId)
    if (index !== -1) {
      const trackName = tracks.value[index].name
      tracks.value.splice(index, 1)
      if (selectedTrackId.value === trackId) {
        selectedTrackId.value = null
      }
      saveToHistory(`删除${trackName}`)
    }
  }

  function addClip(trackId, videoId, startTime, endTime) {
    const track = tracks.value.find(t => t.id === trackId)
    if (!track || track.locked) return null

    const clip = {
      id: generateId('clip'),
      videoId,
      startTime,
      endTime,
      trackIndex: tracks.value.indexOf(track),
      filters: [],
      volume: 1,
      speed: 1
    }

    track.clips.push(clip)
    track.clips.sort((a, b) => a.startTime - b.startTime)
    updateDuration()
    saveToHistory('添加剪辑片段')

    return clip
  }

  function removeClip(clipId) {
    for (const track of tracks.value) {
      const index = track.clips.findIndex(c => c.id === clipId)
      if (index !== -1) {
        track.clips.splice(index, 1)
        selectedClipIds.value = selectedClipIds.value.filter(id => id !== clipId)
        updateDuration()
        saveToHistory('删除剪辑片段')
        return
      }
    }
  }

  function updateClip(clipId, updates) {
    for (const track of tracks.value) {
      const clip = track.clips.find(c => c.id === clipId)
      if (clip) {
        Object.assign(clip, updates)
        track.clips.sort((a, b) => a.startTime - b.startTime)
        updateDuration()
        return
      }
    }
  }

  function splitClip(clipId, splitTime) {
    const clip = allClips.value.find(c => c.id === clipId)
    if (!clip) return

    const track = tracks.value.find(t => t.clips.some(c => c.id === clipId))
    if (!track || track.locked) return

    const originalEnd = clip.endTime
    clip.endTime = splitTime

    const newClip = {
      ...JSON.parse(JSON.stringify(clip)),
      id: generateId('clip'),
      startTime: splitTime,
      endTime: originalEnd
    }

    track.clips.push(newClip)
    track.clips.sort((a, b) => a.startTime - b.startTime)
    saveToHistory('分割剪辑片段')
  }

  function moveClip(clipId, targetTrackId, newStartTime) {
    const clip = allClips.value.find(c => c.id === clipId)
    if (!clip) return

    const sourceTrack = tracks.value.find(t => t.clips.some(c => c.id === clipId))
    const targetTrack = tracks.value.find(t => t.id === targetTrackId)

    if (!sourceTrack || !targetTrack || targetTrack.locked) return
    if (sourceTrack.type !== targetTrack.type) return

    const clipIndex = sourceTrack.clips.findIndex(c => c.id === clipId)
    sourceTrack.clips.splice(clipIndex, 1)

    clip.trackIndex = tracks.value.indexOf(targetTrack)
    clip.startTime = Math.max(0, newStartTime)
    clip.endTime = clip.startTime + (clip.endTime - clip.startTime)

    targetTrack.clips.push(clip)
    targetTrack.clips.sort((a, b) => a.startTime - b.startTime)
    updateDuration()
    saveToHistory('移动剪辑片段')
  }

  function addFilterToClip(clipId, filter) {
    const clip = allClips.value.find(c => c.id === clipId)
    if (clip) {
      clip.filters.push({ ...filter })
      saveToHistory('添加滤镜')
    }
  }

  function removeFilterFromClip(clipId, filterIndex) {
    const clip = allClips.value.find(c => c.id === clipId)
    if (clip) {
      clip.filters.splice(filterIndex, 1)
      saveToHistory('移除滤镜')
    }
  }

  function setClipSpeed(clipId, speed) {
    const clip = allClips.value.find(c => c.id === clipId)
    if (clip) {
      clip.speed = speed
      saveToHistory('调整播放速度')
    }
  }

  function setClipVolume(clipId, volume) {
    const clip = allClips.value.find(c => c.id === clipId)
    if (clip) {
      clip.volume = Math.max(0, Math.min(2, volume))
    }
  }

  function selectClips(clipIds) {
    selectedClipIds.value = clipIds
  }

  function clearClipSelection() {
    selectedClipIds.value = []
  }

  function selectTrack(trackId) {
    selectedTrackId.value = trackId
  }

  function setZoom(newZoom) {
    zoom.value = Math.max(0.1, Math.min(10, newZoom))
  }

  function setScroll(x, y) {
    scrollX.value = Math.max(0, x)
    scrollY.value = Math.max(0, y)
  }

  function setPlayheadPosition(time) {
    playheadPosition.value = Math.max(0, time)
  }

  function addMarker(time, label, color) {
    markers.value.push({
      id: generateId('marker'),
      time,
      label,
      color
    })
    markers.value.sort((a, b) => a.time - b.time)
  }

  function removeMarker(markerId) {
    const index = markers.value.findIndex(m => m.id === markerId)
    if (index !== -1) {
      markers.value.splice(index, 1)
    }
  }

  function updateDuration() {
    let maxEnd = 0
    for (const track of tracks.value) {
      for (const clip of track.clips) {
        maxEnd = Math.max(maxEnd, clip.endTime)
      }
    }
    duration.value = maxEnd
  }

  function resetTimeline() {
    tracks.value = [
      {
        id: generateId('track'),
        type: 'video',
        name: '视频轨道 1',
        clips: [],
        muted: false,
        locked: false,
        height: 80
      },
      {
        id: generateId('track'),
        type: 'audio',
        name: '音频轨道 1',
        clips: [],
        muted: false,
        locked: false,
        height: 60
      }
    ]
    duration.value = 0
    zoom.value = 1
    scrollX.value = 0
    scrollY.value = 0
    playheadPosition.value = 0
    selectedClipIds.value = []
    selectedTrackId.value = null
    markers.value = []
    historyStack.value = []
    historyIndex.value = -1
    saveToHistory('重置时间轴')
  }

  return {
    tracks,
    duration,
    zoom,
    scrollX,
    scrollY,
    playheadPosition,
    selectedClipIds,
    selectedTrackId,
    markers,
    historyStack,
    historyIndex,
    allClips,
    selectedClips,
    selectedTrack,
    saveToHistory,
    undo,
    redo,
    addTrack,
    removeTrack,
    addClip,
    removeClip,
    updateClip,
    splitClip,
    moveClip,
    addFilterToClip,
    removeFilterFromClip,
    setClipSpeed,
    setClipVolume,
    selectClips,
    clearClipSelection,
    selectTrack,
    setZoom,
    setScroll,
    setPlayheadPosition,
    addMarker,
    removeMarker,
    updateDuration,
    resetTimeline
  }
})