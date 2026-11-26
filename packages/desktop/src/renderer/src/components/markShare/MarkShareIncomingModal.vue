<template>
  <el-dialog
    :model-value="Boolean(offer)"
    :title="t('markShare.incomingTitle')"
    width="480px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
    append-to-body
    class="markshare-incoming-dialog"
  >
    <div v-if="offer" class="ms-in-body">
      <!-- Countdown banner (60s confirmation window) -->
      <div class="ms-countdown-bar-wrap">
        <div class="ms-countdown-text">
          <span>{{ t('markShare.confirmCountdownLabel') }}</span>
          <span class="ms-countdown-sec">{{ remainingSec }}s</span>
        </div>
        <div class="ms-progress-track">
          <div class="ms-progress-fill" :style="{ width: `${progressPercent}%` }" />
        </div>
      </div>

      <!-- Sender & Security SAS Verification Code -->
      <div class="ms-sender-card">
        <span class="ms-sender-icon">
          <os-device-icon :os-type="offer.peerDevice.osType" />
        </span>
        <div class="ms-sender-info">
          <div class="ms-sender-name">
            {{ offer.peerDevice.deviceName }}
            <span class="ms-tag-app">
              {{ offer.peerDevice.appType === 'marktextpro' ? 'MarkTextPro' : 'MarkNotePro' }}
            </span>
          </div>
          <div class="ms-sender-sub">{{ offer.peerDevice.hostIp }}</div>
        </div>
        <div class="ms-sas-badge" :title="t('markShare.sasCodeTooltip')">
          <span class="ms-sas-label">{{ t('markShare.sasCode') }}</span>
          <span class="ms-sas-value">{{ offer.sasCode }}</span>
        </div>
      </div>

      <!-- Files / Folder Summary -->
      <div class="ms-payload-box">
        <div class="ms-payload-header">
          <span class="ms-payload-title">{{ offer.rootLabel }}</span>
          <span class="ms-payload-meta">
            {{ t('markShare.filesAndSize', { count: offer.totalFiles, size: formatSize(offer.totalBytes) }) }}
          </span>
        </div>
        <div class="ms-payload-list">
          <div v-for="item in previewItems" :key="item.fileId" class="ms-payload-row">
            <span class="ms-payload-path" :title="item.relativePath">
              {{ item.isDirectory ? '📁' : '📄' }} {{ item.relativePath }}
            </span>
            <span v-if="!item.isDirectory" class="ms-payload-size">{{ formatSize(item.size) }}</span>
          </div>
          <div v-if="offer.items.length > 6" class="ms-payload-more">
            +{{ offer.items.length - 6 }} {{ t('markShare.moreItems') }}
          </div>
        </div>
      </div>

      <!-- Save Location (consistent with LAN Share extraction logic per app & workspace) -->
      <div class="ms-save-section">
        <div class="ms-save-label">
          {{ t('lanShare.saveLocationLabel') }}
          <span class="ms-save-hint">
            <template v-if="hasWorkspace && isMarkNote">
              （{{ t('lanShare.markNoteAreaHint') }}）
            </template>
            <template v-else-if="hasWorkspace">
              （{{ t('lanShare.markTextFolderHint') }}）
            </template>
          </span>
        </div>
        <div class="ms-save-row">
          <el-select
            v-if="hasWorkspace && folderOptions.length > 0"
            v-model="chosenDir"
            :placeholder="t('lanShare.selectFolderPlaceholder')"
            size="small"
            filterable
            allow-create
            default-first-option
            class="ms-loc-select"
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
            v-model="chosenDir"
            :placeholder="t('lanShare.selectFolderPlaceholder')"
            size="small"
            readonly
            class="ms-loc-input"
          />
          <el-button size="small" @click="handleChooseDir">
            {{ t('lanShare.browseOtherFolder') }}
          </el-button>
        </div>
        <div class="ms-save-current-path" :title="chosenDir">
          {{ chosenDir || t('lanShare.unspecified') }}
        </div>
      </div>
    </div>

    <template #footer>
      <div class="ms-in-footer">
        <el-button :disabled="busy" @click="handleReject">
          {{ t('markShare.reject') }}
        </el-button>
        <el-button
          type="primary"
          :disabled="!chosenDir"
          :loading="busy"
          @click="handleAccept"
        >
          {{ t('markShare.acceptReceive') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import bus from '@/bus'
import { useMarkShareStore } from '@/store/markShare'
import { useProjectStore } from '@/store/project'
import OsDeviceIcon from './OsDeviceIcon.vue'

interface FolderOption {
  label: string
  value: string
  tag?: string
}

interface TreeFolderLike {
  name?: string
  pathname?: string
  folders?: TreeFolderLike[]
}

const { t } = useI18n()
const markShareStore = useMarkShareStore()
const projectStore = useProjectStore()

const offer = computed(() => markShareStore.currentIncomingOffer)
const chosenDir = ref('')
const busy = ref(false)
const nowTick = ref(Date.now())

let tickTimer: ReturnType<typeof setInterval> | null = null

const isMarkNote = computed(() => {
  if (markShareStore.config.appType === 'marknotepro') return true
  if (markShareStore.config.appType === 'marktextpro') return false
  const title = typeof document !== 'undefined' ? document.title : ''
  return /marknote/i.test(title)
})

const hasWorkspace = computed(() => !!projectStore.projectTree?.pathname)

const collectAreas = (
  node: TreeFolderLike | null | undefined,
  result: { path: string; display: string }[],
  groupName = ''
): void => {
  if (!node) return
  const name = node.name || ''
  const currentGroup = name.startsWith('GROUP_') ? name.replace(/^GROUP_/, '') : groupName

  if (name.startsWith('AREA_') && node.pathname) {
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
  node: TreeFolderLike | null | undefined,
  result: { path: string; display: string }[],
  rootPath: string
): void => {
  if (!node) return
  if (node.pathname && node.pathname !== rootPath) {
    const rel = node.pathname.replace(rootPath, '').replace(/^[/\\]/, '')
    result.push({ path: node.pathname, display: rel || node.name || '' })
  }
  if (Array.isArray(node.folders)) {
    for (const child of node.folders) {
      collectFolders(child, result, rootPath)
    }
  }
}

const joinPath = (base: string, ...segments: string[]): string => {
  if (window.path?.join) {
    return window.path.join(base, ...segments)
  }
  return [base.replace(/[/\\]+$/, ''), ...segments].join('/')
}

const folderOptions = computed<FolderOption[]>(() => {
  const root = projectStore.projectTree?.pathname
  if (!root) return []

  const options: FolderOption[] = []

  if (isMarkNote.value) {
    const defaultPath = joinPath(root, 'GROUP_Dump', 'AREA_Downloads')
    options.push({
      label: t('lanShare.defaultAreaLabel'),
      value: defaultPath,
      tag: t('lanShare.tagRecommended')
    })

    const existingAreas: { path: string; display: string }[] = []
    collectAreas(projectStore.projectTree as TreeFolderLike, existingAreas)
    for (const area of existingAreas) {
      if (area.path !== defaultPath) {
        options.push({
          label: `📑 ${area.display}`,
          value: area.path,
          tag: t('lanShare.tagArea')
        })
      }
    }
  } else {
    const defaultPath = joinPath(root, 'Dump', 'Downloads')
    options.push({
      label: t('lanShare.defaultFolderLabel'),
      value: defaultPath,
      tag: t('lanShare.tagRecommended')
    })

    const existingFolders: { path: string; display: string }[] = []
    collectFolders(projectStore.projectTree as TreeFolderLike, existingFolders, root)
    for (const folder of existingFolders) {
      if (folder.path !== defaultPath) {
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

const initTargetSavePath = (): void => {
  const root = projectStore.projectTree?.pathname
  if (root) {
    chosenDir.value = isMarkNote.value
      ? joinPath(root, 'GROUP_Dump', 'AREA_Downloads')
      : joinPath(root, 'Dump', 'Downloads')
    return
  }
  chosenDir.value = markShareStore.config.defaultSaveDir || ''
}

const startTick = () => {
  if (tickTimer) return
  nowTick.value = Date.now()
  tickTimer = setInterval(() => {
    nowTick.value = Date.now()
  }, 500)
}

const stopTick = () => {
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
}

watch(
  offer,
  (next) => {
    if (next) {
      bus.emit('host-overlay:show', 'markshare-incoming-modal')
      initTargetSavePath()
      startTick()
    } else {
      bus.emit('host-overlay:hide', 'markshare-incoming-modal')
      stopTick()
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  stopTick()
})

const remainingSec = computed(() => {
  if (!offer.value || !offer.value.expiresAt) return 0
  return Math.max(0, Math.ceil((offer.value.expiresAt - nowTick.value) / 1000))
})

const progressPercent = computed(() => Math.min(100, Math.max(0, (remainingSec.value / 60) * 100)))

const previewItems = computed(() => (offer.value?.items || []).slice(0, 6))

const formatSize = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)))
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`
}

const handleChooseDir = async (): Promise<void> => {
  const dir = await markShareStore.selectDirectory(chosenDir.value)
  if (dir) chosenDir.value = dir
}

const handleAccept = async (): Promise<void> => {
  if (!offer.value || !chosenDir.value) return
  busy.value = true
  try {
    await markShareStore.acceptOffer(offer.value.offerId, chosenDir.value, false)
  } catch (err) {
    markShareStore.showNotice('error', err instanceof Error ? err.message : String(err))
  } finally {
    busy.value = false
  }
}

const handleReject = async (): Promise<void> => {
  if (!offer.value) return
  busy.value = true
  try {
    await markShareStore.rejectOffer(offer.value.offerId)
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.ms-in-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ms-countdown-bar-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ms-countdown-text {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  opacity: 0.85;
}

.ms-countdown-sec {
  font-weight: 700;
  color: #f59e0b;
}

.ms-progress-track {
  height: 4px;
  border-radius: 4px;
  background: rgba(128, 128, 128, 0.2);
  overflow: hidden;
}

.ms-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #38bdf8, #f59e0b);
  transition: width 0.35s linear;
}

.ms-sender-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--itemBgColor, rgba(128, 128, 128, 0.08));
}

.ms-sender-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(56, 189, 248, 0.14);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}

.ms-sender-info {
  flex: 1;
  min-width: 0;
}

.ms-sender-name {
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}

.ms-tag-app {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(64, 158, 255, 0.15);
  color: var(--themeColor, #409eff);
}

.ms-sender-sub {
  font-size: 11px;
  opacity: 0.68;
}

.ms-sas-badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid rgba(56, 189, 248, 0.35);
  background: rgba(56, 189, 248, 0.08);
}

.ms-sas-label {
  font-size: 9px;
  opacity: 0.72;
}

.ms-sas-value {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 1px;
  font-family: monospace;
}

.ms-payload-box {
  border: 1px solid rgba(128, 128, 128, 0.22);
  border-radius: 8px;
  padding: 10px;
}

.ms-payload-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.ms-payload-title {
  font-size: 13px;
  font-weight: 600;
}

.ms-payload-meta {
  font-size: 11px;
  opacity: 0.72;
}

.ms-payload-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 120px;
  overflow-y: auto;
}

.ms-payload-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}

.ms-payload-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ms-payload-size {
  flex-shrink: 0;
  opacity: 0.68;
}

.ms-payload-more {
  font-size: 11px;
  opacity: 0.65;
  margin-top: 2px;
}

.ms-save-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ms-save-label {
  font-size: 12px;
  font-weight: 600;
}

.ms-save-hint {
  font-weight: 400;
  font-size: 11px;
  opacity: 0.72;
}

.ms-save-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.ms-loc-select,
.ms-loc-input {
  flex: 1;
  min-width: 0;
}

.ms-save-current-path {
  font-size: 11px;
  opacity: 0.72;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ms-in-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
