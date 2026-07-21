<template>
  <div class="github-desktop-shell">
    <div class="github-desktop-rail">
      <button
        class="github-desktop-action-button github-desktop-workspace-button"
        type="button"
        title="设为笔记工作区"
        :disabled="!currentRepositoryPath"
        @click="setRepositoryAsWorkspace"
      >
        <el-icon :size="18">
          <FolderChecked />
        </el-icon>
      </button>
      <button
        class="github-desktop-action-button github-desktop-note-button"
        type="button"
        title="笔记"
        @click="switchToNote"
      >
        <el-icon :size="18">
          <Notebook />
        </el-icon>
      </button>
    </div>
    <div
      ref="surfaceRef"
      class="github-desktop-surface"
    />
    <el-dialog
      v-model="workspaceDialogVisible"
      title="设置笔记工作区"
      width="560px"
      append-to-body
      :close-on-click-modal="false"
      :before-close="cancelWorkspaceDialog"
    >
      <div class="github-desktop-workspace-dialog">
        <p>这将会切换笔记目录。默认使用当前 Git 项目根目录。</p>
        <div class="github-desktop-workspace-path">
          {{ workspaceTargetPath }}
        </div>
      </div>
      <template #footer>
        <el-button @click="cancelWorkspaceDialog()">
          取消
        </el-button>
        <el-button @click="selectWorkspaceSubdirectory">
          选择子目录
        </el-button>
        <el-button type="primary" @click="confirmWorkspaceDialog">
          确认
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { FolderChecked, Notebook } from '@element-plus/icons-vue'
import { usePreferencesStore } from '@/store/preferences'

const surfaceRef = ref<HTMLDivElement | null>(null)
const currentRepositoryPath = ref<string | null>(null)
const workspaceDialogVisible = ref(false)
const workspaceTargetPath = ref('')
const preferencesStore = usePreferencesStore()

const getBounds = () => {
  const rect = surfaceRef.value?.getBoundingClientRect()
  if (!rect) return null
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height
  }
}

const syncBounds = (): void => {
  const bounds = getBounds()
  if (!bounds) return
  window.electron.ipcRenderer.send('mt::github-desktop::set-bounds', bounds)
}

const showGitHubDesktop = async(): Promise<void> => {
  await nextTick()
  const bounds = getBounds()
  if (!bounds) return
  await window.electron.ipcRenderer.invoke('mt::github-desktop::show', bounds)
}

const switchToNote = (): void => {
  window.dispatchEvent(new CustomEvent('marknotepro:switch-workbench', { detail: 'note' }))
}

const setRepositoryAsWorkspace = async(): Promise<void> => {
  const repositoryPath = currentRepositoryPath.value
  if (!repositoryPath) {
    ElMessage.warning('请先选择一个 Git 仓库。')
    return
  }

  workspaceTargetPath.value = window.path.normalize(repositoryPath)
  workspaceDialogVisible.value = true
  window.electron.ipcRenderer.send('mt::github-desktop::hide')
}

const cancelWorkspaceDialog = async(done?: () => void): Promise<void> => {
  workspaceDialogVisible.value = false
  done?.()
  await showGitHubDesktop()
}

const selectWorkspaceSubdirectory = async(): Promise<void> => {
  const repositoryPath = currentRepositoryPath.value
  if (!repositoryPath) return

  const selectedPath = await window.electron.ipcRenderer.invoke(
    'mt::github-desktop::select-workspace-directory',
    workspaceTargetPath.value || repositoryPath
  )
  if (!selectedPath) return

  const normalizedRepositoryPath = window.path.normalize(repositoryPath)
  const normalizedSelectedPath = window.path.normalize(selectedPath)
  if (!window.fileUtils.isChildOfDirectory(normalizedRepositoryPath, normalizedSelectedPath)) {
    ElMessage.warning('请选择当前 Git 项目下的子目录。')
    return
  }

  workspaceTargetPath.value = normalizedSelectedPath
}

const confirmWorkspaceDialog = async(): Promise<void> => {
  const repositoryPath = currentRepositoryPath.value
  const workspacePath = workspaceTargetPath.value
  if (!repositoryPath || !workspacePath) return

  const normalizedRepositoryPath = window.path.normalize(repositoryPath)
  const normalizedWorkspacePath = window.path.normalize(workspacePath)
  const isRepositoryRoot = window.fileUtils.isSamePathSync(normalizedRepositoryPath, normalizedWorkspacePath)
  if (!isRepositoryRoot && !window.fileUtils.isChildOfDirectory(normalizedRepositoryPath, normalizedWorkspacePath)) {
    ElMessage.warning('笔记工作区必须是当前 Git 项目根目录或其子目录。')
    return
  }

  workspaceDialogVisible.value = false
  await window.fileUtils.ensureDir(normalizedWorkspacePath)
  preferencesStore.SET_SINGLE_PREFERENCE({
    type: 'defaultDirectoryToOpen',
    value: normalizedWorkspacePath
  })
  window.electron.ipcRenderer.send('mt::reload-workspace', normalizedWorkspacePath)
  window.dispatchEvent(new CustomEvent('marknotepro:switch-workbench', { detail: 'note' }))
  ElMessage.success('已切换笔记工作区。')
}

const syncSelectedRepositoryPath = async(): Promise<void> => {
  currentRepositoryPath.value = await window.electron.ipcRenderer.invoke(
    'mt::github-desktop::get-selected-repository-path'
  )
}

onMounted(() => {
  showGitHubDesktop()
  window.electron.ipcRenderer.on('mt::github-desktop::selected-repository-path', (_event, repositoryPath) => {
    currentRepositoryPath.value = repositoryPath
  })
  syncSelectedRepositoryPath()
  window.addEventListener('resize', syncBounds)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncBounds)
  window.electron.ipcRenderer.removeAllListeners('mt::github-desktop::selected-repository-path')
  window.electron.ipcRenderer.send('mt::github-desktop::hide')
})
</script>

<style scoped>
.github-desktop-shell {
  position: fixed;
  inset: 0;
  display: flex;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: #1f242b;
}

.github-desktop-rail {
  position: relative;
  z-index: 1;
  width: 45px;
  height: 100vh;
  flex: 0 0 45px;
  background: var(--sideBarBgColor);
  border-right: 1px solid var(--itemBgColor);
  -webkit-app-region: drag;
}

.github-desktop-action-button {
  position: absolute;
  left: 5px;
  width: 35px;
  height: 35px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 6px;
  color: var(--iconColor);
  background: transparent;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.github-desktop-workspace-button {
  bottom: 54px;
}

.github-desktop-note-button {
  bottom: 12px;
}

.github-desktop-action-button:hover {
  color: var(--themeColor);
  background: var(--itemBgColor);
}

.github-desktop-action-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.github-desktop-surface {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  height: 100vh;
}

.github-desktop-workspace-dialog {
  color: var(--editorColor);
  line-height: 1.7;
}

.github-desktop-workspace-dialog p {
  margin: 0 0 12px;
}

.github-desktop-workspace-path {
  padding: 10px 12px;
  border-radius: 6px;
  color: var(--editorColor);
  background: var(--itemBgColor);
  font-family: var(--monospace);
  line-height: 1.5;
  overflow-wrap: anywhere;
  user-select: text;
}
</style>
