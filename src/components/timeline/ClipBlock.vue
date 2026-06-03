<template>
  <div
    class="clip"
    :class="{
      selected,
      dragging: isDragActive,
      'video-clip': trackType === 'video',
      'audio-clip': trackType === 'audio'
    }"
    :style="clipStyle"
    @click.stop="$emit('click', clip.id, $event)"
    @dblclick="$emit('dblclick', clip)"
    @mousedown="onMouseDown"
  >
    <!-- 缩略图条 -->
    <div
      v-if="thumbnail"
      class="clip-thumbnail"
      :style="{ backgroundImage: `url(${thumbnail})` }"
    />
    <!-- 覆盖层 -->
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
import { computed } from 'vue'
import { useTimeGrid } from '../../composables/useTimeGrid'

const props = defineProps({
  clip: { type: Object, required: true },
  trackType: { type: String, default: 'video' },
  name: { type: String, default: '' },
  thumbnail: { type: String, default: '' },
  selected: { type: Boolean, default: false },
  isDragActive: { type: Boolean, default: false }
})

const emit = defineEmits(['click', 'dblclick', 'mousedown'])

const { getClipRect, getClipPixelWidth } = useTimeGrid()

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

function onMouseDown(e) {
  emit('mousedown', e, props.clip)
}
</script>

<style scoped>
.clip {
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
  background-color: #2a3f5f;
  user-select: none;
  transition: border-color 0.12s, box-shadow 0.12s, opacity 0.12s;
}
.clip:hover { border-color: rgba(255,255,255,0.2); }
.clip.selected {
  border-color: #e94560;
  box-shadow: 0 0 0 1px #e94560, 0 2px 8px rgba(233,69,96,0.3);
}
.clip.dragging {
  cursor: grabbing;
  border-color: #4ade80;
  box-shadow: 0 0 0 2px #4ade80, 0 4px 12px rgba(74,222,128,0.3);
  z-index: 50;
}
.video-clip { background-color: #4a90d9; }
.audio-clip { background-color: #50c878; }

.clip-thumbnail {
  position: absolute;
  inset: 0;
  background-size: auto 100%;
  background-position: left center;
  background-repeat: repeat-x;
  opacity: 0.4;
}
.clip-overlay {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  padding: 2px 6px;
  background: linear-gradient(to bottom, rgba(0,0,0,0.4), rgba(0,0,0,0.7));
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
  top: 0;
  bottom: 0;
  width: 8px;
  cursor: col-resize;
  z-index: 2;
  opacity: 0;
}
.trim-handle:hover { opacity: 1; background: rgba(255,255,255,0.15); }
.trim-left { left: 0; }
.trim-right { right: 0; }
</style>
