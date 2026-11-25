<template>
  <el-dialog
    v-model="visible"
    :title="t('workspaceMigration.switchGitTitle')"
    width="580px"
    custom-class="workspace-migration-dialog"
    destroy-on-close
    @closed="handleDialogClosed"
  >
    <div class="switch-git-body" v-loading="loading">
      <div class="top-action-row">
        <div class="desc-text">
          {{ t('workspaceMigration.switchGitDesc') }}
        </div>
        <el-button type="default" plain size="small" @click="browseSystemFolder">
          {{ t('workspaceMigration.chooseSystemFolderBtn') }}
        </el-button>
      </div>

      <div v-if="!loading && workspaces.length === 0" class="empty-repos-box">
        <div class="empty-icon">📦</div>
        <div class="empty-title">{{ t('workspaceMigration.noGitReposTitle') }}</div>
        <div class="empty-desc">{{ t('workspaceMigration.noGitReposDesc') }}</div>
        <div class="empty-actions">
          <el-button type="primary" plain @click="browseSystemFolder">
            {{ t('workspaceMigration.chooseSystemFolderBtn') }}
          </el-button>
          <el-button type="default" plain @click="openGitWorkbench">
            {{ t('workspaceMigration.goToGitWorkbench') }}
          </el-button>
        </div>
      </div>

      <div v-else ref="repoListRef" class="repo-list" tabindex="-1">
        <template v-if="currentWorkspaceItem">
          <div class="group-title">{{ t('workspaceMigration.currentWorkspaceSection') }}</div>
          <div
            :key="`cur-${currentWorkspaceItem.path}`"
            :data-workspace-path="currentWorkspaceItem.path"
            class="repo-item current"
            :class="{ selected: isSamePath(selectedRepoPath, currentWorkspaceItem.path) }"
            @click="selectedRepoPath = currentWorkspaceItem.path"
          >
            <div class="repo-main">
              <div class="repo-name-row">
                <span class="repo-name">{{ currentWorkspaceItem.name }}</span>
                <span class="current-badge">{{ t('workspaceMigration.currentBadge') }}</span>
                <span class="kind-badge" :class="currentWorkspaceItem.isGit ? 'git' : 'local'">
                  {{ currentWorkspaceItem.isGit ? t('workspaceMigration.gitBadge') : t('workspaceMigration.localBadge') }}
                </span>
                <span v-if="!currentWorkspaceItem.exists" class="missing-badge">
                  {{ t('workspaceMigration.missingBadge') }}
                </span>
              </div>
              <div class="repo-path" :title="currentWorkspaceItem.path">{{ currentWorkspaceItem.path }}</div>
            </div>
            <div class="repo-radio">
              <span class="radio-dot" :class="{ active: isSamePath(selectedRepoPath, currentWorkspaceItem.path) }" />
            </div>
          </div>
        </template>

        <template v-if="gitWorkspaces.length > 0">
          <div class="group-title">{{ t('workspaceMigration.gitWorkspacesSection') }} ({{ gitWorkspaces.length }})</div>
          <div
            v-for="repo in gitWorkspaces"
            :key="`git-${repo.path}`"
            :data-workspace-path="repo.path"
            class="repo-item"
            :class="{ selected: isSamePath(selectedRepoPath, repo.path), missing: !repo.exists }"
            @click="selectedRepoPath = repo.path"
            @dblclick="confirmSwitch"
          >
            <div class="repo-main">
              <div class="repo-name-row">
                <span class="repo-name">{{ repo.name }}</span>
                <span class="kind-badge git">{{ t('workspaceMigration.gitBadge') }}</span>
                <span v-if="!repo.exists" class="missing-badge">
                  {{ t('workspaceMigration.missingBadge') }}
                </span>
              </div>
              <div class="repo-path" :title="repo.path">{{ repo.path }}</div>
            </div>
            <div class="repo-radio">
              <span class="radio-dot" :class="{ active: isSamePath(selectedRepoPath, repo.path) }" />
            </div>
          </div>
        </template>

        <template v-if="historyWorkspaces.length > 0">
          <div class="group-title">{{ t('workspaceMigration.historyWorkspacesSection') }} ({{ historyWorkspaces.length }})</div>
          <div
            v-for="item in historyWorkspaces"
            :key="`hist-${item.path}`"
            :data-workspace-path="item.path"
            class="repo-item"
            :class="{ selected: isSamePath(selectedRepoPath, item.path), missing: !item.exists }"
            @click="selectedRepoPath = item.path"
            @dblclick="confirmSwitch"
          >
            <div class="repo-main">
              <div class="repo-name-row">
                <span class="repo-name">{{ item.name }}</span>
                <span class="kind-badge local">{{ t('workspaceMigration.localBadge') }}</span>
                <span v-if="!item.exists" class="missing-badge">
                  {{ t('workspaceMigration.missingBadge') }}
                </span>
              </div>
              <div class="repo-path" :title="item.path">{{ item.path }}</div>
            </div>
            <div class="repo-actions">
              <el-tooltip
                :content="t('workspaceMigration.removeHistoryTooltip')"
                placement="top"
                :show-after="150"
              >
                <button
                  type="button"
                  class="remove-history-btn"
                  :aria-label="t('workspaceMigration.removeHistoryTooltip')"
                  @click.stop="removeHistoryWorkspace(item)"
                >
                  <el-icon :size="14"><Delete /></el-icon>
                </button>
              </el-tooltip>
              <div class="repo-radio">
                <span class="radio-dot" :class="{ active: isSamePath(selectedRepoPath, item.path) }" />
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="visible = false">{{ t('workspaceMigration.cancel') }}</el-button>
        <el-button
          type="primary"
          :disabled="!selectedRepoPath || switching || isSamePath(selectedRepoPath, currentWorkspacePath)"
          :loading="switching"
          @click="confirmSwitch"
        >
          {{ t('workspaceMigration.confirm') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { Delete } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { usePreferencesStore } from '@/store/preferences'
import { useProjectStore } from '@/store/project'
import { useHostOverlayStore } from '@/store/overlay'
import bus from '@/bus'
import type { WorkspaceSwitchEntry } from '@shared/types/workspaceMigration'

const { t } = useI18n()
const preferencesStore = usePreferencesStore()
const projectStore = useProjectStore()
const hostOverlayStore = useHostOverlayStore()

const visible = ref(false)
const loading = ref(false)
const switching = ref(false)
const workspaces = ref<WorkspaceSwitchEntry[]>([])
const selectedRepoPath = ref('')
const repoListRef = ref<HTMLDivElement | null>(null)

const currentWorkspacePath = computed(() => {
  return preferencesStore.defaultDirectoryToOpen || projectStore.projectTree?.pathname || ''
})

const normalizeComparePath = (p: string): string => {
  if (!p) return ''
  return window.path.normalize(p).replace(/[/\\]+$/, '').toLowerCase()
}

const isSamePath = (a: string, b: string): boolean => {
  if (!a || !b) return false
  return normalizeComparePath(a) === normalizeComparePath(b)
}

const currentWorkspaceItem = computed(() => {
  if (!currentWorkspacePath.value) return null
  return workspaces.value.find((w) => isSamePath(w.path, currentWorkspacePath.value)) || null
})

const gitWorkspaces = computed(() => {
  return workspaces.value.filter(
    (w) => w.isGit && !isSamePath(w.path, currentWorkspacePath.value)
  )
})

const historyWorkspaces = computed(() => {
  return workspaces.value.filter(
    (w) => !w.isGit && !isSamePath(w.path, currentWorkspacePath.value)
  )
})

const orderedWorkspaces = computed(() => {
  return [
    ...(currentWorkspaceItem.value ? [currentWorkspaceItem.value] : []),
    ...gitWorkspaces.value,
    ...historyWorkspaces.value
  ]
})

const scrollSelectedIntoView = (): void => {
  void nextTick(() => {
    const container = repoListRef.value
    if (!container || !selectedRepoPath.value) return
    const items = container.querySelectorAll<HTMLElement>('.repo-item')
    for (const el of items) {
      if (isSamePath(el.dataset.workspacePath || '', selectedRepoPath.value)) {
        el.scrollIntoView({ block: 'nearest' })
        break
      }
    }
  })
}

const handleKeyDown = (event: KeyboardEvent): void => {
  if (!visible.value || loading.value || switching.value || event.isComposing) return
  const list = orderedWorkspaces.value
  if (list.length === 0) return

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    event.stopPropagation()
    const currentIndex = list.findIndex((item) => isSamePath(item.path, selectedRepoPath.value))
    const delta = event.key === 'ArrowDown' ? 1 : -1
    const nextIndex =
      currentIndex === -1
        ? delta > 0
          ? 0
          : list.length - 1
        : (currentIndex + delta + list.length) % list.length
    selectedRepoPath.value = list[nextIndex].path
    scrollSelectedIntoView()
    return
  }

  if (event.key === 'Enter') {
    const activeEl = document.activeElement as HTMLElement | null
    if (activeEl?.closest('.remove-history-btn')) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    if (selectedRepoPath.value && !isSamePath(selectedRepoPath.value, currentWorkspacePath.value)) {
      void confirmSwitch()
    }
  }
}

const showWorkbenchToast = (type: 'success' | 'info' | 'warning' | 'error', message: string): void => {
  if (document.querySelector('.github-desktop-shell')) {
    window.electron.ipcRenderer.send('mt::github-desktop::toast', { type, message })
  } else {
    ElMessage[type](message)
  }
}

const openModal = async (): Promise<void> => {
  hostOverlayStore.showOverlay('switch-git-workspace-modal')
  visible.value = true
  loading.value = true
  selectedRepoPath.value = ''
  try {
    const list: WorkspaceSwitchEntry[] = await window.electron.ipcRenderer.invoke(
      'mt::workspace-migration:get-all-workspaces',
      currentWorkspacePath.value
    )
    const rawList = list || []
    const currentItem = rawList.find((r) => isSamePath(r.path, currentWorkspacePath.value))
    workspaces.value = currentItem
      ? [currentItem, ...rawList.filter((r) => !isSamePath(r.path, currentWorkspacePath.value))]
      : rawList
    selectedRepoPath.value = currentItem ? currentItem.path : ''
  } catch (err: any) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
    void nextTick(() => {
      repoListRef.value?.focus()
    })
  }
}

const browseSystemFolder = async (): Promise<void> => {
  const selected = await window.electron.ipcRenderer.invoke(
    'mt::workspace-migration:select-folder'
  )
  if (!selected) return

  const normalized = window.path.normalize(selected)
  const existing = workspaces.value.find((w) => isSamePath(w.path, normalized))
  if (!existing) {
    let hasGit = false
    try {
      const info = await window.electron.ipcRenderer.invoke(
        'mt::workspace-migration:inspect',
        normalized
      )
      hasGit = !!info?.hasGit
    } catch {
      // ignore
    }
    const baseName = window.path.basename(normalized) || normalized
    workspaces.value = [
      ...workspaces.value,
      {
        name: baseName,
        path: normalized,
        isGit: hasGit,
        isManagedGitRepo: false,
        exists: true
      }
    ]
  }
  selectedRepoPath.value = normalized
}

const removeHistoryWorkspace = async (item: WorkspaceSwitchEntry): Promise<void> => {
  try {
    await window.electron.ipcRenderer.invoke('mt::workspace-migration:remove-recent', item.path)
    workspaces.value = workspaces.value.filter((w) => !isSamePath(w.path, item.path))
    if (isSamePath(selectedRepoPath.value, item.path)) {
      selectedRepoPath.value = currentWorkspaceItem.value?.path || ''
    }
    showWorkbenchToast('info', t('workspaceMigration.removedFromHistorySuccess'))
  } catch (err: any) {
    showWorkbenchToast('error', err?.message || String(err))
  }
}

const openGitWorkbench = (): void => {
  visible.value = false
  window.dispatchEvent(new CustomEvent('marknotepro:switch-workbench', { detail: 'git' }))
  window.dispatchEvent(new CustomEvent('marktextpro:switch-workbench', { detail: 'git' }))
}

const confirmSwitch = async (): Promise<void> => {
  if (!selectedRepoPath.value || isSamePath(selectedRepoPath.value, currentWorkspacePath.value)) {
    return
  }

  const targetEntry = workspaces.value.find((r) => isSamePath(r.path, selectedRepoPath.value))
  const targetPath = window.path.normalize(selectedRepoPath.value)
  const previousWorkspacePath = currentWorkspacePath.value

  switching.value = true
  try {
    if (previousWorkspacePath && !isSamePath(previousWorkspacePath, targetPath)) {
      const normPrev = window.path.normalize(previousWorkspacePath)
      const [prevInfo, targetInfo] = await Promise.all([
        window.electron.ipcRenderer.invoke('mt::workspace-migration:inspect', normPrev),
        window.electron.ipcRenderer.invoke('mt::workspace-migration:inspect', targetPath)
      ])
      if (prevInfo?.exists && !prevInfo.hasGit && prevInfo.fileCount > 0 && targetInfo?.hasGit) {
        bus.emit('WORKSPACE::open-migration-prompt', {
          sourceDir: normPrev,
          targetDir: targetPath,
          fromGitDesktopSilent: false,
          pendingSwitch: {
            showMessage: true,
            syncGitDesktopRepo: !!(targetEntry?.isManagedGitRepo || targetInfo?.hasGit),
            switchedRepoName: targetEntry?.name || targetPath
          }
        })
        visible.value = false
        return
      }
    }

    await window.fileUtils.ensureDir(targetPath)
    await window.electron.ipcRenderer.invoke('mt::workspace-migration:record-recent', targetPath)

    if (targetEntry?.exists && (targetEntry?.isManagedGitRepo || targetEntry?.isGit)) {
      window.electron.ipcRenderer.send('mt::github-desktop::select-repository-by-path', targetPath)
    }

    preferencesStore.SET_SINGLE_PREFERENCE({
      type: 'defaultDirectoryToOpen',
      value: targetPath
    })
    window.electron.ipcRenderer.send('mt::reload-workspace', targetPath)
    visible.value = false
    showWorkbenchToast(
      'success',
      t('workspaceMigration.switchedToRepoSuccess', { name: targetEntry?.name || targetPath })
    )
  } catch (err: any) {
    ElMessage.error(err.message)
  } finally {
    switching.value = false
  }
}

const handleDialogClosed = (): void => {
  hostOverlayStore.hideOverlay('switch-git-workspace-modal')
}

onMounted(() => {
  bus.on('WORKSPACE::open-switch-git-modal', openModal)
  window.addEventListener('keydown', handleKeyDown, true)
})

onBeforeUnmount(() => {
  hostOverlayStore.hideOverlay('switch-git-workspace-modal')
  bus.off('WORKSPACE::open-switch-git-modal', openModal)
  window.removeEventListener('keydown', handleKeyDown, true)
})
</script>

<style scoped>
.switch-git-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.top-action-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.desc-text {
  font-size: 13px;
  line-height: 1.5;
  color: var(--sideBarTextColor, var(--el-text-color-secondary));
  flex: 1;
}

.empty-repos-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 28px 16px;
  gap: 10px;
  border-radius: 8px;
  border: 1px dashed var(--floatBorderColor, var(--el-border-color));
  background: var(--sideBarItemHoverBgColor, var(--el-fill-color-light));
}

.empty-icon {
  font-size: 32px;
}

.empty-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--sideBarTitleColor, var(--el-text-color-primary));
}

.empty-desc {
  font-size: 12px;
  color: var(--sideBarTextColor, var(--el-text-color-secondary));
  max-width: 380px;
}

.empty-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}

.repo-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 360px;
  overflow-y: auto;
  padding-right: 2px;
  outline: none;
}

.group-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--sideBarTextColor, var(--el-text-color-secondary));
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin-top: 4px;
  padding-left: 2px;
}

.group-title:first-child {
  margin-top: 0;
}

.repo-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid var(--floatBorderColor, var(--el-border-color));
  background: var(--sideBarItemHoverBgColor, var(--el-fill-color-light));
  cursor: pointer;
  transition: all 0.15s ease;
}

.repo-item:hover {
  border-color: var(--themeColor, var(--el-color-primary));
}

.repo-item.selected {
  border-color: var(--themeColor, var(--el-color-primary));
  background: var(--themeColor10, var(--el-color-primary-light-9));
}

.repo-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.repo-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.repo-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--sideBarTitleColor, var(--el-text-color-primary));
}

.current-badge {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 4px;
  background: var(--themeColor20, var(--el-color-primary-light-8));
  color: var(--themeColor, var(--el-color-primary));
  font-weight: 500;
}

.kind-badge {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 4px;
  font-weight: 500;
}

.kind-badge.git {
  background: rgba(103, 194, 58, 0.14);
  color: #529b2e;
}

:global(body.dark) .kind-badge.git {
  color: #85ce61;
}

.kind-badge.local {
  background: var(--sideBarItemHoverBgColor, rgba(144, 147, 153, 0.16));
  color: var(--sideBarTextColor, var(--el-text-color-secondary));
}

.missing-badge {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 4px;
  font-weight: 500;
  background: rgba(245, 108, 108, 0.14);
  color: #d9534f;
}

:global(body.dark) .missing-badge {
  color: #f78989;
}

.repo-path {
  font-size: 12px;
  color: var(--sideBarTextColor, var(--el-text-color-secondary));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.repo-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.remove-history-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--sideBarTextColor, var(--el-text-color-secondary));
  cursor: pointer;
  transition: all 0.15s ease;
}

.remove-history-btn:hover {
  color: #f56c6c;
  background: rgba(245, 108, 108, 0.12);
  border-color: rgba(245, 108, 108, 0.35);
}

.repo-radio {
  flex-shrink: 0;
}

.radio-dot {
  display: inline-block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--sideBarTextColor, var(--el-border-color));
  position: relative;
}

.radio-dot.active {
  border-color: var(--themeColor, var(--el-color-primary));
}

.radio-dot.active::after {
  content: '';
  position: absolute;
  inset: 3px;
  border-radius: 50%;
  background: var(--themeColor, var(--el-color-primary));
}
</style>
