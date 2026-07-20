<template>
  <div class="tree-view">
    <div class="title">
      <!-- Placeholder -->
    </div>

    <!-- Project tree view -->
    <div v-if="projectTree" class="project-tree">
      <div
        class="tree-wrapper"
        :class="{ 'tree-wrapper-split': noteNavigationMode === 'tree-list' }"
        :style="treeWrapperStyle"
        @contextmenu.prevent.stop="handleTreeWrapperContextMenu"
      >
        <div class="tree-panel">
          <div
            class="title"
            :class="{ active: isRootSelected }"
            @click="selectRoot"
            @contextmenu.prevent.stop="handleRootContextMenu"
          >
            <span class="default-cursor text-overflow">
              <input
                v-if="renameCache === projectTree.pathname"
                ref="renameInput"
                v-model="newName"
                type="text"
                class="rename root-rename-input"
                @click.stop
                @keypress.enter="renameRoot"
              />
              <template v-else>{{ projectDisplayName }}</template>
            </span>
            <button
              type="button"
              class="note-navigation-toggle"
              :title="noteNavigationToggleTitle"
              @click.stop="toggleNoteNavigationMode"
            >
              <el-icon :size="14">
                <component :is="noteNavigationToggleIcon" />
              </el-icon>
            </button>
            <button
              class="tree-action-button"
              type="button"
              :title="t('sideBar.tree.workspaceActions')"
              @click.stop="showRootActionMenu"
            >
              <el-icon :size="14">
                <MoreFilled />
              </el-icon>
            </button>
          </div>
          <folder
            v-for="folder of visibleRootFolders"
            :key="folder.id"
            :folder="folder"
            :depth="depth"
            :note-navigation-mode="noteNavigationMode"
          />
          <input
            v-show="showTreeCreateInput"
            ref="input"
            v-model="createName"
            :placeholder="createPlaceholder"
            type="text"
            class="new-input"
            :style="{ 'margin-left': `${depth * 5 + 15}px` }"
            @keypress.enter="handleInputEnter"
          />
          <file v-for="file of visibleRootFiles" :key="file.id" :file="file" :depth="depth" />
          <div
            v-if="
              visibleRootFiles.length === 0 &&
              visibleRootFolders.length === 0 &&
              createCacheDirname !== projectTree.pathname
            "
            class="empty-project"
          >
            <span>{{ t('sideBar.tree.emptyWorkspace') }}</span>
            <div class="centered-group">
              <button class="button-primary" @click.stop="createGroup">
                {{ t('sideBar.tree.createGroup') }}
              </button>
            </div>
          </div>
        </div>
        <div
          v-if="noteNavigationMode === 'tree-list'"
          class="tree-split-drag-bar"
          @mousedown.prevent="handleSplitDragStart"
        />
        <note-list
          v-if="noteNavigationMode === 'tree-list'"
          class="note-list-panel"
          :project-tree="projectTree"
        />
      </div>
    </div>
    <div v-else class="open-project">
      <div class="centered-group">
        <el-button text bg type="primary" @click="openFolder">
          {{ t('sideBar.tree.openWorkspace') }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useProjectStore } from '@/store/project'
import { usePreferencesStore } from '@/store/preferences'
import { useLayoutStore } from '@/store/layout'
import { useEditorStore } from '@/store/editor'
import Folder from './treeFolder.vue'
import File from './treeFile.vue'
import NoteList from './noteList.vue'
import bus from '../../bus'
import { showContextMenu } from '../../contextMenu/sideBar'
import { useI18n } from 'vue-i18n'
import { MoreFilled, DArrowLeft, DArrowRight } from '@element-plus/icons-vue'
import {
  getNoteDisplayName,
  getVisibleNoteFiles,
  getVisibleNoteFolders
} from '../../util/noteWorkspace'
import type { TreeFileNode, TreeFolderNode, TreeNode, TabDescriptor } from './types'

const { t } = useI18n()

const props = defineProps<{
  // The project store seeds `projectTree` as `null` until a folder is
  // opened; the template renders the "open project" empty-state behind
  // `v-if="projectTree"`. Type the prop nullable to match runtime + the
  // template guard.
  projectTree: TreeNode | null
  tabs?: TabDescriptor[]
}>()

const depth = 0
const TREE_PANEL_MIN_WIDTH = 180
const TREE_SPLIT_MIN_WIDTH = TREE_PANEL_MIN_WIDTH + 45
const createName = ref('')
const input = ref<HTMLInputElement | null>(null)
const renameInput = ref<HTMLInputElement | null>(null)
const newName = ref('')

const projectStore = useProjectStore()
const preferencesStore = usePreferencesStore()
const layoutStore = useLayoutStore()
const editorStore = useEditorStore()

// Computed properties
const { createCache, renameCache, clipboard } = storeToRefs(projectStore)
const { selectedNotePath } = storeToRefs(projectStore)
const { noteNavigationMode, sideBarWidth, noteListWidth } = storeToRefs(layoutStore)
const { currentFile } = storeToRefs(editorStore)

// The createCache state is `{ dirname, type }` while an input is shown, and
// `{}` otherwise. Expose a typed accessor for the template so we don't have
// to thread `as any` through every comparison.
const createCacheDirname = computed<string | undefined>(() => {
  const cache = createCache.value as { dirname?: string }
  return cache.dirname
})

const createCacheType = computed<string | undefined>(() => {
  const cache = createCache.value as { type?: string }
  return cache.type
})

const isCreatingNoteInListMode = computed<boolean>(() => {
  return (
    noteNavigationMode.value === 'tree-list' &&
    (createCacheType.value === 'document' || createCacheType.value === 'file')
  )
})

const showTreeCreateInput = computed<boolean>(() => {
  return createCacheDirname.value === props.projectTree?.pathname && !isCreatingNoteInListMode.value
})

const createPlaceholder = computed<string>(() => {
  switch (createCacheType.value) {
    case 'group':
      return t('sideBar.tree.groupNamePlaceholder')
    case 'area':
      return t('sideBar.tree.areaNamePlaceholder')
    case 'document':
    case 'file':
      return t('sideBar.tree.documentNamePlaceholder')
    default:
      return t('sideBar.tree.documentNamePlaceholder')
  }
})

const rootPath = computed<string | null>(() => props.projectTree?.pathname ?? null)
const isRootSelected = computed<boolean>(() => {
  if (!rootPath.value || !selectedNotePath.value) return false
  return window.fileUtils.isSamePathSync(rootPath.value, selectedNotePath.value)
})
const projectDisplayName = computed<string>(() => {
  return getNoteDisplayName(props.projectTree, rootPath.value)
})
const visibleRootFolders = computed<TreeFolderNode[]>(() => {
  return getVisibleNoteFolders(props.projectTree, rootPath.value) as TreeFolderNode[]
})
const visibleRootFiles = computed<TreeFileNode[]>(() => {
  if (noteNavigationMode.value === 'tree-list') return []
  return getVisibleNoteFiles(props.projectTree, rootPath.value) as TreeFileNode[]
})
const noteNavigationToggleIcon = computed(() => {
  return noteNavigationMode.value === 'tree-list' ? DArrowLeft : DArrowRight
})
const noteNavigationToggleTitle = computed(() => {
  return noteNavigationMode.value === 'tree-list'
    ? t('sideBar.tree.noteNavigationCollapse')
    : t('sideBar.tree.noteNavigationExpand')
})
const treeWrapperStyle = computed<Record<string, string> | undefined>(() => {
  if (noteNavigationMode.value !== 'tree-list') return undefined
  const treePanelWidth = Math.max(TREE_PANEL_MIN_WIDTH, Number(sideBarWidth.value) - 45)
  return {
    '--tree-panel-width': `${treePanelWidth}px`,
    '--note-list-width': `${noteListWidth.value}px`
  }
})

// Methods
const openFolder = (): void => {
  projectStore.ASK_FOR_OPEN_PROJECT()
}

const createGroup = (): void => {
  projectStore.CHANGE_ACTIVE_ITEM(props.projectTree)
  bus.emit('SIDEBAR::new', 'group')
}

const selectRoot = (): void => {
  if (!props.projectTree) return
  projectStore.CHANGE_ACTIVE_ITEM(props.projectTree)
  projectStore.SELECT_NOTE_PATH(props.projectTree.pathname)
}

const toggleNoteNavigationMode = (): void => {
  if (noteNavigationMode.value === 'tree-list') {
    layoutStore.SET_NOTE_NAVIGATION_MODE('tree')
    return
  }

  layoutStore.SET_NOTE_NAVIGATION_MODE('tree-list')
}

const handleSplitDragStart = (event: MouseEvent): void => {
  let startX = event.clientX
  let startWidth = sideBarWidth.value

  const mouseUpHandler = (): void => {
    document.removeEventListener('mousemove', mouseMoveHandler, false)
    document.removeEventListener('mouseup', mouseUpHandler, false)
  }

  const mouseMoveHandler = (moveEvent: MouseEvent): void => {
    const offset = moveEvent.clientX - startX
    const nextWidth = Math.max(TREE_SPLIT_MIN_WIDTH, startWidth + offset)
    layoutStore.SET_SIDE_BAR_WIDTH(nextWidth)
  }

  document.addEventListener('mousemove', mouseMoveHandler, false)
  document.addEventListener('mouseup', mouseUpHandler, false)
}

const handleRootContextMenu = (event: MouseEvent): void => {
  if (props.projectTree) {
    projectStore.SELECT_NOTE_PATH(props.projectTree.pathname)
  }
  projectStore.CHANGE_ACTIVE_ITEM(props.projectTree)
  showContextMenu(event, props.projectTree, rootPath.value, !!clipboard.value)
}

const showRootActionMenu = (event: MouseEvent): void => {
  if (!props.projectTree) return
  projectStore.SELECT_NOTE_PATH(props.projectTree.pathname)
  projectStore.CHANGE_ACTIVE_ITEM(props.projectTree)
  const target = event.currentTarget as HTMLElement | null
  const rect = target?.getBoundingClientRect()
  showContextMenu(
    {
      clientX: rect ? rect.left + rect.width / 2 : event.clientX,
      clientY: rect ? rect.bottom : event.clientY
    },
    props.projectTree,
    rootPath.value,
    !!clipboard.value
  )
}

const handleTreeWrapperContextMenu = (event: MouseEvent): void => {
  const target = event.target as HTMLElement | null

  // Let folder/file nodes keep their own context-menu behavior; only treat
  // clicks on the root wrapper/empty area as "root".
  if (target?.closest('.side-bar-folder, .side-bar-file')) {
    return
  }

  handleRootContextMenu(event)
}

// From createFileOrDirectoryMixins
const handleInputFocus = (): void => {
  if (isCreatingNoteInListMode.value) return
  nextTick(() => {
    if (input.value) {
      input.value.focus()
      createName.value = ''
    }
  })
}

const handleInputEnter = (): void => {
  projectStore.CREATE_FILE_DIRECTORY(createName.value)
}

const focusRootRenameInput = (): void => {
  if (!props.projectTree || renameCache.value !== props.projectTree.pathname) return
  nextTick(() => {
    if (renameInput.value) {
      renameInput.value.focus()
      newName.value = projectDisplayName.value
    }
  })
}

const renameRoot = (): void => {
  if (newName.value) {
    projectStore.RENAME_IN_SIDEBAR(newName.value)
  }
}

onMounted(() => {
  bus.on('SIDEBAR::show-new-input', handleInputFocus)
  bus.on('SIDEBAR::show-rename-input', focusRootRenameInput)

  // Hide rename / create inputs on outside clicks. Buttons that open these
  // inputs must use @click.stop so their click never reaches this listener.
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null
    if (target && target.tagName !== 'INPUT') {
      projectStore.CHANGE_ACTIVE_ITEM({})
      projectStore.createCache = {}
      projectStore.renameCache = null
    }
  })

  document.addEventListener('contextmenu', (event) => {
    const target = event.target as HTMLElement | null
    if (target && target.tagName !== 'INPUT') {
      projectStore.createCache = {}
      projectStore.renameCache = null
    }
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      projectStore.createCache = {}
      projectStore.renameCache = null
    }
  })
})

watch(
  () => currentFile.value?.pathname,
  (pathname) => {
    if (!pathname || !props.projectTree) return
    if (window.fileUtils.isChildOfDirectory(props.projectTree.pathname, pathname)) {
      projectStore.SELECT_NOTE_PATH(window.path.dirname(pathname))
    }
  },
  { immediate: true }
)
</script>

<style scoped>
.list-item {
  display: inline-block;
  margin-right: 10px;
}

.list-enter-active,
.list-leave-active {
  transition: all 0.2s;
}
.list-enter, .list-leave-to
  /* .list-leave-active for below version 2.1.8 */ {
  opacity: 0;
  transform: translateX(-50px);
}
.tree-view {
  font-size: 14px;
  color: var(--sideBarColor);
  display: flex;
  flex-direction: column;
  height: 100%;
}
.tree-view > .title {
  height: 35px;
  line-height: 35px;
  padding: 0 15px;
  display: flex;
  flex-shrink: 0;
  flex-direction: row-reverse;
}

.tree-panel > .title {
  height: 30px;
  line-height: 30px;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.tree-panel > .title > span {
  flex: 1;
  min-width: 0;
}

.note-navigation-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--sideBarIconColor);
  cursor: pointer;
}

.note-navigation-toggle:hover {
  background: var(--sideBarItemHoverBgColor);
  color: var(--sideBarTitleColor);
}

.root-rename-input {
  width: 100%;
  min-width: 0;
  height: 22px;
  outline: none;
  padding: 0 8px;
  color: var(--sideBarColor);
  border: 1px solid var(--floatBorderColor);
  background: var(--floatBorderColor);
  border-radius: 3px;
}
.default-cursor {
  cursor: pointer;
}

.project-tree {
  display: flex;
  flex-direction: column;
  overflow: auto;
  flex: 1;
}

.tree-panel > .title {
  padding-right: 15px;
  display: flex;
  align-items: center;
}

.tree-panel > .title.active {
  background: var(--sideBarItemHoverBgColor);
}

.tree-panel > .title > span {
  flex: 1;
  user-select: none;
}

.tree-action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--sideBarIconColor);
  cursor: pointer;
}

.tree-action-button:hover {
  background: var(--sideBarItemHoverBgColor);
  color: var(--sideBarTitleColor);
}

.tree-panel > .title > a {
  pointer-events: auto;
  cursor: pointer;
  margin-left: 8px;
  color: var(--sideBarIconColor);
  opacity: 0;
}

.tree-panel > .title > a:hover {
  color: var(--highlightThemeColor);
}

.tree-panel > .title > a.active {
  color: var(--highlightThemeColor);
}

.project-tree > .tree-wrapper {
  overflow: auto;
  flex: 1;
}

.project-tree > .tree-wrapper.tree-wrapper-split {
  display: grid;
  grid-template-columns:
    minmax(180px, var(--tree-panel-width, 235px))
    4px
    minmax(220px, var(--note-list-width, 300px));
  overflow: hidden;
}

.tree-panel {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.tree-split-drag-bar {
  width: 4px;
  cursor: col-resize;
  background: transparent;
  transition: background 0.15s ease;
}

.tree-split-drag-bar:hover {
  background: var(--itemBgColor);
}

.note-list-panel {
  min-width: 0;
}

.project-tree > .tree-wrapper::-webkit-scrollbar:vertical {
  width: 8px;
}
.project-tree div.title:hover > a {
  opacity: 1;
}
.open-project {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  align-items: center;
  padding-bottom: 100px;
}

.open-project .centered-group {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.open-project .el-button {
  margin-top: 20px;
}
.open-project .el-button.is-text.is-has-bg,
.empty-project .el-button.is-text.is-has-bg {
  background-color: var(--buttonPrimaryBgColor);
  color: var(--buttonPrimaryFontColor);
  border-color: transparent;
}
.open-project .el-button.is-text.is-has-bg:hover,
.open-project .el-button.is-text.is-has-bg:focus,
.empty-project .el-button.is-text.is-has-bg:hover,
.empty-project .el-button.is-text.is-has-bg:focus {
  background-color: var(--buttonPrimaryBgColorHover);
  color: var(--buttonPrimaryFontColorHover);
}
.new-input {
  outline: none;
  height: 22px;
  margin: 5px 0;
  padding: 0 6px;
  color: var(--sideBarColor);
  border: 1px solid var(--floatBorderColor);
  background: var(--inputBgColor);
  width: calc(100% - 45px);
  border-radius: 3px;
}
.tree-wrapper {
  position: relative;
}
.empty-project {
  font-size: 14px;
  display: flex;
  flex-direction: column;
  padding-top: 40px;
  align-items: center;
  color: var(--sideBarTextColor);
  & button {
    margin-top: 10px;
  }
}

.empty-project > a {
  color: var(--highlightThemeColor);
  text-align: center;
  margin-top: 15px;
  text-decoration: none;
}
.bold {
  font-weight: 600;
}
</style>
