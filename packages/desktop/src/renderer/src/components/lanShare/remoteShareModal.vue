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
              <span class="file-meta">{{ formatSize(file.size) }} · {{ file.extension || '文件' }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 目标保存位置选择区 -->
      <div v-if="isVerified || !needPassword" class="save-location-box">
        <div class="loc-header">
          <span class="loc-title">{{ t('lanShare.saveLocation') }}</span>
          <span class="loc-tip">
            {{ isMarkNote ? t('lanShare.markNoteAreaOnlyTip') : t('lanShare.workspaceTip') }}
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
          {{ targetSavePath || '未指定' }}
        </div>
      </div>

      <div v-if="downloading" class="download-progress-box">
        <span>正在下载... ({{ downloadProgressText }})</span>
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
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import bus from '@/bus'
import { useProjectStore } from '@/store/project'
import type { DiscoveredLanShare } from '@shared/types/lanShare'

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

interface FolderOption {
  label: string
  value: string
  tag?: string
}

const collectAreas = (
  node: any,
  result: { path: string; display: string }[],
  groupName: string = ''
) => {
  if (!node) return
  const name = node.name || ''
  let currentGroup = groupName
  if (name.startsWith('GROUP_')) {
    currentGroup = name.replace(/^GROUP_/, '')
  }

  if (name.startsWith('AREA_')) {
    const areaName = name.replace(/^AREA_/, '')
    const display = currentGroup ? `[${currentGroup}] ${areaName}` : areaName
    result.push({ path: node.pathname, display })
  }

  if (Array.isArray(node.folders)) {
    for (const child of node.folders) {
      collectAreas(child, result, currentGroup)
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
    // 1. MarkNotePro: 默认 {工作区}/GROUP_Dump/AREA_Downloads
    const defaultPath = `${root}/GROUP_Dump/AREA_Downloads`
    options.push({
      label: '⭐ 默认分区: [Dump] Downloads',
      value: defaultPath,
      tag: '默认推荐'
    })

    // 2. 扫描工作区内已有的所有 AREA（只能选择AREA）
    const existingAreas: { path: string; display: string }[] = []
    collectAreas(projectStore.projectTree, existingAreas)
    for (const area of existingAreas) {
      if (area.path !== defaultPath) {
        options.push({
          label: `📑 ${area.display}`,
          value: area.path,
          tag: '分区'
        })
      }
    }
  } else {
    // 1. marktext-pro: 默认 {工作区}/Dump/Downloads
    const defaultPath = `${root}/Dump/Downloads`
    options.push({
      label: '⭐ 默认目录: Dump/Downloads',
      value: defaultPath,
      tag: '默认推荐'
    })

    // 2. 扫描工作区内所有文件夹
    const existingFolders: { path: string; display: string }[] = []
    collectFolders(projectStore.projectTree, existingFolders, root)
    for (const folder of existingFolders) {
      if (folder.path !== defaultPath) {
        options.push({
          label: `📁 ${folder.display}`,
          value: folder.path,
          tag: '文件夹'
        })
      }
    }
  }

  return options
})

const initTargetSavePath = () => {
  const root = projectStore.projectTree?.pathname
  if (!root) {
    targetSavePath.value = ''
    return
  }
  if (isMarkNote.value) {
    targetSavePath.value = `${root}/GROUP_Dump/AREA_Downloads`
  } else {
    targetSavePath.value = `${root}/Dump/Downloads`
  }
}

const selectCustomFolder = async () => {
  const selected = await window.electron.ipcRenderer.invoke(
    'mt::lan-share:select-destination-folder'
  )
  if (selected) {
    if (isMarkNote.value) {
      const base = selected.split(/[/\\]/).pop() || ''
      if (!base.startsWith('AREA_')) {
        ElMessage.warning('MarkNote 仅支持将笔记文件保存至分区（目录名须以 AREA_ 开头）')
        return
      }
    }
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
    pwdError.value = '请输入提取密码'
    return
  }
  if (pwd.length < 10 || pwd.length > 18) {
    pwdError.value = '提取密码长度应为 10~18 位'
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
      pwdError.value = res.error || '提取密码错误'
    }
  } catch (err: any) {
    pwdError.value = '连接失败: ' + err.message
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
    // 默认全选远程文件以方便快速下载
    selectedIds.value = remoteFiles.value.map((f) => f.id)
  } catch (err: any) {
    ElMessage.error('获取文件列表失败: ' + err.message)
  } finally {
    loadingFiles.value = false
  }
}

const startDownload = async () => {
  if (!share.value || selectedIds.value.length === 0) return

  let targetDir = targetSavePath.value
  if (!targetDir) {
    const selected = await window.electron.ipcRenderer.invoke(
      'mt::lan-share:select-destination-folder'
    )
    if (!selected) return
    if (isMarkNote.value) {
      const base = selected.split(/[/\\]/).pop() || ''
      if (!base.startsWith('AREA_')) {
        ElMessage.warning('MarkNote 仅支持将笔记文件保存至分区目录（目录名须以 AREA_ 开头）')
        return
      }
    }
    targetDir = selected
  }

  downloading.value = true
  let successCount = 0

  try {
    const targets = remoteFiles.value.filter((f) => selectedIds.value.includes(f.id))
    for (let i = 0; i < targets.length; i++) {
      const file = targets[i]
      downloadProgressText.value = `${i + 1}/${targets.length} ${file.name}`

      // MarkNotePro 模式下直接归入所选 AREA 分区；marktext-pro 下保持相对文件路径
      const fileName = isMarkNote.value
        ? (file.name || 'note.md')
        : (file.relativePath || file.name || 'shared-file')
      const destPath = `${targetDir}/${fileName}`

      await window.electron.ipcRenderer.invoke(
        'mt::lan-share:download-remote-file',
        share.value.url,
        file.id,
        destPath,
        authToken.value,
        passwordInput.value
      )
      successCount++
    }

    ElMessage.success(`成功下载 ${successCount} 个文件至：${targetDir}`)

    // 如果保存位置在当前打开的工作区内，主动触发刷新工作区侧边栏树
    const rootPath = projectStore.projectTree?.pathname
    if (rootPath && targetDir.startsWith(rootPath)) {
      window.electron.ipcRenderer.send('mt::reload-workspace', rootPath)
    }

    visible.value = false
  } catch (err: any) {
    ElMessage.error('下载过程中出错: ' + err.message)
  } finally {
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
