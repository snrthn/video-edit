<template>
  <canvas ref="canvasRef" class="text-overlay-canvas" />
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useTimelineStore } from '../stores'

const props = defineProps({
  containerWidth:  { type: Number, default: 640 },
  containerHeight: { type: Number, default: 360 }
})

const timelineStore = useTimelineStore()
const canvasRef = ref(null)

const activeTexts = computed(() => {
  return timelineStore.getActiveTextClips(timelineStore.playheadPosition)
})

function updateCanvasAndDraw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const w = Math.round(props.containerWidth)
  const h = Math.round(props.containerHeight)
  if (w < 1 || h < 1) return
  canvas.width = w
  canvas.height = h
  drawTexts()
}

function drawTexts() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)
  for (const clip of activeTexts.value) {
    drawSingleText(ctx, clip)
  }
}

function drawSingleText(ctx, textClip) {
  const s = textClip.textStyle
  if (!s) return

  const canvas = ctx.canvas
  const w = canvas.width
  const h = canvas.height

  // 字号按容器高度等比缩放（基准 360px）
  const scale = h / 360
  const renderFontSize = Math.max(12, Math.round(s.fontSize * scale))

  ctx.save()

  const weight = s.bold ? 'bold ' : ''
  const style  = s.italic ? 'italic ' : ''
  ctx.font = `${style}${weight}${renderFontSize}px ${s.fontFamily}`

  if (s.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.7)'
    ctx.shadowBlur = Math.round(4 * scale)
    ctx.shadowOffsetX = Math.round(2 * scale)
    ctx.shadowOffsetY = Math.round(2 * scale)
  }

  const metrics = ctx.measureText(textClip.content)
  const textWidth  = metrics.width
  const textHeight = renderFontSize

  const pad = Math.round(8 * scale)
  let x, y

  switch (s.x) {
    case 'left':   x = pad; break
    case 'right':  x = w - textWidth - pad; break
    default:       x = (w - textWidth) / 2; break   // center
  }

  switch (s.y) {
    case 'top':    y = textHeight + pad; break
    case 'bottom': y = h - pad; break
    default:       y = h / 2 + textHeight / 3; break // center
  }

  // 背景气泡
  if (s.backgroundColor && s.backgroundColor !== 'transparent') {
    const bgX = x - pad
    const bgY = y - textHeight * 0.8 - pad
    const bgW = textWidth + pad * 2
    const bgH = textHeight + pad * 2
    ctx.fillStyle = s.backgroundColor
    const r = Math.round(4 * scale)
    ctx.beginPath()
    ctx.moveTo(bgX + r, bgY)
    ctx.lineTo(bgX + bgW - r, bgY)
    ctx.quadraticCurveTo(bgX + bgW, bgY, bgX + bgW, bgY + r)
    ctx.lineTo(bgX + bgW, bgY + bgH - r)
    ctx.quadraticCurveTo(bgX + bgW, bgY + bgH, bgX + bgW - r, bgY + bgH)
    ctx.lineTo(bgX + r, bgY + bgH)
    ctx.quadraticCurveTo(bgX, bgY + bgH, bgX, bgY + bgH - r)
    ctx.lineTo(bgX, bgY + r)
    ctx.quadraticCurveTo(bgX, bgY, bgX + r, bgY)
    ctx.closePath()
    ctx.fill()
  }

  ctx.fillStyle = s.color
  ctx.textBaseline = 'top'
  ctx.fillText(textClip.content, x, y)
  ctx.restore()
}

// 容器尺寸变化 → 更新 canvas buffer 并重绘
watch(
  () => [props.containerWidth, props.containerHeight],
  () => { updateCanvasAndDraw() },
  { immediate: true }
)

// 活跃字幕变化 → 重绘
watch(activeTexts, () => { drawTexts() }, { deep: true })

onMounted(() => { updateCanvasAndDraw() })
onBeforeUnmount(() => {})
</script>

<style scoped>
.text-overlay-canvas {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  pointer-events: none;
  z-index: 10;
}
</style>
