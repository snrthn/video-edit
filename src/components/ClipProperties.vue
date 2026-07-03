<template>
  <div v-if="selectedClip" class="clip-properties">
    <div class="panel-header">{{ isTextClip ? '字幕属性' : '剪辑属性' }}</div>

    <!-- === 文字 clip 编辑 === -->
    <template v-if="isTextClip">
      <div class="prop-group">
        <label class="prop-label">文字内容</label>
        <textarea
          class="prop-textarea"
          :value="selectedClip.content"
          rows="3"
          placeholder="输入字幕文字"
          @change="e => updateTextContent(e.target.value)"
        />
      </div>

      <div class="prop-group">
        <label class="prop-label">字体大小</label>
        <div class="prop-range-row">
          <input type="range" class="prop-range" min="12" max="120" step="2"
            :value="selectedClip.textStyle?.fontSize ?? 36"
            @input="e => updateTextStyle('fontSize', parseInt(e.target.value))" />
          <span class="prop-range-value">{{ selectedClip.textStyle?.fontSize ?? 36 }}px</span>
        </div>
      </div>

      <div class="prop-group">
        <label class="prop-label">文字颜色</label>
        <div class="prop-color-row">
          <input type="color" class="prop-color"
            :value="selectedClip.textStyle?.color ?? '#ffffff'"
            @change="e => updateTextStyle('color', e.target.value)" />
          <span class="prop-color-value">{{ selectedClip.textStyle?.color ?? '#ffffff' }}</span>
        </div>
      </div>

      <div class="prop-group">
        <label class="prop-label">背景颜色</label>
        <div class="prop-color-row">
          <input type="color" class="prop-color"
            :value="bgColorValue"
            @change="e => updateTextStyle('backgroundColor', e.target.value)" />
          <span class="prop-color-value">{{ selectedClip.textStyle?.backgroundColor }}</span>
          <button class="preset-btn" @click="updateTextStyle('backgroundColor', 'transparent')">透明</button>
        </div>
      </div>

      <div class="prop-group">
        <label class="prop-label">水平位置</label>
        <div class="prop-presets">
          <button v-for="pos in ['left','center','right']" :key="pos"
            class="preset-btn" :class="{ active: selectedClip.textStyle?.x === pos }"
            @click="updateTextStyle('x', pos)">{{ pos }}</button>
        </div>
      </div>

      <div class="prop-group">
        <label class="prop-label">垂直位置</label>
        <div class="prop-presets">
          <button v-for="pos in ['top','center','bottom']" :key="pos"
            class="preset-btn" :class="{ active: selectedClip.textStyle?.y === pos }"
            @click="updateTextStyle('y', pos)">{{ pos }}</button>
        </div>
      </div>

      <div class="prop-group">
        <label class="prop-label">样式</label>
        <div class="prop-presets">
          <button class="preset-btn" :class="{ active: selectedClip.textStyle?.bold }"
            @click="updateTextStyle('bold', !selectedClip.textStyle?.bold)"><b>B</b></button>
          <button class="preset-btn" :class="{ active: selectedClip.textStyle?.italic }"
            @click="updateTextStyle('italic', !selectedClip.textStyle?.italic)"><i>I</i></button>
          <button class="preset-btn" :class="{ active: selectedClip.textStyle?.shadow }"
            @click="updateTextStyle('shadow', !selectedClip.textStyle?.shadow)">阴影</button>
        </div>
      </div>

      <div class="prop-separator" />

      <div class="prop-group">
        <label class="prop-label">开始时间</label>
        <div class="prop-input-row">
          <input type="number" class="prop-input" :value="selectedClip.startTime"
            step="0.1" min="0"
            @change="e => updateTextProp('startTime', parseFloat(e.target.value))" />
          <span class="prop-unit">秒</span>
        </div>
      </div>

      <div class="prop-group">
        <label class="prop-label">结束时间</label>
        <div class="prop-input-row">
          <input type="number" class="prop-input" :value="selectedClip.endTime"
            step="0.1" min="0"
            @change="e => updateTextProp('endTime', parseFloat(e.target.value))" />
          <span class="prop-unit">秒</span>
        </div>
      </div>
    </template>

    <!-- === 视频 clip 属性 === -->
    <template v-else>
      <div class="prop-group">
        <label class="prop-label">素材</label>
        <div class="prop-value readonly">{{ videoName }}</div>
      </div>

      <div class="prop-group">
        <label class="prop-label">起始时间</label>
        <div class="prop-input-row">
          <input type="number" class="prop-input" :value="selectedClip.startTime"
            step="0.1" min="0"
            @change="e => updateProp('startTime', parseFloat(e.target.value))" />
          <span class="prop-unit">秒</span>
        </div>
      </div>

      <div class="prop-group">
        <label class="prop-label">结束时间</label>
        <div class="prop-input-row">
          <input type="number" class="prop-input" :value="selectedClip.endTime"
            step="0.1" min="0"
            @change="e => updateProp('endTime', parseFloat(e.target.value))" />
          <span class="prop-unit">秒</span>
        </div>
      </div>

      <div class="prop-group">
        <label class="prop-label">持续时间</label>
        <div class="prop-value readonly">{{ formatDuration }}</div>
      </div>

      <div class="prop-separator" />

      <div class="prop-group">
        <label class="prop-label">速度</label>
        <div class="prop-range-row">
          <input type="range" class="prop-range" min="0.25" max="4" step="0.05"
            :value="selectedClip.speed"
            @input="e => updateProp('speed', parseFloat(e.target.value))" />
          <span class="prop-range-value">{{ selectedClip.speed?.toFixed(2) }}x</span>
        </div>
      </div>
      <div class="prop-speed-presets">
        <button v-for="s in speedPresets" :key="s"
          class="preset-btn" :class="{ active: selectedClip.speed === s }"
          @click="updateProp('speed', s)">{{ s }}x</button>
      </div>

      <div class="prop-separator" />

      <div class="prop-group">
        <label class="prop-label">音量</label>
        <div class="prop-range-row">
          <input type="range" class="prop-range" min="0" max="2" step="0.05"
            :value="selectedClip.volume"
            @input="e => updateProp('volume', parseFloat(e.target.value))" />
          <span class="prop-range-value">{{ ((selectedClip.volume ?? 1) * 100).toFixed(0) }}%</span>
        </div>
      </div>

      <div class="prop-separator" />

      <!-- === 关联音频 === -->
      <template v-if="linkedAudioInfo">
        <div class="prop-group">
          <label class="prop-label">关联音频</label>
          <div class="prop-value readonly">{{ linkedAudioInfo.name }}</div>
        </div>
        <div class="action-btns">
          <button class="action-btn detach-btn" @click="handleDetachAudio">分离音频</button>
          <button class="action-btn replace-btn" @click="openAudioFilePicker">替换音频</button>
        </div>
        <input
          ref="audioFileInput"
          type="file"
          accept="audio/*"
          style="display:none"
          @change="handleReplaceAudio"
        />
        <div class="prop-separator" />
      </template>

      <div class="prop-group">
        <label class="prop-label">素材起始偏移</label>
        <div class="prop-input-row">
          <input type="number" class="prop-input" :value="selectedClip.sourceStart"
            step="0.1" min="0"
            @change="e => updateProp('sourceStart', parseFloat(e.target.value))" />
          <span class="prop-unit">秒</span>
        </div>
      </div>
    </template>
  </div>

  <div v-else class="clip-properties empty">
    <div class="panel-header">剪辑属性</div>
    <div class="empty-hint">选中时间轴上的剪辑片段以查看属性</div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useTimelineStore, useProjectStore } from '../stores'
import { useVideoEditor } from '../hooks/useVideoEditor'
import { useVideoImporter } from '../hooks/useVideoImporter'
import { triggerSave } from '../main'

const timelineStore = useTimelineStore()
const projectStore = useProjectStore()
const { detachAudio, replaceAudioSource } = useVideoEditor()
const { importAudioFromFile } = useVideoImporter()

const speedPresets = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]

const selectedClip = computed(() => {
  if (timelineStore.selectedClipIds.length !== 1) return null
  return timelineStore.selectedClips[0] || null
})

// 查找 clip 所在轨道的信息
const selectedClipContext = computed(() => {
  if (!selectedClip.value) return null
  return timelineStore.findClipById(selectedClip.value.id) || null
})

const isTextClip = computed(() => {
  return selectedClip.value?.type === 'text' || selectedClip.value?.content !== undefined
})

const videoName = computed(() => {
  if (!selectedClip.value) return ''
  const video = projectStore.getVideo(selectedClip.value.videoId)
  return video?.name || '未知素材'
})

/** 当前选中 clip 关联的音频信息 */
const linkedAudioInfo = computed(() => {
  if (!selectedClip.value || !selectedClip.value.linkedClipId) return null
  const linked = timelineStore.findClipById(selectedClip.value.linkedClipId)
  if (!linked) return null
  // 只有当 selectedClip 是视频、linked 是音频时显示
  if (selectedClipContext.value?.track.type !== 'video' || linked.track.type !== 'audio') return null
  const audio = projectStore.getVideo(linked.clip.videoId)
  return {
    clipId: linked.clip.id,
    name: audio?.name || '音频素材',
    trackName: linked.track.name
  }
})

const bgColorValue = computed(() => {
  const bg = selectedClip.value?.textStyle?.backgroundColor
  if (!bg || bg === 'transparent') return '#000000'
  return bg
})

const formatDuration = computed(() => {
  if (!selectedClip.value) return ''
  const dur = selectedClip.value.endTime - selectedClip.value.startTime
  const mins = Math.floor(dur / 60)
  const secs = (dur % 60).toFixed(1)
  return mins > 0 ? `${mins}分${secs.padStart(4, '0')}秒` : `${secs}秒`
})

const audioFileInput = ref(null)

function openAudioFilePicker() {
  audioFileInput.value?.click()
}

async function handleReplaceAudio(e) {
  const file = e.target.files?.[0]
  if (!file || !linkedAudioInfo.value) return
  try {
    const audioAsset = await importAudioFromFile(file)
    if (audioAsset) {
      replaceAudioSource(linkedAudioInfo.value.clipId, audioAsset.id)
      triggerSave()
    }
  } catch (err) {
    console.error('替换音频失败:', err)
  }
  // 重置 input，确保可以再次选择同一文件
  if (audioFileInput.value) audioFileInput.value.value = ''
}

function handleDetachAudio() {
  if (!selectedClip.value) return
  detachAudio(selectedClip.value.id)
  triggerSave()
}

function updateProp(key, value) {
  if (!selectedClip.value || isNaN(value)) return
  timelineStore.updateClip(selectedClip.value.id, { [key]: value })
  triggerSave()
}

function updateTextContent(content) {
  if (!selectedClip.value) return
  timelineStore.updateTextClip(selectedClip.value.id, { content })
  triggerSave()
}

function updateTextStyle(key, value) {
  if (!selectedClip.value) return
  timelineStore.updateTextClip(selectedClip.value.id, {
    textStyle: { [key]: value }
  })
  triggerSave()
}

function updateTextProp(key, value) {
  if (!selectedClip.value || isNaN(value)) return
  timelineStore.updateTextClip(selectedClip.value.id, { [key]: value })
  triggerSave()
}
</script>

<style scoped>
.clip-properties {
  background-color: #16213e;
  border-left: 1px solid #0f3460;
  padding: 12px;
  overflow-y: auto;
  height: 100%;
}

.clip-properties.empty {
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

.prop-group {
  margin-bottom: 12px;
}

.prop-label {
  display: block;
  font-size: 11px;
  color: #888;
  margin-bottom: 4px;
}

.prop-value {
  font-size: 13px;
  color: #ccc;
  padding: 4px 0;
}

.prop-value.readonly {
  color: #ccc;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  display: block;
}

.prop-input-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.prop-input {
  width: 70px;
  padding: 4px 8px;
  background-color: #1a1a2e;
  border: 1px solid #333;
  border-radius: 4px;
  color: #fff;
  font-size: 13px;
  outline: none;
}

.prop-input:focus {
  border-color: #e94560;
}

.prop-unit {
  font-size: 12px;
  color: #666;
}

.prop-range-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.prop-range {
  flex: 1;
  height: 4px;
  accent-color: #e94560;
  cursor: pointer;
}

.prop-range-value {
  font-size: 12px;
  color: #aaa;
  min-width: 40px;
  text-align: right;
}

.prop-speed-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.prop-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.prop-textarea {
  width: 100%;
  padding: 6px 8px;
  background-color: #1a1a2e;
  border: 1px solid #333;
  border-radius: 4px;
  color: #fff;
  font-size: 13px;
  resize: vertical;
  outline: none;
  font-family: inherit;
  box-sizing: border-box;
}

.prop-textarea:focus {
  border-color: #e94560;
}

.prop-color-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.prop-color {
  width: 36px;
  height: 28px;
  padding: 0;
  border: 1px solid #333;
  border-radius: 4px;
  cursor: pointer;
  background: none;
}

.prop-color-value {
  font-size: 11px;
  color: #888;
  min-width: 60px;
}

.preset-btn {
  padding: 2px 8px;
  background-color: #1a1a2e;
  border: 1px solid #333;
  border-radius: 3px;
  color: #888;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.preset-btn:hover {
  border-color: #e94560;
  color: #fff;
}

.preset-btn.active {
  background-color: #e94560;
  border-color: #e94560;
  color: #fff;
}

.prop-separator {
  height: 1px;
  background-color: #0f3460;
  margin: 12px 0;
}

.empty-hint {
  font-size: 12px;
  color: #555;
  text-align: center;
  margin-top: 24px;
}

.action-btn {
  display: block;
  flex: 1;
  padding: 6px 12px;
  border: 1px solid #333;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.action-btns {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}

.detach-btn {
  background-color: #1a1a2e;
  color: #e94560;
  border-color: #e94560;
}

.detach-btn:hover {
  background-color: #e94560;
  color: #fff;
}

.replace-btn {
  background-color: #1a1a2e;
  color: #f0a500;
  border-color: #f0a500;
}

.replace-btn:hover {
  background-color: #f0a500;
  color: #fff;
}
</style>
