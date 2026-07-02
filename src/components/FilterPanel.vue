<template>
  <div v-if="selectedClip" class="filter-panel">
    <div class="panel-header">滤镜效果</div>

    <!-- 已应用的滤镜列表 -->
    <div v-if="appliedFilters.length > 0" class="applied-section">
      <div class="section-label">已应用 ({{ appliedFilters.length }})</div>
      <div
        v-for="(filter, idx) in appliedFilters"
        :key="filter.type + idx"
        class="filter-item"
      >
        <div class="filter-top">
          <label class="filter-toggle">
            <input
              type="checkbox"
              :checked="filter.enabled !== false"
              @change="toggleFilterEnabled(idx)"
            />
            <span class="filter-name">{{ getFilterDef(filter.type)?.name || filter.type }}</span>
          </label>
          <button class="remove-btn" @click="removeFilter(idx)" title="移除">×</button>
        </div>
        <div v-if="filter.enabled !== false" class="filter-params">
          <template v-if="getFilterDef(filter.type)?.type === 'slider'">
            <input
              type="range"
              class="filter-range"
              :min="getFilterDef(filter.type).min"
              :max="getFilterDef(filter.type).max"
              :step="getFilterDef(filter.type).step"
              :value="filter.params.value ?? getFilterDef(filter.type).default"
              @input="e => updateFilterParam(idx, 'value', parseFloat(e.target.value))"
            />
            <span class="filter-param-val">{{ (filter.params.value ?? 0).toFixed(1) }}</span>
          </template>
          <template v-else-if="getFilterDef(filter.type)?.type === 'toggle'">
            <label class="toggle-label">
              <input
                type="checkbox"
                :checked="filter.params.value === true"
                @change="e => updateFilterParam(idx, 'value', e.target.checked)"
              /> 启用
            </label>
          </template>
        </div>
      </div>
    </div>

    <!-- 可添加的滤镜 -->
    <div class="available-section">
      <div class="section-label">添加滤镜</div>
      <div class="filter-grid">
        <button
          v-for="def in availableFilters"
          :key="def.id"
          class="add-filter-btn"
          :disabled="hasFilter(def.id)"
          @click="addFilter(def)"
        >
          {{ filterIcons[def.id] || '🎞' }} {{ def.name }}
        </button>
      </div>
    </div>
  </div>

  <div v-else class="filter-panel empty">
    <div class="panel-header">滤镜效果</div>
    <div class="empty-hint">选中剪辑片段以编辑滤镜</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useTimelineStore } from '../stores'
import { videoFilters } from '../utils/ffmpeg-wrapper'
import { triggerSave } from '../main'

const timelineStore = useTimelineStore()

const filterIcons = {
  brightness: '☀️',
  contrast: '🌓',
  saturation: '🎨',
  blur: '🌫️',
  grayscale: '⬛',
  huerotate: '🌈',
  opacity: '👻'
}

const selectedClip = computed(() => {
  if (timelineStore.selectedClipIds.length !== 1) return null
  return timelineStore.selectedClips[0] || null
})

const appliedFilters = computed(() => {
  return selectedClip.value?.filters || []
})

const availableFilters = computed(() => {
  return videoFilters
})

function getFilterDef(type) {
  return videoFilters.find(f => f.id === type)
}

function hasFilter(type) {
  return appliedFilters.value.some(f => f.type === type)
}

function addFilter(def) {
  if (!selectedClip.value) return
  const params = {}
  if (def.type === 'slider') params.value = def.default
  if (def.type === 'toggle') params.value = def.default
  if (def.id === 'blur') params.sigma = def.default

  timelineStore.addFilterToClip(selectedClip.value.id, {
    type: def.id,
    params,
    enabled: true
  })
  triggerSave()
}

function removeFilter(idx) {
  if (!selectedClip.value) return
  timelineStore.removeFilterFromClip(selectedClip.value.id, idx)
  triggerSave()
}

function toggleFilterEnabled(idx) {
  if (!selectedClip.value) return
  const filter = appliedFilters.value[idx]
  if (!filter) return
  filter.enabled = !filter.enabled
  // 强制触发响应式更新
  timelineStore.updateClip(selectedClip.value.id, { filters: [...appliedFilters.value] })
  triggerSave()
}

function updateFilterParam(idx, key, value) {
  if (!selectedClip.value) return
  const filter = appliedFilters.value[idx]
  if (!filter) return
  filter.params[key] = value
  timelineStore.updateClip(selectedClip.value.id, { filters: [...appliedFilters.value] })
  triggerSave()
}
</script>

<style scoped>
.filter-panel {
  background-color: #16213e;
  border-left: 1px solid #0f3460;
  padding: 12px;
  overflow-y: auto;
  height: 100%;
}

.filter-panel.empty {
  display: flex;
  flex-direction: column;
}

.panel-header {
  font-size: 13px;
  font-weight: 600;
  color: #e94560;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid #0f3460;
}

.section-label {
  font-size: 11px;
  color: #888;
  margin-bottom: 8px;
  text-transform: uppercase;
}

.applied-section {
  margin-bottom: 16px;
}

.filter-item {
  background-color: #1a1a2e;
  border: 1px solid #0f3460;
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 8px;
}

.filter-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.filter-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 12px;
  color: #ccc;
}

.filter-toggle input {
  accent-color: #e94560;
}

.filter-name {
  font-size: 12px;
  color: #ddd;
}

.remove-btn {
  width: 20px;
  height: 20px;
  background: none;
  border: none;
  color: #666;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
}

.remove-btn:hover {
  background-color: #e94560;
  color: #fff;
}

.filter-params {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid #0f3460;
}

.filter-range {
  flex: 1;
  height: 4px;
  accent-color: #e94560;
  cursor: pointer;
}

.filter-param-val {
  font-size: 11px;
  color: #888;
  min-width: 28px;
  text-align: right;
}

.filter-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.add-filter-btn {
  padding: 4px 10px;
  background-color: #1a1a2e;
  border: 1px solid #333;
  border-radius: 4px;
  color: #aaa;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.add-filter-btn:hover:not(:disabled) {
  border-color: #e94560;
  color: #fff;
}

.add-filter-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toggle-label {
  font-size: 12px;
  color: #ccc;
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}

.toggle-label input {
  accent-color: #e94560;
}

.empty-hint {
  font-size: 12px;
  color: #555;
  text-align: center;
  margin-top: 24px;
}
</style>
