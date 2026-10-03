<template>
  <div ref="surfaceRef" class="mindmap-surface" />
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { usePreferencesStore } from '@/store/preferences'
import { getMindMapConfiguration } from '@/util/mindmapConfiguration'
import { useLayoutStore } from '@/store/layout'
import { useEditorStore } from '@/store/editor'
import type { DrawioBounds } from '@shared/types/ipc'

const surfaceRef = ref<HTMLDivElement | null>(null)
const preferencesStore = usePreferencesStore()
const layoutStore = useLayoutStore()
const editorStore = useEditorStore()
const { zoom } = storeToRefs(preferencesStore)
const { currentFile } = storeToRefs(editorStore)
const { rightColumn, sideBarWidth, noteNavigationMode, noteListWidth, showSideBar } = storeToRefs(layoutStore)
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

const resumeAfterHostOverlay = (): void => {
  if (currentFile.value?.isMindMap) {
    void showMindMap().then(() => {
      if (surfaceRef.value) surfaceRef.value.style.backgroundImage = ''
    })
  }
}

const syncBounds = (): void => {
  const bounds = getBounds()
  if (!bounds) return
  const nextKey = getBoundsKey(bounds)
  if (nextKey === lastSentBoundsKey) return
  lastSentBoundsKey = nextKey
  window.electron.ipcRenderer.send('mt::mindmap::set-bounds', bounds)
}

const syncBoundsAfterLayout = (): void => {
  window.requestAnimationFrame(() => syncBoundsDuringResize())
}

const syncBoundsDuringZoom = (duration = 220): void => {
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

const handleWindowResize = (): void => syncBoundsDuringResize()

onMounted(() => {
  void showMindMap()
  removeOpenedListener = window.electron.ipcRenderer.on('mt::mindmap::opened', () => {
    void showMindMap()
  })
  window.addEventListener('resize', handleWindowResize)
  window.addEventListener('marknotepro:resume-native-editor', resumeAfterHostOverlay)
  window.addEventListener('marktextpro:resume-native-editor', resumeAfterHostOverlay)
  if (surfaceRef.value) {
    resizeObserver = new ResizeObserver(syncBoundsAfterLayout)
    resizeObserver.observe(surfaceRef.value)
  }
})

watch(zoom, () => syncBoundsDuringZoom())
watch([rightColumn, sideBarWidth, noteNavigationMode, noteListWidth, showSideBar], () => {
  nextTick(syncBoundsAfterLayout)
})
watch(
  () => [preferencesStore.language, preferencesStore.theme],
  () => {
    void window.electron.ipcRenderer.invoke('mt::mindmap::configure', getMindMapConfiguration())
  }
)
watch(
  () => currentFile.value?.pathname,
  (newPath, oldPath) => {
    if (newPath && newPath !== oldPath && currentFile.value?.isMindMap) {
      void showMindMap()
    }
  }
)

onBeforeUnmount(() => {
  if (surfaceRef.value) surfaceRef.value.style.backgroundImage = ''
  if (boundsSyncAnimationFrame) window.cancelAnimationFrame(boundsSyncAnimationFrame)
  window.removeEventListener('resize', handleWindowResize)
  window.removeEventListener('marknotepro:resume-native-editor', resumeAfterHostOverlay)
  window.removeEventListener('marktextpro:resume-native-editor', resumeAfterHostOverlay)
  resizeObserver?.disconnect()
  resizeObserver = null
  removeOpenedListener?.()
  removeOpenedListener = null
  window.electron.ipcRenderer.send('mt::mindmap::hide')
})
</script>

<style scoped>
.mindmap-surface {
  position: absolute;
  top: calc(var(--titleBarHeight) + 28px);
  right: 0;
  bottom: 0;
  left: 0;
  min-width: 0;
  min-height: 0;
  background: var(--editorBgColor);
}
</style>
