<template>
  <div class="sftp-drawer-container" :class="{ open: visible }" @dragover.prevent @drop.prevent="handleDrop">
    <!-- Header -->
    <div class="sftp-header">
      <div class="sftp-title-area">
        <el-icon><FolderOpened /></el-icon>
        <span class="sftp-title">SFTP 文件传输</span>
      </div>
      <div class="sftp-header-actions">
        <el-button size="small" :icon="Refresh" circle title="刷新" @click="refreshDir" />
        <el-button size="small" :icon="FolderAdd" circle title="新建文件夹" @click="promptNewFolder" />
        <el-button size="small" :icon="Upload" circle title="上传本地文件" @click="triggerUpload" />
        <el-button size="small" :icon="Close" circle title="关闭" @click="$emit('close')" />
      </div>
    </div>

    <!-- Breadcrumb Path Bar -->
    <div class="sftp-path-bar">
      <el-button size="small" :icon="ArrowLeft" :disabled="pathHistory.length <= 1" circle @click="navigateBack" />
      <el-input
        v-model="currentPath"
        size="small"
        placeholder="远程路径 (例如 /root)"
        @keyup.enter="loadDir(currentPath)"
      >
        <template #prefix>
          <el-icon><Location /></el-icon>
        </template>
      </el-input>
    </div>

    <!-- File List -->
    <div v-loading="loading" class="sftp-file-list">
      <div
        v-if="currentPath !== '/' && currentPath !== ''"
        class="sftp-file-row sftp-up-row"
        @dblclick="navigateParent"
      >
        <el-icon class="file-icon folder"><Folder /></el-icon>
        <span class="file-name">.. (返回上级目录)</span>
      </div>

      <div
        v-for="item in fileList"
        :key="item.path"
        class="sftp-file-row"
        :class="{ active: selectedItem?.path === item.path }"
        @click="selectedItem = item"
        @dblclick="handleItemDblClick(item)"
        @contextmenu.prevent="openContextMenu(item, $event)"
      >
        <el-icon class="file-icon" :class="item.isDirectory ? 'folder' : 'file'">
          <Folder v-if="item.isDirectory" />
          <Document v-else />
        </el-icon>
        <span class="file-name" :title="item.name">{{ item.name }}</span>
        <span class="file-size">{{ item.isDirectory ? '-' : formatSize(item.size) }}</span>
        <span class="file-time">{{ formatDate(item.modifyTime) }}</span>
      </div>

      <div v-if="fileList.length === 0 && !loading" class="sftp-empty">
        当前目录为空 (可直接拖拽本地文件到此处上传)
      </div>
    </div>

    <!-- Transfers Progress Bar -->
    <div v-if="transfers.length > 0" class="sftp-transfers-panel">
      <div class="transfers-header">
        <span>传输任务 ({{ transfers.length }})</span>
      </div>
      <div v-for="t in transfers" :key="t.id" class="transfer-row">
        <div class="transfer-info">
          <span class="transfer-name" :title="t.name">{{ t.name }}</span>
          <span class="transfer-percent">{{ t.percent }}%</span>
        </div>
        <el-progress
          :percentage="t.percent"
          :status="t.status === 'error' ? 'exception' : t.status === 'completed' ? 'success' : ''"
          :stroke-width="4"
          :show-text="false"
        />
      </div>
    </div>

    <!-- Hidden file input for upload -->
    <input ref="fileInputRef" type="file" multiple style="display: none" @change="onFilesSelected" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import {
  FolderOpened,
  Folder,
  FolderAdd,
  Document,
  Refresh,
  Upload,
  Close,
  ArrowLeft,
  Location
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { ISftpFileItem, ISftpTransferProgress } from '@shared/types/terminal'

const props = defineProps<{
  visible: boolean
  sessionId: string | null
}>()

defineEmits<{
  (e: 'close'): void
}>()

const currentPath = ref<string>('/root')
const pathHistory = ref<string[]>(['/root'])
const fileList = ref<ISftpFileItem[]>([])
const loading = ref(false)
const selectedItem = ref<ISftpFileItem | null>(null)
const transfers = ref<ISftpTransferProgress[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)

async function loadDir(path: string): Promise<void> {
  if (!props.sessionId) return
  loading.value = true
  try {
    const list: ISftpFileItem[] = await window.electron.ipcRenderer.invoke(
      'mt::terminal:sftp-list',
      props.sessionId,
      path
    )
    fileList.value = list
    currentPath.value = path
  } catch (err: any) {
    ElMessage.error(`加载目录失败: ${err.message || err}`)
  } finally {
    loading.value = false
  }
}

function refreshDir(): void {
  loadDir(currentPath.value)
}

function navigateParent(): void {
  const parts = currentPath.value.split('/').filter(Boolean)
  parts.pop()
  const parent = '/' + parts.join('/')
  goToPath(parent || '/')
}

function navigateBack(): void {
  if (pathHistory.value.length > 1) {
    pathHistory.value.pop()
    const prev = pathHistory.value[pathHistory.value.length - 1]
    currentPath.value = prev
    loadDir(prev)
  }
}

function goToPath(path: string): void {
  currentPath.value = path
  pathHistory.value.push(path)
  loadDir(path)
}

function handleItemDblClick(item: ISftpFileItem): void {
  if (item.isDirectory) {
    goToPath(item.path)
  } else {
    // Download
    downloadFile(item)
  }
}

async function promptNewFolder(): Promise<void> {
  if (!props.sessionId) return
  try {
    const { value: folderName } = await ElMessageBox.prompt('请输入文件夹名称', '新建文件夹', {
      confirmButtonText: '创建',
      cancelButtonText: '取消'
    })
    if (folderName && folderName.trim()) {
      const fullPath = `${currentPath.value.replace(/\/$/, '')}/${folderName.trim()}`
      await window.electron.ipcRenderer.invoke('mt::terminal:sftp-mkdir', props.sessionId, fullPath)
      ElMessage.success('创建文件夹成功')
      refreshDir()
    }
  } catch {
    // cancelled
  }
}

function triggerUpload(): void {
  fileInputRef.value?.click()
}

async function onFilesSelected(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  if (!target.files || !props.sessionId) return

  for (let i = 0; i < target.files.length; i++) {
    const file = target.files[i]
    const localPath = window.electron.webUtils.getPathForFile(file)
    const remotePath = `${currentPath.value.replace(/\/$/, '')}/${file.name}`
    try {
      await window.electron.ipcRenderer.invoke(
        'mt::terminal:sftp-upload',
        props.sessionId,
        localPath,
        remotePath
      )
      ElMessage.success(`上传成功: ${file.name}`)
    } catch (e: any) {
      ElMessage.error(`上传失败 ${file.name}: ${e.message}`)
    }
  }
  target.value = ''
  refreshDir()
}

async function handleDrop(e: DragEvent): Promise<void> {
  if (!props.sessionId || !e.dataTransfer?.files?.length) return
  const files = e.dataTransfer.files

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const localPath = window.electron.webUtils.getPathForFile(file)
    const remotePath = `${currentPath.value.replace(/\/$/, '')}/${file.name}`
    try {
      await window.electron.ipcRenderer.invoke(
        'mt::terminal:sftp-upload',
        props.sessionId,
        localPath,
        remotePath
      )
      ElMessage.success(`上传成功: ${file.name}`)
    } catch (err: any) {
      ElMessage.error(`上传失败: ${err.message}`)
    }
  }
  refreshDir()
}

async function downloadFile(item: ISftpFileItem): Promise<void> {
  if (!props.sessionId) return
  const downloadDir = window.electron.paths?.userData || '/tmp'
  const localPath = `${downloadDir}/${item.name}`

  try {
    ElMessage.info(`开始下载文件: ${item.name}`)
    await window.electron.ipcRenderer.invoke(
      'mt::terminal:sftp-download',
      props.sessionId,
      item.path,
      localPath
    )
    ElMessage.success(`下载完成: ${item.name}`)
  } catch (err: any) {
    ElMessage.error(`下载失败: ${err.message}`)
  }
}

async function openContextMenu(item: ISftpFileItem, _e: MouseEvent): Promise<void> {
  selectedItem.value = item
  try {
    const action = await ElMessageBox.confirm(
      `请选择对 "${item.name}" 的操作`,
      '文件操作',
      {
        distinguishCancelAndClose: true,
        confirmButtonText: item.isDirectory ? '删除目录' : '下载文件',
        cancelButtonText: '删除',
        type: 'info'
      }
    )
    if (action === 'confirm' && !item.isDirectory) {
      downloadFile(item)
    }
  } catch (action) {
    if (action === 'cancel' && props.sessionId) {
      try {
        await window.electron.ipcRenderer.invoke(
          'mt::terminal:sftp-delete',
          props.sessionId,
          item.path,
          item.isDirectory
        )
        ElMessage.success(`已删除: ${item.name}`)
        refreshDir()
      } catch (err: any) {
        ElMessage.error(`删除失败: ${err.message}`)
      }
    }
  }
}

function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i]
}

function formatDate(timestamp: number): string {
  if (!timestamp) return ''
  const d = new Date(timestamp * 1000)
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

watch(
  () => props.sessionId,
  (newSessionId) => {
    if (newSessionId && props.visible) {
      loadDir('/root').catch(() => loadDir('/home'))
    }
  },
  { immediate: true }
)

watch(
  () => props.visible,
  (isOpen) => {
    if (isOpen && props.sessionId && fileList.value.length === 0) {
      loadDir('/root').catch(() => loadDir('/home'))
    }
  }
)
</script>

<style scoped>
.sftp-drawer-container {
  width: 340px;
  height: 100%;
  background: var(--sideBarBgColor, #1e1e1e);
  border-left: 1px solid var(--itemBgColor, #333);
  display: flex;
  flex-direction: column;
  user-select: none;
  font-size: 12px;
  transition: width 0.2s ease;
}

.sftp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--itemBgColor, #333);
}

.sftp-title-area {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--editorColor, #e0e0e0);
}

.sftp-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.sftp-path-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--itemBgColor, #2a2a2a);
}

.sftp-file-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.sftp-file-row {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  cursor: pointer;
  color: var(--editorColor, #ccc);
  transition: background 0.15s ease;
}

.sftp-file-row:hover {
  background: var(--sideBarItemHoverBgColor, rgba(255, 255, 255, 0.06));
}

.sftp-file-row.active {
  background: var(--themeColor20, rgba(64, 158, 255, 0.2));
}

.file-icon {
  margin-right: 8px;
  font-size: 15px;
}

.file-icon.folder {
  color: #e6a23c;
}

.file-icon.file {
  color: #909399;
}

.file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  width: 60px;
  text-align: right;
  color: var(--iconColor, #888);
  font-size: 11px;
}

.file-time {
  width: 90px;
  text-align: right;
  color: var(--iconColor, #666);
  font-size: 10px;
  margin-left: 6px;
}

.sftp-empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--iconColor, #888);
  font-size: 12px;
}

.sftp-transfers-panel {
  padding: 8px 12px;
  border-top: 1px solid var(--itemBgColor, #333);
  background: rgba(0, 0, 0, 0.15);
}

.transfers-header {
  font-weight: 600;
  margin-bottom: 6px;
  color: var(--editorColor, #aaa);
}

.transfer-row {
  margin-bottom: 6px;
}

.transfer-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 2px;
  font-size: 11px;
}
</style>
