<template>
  <div
    class="track"
    :class="{ selected: isSelected, muted: track.muted, locked: track.locked }"
    :style="{ height: `${track.height}px` }"
    @click="$emit('select-track', track.id)"
  >
    <div class="track-label">
      <span class="track-name">{{ track.name }}</span>
      <button
        class="track-mute"
        :class="{ muted: track.muted }"
        @click.stop="$emit('toggle-mute', track.id)"
      >{{ track.muted ? '🔇' : '🔊' }}</button>
    </div>
    <div class="track-clips" ref="clipArea">
      <ClipBlock
        v-for="clip in track.clips"
        :key="clip.id"
        :clip="clip"
        :track-type="track.type"
        :name="getVideoName(clip.videoId)"
        :thumbnail="getVideoThumbnail(clip.videoId)"
        :selected="selectedClipIds.includes(clip.id)"
        :is-drag-active="draggingClipId === clip.id"
        @click="(id, e) => $emit('click-clip', id, e)"
        @dblclick="(c) => $emit('dblclick-clip', c)"
        @mousedown="(e, c) => $emit('mousedown-clip', e, c, track)"
      />
    </div>
  </div>
</template>

<script setup>
import ClipBlock from './ClipBlock.vue'

defineProps({
  track: { type: Object, required: true },
  isSelected: { type: Boolean, default: false },
  selectedClipIds: { type: Array, default: () => [] },
  draggingClipId: { type: String, default: null },
  getVideoName: { type: Function, required: true },
  getVideoThumbnail: { type: Function, required: true }
})

defineEmits(['select-track', 'toggle-mute', 'click-clip', 'dblclick-clip', 'mousedown-clip'])
</script>

<style scoped>
.track {
  display: flex;
  border-bottom: 1px solid #0f3460;
  position: relative;
  min-height: 50px;
}
.track.selected { background-color: rgba(233,69,96,0.05); }
.track.muted { opacity: 0.5; }
.track.locked .clip { cursor: not-allowed; opacity: 0.7; }
.track-label {
  width: 80px;
  min-width: 80px;
  padding: 8px;
  background-color: #16213e;
  border-right: 1px solid #0f3460;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: #aaa;
  flex-shrink: 0;
  position: sticky;
  left: 0;
  z-index: 5;
}
.track-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.track-mute { background: none; border: none; cursor: pointer; font-size: 14px; padding: 0; opacity: 0.6; }
.track-mute:hover { opacity: 1; }
.track-mute.muted { opacity: 0.3; }
.track-clips { flex: 1; position: relative; height: 100%; width: 100%; min-width: 520px; }
</style>
