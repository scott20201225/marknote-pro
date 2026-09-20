<template>
  <div ref="surfaceRef" class="drawio-surface" />
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { usePreferencesStore } from '@/store/preferences'
import { useLayoutStore } from '@/store/layout'
import type { DrawioBounds, DrawioConfiguration } from '@shared/types/ipc'

const surfaceRef = ref<HTMLDivElement | null>(null)
const preferencesStore = usePreferencesStore()
const layoutStore = useLayoutStore()
const { zoom } = storeToRefs(preferencesStore)
const { rightColumn, sideBarWidth, noteNavigationMode, noteListWidth } = storeToRefs(layoutStore)
let boundsSyncAnimationFrame = 0
let themeObserver: MutationObserver | null = null
let lastConfiguration = ''

const getConfiguration = (): DrawioConfiguration => ({
  language: preferencesStore.language,
  dark: document.body.classList.contains('dark')
})

const syncConfiguration = (): void => {
  const configuration = getConfiguration()
  const fingerprint = JSON.stringify(configuration)
  if (fingerprint === lastConfiguration) return
  lastConfiguration = fingerprint
  void window.electron.ipcRenderer.invoke('mt::drawio::configure', configuration)
}

const getBounds = (): DrawioBounds | null => {
  const rect = surfaceRef.value?.getBoundingClientRect()
  if (!rect) return null

  // In tree/list mode the note list may temporarily overflow the sidebar while
  // its width is being recalculated. BrowserView is outside the DOM stacking
  // context, so it would otherwise paint over that list. Use the rendered
  // panel edge rather than assuming the editor area's left edge is final.
  const noteListRect = document.querySelector<HTMLElement>('.note-list-panel')?.getBoundingClientRect()
  const left = noteListRect && noteListRect.right > rect.left
    ? Math.min(noteListRect.right, rect.right)
    : rect.left
  const zoomFactor = window.electron.webFrame.getZoomFactor()
  return {
    x: left * zoomFactor,
    y: rect.top * zoomFactor,
    width: Math.max(1, rect.right - left) * zoomFactor,
    height: rect.height * zoomFactor
  }
}

const showDrawio = async (): Promise<void> => {
  await nextTick()
  const bounds = getBounds()
  if (bounds) await window.electron.ipcRenderer.invoke('mt::drawio::show', bounds)
}

const syncBounds = (): void => {
  const bounds = getBounds()
  if (bounds) window.electron.ipcRenderer.send('mt::drawio::set-bounds', bounds)
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

onMounted(() => {
  syncConfiguration()
  void showDrawio()
  window.addEventListener('resize', syncBounds)
  themeObserver = new MutationObserver(() => syncConfiguration())
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] })
})

watch(zoom, () => {
  syncBoundsDuringZoom()
})

watch(
  () => preferencesStore.language,
  () => syncConfiguration()
)

watch(
  () => preferencesStore.theme,
  () => nextTick(syncConfiguration)
)

watch(
  [rightColumn, sideBarWidth, noteNavigationMode, noteListWidth],
  () => {
    // Sidebar mode changes update after Vue lays out the split panels.
    nextTick(syncBounds)
  }
)

onBeforeUnmount(() => {
  if (boundsSyncAnimationFrame) window.cancelAnimationFrame(boundsSyncAnimationFrame)
  themeObserver?.disconnect()
  themeObserver = null
  window.removeEventListener('resize', syncBounds)
  window.electron.ipcRenderer.send('mt::drawio::hide')
})
</script>

<style scoped>
.drawio-surface {
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
