<template>
  <div
    class="audio-clip"
    :class="{
      selected,
      dragging: isDragActive
    }"
    :style="clipStyle"
    @click.stop="$emit('click', clip.id, $event)"
    @dblclick="$emit('dblclick', clip)"
    @mousedown="onMouseDown"
  >
    <canvas ref="waveCanvas" class="waveform-canvas" />
    <div class="clip-overlay">
      <span class="clip-name">{{ name }}</span>
      <span class="clip-duration">{{ formattedDuration }}</span>
    </div>
    <!-- trim 手柄 -->
    <div class="trim-handle trim-left" />
    <div class="trim-handle trim-right" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useTimeGrid } from '../../composables/useTimeGrid'
import { useTimelineStore, useProjectStore } from '../../stores'
import {
  renderWaveform, resizeWaveformCanvas, getWaveformData
} from '../../utils/audio-utils'

const props = defineProps({
  clip: { type: Object, required: true },
  name: { type: String, default: '' },
  selected: { type: Boolean, default: false },
  isDragActive: { type: Boolean, default: false }
})

const emit = defineEmits(['click', 'dblclick', 'mousedown'])

const { getClipRect } = useTimeGrid()
const timelineStore = useTimelineStore()
const projectStore = useProjectStore()

const waveCanvas = ref(null)

const clipStyle = computed(() => {
  const rect = getClipRect(props.clip)
  return {
    position: 'absolute',
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    top: '4px',
    bottom: '4px'
  }
})

const formattedDuration = computed(() => {
  const dur = props.clip.endTime - props.clip.startTime
  return dur.toFixed(1) + 's'
})

// ===================== 波形渲染 =====================

async function drawWaveform() {
  if (!waveCanvas.value) return
  const canvas = waveCanvas.value
  const rect = canvas.parentElement.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return

  resizeWaveformCanvas(canvas, rect.width, rect.height)

  const video = projectStore.getVideo(props.clip.videoId)
  if (!video) return

  const waveform = await getWaveformData(props.clip.videoId, video.source.url)
  if (!waveform) return

  const clipDuration = props.clip.endTime - props.clip.startTime
  const sourceOffset = props.clip.sourceStart || 0
  renderWaveform(canvas, waveform.peaks, {
    viewStartTime: sourceOffset,
    viewDuration: clipDuration,
    color: '#50c878'
  })
}

let redrawTimer = null
function scheduleRedraw() {
  if (redrawTimer) clearTimeout(redrawTimer)
  redrawTimer = setTimeout(drawWaveform, 50)
}

// clip 变化或选中态变化时重绘
watch(() => [props.clip.startTime, props.clip.endTime, props.selected, props.clip.id], () => {
  scheduleRedraw()
}, { deep: false })

// zoom 变化时重绘（track 缩放）
watch(() => timelineStore.zoom, () => {
  scheduleRedraw()
})

onMounted(() => {
  nextTick(drawWaveform)
})

// ===================== mousedown =====================

function onMouseDown(e) {
  emit('mousedown', e, props.clip)
}
</script>

<style scoped>
.audio-clip {
  position: absolute;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
  border: 2px solid transparent;
  min-width: 30px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  background-color: #1a3a1a;
  user-select: none;
  transition: border-color 0.12s, box-shadow 0.12s;
}
.audio-clip:hover { border-color: rgba(255,255,255,0.2); }
.audio-clip.selected {
  border-color: #e94560;
  box-shadow: 0 0 0 1px #e94560, 0 2px 8px rgba(233,69,96,0.3);
}
.audio-clip.dragging {
  cursor: grabbing;
  border-color: #4ade80;
  box-shadow: 0 0 0 2px #4ade80, 0 4px 12px rgba(74,222,128,0.3);
  z-index: 50;
}

.waveform-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0.7;
}

.clip-overlay {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  padding: 2px 6px;
  background: linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.5));
  min-height: 100%;
}
.clip-name {
  font-size: 11px;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
  text-shadow: 0 1px 2px rgba(0,0,0,0.8);
}
.clip-duration {
  font-size: 9px;
  color: rgba(255,255,255,0.8);
  margin-top: 1px;
  text-shadow: 0 1px 2px rgba(0,0,0,0.8);
}

.trim-handle {
  position: absolute;
  top: 0; bottom: 0;
  width: 8px;
  cursor: col-resize;
  z-index: 2;
  opacity: 0;
}
.trim-handle:hover { opacity: 1; background: rgba(255,255,255,0.15); }
.trim-left { left: 0; }
.trim-right { right: 0; }
</style>
