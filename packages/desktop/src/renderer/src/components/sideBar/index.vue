<template>
  <div
    ref="sideBar"
    class="side-bar"
    :style="[!rightColumn ? { 'min-width': '45px' } : {}, { width: `${finalSideBarWidth}px` }]"
  >
    <div class="left-column">
      <ul>
        <li
          v-for="(c, index) of sideBarIcons"
          :key="index"
          :class="{ active: c.id === rightColumn }"
          :aria-label="c.name()"
          @click="handleLeftIconClick(c.id)"
        >
          <component :is="c.icon" />
        </li>
      </ul>
      <ul class="bottom">
        <li
          v-for="(c, index) of sideBarBottomIcons"
          :key="index"
          :data-sidebar-id="c.id"
          :aria-label="c.name()"
          @mouseenter="showSidebarTooltip($event, c.name(), c.id)"
          @mouseleave="hideSidebarTooltip"
          @click="handleLeftBottomClick(c.id)"
        >
          <component :is="c.icon" />
        </li>
      </ul>
    </div>
    <teleport to="body">
      <div
        v-show="tooltipVisible"
        class="sidebar-instant-tooltip"
        :style="{ top: `${tooltipTop}px`, left: `${tooltipLeft}px` }"
      >
        <span class="sidebar-instant-tooltip-arrow" />
        <span class="sidebar-instant-tooltip-text">{{ tooltipText }}</span>
      </div>
    </teleport>
    <div
      v-show="rightColumn"
      class="right-column"
    >
      <tree
        v-show="rightColumn === 'files'"
        :project-tree="projectTree"
        :opened-files="openedFiles"
        :tabs="tabs"
      />
      <side-bar-search v-show="rightColumn === 'search'" />
    </div>
    <div
      v-show="rightColumn"
      ref="dragBar"
      class="drag-bar"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useLayoutStore } from '@/store/layout'
import { useProjectStore } from '@/store/project'
import { useEditorStore } from '@/store/editor'

import { sideBarIcons, sideBarBottomIcons } from './help'
import Tree from './tree.vue'
import SideBarSearch from './search.vue'
import { storeToRefs } from 'pinia'
import bus from '@/bus'
import type { TabDescriptor } from './types'

const TREE_MODE_MIN_WIDTH = 220

const layoutStore = useLayoutStore()
const projectStore = useProjectStore()
const editorStore = useEditorStore()

const sideBar = ref<HTMLDivElement | null>(null)
const dragBar = ref<HTMLDivElement | null>(null)

const openedFiles = ref<TabDescriptor[]>([])
const sideBarViewWidth = ref(280)
const noteListViewWidth = ref(300)

const { rightColumn, sideBarWidth, noteNavigationMode, noteListWidth } = storeToRefs(layoutStore)

const { projectTree } = storeToRefs(projectStore)
const { tabs } = storeToRefs(editorStore)

const minimumVisibleWidth = computed<number>(() => {
  return TREE_MODE_MIN_WIDTH
})

const finalSideBarWidth = computed<number>(() => {
  if (rightColumn.value === '') return 45
  const baseWidth = sideBarViewWidth.value < minimumVisibleWidth.value
    ? minimumVisibleWidth.value
    : sideBarViewWidth.value
  if (rightColumn.value === 'files' && noteNavigationMode.value === 'tree-list') {
    return baseWidth + noteListViewWidth.value + 4
  }
  return baseWidth
})

watch(
  () => sideBarWidth.value,
  width => {
    sideBarViewWidth.value = +width
  },
  { immediate: true }
)

watch(
  () => noteListWidth.value,
  width => {
    noteListViewWidth.value = +width
  },
  { immediate: true }
)

onMounted(() => {
  nextTick(() => {
    const dragBarEl = dragBar.value
    if (!dragBarEl) return
    let startX = 0
    let currentSideBarWidth = +sideBarWidth.value
    let currentNoteListWidth = +noteListWidth.value
    let startWidth = currentSideBarWidth
    let resizingListWidth = false

    const mouseUpHandler = (): void => {
      document.removeEventListener('mousemove', mouseMoveHandler, false)
      document.removeEventListener('mouseup', mouseUpHandler, false)
      if (resizingListWidth) {
        layoutStore.SET_NOTE_LIST_WIDTH(currentNoteListWidth)
      } else {
        layoutStore.CHANGE_SIDE_BAR_WIDTH(
          currentSideBarWidth < minimumVisibleWidth.value
            ? minimumVisibleWidth.value
            : currentSideBarWidth
        )
      }
    }

    const mouseMoveHandler = (event: MouseEvent): void => {
      const offset = event.clientX - startX
      if (resizingListWidth) {
        currentNoteListWidth = Math.max(220, startWidth + offset)
        noteListViewWidth.value = currentNoteListWidth
      } else {
        currentSideBarWidth = startWidth + offset
        sideBarViewWidth.value = currentSideBarWidth
      }
    }

    const mouseDownHandler = (event: MouseEvent): void => {
      startX = event.clientX
      resizingListWidth = rightColumn.value === 'files' && noteNavigationMode.value === 'tree-list'
      if (resizingListWidth) {
        startWidth = +noteListWidth.value
        currentNoteListWidth = startWidth
        noteListViewWidth.value = startWidth
      } else {
        startWidth = +sideBarWidth.value
        currentSideBarWidth = startWidth
        sideBarViewWidth.value = startWidth
      }
      document.addEventListener('mousemove', mouseMoveHandler, false)
      document.addEventListener('mouseup', mouseUpHandler, false)
    }

    dragBarEl.addEventListener('mousedown', mouseDownHandler, false)
  })
})

const tooltipVisible = ref(false)
const tooltipText = ref('')
const tooltipTop = ref(0)
const tooltipLeft = ref(0)
const activeIconId = ref('')

const showSidebarTooltip = (event: MouseEvent, text: string, id = ''): void => {
  if (!text) {
    tooltipVisible.value = false
    return
  }
  const target = event.currentTarget as HTMLElement | null
  if (!target) return
  const rect = target.getBoundingClientRect()
  tooltipTop.value = Math.round(rect.top + rect.height / 2)
  tooltipLeft.value = Math.round(rect.right + 8)
  tooltipText.value = text
  activeIconId.value = id
  tooltipVisible.value = true
}

const hideSidebarTooltip = (): void => {
  tooltipVisible.value = false
  activeIconId.value = ''
}

const handleWorkbenchSwitch = (event: Event): void => {
  const detail = (event as CustomEvent).detail
  if (detail === 'note') {
    nextTick(() => {
      const gitBtn = sideBar.value?.querySelector<HTMLElement>('li[data-sidebar-id="git"]')
      if (gitBtn) {
        const rect = gitBtn.getBoundingClientRect()
        tooltipTop.value = Math.round(rect.top + rect.height / 2)
        tooltipLeft.value = Math.round(rect.right + 8)
        const gitIcon = sideBarBottomIcons.find(item => item.id === 'git')
        tooltipText.value = gitIcon ? gitIcon.name() : 'Git管理'
        activeIconId.value = 'git'
        tooltipVisible.value = true
      }
    })
  }
}

const handleGlobalMouseMove = (event: MouseEvent): void => {
  if (tooltipVisible.value && activeIconId.value === 'git') {
    const gitBtn = sideBar.value?.querySelector<HTMLElement>('li[data-sidebar-id="git"]')
    if (gitBtn) {
      const rect = gitBtn.getBoundingClientRect()
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      ) {
        hideSidebarTooltip()
      }
    }
  }
}

onMounted(() => {
  window.addEventListener('marknotepro:switch-workbench', handleWorkbenchSwitch)
  window.addEventListener('mousemove', handleGlobalMouseMove)
})

onBeforeUnmount(() => {
  window.removeEventListener('marknotepro:switch-workbench', handleWorkbenchSwitch)
  window.removeEventListener('mousemove', handleGlobalMouseMove)
})

const handleLeftIconClick = (name: string): void => {
  hideSidebarTooltip()
  if (rightColumn.value === name) {
    const widthToPersist = sideBarViewWidth.value
    layoutStore.SET_LAYOUT({ rightColumn: '' })
    layoutStore.CHANGE_SIDE_BAR_WIDTH(widthToPersist)
  } else {
    layoutStore.SET_LAYOUT({ rightColumn: name })
    sideBarViewWidth.value = +sideBarWidth.value
    noteListViewWidth.value = +noteListWidth.value
  }
}

const handleLeftBottomClick = (name: string): void => {
  hideSidebarTooltip()
  if (name === 'git') {
    window.dispatchEvent(new CustomEvent('marknotepro:switch-workbench', { detail: 'git' }))
    return
  }
  if (name === 'settings') {
    projectStore.OPEN_SETTING_WINDOW()
  }
}
</script>

<style scoped>
.side-bar {
  display: flex;
  flex-shrink: 0;
  flex-grow: 0;
  width: 280px;
  height: 100vh;
  min-width: 220px;
  position: relative;
  color: var(--sideBarColor);
  user-select: none;
  background: var(--sideBarBgColor);
  border-right: 1px solid var(--itemBgColor);
}

.side-bar .left-column svg {
  color: var(--iconColor);
}

.left-column {
  height: 100%;
  width: 45px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding-top: 28px;
  box-sizing: border-box;
}

.left-column > ul {
  opacity: 1;
}

.left-column ul {
  list-style: none;
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
}

.left-column ul > li {
  width: 45px;
  height: 45px;
  margin: 0;
  padding: 0;
  display: flex;
  justify-content: space-around;
  align-items: center;
  cursor: pointer !important;
  position: relative;
}

.left-column ul > li * {
  cursor: pointer !important;
  pointer-events: none !important;
}

.left-column ul > li > svg {
  width: 18px;
  height: 18px;
  color: var(--sideBarIconColor);
  opacity: 1;
  transition: transform 0.25s ease-in-out;
}

.left-column ul > li.active > svg {
  color: var(--themeColor);
}

.side-bar:hover .left-column ul li svg {
  opacity: 1;
}

.right-column {
  flex: 1;
  width: calc(100% - 50px);
  overflow: hidden;
}

.drag-bar {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  height: 100%;
  width: 3px;
  cursor: col-resize;
}

.drag-bar:hover {
  border-right: 2px solid var(--iconColor);
}

.sidebar-instant-tooltip {
  position: fixed;
  z-index: 999999;
  display: inline-flex;
  align-items: center;
  pointer-events: none !important;
  padding: 5px 9px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  font-size: 12px;
  line-height: 1.25;
  font-weight: 450;
  color: #4b5563;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 6px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08);
  white-space: nowrap;
  transform: translateY(-50%);
  user-select: none;
  -webkit-app-region: no-drag;
}

body.dark .sidebar-instant-tooltip {
  font-weight: 500;
  color: #f0f3f6;
  background: rgba(30, 35, 42, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35), 0 1px 3px rgba(0, 0, 0, 0.2);
}

.sidebar-instant-tooltip-arrow {
  position: absolute;
  left: -4px;
  top: 50%;
  width: 7px;
  height: 7px;
  background: rgba(255, 255, 255, 0.96);
  border-left: 1px solid rgba(0, 0, 0, 0.12);
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
  transform: translateY(-50%) rotate(45deg);
  border-bottom-left-radius: 1px;
}

body.dark .sidebar-instant-tooltip-arrow {
  background: rgba(30, 35, 42, 0.96);
  border-left: 1px solid rgba(255, 255, 255, 0.15);
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
}

.sidebar-instant-tooltip-text {
  position: relative;
  z-index: 1;
}
</style>
