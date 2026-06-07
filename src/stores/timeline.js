import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { engine } from '../core/timeline-engine'
import { HistoryManager } from '../core/history'
import { BASE_PPS, MAX_HISTORY_SIZE } from '../core/constants'

function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

const history = new HistoryManager(MAX_HISTORY_SIZE)

export const useTimelineStore = defineStore('timeline', () => {
  // === 轨道 ===
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

  // === 状态 ===
  const playheadPosition = ref(0)
  const duration = ref(0)

  // zoom 同步到 engine，只在 store 里存 displayZoom
  const zoom = ref(1)

  const selectedClipIds = ref([])
  const selectedTrackId = ref(null)
  const markers = ref([])

  // === 计算属性 ===
  const allClips = computed(() => {
    return tracks.value.flatMap(track =>
      track.clips.map(c => ({ ...c, trackId: track.id }))
    )
  })

  const selectedClips = computed(() => {
    return allClips.value.filter(clip => selectedClipIds.value.includes(clip.id))
  })

  const selectedTrack = computed(() => {
    return tracks.value.find(track => track.id === selectedTrackId.value) || null
  })

  const canUndo = computed(() => history.canUndo)
  const canRedo = computed(() => history.canRedo)

  // === 私有工具 ===

  function findClipById(clipId) {
    for (const track of tracks.value) {
      const clip = track.clips.find(c => c.id === clipId)
      if (clip) return { clip, track }
    }
    return null
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

  // === 新建 clip 的默认值 ===
  function makeClip(videoId, startTime, endTime, trackId) {
    const track = tracks.value.find(t => t.id === trackId)
    return {
      id: generateId('clip'),
      videoId,
      startTime: +startTime.toFixed(4),
      endTime: +(endTime).toFixed(4),
      sourceStart: 0,
      trackIndex: track ? tracks.value.indexOf(track) : 0,
      linkedClipId: null,
      filters: [],
      volume: 1,
      speed: 1
    }
  }

  // === 历史 (命令模式) ===
  function saveCommand(description, data, inverse) {
    history.push({ type: description, data, inverse })
  }

  function undo() {
    const cmd = history.undo()
    if (!cmd) return false
    applyCommand(cmd)
    return true
  }

  function redo() {
    const cmd = history.redo()
    if (!cmd) return false
    applyCommand(cmd)
    return true
  }

  function applyCommand(cmd) {
    if (!cmd) return
    if (cmd.tracks) {
      tracks.value = JSON.parse(JSON.stringify(cmd.tracks))
    }
    if (cmd.selectedClipIds !== undefined) selectedClipIds.value = [...cmd.selectedClipIds]
    if (cmd.selectedTrackId !== undefined) selectedTrackId.value = cmd.selectedTrackId
    if (cmd.playheadPosition !== undefined) playheadPosition.value = cmd.playheadPosition
    updateDuration()
  }

  // === 轨道操作 ===
  function addTrack(type, name) {
    const trackCount = tracks.value.filter(t => t.type === type).length + 1
    const defaultName = type === 'video'
      ? `视频轨道 ${trackCount}`
      : type === 'audio' ? `音频轨道 ${trackCount}` : `字幕轨道 ${trackCount}`

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

    saveCommand(`添加${defaultName}`, {}, {
      tracks: JSON.parse(JSON.stringify(tracks.value)),
      selectedClipIds: [...selectedClipIds.value],
      selectedTrackId: selectedTrackId.value,
      playheadPosition: playheadPosition.value
    })
    updateDuration()
    return track
  }

  function removeTrack(trackId) {
    const index = tracks.value.findIndex(t => t.id === trackId)
    if (index === -1) return
    const snapshot = {
      tracks: JSON.parse(JSON.stringify(tracks.value)),
      selectedClipIds: [...selectedClipIds.value],
      selectedTrackId: selectedTrackId.value,
      playheadPosition: playheadPosition.value
    }
    tracks.value.splice(index, 1)
    if (selectedTrackId.value === trackId) {
      selectedTrackId.value = null
    }
    saveCommand(`删除轨道`, {},
      { tracks: JSON.parse(JSON.stringify(snapshot.tracks)), selectedClipIds: snapshot.selectedClipIds, selectedTrackId: snapshot.selectedTrackId, playheadPosition: snapshot.playheadPosition }
    )
    updateDuration()
  }

  // === Clip 操作 ===
  function addClip(trackId, videoId, startTime, endTime) {
    const track = tracks.value.find(t => t.id === trackId)
    if (!track || track.locked) return null

    const clip = makeClip(videoId, startTime, endTime, trackId)
    track.clips.push(clip)
    track.clips.sort((a, b) => a.startTime - b.startTime)

    // Premiere Pro 模式：视频轨添加 clip 时自动创建关联音频 clip
    if (track.type === 'video') {
      const audioClip = _createLinkedAudioClip(clip)
      if (audioClip) {
        clip.linkedClipId = audioClip.id
        audioClip.linkedClipId = clip.id
      }
    }

    updateDuration()

    saveCommand('添加剪辑片段',
      { clipId: clip.id, trackId, videoId, startTime, endTime },
      { tracks: JSON.parse(JSON.stringify(tracks.value)), selectedClipIds: [...selectedClipIds.value], selectedTrackId: selectedTrackId.value, playheadPosition: playheadPosition.value }
    )
    return clip
  }

  // 内部：创建关联音频 clip
  function _createLinkedAudioClip(videoClip) {
    let audioTrack = tracks.value.find(t => t.type === 'audio')
    if (!audioTrack) {
      audioTrack = addTrack('audio', '音频轨道 1')
    }
    if (!audioTrack) return null

    const audioClip = makeClip(videoClip.videoId, videoClip.startTime, videoClip.endTime, audioTrack.id)
    audioTrack.clips.push(audioClip)
    audioTrack.clips.sort((a, b) => a.startTime - b.startTime)
    return audioClip
  }

  function removeClip(clipId) {
    const found = findClipById(clipId)
    if (!found) return

    const { clip, track } = found

    // Premiere Pro 模式：同时删除关联的 linked clip
    if (clip.linkedClipId) {
      _removeClipSilent(clip.linkedClipId)
    }

    const index = track.clips.indexOf(clip)
    track.clips.splice(index, 1)
    selectedClipIds.value = selectedClipIds.value.filter(id => id !== clipId)
    updateDuration()

    saveCommand('删除剪辑片段',
      {},
      {
        tracks: JSON.parse(JSON.stringify(tracks.value)),
        selectedClipIds: [...selectedClipIds.value],
        selectedTrackId: selectedTrackId.value,
        playheadPosition: playheadPosition.value
      }
    )
  }

  // 内部：静默删除（不触发 saveCommand）
  function _removeClipSilent(clipId) {
    for (const t of tracks.value) {
      const idx = t.clips.findIndex(c => c.id === clipId)
      if (idx !== -1) {
        t.clips.splice(idx, 1)
        selectedClipIds.value = selectedClipIds.value.filter(id => id !== clipId)
        return
      }
    }
  }

  function updateClip(clipId, updates) {
    const found = findClipById(clipId)
    if (!found) return

    const { clip, track } = found

    Object.assign(clip, updates)
    track.clips.sort((a, b) => a.startTime - b.startTime)

    // 同步时间变更到 linked clip（拖拽 & trim 时联动音频）
    if (clip.linkedClipId && (updates.startTime !== undefined || updates.endTime !== undefined)) {
      const linkedFound = findClipById(clip.linkedClipId)
      if (linkedFound) {
        if (updates.startTime !== undefined) linkedFound.clip.startTime = updates.startTime
        if (updates.endTime !== undefined) linkedFound.clip.endTime = updates.endTime
        linkedFound.track.clips.sort((a, b) => a.startTime - b.startTime)
      }
    }

    updateDuration()

    saveCommand('更新剪辑片段',
      { clipId, updates },
      {
        tracks: JSON.parse(JSON.stringify(tracks.value)),
        selectedClipIds: [...selectedClipIds.value],
        selectedTrackId: selectedTrackId.value,
        playheadPosition: playheadPosition.value
      }
    )
  }

  function reloadClips(clipDataArray) {
    // 批量恢复 clips（用于 undo/redo 和从 DB 加载）
    tracks.value.forEach(t => t.clips = [])
    for (const data of clipDataArray) {
      const track = tracks.value.find(t => t.id === data.trackId)
      if (track) {
        const { trackId, ...clipData } = data
        track.clips.push(clipData)
      }
    }
    tracks.value.forEach(t => t.clips.sort((a, b) => a.startTime - b.startTime))
    updateDuration()
  }

  function splitClip(clipId, splitTime) {
    const found = findClipById(clipId)
    if (!found) return
    const { clip, track } = found
    if (track.locked) return

    const originalEnd = clip.endTime
    clip.endTime = +splitTime.toFixed(4)

    // 后半段的 source 偏移 = 原 sourceStart + 分割点在 clip 内的偏移
    const secondHalfSourceStart = clip.sourceStart + (splitTime - clip.startTime)

    const newClip = {
      ...JSON.parse(JSON.stringify(clip)),
      id: generateId('clip'),
      startTime: +splitTime.toFixed(4),
      endTime: originalEnd,
      sourceStart: +secondHalfSourceStart.toFixed(4),
      linkedClipId: null
    }

    track.clips.push(newClip)
    track.clips.sort((a, b) => a.startTime - b.startTime)

    // 同步分割 linked audio clip
    if (clip.linkedClipId) {
      const linkedFound = findClipById(clip.linkedClipId)
      if (linkedFound) {
        const linkedOriginalEnd = linkedFound.clip.endTime
        linkedFound.clip.endTime = +splitTime.toFixed(4)

        const linkedSecondHalfSourceStart = linkedFound.clip.sourceStart + (splitTime - linkedFound.clip.startTime)

        const linkedNewClip = {
          ...JSON.parse(JSON.stringify(linkedFound.clip)),
          id: generateId('clip'),
          startTime: +splitTime.toFixed(4),
          endTime: linkedOriginalEnd,
          sourceStart: +linkedSecondHalfSourceStart.toFixed(4),
          linkedClipId: null
        }

        linkedFound.track.clips.push(linkedNewClip)
        linkedFound.track.clips.sort((a, b) => a.startTime - b.startTime)

        // 建立新 clip 之间的链接
        newClip.linkedClipId = linkedNewClip.id
        linkedNewClip.linkedClipId = newClip.id
      }
    }

    updateDuration()

    saveCommand('分割剪辑片段',
      { clipId, splitTime, newClipId: newClip.id },
      {
        tracks: JSON.parse(JSON.stringify(tracks.value)),
        selectedClipIds: [...selectedClipIds.value],
        selectedTrackId: selectedTrackId.value,
        playheadPosition: playheadPosition.value
      }
    )
  }

  function moveClip(clipId, targetTrackId, newStartTime) {
    const found = findClipById(clipId)
    if (!found) return
    const { clip, track: sourceTrack } = found

    const targetTrack = tracks.value.find(t => t.id === targetTrackId)
    if (!targetTrack || targetTrack.locked) return
    if (sourceTrack.type !== targetTrack.type) return

    const oldStartTime = clip.startTime
    const timeDelta = newStartTime - oldStartTime

    const clipData = { ...clip }
    sourceTrack.clips = sourceTrack.clips.filter(c => c.id !== clipId)

    clipData.startTime = Math.max(0, +newStartTime.toFixed(4))
    clipData.endTime = +(clipData.startTime + (clipData.endTime - clipData.startTime)).toFixed(4)
    clipData.trackIndex = tracks.value.indexOf(targetTrack)

    targetTrack.clips.push(clipData)
    targetTrack.clips.sort((a, b) => a.startTime - b.startTime)

    // 同步移动 linked audio clip
    if (clipData.linkedClipId) {
      const linkedFound = findClipById(clipData.linkedClipId)
      if (linkedFound) {
        linkedFound.clip.startTime = Math.max(0, +(linkedFound.clip.startTime + timeDelta).toFixed(4))
        linkedFound.clip.endTime = +(linkedFound.clip.startTime + (linkedFound.clip.endTime - linkedFound.clip.startTime)).toFixed(4)
        linkedFound.track.clips.sort((a, b) => a.startTime - b.startTime)
      }
    }

    updateDuration()

    saveCommand('移动剪辑片段',
      { clipId, targetTrackId, newStartTime: clipData.startTime, sourceTrackId: sourceTrack.id },
      {
        tracks: JSON.parse(JSON.stringify(tracks.value)),
        selectedClipIds: [...selectedClipIds.value],
        selectedTrackId: selectedTrackId.value,
        playheadPosition: playheadPosition.value
      }
    )
  }

  function moveClipBatch(moves) {
    // 批量移动（用于 undo/redo 精确恢复）
    for (const m of moves) {
      const found = findClipById(m.clipId)
      if (!found) continue
      const { clip, track: sourceTrack } = found

      if (m.targetTrackId) {
        sourceTrack.clips = sourceTrack.clips.filter(c => c.id !== m.clipId)
        const targetTrack = tracks.value.find(t => t.id === m.targetTrackId)
        targetTrack.clips.push(clip)
        clip.trackIndex = tracks.value.indexOf(targetTrack)
      }

      if (m.startTime !== undefined) {
        clip.startTime = +m.startTime.toFixed(4)
        if (m.endTime !== undefined) clip.endTime = +m.endTime.toFixed(4)
      }
    }

    tracks.value.forEach(t => t.clips.sort((a, b) => a.startTime - b.startTime))
    updateDuration()
  }

  // === 滤镜 ===
  function addFilterToClip(clipId, filter) {
    const found = findClipById(clipId)
    if (!found) return
    found.clip.filters.push({ ...filter })
    saveCommand('添加滤镜', { clipId, filter }, {
      tracks: JSON.parse(JSON.stringify(tracks.value))
    })
  }

  function removeFilterFromClip(clipId, filterIndex) {
    const found = findClipById(clipId)
    if (!found) return
    found.clip.filters.splice(filterIndex, 1)
    saveCommand('移除滤镜', { clipId, filterIndex }, {
      tracks: JSON.parse(JSON.stringify(tracks.value))
    })
  }

  // === 选择 ===
  function selectClips(clipIds) {
    selectedClipIds.value = clipIds
  }

  function clearClipSelection() {
    selectedClipIds.value = []
  }

  function selectTrack(trackId) {
    selectedTrackId.value = trackId
  }

  // === Zoom (通过 engine) ===
  function setZoom(newZoom) {
    engine.setZoom(newZoom * BASE_PPS)
    zoom.value = +engine.displayZoom.toFixed(1)
  }

  function syncZoomFromEngine() {
    zoom.value = +engine.displayZoom.toFixed(1)
  }

  // === 播放头 ===
  function setPlayheadPosition(time) {
    playheadPosition.value = Math.max(0, +time.toFixed(4))
  }

  // === 标记 ===
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
    if (index !== -1) markers.value.splice(index, 1)
  }

  // === 轨道属性 ===
  function updateTrack(trackId, updates) {
    const track = tracks.value.find(t => t.id === trackId)
    if (track) Object.assign(track, updates)
  }

  function toggleTrackMute(trackId) {
    const track = tracks.value.find(t => t.id === trackId)
    if (track) track.muted = !track.muted
  }

  // === 重置 ===
  function resetTimeline() {
    tracks.value = [
      { id: generateId('track'), type: 'video', name: '视频轨道 1', clips: [], muted: false, locked: false, height: 80 },
      { id: generateId('track'), type: 'audio', name: '音频轨道 1', clips: [], muted: false, locked: false, height: 60 }
    ]
    duration.value = 0
    zoom.value = 1
    engine.setZoom(BASE_PPS)
    playheadPosition.value = 0
    selectedClipIds.value = []
    selectedTrackId.value = null
    markers.value = []
    history.clear()
  }

  // === 导出 tracks 快照（用于持久化，去掉 computed 字段） ===
  function getCleanTracks() {
    return JSON.parse(JSON.stringify(tracks.value))
  }

  // === 从DB恢复时设置 tracks ===
  function setTracksFromDB(dbTracks) {
    if (dbTracks && Array.isArray(dbTracks)) {
      tracks.value = JSON.parse(JSON.stringify(dbTracks))
      updateDuration()
    }
  }

  return {
    // 状态
    tracks,
    duration,
    zoom,
    playheadPosition,
    selectedClipIds,
    selectedTrackId,
    markers,

    // 计算属性
    allClips,
    selectedClips,
    selectedTrack,
    canUndo,
    canRedo,

    // 轨道
    addTrack,
    removeTrack,
    updateTrack,
    toggleTrackMute,

    // Clip
    makeClip,
    addClip,
    removeClip,
    updateClip,
    reloadClips,
    splitClip,
    moveClip,
    moveClipBatch,

    // 滤镜
    addFilterToClip,
    removeFilterFromClip,

    // 选择
    selectClips,
    clearClipSelection,
    selectTrack,

    // Zoom
    setZoom,
    syncZoomFromEngine,

    // 播放头
    setPlayheadPosition,

    // 标记
    addMarker,
    removeMarker,

    // 历史
    undo,
    redo,
    saveCommand,
    applyCommand,

    // 工具
    findClipById,
    updateDuration,
    getCleanTracks,
    setTracksFromDB,

    // 重置
    resetTimeline
  }
})