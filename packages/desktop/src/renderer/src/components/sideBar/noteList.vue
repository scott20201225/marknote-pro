<template>
  <div class="note-list">
    <div class="note-list-header">
      <span class="note-list-title text-overflow">{{ listTitle }}</span>
    </div>
    <div class="note-list-body">
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
          <file-icon :name="file.name" />
          <span class="text-overflow">{{ getNoteDisplayName(file, rootPath) }}</span>
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
      <div
        v-else
        class="note-list-empty"
      >
        {{ emptyText }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { MoreFilled } from '@element-plus/icons-vue'
import { useEditorStore } from '@/store/editor'
import { useProjectStore } from '@/store/project'
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
const { clipboard, selectedNotePath } = storeToRefs(projectStore)

const rootPath = computed<string | null>(() => props.projectTree?.pathname ?? null)
const selectedFolder = computed(() => {
  return findNoteFolderByPath(props.projectTree, selectedNotePath.value)
})
const selectedKind = computed(() => getNoteNodeKind(selectedFolder.value, rootPath.value))
const visibleFiles = computed<TreeFileNode[]>(() => {
  return getVisibleNoteFiles(selectedFolder.value, rootPath.value) as TreeFileNode[]
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

const handleFileClick = (file: TreeFileNode): void => {
  const { pathname } = file
  projectStore.SELECT_NOTE_PATH(window.path.dirname(pathname))
  projectStore.CHANGE_ACTIVE_ITEM(file)
  const openedTab = tabs.value.find((tab) => window.fileUtils.isSamePathSync(tab.pathname, pathname))
  if (openedTab) {
    if (currentFile.value?.pathname === openedTab.pathname) return
    editorStore.UPDATE_CURRENT_FILE(openedTab)
  } else {
    window.electron.ipcRenderer.send('mt::open-file', pathname, {})
  }
}

const showFileContextMenu = (event: MouseEvent, file: TreeFileNode): void => {
  projectStore.SELECT_NOTE_PATH(window.path.dirname(file.pathname))
  projectStore.CHANGE_ACTIVE_ITEM(file)
  showContextMenu(event, file, rootPath.value, !!clipboard.value)
}

const showFileActionMenu = (event: MouseEvent, file: TreeFileNode): void => {
  projectStore.SELECT_NOTE_PATH(window.path.dirname(file.pathname))
  projectStore.CHANGE_ACTIVE_ITEM(file)
  const target = event.currentTarget as HTMLElement | null
  const rect = target?.getBoundingClientRect()
  showContextMenu({
    clientX: rect ? rect.left + rect.width / 2 : event.clientX,
    clientY: rect ? rect.bottom : event.clientY
  }, file, rootPath.value, !!clipboard.value)
}
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
  min-height: 30px;
  padding: 0 12px;
  border-bottom: 1px solid var(--itemBgColor);
}

.note-list-title {
  font-size: 12px;
  color: var(--sideBarTitleColor);
}

.note-list-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.note-list-item {
  display: flex;
  align-items: center;
  gap: 8px;
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

.note-list-item > span {
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
</style>
