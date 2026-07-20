<template>
  <div class="side-bar-folder">
    <div
      ref="folderEl"
      class="folder-name"
      :style="{ 'padding-left': `${depth * 6 + 10}px` }"
      :class="[
        { active: activeItem?.pathname === folder.pathname || selectedNotePath === folder.pathname }
      ]"
      :title="folder.pathname"
      @click="folderNameClick"
    >
      <el-icon
        v-if="showCollapseArrow"
        class="icon-arrow"
        :class="{ fold: isCollapsed }"
        :size="12"
        @click.stop="toggleCollapsed"
      >
        <ArrowRight />
      </el-icon>
      <el-icon class="icon-node-type" :size="14">
        <component :is="folderTypeIcon" />
      </el-icon>
      <input
        v-if="renameCache === folder.pathname"
        ref="renameInput"
        v-model="newName"
        type="text"
        class="rename"
        @click.stop="noop"
        @keypress.enter="rename"
      />
      <span v-else class="text-overflow">{{ displayName }}</span>
      <button
        v-if="showActionButton"
        class="folder-action-button"
        type="button"
        :title="t('sideBar.tree.nodeActions')"
        @click.stop="showFolderActionMenu"
      >
        <el-icon :size="14">
          <MoreFilled />
        </el-icon>
      </button>
    </div>
    <div v-if="!isCollapsed" class="folder-contents">
      <tree-folder
        v-for="childFolder of visibleFolders"
        :key="childFolder.id"
        :folder="childFolder"
        :depth="depth + 1"
        :note-navigation-mode="noteNavigationMode"
      />
      <input
        v-if="showTreeCreateInput"
        ref="input"
        v-model="createName"
        type="text"
        :placeholder="createPlaceholder"
        class="new-input"
        :style="{ 'margin-left': `${depth * 5 + 15}px` }"
        @keypress.enter="handleInputEnter"
      />
      <File v-for="file of visibleFiles" :key="file.id" :file="file" :depth="depth + 1" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useProjectStore } from '@/store/project'
import { showContextMenu } from '../../contextMenu/sideBar'
import bus from '../../bus'
import File from './treeFile.vue'
import {
  ArrowRight,
  MoreFilled,
  Folder,
  FolderOpened,
  CollectionTag
} from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import {
  getNoteNodeKind,
  getNoteDisplayName,
  getVisibleNoteFiles,
  getVisibleNoteFolders
} from '../../util/noteWorkspace'
import type { TreeFileNode, TreeFolderNode } from './types'

const props = defineProps<{
  folder: TreeFolderNode
  depth: number
  noteNavigationMode?: 'tree' | 'tree-list'
}>()

const { t } = useI18n()
const projectStore = useProjectStore()

const createName = ref('')
const newName = ref('')

const folderEl = ref<HTMLDivElement | null>(null)
const renameInput = ref<HTMLInputElement | null>(null)
const input = ref<HTMLInputElement | null>(null)

const isCollapsed = computed<boolean>({
  get: () => !!props.folder.isCollapsed,
  set: (value) => {
    props.folder.isCollapsed = value
  }
})

const { renameCache } = storeToRefs(projectStore)
const { createCache } = storeToRefs(projectStore)
const { activeItem } = storeToRefs(projectStore)
const { clipboard } = storeToRefs(projectStore)
const { selectedNotePath } = storeToRefs(projectStore)
const rootPath = computed<string | null>(() => projectStore.projectTree?.pathname ?? null)
const folderKind = computed(() => getNoteNodeKind(props.folder, rootPath.value))
const displayName = computed<string>(() => getNoteDisplayName(props.folder, rootPath.value))
const visibleFolders = computed<TreeFolderNode[]>(() => {
  return getVisibleNoteFolders(props.folder, rootPath.value) as TreeFolderNode[]
})
const visibleFiles = computed<TreeFileNode[]>(() => {
  if (props.noteNavigationMode === 'tree-list') return []
  return getVisibleNoteFiles(props.folder, rootPath.value) as TreeFileNode[]
})
const createPlaceholder = computed<string>(() => {
  switch ((createCache.value as { type?: string }).type) {
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
const createCacheDirname = computed<string | undefined>(() => {
  return (createCache.value as { dirname?: string }).dirname
})
const createCacheType = computed<string | undefined>(() => {
  return (createCache.value as { type?: string }).type
})
const isCreatingNoteInListMode = computed<boolean>(() => {
  return (
    props.noteNavigationMode === 'tree-list' &&
    (createCacheType.value === 'document' || createCacheType.value === 'file')
  )
})
const showTreeCreateInput = computed<boolean>(() => {
  return createCacheDirname.value === props.folder.pathname && !isCreatingNoteInListMode.value
})
const showActionButton = computed<boolean>(
  () => folderKind.value === 'group' || folderKind.value === 'area'
)
const showCollapseArrow = computed<boolean>(() => {
  if (folderKind.value !== 'area') return true
  return props.noteNavigationMode !== 'tree-list'
})
const folderTypeIcon = computed(() => {
  if (folderKind.value === 'group') {
    return isCollapsed.value ? Folder : FolderOpened
  }
  return CollectionTag
})

const handleInputFocus = (): void => {
  // Only the folder that is the create target reacts. Expand it FIRST so the
  // create input renders even when the folder was collapsed, then focus it on
  // the next tick — previously the expand sat behind `if (input.value)`, which
  // is null while collapsed, so New File on a collapsed folder did nothing
  // (#3439).
  if (!showTreeCreateInput.value) return
  isCollapsed.value = false
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

const toggleCollapsed = (): void => {
  isCollapsed.value = !isCollapsed.value
}

const folderNameClick = (): void => {
  projectStore.CHANGE_ACTIVE_ITEM(props.folder)
  projectStore.SELECT_NOTE_PATH(props.folder.pathname)
  if (props.noteNavigationMode !== 'tree-list') {
    toggleCollapsed()
  }
}

const showFolderActionMenu = (event: MouseEvent): void => {
  projectStore.SELECT_NOTE_PATH(props.folder.pathname)
  projectStore.CHANGE_ACTIVE_ITEM(props.folder)
  const target = event.currentTarget as HTMLElement | null
  const rect = target?.getBoundingClientRect()
  showContextMenu(
    {
      clientX: rect ? rect.left + rect.width / 2 : event.clientX,
      clientY: rect ? rect.bottom : event.clientY
    },
    props.folder,
    rootPath.value,
    !!clipboard.value
  )
}

const noop = (): void => {}

const focusRenameInput = (): void => {
  nextTick(() => {
    if (renameInput.value) {
      renameInput.value.focus()
      newName.value = displayName.value
    }
  })
}

const rename = (): void => {
  if (newName.value) {
    projectStore.RENAME_IN_SIDEBAR(newName.value)
  }
}

onMounted(() => {
  if (folderEl.value) {
    folderEl.value.addEventListener('contextmenu', (event) => {
      event.preventDefault()
      projectStore.SELECT_NOTE_PATH(props.folder.pathname)
      projectStore.CHANGE_ACTIVE_ITEM(props.folder)
      showContextMenu(event, props.folder, rootPath.value, !!clipboard.value)
    })
  }
  bus.on('SIDEBAR::show-new-input', handleInputFocus)
  bus.on('SIDEBAR::show-rename-input', focusRenameInput)
})
</script>

<style scoped>
.side-bar-folder {
  & > .folder-name {
    cursor: default;
    user-select: none;
    display: flex;
    align-items: center;
    height: 30px;
    padding-right: 15px;
    gap: 6px;
    & > .icon-arrow {
      flex-shrink: 0;
      color: var(--sideBarIconColor);
      margin-right: 5px;
      transition: transform 0.25s ease-out;
      transform: rotate(90deg);
    }
    & > .icon-node-type {
      flex-shrink: 0;
      color: var(--sideBarIconColor);
      opacity: 0.9;
    }
    & > .icon-arrow.fold {
      transform: rotate(0);
    }
    &:hover {
      background: var(--sideBarItemHoverBgColor);
    }
  }
}

.side-bar-folder > .folder-name.active {
  background: var(--sideBarItemHoverBgColor);
}

.folder-name > span,
.folder-name > input.rename {
  flex: 1;
  min-width: 0;
}

.folder-action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--sideBarIconColor);
  cursor: pointer;
}

.folder-action-button:hover {
  background: var(--sideBarItemHoverBgColor);
  color: var(--sideBarTitleColor);
}
.new-input,
input.rename {
  outline: none;
  height: 22px;
  margin: 5px 0;
  padding: 0 6px;
  color: var(--sideBarColor);
  border: 1px solid var(--floatBorderColor);
  background: var(--floatBorderColor);
  width: 70%;
  border-radius: 3px;
}
</style>
