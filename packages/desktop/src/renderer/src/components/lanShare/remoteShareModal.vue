<template>
  <el-dialog
    v-model="visible"
    :title="`${t('lanShare.remoteModalTitle')} - ${share?.title || t('lanShare.untitledShare')}`"
    width="540px"
    custom-class="lan-remote-dialog"
    destroy-on-close
  >
    <div v-if="share" class="remote-modal-body">
      <!-- 来源设备与地址信息 -->
      <div class="source-info">
        <div class="source-item">
          <span class="source-label">{{ t('lanShare.sourceDevice') }}</span>
          <span class="source-val">{{ share.deviceName }} ({{ share.app === 'marktextpro' ? 'MarkTextPro' : 'MarkNotePro' }})</span>
        </div>
        <div class="source-item">
          <span class="source-label">{{ t('lanShare.lanAddress') }}</span>
          <span class="source-val">{{ share.url }}</span>
        </div>
      </div>

      <!-- 提取密码输入区 -->
      <div v-if="needPassword && !isVerified" class="password-box">
        <div class="lock-icon">🔒</div>
        <div class="lock-title">{{ t('lanShare.lockProtected') }}</div>
        <div class="lock-desc">{{ t('lanShare.lockTip') }}</div>
        <div class="pwd-input-row">
          <el-input
            v-model="passwordInput"
            type="text"
            :placeholder="t('lanShare.remotePasswordPlaceholder')"
            maxlength="18"
            clearable
            @keydown.enter="verifyPassword"
          />
          <el-button type="primary" :loading="verifying" @click="verifyPassword">
            {{ t('lanShare.extractFiles') }}
          </el-button>
        </div>
        <div v-if="pwdError" class="pwd-error">{{ pwdError }}</div>
      </div>

      <!-- 文件列表与下载选择区 -->
      <div v-else v-loading="loadingFiles" class="files-area">
        <div class="files-header">
          <span class="files-count">{{ t('lanShare.availableFiles') }} ({{ selectedIds.length }}/{{ remoteFiles.length }})</span>
          <div class="files-actions">
            <el-button link type="primary" size="small" @click="selectAll">{{ t('lanShare.selectAll') }}</el-button>
            <el-button link type="info" size="small" @click="clearAll">{{ t('lanShare.clearAll') }}</el-button>
          </div>
        </div>

        <div class="files-list">
          <div v-if="remoteFiles.length === 0" class="empty-hint">{{ t('lanShare.noRemoteFiles') }}</div>
          <div
            v-for="file in remoteFiles"
            :key="file.id"
            class="file-row"
            @click="toggleFile(file.id)"
          >
            <el-checkbox
              :model-value="selectedIds.includes(file.id)"
              @click.stop.prevent="toggleFile(file.id)"
            />
            <div class="file-info-col">
              <span class="file-name">{{ file.name }}</span>
              <span class="file-meta">{{ formatSize(file.size) }} · {{ file.extension || t('lanShare.fileFallback') }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 目标保存位置选择区 -->
      <div v-if="isVerified || !needPassword" class="save-location-box">
        <div class="loc-header">
          <span class="loc-title">{{ t('lanShare.saveLocation') }}</span>
          <span class="loc-tip">
            {{ targetLocationTip }}
          </span>
        </div>
        <div class="loc-select-row">
          <el-select
            v-if="hasWorkspace"
            v-model="targetSavePath"
            :placeholder="t('lanShare.selectFolderPlaceholder')"
            size="small"
            filterable
            class="loc-select"
            @change="userChangedSavePath = true"
          >
            <el-option
              v-for="opt in folderOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            >
              <span style="float: left">{{ opt.label }}</span>
              <span
                v-if="opt.tag"
                style="float: right; color: var(--el-text-color-secondary); font-size: 11px; margin-left: 10px;"
              >
                {{ opt.tag }}
              </span>
            </el-option>
          </el-select>
          <el-input
            v-else
            v-model="targetSavePath"
            :placeholder="t('lanShare.selectFolderPlaceholder')"
            size="small"
            readonly
            class="loc-input"
          />
          <el-button size="small" type="default" plain @click="selectCustomFolder">
            {{ t('lanShare.browseOtherFolder') }}
          </el-button>
        </div>
        <div class="loc-current-path" :title="targetSavePath">
          {{ targetSavePath || t('lanShare.unspecified') }}
        </div>

        <!-- 目录结构策略（默认保留路径信息） -->
        <div class="conflict-strategy-row">
          <span class="conflict-label">{{ t('lanShare.pathModeLabel') }}</span>
          <el-radio-group v-model="pathMode" size="small">
            <el-radio-button value="preserve">{{ t('lanShare.pathModePreserve') }}</el-radio-button>
            <el-radio-button value="flatten">{{ t('lanShare.pathModeFlatten') }}</el-radio-button>
          </el-radio-group>
        </div>

        <!-- 重名冲突策略选择 -->
        <div class="conflict-strategy-row">
          <span class="conflict-label">{{ t('lanShare.conflictStrategyLabel') }}</span>
          <el-radio-group v-model="conflictStrategy" size="small">
            <el-radio-button value="rename">{{ t('lanShare.strategyRename') }}</el-radio-button>
            <el-radio-button value="skip">{{ t('lanShare.strategySkip') }}</el-radio-button>
            <el-radio-button value="overwrite">{{ t('lanShare.strategyOverwrite') }}</el-radio-button>
          </el-radio-group>
        </div>
        <div
          v-if="conflictPreview && conflictPreview.conflictCount > 0"
          class="conflict-preview-tip"
          :class="`strategy-${conflictStrategy}`"
        >
          {{
            t('lanShare.conflictPreviewTip', {
              count: conflictPreview.conflictCount,
              action: conflictActionText
            })
          }}
        </div>
      </div>

      <div v-if="downloading" class="download-progress-box">
        <span>{{ t('lanShare.downloadingProgress', { progress: downloadProgressText }) }}</span>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="visible = false">{{ t('lanShare.cancel') }}</el-button>
        <el-button
          v-if="isVerified || !needPassword"
          type="primary"
          :disabled="selectedIds.length === 0 || downloading"
          :loading="downloading"
          @click="startDownload"
        >
          {{ t('lanShare.downloadSelected', { count: selectedIds.length }) }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import bus from '@/bus'
import { useProjectStore } from '@/store/project'
import type {
  DiscoveredLanShare,
  LanShareConflictPreview,
  LanShareConflictStrategy,
  LanSharePathMode
} from '@shared/types/lanShare'

const { t } = useI18n()
const visible = ref(false)
const share = ref<DiscoveredLanShare | null>(null)
const needPassword = ref(false)
const isVerified = ref(false)
const passwordInput = ref('')
const verifying = ref(false)
const pwdError = ref('')
const authToken = ref('')

const loadingFiles = ref(false)
const remoteFiles = ref<any[]>([])
const selectedIds = ref<string[]>([])
const downloading = ref(false)
const downloadProgressText = ref('')
const targetSavePath = ref('')
const pathMode = ref<LanSharePathMode>('preserve')
const conflictStrategy = ref<LanShareConflictStrategy>('rename')
const conflictPreview = ref<LanShareConflictPreview | null>(null)
const remoteIsFolder = ref(false)
const remoteRootFolderName = ref('')
const userChangedSavePath = ref(false)

const projectStore = useProjectStore()

const isMarkNote = computed(() => {
  const p = (window as any).process
  if (p?.appName) return p.appName === 'marknotepro'
  const cwd = p?.cwd?.() || ''
  const resources = p?.resourcesPath || ''
  const title = (typeof document !== 'undefined' ? document.title : '') || ''
  if (/marknote/i.test(cwd) || /marknote/i.test(resources) || /marknote/i.test(title)) return true
  if (/marktext/i.test(cwd) || /marktext/i.test(resources) || /marktext/i.test(title)) return false
  const folders = projectStore.projectTree?.folders || []
  if (folders.some((f: any) => f.name?.startsWith('GROUP_') || f.name?.startsWith('AREA_'))) return true
  return false
})

const hasWorkspace = computed(() => {
  return !!projectStore.projectTree?.pathname
})

const isFolderShare = computed(() => {
  if (remoteIsFolder.value || share.value?.isFolder) return true
  if (remoteFiles.value.some((f) => String(f.relativePath || '').includes('/'))) return true
  return (share.value?.fileCount ?? 0) > 1
})

interface FolderOption {
  label: string
  value: string
  tag?: string
}

const collectGroupsAndAreas = (
  node: any,
  groups: { path: string; display: string }[],
  areas: { path: string; display: string }[],
  groupPathPrefix: string = ''
) => {
  if (!node) return
  const name = node.name || ''
  let nextPrefix = groupPathPrefix
  if (name.startsWith('GROUP_')) {
    const clean = name.replace(/^GROUP_/, '')
    const display = groupPathPrefix ? `${groupPathPrefix}/${clean}` : clean
    groups.push({ path: node.pathname, display })
    nextPrefix = display
  } else if (name.startsWith('AREA_')) {
    const areaName = name.replace(/^AREA_/, '')
    const display = groupPathPrefix ? `[${groupPathPrefix}] ${areaName}` : areaName
    areas.push({ path: node.pathname, display })
  }

  if (Array.isArray(node.folders)) {
    for (const child of node.folders) {
      collectGroupsAndAreas(child, groups, areas, nextPrefix)
    }
  }
}

const collectFolders = (
  node: any,
  result: { path: string; display: string }[],
  rootPath: string
) => {
  if (!node) return
  if (node.pathname && node.pathname !== rootPath) {
    const rel = node.pathname.replace(rootPath, '').replace(/^[/\\]/, '')
    result.push({ path: node.pathname, display: rel || node.name })
  }
  if (Array.isArray(node.folders)) {
    for (const child of node.folders) {
      collectFolders(child, result, rootPath)
    }
  }
}

const folderOptions = computed<FolderOption[]>(() => {
  const root = projectStore.projectTree?.pathname
  if (!root) return []

  const options: FolderOption[] = []

  if (isMarkNote.value) {
    const defaultAreaPath = `${root}/GROUP_Dump/AREA_Downloads`
    const defaultFoldersPath = `${root}/GROUP_Dump/GROUP_Folders`

    if (isFolderShare.value) {
      options.push({
        label: t('lanShare.defaultGroupFoldersLabel'),
        value: defaultFoldersPath,
        tag: t('lanShare.tagRecommended')
      })
      options.push({
        label: t('lanShare.defaultAreaLabel'),
        value: defaultAreaPath,
        tag: t('lanShare.tagArea')
      })
    } else {
      options.push({
        label: t('lanShare.defaultAreaLabel'),
        value: defaultAreaPath,
        tag: t('lanShare.tagRecommended')
      })
      options.push({
        label: t('lanShare.defaultGroupFoldersLabel'),
        value: defaultFoldersPath,
        tag: t('lanShare.tagGroup')
      })
    }

    const existingGroups: { path: string; display: string }[] = []
    const existingAreas: { path: string; display: string }[] = []
    collectGroupsAndAreas(projectStore.projectTree, existingGroups, existingAreas)

    for (const grp of existingGroups) {
      if (grp.path !== defaultFoldersPath) {
        options.push({
          label: `📁 ${grp.display}`,
          value: grp.path,
          tag: t('lanShare.tagGroup')
        })
      }
    }

    for (const area of existingAreas) {
      if (area.path !== defaultAreaPath) {
        options.push({
          label: `📑 ${area.display}`,
          value: area.path,
          tag: t('lanShare.tagArea')
        })
      }
    }

    const rootName =
      projectStore.projectTree?.name ||
      root.split(/[/\\]/).pop() ||
      t('lanShare.tagWorkspaceRoot')
    options.push({
      label: `📦 ${rootName}`,
      value: root,
      tag: t('lanShare.tagWorkspaceRoot')
    })
  } else {
    const defaultDownloadsPath = `${root}/Dump/Downloads`
    const defaultFoldersPath = `${root}/Dump/Folders`

    if (isFolderShare.value) {
      options.push({
        label: t('lanShare.defaultFoldersLabel'),
        value: defaultFoldersPath,
        tag: t('lanShare.tagRecommended')
      })
      options.push({
        label: t('lanShare.defaultFolderLabel'),
        value: defaultDownloadsPath,
        tag: t('lanShare.tagFolder')
      })
    } else {
      options.push({
        label: t('lanShare.defaultFolderLabel'),
        value: defaultDownloadsPath,
        tag: t('lanShare.tagRecommended')
      })
      options.push({
        label: t('lanShare.defaultFoldersLabel'),
        value: defaultFoldersPath,
        tag: t('lanShare.tagFolder')
      })
    }

    const rootName =
      projectStore.projectTree?.name ||
      root.split(/[/\\]/).pop() ||
      t('lanShare.tagWorkspaceRoot')
    options.push({
      label: `📦 ${rootName}`,
      value: root,
      tag: t('lanShare.tagWorkspaceRoot')
    })

    // 2. 扫描工作区内所有文件夹
    const existingFolders: { path: string; display: string }[] = []
    collectFolders(projectStore.projectTree, existingFolders, root)
    for (const folder of existingFolders) {
      if (folder.path !== defaultDownloadsPath && folder.path !== defaultFoldersPath) {
        options.push({
          label: `📁 ${folder.display}`,
          value: folder.path,
          tag: t('lanShare.tagFolder')
        })
      }
    }
  }

  return options
})

const targetLocationTip = computed(() => {
  if (!isMarkNote.value) {
    return pathMode.value === 'flatten' ? t('lanShare.pathModeFlattenTip') : t('lanShare.workspaceTip')
  }
  if (pathMode.value === 'flatten') {
    return t('lanShare.pathModeFlattenTip')
  }
  const base = targetSavePath.value.split(/[/\\]/).pop() || ''
  if (base.startsWith('AREA_')) {
    return t('lanShare.markNoteAreaTip')
  }
  if (share.value?.app === 'marknotepro') {
    return t('lanShare.markNoteGroupPreserveTip')
  }
  return t('lanShare.markNoteGroupConvertTip')
})

const conflictActionText = computed(() => {
  if (conflictStrategy.value === 'skip') return t('lanShare.actionSkip')
  if (conflictStrategy.value === 'overwrite') return t('lanShare.actionOverwrite')
  return t('lanShare.actionRename')
})

const initTargetSavePath = () => {
  const root = projectStore.projectTree?.pathname
  if (!root) {
    targetSavePath.value = ''
    return
  }
  const useFoldersDir = isFolderShare.value && pathMode.value === 'preserve'
  if (isMarkNote.value) {
    targetSavePath.value = useFoldersDir
      ? `${root}/GROUP_Dump/GROUP_Folders`
      : `${root}/GROUP_Dump/AREA_Downloads`
  } else {
    targetSavePath.value = useFoldersDir
      ? `${root}/Dump/Folders`
      : `${root}/Dump/Downloads`
  }
}

const selectCustomFolder = async () => {
  const selected = await window.electron.ipcRenderer.invoke(
    'mt::lan-share:select-destination-folder'
  )
  if (selected) {
    userChangedSavePath.value = true
    targetSavePath.value = selected
  }
}

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const toggleFile = (id: string) => {
  const idx = selectedIds.value.indexOf(id)
  if (idx > -1) {
    selectedIds.value.splice(idx, 1)
  } else {
    selectedIds.value.push(id)
  }
}

const selectAll = () => {
  selectedIds.value = remoteFiles.value.map((f) => f.id)
}

const clearAll = () => {
  selectedIds.value = []
}

const openModal = async (targetShare: DiscoveredLanShare) => {
  share.value = targetShare
  needPassword.value = !!targetShare.hasPassword
  isVerified.value = !targetShare.hasPassword
  passwordInput.value = ''
  pwdError.value = ''
  authToken.value = ''
  remoteFiles.value = []
  selectedIds.value = []
  remoteIsFolder.value = !!targetShare.isFolder
  remoteRootFolderName.value = targetShare.rootFolderName || ''
  userChangedSavePath.value = false
  pathMode.value = 'preserve'
  conflictStrategy.value = 'rename'
  conflictPreview.value = null
  initTargetSavePath()
  visible.value = true

  if (!needPassword.value) {
    await fetchFiles()
  }
}

const verifyPassword = async () => {
  if (!share.value) return
  const pwd = passwordInput.value.trim()
  if (!pwd) {
    pwdError.value = t('lanShare.enterPasswordWarn')
    return
  }
  if (pwd.length < 10 || pwd.length > 18) {
    pwdError.value = t('lanShare.passwordLengthExactWarn')
    return
  }

  pwdError.value = ''
  verifying.value = true
  try {
    const res = await window.electron.ipcRenderer.invoke(
      'mt::lan-share:verify-remote-password',
      share.value.url,
      pwd
    )
    if (res.success) {
      authToken.value = res.token || ''
      isVerified.value = true
      await fetchFiles()
    } else {
      pwdError.value = res.error || t('lanShare.wrongPasswordErr')
    }
  } catch (err: any) {
    pwdError.value = t('lanShare.connectFailedErr', { error: err.message })
  } finally {
    verifying.value = false
  }
}

const fetchFiles = async () => {
  if (!share.value) return
  loadingFiles.value = true
  try {
    const data = await window.electron.ipcRenderer.invoke(
      'mt::lan-share:fetch-remote-files',
      share.value.url,
      authToken.value
    )
    remoteFiles.value = data.files || []
    remoteIsFolder.value =
      typeof data.isFolder === 'boolean'
        ? data.isFolder
        : Boolean(share.value?.isFolder) ||
          remoteFiles.value.some((f: any) => String(f.relativePath || '').includes('/'))
    remoteRootFolderName.value =
      data.rootFolderName ||
      share.value?.rootFolderName ||
      (remoteIsFolder.value ? String(data.title || share.value?.title || '').trim() : '')
    if (!userChangedSavePath.value) {
      initTargetSavePath()
    }
    // 默认全选远程文件以方便快速下载
    selectedIds.value = remoteFiles.value.map((f) => f.id)
  } catch (err: any) {
    ElMessage.error(t('lanShare.fetchFilesFailedErr', { error: err.message }))
  } finally {
    loadingFiles.value = false
  }
}

const buildBatchFileItem = (f: any) => {
  const rawRel = String(f.relativePath || f.name || 'shared-file').replace(/^[/\\]+/, '')
  const rootName = remoteRootFolderName.value.replace(/^[/\\]+|[/\\]+$/g, '')
  const withRoot =
    isFolderShare.value && rootName && !rawRel.startsWith(`${rootName}/`)
      ? `${rootName}/${rawRel}`
      : rawRel
  return {
    id: f.id,
    name: f.name,
    relativePath: withRoot
  }
}

const refreshConflictPreview = async () => {
  if (!visible.value || (!isVerified.value && needPassword.value)) {
    conflictPreview.value = null
    return
  }
  const targetDir = targetSavePath.value
  const targets = remoteFiles.value.filter((f) => selectedIds.value.includes(f.id))
  if (!targetDir || targets.length === 0) {
    conflictPreview.value = null
    return
  }
  try {
    const res = await window.electron.ipcRenderer.invoke('mt::lan-share:preview-conflicts', {
      targetDir,
      workspaceRoot: projectStore.projectTree?.pathname || undefined,
      senderAppType: share.value?.app,
      pathMode: pathMode.value,
      files: targets.map(buildBatchFileItem)
    })
    conflictPreview.value = res
  } catch {
    conflictPreview.value = null
  }
}

watch(pathMode, () => {
  if (!userChangedSavePath.value) {
    initTargetSavePath()
  }
})

watch(
  [visible, isVerified, targetSavePath, selectedIds, remoteFiles, pathMode],
  () => {
    void refreshConflictPreview()
  },
  { deep: true }
)

const startDownload = async () => {
  if (!share.value || selectedIds.value.length === 0) return

  let targetDir = targetSavePath.value
  if (!targetDir) {
    const selected = await window.electron.ipcRenderer.invoke(
      'mt::lan-share:select-destination-folder'
    )
    if (!selected) return
    targetDir = selected
  }

  downloading.value = true
  downloadProgressText.value = ''

  const unsubscribeProgress = window.electron.ipcRenderer.on(
    'mt::lan-share:download-progress',
    (_event: any, payload: { index: number; total: number; name: string }) => {
      downloadProgressText.value = `${payload.index}/${payload.total} ${payload.name}`
    }
  )

  try {
    const targets = remoteFiles.value.filter((f) => selectedIds.value.includes(f.id))
    const result = await window.electron.ipcRenderer.invoke('mt::lan-share:download-batch', {
      remoteUrl: share.value.url,
      targetDir,
      workspaceRoot: projectStore.projectTree?.pathname || undefined,
      senderAppType: share.value.app,
      pathMode: pathMode.value,
      conflictStrategy: conflictStrategy.value,
      token: authToken.value,
      password: passwordInput.value,
      files: targets.map(buildBatchFileItem)
    })

    ElMessage.success(
      t('lanShare.downloadBatchResult', {
        downloaded: result.downloadedCount,
        renamed: result.renamedCount,
        skipped: result.skippedCount,
        overwritten: result.overwrittenCount,
        dir: targetDir
      })
    )

    // 如果保存位置在当前打开的工作区内，主动触发刷新工作区侧边栏树
    const rootPath = projectStore.projectTree?.pathname
    if (
      rootPath &&
      (targetDir === rootPath ||
        targetDir.startsWith(`${rootPath}/`) ||
        targetDir.startsWith(`${rootPath}\\`))
    ) {
      window.electron.ipcRenderer.send('mt::reload-workspace', rootPath)
    }

    visible.value = false
  } catch (err: any) {
    ElMessage.error(t('lanShare.downloadErrorErr', { error: err.message }))
  } finally {
    unsubscribeProgress()
    downloading.value = false
  }
}

onMounted(() => {
  bus.on('LAN_SHARE::open-remote-modal', openModal)
})

onBeforeUnmount(() => {
  bus.off('LAN_SHARE::open-remote-modal', openModal)
})
</script>

<style scoped>
.remote-modal-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.source-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--sideBarItemHoverBgColor, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--floatBorderColor, rgba(255, 255, 255, 0.08));
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
}

.source-item {
  display: flex;
  align-items: center;
}

.source-label {
  color: var(--sideBarTextColor, rgba(255, 255, 255, 0.6));
  flex-shrink: 0;
  width: 90px;
}

.source-val {
  color: var(--sideBarTitleColor, #ffffff);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.password-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 16px;
  border: 1px dashed var(--floatBorderColor, rgba(255, 255, 255, 0.2));
  background: var(--sideBarItemHoverBgColor, rgba(255, 255, 255, 0.02));
  border-radius: 8px;
  text-align: center;
  gap: 8px;
}

.lock-icon {
  font-size: 32px;
}

.lock-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--sideBarTitleColor, #ffffff);
}

.lock-desc {
  font-size: 12px;
  color: var(--sideBarTextColor, rgba(255, 255, 255, 0.5));
}

.pwd-input-row {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  width: 100%;
  max-width: 320px;
}

.pwd-error {
  color: #ef4444;
  font-size: 12px;
}

.files-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid var(--floatBorderColor, rgba(255, 255, 255, 0.1));
  border-radius: 8px;
  padding: 10px;
  background: var(--sideBarItemHoverBgColor, rgba(255, 255, 255, 0.02));
}

.files-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--sideBarTitleColor, #ffffff);
}

.files-list {
  max-height: 240px;
  overflow-y: auto;
  border: 1px solid var(--floatBorderColor, rgba(255, 255, 255, 0.08));
  border-radius: 6px;
  padding: 4px;
  background: var(--inputBgColor, rgba(0, 0, 0, 0.2));
}

.file-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 4px;
  cursor: pointer;
}

.file-row:hover {
  background: rgba(255, 255, 255, 0.06);
}

.file-info-col {
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  min-width: 0;
  color: var(--sideBarColor, rgba(255, 255, 255, 0.85));
}

.file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-meta {
  font-size: 11px;
  color: var(--sideBarTextColor, rgba(255, 255, 255, 0.5));
  margin-left: 8px;
  flex-shrink: 0;
}

.empty-hint {
  text-align: center;
  padding: 24px;
  color: var(--sideBarTextColor, rgba(255, 255, 255, 0.5));
  font-size: 13px;
}

.download-progress-box {
  font-size: 13px;
  color: var(--themeColor, #409eff);
  padding: 6px 12px;
  background: rgba(64, 158, 255, 0.12);
  border-radius: 6px;
}

.save-location-box {
  background: var(--sideBarItemHoverBgColor, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--floatBorderColor, rgba(255, 255, 255, 0.1));
  border-radius: 8px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.loc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.loc-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--sideBarTitleColor, #ffffff);
}

.loc-tip {
  font-size: 12px;
  color: var(--sideBarTextColor, rgba(255, 255, 255, 0.5));
}

.loc-select-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.loc-select {
  flex: 1;
}

.loc-input {
  flex: 1;
}

.loc-current-path {
  font-size: 11px;
  color: var(--sideBarTextColor, rgba(255, 255, 255, 0.5));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conflict-strategy-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 2px;
}

.conflict-label {
  font-size: 12px;
  color: var(--sideBarColor, rgba(255, 255, 255, 0.8));
}

.conflict-preview-tip {
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(230, 162, 60, 0.14);
  color: #e6a23c;
}

.conflict-preview-tip.strategy-overwrite {
  background: rgba(245, 108, 108, 0.14);
  color: #f56c6c;
}
</style>

<style>
/* 弹窗深浅模式自适应覆盖 */
.lan-remote-dialog {
  --el-dialog-bg-color: var(--floatBgColor, #2a2a2a) !important;
  --el-bg-color: var(--floatBgColor, #2a2a2a) !important;
  --el-bg-color-overlay: var(--floatBgColor, #2a2a2a) !important;
  --el-text-color-primary: var(--sideBarTitleColor, #ffffff) !important;
  --el-text-color-regular: var(--sideBarColor, rgba(255, 255, 255, 0.8)) !important;
  --el-border-color: var(--floatBorderColor, rgba(255, 255, 255, 0.1)) !important;
  background: var(--floatBgColor, #2a2a2a) !important;
  border: 1px solid var(--floatBorderColor, rgba(255, 255, 255, 0.12)) !important;
  color: var(--sideBarTitleColor, #ffffff) !important;
  border-radius: 12px !important;
}

.lan-remote-dialog .el-dialog__title {
  color: var(--sideBarTitleColor, #ffffff) !important;
  font-weight: 600 !important;
}

.lan-remote-dialog .el-dialog__close {
  color: var(--sideBarTextColor, rgba(255, 255, 255, 0.6)) !important;
}
</style>
