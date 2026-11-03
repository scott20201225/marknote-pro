<template>
  <div :class="['clipboard-modal-container', isDarkTheme ? 'theme-dark' : 'theme-light']">
    <!-- Header Search Bar -->
    <div class="search-header">
      <div class="search-icon">
        <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
      </div>
      <input
        ref="searchInputRef"
        v-model="searchQuery"
        type="text"
        class="search-input"
        :placeholder="tr('searchPlaceholder')"
        @input="onSearchInput"
      />

      <!-- Category Filter Tabs: 全部 / 图片 / 文本 -->
      <div class="category-tabs">
        <button
          :class="['category-tab-btn', { active: currentCategory === 'all' }]"
          @click="setCategory('all')"
        >
          {{ tr('all') }} <span class="tab-count">{{ items.length }}</span>
        </button>
        <button
          :class="['category-tab-btn', { active: currentCategory === 'image' }]"
          @click="setCategory('image')"
        >
          {{ tr('image') }} <span class="tab-count">{{ imageCount }}</span>
        </button>
        <button
          :class="['category-tab-btn', { active: currentCategory === 'text' }]"
          @click="setCategory('text')"
        >
          {{ tr('text') }} <span class="tab-count">{{ textCount }}</span>
        </button>
      </div>

      <button class="close-btn" :title="tr('close')" @click="closeModal">
        ✕
      </button>
    </div>

    <!-- Main Content Area -->
    <div class="modal-body">
      <!-- Left List Column -->
      <div ref="listRef" class="list-column">
        <div v-if="filteredItems.length === 0" class="empty-hint">
          <div class="empty-icon">📋</div>
          <div class="empty-text">{{ tr('empty') }}</div>
        </div>

        <div
          v-for="(item, index) in filteredItems"
          :key="item.id"
          :class="['history-item', { active: index === selectedIndex }]"
          @click="selectItem(index)"
          @dblclick="copyAndClose(item)"
        >
          <div class="item-icon-wrapper">
            <span v-if="item.type === 'image'" class="type-badge image-badge">🖼️</span>
            <span v-else-if="item.type === 'code'" class="type-badge code-badge">{ }</span>
            <span v-else-if="item.type === 'html'" class="type-badge html-badge">&lt;/&gt;</span>
            <span v-else class="type-badge text-badge">T</span>
          </div>

          <div class="item-info">
            <div class="item-title">{{ getItemTitle(item) }}</div>
            <div class="item-meta">
              <span class="item-time">{{ formatTime(item.timestamp) }}</span>
              <span v-if="item.charCount" class="item-extra">{{ item.charCount }} {{ tr('chars') }}</span>
              <span v-else-if="item.width && item.height" class="item-extra">{{ item.width }}×{{ item.height }}</span>
            </div>
          </div>

          <div class="item-actions">
            <!-- For image: Pin to desktop -->
            <button
              v-if="item.type === 'image'"
              class="action-icon-btn pin"
              :title="tr('pinDesktop')"
              @click.stop="pinItem(item)"
            >
              📌
            </button>
            <!-- Copy button for all -->
            <button
              class="action-icon-btn copy"
              :title="copiedItemId === item.id ? tr('copied') : tr('copyToClipboard')"
              @click.stop="copyItem(item)"
            >
              <span v-if="copiedItemId === item.id" class="copied-check">✓</span>
              <span v-else>📋</span>
            </button>
            <button class="action-icon-btn delete" :title="tr('delete')" @click.stop="deleteItem(item)">
              🗑️
            </button>
          </div>
        </div>
      </div>

      <!-- Right Preview Column -->
      <div class="preview-column">
        <template v-if="selectedItem">
          <!-- Preview Header -->
          <div class="preview-header">
            <div class="preview-meta-title">
              <span class="preview-type-tag">{{ selectedItem.type.toUpperCase() }}</span>
              <span class="preview-timestamp">{{ new Date(selectedItem.timestamp).toLocaleString() }}</span>
            </div>
            <div class="preview-header-actions">
              <!-- If image: Pin button -->
              <button
                v-if="selectedItem.type === 'image'"
                class="btn btn-secondary"
                :title="tr('pinDesktop')"
                @click="pinItem(selectedItem)"
              >
                📌 {{ tr('pin') }}
              </button>
              <!-- Primary action: Copy & Close (↵) -->
              <button
                class="btn btn-primary"
                :title="tr('copyAndExitTip')"
                @click="copyAndClose(selectedItem)"
              >
                <span v-if="copiedItemId === selectedItem.id">✓ {{ tr('copied') }}</span>
                <span v-else>📋 {{ tr('copy') }}</span>
              </button>
            </div>
          </div>

          <!-- Preview Content -->
          <div class="preview-content-box">
            <!-- Image Preview -->
            <div v-if="selectedItem.type === 'image'" class="image-preview-wrapper">
              <img
                :src="selectedItem.imageDataUrl || (selectedItem.imagePath ? `file://${selectedItem.imagePath}` : '')"
                class="preview-img"
                alt="Clipboard Image"
              />
              <div class="image-dimension-info">
                {{ tr('resolution', { w: selectedItem.width || '?', h: selectedItem.height || '?' }) }}
              </div>
            </div>

            <!-- Code or Text Preview -->
            <div v-else class="text-preview-wrapper">
              <pre class="preview-code-block"><code>{{ selectedItem.content }}</code></pre>
            </div>
          </div>
        </template>

        <div v-else class="preview-placeholder">
          {{ tr('previewPlaceholder') }}
        </div>
      </div>
    </div>

    <!-- Footer Shortcuts Bar -->
    <div class="footer-bar">
      <div class="shortcut-tip"><kbd>↑</kbd><kbd>↓</kbd> {{ tr('navTip') }}</div>
      <div class="shortcut-tip"><kbd>↵</kbd> {{ tr('copyAndExit') }}</div>
      <div v-if="selectedItem?.type === 'image'" class="shortcut-tip"><kbd>P</kbd> {{ tr('pinTip') }}</div>
      <div class="shortcut-tip"><kbd>Esc</kbd> {{ tr('exit') }}</div>
      <div class="footer-right">
        <button class="clear-all-link" @click="clearAllHistory">{{ tr('clearAll') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import type { ClipboardItemRecord } from '@shared/types/clipboard'
import { isDarkThemeId } from '../../../common/theme'

// =============================================================
// Multi-language (i18n) Support
// =============================================================
const i18nDict: Record<string, Record<string, string>> = {
  'zh-CN': {
    searchPlaceholder: '搜索历史记录... (↑↓ 选择, ↵ 复制, P 钉在桌面, Esc 退出)',
    all: '全部',
    image: '图片',
    text: '文本',
    close: '关闭 (Esc)',
    empty: '无相关剪贴板历史',
    chars: '字符',
    pinDesktop: '钉在桌面 (P)',
    copied: '已复制',
    copyToClipboard: '复制到剪贴板',
    delete: '删除',
    pin: '贴图',
    copy: '复制',
    copyAndExitTip: '复制到剪贴板并退出 (↵)',
    resolution: '分辨率: {w} × {h} 像素',
    previewPlaceholder: '选择左侧记录以预览内容',
    navTip: '导航',
    copyAndExit: '复制并退出',
    pinTip: '钉在桌面',
    exit: '退出',
    clearAll: '清空全部历史',
    confirmClear: '确定要清空所有剪贴板历史记录吗？',
    justNow: '刚刚',
    minutesAgo: '{n}分钟前',
    hoursAgo: '{n}小时前',
    daysAgo: '{n}天前',
    clipboardText: '剪贴板文本'
  },
  'zh-TW': {
    searchPlaceholder: '搜尋歷史記錄... (↑↓ 選擇, ↵ 複製, P 釘在桌面, Esc 退出)',
    all: '全部',
    image: '圖片',
    text: '文字',
    close: '關閉 (Esc)',
    empty: '無相關剪貼簿歷史',
    chars: '字元',
    pinDesktop: '釘在桌面 (P)',
    copied: '已複製',
    copyToClipboard: '複製到剪貼簿',
    delete: '刪除',
    pin: '貼圖',
    copy: '複製',
    copyAndExitTip: '複製到剪貼簿並退出 (↵)',
    resolution: '解析度: {w} × {h} 像素',
    previewPlaceholder: '選擇左側記錄以預覽內容',
    navTip: '導航',
    copyAndExit: '複製並退出',
    pinTip: '釘在桌面',
    exit: '退出',
    clearAll: '清空全部歷史',
    confirmClear: '確定要清空所有剪貼簿歷史記錄嗎？',
    justNow: '剛剛',
    minutesAgo: '{n}分鐘前',
    hoursAgo: '{n}小時前',
    daysAgo: '{n}天前',
    clipboardText: '剪貼簿文字'
  },
  en: {
    searchPlaceholder: 'Search history... (↑↓ Navigate, ↵ Copy, P Pin, Esc Close)',
    all: 'All',
    image: 'Images',
    text: 'Text',
    close: 'Close (Esc)',
    empty: 'No clipboard history found',
    chars: 'chars',
    pinDesktop: 'Pin to Desktop (P)',
    copied: 'Copied',
    copyToClipboard: 'Copy to Clipboard',
    delete: 'Delete',
    pin: 'Pin',
    copy: 'Copy',
    copyAndExitTip: 'Copy to clipboard & exit (↵)',
    resolution: 'Resolution: {w} × {h} px',
    previewPlaceholder: 'Select an item on the left to preview',
    navTip: 'Navigate',
    copyAndExit: 'Copy & Exit',
    pinTip: 'Pin to Desktop',
    exit: 'Exit',
    clearAll: 'Clear All History',
    confirmClear: 'Are you sure you want to clear all clipboard history?',
    justNow: 'Just now',
    minutesAgo: '{n}m ago',
    hoursAgo: '{n}h ago',
    daysAgo: '{n}d ago',
    clipboardText: 'Clipboard Text'
  },
  ja: {
    searchPlaceholder: '履歴を検索... (↑↓ 選択, ↵ コピー, P ピン留め, Esc 閉じる)',
    all: 'すべて',
    image: '画像',
    text: 'テキスト',
    close: '閉じる (Esc)',
    empty: 'クリップボード履歴がありません',
    chars: '文字',
    pinDesktop: 'デスクトップにピン留め (P)',
    copied: 'コピーしました',
    copyToClipboard: 'クリップボードにコピー',
    delete: '削除',
    pin: 'ピン留め',
    copy: 'コピー',
    copyAndExitTip: 'コピーして閉じる (↵)',
    resolution: '解像度: {w} × {h} ピクセル',
    previewPlaceholder: '左の項目を選択してプレビュー',
    navTip: '移動',
    copyAndExit: 'コピーして終了',
    pinTip: 'ピン留め',
    exit: '終了',
    clearAll: 'すべての履歴を消去',
    confirmClear: 'すべてのクリップボード履歴を消去しますか？',
    justNow: 'たった今',
    minutesAgo: '{n}分前',
    hoursAgo: '{n}時間前',
    daysAgo: '{n}日前',
    clipboardText: 'クリップボードテキスト'
  },
  ko: {
    searchPlaceholder: '기록 검색... (↑↓ 탐색, ↵ 복사, P 데스크톱 핀, Esc 닫기)',
    all: '전체',
    image: '이미지',
    text: '텍스트',
    close: '닫기 (Esc)',
    empty: '클립보드 기록이 없습니다',
    chars: '글자',
    pinDesktop: '데스크톱 핀 (P)',
    copied: '복사됨',
    copyToClipboard: '클립보드에 복사',
    delete: '삭제',
    pin: '핀 고정',
    copy: '복사',
    copyAndExitTip: '복사 후 닫기 (↵)',
    resolution: '해상도: {w} × {h} px',
    previewPlaceholder: '왼쪽 항목을 선택하여 미리보기',
    navTip: '탐색',
    copyAndExit: '복사 후 종료',
    pinTip: '데스크톱 핀',
    exit: '종료',
    clearAll: '모든 기록 삭제',
    confirmClear: '모든 클립보드 기록을 삭제하시겠습니까?',
    justNow: '방금',
    minutesAgo: '{n}분 전',
    hoursAgo: '{n}시간 전',
    daysAgo: '{n}일 전',
    clipboardText: '클립보드 텍스트'
  },
  de: {
    searchPlaceholder: 'Verlauf durchsuchen... (↑↓ Auswählen, ↵ Kopieren, P Anheften, Esc Schließen)',
    all: 'Alle',
    image: 'Bilder',
    text: 'Text',
    close: 'Schließen (Esc)',
    empty: 'Kein Zwischenablage-Verlauf',
    chars: 'Zeichen',
    pinDesktop: 'An Desktop anheften (P)',
    copied: 'Kopiert',
    copyToClipboard: 'In Zwischenablage kopieren',
    delete: 'Löschen',
    pin: 'Anheften',
    copy: 'Kopieren',
    copyAndExitTip: 'Kopieren & Schließen (↵)',
    resolution: 'Auflösung: {w} × {h} px',
    previewPlaceholder: 'Eintrag links auswählen für Vorschau',
    navTip: 'Navigieren',
    copyAndExit: 'Kopieren & Beenden',
    pinTip: 'Anheften',
    exit: 'Beenden',
    clearAll: 'Gesamten Verlauf löschen',
    confirmClear: 'Möchten Sie wirklich den gesamten Zwischenablage-Verlauf löschen?',
    justNow: 'Gerade eben',
    minutesAgo: 'vor {n}m',
    hoursAgo: 'vor {n}h',
    daysAgo: 'vor {n}d',
    clipboardText: 'Zwischenablage-Text'
  },
  fr: {
    searchPlaceholder: 'Rechercher... (↑↓ Sélectionner, ↵ Copier, P Épingler, Esc Fermer)',
    all: 'Tout',
    image: 'Images',
    text: 'Texte',
    close: 'Fermer (Esc)',
    empty: 'Aucun historique',
    chars: 'caractères',
    pinDesktop: 'Épingler au bureau (P)',
    copied: 'Copié',
    copyToClipboard: 'Copier dans le presse-papiers',
    delete: 'Supprimer',
    pin: 'Épingler',
    copy: 'Copier',
    copyAndExitTip: 'Copier et fermer (↵)',
    resolution: 'Résolution : {w} × {h} px',
    previewPlaceholder: 'Sélectionnez un élément à gauche pour afficher l\'aperçu',
    navTip: 'Naviguer',
    copyAndExit: 'Copier et quitter',
    pinTip: 'Épingler',
    exit: 'Quitter',
    clearAll: 'Effacer tout l\'historique',
    confirmClear: 'Voulez-vous vraiment effacer tout l\'historique ?',
    justNow: 'À l\'instant',
    minutesAgo: 'il y a {n}m',
    hoursAgo: 'il y a {n}h',
    daysAgo: 'il y a {n}j',
    clipboardText: 'Texte du presse-papiers'
  },
  es: {
    searchPlaceholder: 'Buscar historial... (↑↓ Seleccionar, ↵ Copiar, P Fijar, Esc Cerrar)',
    all: 'Todo',
    image: 'Imágenes',
    text: 'Texto',
    close: 'Cerrar (Esc)',
    empty: 'Sin historial de portapapeles',
    chars: 'caracteres',
    pinDesktop: 'Fijar en escritorio (P)',
    copied: 'Copiado',
    copyToClipboard: 'Copiar al portapapeles',
    delete: 'Eliminar',
    pin: 'Fijar',
    copy: 'Copiar',
    copyAndExitTip: 'Copiar y cerrar (↵)',
    resolution: 'Resolución: {w} × {h} px',
    previewPlaceholder: 'Seleccione un elemento para vista previa',
    navTip: 'Navegar',
    copyAndExit: 'Copiar y salir',
    pinTip: 'Fijar en escritorio',
    exit: 'Salir',
    clearAll: 'Borrar todo el historial',
    confirmClear: '¿Está seguro de que desea borrar todo el historial?',
    justNow: 'Ahora mismo',
    minutesAgo: 'hace {n}m',
    hoursAgo: 'hace {n}h',
    daysAgo: 'hace {n}d',
    clipboardText: 'Texto del portapapeles'
  }
}

const currentLang = ref<string>('zh-CN')

const tr = (key: string, params?: Record<string, string | number>): string => {
  const lang = currentLang.value
  const bundle = i18nDict[lang] || i18nDict['zh-CN'] || i18nDict.en
  let val = bundle[key] || i18nDict.en[key] || key
  if (params) {
    Object.keys(params).forEach((k) => {
      val = val.replace(new RegExp(`\\{${k}\\}`, 'g'), String(params[k]))
    })
  }
  return val
}

const detectLanguage = (): void => {
  const urlLang = new URLSearchParams(window.location.search).get('lang')
  if (urlLang) {
    currentLang.value = urlLang
    return
  }
  const localLang = localStorage.getItem('language')
  if (localLang) {
    currentLang.value = localLang
    return
  }
  const nav = navigator.language || 'zh-CN'
  if (nav.startsWith('zh-TW') || nav.startsWith('zh-HK')) currentLang.value = 'zh-TW'
  else if (nav.startsWith('zh')) currentLang.value = 'zh-CN'
  else if (nav.startsWith('ja')) currentLang.value = 'ja'
  else if (nav.startsWith('ko')) currentLang.value = 'ko'
  else if (nav.startsWith('de')) currentLang.value = 'de'
  else if (nav.startsWith('fr')) currentLang.value = 'fr'
  else if (nav.startsWith('es')) currentLang.value = 'es'
  else currentLang.value = 'en'
}

// =============================================================
// Theme Support (Light / Dark)
// =============================================================
const isDarkTheme = ref(false)

const detectTheme = (): void => {
  const urlTheme = new URLSearchParams(window.location.search).get('theme')
  if (urlTheme) {
    isDarkTheme.value = isDarkThemeId(urlTheme)
    return
  }
  const localTheme = localStorage.getItem('theme')
  if (localTheme) {
    isDarkTheme.value = isDarkThemeId(localTheme)
    return
  }
  isDarkTheme.value = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
}

// =============================================================
// Core State & Logic
// =============================================================
const searchInputRef = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLDivElement | null>(null)
const items = ref<ClipboardItemRecord[]>([])
const searchQuery = ref('')
const selectedIndex = ref(0)
const currentCategory = ref<'all' | 'image' | 'text'>('all')

const imageCount = computed(() => items.value.filter((i) => i.type === 'image').length)
const textCount = computed(() => items.value.filter((i) => i.type !== 'image').length)

const setCategory = (cat: 'all' | 'image' | 'text'): void => {
  currentCategory.value = cat
  selectedIndex.value = 0
  scrollSelectedItemIntoView()
}

const filteredItems = computed(() => {
  let list = items.value
  if (currentCategory.value === 'image') {
    list = list.filter((i) => i.type === 'image')
  } else if (currentCategory.value === 'text') {
    list = list.filter((i) => i.type !== 'image')
  }

  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return list
  return list.filter((item) => {
    if (item.content && item.content.toLowerCase().includes(q)) return true
    if (item.previewText && item.previewText.toLowerCase().includes(q)) return true
    return false
  })
})

const selectedItem = computed(() => {
  if (filteredItems.value.length === 0) return null
  return filteredItems.value[selectedIndex.value] || filteredItems.value[0]
})

const getItemTitle = (item: ClipboardItemRecord): string => {
  if (item.previewText) return item.previewText
  if (item.type === 'image') return `${tr('image')} (${item.width || 0} × ${item.height || 0})`
  return item.content.slice(0, 100)
}

const formatTime = (timestamp: number): string => {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return tr('justNow')
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return tr('minutesAgo', { n: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return tr('hoursAgo', { n: hours })
  const days = Math.floor(hours / 24)
  return tr('daysAgo', { n: days })
}

const loadHistory = async (): Promise<void> => {
  try {
    const list = await window.electron.ipcRenderer.invoke('mt::clipboard-get-history')
    items.value = list || []
    if (selectedIndex.value >= items.value.length) {
      selectedIndex.value = Math.max(0, items.value.length - 1)
    }
  } catch (err) {
    console.error('Failed to load clipboard history:', err)
  }
}

const selectItem = (index: number): void => {
  selectedIndex.value = index
  scrollSelectedItemIntoView()
}

const copiedItemId = ref<string | null>(null)
let copyToastTimer: any = null

const copyItem = async (item: ClipboardItemRecord): Promise<void> => {
  try {
    const raw = JSON.parse(JSON.stringify(item))
    await window.electron.ipcRenderer.invoke('mt::clipboard-copy-item', raw)
    copiedItemId.value = item.id
    if (copyToastTimer) clearTimeout(copyToastTimer)
    copyToastTimer = setTimeout(() => {
      copiedItemId.value = null
    }, 1500)
  } catch (err) {
    console.error('Failed to copy item:', err)
  }
}

const copyAndClose = async (item: ClipboardItemRecord): Promise<void> => {
  try {
    const raw = JSON.parse(JSON.stringify(item))
    await window.electron.ipcRenderer.invoke('mt::clipboard-copy-item', raw)
    closeModal()
  } catch (err) {
    console.error('Failed to copy and close:', err)
  }
}

const pinItem = async (item: ClipboardItemRecord): Promise<void> => {
  try {
    const raw = JSON.parse(JSON.stringify(item))
    await window.electron.ipcRenderer.invoke('mt::clipboard-pin-item', raw)
  } catch (err) {
    console.error('Failed to pin item:', err)
  }
}

const deleteItem = async (item: ClipboardItemRecord): Promise<void> => {
  try {
    await window.electron.ipcRenderer.invoke('mt::clipboard-delete-item', item.id)
    items.value = items.value.filter((i) => i.id !== item.id)
    if (selectedIndex.value >= filteredItems.value.length) {
      selectedIndex.value = Math.max(0, filteredItems.value.length - 1)
    }
  } catch (err) {
    console.error('Failed to delete item:', err)
  }
}

const clearAllHistory = async (): Promise<void> => {
  if (!confirm(tr('confirmClear'))) return
  try {
    await window.electron.ipcRenderer.invoke('mt::clipboard-clear-history')
    items.value = []
    selectedIndex.value = 0
  } catch (err) {
    console.error('Failed to clear history:', err)
  }
}

const closeModal = (): void => {
  window.electron.ipcRenderer.send('mt::clipboard-hide-modal')
}

const onSearchInput = (): void => {
  selectedIndex.value = 0
}

const scrollSelectedItemIntoView = (): void => {
  nextTick(() => {
    if (!listRef.value) return
    const el = listRef.value.children[selectedIndex.value] as HTMLElement | undefined
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  })
}

const handleGlobalKeydown = (e: KeyboardEvent): void => {
  if (e.key === 'Escape') {
    e.preventDefault()
    closeModal()
    return
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (selectedIndex.value < filteredItems.value.length - 1) {
      selectedIndex.value++
      scrollSelectedItemIntoView()
    }
    return
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (selectedIndex.value > 0) {
      selectedIndex.value--
      scrollSelectedItemIntoView()
    }
    return
  }

  if (e.key === 'Enter') {
    e.preventDefault()
    if (selectedItem.value) {
      copyAndClose(selectedItem.value)
    }
    return
  }

  // Pressing 'p' or 'P': pin image (images only)
  if ((e.key === 'p' || e.key === 'P') && (e.metaKey || e.ctrlKey || document.activeElement !== searchInputRef.value)) {
    if (selectedItem.value && selectedItem.value.type === 'image') {
      e.preventDefault()
      pinItem(selectedItem.value)
      return
    }
  }

  // Pressing 'c' or 'C': copy text / item content to clipboard
  if (
    ((e.metaKey || e.ctrlKey) && (e.key === 'c' || e.key === 'C')) ||
    ((e.key === 'c' || e.key === 'C') && document.activeElement !== searchInputRef.value)
  ) {
    if (selectedItem.value) {
      e.preventDefault()
      copyItem(selectedItem.value)
      return
    }
  }
}

let removeShowSub: (() => void) | null = null
let removeUpdatedSub: (() => void) | null = null
let mediaQuery: MediaQueryList | null = null
let mediaQueryHandler: ((e: MediaQueryListEvent) => void) | null = null

onMounted(() => {
  detectLanguage()
  detectTheme()
  loadHistory()

  // Match system theme live changes
  if (window.matchMedia) {
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQueryHandler = (e: MediaQueryListEvent): void => {
      const localTheme = localStorage.getItem('theme')
      if (!localTheme) {
        isDarkTheme.value = e.matches
      }
    }
    mediaQuery.addEventListener('change', mediaQueryHandler)
  }

  // Ask for user preferences (theme & language)
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

  // Listen for language changes from main
  window.electron.ipcRenderer.on('language-changed', (_e, lang: string) => {
    if (lang) currentLang.value = lang
  })

  // Show modal subscription
  removeShowSub = window.electron.ipcRenderer.on('mt::clipboard-modal-show', (_event, payload: any) => {
    if (Array.isArray(payload)) {
      items.value = payload
    } else if (payload && typeof payload === 'object') {
      items.value = payload.history || []
      if (typeof payload.isDark === 'boolean') {
        isDarkTheme.value = payload.isDark
      }
      if (payload.lang) {
        currentLang.value = payload.lang
      }
    }
    searchQuery.value = ''
    currentCategory.value = 'all'
    selectedIndex.value = 0
    nextTick(() => {
      searchInputRef.value?.focus()
      searchInputRef.value?.select()
    })
  })

  removeUpdatedSub = window.electron.ipcRenderer.on('mt::clipboard-history-updated', (_event, history) => {
    items.value = history || []
  })

  nextTick(() => {
    searchInputRef.value?.focus()
  })

  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  if (removeShowSub) removeShowSub()
  if (removeUpdatedSub) removeUpdatedSub()
  if (mediaQuery && mediaQueryHandler) {
    mediaQuery.removeEventListener('change', mediaQueryHandler)
  }
  window.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<style scoped>
/* ==================== THEME VARIABLES ==================== */
.clipboard-modal-container.theme-dark {
  --bg-modal: rgba(30, 32, 38, 0.94);
  --border-modal: rgba(255, 255, 255, 0.12);
  --shadow-modal: 0 20px 60px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.12);
  --text-main: #f0f0f0;
  --text-secondary: rgba(255, 255, 255, 0.6);
  --text-tertiary: rgba(255, 255, 255, 0.4);
  --header-bg: rgba(255, 255, 255, 0.03);
  --header-border: rgba(255, 255, 255, 0.08);
  --search-icon: #8c92a4;
  --search-placeholder: #656d81;
  --tab-bg: rgba(255, 255, 255, 0.06);
  --tab-text: #94a3b8;
  --tab-hover-bg: rgba(255, 255, 255, 0.08);
  --tab-hover-text: #ffffff;
  --tab-active-bg: #3b82f6;
  --tab-active-text: #ffffff;
  --tab-active-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  --tab-count-bg: rgba(0, 0, 0, 0.25);
  --close-btn-color: #7b8296;
  --close-btn-hover: rgba(255, 255, 255, 0.1);
  --list-border: rgba(255, 255, 255, 0.08);
  --item-bg: rgba(255, 255, 255, 0.03);
  --item-border: rgba(255, 255, 255, 0.05);
  --item-hover-bg: rgba(255, 255, 255, 0.06);
  --item-active-bg: #3b82f6;
  --item-active-text: #ffffff;
  --badge-wrap-bg: rgba(255, 255, 255, 0.08);
  --act-btn-color: #cbd5e1;
  --act-btn-hover: rgba(255, 255, 255, 0.2);
  --preview-bg: rgba(18, 20, 24, 0.45);
  --preview-header-bg: rgba(255, 255, 255, 0.02);
  --preview-border: rgba(255, 255, 255, 0.08);
  --btn-sec-bg: rgba(255, 255, 255, 0.09);
  --btn-sec-border: transparent;
  --btn-sec-text: #e2e8f0;
  --btn-sec-hover: rgba(255, 255, 255, 0.18);
  --code-bg: transparent;
  --code-border: transparent;
  --code-text: #e2e8f0;
  --footer-bg: rgba(20, 22, 26, 0.95);
  --footer-border: rgba(255, 255, 255, 0.08);
  --footer-text: #7b8296;
  --kbd-bg: rgba(255, 255, 255, 0.1);
  --kbd-border: rgba(255, 255, 255, 0.15);
  --kbd-text: #cbd5e1;
}

.clipboard-modal-container.theme-light {
  --bg-modal: rgba(255, 255, 255, 0.94);
  --border-modal: rgba(0, 0, 0, 0.12);
  --shadow-modal: 0 20px 60px rgba(0, 0, 0, 0.22), 0 0 0 1px rgba(0, 0, 0, 0.08);
  --text-main: #1f2328;
  --text-secondary: #57606a;
  --text-tertiary: #8c959f;
  --header-bg: rgba(246, 248, 250, 0.6);
  --header-border: rgba(0, 0, 0, 0.08);
  --search-icon: #57606a;
  --search-placeholder: #8c959f;
  --tab-bg: rgba(0, 0, 0, 0.05);
  --tab-text: #57606a;
  --tab-hover-bg: rgba(0, 0, 0, 0.08);
  --tab-hover-text: #1f2328;
  --tab-active-bg: #ffffff;
  --tab-active-text: #1f2328;
  --tab-active-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  --tab-count-bg: rgba(0, 0, 0, 0.08);
  --close-btn-color: #6e7781;
  --close-btn-hover: rgba(0, 0, 0, 0.08);
  --list-border: rgba(0, 0, 0, 0.08);
  --item-bg: rgba(0, 0, 0, 0.015);
  --item-border: rgba(0, 0, 0, 0.04);
  --item-hover-bg: rgba(0, 0, 0, 0.05);
  --item-active-bg: #0969da;
  --item-active-text: #ffffff;
  --badge-wrap-bg: rgba(0, 0, 0, 0.05);
  --act-btn-color: #57606a;
  --act-btn-hover: rgba(0, 0, 0, 0.1);
  --preview-bg: rgba(246, 248, 250, 0.7);
  --preview-header-bg: rgba(255, 255, 255, 0.6);
  --preview-border: rgba(0, 0, 0, 0.08);
  --btn-sec-bg: #f6f8fa;
  --btn-sec-border: #d0d7de;
  --btn-sec-text: #24292f;
  --btn-sec-hover: #f3f4f6;
  --code-bg: #ffffff;
  --code-border: rgba(0, 0, 0, 0.08);
  --code-text: #1f2328;
  --footer-bg: rgba(246, 248, 250, 0.95);
  --footer-border: rgba(0, 0, 0, 0.08);
  --footer-text: #57606a;
  --kbd-bg: #ffffff;
  --kbd-border: #d0d7de;
  --kbd-text: #1f2328;
}

/* Base Modal Container */
.clipboard-modal-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-modal);
  backdrop-filter: blur(28px) saturate(190%);
  -webkit-backdrop-filter: blur(28px) saturate(190%);
  color: var(--text-main);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  user-select: none;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: var(--shadow-modal);
  box-sizing: border-box;
}

/* Header */
.search-header {
  display: flex;
  align-items: center;
  padding: 12px 18px;
  border-bottom: 1px solid var(--header-border);
  background: var(--header-bg);
  gap: 12px;
}

.search-icon {
  color: var(--search-icon);
  display: flex;
  align-items: center;
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-main);
  font-size: 15px;
  letter-spacing: 0.2px;
}

.search-input::placeholder {
  color: var(--search-placeholder);
}

/* Category Filter Tabs */
.category-tabs {
  display: flex;
  align-items: center;
  gap: 3px;
  background: var(--tab-bg);
  padding: 3px;
  border-radius: 8px;
  flex-shrink: 0;
}

.category-tab-btn {
  border: none;
  background: transparent;
  color: var(--tab-text);
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
  transition: all 0.15s ease;
  font-weight: 500;
}

.category-tab-btn:hover {
  color: var(--tab-hover-text);
  background: var(--tab-hover-bg);
}

.category-tab-btn.active {
  background: var(--tab-active-bg);
  color: var(--tab-active-text);
  box-shadow: var(--tab-active-shadow);
}

.category-tab-btn .tab-count {
  font-size: 10px;
  opacity: 0.85;
  background: var(--tab-count-bg);
  padding: 1px 5px;
  border-radius: 10px;
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--close-btn-color);
  font-size: 14px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
}

.close-btn:hover {
  background: var(--close-btn-hover);
  color: var(--text-main);
}

/* Body */
.modal-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* Left list column */
.list-column {
  width: 320px;
  border-right: 1px solid var(--list-border);
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.empty-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-tertiary);
  gap: 8px;
}

.empty-icon {
  font-size: 32px;
}

.history-item {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.12s ease;
  position: relative;
  gap: 10px;
  background: var(--item-bg);
  border: 1px solid var(--item-border);
}

.history-item:hover {
  background: var(--item-hover-bg);
}

.history-item.active {
  background: var(--item-active-bg);
  color: var(--item-active-text);
  border-color: transparent;
}

.item-icon-wrapper {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: var(--badge-wrap-bg);
  font-size: 13px;
  flex-shrink: 0;
}

.history-item.active .item-icon-wrapper {
  background: rgba(255, 255, 255, 0.22);
}

.item-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-title {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-main);
}

.history-item.active .item-title {
  color: #ffffff;
  font-weight: 500;
}

.item-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-secondary);
}

.history-item.active .item-meta {
  color: rgba(255, 255, 255, 0.85);
}

.item-actions {
  display: none;
  align-items: center;
  gap: 4px;
}

.history-item:hover .item-actions,
.history-item.active .item-actions {
  display: flex;
}

.action-icon-btn {
  background: transparent;
  border: none;
  font-size: 12px;
  cursor: pointer;
  padding: 3px 5px;
  border-radius: 4px;
  color: var(--act-btn-color);
}

.action-icon-btn:hover {
  background: var(--act-btn-hover);
}

.history-item.active .action-icon-btn {
  color: #ffffff;
}

.history-item.active .action-icon-btn:hover {
  background: rgba(255, 255, 255, 0.28);
}

.copied-check {
  color: #10b981;
  font-size: 13px;
  font-weight: bold;
}

/* Right preview column */
.preview-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--preview-bg);
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid var(--preview-border);
  background: var(--preview-header-bg);
}

.preview-meta-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.preview-type-tag {
  font-size: 11px;
  font-weight: 600;
  background: #3b82f6;
  color: #ffffff;
  padding: 2px 6px;
  border-radius: 4px;
}

.preview-timestamp {
  font-size: 12px;
  color: var(--text-secondary);
}

.preview-header-actions {
  display: flex;
  gap: 8px;
}

.btn {
  border: none;
  outline: none;
  font-size: 12px;
  padding: 5px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  font-weight: 500;
}

.btn-secondary {
  background: var(--btn-sec-bg);
  border: 1px solid var(--btn-sec-border);
  color: var(--btn-sec-text);
}

.btn-secondary:hover {
  background: var(--btn-sec-hover);
}

.btn-primary {
  background: #3b82f6;
  color: #ffffff;
}

.btn-primary:hover {
  background: #2563eb;
}

.preview-content-box {
  flex: 1;
  overflow: auto;
  padding: 16px;
}

.image-preview-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
}

.preview-img {
  max-width: 100%;
  max-height: 280px;
  object-fit: contain;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

.image-dimension-info {
  font-size: 12px;
  color: var(--text-secondary);
}

.text-preview-wrapper {
  height: 100%;
}

.preview-code-block {
  margin: 0;
  font-family: 'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--code-text);
  background: var(--code-bg);
  border: 1px solid var(--code-border);
  padding: 12px;
  border-radius: 8px;
}

.preview-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-tertiary);
  font-size: 14px;
}

/* Footer */
.footer-bar {
  display: flex;
  align-items: center;
  padding: 8px 18px;
  background: var(--footer-bg);
  border-top: 1px solid var(--footer-border);
  font-size: 11px;
  color: var(--footer-text);
  gap: 16px;
}

.shortcut-tip {
  display: flex;
  align-items: center;
  gap: 4px;
}

kbd {
  background: var(--kbd-bg);
  border: 1px solid var(--kbd-border);
  color: var(--kbd-text);
  padding: 2px 5px;
  border-radius: 4px;
  font-family: inherit;
  font-size: 10px;
  box-shadow: 0 1px 1px rgba(0, 0, 0, 0.08);
}

.footer-right {
  margin-left: auto;
}

.clear-all-link {
  background: transparent;
  border: none;
  color: #ef4444;
  cursor: pointer;
  font-size: 11px;
}

.clear-all-link:hover {
  text-decoration: underline;
}
</style>
