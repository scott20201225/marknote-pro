<template>
  <div ref="surfaceRef" class="mindmap-surface" />
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { usePreferencesStore } from '@/store/preferences'
import { useLayoutStore } from '@/store/layout'
import { useEditorStore } from '@/store/editor'
import type { DrawioBounds } from '@shared/types/ipc'

const surfaceRef = ref<HTMLDivElement | null>(null)
const preferencesStore = usePreferencesStore()
const layoutStore = useLayoutStore()
const editorStore = useEditorStore()
const { zoom } = storeToRefs(preferencesStore)
const { currentFile } = storeToRefs(editorStore)
const { rightColumn, sideBarWidth, noteNavigationMode, noteListWidth } = storeToRefs(layoutStore)
let boundsSyncAnimationFrame = 0
let removeOpenedListener: (() => void) | null = null
let resizeObserver: ResizeObserver | null = null

const getBounds = (): DrawioBounds | null => {
  const rect = surfaceRef.value?.getBoundingClientRect()
  if (!rect) return null
  const noteListRect = document.querySelector<HTMLElement>('.note-list-panel')?.getBoundingClientRect()
  const left =
    noteListRect && noteListRect.right > rect.left
      ? Math.min(noteListRect.right, rect.right)
      : rect.left
  const top = Math.max(0, rect.top)
  const zoomFactor = window.electron.webFrame.getZoomFactor()
  return {
    x: left * zoomFactor,
    y: top * zoomFactor,
    width: Math.max(1, rect.right - left) * zoomFactor,
    height: Math.max(1, rect.height) * zoomFactor
  }
}

let lastSentBoundsKey = ''

const getBoundsKey = (bounds: DrawioBounds): string =>
  `${Math.round(bounds.x)},${Math.round(bounds.y)},${Math.round(bounds.width)},${Math.round(bounds.height)}`

const showMindMap = async (): Promise<void> => {
  await nextTick()
  const bounds = getBounds()
  if (!bounds) return
  lastSentBoundsKey = getBoundsKey(bounds)
  await window.electron.ipcRenderer.invoke('mt::mindmap::show', bounds)
}

const syncBounds = (): void => {
  const bounds = getBounds()
  if (!bounds) return
  const nextKey = getBoundsKey(bounds)
  if (nextKey === lastSentBoundsKey) return
  lastSentBoundsKey = nextKey
  window.electron.ipcRenderer.send('mt::mindmap::set-bounds', bounds)
}

const syncBoundsDuringResize = (duration = 600): void => {
  if (boundsSyncAnimationFrame) window.cancelAnimationFrame(boundsSyncAnimationFrame)
  const startedAt = window.performance.now()
  const step = (): void => {
    syncBounds()
    if (window.performance.now() - startedAt < duration) {
      boundsSyncAnimationFrame = window.requestAnimationFrame(step)
    } else {
      boundsSyncAnimationFrame = 0
    }
  }
  boundsSyncAnimationFrame = window.requestAnimationFrame(step)
}

watch(
  () => currentFile.value?.isMindMap,
  (isMindMap) => {
    if (isMindMap) void showMindMap()
  }
)

watch(
  [sideBarWidth, noteNavigationMode, noteListWidth, rightColumn],
  () => {
    if (currentFile.value?.isMindMap) syncBoundsDuringResize()
  }
)

watch(zoom, () => {
  if (currentFile.value?.isMindMap) syncBoundsDuringResize(220)
})

onMounted(() => {
  removeOpenedListener = window.electron.ipcRenderer.on('mt::mindmap::opened', () => {
    void showMindMap()
  })

  if (window.ResizeObserver && surfaceRef.value) {
    resizeObserver = new ResizeObserver(() => {
      if (currentFile.value?.isMindMap) syncBounds()
    })
    resizeObserver.observe(surfaceRef.value)
  }

  if (currentFile.value?.isMindMap) void showMindMap()
})

onBeforeUnmount(() => {
  if (removeOpenedListener) removeOpenedListener()
  if (resizeObserver) resizeObserver.disconnect()
  if (boundsSyncAnimationFrame) window.cancelAnimationFrame(boundsSyncAnimationFrame)
})
</script>

<style scoped>
.mindmap-surface {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  background: transparent;
}
</style>
