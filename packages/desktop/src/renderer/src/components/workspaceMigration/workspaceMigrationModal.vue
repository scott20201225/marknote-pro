<template>
  <el-dialog
    v-model="visible"
    :title="dialogTitle"
    width="560px"
    custom-class="workspace-migration-dialog"
    :close-on-click-modal="!migrating"
    :close-on-press-escape="!migrating"
    :show-close="!migrating"
    destroy-on-close
    @closed="handleDialogClosed"
  >
    <div class="migration-body">
      <!-- 自动迁移提醒横幅 -->
      <div v-if="isAutoPrompt" class="notice-banner">
        <span class="notice-icon">ℹ️</span>
        <span class="notice-text">{{ t('workspaceMigration.noGitPromptDesc') }}</span>
      </div>

      <!-- 源工作区选择区 -->
      <div class="section-box">
        <label class="section-label">{{ t('workspaceMigration.sourceWorkspaceLabel') }}</label>
        <div v-if="isAutoPrompt" class="path-display" :title="sourceDir">{{ sourceDir }}</div>
        <div v-else class="source-picker-row">
          <div
            class="path-display source-path-box"
            :class="{ placeholder: !sourceDir }"
            :title="sourceDir || t('workspaceMigration.selectSourcePlaceholder')"
            @click="browseSourceFolder"
          >
            {{ sourceDir || t('workspaceMigration.selectSourcePlaceholder') }}
          </div>
          <el-button type="default" plain @click="browseSourceFolder">
            {{ t('workspaceMigration.browseBtn') }}
          </el-button>
        </div>
      </div>

      <!-- 目标工作区展示区 -->
      <div class="section-box">
        <label class="section-label">{{ t('workspaceMigration.targetWorkspaceLabel') }}</label>
        <div class="path-display" :title="targetDir">
          {{ targetDir || t('workspaceMigration.noActiveWorkspace') }}
        </div>
      </div>

      <!-- 预扫描统计与冲突详情 -->
      <div v-if="sourceDir && targetDir" class="preview-card" v-loading="scanning">
        <div v-if="preview?.sameOrNestedError" class="error-banner">
          {{ t('workspaceMigration.sameOrNestedWarning') }}
        </div>
        <template v-else-if="preview">
          <div class="preview-stats">
            <div class="stat-item">
              <span class="stat-label">{{ t('workspaceMigration.pendingFilesCount') }}</span>
              <span class="stat-val">{{ preview.totalFiles }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">{{ t('workspaceMigration.conflictFilesCount') }}</span>
              <span class="stat-val" :class="{ 'has-conflicts': preview.conflictFiles.length > 0 }">
                {{ preview.conflictFiles.length }}
              </span>
            </div>
          </div>

          <div v-if="preview.conflictFiles.length > 0" class="conflict-preview-list">
            <div class="conflict-list-title">{{ t('workspaceMigration.conflictSampleTitle') }}</div>
            <div class="conflict-items">
              <div
                v-for="(rel, idx) in preview.conflictFiles.slice(0, 6)"
                :key="idx"
                class="conflict-item"
                :title="rel"
              >
                • {{ rel }}
              </div>
              <div v-if="preview.conflictFiles.length > 6" class="conflict-more">
                {{ t('workspaceMigration.conflictMoreCount', { count: preview.conflictFiles.length }) }}
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- 冲突文件解决策略（切换提示：不迁移[默认] / 跳过 / 自动重命名 / 覆盖；手动合并：跳过[默认] / 自动重命名 / 覆盖） -->
      <div class="section-box">
        <label class="section-label">{{ t('workspaceMigration.conflictStrategyLabel') }}</label>
        <div class="strategy-options">
          <div
            v-if="isAutoPrompt"
            class="strategy-card"
            :class="{ active: conflictStrategy === 'none' }"
            @click="conflictStrategy = 'none'"
          >
            <div class="strategy-header">
              <span class="radio-dot" :class="{ active: conflictStrategy === 'none' }" />
              <span class="strategy-title">{{ t('workspaceMigration.strategyNoneTitle') }}</span>
              <span class="recommended-tag">{{ t('workspaceMigration.defaultTag') }}</span>
            </div>
            <div class="strategy-desc">{{ t('workspaceMigration.strategyNoneDesc') }}</div>
          </div>

          <div
            class="strategy-card"
            :class="{ active: conflictStrategy === 'skip' }"
            @click="conflictStrategy = 'skip'"
          >
            <div class="strategy-header">
              <span class="radio-dot" :class="{ active: conflictStrategy === 'skip' }" />
              <span class="strategy-title">{{ t('workspaceMigration.strategySkipTitle') }}</span>
              <span v-if="!isAutoPrompt" class="recommended-tag">{{ t('workspaceMigration.defaultTag') }}</span>
            </div>
            <div class="strategy-desc">{{ t('workspaceMigration.strategySkipDesc') }}</div>
          </div>

          <div
            class="strategy-card"
            :class="{ active: conflictStrategy === 'rename' }"
            @click="conflictStrategy = 'rename'"
          >
            <div class="strategy-header">
              <span class="radio-dot" :class="{ active: conflictStrategy === 'rename' }" />
              <span class="strategy-title">{{ t('workspaceMigration.strategyRenameTitle') }}</span>
            </div>
            <div class="strategy-desc">{{ t('workspaceMigration.strategyRenameDesc') }}</div>
          </div>

          <div
            class="strategy-card"
            :class="{ active: conflictStrategy === 'overwrite' }"
            @click="conflictStrategy = 'overwrite'"
          >
            <div class="strategy-header">
              <span class="radio-dot" :class="{ active: conflictStrategy === 'overwrite' }" />
              <span class="strategy-title">{{ t('workspaceMigration.strategyOverwriteTitle') }}</span>
            </div>
            <div class="strategy-desc">{{ t('workspaceMigration.strategyOverwriteDesc') }}</div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button :disabled="migrating" @click="handleCancel">{{ t('workspaceMigration.cancel') }}</el-button>
        <el-button
          type="primary"
          :disabled="!canConfirm || migrating"
          :loading="migrating"
          @click="handleConfirm"
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
import { useI18n } from 'vue-i18n'
import { usePreferencesStore } from '@/store/preferences'
import { useProjectStore } from '@/store/project'
import { useHostOverlayStore } from '@/store/overlay'
import bus from '@/bus'
import type {
  ConflictResolutionStrategy,
  WorkspaceMigrationPreview,
  WorkspaceMigrationResult
} from '@shared/types/workspaceMigration'

const { t } = useI18n()
const preferencesStore = usePreferencesStore()
const projectStore = useProjectStore()
const hostOverlayStore = useHostOverlayStore()

interface PendingWorkspaceSwitch {
  targetWorkbench?: 'note' | 'editor'
  showMessage?: boolean
  syncGitDesktopRepo?: boolean
  switchedRepoName?: string
}

const visible = ref(false)
const isAutoPrompt = ref(false)
const hideGitDesktopOverlay = ref(false)
const pendingSwitch = ref<PendingWorkspaceSwitch | null>(null)
const didConfirmSwitch = ref(false)
const sourceDir = ref('')
const targetDir = ref('')
const recentSources = ref<string[]>([])
const conflictStrategy = ref<ConflictResolutionStrategy>('none')
const wrapScatteredInArea = ref(true)
const scanning = ref(false)
const migrating = ref(false)
const preview = ref<WorkspaceMigrationPreview | null>(null)

const isMarkNote = computed(() => {
  const p = (window as any).process
  if (p?.appName) return p.appName === 'marknotepro'
  const cwd = p?.cwd?.() || ''
  const resources = p?.resourcesPath || ''
  const title = (typeof document !== 'undefined' ? document.title : '') || ''
  if (/marknote/i.test(cwd) || /marknote/i.test(resources) || /marknote/i.test(title)) return true
  if (/marktext/i.test(cwd) || /marktext/i.test(resources) || /marktext/i.test(title)) return false
  const folders = projectStore.projectTree?.folders || []
  return folders.some((f: any) => f.name?.startsWith('GROUP_') || f.name?.startsWith('AREA_'))
})

const dialogTitle = computed(() => {
  return isAutoPrompt.value
    ? t('workspaceMigration.autoPromptTitle')
    : t('workspaceMigration.manualMergeTitle')
})

const canConfirm = computed(() => {
  if (conflictStrategy.value === 'none') return true
  if (!sourceDir.value || !targetDir.value) return false
  if (preview.value?.sameOrNestedError) return false
  if (preview.value && preview.value.totalFiles === 0) return false
  return !scanning.value
})

const normalizeComparePath = (p: string): string => {
  if (!p) return ''
  return window.path.normalize(p).replace(/[/\\]+$/, '').toLowerCase()
}

const runPreview = async (): Promise<void> => {
  if (!sourceDir.value || !targetDir.value) {
    preview.value = null
    return
  }
  scanning.value = true
  try {
    preview.value = await window.electron.ipcRenderer.invoke(
      'mt::workspace-migration:preview',
      sourceDir.value,
      targetDir.value,
      wrapScatteredInArea.value
    )
  } catch (err: any) {
    ElMessage.error(err.message)
  } finally {
    scanning.value = false
  }
}

const browseSourceFolder = async (): Promise<void> => {
  const selected = await window.electron.ipcRenderer.invoke(
    'mt::workspace-migration:select-folder'
  )
  if (selected) {
    sourceDir.value = selected
    await runPreview()
  }
}

const applyPendingWorkspaceSwitch = async (switchSpec: PendingWorkspaceSwitch): Promise<void> => {
  const targetPath = window.path.normalize(targetDir.value)
  await window.fileUtils.ensureDir(targetPath)
  if (switchSpec.syncGitDesktopRepo) {
    window.electron.ipcRenderer.send('mt::github-desktop::select-repository-by-path', targetPath)
  }
  preferencesStore.SET_SINGLE_PREFERENCE({
    type: 'defaultDirectoryToOpen',
    value: targetPath
  })
  window.electron.ipcRenderer.send('mt::reload-workspace', targetPath)
  if (switchSpec.targetWorkbench) {
    window.dispatchEvent(new CustomEvent('marknotepro:switch-workbench', { detail: switchSpec.targetWorkbench }))
    window.dispatchEvent(new CustomEvent('marktextpro:switch-workbench', { detail: switchSpec.targetWorkbench }))
  }
}

const openAutoPrompt = async (payload: {
  sourceDir: string
  targetDir: string
  fromGitDesktopSilent?: boolean
  pendingSwitch?: PendingWorkspaceSwitch
}): Promise<void> => {
  isAutoPrompt.value = true
  didConfirmSwitch.value = false
  pendingSwitch.value = payload.pendingSwitch || null
  hideGitDesktopOverlay.value = !!payload.fromGitDesktopSilent
  hostOverlayStore.showOverlay('workspace-migration-modal')
  if (hideGitDesktopOverlay.value) {
    window.electron.ipcRenderer.send('mt::github-desktop::hide')
  }
  sourceDir.value = payload.sourceDir
  targetDir.value = payload.targetDir
  conflictStrategy.value = 'none'
  wrapScatteredInArea.value = true
  preview.value = null
  visible.value = true
  await runPreview()
}

const showWorkbenchToast = (type: 'success' | 'info' | 'warning' | 'error', message: string): void => {
  if (document.querySelector('.github-desktop-shell')) {
    window.electron.ipcRenderer.send('mt::github-desktop::toast', { type, message })
  } else {
    ElMessage[type](message)
  }
}

const openManualMerge = async (): Promise<void> => {
  const currentTarget =
    preferencesStore.defaultDirectoryToOpen || projectStore.projectTree?.pathname || ''
  if (!currentTarget) {
    showWorkbenchToast('warning', t('workspaceMigration.openTargetWorkspaceFirst'))
    return
  }
  isAutoPrompt.value = false
  didConfirmSwitch.value = false
  pendingSwitch.value = null
  hideGitDesktopOverlay.value = false
  hostOverlayStore.showOverlay('workspace-migration-modal')
  targetDir.value = currentTarget
  sourceDir.value = ''
  recentSources.value = []
  conflictStrategy.value = 'skip'
  wrapScatteredInArea.value = true
  preview.value = null
  visible.value = true
}

const handleCancel = (): void => {
  visible.value = false
}

const handleConfirm = async (): Promise<void> => {
  if (conflictStrategy.value === 'none') {
    if (isAutoPrompt.value && pendingSwitch.value) {
      const switchSpec = pendingSwitch.value
      didConfirmSwitch.value = true
      await applyPendingWorkspaceSwitch(switchSpec)
      await nextTick()
      visible.value = false
      if (switchSpec.showMessage !== false) {
        showWorkbenchToast(
          'success',
          switchSpec.switchedRepoName
            ? t('workspaceMigration.switchedToRepoSuccess', { name: switchSpec.switchedRepoName })
            : t('workspaceMigration.workspaceSwitched')
        )
      }
      return
    }
    visible.value = false
    showWorkbenchToast('info', t('workspaceMigration.migrationSkippedNoChanges'))
    return
  }

  if (!sourceDir.value || !targetDir.value) return

  migrating.value = true
  try {
    const result: WorkspaceMigrationResult = await window.electron.ipcRenderer.invoke(
      'mt::workspace-migration:execute',
      {
        sourceDir: sourceDir.value,
        targetDir: targetDir.value,
        conflictStrategy: conflictStrategy.value,
        wrapScatteredInArea: wrapScatteredInArea.value
      }
    )

    if (result.cancelled) {
      visible.value = false
      if (!isAutoPrompt.value || !pendingSwitch.value) {
        showWorkbenchToast('info', t('workspaceMigration.migrationSkippedNoChanges'))
      }
      return
    }

    didConfirmSwitch.value = true
    if (isAutoPrompt.value && pendingSwitch.value) {
      await applyPendingWorkspaceSwitch(pendingSwitch.value)
      await nextTick()
    } else {
      window.electron.ipcRenderer.send('mt::reload-workspace', targetDir.value)
    }
    visible.value = false
    showWorkbenchToast(
      'success',
      t('workspaceMigration.migrationSuccess', {
        copied: result.copiedCount,
        renamed: result.renamedCount ?? 0,
        overwritten: result.overwrittenCount,
        skipped: result.skippedCount
      })
    )
  } catch (err: any) {
    showWorkbenchToast('error', t('workspaceMigration.migrationFailed', { error: err.message }))
  } finally {
    migrating.value = false
  }
}

const handleDialogClosed = (): void => {
  if (isAutoPrompt.value && pendingSwitch.value && !didConfirmSwitch.value) {
    showWorkbenchToast('info', t('workspaceMigration.switchCancelledNoChanges'))
  }
  pendingSwitch.value = null
  didConfirmSwitch.value = false
  hostOverlayStore.hideOverlay('workspace-migration-modal')
  if (hideGitDesktopOverlay.value) {
    hideGitDesktopOverlay.value = false
    window.dispatchEvent(new CustomEvent('marknotepro:resume-native-editor'))
    window.dispatchEvent(new CustomEvent('marktextpro:resume-native-editor'))
  }
}

onMounted(() => {
  bus.on('WORKSPACE::open-migration-prompt', openAutoPrompt)
  bus.on('WORKSPACE::open-merge-modal', openManualMerge)
})

onBeforeUnmount(() => {
  hostOverlayStore.hideOverlay('workspace-migration-modal')
  bus.off('WORKSPACE::open-migration-prompt', openAutoPrompt)
  bus.off('WORKSPACE::open-merge-modal', openManualMerge)
})
</script>

<style scoped>
.migration-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.notice-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--themeColor30, var(--el-color-primary-light-5));
  background: var(--themeColor10, var(--el-color-primary-light-9));
}

.notice-icon {
  font-size: 16px;
  line-height: 1.4;
}

.notice-text {
  font-size: 13px;
  line-height: 1.5;
  font-weight: 500;
  color: var(--sideBarTitleColor, var(--el-text-color-primary));
}

.section-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.section-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--sideBarTitleColor, var(--el-text-color-primary));
}

.path-display {
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--floatBorderColor, var(--el-border-color));
  background: var(--sideBarItemHoverBgColor, var(--el-fill-color-light));
  color: var(--sideBarColor, var(--el-text-color-regular));
  font-size: 12.5px;
  word-break: break-all;
}

.source-picker-row {
  display: flex;
  gap: 8px;
}

.source-path-box {
  flex: 1;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-path-box.placeholder {
  color: var(--el-text-color-placeholder, #8d9095);
}

.source-select {
  flex: 1;
}

.preview-card {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--floatBorderColor, var(--el-border-color));
  background: var(--sideBarItemHoverBgColor, var(--el-fill-color-light));
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.error-banner {
  font-size: 13px;
  color: var(--el-color-danger, #f56c6c);
  font-weight: 500;
}

.preview-stats {
  display: flex;
  gap: 24px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.stat-label {
  color: var(--sideBarTextColor, var(--el-text-color-secondary));
}

.stat-val {
  font-weight: 600;
  color: var(--sideBarTitleColor, var(--el-text-color-primary));
}

.stat-val.has-conflicts {
  color: var(--el-color-warning, #e6a23c);
}

.conflict-preview-list {
  border-top: 1px solid var(--floatBorderColor, var(--el-border-color-lighter));
  padding-top: 8px;
}

.conflict-list-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--sideBarTextColor, var(--el-text-color-secondary));
  margin-bottom: 4px;
}

.conflict-items {
  max-height: 92px;
  overflow-y: auto;
  font-size: 12px;
  color: var(--sideBarColor, var(--el-text-color-regular));
}

.conflict-item {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.5;
}

.conflict-more {
  font-size: 11px;
  color: var(--sideBarTextColor, var(--el-text-color-secondary));
  margin-top: 2px;
}

.strategy-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.strategy-card {
  padding: 9px 12px;
  border-radius: 8px;
  border: 1px solid var(--floatBorderColor, var(--el-border-color));
  background: var(--sideBarItemHoverBgColor, var(--el-fill-color-light));
  cursor: pointer;
  transition: all 0.15s ease;
}

.strategy-card:hover {
  border-color: var(--themeColor, var(--el-color-primary));
}

.strategy-card.active {
  border-color: var(--themeColor, var(--el-color-primary));
  background: var(--themeColor10, var(--el-color-primary-light-9));
}

.strategy-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}

.radio-dot {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--sideBarTextColor, var(--el-border-color));
  position: relative;
  flex-shrink: 0;
}

.radio-dot.active {
  border-color: var(--themeColor, var(--el-color-primary));
}

.radio-dot.active::after {
  content: '';
  position: absolute;
  inset: 2px;
  border-radius: 50%;
  background: var(--themeColor, var(--el-color-primary));
}

.strategy-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--sideBarTitleColor, var(--el-text-color-primary));
}

.recommended-tag {
  font-size: 11px;
  padding: 0 6px;
  border-radius: 4px;
  background: var(--themeColor20, var(--el-color-primary-light-8));
  color: var(--themeColor, var(--el-color-primary));
}

.strategy-desc {
  font-size: 12px;
  color: var(--sideBarTextColor, var(--el-text-color-secondary));
  padding-left: 22px;
}
</style>

<style>
.workspace-migration-dialog {
  --el-dialog-bg-color: var(--floatBgColor, var(--el-bg-color-overlay)) !important;
  --el-bg-color: var(--floatBgColor, var(--el-bg-color-overlay)) !important;
  --el-bg-color-overlay: var(--floatBgColor, var(--el-bg-color-overlay)) !important;
  --el-text-color-primary: var(--sideBarTitleColor, var(--el-text-color-primary)) !important;
  --el-text-color-regular: var(--sideBarColor, var(--el-text-color-regular)) !important;
  --el-text-color-secondary: var(--sideBarTextColor, var(--el-text-color-secondary)) !important;
  --el-border-color: var(--floatBorderColor, var(--el-border-color)) !important;
  background: var(--floatBgColor, var(--el-bg-color-overlay)) !important;
  border: 1px solid var(--floatBorderColor, var(--el-border-color)) !important;
  color: var(--sideBarTitleColor, var(--el-text-color-primary)) !important;
  border-radius: 12px !important;
}

.workspace-migration-dialog .el-dialog__title {
  color: var(--sideBarTitleColor, var(--el-text-color-primary)) !important;
  font-weight: 600 !important;
}

.workspace-migration-dialog .el-dialog__close {
  color: var(--sideBarTextColor, var(--el-text-color-secondary)) !important;
}
</style>
