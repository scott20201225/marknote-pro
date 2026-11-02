<template>
  <div class="clipboard-modal-container" @keydown="handleGlobalKeydown">
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
        placeholder="搜索历史记录... (↑↓ 选择, ↵ 复制, P 钉在桌面, Esc 退出)"
        @input="onSearchInput"
      />

      <!-- Category Filter Tabs: 全部 / 图片 / 文本 -->
      <div class="category-tabs">
        <button
          :class="['category-tab-btn', { active: currentCategory === 'all' }]"
          @click="setCategory('all')"
        >
          全部 <span class="tab-count">{{ items.length }}</span>
        </button>
        <button
          :class="['category-tab-btn', { active: currentCategory === 'image' }]"
          @click="setCategory('image')"
        >
          图片 <span class="tab-count">{{ imageCount }}</span>
        </button>
        <button
          :class="['category-tab-btn', { active: currentCategory === 'text' }]"
          @click="setCategory('text')"
        >
          文本 <span class="tab-count">{{ textCount }}</span>
        </button>
      </div>

      <button class="close-btn" title="关闭 (Esc)" @click="closeModal">
        ✕
      </button>
    </div>

    <!-- Main Content Area -->
    <div class="modal-body">
      <!-- Left List Column -->
      <div ref="listRef" class="list-column">
        <div v-if="filteredItems.length === 0" class="empty-hint">
          <div class="empty-icon">📋</div>
          <div class="empty-text">无相关剪贴板历史</div>
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
              <span v-if="item.charCount" class="item-extra">{{ item.charCount }} 字符</span>
              <span v-else-if="item.width && item.height" class="item-extra">{{ item.width }}×{{ item.height }}</span>
            </div>
          </div>

          <div class="item-actions">
            <!-- For image: Pin to desktop -->
            <button
              v-if="item.type === 'image'"
              class="action-icon-btn pin"
              title="钉在桌面 (P)"
              @click.stop="pinItem(item)"
            >
              📌
            </button>
            <!-- Copy button for all -->
            <button
              class="action-icon-btn copy"
              :title="copiedItemId === item.id ? '已复制' : '复制到剪贴板'"
              @click.stop="copyItem(item)"
            >
              <span v-if="copiedItemId === item.id" class="copied-check">✓</span>
              <span v-else>📋</span>
            </button>
            <button class="action-icon-btn delete" title="删除" @click.stop="deleteItem(item)">
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
                title="钉在桌面 (P)"
                @click="pinItem(selectedItem)"
              >
                📌 贴图
              </button>
              <!-- Primary action: Copy & Close (↵) -->
              <button
                class="btn btn-primary"
                title="复制到剪贴板并退出 (↵)"
                @click="copyAndClose(selectedItem)"
              >
                <span v-if="copiedItemId === selectedItem.id">✓ 已复制</span>
                <span v-else>📋 复制</span>
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
                分辨率: {{ selectedItem.width || '?' }} × {{ selectedItem.height || '?' }} 像素
              </div>
            </div>

            <!-- Code or Text Preview -->
            <div v-else class="text-preview-wrapper">
              <pre class="preview-code-block"><code>{{ selectedItem.content }}</code></pre>
            </div>
          </div>
        </template>

        <div v-else class="preview-placeholder">
          选择左侧记录以预览内容
        </div>
      </div>
    </div>

    <!-- Footer Shortcuts Bar -->
    <div class="footer-bar">
      <div class="shortcut-tip"><kbd>↑</kbd><kbd>↓</kbd> 导航</div>
      <div class="shortcut-tip"><kbd>↵</kbd> 复制并退出</div>
      <div v-if="selectedItem?.type === 'image'" class="shortcut-tip"><kbd>P</kbd> 钉在桌面</div>
      <div class="shortcut-tip"><kbd>Esc</kbd> 退出</div>
      <div class="footer-right">
        <button class="clear-all-link" @click="clearAllHistory">清空全部历史</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import type { ClipboardItemRecord } from '@shared/types/clipboard'

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
  if (item.type === 'image') return `图片 (${item.width || 0} × ${item.height || 0})`
  return item.content.slice(0, 100)
}

const formatTime = (timestamp: number): string => {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return '刚刚'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  return `${days}天前`
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

const pasteItem = async (item: ClipboardItemRecord): Promise<void> => {
  try {
    const raw = JSON.parse(JSON.stringify(item))
    await window.electron.ipcRenderer.invoke('mt::clipboard-paste-item', raw)
  } catch (err) {
    console.error('Failed to paste item:', err)
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

onMounted(() => {
  loadHistory()

  removeShowSub = window.electron.ipcRenderer.on('mt::clipboard-modal-show', (_event, history) => {
    items.value = history || []
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
  window.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<style scoped>
.clipboard-modal-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: rgba(30, 32, 38, 0.94);
  backdrop-filter: blur(28px) saturate(190%);
  -webkit-backdrop-filter: blur(28px) saturate(190%);
  color: #e6e6e6;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  user-select: none;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.12);
  box-sizing: border-box;
}

/* Header */
.search-header {
  display: flex;
  align-items: center;
  padding: 12px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  gap: 12px;
}

.search-icon {
  color: #8c92a4;
  display: flex;
  align-items: center;
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #ffffff;
  font-size: 15px;
  letter-spacing: 0.2px;
}

.search-input::placeholder {
  color: #656d81;
}

/* Category Filter Tabs */
.category-tabs {
  display: flex;
  align-items: center;
  gap: 3px;
  background: rgba(255, 255, 255, 0.06);
  padding: 3px;
  border-radius: 8px;
  flex-shrink: 0;
}

.category-tab-btn {
  border: none;
  background: transparent;
  color: #94a3b8;
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
  color: #ffffff;
  background: rgba(255, 255, 255, 0.08);
}

.category-tab-btn.active {
  background: #3b82f6;
  color: #ffffff;
}

.category-tab-btn .tab-count {
  font-size: 10px;
  opacity: 0.85;
  background: rgba(0, 0, 0, 0.25);
  padding: 1px 5px;
  border-radius: 10px;
}

.category-tab-btn.active .tab-count {
  background: rgba(255, 255, 255, 0.25);
}

.stats-badge {
  font-size: 12px;
  color: #8c92a4;
  background: rgba(255, 255, 255, 0.07);
  padding: 3px 8px;
  border-radius: 6px;
}

.close-btn {
  background: transparent;
  border: none;
  color: #7b8296;
  font-size: 14px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
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
  border-right: 1px solid rgba(255, 255, 255, 0.08);
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
  color: #72798e;
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
}

.history-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.history-item.active {
  background: #3b82f6;
  color: #ffffff;
}

.item-icon-wrapper {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
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
  color: #e2e8f0;
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
  color: #7b8296;
}

.history-item.active .item-meta {
  color: rgba(255, 255, 255, 0.8);
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

.history-item.active .action-icon-btn {
  color: #ffffff;
}

.history-item.active .action-icon-btn:hover {
  background: rgba(255, 255, 255, 0.28);
}

.action-icon-btn {
  background: transparent;
  border: none;
  font-size: 12px;
  cursor: pointer;
  padding: 3px 5px;
  border-radius: 4px;
  color: #cbd5e1;
}

.action-icon-btn:hover {
  background: rgba(255, 255, 255, 0.2);
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
  background: rgba(18, 20, 24, 0.45);
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.02);
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
  color: #7b8296;
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
  background: rgba(255, 255, 255, 0.09);
  color: #e2e8f0;
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.18);
  color: #ffffff;
}

.btn-secondary.btn-success {
  background: #10b981;
  color: #ffffff;
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
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  background: rgba(0, 0, 0, 0.2);
}

.image-dimension-info {
  font-size: 12px;
  color: #8c92a4;
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
  color: #e2e8f0;
}

.preview-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #72798e;
  font-size: 14px;
}

/* Footer */
.footer-bar {
  display: flex;
  align-items: center;
  padding: 8px 18px;
  background: rgba(20, 22, 26, 0.95);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 11px;
  color: #7b8296;
  gap: 16px;
}

.shortcut-tip {
  display: flex;
  align-items: center;
  gap: 4px;
}

kbd {
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 5px;
  border-radius: 4px;
  color: #cbd5e1;
  font-family: inherit;
  font-size: 10px;
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
