<template>
  <div class="note-list">
    <div
      class="note-list-header"
      :class="{ active: !!contextTarget }"
      @click="selectContextTarget"
      @contextmenu.prevent.stop="showListContextMenu"
    >
      <span class="note-list-title text-overflow">{{ listTitle }}</span>
      <button
        v-if="contextTarget"
        class="note-action-button"
        type="button"
        :title="t('sideBar.tree.nodeActions')"
        @click.stop="showListActionMenu"
      >
        <el-icon :size="14">
          <MoreFilled />
        </el-icon>
      </button>
    </div>
    <div class="note-list-body" @contextmenu.prevent.stop="handleBodyContextMenu">
      <input
        v-if="showCreateInput"
        ref="createInput"
        v-model="createName"
        :placeholder="createPlaceholder"
        type="text"
        class="note-list-create-input"
        @keypress.enter="createDocument"
      />
      <template v-if="visibleFiles.length">
        <div
          v-for="file of visibleFiles"
          :key="file.pathname"
          class="note-list-item"
          :class="{ current: currentFile?.pathname === file.pathname }"
          :title="file.pathname"
          @click="handleFileClick(file)"
          @contextmenu.prevent.stop="showFileContextMenu($event, file)"
        >
          <div class="note-list-main">
            <file-icon :name="file.name" />
            <input
              v-if="renameCache === file.pathname"
              :ref="(el) => setRenameInputRef(file.pathname, el)"
              v-model="newName"
              type="text"
              class="rename"
              @click.stop="noop"
              @keypress.enter="rename"
            />
            <span v-else class="note-list-name text-overflow">{{
              getNoteDisplayName(file, rootPath)
            }}</span>
          </div>
          <button
            class="note-action-button"
            type="button"
            :title="t('sideBar.tree.nodeActions')"
            @click.stop="showFileActionMenu($event, file)"
          >
            <el-icon :size="14">
              <MoreFilled />
            </el-icon>
          </button>
        </div>
      </template>
      <div v-else class="note-list-empty">
        {{ emptyText }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { MoreFilled } from '@element-plus/icons-vue'
import { useEditorStore } from '@/store/editor'
import { useProjectStore } from '@/store/project'
import bus from '../../bus'
import { showContextMenu } from '../../contextMenu/sideBar'
import FileIcon from './icon.vue'
import {
  findNoteFolderByPath,
  getNoteDisplayName,
  getNoteNodeKind,
  getVisibleNoteFiles
} from '../../util/noteWorkspace'
import type { TreeFileNode, TreeNode } from './types'

const props = defineProps<{
  projectTree: TreeNode | null
}>()

const { t } = useI18n()
const projectStore = useProjectStore()
const editorStore = useEditorStore()

const { currentFile, tabs } = storeToRefs(editorStore)
const { clipboard, createCache, renameCache, selectedNotePath } = storeToRefs(projectStore)

const createInput = ref<HTMLInputElement | null>(null)
const createName = ref('')
const newName = ref('')
const renameInputs = new Map<string, HTMLInputElement>()

const rootPath = computed<string | null>(() => props.projectTree?.pathname ?? null)
const selectedFolder = computed(() => {
  return findNoteFolderByPath(props.projectTree, selectedNotePath.value)
})
const selectedKind = computed(() => getNoteNodeKind(selectedFolder.value, rootPath.value))
const contextTarget = computed<TreeNode | null>(() => {
  return (selectedFolder.value as TreeNode | null) ?? props.projectTree
})
const visibleFiles = computed<TreeFileNode[]>(() => {
  return getVisibleNoteFiles(selectedFolder.value, rootPath.value) as TreeFileNode[]
})
const createCacheType = computed<string | undefined>(() => {
  return (createCache.value as { type?: string }).type
})
const showCreateInput = computed<boolean>(() => {
  if (!contextTarget.value) return false
  if (!(selectedKind.value === 'area' || selectedKind.value === 'document')) return false

  const isDocumentCreate = createCacheType.value === 'document' || createCacheType.value === 'file'
  if (!isDocumentCreate) return false

  return (createCache.value as { dirname?: string }).dirname === contextTarget.value.pathname
})
const createPlaceholder = computed<string>(() => {
  return t('sideBar.tree.documentNamePlaceholder')
})
const listTitle = computed(() => {
  if (selectedKind.value === 'area' || selectedKind.value === 'document') {
    return getNoteDisplayName(selectedFolder.value, rootPath.value)
  }
  if (selectedKind.value === 'group') {
    return t('sideBar.tree.notesListTitle')
  }
  return t('sideBar.tree.notesListTitle')
})
const emptyText = computed(() => {
  if (selectedKind.value === 'root' || selectedKind.value === 'group') {
    return t('sideBar.tree.selectAreaToViewNotes')
  }
  return t('sideBar.tree.noNotesInArea')
})

const noop = (): void => {}

const setRenameInputRef = (pathname: string, el: unknown): void => {
  if (el instanceof HTMLInputElement) {
    renameInputs.set(pathname, el)
  } else {
    renameInputs.delete(pathname)
  }
}

const focusRenameInput = (): void => {
  const pathname = renameCache.value
  if (!pathname) return

  nextTick(() => {
    const input = renameInputs.get(pathname)
    const file = visibleFiles.value.find((item) =>
      window.fileUtils.isSamePathSync(item.pathname, pathname)
    )
    if (!input || !file) return

    newName.value = getNoteDisplayName(file, rootPath.value)
    input.focus()
    input.select()
  })
}

const focusCreateInput = (): void => {
  if (!showCreateInput.value) return

  nextTick(() => {
    if (!createInput.value) return
    createName.value = ''
    createInput.value.focus()
  })
}

const rename = (): void => {
  if (newName.value) {
    projectStore.RENAME_IN_SIDEBAR(newName.value)
  }
}

const createDocument = (): void => {
  if (createName.value) {
    projectStore.CREATE_FILE_DIRECTORY(createName.value)
  }
}

const selectContextTarget = (): void => {
  if (!contextTarget.value) return
  projectStore.SELECT_NOTE_PATH(contextTarget.value.pathname)
  projectStore.CHANGE_ACTIVE_ITEM(contextTarget.value)
}

const handleFileClick = (file: TreeFileNode): void => {
  const { pathname } = file
  projectStore.SELECT_NOTE_PATH(window.path.dirname(pathname))
  projectStore.CHANGE_ACTIVE_ITEM(file)
  const openedTab = tabs.value.find((tab) =>
    window.fileUtils.isSamePathSync(tab.pathname, pathname)
  )
  if (openedTab) {
    if (currentFile.value?.pathname === openedTab.pathname) return
    editorStore.UPDATE_CURRENT_FILE(openedTab)
  } else {
    window.electron.ipcRenderer.send('mt::open-file', pathname, {})
  }
}

const showFileContextMenu = (event: MouseEvent, file: TreeFileNode): void => {
  projectStore.CHANGE_CONTEXT_MENU_ITEM(file)
  showContextMenu(event, file, rootPath.value, !!clipboard.value)
}

const showFileActionMenu = (event: MouseEvent, file: TreeFileNode): void => {
  projectStore.CHANGE_CONTEXT_MENU_ITEM(file)
  const target = event.currentTarget as HTMLElement | null
  const rect = target?.getBoundingClientRect()
  showContextMenu(
    {
      clientX: rect ? rect.left + rect.width / 2 : event.clientX,
      clientY: rect ? rect.bottom : event.clientY
    },
    file,
    rootPath.value,
    !!clipboard.value
  )
}

const showListContextMenu = (event: MouseEvent): void => {
  if (!contextTarget.value) return
  projectStore.CHANGE_CONTEXT_MENU_ITEM(contextTarget.value)
  showContextMenu(event, contextTarget.value, rootPath.value, !!clipboard.value)
}

const showListActionMenu = (event: MouseEvent): void => {
  if (!contextTarget.value) return
  projectStore.CHANGE_CONTEXT_MENU_ITEM(contextTarget.value)
  const target = event.currentTarget as HTMLElement | null
  const rect = target?.getBoundingClientRect()
  showContextMenu(
    {
      clientX: rect ? rect.left + rect.width / 2 : event.clientX,
      clientY: rect ? rect.bottom : event.clientY
    },
    contextTarget.value,
    rootPath.value,
    !!clipboard.value
  )
}

const handleBodyContextMenu = (event: MouseEvent): void => {
  const target = event.target as HTMLElement | null
  if (target?.closest('.note-list-item')) {
    return
  }

  showListContextMenu(event)
}

onMounted(() => {
  bus.on('SIDEBAR::show-new-input', focusCreateInput)
  bus.on('SIDEBAR::show-rename-input', focusRenameInput)
})

onBeforeUnmount(() => {
  bus.off('SIDEBAR::show-new-input', focusCreateInput)
  bus.off('SIDEBAR::show-rename-input', focusRenameInput)
})
</script>

<style scoped>
.note-list {
  min-width: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--itemBgColor);
  background: var(--sideBarBgColor);
}

.note-list-header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 0 12px;
  border-bottom: 1px solid var(--itemBgColor);
}

.note-list-header.active,
.note-list-header:hover {
  background: var(--sideBarItemHoverBgColor);
}

.note-list-title {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--sideBarTitleColor);
}

.note-list-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.note-list-create-input {
  display: block;
  width: calc(100% - 24px);
  margin: 8px 12px 4px;
  height: 22px;
  outline: none;
  padding: 0 8px;
  color: var(--sideBarColor);
  border: 1px solid var(--floatBorderColor);
  background: var(--floatBorderColor);
  border-radius: 3px;
}

.note-list-item {
  display: flex;
  align-items: center;
  min-height: 32px;
  padding: 0 12px;
  cursor: default;
}

.note-list-item:hover {
  background: var(--sideBarItemHoverBgColor);
}

.note-list-item.current {
  background: var(--sideBarItemHoverBgColor);
  color: var(--themeColor);
}

.note-list-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.note-list-name {
  flex: 1;
  min-width: 0;
}

.note-list-main > input.rename {
  flex: 1;
  min-width: 0;
}

.note-action-button {
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

.note-action-button:hover {
  background: var(--sideBarItemHoverBgColor);
  color: var(--sideBarTitleColor);
}

.note-list-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  padding: 0 16px;
  text-align: center;
  color: var(--editorColor50);
  font-size: 12px;
}

input.rename {
  height: 22px;
  outline: none;
  margin: 5px 0;
  padding: 0 8px;
  color: var(--sideBarColor);
  border: 1px solid var(--floatBorderColor);
  background: var(--floatBorderColor);
  width: 100%;
  border-radius: 3px;
}
</style>
