<template>
  <div class="editor-tabs">
    <div ref="tabContainer" class="scrollable-tabs">
      <ul ref="tabDropContainer" class="tabs-container">
        <li
          v-for="file of tabs"
          :key="file.id"
          :title="file.pathname"
          :class="{ active: currentFile?.id === file.id, unsaved: !file.isSaved }"
          :data-id="file.id"
          @click.stop="selectFile(file)"
          @click.middle="closeTab(file.id)"
          @contextmenu.prevent="handleContextMenu($event, file)"
        >
          <span>{{ getDisplayFilename(file.filename) }}</span>
          <span class="unsaved-dot" />
          <el-icon class="close-icon" :size="12" @click.stop="removeFileInTab(file)">
            <Close />
          </el-icon>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useEditorStore } from '@/store/editor'
import { useLayoutStore } from '@/store/layout'
import { storeToRefs } from 'pinia'
import autoScroll from 'dom-autoscroller'
import dragula from 'dragula'
import { Close } from '@element-plus/icons-vue'
import { showContextMenu } from '../../contextMenu/tabs'
import bus from '../../bus'
import type { IFileState } from '@shared/types/files'

const editorStore = useEditorStore()
const layoutStore = useLayoutStore()

const { currentFile, tabs } = storeToRefs(editorStore)

interface TabScrollState {
  show: boolean
  canLeft: boolean
  canRight: boolean
}

const emit = defineEmits<{
  (event: 'scroll-state-change', state: TabScrollState): void
}>()

interface AutoScroller {
  readonly down: boolean
  destroy: (forceCleanAnimation?: boolean) => void
}

const tabContainer = ref<HTMLElement | null>(null)
const tabDropContainer = ref<HTMLElement | null>(null)
const showTabScrollControls = ref(false)
const canScrollTabsLeft = ref(false)
const canScrollTabsRight = ref(false)
let autoScroller: AutoScroller | null = null
let drake: dragula.Drake | null = null
let tabResizeObserver: ResizeObserver | null = null

const getDisplayFilename = (filename: string) => filename.replace(/\.md$/i, '')

const selectFile = (file: IFileState) => {
  if (file.id !== currentFile.value?.id) {
    editorStore.UPDATE_CURRENT_FILE(file)
  }
}

const removeFileInTab = (file: IFileState) => {
  const { isSaved } = file
  if (isSaved) {
    editorStore.FORCE_CLOSE_TAB(file)
  } else {
    editorStore.CLOSE_UNSAVED_TAB(file)
  }
}

const updateTabScrollState = () => {
  const tabsEl = tabContainer.value
  if (!tabsEl) return

  const maxLeft = Math.max(0, tabsEl.scrollWidth - tabsEl.clientWidth)
  showTabScrollControls.value = maxLeft > 1
  canScrollTabsLeft.value = tabsEl.scrollLeft > 1
  canScrollTabsRight.value = tabsEl.scrollLeft < maxLeft - 1
  emit('scroll-state-change', {
    show: showTabScrollControls.value,
    canLeft: canScrollTabsLeft.value,
    canRight: canScrollTabsRight.value
  })
}

const scrollActiveTabIntoView = () => {
  const container = tabContainer.value
  if (!container) return
  const activeTab = container.querySelector<HTMLElement>('li.active')
  if (!activeTab) return

  const containerRect = container.getBoundingClientRect()
  const tabRect = activeTab.getBoundingClientRect()
  if (tabRect.left < containerRect.left) {
    container.scrollLeft -= containerRect.left - tabRect.left
  } else if (tabRect.right > containerRect.right) {
    container.scrollLeft += tabRect.right - containerRect.right
  }
  updateTabScrollState()
}

const scrollTabs = (direction: 'left' | 'right') => {
  const tabsEl = tabContainer.value
  if (!tabsEl) return

  const distance = Math.max(160, Math.floor(tabsEl.clientWidth * 0.6))
  const maxLeft = Math.max(0, tabsEl.scrollWidth - tabsEl.clientWidth)
  const nextLeft =
    direction === 'left'
      ? Math.max(0, tabsEl.scrollLeft - distance)
      : Math.min(maxLeft, tabsEl.scrollLeft + distance)
  tabsEl.scrollTo({ left: nextLeft, behavior: 'smooth' })
}

const handleTabScroll = (event: WheelEvent) => {
  const tabsEl = tabContainer.value
  if (!tabsEl || tabsEl.scrollWidth <= tabsEl.clientWidth) return

  event.preventDefault()

  let delta = event.deltaY
  if (event.deltaX !== 0) {
    delta = event.deltaX
  }

  const maxLeft = tabsEl.scrollWidth - tabsEl.clientWidth
  const newLeft = Math.max(0, Math.min(tabsEl.scrollLeft + delta, maxLeft))
  tabsEl.scrollLeft = newLeft
  updateTabScrollState()
}

const closeTab = (tabId: unknown) => {
  const tab = tabs.value.find((f) => f.id === tabId)
  if (tab) {
    editorStore.CLOSE_TAB(tab)
  }
}

const closeOthers = (tabId: unknown) => {
  const tab = tabs.value.find((f) => f.id === tabId)
  if (tab) {
    editorStore.CLOSE_OTHER_TABS(tab)
  }
}

const closeSaved = () => {
  editorStore.CLOSE_SAVED_TABS()
}

const closeAll = () => {
  editorStore.CLOSE_ALL_TABS()
}

const changeMaxWidth = (width: unknown) => {
  layoutStore.CHANGE_SIDE_BAR_WIDTH(width as number)
}

const rename = (tabId: unknown) => {
  const tab = tabs.value.find((f) => f.id === tabId)
  if (tab && tab.pathname) {
    editorStore.RENAME_FILE(tab)
  }
}

const copyPath = (tabId: unknown) => {
  const tab = tabs.value.find((f) => f.id === tabId)
  if (tab && tab.pathname) {
    window.electron.clipboard.writeText(tab.pathname)
  }
}

const showInFolder = (tabId: unknown) => {
  const tab = tabs.value.find((f) => f.id === tabId)
  if (tab && tab.pathname) {
    window.electron.shell.showItemInFolder(tab.pathname)
  }
}

const handleContextMenu = (event: MouseEvent, tab: IFileState) => {
  if (tab.id) {
    showContextMenu(event, tab)
  }
}

watch(
  () => currentFile.value?.id,
  () => {
    nextTick(scrollActiveTabIntoView)
  }
)

watch(
  () => tabs.value.map((file) => file.id).join('|'),
  () => {
    nextTick(updateTabScrollState)
  }
)

onMounted(() => {
  bus.on('TABS::close-this', closeTab)
  bus.on('TABS::close-others', closeOthers)
  bus.on('TABS::close-saved', closeSaved)
  bus.on('TABS::close-all', closeAll)
  bus.on('TABS::rename', rename)
  bus.on('TABS::copy-path', copyPath)
  bus.on('TABS::show-in-folder', showInFolder)
  bus.on('EDITOR_TABS::change-max-width', changeMaxWidth)

  const tabsEl = tabContainer.value
  if (!tabsEl || !tabDropContainer.value) return

  tabsEl.addEventListener('wheel', handleTabScroll, { passive: false })
  tabsEl.addEventListener('scroll', updateTabScrollState)
  tabResizeObserver = new ResizeObserver(updateTabScrollState)
  tabResizeObserver.observe(tabsEl)
  nextTick(updateTabScrollState)

  drake = dragula([tabDropContainer.value], {
    direction: 'horizontal',
    revertOnSpill: true,
    mirrorContainer: tabDropContainer.value,
    ignoreInputTextSelection: false
  }).on('drop', (el, _target, _source, sibling) => {
    const droppedId = el?.getAttribute('data-id')
    const nextTabId = sibling ? sibling.getAttribute('data-id') : null
    const isLastTab = !sibling || sibling.classList.contains('gu-mirror')
    if (!droppedId || (sibling && !nextTabId)) {
      console.error('Tab reorder error: invalid tab IDs')
      return
    }

    editorStore.EXCHANGE_TABS_BY_ID({
      fromId: droppedId,
      toId: isLastTab ? null : nextTabId
    })
  })

  autoScroller = autoScroll([tabsEl], {
    margin: 20,
    maxSpeed: 6,
    scrollWhenOutside: false,
    autoScroll: () => {
      return autoScroller!.down && drake?.dragging
    }
  })
})

onBeforeUnmount(() => {
  const tabsEl = tabContainer.value
  if (tabsEl) {
    tabsEl.removeEventListener('wheel', handleTabScroll)
    tabsEl.removeEventListener('scroll', updateTabScrollState)
  }
  tabResizeObserver?.disconnect()

  if (autoScroller) {
    autoScroller.destroy(true)
  }
  if (drake) {
    drake.destroy()
  }

  bus.off('TABS::close-this', closeTab)
  bus.off('TABS::close-others', closeOthers)
  bus.off('TABS::close-saved', closeSaved)
  bus.off('TABS::close-all', closeAll)
  bus.off('TABS::rename', rename)
  bus.off('TABS::copy-path', copyPath)
  bus.off('TABS::show-in-folder', showInFolder)
  bus.off('EDITOR_TABS::change-max-width', changeMaxWidth)
})

defineExpose({
  scrollTabs
})
</script>

<style scoped>
.close-icon {
  cursor: pointer;
  transition: opacity 0.15s ease-in-out;
}

.close-icon:hover {
  color: var(--focusColor);
}

.editor-tabs {
  position: relative;
  display: flex;
  flex-direction: row;
  flex: 0 0 28px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  height: 28px;
  user-select: none;
  box-shadow: 0px 0px 9px 2px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.scrollable-tabs {
  flex: 1 1 auto;
  min-width: 0;
  height: 28px;
  box-sizing: border-box;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}

.scrollable-tabs::-webkit-scrollbar {
  display: none;
}

.tabs-container {
  min-width: min-content;
  list-style: none;
  margin: 0;
  padding: 0;
  height: 28px;
  position: relative;
  display: flex;
  flex-direction: row;
  z-index: 2;
  & > li {
    flex: 0 0 auto;
    transition: all 0.15s ease-in-out;
    position: relative;
    padding: 0 8px;
    color: var(--editorColor50);
    font-size: 12px;
    line-height: 28px;
    height: 28px;
    max-width: 280px;
    display: flex;
    align-items: center;
    &[aria-grabbed='true'] {
      color: var(--editorColor30) !important;
    }
    & > .close-icon {
      opacity: 0;
    }
    &:focus {
      outline: none;
    }
    &:hover {
      background: var(--floatBgColor) !important;
    }
    &:hover > .close-icon {
      opacity: 1;
    }
    &:hover > .unsaved-dot {
      display: none;
    }
    & > span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-right: 3px;
    }
    & > .unsaved-dot {
      display: none;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--themeColor);
      flex-shrink: 0;
    }
  }
  & > li.unsaved:not(.active) {
    & > .close-icon {
      opacity: 0;
    }
    & > .unsaved-dot {
      display: block;
    }
    &:hover > .close-icon {
      opacity: 1;
    }
    &:hover > .unsaved-dot {
      display: none;
    }
  }
  & > li.active {
    background: var(--itemBgColor);
    z-index: 3;
    &:after {
      content: '';
      position: absolute;
      left: 0;
      bottom: 0;
      right: 0;
      height: 2px;
      background: var(--themeColor);
    }
    & > .close-icon {
      opacity: 1;
    }
    & > .unsaved-dot {
      display: none;
    }
  }
}

/* dragula effects */
.gu-mirror {
  position: fixed !important;
  margin: 0 !important;
  z-index: 9999 !important;
  opacity: 0.8;
  cursor: grabbing;
}
.gu-hide {
  display: none !important;
}
.gu-unselectable {
  user-select: none !important;
}
.gu-transit {
  opacity: 0.2;
}
</style>
