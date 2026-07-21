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
          :title="c.name()"
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
          :title="c.name()"
          :aria-label="c.name()"
          @click="handleLeftBottomClick(c.id)"
        >
          <component :is="c.icon" />
        </li>
      </ul>
    </div>
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
      <toc v-show="rightColumn === 'toc'" />
    </div>
    <div
      v-show="rightColumn"
      ref="dragBar"
      class="drag-bar"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useLayoutStore } from '@/store/layout'
import { useProjectStore } from '@/store/project'
import { useEditorStore } from '@/store/editor'

import { sideBarIcons, sideBarBottomIcons } from './help'
import Tree from './tree.vue'
import SideBarSearch from './search.vue'
import Toc from './toc.vue'
import { storeToRefs } from 'pinia'
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

const handleLeftIconClick = (name: string): void => {
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
  cursor: pointer;
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
</style>
