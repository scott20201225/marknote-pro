<template>
  <div
    :class="['pin-window-container', isDarkTheme ? 'theme-dark' : 'theme-light']"
    :style="{ opacity: windowOpacity }"
    @mousedown="onMouseDown"
    @wheel="onWheel"
    @dblclick="closePin"
    @contextmenu.prevent="openContextMenu"
    @keydown="onKeydown"
    tabindex="0"
  >
    <!-- 8 Directional Resize Handles for Manual Sizing -->
    <div class="resize-handle handle-t" @mousedown.stop="onResizeStart('t', $event)"></div>
    <div class="resize-handle handle-b" @mousedown.stop="onResizeStart('b', $event)"></div>
    <div class="resize-handle handle-l" @mousedown.stop="onResizeStart('l', $event)"></div>
    <div class="resize-handle handle-r" @mousedown.stop="onResizeStart('r', $event)"></div>
    <div class="resize-handle handle-tl" @mousedown.stop="onResizeStart('tl', $event)"></div>
    <div class="resize-handle handle-tr" @mousedown.stop="onResizeStart('tr', $event)"></div>
    <div class="resize-handle handle-bl" @mousedown.stop="onResizeStart('bl', $event)"></div>
    <div class="resize-handle handle-br" @mousedown.stop="onResizeStart('br', $event)"></div>

    <!-- Hover Action Bar -->
    <div class="hover-toolbar" @mousedown.stop>
      <span class="zoom-badge">{{ Math.round(zoomLevel * 100) }}%</span>
      <button class="mini-btn zoom-btn" :title="tr('zoomReset')" @click.stop="resetZoom">1:1</button>
      <button
        class="mini-btn"
        :class="{ 'btn-success': copiedFeedback }"
        :title="tr('copyImage') + (isOsx ? ' (⌘C)' : ' (Ctrl+C)')"
        @click.stop="copyPin"
      >
        <svg v-if="copiedFeedback" viewBox="0 0 24 24" width="13" height="13" stroke="#22c55e" fill="none" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <svg v-else viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      </button>
      <button class="mini-btn" :title="tr('saveImage') + (isOsx ? ' (⌘S)' : ' (Ctrl+S)')" @click.stop="savePin">
        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
      </button>
      <button class="mini-btn close" :title="tr('closePin')" @click.stop="closePin">
        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>

    <!-- Toast Feedback on Copy -->
    <transition name="toast-fade">
      <div v-if="copiedFeedback" class="pin-copy-toast" @mousedown.stop>
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="#22c55e" fill="none" stroke-width="2.5" style="margin-right: 6px;">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>{{ tr('copied') }}</span>
      </div>
    </transition>

    <!-- Pinned Image View -->
    <div v-if="payload?.type === 'image'" class="pinned-image-view">
      <img
        :src="getImageSrc(payload.content)"
        class="pinned-img"
        alt="Pinned Image"
        draggable="false"
        @load="onImageLoad"
      />
    </div>

    <!-- Pinned Text / Code Card View -->
    <div
      v-else-if="payload?.type === 'text'"
      class="pinned-text-view"
      :style="{ transform: `scale(${zoomLevel})` }"
    >
      <div class="text-card-header">
        <div class="mac-traffic-dots">
          <span class="dot dot-close" :title="tr('closePin')" @click.stop="closePin"></span>
          <span class="dot dot-copy" :title="tr('copyCode')" @click.stop="copyPin"></span>
          <span class="dot dot-ontop" :class="{ active: isAlwaysOnTop }" :title="tr('alwaysOnTop')" @click.stop="toggleAlwaysOnTop"></span>
        </div>
        <span class="text-card-badge">📌 {{ payload.title || '代码 / 文本贴图' }}</span>
        <button class="header-action-btn" :title="tr('copyCode')" @click.stop="copyPin">{{ tr('copyCode') }}</button>
      </div>
      <div class="text-card-body">
        <pre class="text-content"><code>{{ payload.content }}</code></pre>
      </div>
    </div>

    <!-- Loading Placeholder (Avoid pure invisible blank window) -->
    <div v-else class="pinned-loading-view">
      <div class="pinned-spinner"></div>
      <span class="loading-text">{{ tr('loading') }}</span>
    </div>

    <!-- Custom Right-Click Context Menu -->
    <div
      v-if="contextMenuVisible"
      class="custom-context-menu"
      :style="{ left: `${contextMenuX}px`, top: `${contextMenuY}px` }"
      @mousedown.stop
    >
      <div class="menu-item" @click="copyPin">{{ tr('copyImage') }}</div>
      <div class="menu-item" @click="savePin">{{ tr('saveAs') }}</div>
      <div class="menu-divider"></div>
      <div class="menu-item" @click="setZoom(0.5)">{{ tr('zoom50') }}</div>
      <div class="menu-item" @click="resetZoom">{{ tr('zoom100') }}</div>
      <div class="menu-item" @click="setZoom(1.5)">{{ tr('zoom150') }}</div>
      <div class="menu-item" @click="setZoom(2.0)">{{ tr('zoom200') }}</div>
      <div class="menu-divider"></div>
      <div class="menu-item" @click="toggleAlwaysOnTop">
        {{ isAlwaysOnTop ? `✓ ${tr('alwaysOnTop')}` : tr('alwaysOnTop') }}
      </div>
      <div class="menu-divider"></div>
      <div class="menu-item danger" @click="closePin">{{ tr('closePin') }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { PinWindowPayload } from '@shared/types/clipboard'
import { isDarkThemeId } from '../../../common/theme'

const isDarkTheme = ref(false)
const currentLang = ref('zh-CN')

const pinI18n: Record<string, Record<string, string>> = {
  'zh-CN': {
    zoomReset: '恢复 100% (1:1)',
    copyImage: '复制图片',
    saveImage: '保存图片',
    closePin: '关闭贴图 (Esc)',
    saveAs: '另存为...',
    zoom50: '缩放至 50%',
    zoom100: '恢复 100% (1:1)',
    zoom150: '缩放至 150%',
    zoom200: '缩放至 200%',
    alwaysOnTop: '置顶显示',
    copyCode: '复制代码',
    loading: '加载贴图中...',
    copied: '已复制到剪贴板'
  },
  'zh-TW': {
    zoomReset: '恢復 100% (1:1)',
    copyImage: '複製圖片',
    saveImage: '儲存圖片',
    closePin: '關閉貼圖 (Esc)',
    saveAs: '另存為...',
    zoom50: '縮放至 50%',
    zoom100: '恢復 100% (1:1)',
    zoom150: '縮放至 150%',
    zoom200: '縮放至 200%',
    alwaysOnTop: '置頂顯示',
    copyCode: '複製代碼',
    loading: '載入貼圖中...',
    copied: '已複製至剪貼簿'
  },
  en: {
    zoomReset: 'Reset 100% (1:1)',
    copyImage: 'Copy Image',
    saveImage: 'Save Image',
    closePin: 'Close Pin (Esc)',
    saveAs: 'Save As...',
    zoom50: 'Zoom to 50%',
    zoom100: 'Reset 100% (1:1)',
    zoom150: 'Zoom to 150%',
    zoom200: 'Zoom to 200%',
    alwaysOnTop: 'Always on Top',
    copyCode: 'Copy Code',
    loading: 'Loading pin...',
    copied: 'Copied to clipboard'
  },
  ja: {
    zoomReset: '100%に戻す (1:1)',
    copyImage: '画像をコピー',
    saveImage: '画像を保存',
    closePin: 'ピン留めを閉じる (Esc)',
    saveAs: '名前を付けて保存...',
    zoom50: '50%に縮小',
    zoom100: '100%に戻す (1:1)',
    zoom150: '150%に拡大',
    zoom200: '200%に拡大',
    alwaysOnTop: '常に最前面に表示',
    copyCode: 'コードをコピー',
    loading: '読み込み中...',
    copied: 'クリップボードにコピーしました'
  },
  ko: {
    zoomReset: '100% 초기화 (1:1)',
    copyImage: '이미지 복사',
    saveImage: '이미지 저장',
    closePin: '고정 닫기 (Esc)',
    saveAs: '다른 이름으로 저장...',
    zoom50: '50% 축소',
    zoom100: '100% 초기화 (1:1)',
    zoom150: '150% 확대',
    zoom200: '200% 확대',
    alwaysOnTop: '항상 위에 표시',
    copyCode: '코드 복사',
    loading: '로딩 중...',
    copied: '클립보드에 복사되었습니다'
  },
  de: {
    zoomReset: 'Auf 100% zurücksetzen (1:1)',
    copyImage: 'Bild kopieren',
    saveImage: 'Bild speichern',
    closePin: 'Schließen (Esc)',
    saveAs: 'Speichern unter...',
    zoom50: 'Auf 50% zoomen',
    zoom100: 'Auf 100% zurücksetzen (1:1)',
    zoom150: 'Auf 150% zoomen',
    zoom200: 'Auf 200% zoomen',
    alwaysOnTop: 'Immer im Vordergrund',
    copyCode: 'Code kopieren',
    loading: 'Laden...',
    copied: 'In die Zwischenablage kopiert'
  },
  fr: {
    zoomReset: 'Réinitialiser 100% (1:1)',
    copyImage: 'Copier l\'image',
    saveImage: 'Enregistrer l\'image',
    closePin: 'Fermer (Esc)',
    saveAs: 'Enregistrer sous...',
    zoom50: 'Zoomer à 50%',
    zoom100: 'Réinitialiser 100% (1:1)',
    zoom150: 'Zoomer à 150%',
    zoom200: 'Zoomer à 200%',
    alwaysOnTop: 'Toujours au premier plan',
    copyCode: 'Copier le code',
    loading: 'Chargement...',
    copied: 'Copié dans le presse-papiers'
  },
  es: {
    zoomReset: 'Restablecer 100% (1:1)',
    copyImage: 'Copiar imagen',
    saveImage: 'Guardar imagen',
    closePin: 'Cerrar (Esc)',
    saveAs: 'Guardar como...',
    zoom50: 'Zoom al 50%',
    zoom100: 'Restablecer 100% (1:1)',
    zoom150: 'Zoom al 150%',
    zoom200: 'Zoom al 200%',
    alwaysOnTop: 'Siempre al frente',
    copyCode: 'Copiar código',
    loading: 'Cargando...',
    copied: 'Copiado al portapapeles'
  }
}

const tr = (key: string): string => {
  const dict = pinI18n[currentLang.value] || pinI18n['zh-CN']
  return dict[key] || pinI18n['zh-CN'][key] || key
}

const detectTheme = (): void => {
  const urlTheme = new URLSearchParams(window.location.search).get('theme')
  const localTheme =
    urlTheme || localStorage.getItem('theme') || localStorage.getItem('current-theme')
  if (localTheme) {
    isDarkTheme.value = isDarkThemeId(localTheme)
    return
  }
  isDarkTheme.value = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
}

const detectLanguage = (): void => {
  const localLang = localStorage.getItem('current-language')
  if (localLang) {
    currentLang.value = localLang
    return
  }
  const navLang = navigator.language
  if (navLang.startsWith('zh')) {
    currentLang.value = navLang.includes('TW') || navLang.includes('HK') ? 'zh-TW' : 'zh-CN'
  } else if (navLang.startsWith('ja')) currentLang.value = 'ja'
  else if (navLang.startsWith('ko')) currentLang.value = 'ko'
  else if (navLang.startsWith('de')) currentLang.value = 'de'
  else if (navLang.startsWith('fr')) currentLang.value = 'fr'
  else if (navLang.startsWith('es')) currentLang.value = 'es'
  else currentLang.value = 'en'
}

const payload = ref<PinWindowPayload | null>(null)
const pinId = ref('')
const zoomLevel = ref(1.0)
const windowOpacity = ref(1.0)
const isAlwaysOnTop = ref(true)
const copiedFeedback = ref(false)
let copiedTimer: NodeJS.Timeout | null = null
const isOsx =
  (window as unknown as { marktextpro?: { isOsx?: boolean }; marknotepro?: { isOsx?: boolean } }).marktextpro?.isOsx ??
  (window as unknown as { marktextpro?: { isOsx?: boolean }; marknotepro?: { isOsx?: boolean } }).marknotepro?.isOsx ??
  /Mac|iPod|iPhone|iPad/.test(navigator.platform)

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

// -------------------------------------------------------------
// Manual 8-Directional Window Resizing
// -------------------------------------------------------------
let isResizing = false
let resizeDir = ''
let resizeStartMouseX = 0
let resizeStartMouseY = 0
let resizeInitBounds = { x: 0, y: 0, width: 0, height: 0 }
let resizeAspectRatio = 1

const onResizeStart = async (dir: string, e: MouseEvent): Promise<void> => {
  if (e.button !== 0) return
  contextMenuVisible.value = false
  isResizing = true
  resizeDir = dir
  resizeStartMouseX = e.screenX
  resizeStartMouseY = e.screenY

  try {
    const bounds = await window.electron.ipcRenderer.invoke(
      'mt::pin-window-get-bounds',
      pinId.value
    )
    if (bounds) {
      resizeInitBounds = bounds
    } else {
      resizeInitBounds = {
        x: window.screenX,
        y: window.screenY,
        width: window.innerWidth,
        height: window.innerHeight
      }
    }
  } catch {
    resizeInitBounds = {
      x: window.screenX,
      y: window.screenY,
      width: window.innerWidth,
      height: window.innerHeight
    }
  }

  resizeAspectRatio =
    currentNaturalWidth && currentNaturalHeight
      ? currentNaturalWidth / currentNaturalHeight
      : resizeInitBounds.width / Math.max(1, resizeInitBounds.height)

  window.addEventListener('mousemove', onResizeMove)
  window.addEventListener('mouseup', onResizeEnd)
}

const onResizeMove = (e: MouseEvent): void => {
  if (!isResizing) return
  const dx = e.screenX - resizeStartMouseX
  const dy = e.screenY - resizeStartMouseY

  const init = resizeInitBounds
  const ar = resizeAspectRatio || 1
  let newW = init.width
  let newH = init.height
  let newX = init.x
  let newY = init.y

  if (resizeDir === 'r') {
    newW = Math.max(20, init.width + dx)
    newH = Math.max(20, Math.round(newW / ar))
  } else if (resizeDir === 'l') {
    newW = Math.max(20, init.width - dx)
    newH = Math.max(20, Math.round(newW / ar))
    newX = init.x + (init.width - newW)
  } else if (resizeDir === 'b') {
    newH = Math.max(20, init.height + dy)
    newW = Math.max(20, Math.round(newH * ar))
  } else if (resizeDir === 't') {
    newH = Math.max(20, init.height - dy)
    newW = Math.max(20, Math.round(newH * ar))
    newY = init.y + (init.height - newH)
  } else if (resizeDir === 'br') {
    const scale = Math.max(0.05, (init.width + dx) / Math.max(1, init.width))
    newW = Math.max(20, Math.round(init.width * scale))
    newH = Math.max(20, Math.round(init.height * scale))
  } else if (resizeDir === 'bl') {
    const scale = Math.max(0.05, (init.width - dx) / Math.max(1, init.width))
    newW = Math.max(20, Math.round(init.width * scale))
    newH = Math.max(20, Math.round(init.height * scale))
    newX = init.x + (init.width - newW)
  } else if (resizeDir === 'tr') {
    const scale = Math.max(0.05, (init.width + dx) / Math.max(1, init.width))
    newW = Math.max(20, Math.round(init.width * scale))
    newH = Math.max(20, Math.round(init.height * scale))
    newY = init.y + (init.height - newH)
  } else if (resizeDir === 'tl') {
    const scale = Math.max(0.05, (init.width - dx) / Math.max(1, init.width))
    newW = Math.max(20, Math.round(init.width * scale))
    newH = Math.max(20, Math.round(init.height * scale))
    newX = init.x + (init.width - newW)
    newY = init.y + (init.height - newH)
  }

  window.electron.ipcRenderer.send('mt::pin-window-resize', {
    pinId: pinId.value,
    bounds: { x: newX, y: newY, width: newW, height: newH }
  })

  // Update zoom badge
  if (currentNaturalWidth) {
    const dpr = window.devicePixelRatio || 1
    const baseW = currentNaturalWidth / dpr
    if (baseW > 0) {
      zoomLevel.value = Math.max(0.01, Math.round((newW / baseW) * 100) / 100)
    }
  }
}

const onResizeEnd = (): void => {
  isResizing = false
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', onResizeEnd)
}

let currentNaturalWidth = 0
let currentNaturalHeight = 0
let isProgrammaticResize = false

const onWindowResize = (): void => {
  if (isProgrammaticResize || isResizing) return
  if (!currentNaturalWidth || !currentNaturalHeight) return
  const dpr = window.devicePixelRatio || 1
  const baseW = currentNaturalWidth / dpr
  if (baseW > 0) {
    const computedZoom = window.innerWidth / baseW
    zoomLevel.value = Math.max(0.01, Math.round(computedZoom * 100) / 100)
  }
}

const onImageLoad = (e: Event): void => {
  const img = e.target as HTMLImageElement
  if (!img) return
  currentNaturalWidth = img.naturalWidth
  currentNaturalHeight = img.naturalHeight

  // Calculate actual initial zoom relative to base 100% logical size
  const dpr = window.devicePixelRatio || 1
  const baseW = currentNaturalWidth / dpr
  if (baseW > 0) {
    zoomLevel.value = Math.round((window.innerWidth / baseW) * 100) / 100
  }
}

const applyFitSize = (): void => {
  if (!currentNaturalWidth || !currentNaturalHeight) return
  isProgrammaticResize = true
  window.electron.ipcRenderer.send('mt::pin-window-fit-size', {
    pinId: pinId.value,
    naturalWidth: currentNaturalWidth,
    naturalHeight: currentNaturalHeight,
    zoom: zoomLevel.value
  })
  setTimeout(() => {
    isProgrammaticResize = false
  }, 120)
}

// Mouse Wheel Zoom: Geometric proportional continuous zooming
const onWheel = (e: WheelEvent): void => {
  e.preventDefault()
  if (Math.abs(e.deltaY) < 0.5) return

  const clampedDelta = Math.min(Math.max(e.deltaY, -120), 120)
  // Exponential scaling for consistent perceptual speed at any zoom level
  const factor = Math.exp(-clampedDelta * 0.0015)
  let nextZoom = zoomLevel.value * factor
  nextZoom = Math.min(Math.max(nextZoom, 0.05), 10.0)

  zoomLevel.value = Math.round(nextZoom * 100) / 100
  applyFitSize()
}

const resetZoom = (): void => {
  zoomLevel.value = 1.0
  contextMenuVisible.value = false
  applyFitSize()
}

const setZoom = (z: number): void => {
  zoomLevel.value = z
  contextMenuVisible.value = false
  applyFitSize()
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
  contextMenuVisible.value = false
  try {
    const success = await window.electron.ipcRenderer.invoke('mt::pin-window-copy', payload.value.content)
    if (success !== false) {
      copiedFeedback.value = true
      if (copiedTimer) clearTimeout(copiedTimer)
      copiedTimer = setTimeout(() => {
        copiedFeedback.value = false
      }, 1600)
    }
  } catch (err) {
    console.error('Failed to copy pin content:', err)
  }
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
  detectTheme()
  detectLanguage()

  let id = new URLSearchParams(window.location.search).get('pinId')
  if (!id && window.location.hash.includes('?')) {
    id = new URLSearchParams(window.location.hash.split('?')[1]).get('pinId')
  }
  pinId.value = id || ''

  try {
    window.electron.ipcRenderer.send('mt::ask-for-user-preference')
    window.electron.ipcRenderer.on('mt::user-preference', (_e, prefs: any) => {
      if (prefs) {
        if (prefs.theme) {
          isDarkTheme.value = isDarkThemeId(prefs.theme)
        }
        if (prefs.language) {
          currentLang.value = prefs.language
        }
      }
    })
    window.electron.ipcRenderer.on('language-changed', (_e, lang: string) => {
      if (lang) currentLang.value = lang
    })
  } catch (err) {
    console.warn('Failed to query user preferences:', err)
  }

  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      const localTheme = localStorage.getItem('current-theme')
      if (!localTheme) {
        isDarkTheme.value = e.matches
      }
    })
  }

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

  window.addEventListener('resize', onWindowResize)
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  if (removeDataSub) removeDataSub()
  if (copiedTimer) clearTimeout(copiedTimer)
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', onResizeEnd)
  window.removeEventListener('resize', onWindowResize)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.pin-window-container {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  display: block;
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
  gap: 3px;
  border-radius: 6px;
  padding: 3px 6px;
  opacity: 0;
  transition: opacity 0.15s ease, background 0.15s ease, border-color 0.15s ease;
  z-index: 1000;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.pin-window-container:hover .hover-toolbar {
  opacity: 1;
}

/* Theme Light (Default & White Backgrounds) */
.theme-light .hover-toolbar {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.06);
}

.theme-light .zoom-badge {
  color: #646a73;
}

.theme-light .mini-btn {
  color: #4e5969;
}

.theme-light .mini-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  color: #1f2329;
}

.theme-light .mini-btn.close:hover {
  background: rgba(245, 63, 63, 0.12);
  color: #f53f3f;
}

/* Theme Dark */
.theme-dark .hover-toolbar {
  background: rgba(24, 26, 32, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
}

.theme-dark .zoom-badge {
  color: #94a3b8;
}

.theme-dark .mini-btn {
  color: #cbd5e1;
}

.theme-dark .mini-btn:hover {
  background: rgba(255, 255, 255, 0.14);
  color: #ffffff;
}

.theme-dark .mini-btn.close:hover {
  background: #ef4444;
  color: #ffffff;
}

.zoom-badge {
  font-size: 11px;
  padding: 0 4px;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', monospace;
  font-weight: 600;
  letter-spacing: 0.2px;
}

.mini-btn {
  background: transparent;
  border: none;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 5px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  transition: all 0.12s ease;
}

.mini-btn.btn-success {
  color: #22c55e !important;
  background: rgba(34, 197, 94, 0.16) !important;
}

.pin-copy-toast {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(24, 26, 32, 0.92);
  color: #ffffff;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  pointer-events: none;
  z-index: 2000;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.18);
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, -40%);
}

.mini-btn svg {
  display: block;
}

.mini-btn.zoom-btn {
  font-size: 11px;
  padding: 3px 6px;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
}

/* Pinned Image View with Crisp Borders and Subtle Shadows across All Platforms */
.pinned-image-view {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-sizing: border-box;
  border-radius: 4px;
  position: relative;
}

.theme-light .pinned-image-view {
  /* Crisp Card Border: Semi-transparent dark outline + Inner crisp highlight + Depth shadow */
  border: 1.5px solid rgba(0, 0, 0, 0.22);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.7),
    inset 0 1px 3px rgba(0, 0, 0, 0.08),
    0 4px 16px rgba(0, 0, 0, 0.16);
  background: #ffffff;
}

.theme-dark .pinned-image-view {
  /* Dark mode: Crisp light border + Deep shadows */
  border: 1.5px solid rgba(255, 255, 255, 0.24);
  box-shadow:
    inset 0 0 0 1px rgba(0, 0, 0, 0.7),
    inset 0 1px 3px rgba(0, 0, 0, 0.5),
    0 6px 20px rgba(0, 0, 0, 0.55);
  background: #18191d;
}

.pinned-img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
  border-radius: 2.5px;
  margin: 0;
  padding: 0;
}

/* Pinned Text View */
.pinned-text-view {
  width: 90%;
  height: 90%;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transform-origin: center center;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.theme-light .pinned-text-view {
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(0, 0, 0, 0.12);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.2);
}

.theme-dark .pinned-text-view {
  background: rgba(26, 29, 36, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.16);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.65);
}

.text-card-header {
  height: 36px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
}

.theme-light .text-card-header {
  background: rgba(0, 0, 0, 0.03);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.theme-dark .text-card-header {
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.mac-traffic-dots {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dot {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.1s ease, filter 0.1s ease;
}

.dot:hover {
  transform: scale(1.15);
  filter: brightness(1.2);
}

.dot-close {
  background: #ff5f56;
  border: 1px solid #e0443e;
}

.dot-copy {
  background: #ffbd2e;
  border: 1px solid #dea123;
}

.dot-ontop {
  background: #27c93f;
  border: 1px solid #1aab29;
}

.text-card-badge {
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 60%;
}

.theme-light .text-card-badge {
  color: #b45309;
}

.theme-dark .text-card-badge {
  color: #f59e0b;
}

.header-action-btn {
  border: none;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.12s ease;
}

.theme-light .header-action-btn {
  background: rgba(0, 0, 0, 0.06);
  color: #334155;
}

.theme-light .header-action-btn:hover {
  background: #336df4;
  color: #ffffff;
}

.theme-dark .header-action-btn {
  background: rgba(255, 255, 255, 0.1);
  color: #cbd5e1;
}

.theme-dark .header-action-btn:hover {
  background: #3b82f6;
  color: #ffffff;
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
  white-space: pre-wrap;
  word-break: break-all;
}

.theme-light .text-content {
  color: #1e293b;
}

.theme-dark .text-content {
  color: #f1f5f9;
}

/* Custom Context Menu */
.custom-context-menu {
  position: absolute;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 8px;
  padding: 4px;
  z-index: 2000;
  min-width: 140px;
}

.theme-light .custom-context-menu {
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
}

.theme-dark .custom-context-menu {
  background: rgba(24, 27, 34, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.65);
}

.menu-item {
  padding: 6px 12px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.1s ease, color 0.1s ease;
}

.theme-light .menu-item {
  color: #1f2329;
}

.theme-light .menu-item:hover {
  background: rgba(51, 109, 244, 0.1);
  color: #336df4;
}

.theme-light .menu-item.danger:hover {
  background: rgba(245, 63, 63, 0.12);
  color: #f53f3f;
}

.theme-dark .menu-item {
  color: #cbd5e1;
}

.theme-dark .menu-item:hover {
  background: #3b82f6;
  color: #ffffff;
}

.theme-dark .menu-item.danger:hover {
  background: #ef4444;
  color: #ffffff;
}

.menu-divider {
  height: 1px;
  margin: 4px 0;
}

.theme-light .menu-divider {
  background: rgba(0, 0, 0, 0.08);
}

.theme-dark .menu-divider {
  background: rgba(255, 255, 255, 0.1);
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
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 10px;
  font-size: 12px;
}

.theme-light .pinned-loading-view {
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
  color: #475569;
}

.theme-dark .pinned-loading-view {
  background: rgba(24, 27, 34, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  color: #94a3b8;
}

.pinned-spinner {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.theme-light .pinned-spinner {
  border: 2px solid rgba(0, 0, 0, 0.1);
  border-top-color: #336df4;
}

.theme-dark .pinned-spinner {
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-top-color: #3b82f6;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 8 Directional Resize Handles */
.resize-handle {
  position: absolute;
  z-index: 1500;
  box-sizing: border-box;
}

.handle-t {
  top: 0;
  left: 8px;
  right: 8px;
  height: 6px;
  cursor: ns-resize;
}

.handle-b {
  bottom: 0;
  left: 8px;
  right: 8px;
  height: 6px;
  cursor: ns-resize;
}

.handle-l {
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 6px;
  cursor: ew-resize;
}

.handle-r {
  right: 0;
  top: 8px;
  bottom: 8px;
  width: 6px;
  cursor: ew-resize;
}

.handle-tl {
  top: 0;
  left: 0;
  width: 10px;
  height: 10px;
  cursor: nwse-resize;
}

.handle-tr {
  top: 0;
  right: 0;
  width: 10px;
  height: 10px;
  cursor: nesw-resize;
}

.handle-bl {
  bottom: 0;
  left: 0;
  width: 10px;
  height: 10px;
  cursor: nesw-resize;
}

.handle-br {
  bottom: 0;
  right: 0;
  width: 10px;
  height: 10px;
  cursor: nwse-resize;
}
</style>
