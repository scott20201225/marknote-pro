<template>
  <div
    class="pin-window-container"
    :style="{ opacity: windowOpacity }"
    @mousedown="onMouseDown"
    @wheel="onWheel"
    @dblclick="closePin"
    @contextmenu.prevent="openContextMenu"
    @keydown="onKeydown"
    tabindex="0"
  >
    <!-- Hover Action Bar -->
    <div class="hover-toolbar">
      <span class="zoom-badge">{{ Math.round(zoomLevel * 100) }}%</span>
      <button class="mini-btn" title="重置缩放 (100%)" @click.stop="resetZoom">1:1</button>
      <button class="mini-btn" title="复制图片" @click.stop="copyPin">📋</button>
      <button class="mini-btn" title="保存图片" @click.stop="savePin">💾</button>
      <button class="mini-btn close" title="关闭贴图 (双击 / Esc)" @click.stop="closePin">✕</button>
    </div>

    <!-- Pinned Image View -->
    <div v-if="payload?.type === 'image'" class="pinned-image-view">
      <img
        :src="getImageSrc(payload.content)"
        class="pinned-img"
        :style="{ transform: `scale(${zoomLevel})` }"
        alt="Pinned Image"
        draggable="false"
      />
    </div>

    <!-- Pinned Text / Code Card View -->
    <div
      v-else-if="payload?.type === 'text'"
      class="pinned-text-view"
      :style="{ transform: `scale(${zoomLevel})` }"
    >
      <div class="text-card-header">
        <span class="text-card-badge">📌 文本贴图</span>
      </div>
      <div class="text-card-body">
        <pre class="text-content"><code>{{ payload.content }}</code></pre>
      </div>
    </div>

    <!-- Loading Placeholder (Avoid pure invisible blank window) -->
    <div v-else class="pinned-loading-view">
      <div class="pinned-spinner"></div>
      <span class="loading-text">加载贴图中...</span>
    </div>

    <!-- Custom Right-Click Context Menu -->
    <div
      v-if="contextMenuVisible"
      class="custom-context-menu"
      :style="{ left: `${contextMenuX}px`, top: `${contextMenuY}px` }"
      @mousedown.stop
    >
      <div class="menu-item" @click="copyPin">复制图片</div>
      <div class="menu-item" @click="savePin">另存为...</div>
      <div class="menu-divider"></div>
      <div class="menu-item" @click="setZoom(0.5)">缩放至 50%</div>
      <div class="menu-item" @click="resetZoom">恢复 100% (1:1)</div>
      <div class="menu-item" @click="setZoom(1.5)">缩放至 150%</div>
      <div class="menu-item" @click="setZoom(2.0)">缩放至 200%</div>
      <div class="menu-divider"></div>
      <div class="menu-item" @click="toggleAlwaysOnTop">
        {{ isAlwaysOnTop ? '✓ 置顶显示' : '置顶显示' }}
      </div>
      <div class="menu-divider"></div>
      <div class="menu-item danger" @click="closePin">关闭贴图 (Esc)</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { PinWindowPayload } from '@shared/types/clipboard'

const payload = ref<PinWindowPayload | null>(null)
const pinId = ref('')
const zoomLevel = ref(1.0)
const windowOpacity = ref(1.0)
const isAlwaysOnTop = ref(true)

// Drag tracking
let isDragging = false
let startScreenX = 0
let startScreenY = 0

// Context Menu
const contextMenuVisible = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)

const onMouseDown = (e: MouseEvent): void => {
  if (e.button !== 0) return
  contextMenuVisible.value = false
  isDragging = true
  startScreenX = e.screenX
  startScreenY = e.screenY

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

const onMouseMove = (e: MouseEvent): void => {
  if (!isDragging) return
  const dx = e.screenX - startScreenX
  const dy = e.screenY - startScreenY
  startScreenX = e.screenX
  startScreenY = e.screenY

  window.electron.ipcRenderer.send('mt::pin-window-drag', {
    dx,
    dy,
    pinId: pinId.value
  })
}

const onMouseUp = (): void => {
  isDragging = false
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
}

// Mouse Wheel Zoom
const onWheel = (e: WheelEvent): void => {
  e.preventDefault()
  const delta = e.deltaY > 0 ? -0.08 : 0.08
  const nextZoom = Math.min(Math.max(zoomLevel.value + delta, 0.2), 6.0)
  zoomLevel.value = Math.round(nextZoom * 100) / 100
}

const resetZoom = (): void => {
  zoomLevel.value = 1.0
  contextMenuVisible.value = false
}

const setZoom = (z: number): void => {
  zoomLevel.value = z
  contextMenuVisible.value = false
}

const toggleAlwaysOnTop = (): void => {
  isAlwaysOnTop.value = !isAlwaysOnTop.value
  window.electron.ipcRenderer.send(
    'mt::pin-window-set-always-on-top',
    isAlwaysOnTop.value,
    pinId.value
  )
  contextMenuVisible.value = false
}

const closePin = (): void => {
  window.electron.ipcRenderer.send('mt::pin-window-close', pinId.value)
}

const copyPin = async (): Promise<void> => {
  if (!payload.value) return
  await window.electron.ipcRenderer.invoke('mt::pin-window-copy', payload.value.content)
  contextMenuVisible.value = false
}

const savePin = async (): Promise<void> => {
  if (!payload.value) return
  await window.electron.ipcRenderer.invoke('mt::pin-window-save', payload.value.content)
  contextMenuVisible.value = false
}

const openContextMenu = (e: MouseEvent): void => {
  contextMenuVisible.value = true
  contextMenuX.value = Math.min(e.clientX, window.innerWidth - 160)
  contextMenuY.value = Math.min(e.clientY, window.innerHeight - 200)
}

const onKeydown = (e: KeyboardEvent): void => {
  if (e.key === 'Escape') {
    e.preventDefault()
    closePin()
    return
  }

  // Number keys 1-9, 0 for opacity (Snipaste feature)
  if (e.key >= '1' && e.key <= '9') {
    windowOpacity.value = Number(e.key) / 10
  } else if (e.key === '0') {
    windowOpacity.value = 1.0
  }

  if ((e.metaKey || e.ctrlKey) && (e.key === 'c' || e.key === 'C')) {
    e.preventDefault()
    copyPin()
    return
  }

  if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
    e.preventDefault()
    savePin()
    return
  }
}

let removeDataSub: (() => void) | null = null

const getImageSrc = (content?: string): string => {
  if (!content) return ''
  if (content.startsWith('data:') || content.startsWith('http://') || content.startsWith('https://')) {
    return content
  }
  if (content.startsWith('/')) {
    return `file://${content}`
  }
  return content
}

onMounted(async () => {
  let id = new URLSearchParams(window.location.search).get('pinId')
  if (!id && window.location.hash.includes('?')) {
    id = new URLSearchParams(window.location.hash.split('?')[1]).get('pinId')
  }
  pinId.value = id || ''

  try {
    const data = await window.electron.ipcRenderer.invoke(
      'mt::pin-window-get-payload',
      pinId.value
    )
    if (data) {
      payload.value = data
    }
  } catch (err) {
    console.error('Failed to get pin payload:', err)
  }

  removeDataSub = window.electron.ipcRenderer.on('mt::pin-window-data', (_event, data) => {
    if (data) {
      payload.value = data
    }
  })

  window.addEventListener('click', () => {
    contextMenuVisible.value = false
  })
})

onUnmounted(() => {
  if (removeDataSub) removeDataSub()
})
</script>

<style scoped>
.pin-window-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  user-select: none;
  overflow: hidden;
  position: relative;
  outline: none;
  cursor: grab;
  box-sizing: border-box;
}

.pin-window-container:active {
  cursor: grabbing;
}

/* Hover Action Bar */
.hover-toolbar {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(18, 20, 24, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  padding: 2px 6px;
  opacity: 0;
  transition: opacity 0.15s ease;
  z-index: 1000;
}

.pin-window-container:hover .hover-toolbar {
  opacity: 1;
}

.zoom-badge {
  font-size: 10px;
  color: #94a3b8;
  padding: 0 4px;
  font-family: monospace;
}

.mini-btn {
  background: transparent;
  border: none;
  color: #cbd5e1;
  font-size: 11px;
  cursor: pointer;
  padding: 3px 5px;
  border-radius: 4px;
}

.mini-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
}

.mini-btn.close:hover {
  background: #ef4444;
  color: #ffffff;
}

/* Pinned Image */
.pinned-image-view {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pinned-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 4px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.15);
  transform-origin: center center;
  transition: transform 0.05s linear;
}

/* Pinned Text View */
.pinned-text-view {
  width: 90%;
  height: 90%;
  background: rgba(26, 29, 36, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.65);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transform-origin: center center;
}

.text-card-header {
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.text-card-badge {
  font-size: 11px;
  color: #f59e0b;
  font-weight: 500;
}

.text-card-body {
  flex: 1;
  padding: 12px;
  overflow: auto;
}

.text-content {
  margin: 0;
  font-family: 'JetBrains Mono', Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
  color: #f1f5f9;
  white-space: pre-wrap;
  word-break: break-all;
}

/* Custom Context Menu */
.custom-context-menu {
  position: absolute;
  background: rgba(24, 27, 34, 0.96);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  padding: 4px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.65);
  z-index: 2000;
  min-width: 140px;
}

.menu-item {
  padding: 6px 12px;
  font-size: 12px;
  color: #cbd5e1;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.1s ease;
}

.menu-item:hover {
  background: #3b82f6;
  color: #ffffff;
}

.menu-item.danger:hover {
  background: #ef4444;
  color: #ffffff;
}

.menu-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 4px 0;
}

/* Loading Placeholder */
.pinned-loading-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 220px;
  height: 140px;
  background: rgba(24, 27, 34, 0.9);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  color: #94a3b8;
  font-size: 12px;
}

.pinned-spinner {
  width: 22px;
  height: 22px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
