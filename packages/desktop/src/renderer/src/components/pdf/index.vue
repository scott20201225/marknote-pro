<template>
  <div ref="surfaceRef" class="pdf-surface" />
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import bus from '../../bus'
import { usePreferencesStore } from '@/store/preferences'
import { getPdfConfiguration } from '@/util/pdfConfiguration'
import { useLayoutStore } from '@/store/layout'
import { useEditorStore } from '@/store/editor'
import type { DrawioBounds } from '@shared/types/ipc'

const surfaceRef = ref<HTMLDivElement | null>(null)
const preferencesStore = usePreferencesStore()
const layoutStore = useLayoutStore()
const editorStore = useEditorStore()
const { zoom, language } = storeToRefs(preferencesStore)
const { currentFile } = storeToRefs(editorStore)
const { rightColumn, sideBarWidth, showSideBar } = storeToRefs(layoutStore)
let boundsSyncAnimationFrame = 0
let removeOpenedListener: (() => void) | null = null
let resizeObserver: ResizeObserver | null = null
let themeObserver: MutationObserver | null = null
let lastConfiguration = ''

const syncConfiguration = (force = false): void => {
  const configuration = getPdfConfiguration()
  const fingerprint = JSON.stringify(configuration)
  if (!force && fingerprint === lastConfiguration) return
  lastConfiguration = fingerprint
  void window.electron.ipcRenderer.invoke('mt::pdf::configure', configuration)
}

const getBounds = (): DrawioBounds | null => {
  const rect = surfaceRef.value?.getBoundingClientRect()
  if (!rect) return null
  const top = Math.max(0, rect.top)
  const zoomFactor = window.electron.webFrame.getZoomFactor()
  return {
    x: rect.left * zoomFactor,
    y: top * zoomFactor,
    width: Math.max(1, rect.width) * zoomFactor,
    height: Math.max(1, rect.height) * zoomFactor
  }
}

let lastSentBoundsKey = ''

const getBoundsKey = (bounds: DrawioBounds): string =>
  `${Math.round(bounds.x)},${Math.round(bounds.y)},${Math.round(bounds.width)},${Math.round(bounds.height)}`

const showPdf = async (): Promise<void> => {
  await nextTick()
  const bounds = getBounds()
  if (!bounds) return
  lastSentBoundsKey = getBoundsKey(bounds)
  await window.electron.ipcRenderer.invoke('mt::pdf::show', bounds)
}

const resumeAfterHostOverlay = (): void => {
  if (currentFile.value?.isPdf) {
    syncConfiguration(true)
    void showPdf().then(() => {
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
  window.electron.ipcRenderer.send('mt::pdf::set-bounds', bounds)
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

const onLanguageChanged = (): void => syncConfiguration(true)

onMounted(() => {
  syncConfiguration(true)
  void showPdf()
  removeOpenedListener = window.electron.ipcRenderer.on('mt::pdf::opened', () => {
    syncConfiguration(true)
    void showPdf()
  })
  bus.on('language-changed', onLanguageChanged)
  window.addEventListener('resize', syncBounds)
  window.addEventListener('marktextpro:resume-native-editor', resumeAfterHostOverlay)
  window.addEventListener('marknotepro:resume-native-editor', resumeAfterHostOverlay)
  themeObserver = new MutationObserver(() => syncConfiguration(true))
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
  if (surfaceRef.value) {
    resizeObserver = new ResizeObserver(() => syncBounds())
    resizeObserver.observe(surfaceRef.value)
  }
})

onBeforeUnmount(() => {
  if (boundsSyncAnimationFrame) window.cancelAnimationFrame(boundsSyncAnimationFrame)
  if (removeOpenedListener) removeOpenedListener()
  bus.off('language-changed', onLanguageChanged)
  window.removeEventListener('resize', syncBounds)
  window.removeEventListener('marktextpro:resume-native-editor', resumeAfterHostOverlay)
  window.removeEventListener('marknotepro:resume-native-editor', resumeAfterHostOverlay)
  themeObserver?.disconnect()
  resizeObserver?.disconnect()
})

watch(
  () => currentFile.value?.pathname,
  () => {
    if (currentFile.value?.isPdf) {
      syncConfiguration(true)
      void showPdf()
    } else {
      window.electron.ipcRenderer.send('mt::pdf::hide')
    }
  }
)

watch([sideBarWidth, showSideBar, rightColumn], () => nextTick(syncBounds))
watch(zoom, () => syncBoundsDuringZoom())
watch(language, () => syncConfiguration(true))
</script>

<style scoped>
.pdf-surface {
  position: relative;
  flex: 1;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--editorBgColor, #ffffff);
}
</style>
