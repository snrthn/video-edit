<template>
  <div class="time-ruler" :style="{ width: `${width}px` }">
    <div
      v-for="tick in ticks"
      :key="tick.time"
      class="time-tick"
      :class="{ major: tick.isMajor }"
      :style="{ left: `${tick.pixel}px` }"
    >
      <span v-if="tick.isMajor" class="tick-label">{{ formatTime(tick.time) }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useTimeGrid } from '../../composables/useTimeGrid'

const props = defineProps({
  width: { type: Number, required: true },
  viewWidth: { type: Number, default: 1200 },
  scrollLeft: { type: Number, default: 0 }
})

const { getTimeRulerTicks } = useTimeGrid()

const ticks = computed(() => getTimeRulerTicks(props.viewWidth, props.scrollLeft).ticks)

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
</script>

<style scoped>
.time-ruler {
  height: 30px;
  background-color: #16213e;
  border-bottom: 1px solid #0f3460;
  position: sticky;
  top: 0;
  z-index: 10;
  min-width: 600px;
}
.time-tick {
  position: absolute;
  height: 100%;
  border-left: 1px solid #333;
}
.time-tick.major { border-left-color: #555; }
.tick-label {
  position: absolute;
  top: 4px;
  left: 4px;
  font-size: 10px;
  color: #888;
  white-space: nowrap;
}
</style>
