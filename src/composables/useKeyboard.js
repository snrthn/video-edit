/**
 * useKeyboard — 全局键盘快捷键
 *
 * 在 VideoEditLayout 中调用 setup，监听 keydown 事件。
 * 向输入框内输入时不触发快捷键。
 */

import { onMounted, onUnmounted } from 'vue'
import { useTimelineStore, usePlayerStore } from '../stores'
import { useVideoEditor } from '../hooks/useVideoEditor'
import { usePlayer as usePlayerHook } from '../hooks/usePlayer'
import { SKIP_DELTA } from '../core/constants'
import { triggerSave } from '../main'

export function useKeyboard() {
  // 这些在 setup 中调用，pinia 在 app 挂载后才可用
  let timelineStore, playerStore, editor, playerHook

  function ensureStores() {
    if (!timelineStore) timelineStore = useTimelineStore()
    if (!playerStore) playerStore = usePlayerStore()
    if (!editor) editor = useVideoEditor()
    if (!playerHook) playerHook = usePlayerHook()
  }

  const handlers = {
    // Space: 播放/暂停
    'Space'(e) {
      e.preventDefault()
      ensureStores()
      if (playerStore.isPlaying) {
        playerHook.pause()
      } else {
        playerHook.play()
      }
    },

    // 撤销/重做
    'KeyZ'(e) {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      ensureStores()
      if (e.shiftKey) {
        editor.redo()
      } else {
        editor.undo()
      }
    },
    'KeyY'(e) {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      ensureStores()
      editor.redo()
    },

    // 删除选中的 clip
    'Delete'(e) {
      ensureStores()
      const ids = [...timelineStore.selectedClipIds]
      if (ids.length === 0) return
      e.preventDefault()
      ids.forEach(id => timelineStore.removeClip(id))
      timelineStore.selectClips([])
      triggerSave()
    },
    'Backspace'(e) {
      // 不在输入框内时才触发
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      ensureStores()
      const ids = [...timelineStore.selectedClipIds]
      if (ids.length === 0) return
      e.preventDefault()
      ids.forEach(id => timelineStore.removeClip(id))
      timelineStore.selectClips([])
      triggerSave()
    },

    // 全选
    'KeyA'(e) {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      ensureStores()
      const allIds = []
      timelineStore.tracks.forEach(track =>
        track.clips.forEach(clip => allIds.push(clip.id))
      )
      timelineStore.selectClips(allIds)
    },

    // 分割
    'KeyS'(e) {
      if (e.ctrlKey || e.metaKey) return // Ctrl+S 是保存
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      ensureStores()
      if (timelineStore.selectedClipIds.length !== 1) return
      e.preventDefault()
      editor.splitClip(timelineStore.selectedClipIds[0], timelineStore.playheadPosition)
    },

    // 保存
    'KeyS-save'(e) {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      triggerSave()
    },

    // 快进/后退
    'ArrowLeft'(e) {
      ensureStores()
      if (timelineStore.selectedClipIds.length > 0) return // 有选中时不用快捷键导航
      e.preventDefault()
      playerHook.seekRelative(-SKIP_DELTA)
    },
    'ArrowRight'(e) {
      ensureStores()
      if (timelineStore.selectedClipIds.length > 0) return
      e.preventDefault()
      playerHook.seekRelative(SKIP_DELTA)
    },

    // 跳转到头/尾
    'Home'(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      ensureStores()
      e.preventDefault()
      playerHook.seek(0)
    },
    'End'(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      ensureStores()
      e.preventDefault()
      playerHook.seek(timelineStore.duration)
    },

    // Escape: 取消选择
    'Escape'(e) {
      ensureStores()
      timelineStore.selectClips([])
      timelineStore.selectTrack(null)
    }
  }

  function onKeyDown(e) {
    // 在输入框内不处理（除了 Escape 和特殊组合键）
    const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable

    const code = e.code
    const isCtrl = e.ctrlKey || e.metaKey

    // 构建 key 标识
    let key = code
    if (code === 'KeyS' && isCtrl) key = 'KeyS-save'

    const handler = handlers[key]
    if (handler) {
      // 在输入框内只处理特定的组合键
      if (isInput && !['KeyZ', 'KeyY', 'KeyA', 'KeyS-save'].includes(key)) return
      handler(e)
    }
  }

  onMounted(() => {
    document.addEventListener('keydown', onKeyDown)
  })

  onUnmounted(() => {
    document.removeEventListener('keydown', onKeyDown)
  })
}