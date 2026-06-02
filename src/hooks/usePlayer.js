import { ref, watch, onUnmounted } from 'vue';
import { usePlayerStore, useTimelineStore, useProjectStore } from '../stores';

export function usePlayer() {
  const playerStore = usePlayerStore();
  const timelineStore = useTimelineStore();
  const projectStore = useProjectStore();
  const videoRef = ref(null);
  const isReady = ref(false);
  let progressInterval = null;
  let playheadMoveInterval = null;

  function setupPlayer(videoElement) {
    videoRef.value = videoElement;
    isReady.value = true;
    videoRef.value.volume = playerStore.volume;
    videoRef.value.playbackRate = playerStore.playbackRate;
    videoRef.value.addEventListener('timeupdate', handleTimeUpdate);
    videoRef.value.addEventListener('loadedmetadata', handleLoadedMetadata);
    videoRef.value.addEventListener('progress', handleProgress);
    videoRef.value.addEventListener('play', handlePlay);
    videoRef.value.addEventListener('pause', handlePause);
    videoRef.value.addEventListener('ended', handleEnded);
  }

  function findClipAtTime(time) {
    for (const track of timelineStore.tracks) {
      for (const clip of track.clips) {
        if (time >= clip.startTime && time < clip.endTime) {
          return clip;
        }
      }
    }
    return null;
  }

  function findNextClip(currentTime) {
    const allClips = timelineStore.tracks.flatMap((track, trackIndex) =>
      track.clips.map(clip => ({ ...clip, trackIndex }))
    );
    allClips.sort((a, b) => a.startTime - b.startTime);
    for (const clip of allClips) {
      if (clip.startTime > currentTime + 0.1) {
        return clip;
      }
    }
    return null;
  }

  function findFirstClip() {
    const allClips = timelineStore.tracks.flatMap((track, trackIndex) =>
      track.clips.map(clip => ({ ...clip, trackIndex }))
    );
    if (allClips.length === 0) return null;
    return allClips.reduce((earliest, clip) =>
      clip.startTime < earliest.startTime ? clip : earliest
    );
  }

  function loadClipVideo(clip) {
    if (!videoRef.value || !clip) return;
    const video = projectStore.getVideo(clip.videoId);
    if (video) {
      playerStore.setCurrentClip(clip.id);
      playerStore.setCurrentVideo(clip.videoId);
      videoRef.value.src = video.source.url;
      videoRef.value.load();
    }
  }

  function handleTimeUpdate() {
    if (!videoRef.value) return;

    playerStore.setCurrentTime(videoRef.value.currentTime);

    const currentClip = findClipAtTime(timelineStore.playheadPosition);

    if (currentClip) {
      const timelinePosition = currentClip.startTime + videoRef.value.currentTime;
      timelineStore.setPlayheadPosition(timelinePosition);
      playerStore.setTimelinePosition(timelinePosition);
    }
  }

  function handleLoadedMetadata() {
    if (videoRef.value) {
      playerStore.setDuration(videoRef.value.duration);
    }
  }

  function handleProgress() {
    if (videoRef.value && videoRef.value.buffered.length > 0) {
      const buffered = videoRef.value.buffered.end(videoRef.value.buffered.length - 1);
      playerStore.setBuffered(buffered / playerStore.duration);
    }
  }

  function handlePlay() {
    playerStore.play();
    startProgressUpdate();
  }

  function handlePause() {
    playerStore.pause();
    stopProgressUpdate();
  }

  function handleEnded() {
    const currentTime = timelineStore.playheadPosition;
    const nextClip = findNextClip(currentTime);

    if (nextClip) {
      loadClipVideo(nextClip);

      const gap = nextClip.startTime - currentTime;

      if (gap > 0.5) {
        startPlayheadMove(nextClip.startTime, () => {
          videoRef.value.currentTime = 0;
          videoRef.value.play();
        });
      } else {
        setTimeout(() => {
          timelineStore.setPlayheadPosition(nextClip.startTime);
          videoRef.value.currentTime = 0;
          videoRef.value.play();
        }, 100);
      }
      return;
    }

    playerStore.pause();
    stopProgressUpdate();
  }

  function startProgressUpdate() {
    if (progressInterval) return;
    progressInterval = setInterval(() => {
      if (videoRef.value && playerStore.isPlaying) {
        playerStore.setCurrentTime(videoRef.value.currentTime);
        const currentClip = findClipAtTime(timelineStore.playheadPosition);
        if (currentClip) {
          const timelinePosition = currentClip.startTime + videoRef.value.currentTime;
          timelineStore.setPlayheadPosition(timelinePosition);
        }
      }
    }, 100);
  }

  function stopProgressUpdate() {
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
  }

  function startPlayheadMove(targetPosition, onReachCallback) {
    stopPlayheadMove();

    playerStore.play();

    playheadMoveInterval = setInterval(() => {
      const currentPosition = timelineStore.playheadPosition;

      if (currentPosition >= targetPosition - 0.05) {
        stopPlayheadMove();
        timelineStore.setPlayheadPosition(targetPosition);
        playerStore.setTimelinePosition(targetPosition);
        if (onReachCallback) {
          onReachCallback();
        }
        return;
      }

      const newPosition = currentPosition + 0.016;
      timelineStore.setPlayheadPosition(Math.min(newPosition, targetPosition));
      playerStore.setTimelinePosition(Math.min(newPosition, targetPosition));
    }, 16);
  }

  function stopPlayheadMove() {
    if (playheadMoveInterval) {
      clearInterval(playheadMoveInterval);
      playheadMoveInterval = null;
    }
  }

  function isPlayheadMoving() {
    return playheadMoveInterval !== null;
  }

  function play() {
    if (!videoRef.value) return;

    const currentClip = findClipAtTime(timelineStore.playheadPosition);
    const firstClip = findFirstClip();

    if (!firstClip) {
      return;
    }

    if (!currentClip) {
      const targetPosition = firstClip.startTime;
      loadClipVideo(firstClip);

      startPlayheadMove(targetPosition, () => {
        videoRef.value.currentTime = 0;
        videoRef.value.play();
      });
    } else {
      if (currentClip.id !== playerStore.currentClipId) {
        loadClipVideo(currentClip);
        setTimeout(() => {
          const clipOffset = timelineStore.playheadPosition - currentClip.startTime;
          videoRef.value.currentTime = clipOffset;
          videoRef.value.play();
        }, 100);
      } else {
        videoRef.value.play();
      }
    }
  }

  function pause() {
    stopPlayheadMove();
    if (!videoRef.value) return;
    videoRef.value.pause();
  }

  function stop() {
    stopPlayheadMove();
    if (!videoRef.value) return;
    videoRef.value.pause();
    seek(0);
  }

  function seek(time) {
    stopPlayheadMove();
    if (!videoRef.value) return;

    const currentClip = findClipAtTime(time);
    if (currentClip) {
      loadClipVideo(currentClip);
      const clipOffset = time - currentClip.startTime;
      videoRef.value.currentTime = clipOffset;
      playerStore.setCurrentTime(clipOffset);
      timelineStore.setPlayheadPosition(time);
    } else {
      time = Math.max(0, Math.min(time, playerStore.duration));
      videoRef.value.currentTime = time;
      playerStore.setCurrentTime(time);
      timelineStore.setPlayheadPosition(time);
    }
  }

  function seekRelative(delta) {
    const newTime = playerStore.timelinePosition + delta;
    seek(newTime);
  }

  function setVolume(volume) {
    volume = Math.max(0, Math.min(1, volume));
    playerStore.setVolume(volume);
    if (videoRef.value) {
      videoRef.value.volume = volume;
    }
  }

  function toggleMute() {
    playerStore.toggleMute();
    if (videoRef.value) {
      videoRef.value.muted = playerStore.isMuted;
    }
  }

  function setPlaybackRate(rate) {
    rate = Math.max(0.1, Math.min(4, rate));
    playerStore.setPlaybackRate(rate);
    if (videoRef.value) {
      videoRef.value.playbackRate = rate;
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
    playerStore.toggleFullscreen();
  }

  function loadVideo(video) {
    if (!videoRef.value || !video) return;
    videoRef.value.src = video.source.url;
    videoRef.value.load();
  }

  onUnmounted(() => {
    stopProgressUpdate();
    stopPlayheadMove();
    if (videoRef.value) {
      videoRef.value.removeEventListener('timeupdate', handleTimeUpdate);
      videoRef.value.removeEventListener('loadedmetadata', handleLoadedMetadata);
      videoRef.value.removeEventListener('progress', handleProgress);
      videoRef.value.removeEventListener('play', handlePlay);
      videoRef.value.removeEventListener('pause', handlePause);
      videoRef.value.removeEventListener('ended', handleEnded);
    }
  });

  return {
    videoRef,
    isReady,
    setupPlayer,
    play,
    pause,
    stop,
    seek,
    seekRelative,
    setVolume,
    toggleMute,
    setPlaybackRate,
    toggleFullscreen,
    loadVideo,
    findClipAtTime,
    loadClipVideo,
    findNextClip,
    findFirstClip,
    isPlayheadMoving
  };
}
