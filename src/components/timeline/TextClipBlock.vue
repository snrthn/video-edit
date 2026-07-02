<template>
  <div
    class="text-clip-block clip"
    :class="{ selected, 'drag-active': isDragActive }"
    :style="blockStyle"
    @click.stop="$emit('click', clip.id, $event)"
    @dblclick.stop="$emit('dblclick', clip)"
    @mousedown="onMouseDown"
  >
    <div class="text-preview">{{ clip.content || '文字' }}</div>
    <div v-if="clip.textStyle" class="text-style-indicator">
      <span v-if="clip.textStyle.bold" class="style-tag">B</span>
      <span v-if="clip.textStyle.italic" class="style-tag italic">I</span>
      <span class="style-tag color" :style="{ background: clip.textStyle.color }"></span>
    </div>
    <!-- 纯视觉 trim 手柄（hover 反馈，不处理 mousedown） -->
    <div class="trim-handle trim-left" />
    <div class="trim-handle trim-right" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useTimeGrid } from '../../composables/useTimeGrid'

const props = defineProps({
  clip: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  isDragActive: { type: Boolean, default: false }
})

const emit = defineEmits(['click', 'dblclick', 'mousedown'])

const { getClipRect } = useTimeGrid()

const blockStyle = computed(() => {
  const rect = getClipRect(props.clip)
  return {
    left: `${rect.left}px`,
    width: `${rect.width}px`
  }
})

function onMouseDown(e) {
  emit('mousedown', e, props.clip)
}
</script>

<style scoped>
.text-clip-block {
  position: absolute;
  top: 4px;
  bottom: 4px;
  background: linear-gradient(135deg, #6c63ff, #4834d4);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 0 8px;
  min-width: 20px;
  user-select: none;
  transition: box-shadow 0.15s, border-color 0.15s;
  box-sizing: border-box;
}

.text-clip-block:hover {
  border-color: rgba(255, 255, 255, 0.4);
  box-shadow: 0 0 6px rgba(108, 99, 255, 0.5);
}

.text-clip-block.selected {
  border-color: #ffd700;
  box-shadow: 0 0 8px rgba(255, 215, 0, 0.6);
  z-index: 10;
}

.text-clip-block.drag-active {
  opacity: 0.5;
}

.text-preview {
  font-size: 11px;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  pointer-events: none;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
}

.text-style-indicator {
  display: flex;
  align-items: center;
  gap: 3px;
  margin-left: 6px;
  flex-shrink: 0;
  pointer-events: none;
}

.style-tag {
  font-size: 10px;
  color: rgba(255,255,255,0.7);
  background: rgba(0,0,0,0.3);
  padding: 1px 4px;
  border-radius: 2px;
}

.style-tag.italic {
  font-style: italic;
}

.style-tag.color {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  border: 1px solid rgba(255,255,255,0.4);
  padding: 0;
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
