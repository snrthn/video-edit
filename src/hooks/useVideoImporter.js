import { ref } from 'vue';
import { useProjectStore } from '../stores';
import { getVideoMetadata, getAudioMetadata, generateThumbnail, generateId, getProxyUrl } from '../utils/video-utils';
import { fetchBlob, blobToUrl } from '../utils/video-utils';
import { triggerSave } from '../main';

export function useVideoImporter() {
  const projectStore = useProjectStore();
  const isImporting = ref(false);
  const importProgress = ref(0);
  const importError = ref(null);

  async function importFromUrl(url) {
    isImporting.value = true;
    importProgress.value = 0;
    importError.value = null;
    try {
      importProgress.value = 10;

      const proxyUrl = getProxyUrl(url);
      importProgress.value = 20;

      const blob = await fetchBlob(proxyUrl);
      importProgress.value = 40;

      const blobUrl = blobToUrl(blob);
      importProgress.value = 50;

      const metadata = await getVideoMetadata(blobUrl);
      importProgress.value = 70;

      const thumbnail = await generateThumbnail(blobUrl);
      importProgress.value = 90;

      const video = projectStore.addVideoFromSource({
        type: 'blob',
        url: blobUrl,
        originalUrl: url,
        blob: blob
      }, extractFileName(url), metadata);

      video.thumbnail = thumbnail;

      importProgress.value = 100;
      isImporting.value = false;

      triggerSave();

      return video;
    } catch (error) {
      importError.value = error.message;
      isImporting.value = false;
      throw error;
    }
  }

  async function importFromFile(file) {
    isImporting.value = true;
    importProgress.value = 0;
    importError.value = null;
    try {
      importProgress.value = 20;

      const blobUrl = blobToUrl(file);
      importProgress.value = 40;

      const metadata = await getVideoMetadata(blobUrl);
      importProgress.value = 60;

      const thumbnail = await generateThumbnail(blobUrl);
      importProgress.value = 80;

      const video = projectStore.addVideoFromSource({
        type: 'blob',
        url: blobUrl,
        blob: file,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type
      }, file.name, metadata);

      video.thumbnail = thumbnail;
      video.mediaType = 'video';

      importProgress.value = 100;
      isImporting.value = false;

      triggerSave();

      return video;
    } catch (error) {
      importError.value = error.message;
      isImporting.value = false;
      throw error;
    }
  }

  async function importAudioFromFile(file) {
    isImporting.value = true;
    importProgress.value = 0;
    importError.value = null;
    try {
      importProgress.value = 20;

      const blobUrl = blobToUrl(file);
      importProgress.value = 40;

      const metadata = await getAudioMetadata(blobUrl);
      importProgress.value = 80;

      const audio = projectStore.addVideoFromSource({
        type: 'blob',
        url: blobUrl,
        blob: file,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type
      }, file.name, metadata);

      audio.mediaType = 'audio';

      importProgress.value = 100;
      isImporting.value = false;

      triggerSave();

      return audio;
    } catch (error) {
      importError.value = error.message;
      isImporting.value = false;
      throw error;
    }
  }

  async function importFromLocalFiles(files) {
    const results = [];
    for (const file of files) {
      try {
        if (file.type.startsWith('video/')) {
          const video = await importFromFile(file);
          results.push({ success: true, video });
        } else if (file.type.startsWith('audio/')) {
          const audio = await importAudioFromFile(file);
          results.push({ success: true, video: audio });
        }
      } catch (error) {
        results.push({ success: false, error: error.message, fileName: file.name });
      }
    }
    return results;
  }

  function extractFileName(url) {
    const match = url.match(/[^/]+$/);
    return match ? match[0] : '未命名视频';
  }

  function removeVideo(videoId) {
    const video = projectStore.getVideo(videoId);
    if (video && video.source.url) {
      URL.revokeObjectURL(video.source.url);
    }
    projectStore.removeVideo(videoId);
    triggerSave();
  }

  return {
    isImporting,
    importProgress,
    importError,
    importFromUrl,
    importFromFile,
    importAudioFromFile,
    importFromLocalFiles,
    removeVideo
  };
}
