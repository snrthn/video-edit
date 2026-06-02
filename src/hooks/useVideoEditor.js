import { computed } from 'vue';
import { useTimelineStore, useProjectStore } from '../stores';
import { generateId } from '../utils/video-utils';
import { triggerSave } from '../main';

export function useVideoEditor() {
  const timelineStore = useTimelineStore();
  const projectStore = useProjectStore();

  const selectedTrack = computed(() => timelineStore.tracks.find(t => t.id === timelineStore.selectedTrackId));

  const selectedClips = computed(() => {
    return timelineStore.selectedClipIds.map(id => {
      const track = timelineStore.tracks.find(t => t.clips.some(c => c.id === id));
      return track?.clips.find(c => c.id === id);
    }).filter(Boolean);
  });

  function addTrack(type = 'video') {
    timelineStore.addTrack(type);
    triggerSave();
  }

  function removeTrack(trackId) {
    timelineStore.removeTrack(trackId);
    triggerSave();
  }

  function addClip(videoId, trackIndex = 0, startTime = 0) {
    const video = projectStore.getVideo(videoId);
    if (!video) return null;

    const clip = {
      id: generateId('clip'),
      videoId,
      startTime,
      endTime: startTime + (video.metadata?.duration || 10),
      trackIndex,
      filters: [],
      volume: 1,
      speed: 1
    };

    timelineStore.addClip(clip, trackIndex);
    triggerSave();
    return clip;
  }

  function removeClip(clipId) {
    timelineStore.removeClip(clipId);
    triggerSave();
  }

  function moveClip(clipId, newTrackIndex, newStartTime) {
    timelineStore.moveClip(clipId, newTrackIndex, newStartTime);
    triggerSave();
  }

  function splitClip(clipId, time) {
    const track = timelineStore.tracks.find(t => t.clips.some(c => c.id === clipId));
    if (!track) return null;

    const clip = track.clips.find(c => c.id === clipId);
    if (!clip || time <= clip.startTime || time >= clip.endTime) return null;

    timelineStore.splitClip(clipId, time);
    triggerSave();
    
    const newClip = track.clips.find(c => c.startTime === time);
    return newClip;
  }

  function trimClip(clipId, newStart, newEnd) {
    const track = timelineStore.tracks.find(t => t.clips.some(c => c.id === clipId));
    if (!track) return false;

    const clip = track.clips.find(c => c.id === clipId);
    if (!clip) return false;

    const video = projectStore.getVideo(clip.videoId);
    const maxEnd = video?.metadata?.duration || 100;

    clip.startTime = Math.max(0, newStart);
    clip.endTime = Math.min(maxEnd, Math.max(newStart + 0.1, newEnd));

    timelineStore.updateTrack(track.id, track);
    triggerSave();
    return true;
  }

  function duplicateClip(clipId) {
    const track = timelineStore.tracks.find(t => t.clips.some(c => c.id === clipId));
    if (!track) return null;

    const clip = track.clips.find(c => c.id === clipId);
    if (!clip) return null;

    const newClip = {
      id: generateId('clip'),
      videoId: clip.videoId,
      startTime: clip.endTime + 0.5,
      endTime: clip.endTime + 0.5 + (clip.endTime - clip.startTime),
      trackIndex: track.id,
      filters: [...clip.filters],
      volume: clip.volume,
      speed: clip.speed
    };

    timelineStore.addClip(newClip, track.id);
    triggerSave();
    return newClip;
  }

  function addFilter(clipId, filterType, params = {}) {
    const track = timelineStore.tracks.find(t => t.clips.some(c => c.id === clipId));
    if (!track) return false;

    const clip = track.clips.find(c => c.id === clipId);
    if (!clip) return false;

    const filter = {
      id: generateId('filter'),
      type: filterType,
      params
    };

    clip.filters.push(filter);
    timelineStore.updateTrack(track.id, track);
    triggerSave();
    return filter;
  }

  function removeFilter(clipId, filterId) {
    const track = timelineStore.tracks.find(t => t.clips.some(c => c.id === clipId));
    if (!track) return false;

    const clip = track.clips.find(c => c.id === clipId);
    if (!clip) return false;

    clip.filters = clip.filters.filter(f => f.id !== filterId);
    timelineStore.updateTrack(track.id, track);
    triggerSave();
    return true;
  }

  function updateFilter(clipId, filterId, params) {
    const track = timelineStore.tracks.find(t => t.clips.some(c => c.id === clipId));
    if (!track) return false;

    const clip = track.clips.find(c => c.id === clipId);
    if (!clip) return false;

    const filter = clip.filters.find(f => f.id === filterId);
    if (!filter) return false;

    filter.params = { ...filter.params, ...params };
    timelineStore.updateTrack(track.id, track);
    triggerSave();
    return true;
  }

  function setClipVolume(clipId, volume) {
    const track = timelineStore.tracks.find(t => t.clips.some(c => c.id === clipId));
    if (!track) return false;

    const clip = track.clips.find(c => c.id === clipId);
    if (!clip) return false;

    clip.volume = Math.max(0, Math.min(1, volume));
    timelineStore.updateTrack(track.id, track);
    triggerSave();
    return true;
  }

  function setClipSpeed(clipId, speed) {
    const track = timelineStore.tracks.find(t => t.clips.some(c => c.id === clipId));
    if (!track) return false;

    const clip = track.clips.find(c => c.id === clipId);
    if (!clip) return false;

    clip.speed = Math.max(0.1, Math.min(4, speed));
    timelineStore.updateTrack(track.id, track);
    triggerSave();
    return true;
  }

  function toggleMuteTrack(trackId) {
    const track = timelineStore.tracks.find(t => t.id === trackId);
    if (track) {
      track.muted = !track.muted;
      timelineStore.updateTrack(trackId, track);
      triggerSave();
    }
  }

  function selectClip(clipId, multiSelect = false) {
    if (multiSelect) {
      const currentSelected = [...timelineStore.selectedClipIds];
      if (currentSelected.includes(clipId)) {
        timelineStore.selectClips(currentSelected.filter(id => id !== clipId));
      } else {
        timelineStore.selectClips([...currentSelected, clipId]);
      }
    } else {
      timelineStore.selectClips([clipId]);
    }
  }

  function selectTrack(trackId) {
    timelineStore.selectTrack(trackId);
  }

  function clearSelection() {
    timelineStore.selectClips([]);
    timelineStore.selectTrack(null);
  }

  function undo() {
    timelineStore.undo();
    triggerSave();
  }

  function redo() {
    timelineStore.redo();
    triggerSave();
  }

  return {
    selectedTrack,
    selectedClips,
    addTrack,
    removeTrack,
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
    toggleMuteTrack,
    selectClip,
    selectTrack,
    clearSelection,
    undo,
    redo
  };
}