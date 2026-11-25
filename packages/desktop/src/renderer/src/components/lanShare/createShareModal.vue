<template>
  <el-dialog
    v-model="visible"
    :title="dialogTitle"
    width="540px"
    custom-class="lan-share-dialog"
    destroy-on-close
  >
    <div class="share-modal-body">
      <!-- 目标路径与模式提示 -->
      <div class="target-info">
        <span class="info-label">{{ isFolder ? t('lanShare.targetFolder') : t('lanShare.targetFile') }}</span>
        <span class="info-path" :title="targetPath">{{ targetPath }}</span>
      </div>

      <!-- 分享标题设置（选填） -->
      <div class="form-item">
        <label class="form-label">{{ t('lanShare.shareTitleLabel') }}</label>
        <el-input
          v-model="shareTitle"
          :placeholder="t('lanShare.shareTitlePlaceholder')"
          clearable
        />
      </div>

      <!-- 提取密码设置 -->
      <div class="form-item">
        <div class="form-label-row">
          <label class="form-label">{{ t('lanShare.passwordInputLabel') }}</label>
          <span class="password-tip">{{ t('lanShare.passwordTip') }}</span>
        </div>
        <div class="password-input-group">
          <el-input
            v-model="password"
            :placeholder="t('lanShare.passwordPlaceholder')"
            maxlength="18"
            clearable
          />
          <el-button type="info" plain @click="refreshPassword">{{ t('lanShare.refreshPassword') }}</el-button>
          <el-button
            :type="!password ? 'success' : 'info'"
            plain
            @click="clearPassword"
          >{{ t('lanShare.noPasswordBtn') }}</el-button>
        </div>
      </div>

      <!-- 文件夹模式下的文件多选列表（默认全部不勾选） -->
      <div v-if="isFolder" class="folder-selection-area">
        <div class="selection-header">
          <div class="selection-stats">
            <span>{{ t('lanShare.pendingFiles') }} ({{ selectedFiles.length }}/{{ allFiles.length }})</span>
            <span v-if="selectedSizeText" class="size-text">{{ t('lanShare.totalSize') }} {{ selectedSizeText }}</span>
          </div>
          <div class="selection-actions">
            <el-button link type="primary" size="small" @click="selectAll">{{ t('lanShare.selectAll') }}</el-button>
            <el-button link type="info" size="small" @click="clearAll">{{ t('lanShare.clearAll') }}</el-button>
          </div>
        </div>

        <el-input
          v-model="searchFilter"
          :placeholder="t('lanShare.searchFilePlaceholder')"
          size="small"
          clearable
          class="filter-input"
        />

        <div v-loading="loadingFiles" class="files-checklist">
          <div v-if="filteredFiles.length === 0" class="empty-files">
            {{ allFiles.length === 0 ? t('lanShare.noFilesToShare') : t('lanShare.noMatchingFiles') }}
          </div>
          <div
            v-for="file in filteredFiles"
            :key="file.id"
            class="file-check-item"
            @click="toggleFile(file.absolutePath)"
          >
            <el-checkbox
              :model-value="selectedFiles.includes(file.absolutePath)"
              @click.stop.prevent="toggleFile(file.absolutePath)"
            />
            <div class="file-text">
              <span class="file-rel-path">{{ file.relativePath }}</span>
              <span class="file-size-badge">{{ formatSize(file.size) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 单文件模式展示 -->
      <div v-else class="single-file-box">
        <div class="single-file-icon">📄</div>
        <div class="single-file-desc">
          <div class="single-file-name">{{ fileName }}</div>
          <div class="single-file-size">{{ singleFileSizeText }}</div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="visible = false">{{ t('lanShare.cancel') }}</el-button>
        <el-button
          type="primary"
          :loading="submitting"
          :disabled="selectedFiles.length === 0"
          @click="startShare"
        >
          {{ t('lanShare.startShareBtn', { count: selectedFiles.length }) }}
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
import type { LanShareFileItem } from '@shared/types/lanShare'

const { t } = useI18n()
const visible = ref(false)
const targetPath = ref('')
const isFolder = ref(false)
const shareTitle = ref('')
const password = ref('')
const loadingFiles = ref(false)
const submitting = ref(false)
const searchFilter = ref('')

const allFiles = ref<LanShareFileItem[]>([])
const selectedFiles = ref<string[]>([])

const fileName = computed(() => {
  if (!targetPath.value) return ''
  const parts = targetPath.value.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || targetPath.value
})

const dialogTitle = computed(() => {
  return isFolder.value ? t('lanShare.createTitleFolder') : t('lanShare.createTitleSingle')
})

const filteredFiles = computed(() => {
  if (!searchFilter.value.trim()) return allFiles.value
  const kw = searchFilter.value.trim().toLowerCase()
  return allFiles.value.filter(
    (f) =>
      f.name.toLowerCase().includes(kw) || f.relativePath.toLowerCase().includes(kw)
  )
})

const selectedSizeText = computed(() => {
  let total = 0
  for (const p of selectedFiles.value) {
    const f = allFiles.value.find((item) => item.absolutePath === p)
    if (f) total += f.size
  }
  return total > 0 ? formatSize(total) : ''
})

const singleFileSizeText = computed(() => {
  if (allFiles.value.length > 0) {
    return formatSize(allFiles.value[0].size)
  }
  return ''
})

const generateSecurePassword = (length: number = 12): string => {
  const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lowers = 'abcdefghijkmnopqrstuvwxyz'
  const digits = '23456789'
  const all = uppers + lowers + digits

  const len = Math.max(10, Math.min(18, length))
  const chars = [
    uppers.charAt(Math.floor(Math.random() * uppers.length)),
    lowers.charAt(Math.floor(Math.random() * lowers.length)),
    digits.charAt(Math.floor(Math.random() * digits.length))
  ]

  for (let i = 3; i < len; i++) {
    chars.push(all.charAt(Math.floor(Math.random() * all.length)))
  }

  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }

  return chars.join('')
}

const refreshPassword = () => {
  password.value = generateSecurePassword(12)
}

const clearPassword = () => {
  password.value = ''
}

const toggleFile = (path: string) => {
  const idx = selectedFiles.value.indexOf(path)
  if (idx > -1) {
    selectedFiles.value.splice(idx, 1)
  } else {
    selectedFiles.value.push(path)
  }
}

const selectAll = () => {
  selectedFiles.value = allFiles.value.map((f) => f.absolutePath)
}

const clearAll = () => {
  selectedFiles.value = []
}

const openModal = async (payload: { pathname: string; isDirectory?: boolean; title?: string }) => {
  targetPath.value = payload.pathname
  isFolder.value = !!payload.isDirectory
  // 标题支持选填：默认留空，用户自主选择是否填写
  shareTitle.value = payload.title && payload.title !== '工作区' ? payload.title : ''
  password.value = generateSecurePassword(12)
  searchFilter.value = ''
  selectedFiles.value = []
  allFiles.value = []
  visible.value = true

  loadingFiles.value = true
  try {
    const files = await window.electron.ipcRenderer.invoke(
      'mt::lan-share:scan-folder',
      targetPath.value
    )
    allFiles.value = files || []

    if (!isFolder.value && allFiles.value.length > 0) {
      // 单文件模式：默认直接勾选该单文件
      selectedFiles.value = [allFiles.value[0].absolutePath]
    } else {
      // 文件夹模式：默认全部不勾选！
      selectedFiles.value = []
    }
  } catch (err: any) {
    ElMessage.error(err.message)
  } finally {
    loadingFiles.value = false
  }
}

const startShare = async () => {
  if (selectedFiles.value.length === 0) {
    ElMessage.warning(t('lanShare.selectOneFileWarn'))
    return
  }

  const pwd = password.value.trim()
  if (pwd) {
    if (pwd.length < 10 || pwd.length > 18) {
      ElMessage.warning(t('lanShare.passwordLengthWarn'))
      return
    }
    if (!/^[A-Za-z0-9]+$/.test(pwd)) {
      ElMessage.warning(t('lanShare.passwordFormatWarn'))
      return
    }
  }

  submitting.value = true
  try {
    const cleanPayload = JSON.parse(
      JSON.stringify({
        title: shareTitle.value.trim(),
        rootPath: targetPath.value,
        isFolder: isFolder.value,
        filePaths: [...selectedFiles.value],
        password: password.value.trim()
      })
    )
    const record = await window.electron.ipcRenderer.invoke('mt::lan-share:create', cleanPayload)

    visible.value = false
    ElMessage.success(t('lanShare.shareStartedSuccess'))

    // 弹出二维码与链接查看面板
    bus.emit('LAN_SHARE::open-qr-modal', record)
  } catch (err: any) {
    ElMessage.error(t('lanShare.shareStartFailed', { error: err.message }))
  } finally {
    submitting.value = false
  }
}

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

onMounted(() => {
  bus.on('LAN_SHARE::open-create-modal', openModal)
})

onBeforeUnmount(() => {
  bus.off('LAN_SHARE::open-create-modal', openModal)
})
</script>

<style scoped>
.share-modal-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.target-info {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--sideBarItemHoverBgColor, rgba(255, 255, 255, 0.05));
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  border: 1px solid var(--floatBorderColor, rgba(255, 255, 255, 0.08));
}

.info-label {
  color: var(--sideBarTextColor, rgba(255, 255, 255, 0.6));
  flex-shrink: 0;
}

.info-path {
  color: var(--sideBarTitleColor, #ffffff);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.form-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--sideBarTitleColor, #ffffff);
}

.password-tip {
  font-size: 12px;
  color: var(--sideBarTextColor, rgba(255, 255, 255, 0.5));
}

.password-input-group {
  display: flex;
  gap: 8px;
}

.password-input-group .el-button {
  margin-left: 0;
  flex-shrink: 0;
}

.folder-selection-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid var(--floatBorderColor, rgba(255, 255, 255, 0.1));
  border-radius: 6px;
  padding: 10px;
  background: var(--sideBarItemHoverBgColor, rgba(255, 255, 255, 0.02));
}

.selection-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: var(--sideBarTitleColor, #ffffff);
}

.selection-stats {
  font-weight: 600;
}

.size-text {
  margin-left: 8px;
  font-weight: normal;
  color: var(--sideBarTextColor, rgba(255, 255, 255, 0.6));
  font-size: 12px;
}

.files-checklist {
  max-height: 220px;
  overflow-y: auto;
  border: 1px solid var(--floatBorderColor, rgba(255, 255, 255, 0.08));
  border-radius: 4px;
  padding: 4px;
  background: var(--inputBgColor, rgba(0, 0, 0, 0.2));
}

.empty-files {
  padding: 24px 0;
  text-align: center;
  color: var(--sideBarTextColor, rgba(255, 255, 255, 0.5));
  font-size: 13px;
}

.file-check-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}

.file-check-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.file-text {
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  min-width: 0;
  color: var(--sideBarColor, rgba(255, 255, 255, 0.85));
}

.file-rel-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size-badge {
  font-size: 11px;
  color: var(--sideBarTextColor, rgba(255, 255, 255, 0.5));
  margin-left: 8px;
  flex-shrink: 0;
}

.single-file-box {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-radius: 8px;
  border: 1px solid var(--floatBorderColor, rgba(255, 255, 255, 0.1));
  background: var(--sideBarItemHoverBgColor, rgba(255, 255, 255, 0.04));
}

.single-file-icon {
  font-size: 28px;
}

.single-file-desc {
  display: flex;
  flex-direction: column;
}

.single-file-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--sideBarTitleColor, #ffffff);
}

.single-file-size {
  font-size: 12px;
  color: var(--sideBarTextColor, rgba(255, 255, 255, 0.6));
}
</style>

<style>
/* 弹窗深浅模式自适应覆盖 */
.lan-share-dialog {
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

.lan-share-dialog .el-dialog__title {
  color: var(--sideBarTitleColor, #ffffff) !important;
  font-weight: 600 !important;
}

.lan-share-dialog .el-dialog__close {
  color: var(--sideBarTextColor, rgba(255, 255, 255, 0.6)) !important;
}
</style>
