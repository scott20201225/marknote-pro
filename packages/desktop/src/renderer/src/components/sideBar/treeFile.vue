<template>
  <div
    ref="fileEl"
    :title="file.pathname"
    class="side-bar-file"
    :style="{ 'padding-left': `${depth * 6 + 10}px`, opacity: file.isMarkdown ? 1 : 0.75 }"
    :class="[{ current: currentFile?.pathname === file.pathname }]"
    @click="handleFileClick"
  >
    <file-icon :name="file.name" />
    <input
      v-if="renameCache === file.pathname"
      ref="renameInput"
      v-model="newName"
      type="text"
      class="rename"
      @click.stop="noop"
      @keypress.enter="rename"
    />
    <span v-else class="file-name">{{ displayName }}</span>
    <button
      class="file-action-button"
      type="button"
      :title="t('sideBar.tree.nodeActions')"
      @click.stop="showFileActionMenu"
    >
      <el-icon :size="14">
        <MoreFilled />
      </el-icon>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useProjectStore } from '@/store/project'
import { useEditorStore } from '@/store/editor'
import { MoreFilled } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import FileIcon from './icon.vue'
import { showContextMenu } from '../../contextMenu/sideBar'
import bus from '../../bus'
import { getNoteDisplayName } from '../../util/noteWorkspace'
import type { TreeFileNode } from './types'

const props = defineProps<{
  file: TreeFileNode
  depth: number
}>()

const { t } = useI18n()
const projectStore = useProjectStore()
const editorStore = useEditorStore()

const newName = ref('')
const fileEl = ref<HTMLDivElement | null>(null)
const renameInput = ref<HTMLInputElement | null>(null)

const { renameCache } = storeToRefs(projectStore)
const { clipboard } = storeToRefs(projectStore)
const { currentFile, tabs } = storeToRefs(editorStore)
const rootPath = computed<string | null>(() => projectStore.projectTree?.pathname ?? null)
const displayName = computed<string>(() => getNoteDisplayName(props.file, rootPath.value))

// from fileMixins
const handleFileClick = (): void => {
  const { isMarkdown, pathname } = props.file
  if (!isMarkdown) return
  projectStore.SELECT_NOTE_PATH(window.path.dirname(pathname))
  projectStore.CHANGE_ACTIVE_ITEM(props.file)
  const openedTab = tabs.value.find((f) => window.fileUtils.isSamePathSync(f.pathname, pathname))
  if (openedTab) {
    if (currentFile.value?.pathname === openedTab.pathname) {
      return
    }
    editorStore.UPDATE_CURRENT_FILE(openedTab)
  } else {
    window.electron.ipcRenderer.send('mt::open-file', pathname, {})
  }
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

const showFileActionMenu = (event: MouseEvent): void => {
  projectStore.CHANGE_CONTEXT_MENU_ITEM(props.file)
  const target = event.currentTarget as HTMLElement | null
  const rect = target?.getBoundingClientRect()
  showContextMenu(
    {
      clientX: rect ? rect.left + rect.width / 2 : event.clientX,
      clientY: rect ? rect.bottom : event.clientY
    },
    props.file,
    rootPath.value,
    !!clipboard.value
  )
}

onMounted(() => {
  if (fileEl.value) {
    fileEl.value.addEventListener('contextmenu', (event) => {
      event.preventDefault()
      projectStore.CHANGE_CONTEXT_MENU_ITEM(props.file)
      showContextMenu(event, props.file, rootPath.value, !!clipboard.value)
    })
  }

  bus.on('SIDEBAR::show-rename-input', focusRenameInput)
})
</script>

<style scoped>
.side-bar-file {
  display: flex;
  position: relative;
  align-items: center;
  cursor: default;
  user-select: none;
  height: 30px;
  box-sizing: border-box;
  padding-right: 15px;
  gap: 6px;
  &:hover {
    background: var(--sideBarItemHoverBgColor);
  }
  & > .file-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &::before {
    content: '';
    position: absolute;
    display: block;
    left: 0;
    background: var(--themeColor);
    width: 2px;
    height: 0;
    top: 50%;
    transform: translateY(-50%);
    transition: all 0.2s ease;
  }
}
.side-bar-file.current::before {
  height: 100%;
}
.side-bar-file.current > .file-name {
  color: var(--themeColor);
}
.side-bar-file > input.rename {
  flex: 1;
  min-width: 0;
}

.file-action-button {
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

.file-action-button:hover {
  background: var(--sideBarItemHoverBgColor);
  color: var(--sideBarTitleColor);
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
