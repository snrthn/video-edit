import { ref, computed } from 'vue';
import { useExportStore, useProjectStore, useTimelineStore } from '../stores';
import { ffmpeg } from '../utils/ffmpeg-wrapper';
import { blobToUrl, generateId } from '../utils/video-utils';
export function useExport() {
 const exportStore = useExportStore();
 const projectStore = useProjectStore();
 const timelineStore = useTimelineStore();
 const isExporting = ref(false);
 const currentJob = ref(null);
 const jobs = computed(() => exportStore.jobs);
 async function createExportJob(settings = {}) {
 const job = {
 id: generateId('export'),
 name: settings.name || `导出_${new Date().toLocaleString()}`,
 status: 'pending',
 progress: 0,
 settings: {
 format: settings.format || 'mp4',
 quality: settings.quality || 'medium',
 resolution: settings.resolution || '1080p',
 frameRate: settings.frameRate || 30
 },
 createdAt: Date.now(),
 updatedAt: Date.now()
 };
 exportStore.addJob(job);
 return job;
 }
 async function startExport(jobId) {
 const job = exportStore.getJob(jobId);
 if (!job || job.status !== 'pending')
 return;
 isExporting.value = true;
 currentJob.value = job;
 job.status = 'processing';
 job.progress = 0;
 job.updatedAt = Date.now();
 exportStore.updateJob(jobId, job);
 try {
 job.progress = 10;
 await ffmpeg.init();
 job.progress = 20;
 exportStore.updateJob(jobId, job);
 const clips = collectClips();
 if (clips.length === 0) {
 throw new Error('时间线上没有剪辑片段');
 }
 job.progress = 30;
 exportStore.updateJob(jobId, job);
 let outputBlob;
 if (clips.length === 1) {
 outputBlob = await processSingleClip(clips[0], job.settings);
 }
 else {
 outputBlob = await processMultipleClips(clips, job.settings);
 }
 job.progress = 90;
 exportStore.updateJob(jobId, job);
 const outputUrl = blobToUrl(outputBlob);
 job.outputUrl = outputUrl;
 job.status = 'completed';
 job.progress = 100;
 job.completedAt = Date.now();
 job.updatedAt = Date.now();
 exportStore.updateJob(jobId, job);
 downloadFile(outputBlob, job.name, job.settings.format);
 }
 catch (error) {
 job.status = 'failed';
 job.error = error.message;
 job.updatedAt = Date.now();
 exportStore.updateJob(jobId, job);
 throw error;
 }
 finally {
 isExporting.value = false;
 currentJob.value = null;
 }
 }
 async function processSingleClip(clip, settings) {
 const video = projectStore.getVideo(clip.videoId);
 if (!video)
 throw new Error('视频不存在');
 let outputBlob = await ffmpeg.trim(video.source.url, null, clip.startTime, clip.endTime - clip.startTime);
 if (clip.filters && clip.filters.length > 0) {
 for (const filter of clip.filters) {
 outputBlob = await ffmpeg.applyFilter(URL.createObjectURL(outputBlob), null, filter.type, filter.params);
 }
 }
 return outputBlob;
 }
 async function processMultipleClips(clips, settings) {
 const processedClips = [];
 for (let i = 0; i < clips.length; i++) {
 const clip = clips[i];
 const video = projectStore.getVideo(clip.videoId);
 if (!video)
 continue;
 let clipBlob = await ffmpeg.trim(video.source.url, null, clip.startTime, clip.endTime - clip.startTime);
 if (clip.filters && clip.filters.length > 0) {
 for (const filter of clip.filters) {
 const tempUrl = URL.createObjectURL(clipBlob);
 clipBlob = await ffmpeg.applyFilter(tempUrl, null, filter.type, filter.params);
 URL.revokeObjectURL(tempUrl);
 }
 }
 processedClips.push({
 url: URL.createObjectURL(clipBlob),
 duration: clip.endTime - clip.startTime
 });
 }
 const mergedBlob = await ffmpeg.merge(processedClips.map(c => ({ url: c.url })), null);
 processedClips.forEach(c => URL.revokeObjectURL(c.url));
 return mergedBlob;
 }
 function collectClips() {
 const allClips = [];
 timelineStore.tracks.forEach(track => {
 track.clips.forEach(clip => {
 allClips.push({
 ...clip,
 trackIndex: track.id
 });
 });
 });
 allClips.sort((a, b) => a.startTime - b.startTime);
 return allClips;
 }
 function downloadFile(blob, name, format) {
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = `${name}.${format}`;
 document.body.appendChild(a);
 a.click();
 document.body.removeChild(a);
 URL.revokeObjectURL(url);
 }
 async function pauseExport(jobId) {
 const job = exportStore.getJob(jobId);
 if (job && job.status === 'processing') {
 job.status = 'paused';
 job.updatedAt = Date.now();
 exportStore.updateJob(jobId, job);
 }
 }
 async function cancelExport(jobId) {
 const job = exportStore.getJob(jobId);
 if (job && (job.status === 'processing' || job.status === 'paused')) {
 job.status = 'cancelled';
 job.updatedAt = Date.now();
 exportStore.updateJob(jobId, job);
 }
 }
 function getJobStatus(jobId) {
 return exportStore.getJob(jobId);
 }
 function deleteJob(jobId) {
 const job = exportStore.getJob(jobId);
 if (job && job.outputUrl) {
 URL.revokeObjectURL(job.outputUrl);
 }
 exportStore.removeJob(jobId);
 }
 function getExportProgress(jobId) {
 return exportStore.getJob(jobId);
 }
 return {
 isExporting,
 currentJob,
 jobs,
 createExportJob,
 startExport,
 pauseExport,
 cancelExport,
 getJobStatus,
 deleteJob,
 getExportProgress
 };
}
