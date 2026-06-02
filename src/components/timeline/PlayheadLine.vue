<template>
  <div class="playhead" :style="{ left: `${pixelX}px` }">
    <div
      class="playhead-head"
      :class="{ dragging: isDragging }"
      @mousedown="$emit('mousedown', $event)"
    >▼</div>
    <div class="playhead-line" />
  </div>
</template>

<script setup>
defineProps({
  pixelX: { type: Number, required: true },
  isDragging: { type: Boolean, default: false }
})

defineEmits(['mousedown'])
</script>

<style scoped>
.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 100;
  width: 2px;
}
.playhead-head {
  position: absolute;
  top: -2px;
  left: 50%;
  transform: translateX(-50%);
  color: #e94560;
  font-size: 14px;
  cursor: col-resize;
  z-index: 2;
  user-select: none;
}
.playhead-head.dragging { color: #ff6b81; }
.playhead-line {
  width: 100%;
  height: 100%;
  background-color: #e94560;
}
</style>
