<template>
  <div
    v-show="visible"
    class="sftp-drawer-container"
    :class="{ open: visible }"
    @dragover.prevent
    @drop.prevent="handleDrop"
  >
    <!-- Header -->
    <div class="sftp-header">
      <div class="sftp-title-area">
        <el-icon><FolderOpened /></el-icon>
        <span class="sftp-title">{{ t('terminal.sftp.title') }}</span>
      </div>
      <div class="sftp-header-actions">
        <el-button size="small" :icon="Refresh" circle :title="t('terminal.sftp.refresh')" @click="refreshDir" />
        <el-button size="small" :icon="FolderAdd" circle :title="t('terminal.sftp.newFolder')" @click="promptNewFolder" />
        <!-- 新建文件 (带常用格式下拉选择) -->
        <el-dropdown trigger="hover" placement="bottom-end">
          <el-button
            size="small"
            :icon="DocumentAdd"
            circle
            :title="t('terminal.sftp.newFile')"
            @click="promptNewFileCustom()"
          />
          <template #dropdown>
            <el-dropdown-menu class="sftp-header-dropdown-menu">
              <el-dropdown-item
                v-for="tpl in commonFileTemplates"
                :key="tpl.ext"
                @click="promptNewFileWithTemplate(tpl)"
              >
                <div class="header-tpl-row">
                  <span class="tpl-label">{{ tpl.label }}</span>
                  <span class="tpl-ext">.{{ tpl.ext }}</span>
                </div>
              </el-dropdown-item>
              <el-dropdown-item divided @click="promptNewFileCustom()">
                <div class="header-tpl-row">
                  <span>{{ t('terminal.sftp.customFile') }}</span>
                </div>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button size="small" :icon="Upload" circle :title="t('terminal.sftp.upload')" @click="triggerUpload" />
        <el-button size="small" :icon="Close" circle :title="t('terminal.sftp.close')" @click="$emit('close')" />
      </div>
    </div>

    <!-- Breadcrumb Path Bar -->
    <div class="sftp-path-bar">
      <el-button size="small" :icon="ArrowLeft" :disabled="pathHistory.length <= 1" circle :title="t('terminal.sftp.back')" @click="navigateBack" />
      <el-input
        v-model="currentPath"
        size="small"
        :placeholder="t('terminal.sftp.pathPlaceholder')"
        @keyup.enter="loadDir(currentPath)"
      >
        <template #prefix>
          <el-icon><Location /></el-icon>
        </template>
      </el-input>
    </div>

    <!-- File List -->
    <div v-loading="loading" class="sftp-file-list" @contextmenu.prevent="handleListContextMenu($event)">
      <div
        v-if="currentPath !== '/' && currentPath !== ''"
        class="sftp-file-row sftp-up-row"
        @dblclick="navigateParent"
      >
        <el-icon class="file-icon folder"><Folder /></el-icon>
        <span class="file-name">.. ({{ t('terminal.sftp.parentDir') }})</span>
      </div>

      <div
        v-for="item in fileList"
        :key="item.path"
        class="sftp-file-row"
        :class="{ active: selectedItem?.path === item.path }"
        @click="selectedItem = item"
        @dblclick="handleItemDblClick(item)"
        @contextmenu.stop.prevent="openContextMenu(item, $event)"
      >
        <el-icon class="file-icon" :class="item.isDirectory ? 'folder' : 'file'">
          <Folder v-if="item.isDirectory" />
          <Document v-else />
        </el-icon>
        <span class="file-name" :title="item.name">{{ item.name }}</span>
        <span class="file-size">{{ item.isDirectory ? '-' : formatSize(item.size) }}</span>
        <span class="file-time">{{ formatDate(item.modifyTime) }}</span>
      </div>

      <div v-if="sessionStatus === 'connecting'" class="sftp-empty">
        <el-icon class="is-loading" :size="24" style="margin-bottom: 8px"><Loading /></el-icon>
        <div>{{ t('terminal.sftp.connecting') }}</div>
        <div style="font-size: 11px; opacity: 0.7; margin-top: 4px">{{ t('terminal.sftp.waitAuth') }}</div>
      </div>
      <div v-else-if="fileList.length === 0 && !loading" class="sftp-empty">
        {{ t('terminal.sftp.emptyDir') }}
      </div>
    </div>

    <!-- Transfers Progress Bar -->
    <div v-if="transfers.length > 0" class="sftp-transfers-panel">
      <div class="transfers-header">
        <span>{{ t('terminal.sftp.transferTasks') }} ({{ transfers.length }})</span>
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

    <!-- Right-click Floating Context Menu -->
    <div
      v-if="contextMenu.visible"
      class="sftp-context-menu"
      :style="{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }"
      @click.stop
    >
      <!-- Case 1: Empty area / Blank space context menu -->
      <template v-if="!contextMenu.item">
        <!-- 上传到当前目录 -->
        <div class="context-menu-item" @click="handleContextUploadCurrent" @mouseenter="onOtherMenuItemEnter">
          <el-icon><Upload /></el-icon>
          <span>{{ t('terminal.sftp.uploadToDir') }}</span>
        </div>

        <!-- 新建文件 (带常用文本/配置格式子菜单) -->
        <div
          class="context-menu-item has-submenu"
          @mouseenter="handleSubmenuMouseEnter($event)"
          @mouseleave="handleSubmenuMouseLeave"
          @click.stop="toggleSubmenu($event)"
        >
          <div class="menu-item-inner">
            <el-icon><DocumentAdd /></el-icon>
            <span>{{ t('terminal.sftp.newFile') }}</span>
          </div>
          <el-icon class="submenu-arrow"><ArrowRight /></el-icon>
          <div
            v-show="showSubmenu"
            class="sftp-submenu"
            :class="`placement-${submenuPos.placement}`"
            :style="{
              position: 'fixed',
              top: `${submenuPos.y}px`,
              left: `${submenuPos.x}px`,
              maxHeight: `${submenuPos.maxHeight}px`
            }"
            @mouseenter="handleSubmenuMouseEnter"
            @mouseleave="handleSubmenuMouseLeave"
          >
            <div
              v-for="tpl in commonFileTemplates"
              :key="tpl.ext"
              class="submenu-item"
              @click.stop="promptNewFileWithTemplate(tpl)"
            >
              <span class="tpl-label">{{ tpl.label }}</span>
              <span class="tpl-ext">.{{ tpl.ext }}</span>
            </div>
            <div class="context-menu-divider" />
            <div class="submenu-item" @click.stop="promptNewFileCustom()">
              <span>{{ t('terminal.sftp.customFile') }}</span>
            </div>
          </div>
        </div>

        <!-- 新建文件夹 -->
        <div class="context-menu-item" @click="promptNewFolder" @mouseenter="onOtherMenuItemEnter">
          <el-icon><FolderAdd /></el-icon>
          <span>{{ t('terminal.sftp.newFolder') }}</span>
        </div>

        <div class="context-menu-divider" />

        <!-- 刷新 -->
        <div class="context-menu-item" @click="handleContextRefresh" @mouseenter="onOtherMenuItemEnter">
          <el-icon><Refresh /></el-icon>
          <span>{{ t('terminal.sftp.refresh') }}</span>
        </div>
      </template>

      <!-- Case 2: Folder item context menu -->
      <template v-else-if="contextMenu.item.isDirectory">
        <!-- 打开目录 -->
        <div class="context-menu-item" @click="handleContextOpen(contextMenu.item)" @mouseenter="onOtherMenuItemEnter">
          <el-icon><FolderOpened /></el-icon>
          <span>{{ t('terminal.sftp.openDir') }}</span>
        </div>
        <!-- 上传到当前目录 -->
        <div class="context-menu-item" @click="handleContextUploadToDir(contextMenu.item)" @mouseenter="onOtherMenuItemEnter">
          <el-icon><Upload /></el-icon>
          <span>{{ t('terminal.sftp.uploadToDir') }}</span>
        </div>
        <!-- 新建文件 -->
        <div
          class="context-menu-item has-submenu"
          @mouseenter="handleSubmenuMouseEnter($event)"
          @mouseleave="handleSubmenuMouseLeave"
          @click.stop="toggleSubmenu($event)"
        >
          <div class="menu-item-inner">
            <el-icon><DocumentAdd /></el-icon>
            <span>{{ t('terminal.sftp.newFile') }}</span>
          </div>
          <el-icon class="submenu-arrow"><ArrowRight /></el-icon>
          <div
            v-show="showSubmenu"
            class="sftp-submenu"
            :class="`placement-${submenuPos.placement}`"
            :style="{
              position: 'fixed',
              top: `${submenuPos.y}px`,
              left: `${submenuPos.x}px`,
              maxHeight: `${submenuPos.maxHeight}px`
            }"
            @mouseenter="handleSubmenuMouseEnter"
            @mouseleave="handleSubmenuMouseLeave"
          >
            <div
              v-for="tpl in commonFileTemplates"
              :key="tpl.ext"
              class="submenu-item"
              @click.stop="promptNewFileWithTemplate(tpl, contextMenu.item)"
            >
              <span class="tpl-label">{{ tpl.label }}</span>
              <span class="tpl-ext">.{{ tpl.ext }}</span>
            </div>
            <div class="context-menu-divider" />
            <div class="submenu-item" @click.stop="promptNewFileCustom(contextMenu.item)">
              <span>{{ t('terminal.sftp.customFile') }}</span>
            </div>
          </div>
        </div>
        <!-- 重命名 -->
        <div class="context-menu-item" @click="handleContextRename(contextMenu.item)" @mouseenter="onOtherMenuItemEnter">
          <el-icon><EditPen /></el-icon>
          <span>{{ t('terminal.sftp.rename') }}</span>
        </div>
        <div class="context-menu-divider" />
        <!-- 删除目录 -->
        <div class="context-menu-item danger" @click="handleContextDelete(contextMenu.item)" @mouseenter="onOtherMenuItemEnter">
          <el-icon><Delete /></el-icon>
          <span>{{ t('terminal.sftp.deleteDir') }}</span>
        </div>
      </template>

      <!-- Case 3: File item context menu -->
      <template v-else>
        <!-- 下载文件 -->
        <div class="context-menu-item" @click="handleContextDownload(contextMenu.item)" @mouseenter="onOtherMenuItemEnter">
          <el-icon><Download /></el-icon>
          <span>{{ t('terminal.sftp.downloadFile') }}</span>
        </div>
        <!-- 编辑（仅限文本类、配置类文件） -->
        <div
          v-if="isEditableTextFile(contextMenu.item.name)"
          class="context-menu-item"
          @click="handleContextEdit(contextMenu.item)"
          @mouseenter="onOtherMenuItemEnter"
        >
          <el-icon><Edit /></el-icon>
          <span>{{ t('terminal.sftp.editFile') }}</span>
        </div>
        <!-- 新建文件 -->
        <div
          class="context-menu-item has-submenu"
          @mouseenter="handleSubmenuMouseEnter($event)"
          @mouseleave="handleSubmenuMouseLeave"
          @click.stop="toggleSubmenu($event)"
        >
          <div class="menu-item-inner">
            <el-icon><DocumentAdd /></el-icon>
            <span>{{ t('terminal.sftp.newFile') }}</span>
          </div>
          <el-icon class="submenu-arrow"><ArrowRight /></el-icon>
          <div
            v-show="showSubmenu"
            class="sftp-submenu"
            :class="`placement-${submenuPos.placement}`"
            :style="{
              position: 'fixed',
              top: `${submenuPos.y}px`,
              left: `${submenuPos.x}px`,
              maxHeight: `${submenuPos.maxHeight}px`
            }"
            @mouseenter="handleSubmenuMouseEnter"
            @mouseleave="handleSubmenuMouseLeave"
          >
            <div
              v-for="tpl in commonFileTemplates"
              :key="tpl.ext"
              class="submenu-item"
              @click.stop="promptNewFileWithTemplate(tpl)"
            >
              <span class="tpl-label">{{ tpl.label }}</span>
              <span class="tpl-ext">.{{ tpl.ext }}</span>
            </div>
            <div class="context-menu-divider" />
            <div class="submenu-item" @click.stop="promptNewFileCustom()">
              <span>{{ t('terminal.sftp.customFile') }}</span>
            </div>
          </div>
        </div>
        <!-- 重命名 -->
        <div class="context-menu-item" @click="handleContextRename(contextMenu.item)" @mouseenter="onOtherMenuItemEnter">
          <el-icon><EditPen /></el-icon>
          <span>{{ t('terminal.sftp.rename') }}</span>
        </div>
        <!-- 上传到当前目录 -->
        <div class="context-menu-item" @click="handleContextUploadCurrent" @mouseenter="onOtherMenuItemEnter">
          <el-icon><Upload /></el-icon>
          <span>{{ t('terminal.sftp.uploadToDir') }}</span>
        </div>
        <div class="context-menu-divider" />
        <!-- 删除文件 -->
        <div class="context-menu-item danger" @click="handleContextDelete(contextMenu.item)" @mouseenter="onOtherMenuItemEnter">
          <el-icon><Delete /></el-icon>
          <span>{{ t('terminal.sftp.deleteFile') }}</span>
        </div>
      </template>
    </div>

    <!-- Remote File Editor Dialog -->
    <el-dialog
      v-model="editorDialog.visible"
      :title="t('terminal.sftp.editTitle', { name: editorDialog.name })"
      width="72%"
      top="7vh"
      destroy-on-close
      append-to-body
      class="sftp-editor-dialog"
      :before-close="handleBeforeCloseEditor"
    >
      <div v-loading="editorDialog.loading" class="sftp-editor-body">
        <el-input
          v-model="editorDialog.content"
          type="textarea"
          :rows="22"
          class="sftp-code-editor"
          spellcheck="false"
          placeholder=""
          @keydown.ctrl.s.prevent="handleSaveEditor(true)"
          @keydown.meta.s.prevent="handleSaveEditor(true)"
        />
      </div>
      <template #footer>
        <span v-if="editorDialog.saving" class="editor-saving-badge">
          <el-icon class="is-loading"><Loading /></el-icon> {{ t('terminal.sftp.saving') }}
        </span>
        <span v-else-if="editorDialog.content !== editorDialog.originalContent" class="editor-dirty-badge">
          * {{ t('terminal.sftp.unsavedChanges') }} (Ctrl+S / ⌘+S)
        </span>
        <span v-else class="editor-saved-badge">
          <el-icon><Check /></el-icon> {{ t('terminal.sftp.saved') }}
        </span>
        <el-button @click="editorDialog.visible = false">{{ t('terminal.sftp.cancel') }}</el-button>
        <el-button type="primary" :loading="editorDialog.saving" @click="handleSaveEditor(true)">
          {{ t('terminal.sftp.save') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- Hidden file input for upload -->
    <input ref="fileInputRef" type="file" multiple style="display: none" @change="onFilesSelected" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import {
  FolderOpened,
  Folder,
  FolderAdd,
  Document,
  DocumentAdd,
  Refresh,
  Upload,
  Download,
  Delete,
  Edit,
  EditPen,
  Close,
  ArrowLeft,
  ArrowRight,
  Location,
  Loading,
  Check
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { t } from '@/i18n'
import { useTerminalStore } from '@/store/terminal'
import type { ISftpFileItem, ISftpTransferProgress } from '@shared/types/terminal'

const props = defineProps<{
  visible: boolean
  sessionId: string | null
  sessionStatus?: string
}>()

defineEmits<{
  (e: 'close'): void
}>()

const terminalStore = useTerminalStore()

const currentPath = ref<string>('/root')
const pathHistory = ref<string[]>(['/root'])
const fileList = ref<ISftpFileItem[]>([])
const loading = ref(false)
const selectedItem = ref<ISftpFileItem | null>(null)
const showSubmenu = ref(false)

const commonFileTemplates = [
  { label: 'Text', ext: 'txt', defaultName: 'new_file.txt' },
  { label: 'YAML', ext: 'yml', defaultName: 'config.yml' },
  { label: 'YAML', ext: 'yaml', defaultName: 'config.yaml' },
  { label: 'XML', ext: 'xml', defaultName: 'data.xml' },
  { label: 'JSON', ext: 'json', defaultName: 'config.json' },
  { label: 'Markdown', ext: 'md', defaultName: 'README.md' },
  { label: 'Shell', ext: 'sh', defaultName: 'script.sh' },
  { label: 'Config', ext: 'conf', defaultName: 'app.conf' },
  { label: 'Env', ext: 'env', defaultName: '.env' },
  { label: 'SQL', ext: 'sql', defaultName: 'query.sql' },
  { label: 'Log', ext: 'log', defaultName: 'app.log' },
  { label: 'Python', ext: 'py', defaultName: 'main.py' }
]
const contextMenu = ref<{
  visible: boolean
  x: number
  y: number
  item: ISftpFileItem | null
  submenuPlacement: 'left' | 'right'
  submenuVerticalPlacement: 'top' | 'bottom'
}>({
  visible: false,
  x: 0,
  y: 0,
  item: null,
  submenuPlacement: 'right',
  submenuVerticalPlacement: 'top'
})
const transfers = computed(() => terminalStore.sftpTransfers)
const fileInputRef = ref<HTMLInputElement | null>(null)
const targetUploadDir = ref<string>('')

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'json', 'yml', 'yaml', 'ini', 'conf', 'cnf', 'cfg', 'sh', 'bash', 'zsh',
  'env', 'xml', 'log', 'js', 'ts', 'jsx', 'tsx', 'py', 'c', 'h', 'cpp', 'hpp',
  'css', 'scss', 'less', 'html', 'vue', 'toml', 'properties', 'sql', 'gitignore',
  'dockerfile', 'service', 'rc', 'config'
])

function isEditableTextFile(name: string): boolean {
  if (!name) return false
  const lower = name.toLowerCase()
  if (lower === 'dockerfile' || lower.startsWith('.env') || lower.startsWith('.git') || lower.endsWith('rc')) {
    return true
  }
  const ext = lower.split('.').pop() || ''
  return TEXT_EXTENSIONS.has(ext)
}

const editorDialog = ref<{
  visible: boolean
  loading: boolean
  saving: boolean
  path: string
  name: string
  content: string
  originalContent: string
}>({
  visible: false,
  loading: false,
  saving: false,
  path: '',
  name: '',
  content: '',
  originalContent: ''
})

async function loadDir(path: string, silentError = false): Promise<void> {
  if (!props.sessionId) return
  if (props.sessionStatus && props.sessionStatus !== 'connected') return
  loading.value = true
  try {
    const list: any = await window.electron.ipcRenderer.invoke(
      'mt::terminal:sftp-list',
      props.sessionId,
      path
    )
    if (Array.isArray(list)) {
      fileList.value = list
      currentPath.value = list.currentPath || path
    }
  } catch (err: any) {
    if (!silentError) {
      ElMessage.error(t('terminal.sftp.loadFailed', { error: err.message || err }))
    }
    throw err
  } finally {
    loading.value = false
  }
}

async function refreshDir(): Promise<void> {
  await loadDir(currentPath.value)
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
  closeContextMenu()
  currentPath.value = path
  pathHistory.value.push(path)
  loadDir(path)
}

function handleItemDblClick(item: ISftpFileItem): void {
  closeContextMenu()
  if (item.isDirectory) {
    goToPath(item.path)
  } else {
    // Download
    downloadFile(item)
  }
}

async function promptNewFolder(): Promise<void> {
  if (!props.sessionId) return
  closeContextMenu()
  try {
    const { value: folderName } = await ElMessageBox.prompt(
      t('terminal.sftp.newFolderPrompt'),
      t('terminal.sftp.newFolder'),
      {
        confirmButtonText: t('terminal.sftp.create'),
        cancelButtonText: t('terminal.sftp.cancel'),
        inputValidator: (val) => {
          if (!val || !val.trim()) {
            return t('terminal.sftp.newFolderPrompt')
          }
          return true
        }
      }
    )
    if (folderName && folderName.trim()) {
      const fullPath = `${currentPath.value.replace(/\/$/, '')}/${folderName.trim()}`
      await window.electron.ipcRenderer.invoke('mt::terminal:sftp-mkdir', props.sessionId, fullPath)
      ElMessage.success(t('terminal.sftp.createSuccess'))
      refreshDir()
    }
  } catch (err: any) {
    if (err && err !== 'cancel' && err !== 'close') {
      ElMessage.error(t('terminal.sftp.createFailed', { error: err?.message || err }))
    }
  }
}

function triggerUpload(): void {
  closeContextMenu()
  targetUploadDir.value = ''
  fileInputRef.value?.click()
}

function handleContextUploadToDir(dirItem: ISftpFileItem): void {
  closeContextMenu()
  targetUploadDir.value = dirItem.path
  fileInputRef.value?.click()
}

function handleContextUploadCurrent(): void {
  closeContextMenu()
  targetUploadDir.value = currentPath.value
  fileInputRef.value?.click()
}

async function onFilesSelected(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  if (!target.files || !props.sessionId) return

  const baseDir = targetUploadDir.value || currentPath.value
  targetUploadDir.value = ''

  for (let i = 0; i < target.files.length; i++) {
    const file = target.files[i]
    const localPath = window.electron.webUtils.getPathForFile(file)
    const remotePath = `${baseDir.replace(/\/$/, '')}/${file.name}`
    try {
      await window.electron.ipcRenderer.invoke(
        'mt::terminal:sftp-upload',
        props.sessionId,
        localPath,
        remotePath
      )
      ElMessage.success(t('terminal.sftp.uploadSuccess', { name: file.name }))
    } catch (e: any) {
      ElMessage.error(t('terminal.sftp.uploadFailed', { name: file.name, error: e.message || e }))
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
      ElMessage.success(t('terminal.sftp.uploadSuccess', { name: file.name }))
    } catch (err: any) {
      ElMessage.error(t('terminal.sftp.uploadFailed', { name: file.name, error: err.message || err }))
    }
  }
  refreshDir()
}

async function downloadFile(item: ISftpFileItem): Promise<void> {
  if (!props.sessionId || item.isDirectory) return

  try {
    ElMessage.info(t('terminal.sftp.downloading', { name: item.name }))
    const res: any = await window.electron.ipcRenderer.invoke(
      'mt::terminal:sftp-download',
      props.sessionId,
      item.path
    )
    if (res?.canceled) {
      return
    }
    ElMessage.success(t('terminal.sftp.downloadComplete', { name: item.name }))
  } catch (err: any) {
    ElMessage.error(t('terminal.sftp.downloadFailed', { error: err.message || err }))
  }
}

const submenuPos = ref<{
  x: number
  y: number
  maxHeight: number
  placement: 'left' | 'right'
}>({
  x: 0,
  y: 0,
  maxHeight: 280,
  placement: 'right'
})

let lastSubmenuTarget: HTMLElement | null = null
let submenuHideTimer: ReturnType<typeof setTimeout> | null = null

function updateSubmenuPosition(targetEl?: HTMLElement | null): void {
  const el = targetEl || lastSubmenuTarget
  if (!el) return
  lastSubmenuTarget = el

  const rect = el.getBoundingClientRect()
  const subWidth = 172
  const padding = 8
  const fullContentHeight = 340
  const maxAvailableHeight = window.innerHeight - padding * 2
  const desiredHeight = Math.min(fullContentHeight, maxAvailableHeight)

  // 1. 水平位置（左右动态防遮挡）
  let x = rect.right - 2
  let placement: 'left' | 'right' = 'right'

  // 如果右侧空间不足（被 DevTools、窗口边缘遮挡），翻转到左侧展开
  if (rect.right + subWidth > window.innerWidth - padding) {
    x = rect.left - subWidth + 2
    placement = 'left'
  }
  if (x < padding) {
    x = padding
  }

  // 2. 垂直位置（上下动态防遮挡）
  let y = rect.top - 4
  let maxHeight = desiredHeight

  // 如果下方超出屏幕/窗口底边，向上推移对齐
  if (y + desiredHeight > window.innerHeight - padding) {
    y = Math.max(padding, window.innerHeight - desiredHeight - padding)
    maxHeight = Math.min(desiredHeight, window.innerHeight - y - padding)
  }

  submenuPos.value = {
    x,
    y,
    maxHeight,
    placement
  }
}

function handleSubmenuMouseEnter(e?: MouseEvent): void {
  if (submenuHideTimer) {
    clearTimeout(submenuHideTimer)
    submenuHideTimer = null
  }
  if (e) {
    const target = (e.currentTarget || e.target) as HTMLElement | null
    if (target) {
      const parentRow = target.closest('.has-submenu') as HTMLElement | null
      updateSubmenuPosition(parentRow || target)
    }
  } else if (lastSubmenuTarget) {
    updateSubmenuPosition(lastSubmenuTarget)
  }
  showSubmenu.value = true
}

function handleSubmenuMouseLeave(): void {
  if (submenuHideTimer) {
    clearTimeout(submenuHideTimer)
  }
  submenuHideTimer = setTimeout(() => {
    showSubmenu.value = false
    submenuHideTimer = null
  }, 300)
}

function onOtherMenuItemEnter(): void {
  if (submenuHideTimer) {
    clearTimeout(submenuHideTimer)
    submenuHideTimer = null
  }
  showSubmenu.value = false
}

function toggleSubmenu(e?: MouseEvent): void {
  if (submenuHideTimer) {
    clearTimeout(submenuHideTimer)
    submenuHideTimer = null
  }
  if (!showSubmenu.value && e) {
    const target = (e.currentTarget || e.target) as HTMLElement | null
    if (target) {
      const parentRow = target.closest('.has-submenu') as HTMLElement | null
      updateSubmenuPosition(parentRow || target)
    }
  }
  showSubmenu.value = !showSubmenu.value
}

function closeContextMenu(): void {
  if (submenuHideTimer) {
    clearTimeout(submenuHideTimer)
    submenuHideTimer = null
  }
  contextMenu.value.visible = false
  contextMenu.value.item = null
  showSubmenu.value = false
  lastSubmenuTarget = null
}

function handleListContextMenu(e: MouseEvent): void {
  const target = e.target as HTMLElement
  if (target.closest('.sftp-file-row')) {
    return
  }
  openEmptyContextMenu(e)
}

function openEmptyContextMenu(e: MouseEvent): void {
  selectedItem.value = null
  showSubmenu.value = false
  lastSubmenuTarget = null
  if (submenuHideTimer) {
    clearTimeout(submenuHideTimer)
    submenuHideTimer = null
  }
  const menuWidth = 160
  const menuHeight = 160

  let x = e.clientX
  let y = e.clientY
  if (x + menuWidth > window.innerWidth) {
    x = Math.max(8, window.innerWidth - menuWidth - 8)
  }
  if (y + menuHeight > window.innerHeight) {
    y = Math.max(8, window.innerHeight - menuHeight - 8)
  }

  contextMenu.value = {
    visible: true,
    x,
    y,
    item: null,
    submenuPlacement: 'right',
    submenuVerticalPlacement: 'top'
  }
}

function openContextMenu(item: ISftpFileItem, e: MouseEvent): void {
  selectedItem.value = item
  showSubmenu.value = false
  lastSubmenuTarget = null
  if (submenuHideTimer) {
    clearTimeout(submenuHideTimer)
    submenuHideTimer = null
  }
  const menuWidth = 150
  const menuHeight = item.isDirectory ? 180 : 220

  let x = e.clientX
  let y = e.clientY
  if (x + menuWidth > window.innerWidth) {
    x = Math.max(8, window.innerWidth - menuWidth - 8)
  }
  if (y + menuHeight > window.innerHeight) {
    y = Math.max(8, window.innerHeight - menuHeight - 8)
  }

  contextMenu.value = {
    visible: true,
    x,
    y,
    item,
    submenuPlacement: 'right',
    submenuVerticalPlacement: 'top'
  }
}

function handleContextOpen(item: ISftpFileItem): void {
  closeContextMenu()
  goToPath(item.path)
}

function handleContextDownload(item: ISftpFileItem): void {
  closeContextMenu()
  downloadFile(item)
}

function handleContextRefresh(): void {
  closeContextMenu()
  refreshDir()
}

async function createFile(dirPath: string, fileName: string): Promise<void> {
  if (!props.sessionId || !fileName || !fileName.trim()) return
  const fullPath = `${dirPath.replace(/\/$/, '')}/${fileName.trim()}`
  try {
    await window.electron.ipcRenderer.invoke(
      'mt::terminal:sftp-write',
      props.sessionId,
      fullPath,
      ''
    )
    ElMessage.success(t('terminal.sftp.createFileSuccess'))
    if (dirPath !== currentPath.value) {
      await goToPath(dirPath)
    } else {
      await refreshDir()
    }
    const found = fileList.value.find((f) => f.name === fileName.trim())
    if (found) {
      selectedItem.value = found
    }
  } catch (err: any) {
    ElMessage.error(t('terminal.sftp.createFileFailed', { error: err?.message || err }))
  }
}

async function promptNewFileWithTemplate(tpl: { label: string; ext: string; defaultName: string }, inFolder?: ISftpFileItem | null): Promise<void> {
  closeContextMenu()
  if (!props.sessionId) return

  const targetDir = inFolder?.isDirectory ? inFolder.path : currentPath.value

  try {
    const { value: fileName } = await ElMessageBox.prompt(
      t('terminal.sftp.newFilePrompt'),
      `${t('terminal.sftp.newFile')} (${tpl.label})`,
      {
        inputValue: tpl.defaultName,
        confirmButtonText: t('terminal.sftp.create'),
        cancelButtonText: t('terminal.sftp.cancel'),
        inputValidator: (val) => {
          if (!val || !val.trim()) {
            return t('terminal.sftp.nameCannotBeEmpty')
          }
          if (/[/\\:\*\?"<>\|]/.test(val)) {
            return t('terminal.sftp.invalidName')
          }
          return true
        }
      }
    )

    if (fileName && fileName.trim()) {
      await createFile(targetDir, fileName.trim())
    }
  } catch {
    // cancelled
  }
}

async function promptNewFileCustom(inFolder?: ISftpFileItem | null): Promise<void> {
  closeContextMenu()
  if (!props.sessionId) return

  const targetDir = inFolder?.isDirectory ? inFolder.path : currentPath.value

  try {
    const { value: fileName } = await ElMessageBox.prompt(
      t('terminal.sftp.newFilePrompt'),
      t('terminal.sftp.newFile'),
      {
        inputValue: 'new_file.txt',
        confirmButtonText: t('terminal.sftp.create'),
        cancelButtonText: t('terminal.sftp.cancel'),
        inputValidator: (val) => {
          if (!val || !val.trim()) {
            return t('terminal.sftp.nameCannotBeEmpty')
          }
          if (/[/\\:\*\?"<>\|]/.test(val)) {
            return t('terminal.sftp.invalidName')
          }
          return true
        }
      }
    )

    if (fileName && fileName.trim()) {
      await createFile(targetDir, fileName.trim())
    }
  } catch {
    // cancelled
  }
}

async function handleContextRename(item: ISftpFileItem): Promise<void> {
  closeContextMenu()
  if (!props.sessionId) return

  try {
    const { value: newName } = await ElMessageBox.prompt(
      t('terminal.sftp.renamePrompt'),
      t('terminal.sftp.rename'),
      {
        inputValue: item.name,
        confirmButtonText: t('common.ok'),
        cancelButtonText: t('terminal.sftp.cancel'),
        inputValidator: (val) => {
          if (!val || !val.trim()) {
            return t('terminal.sftp.nameCannotBeEmpty')
          }
          if (val.trim() === item.name) {
            return t('terminal.sftp.nameUnchanged')
          }
          if (/[/\\:\*\?"<>\|]/.test(val)) {
            return t('terminal.sftp.invalidName')
          }
          return true
        }
      }
    )

    if (newName && newName.trim() && newName.trim() !== item.name) {
      const parentDir = item.path.substring(0, item.path.lastIndexOf('/')) || '/'
      const newPath = `${parentDir.replace(/\/$/, '')}/${newName.trim()}`
      await window.electron.ipcRenderer.invoke(
        'mt::terminal:sftp-rename',
        props.sessionId,
        item.path,
        newPath
      )
      ElMessage.success(t('terminal.sftp.renameSuccess'))
      refreshDir()
    }
  } catch (err: any) {
    if (err && err !== 'cancel' && err !== 'close') {
      ElMessage.error(t('terminal.sftp.renameFailed', { error: err?.message || err }))
    }
  }
}

async function handleContextEdit(item: ISftpFileItem): Promise<void> {
  closeContextMenu()
  if (!props.sessionId || item.isDirectory) return

  editorDialog.value = {
    visible: true,
    loading: true,
    saving: false,
    path: item.path,
    name: item.name,
    content: '',
    originalContent: ''
  }

  try {
    const content = await window.electron.ipcRenderer.invoke(
      'mt::terminal:sftp-read',
      props.sessionId,
      item.path
    )
    const normalized = (content || '').replace(/\r\n/g, '\n')
    editorDialog.value.content = normalized
    editorDialog.value.originalContent = normalized
  } catch (err: any) {
    ElMessage.error(t('terminal.sftp.loadFailed', { error: err?.message || err }))
    editorDialog.value.visible = false
  } finally {
    editorDialog.value.loading = false
  }
}

async function handleSaveEditor(closeAfterSave = true): Promise<void> {
  if (!props.sessionId || !editorDialog.value.path || editorDialog.value.saving) return

  // 如果内容未发生任何改动且要求关闭，直接关闭窗体
  if (editorDialog.value.content === editorDialog.value.originalContent) {
    if (closeAfterSave) {
      editorDialog.value.visible = false
    }
    return
  }

  editorDialog.value.saving = true
  try {
    await window.electron.ipcRenderer.invoke(
      'mt::terminal:sftp-write',
      props.sessionId,
      editorDialog.value.path,
      editorDialog.value.content
    )
    editorDialog.value.originalContent = editorDialog.value.content
    ElMessage.success(t('terminal.sftp.saveSuccess'))
    await refreshDir()
    if (closeAfterSave) {
      editorDialog.value.visible = false
    }
  } catch (err: any) {
    ElMessage.error(t('terminal.sftp.saveFailed', { error: err?.message || err }))
  } finally {
    editorDialog.value.saving = false
  }
}

function handleBeforeCloseEditor(done: () => void): void {
  if (editorDialog.value.content !== editorDialog.value.originalContent) {
    ElMessageBox.confirm(
      t('terminal.sftp.unsavedCloseConfirm'),
      t('terminal.sftp.editFile'),
      {
        confirmButtonText: t('terminal.sftp.discardChanges'),
        cancelButtonText: t('terminal.sftp.continueEditing'),
        type: 'warning'
      }
    ).then(() => {
      done()
    }).catch(() => {})
  } else {
    done()
  }
}

async function handleContextDelete(item: ISftpFileItem): Promise<void> {
  closeContextMenu()
  if (!props.sessionId) return

  const isDir = item.isDirectory
  const title = t('terminal.sftp.deleteConfirmTitle')
  const message = isDir
    ? t('terminal.sftp.deleteDirConfirmMsg', { name: item.name })
    : t('terminal.sftp.deleteFileConfirmMsg', { name: item.name })

  try {
    await ElMessageBox.confirm(message, title, {
      confirmButtonText: t('terminal.sftp.confirmDelete'),
      cancelButtonText: t('terminal.sftp.cancel'),
      type: 'warning',
      confirmButtonClass: 'el-button--danger',
      distinguishCancelAndClose: true,
      autofocus: false
    })

    // 只有在用户明确点击“确定删除”时才会执行删除
    await window.electron.ipcRenderer.invoke(
      'mt::terminal:sftp-delete',
      props.sessionId,
      item.path,
      isDir
    )
    ElMessage.success(t('terminal.sftp.deleteSuccess', { name: item.name }))
    refreshDir()
  } catch {
    // 用户取消或关闭弹窗，不执行任何删除操作，完全安全防误触
  }
}

function onGlobalContextMenu(e: MouseEvent): void {
  const target = e.target as HTMLElement
  if (!target.closest('.sftp-drawer-container')) {
    closeContextMenu()
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

function tryLoadInitialDir(): void {
  if (props.sessionStatus && props.sessionStatus !== 'connected') return
  loadDir('.', true).catch(() => {
    loadDir('/root', true).catch(() => {
      loadDir('/home', true).catch(() => {
        loadDir('/', false).catch(() => {})
      })
    })
  })
}

onMounted(() => {
  window.addEventListener('click', closeContextMenu)
  window.addEventListener('contextmenu', onGlobalContextMenu)
  if (props.visible && props.sessionId && (!props.sessionStatus || props.sessionStatus === 'connected')) {
    tryLoadInitialDir()
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('click', closeContextMenu)
  window.removeEventListener('contextmenu', onGlobalContextMenu)
})

watch(
  () => props.sessionId,
  (newSessionId, oldSessionId) => {
    if (newSessionId && newSessionId !== oldSessionId) {
      fileList.value = []
      if (props.visible && (!props.sessionStatus || props.sessionStatus === 'connected')) {
        tryLoadInitialDir()
      }
    }
  }
)

watch(
  () => props.sessionStatus,
  (newStatus) => {
    if (newStatus === 'disconnected' || newStatus === 'error') {
      // 会话真正断开时才清空列表，以便后续重连时重新载入
      fileList.value = []
    } else if (newStatus === 'connected' && props.visible && props.sessionId) {
      if (fileList.value.length === 0) {
        tryLoadInitialDir()
      }
    }
  }
)

watch(
  () => props.visible,
  (isOpen) => {
    if (isOpen && props.sessionId && (!props.sessionStatus || props.sessionStatus === 'connected')) {
      if (fileList.value.length === 0) {
        tryLoadInitialDir()
      }
    }
  }
)
</script>

<style scoped>
.sftp-drawer-container {
  width: 360px;
  min-width: 320px;
  height: 100%;
  flex-shrink: 0;
  background: var(--sideBarBgColor, #1e1e1e);
  border-left: 1px solid var(--itemBgColor, #333);
  display: flex;
  flex-direction: column;
  user-select: none;
  font-size: 12px;
  position: relative;
  z-index: 10;
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
  min-width: 0;
  flex: 1;
}

.sftp-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sftp-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.sftp-header-actions :deep(.el-dropdown) {
  display: inline-flex;
  align-items: center;
  margin: 0 !important;
}

.sftp-header-actions :deep(.el-button),
.sftp-header-actions .el-button {
  margin: 0 !important;
  margin-left: 0 !important;
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

.sftp-context-menu {
  position: fixed;
  z-index: 9999;
  background: var(--sideBarBgColor, #252526);
  border: 1px solid var(--itemBgColor, #3c3c3c);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
  border-radius: 6px;
  padding: 4px;
  min-width: 130px;
  display: flex;
  flex-direction: column;
  user-select: none;
  overflow-x: hidden !important;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--editorColor, #ccc);
  font-size: 12px;
  transition: background 0.15s ease, color 0.15s ease;
}

.context-menu-item:hover {
  background: var(--sideBarItemHoverBgColor, rgba(255, 255, 255, 0.08));
  color: var(--themeColor, #409eff);
}

.context-menu-item.danger {
  color: #f56c6c;
}

.context-menu-item.danger:hover {
  background: rgba(245, 108, 108, 0.15);
  color: #f56c6c;
}

.context-menu-divider {
  height: 1px;
  background: var(--itemBgColor, #3c3c3c);
  margin: 4px 6px;
}

.sftp-editor-dialog :deep(.el-dialog__body) {
  padding: 10px 16px;
}

.sftp-code-editor :deep(.el-textarea__inner) {
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', 'Menlo', monospace;
  font-size: 13px;
  line-height: 1.5;
  background: var(--editorBgColor, #1e1e1e);
  color: var(--editorColor, #e0e0e0);
  border: 1px solid var(--itemBgColor, #3c3c3c);
  border-radius: 4px;
}

.editor-dirty-badge {
  color: #e6a23c;
  font-size: 12px;
  margin-right: 12px;
}

.editor-saving-badge {
  color: var(--themeColor, #409eff);
  font-size: 12px;
  margin-right: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.editor-saved-badge {
  color: #67c23a;
  font-size: 12px;
  margin-right: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  opacity: 0.85;
}

.has-submenu {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.menu-item-inner {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.submenu-arrow {
  font-size: 11px;
  color: var(--iconColor, #888);
  margin-left: 8px;
}

.sftp-submenu {
  position: fixed;
  background: var(--sideBarBgColor, #252526);
  border: 1px solid var(--itemBgColor, #3c3c3c);
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.6);
  border-radius: 6px;
  padding: 4px 3px 4px 4px;
  width: 172px;
  min-width: 172px;
  box-sizing: border-box;
  overflow-x: hidden !important;
  overflow-y: overlay;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
  transition: scrollbar-color 0.2s ease;
  z-index: 10000;
}

/* 默认滚动条隐形，悬停菜单时优雅浮现细长进度条 */
.sftp-submenu:hover {
  scrollbar-color: rgba(255, 255, 255, 0.25) transparent;
}

/* WebKit / Chromium 极简小巧进度条 (4px 宽，0px 高杜绝横向滚动条) */
.sftp-submenu::-webkit-scrollbar {
  width: 4px;
  height: 0 !important;
}

.sftp-submenu::-webkit-scrollbar-track {
  background: transparent;
}

.sftp-submenu::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 4px;
  transition: background-color 0.2s ease;
}

/* 鼠标移入菜单时，右侧显示半透明小进度滑块 */
.sftp-submenu:hover::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.22);
}

/* 鼠标移动到右侧滑块上或拖拽滚动时，高亮为主题色提供进度反馈 */
.sftp-submenu::-webkit-scrollbar-thumb:hover,
.sftp-submenu::-webkit-scrollbar-thumb:active {
  background: var(--themeColor, #409eff);
}

.sftp-submenu.placement-right::before {
  content: '';
  position: absolute;
  top: -12px;
  bottom: -12px;
  left: -16px;
  width: 24px;
  background: transparent;
}

.sftp-submenu.placement-left::before {
  content: '';
  position: absolute;
  top: -12px;
  bottom: -12px;
  right: -16px;
  width: 24px;
  background: transparent;
}

.submenu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--editorColor, #ccc);
  font-size: 12px;
  white-space: nowrap;
  box-sizing: border-box;
  width: 100%;
  transition: background 0.15s ease, color 0.15s ease;
}

.submenu-item:hover {
  background: var(--sideBarItemHoverBgColor, rgba(255, 255, 255, 0.08));
  color: var(--themeColor, #409eff);
}

.tpl-label {
  font-weight: 500;
  margin-right: 10px;
  white-space: nowrap;
}

.tpl-ext {
  font-size: 11px;
  opacity: 0.6;
  white-space: nowrap;
}

.sftp-header-dropdown-menu {
  max-height: 360px;
  overflow-y: auto;
  overflow-x: hidden !important;
}

.sftp-header-dropdown-menu::-webkit-scrollbar {
  width: 4px;
  height: 0 !important;
}

.sftp-header-dropdown-menu::-webkit-scrollbar-track {
  background: transparent;
}

.sftp-header-dropdown-menu::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.22);
  border-radius: 4px;
}

.sftp-header-dropdown-menu::-webkit-scrollbar-thumb:hover {
  background: var(--themeColor, #409eff);
}

.header-tpl-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 140px;
  font-size: 12px;
}
</style>
