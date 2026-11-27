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
          <span v-if="targetHintText" class="ms-save-hint">
            （{{ targetHintText }}）
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

        <!-- 目录结构策略（默认保留路径信息） -->
        <div class="ms-conflict-row">
          <span class="ms-conflict-label">{{ t('lanShare.pathModeLabel') }}</span>
          <el-radio-group v-model="pathMode" size="small">
            <el-radio-button value="preserve">{{ t('lanShare.pathModePreserve') }}</el-radio-button>
            <el-radio-button value="flatten">{{ t('lanShare.pathModeFlatten') }}</el-radio-button>
          </el-radio-group>
        </div>

        <!-- 重名冲突策略 -->
        <div class="ms-conflict-row">
          <span class="ms-conflict-label">{{ t('lanShare.conflictStrategyLabel') }}</span>
          <el-radio-group v-model="conflictStrategy" size="small">
            <el-radio-button value="rename">{{ t('lanShare.strategyRename') }}</el-radio-button>
            <el-radio-button value="skip">{{ t('lanShare.strategySkip') }}</el-radio-button>
            <el-radio-button value="overwrite">{{ t('lanShare.strategyOverwrite') }}</el-radio-button>
          </el-radio-group>
        </div>
        <div
          v-if="conflictPreview && conflictPreview.conflictCount > 0"
          class="ms-conflict-tip"
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

import type {
  MarkShareConflictPreview,
  MarkShareConflictStrategy,
  MarkSharePathMode
} from '@shared/types/markShare'

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
const userChangedSavePath = ref(false)
const pathMode = ref<MarkSharePathMode>('preserve')
const busy = ref(false)
const nowTick = ref(Date.now())
const conflictStrategy = ref<MarkShareConflictStrategy>('rename')
const conflictPreview = ref<MarkShareConflictPreview | null>(null)

let tickTimer: ReturnType<typeof setInterval> | null = null

const isMarkNote = computed(() => {
  if (markShareStore.config.appType === 'marknotepro') return true
  if (markShareStore.config.appType === 'marktextpro') return false
  const title = typeof document !== 'undefined' ? document.title : ''
  return /marknote/i.test(title)
})

const hasWorkspace = computed(() => !!projectStore.projectTree?.pathname)
const isFolderShare = computed(
  () => offer.value?.rootType === 'folder' || offer.value?.rootType === 'mixed'
)

const collectGroupsAndAreas = (
  node: TreeFolderLike | null | undefined,
  groups: { path: string; display: string }[],
  areas: { path: string; display: string }[],
  groupPrefix = ''
): void => {
  if (!node) return
  const name = node.name || ''
  let nextPrefix = groupPrefix
  if (name.startsWith('GROUP_') && node.pathname) {
    const clean = name.replace(/^GROUP_/, '')
    const display = groupPrefix ? `${groupPrefix}/${clean}` : clean
    groups.push({ path: node.pathname, display })
    nextPrefix = display
  } else if (name.startsWith('AREA_') && node.pathname) {
    const areaName = name.replace(/^AREA_/, '')
    const display = groupPrefix ? `[${groupPrefix}] ${areaName}` : areaName
    areas.push({ path: node.pathname, display })
  }

  if (Array.isArray(node.folders)) {
    for (const child of node.folders) {
      collectGroupsAndAreas(child, groups, areas, nextPrefix)
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
    const defaultAreaPath = joinPath(root, 'GROUP_Dump', 'AREA_Downloads')
    const defaultFoldersPath = joinPath(root, 'GROUP_Dump', 'GROUP_Folders')

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
    collectGroupsAndAreas(projectStore.projectTree as TreeFolderLike, existingGroups, existingAreas)

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
    const defaultDownloadsPath = joinPath(root, 'Dump', 'Downloads')
    const defaultFoldersPath = joinPath(root, 'Dump', 'Folders')

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

    const existingFolders: { path: string; display: string }[] = []
    collectFolders(projectStore.projectTree as TreeFolderLike, existingFolders, root)
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

const targetHintText = computed(() => {
  if (!hasWorkspace.value) return ''
  if (pathMode.value === 'flatten') {
    return t('lanShare.pathModeFlattenTip')
  }
  if (!isMarkNote.value) return t('lanShare.markTextFolderHint')
  const base = chosenDir.value.split(/[/\\]/).pop() || ''
  if (base.startsWith('AREA_')) {
    return t('lanShare.markNoteAreaTip')
  }
  if (offer.value?.peerDevice?.appType === 'marknotepro') {
    return t('lanShare.markNoteGroupPreserveTip')
  }
  return t('lanShare.markNoteGroupConvertTip')
})

const conflictActionText = computed(() => {
  if (conflictStrategy.value === 'skip') return t('lanShare.actionSkip')
  if (conflictStrategy.value === 'overwrite') return t('lanShare.actionOverwrite')
  return t('lanShare.actionRename')
})

const initTargetSavePath = (): void => {
  const root = projectStore.projectTree?.pathname
  if (root) {
    const useFoldersDir = isFolderShare.value && pathMode.value === 'preserve'
    if (isMarkNote.value) {
      chosenDir.value = useFoldersDir
        ? joinPath(root, 'GROUP_Dump', 'GROUP_Folders')
        : joinPath(root, 'GROUP_Dump', 'AREA_Downloads')
    } else {
      chosenDir.value = useFoldersDir
        ? joinPath(root, 'Dump', 'Folders')
        : joinPath(root, 'Dump', 'Downloads')
    }
    return
  }
  chosenDir.value = markShareStore.config.defaultSaveDir || ''
}

const refreshConflictPreview = async (): Promise<void> => {
  if (!offer.value || !chosenDir.value) {
    conflictPreview.value = null
    return
  }
  try {
    conflictPreview.value = await markShareStore.previewIncomingConflicts(
      offer.value.offerId,
      chosenDir.value,
      projectStore.projectTree?.pathname || undefined,
      pathMode.value
    )
  } catch {
    conflictPreview.value = null
  }
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
      userChangedSavePath.value = false
      pathMode.value = 'preserve'
      conflictStrategy.value = 'rename'
      conflictPreview.value = null
      initTargetSavePath()
      startTick()
      void refreshConflictPreview()
    } else {
      bus.emit('host-overlay:hide', 'markshare-incoming-modal')
      conflictPreview.value = null
      stopTick()
    }
  },
  { immediate: true }
)

watch(pathMode, () => {
  if (!userChangedSavePath.value) {
    initTargetSavePath()
  }
})

watch([chosenDir, pathMode], () => {
  void refreshConflictPreview()
})

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
  if (dir) {
    userChangedSavePath.value = true
    chosenDir.value = dir
  }
}

const handleAccept = async (): Promise<void> => {
  if (!offer.value || !chosenDir.value) return
  busy.value = true
  try {
    await markShareStore.acceptOffer(
      offer.value.offerId,
      chosenDir.value,
      false,
      projectStore.projectTree?.pathname || undefined,
      conflictStrategy.value,
      pathMode.value
    )
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

.ms-conflict-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 2px;
}

.ms-conflict-label {
  font-size: 12px;
  opacity: 0.85;
}

.ms-conflict-tip {
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(230, 162, 60, 0.14);
  color: #e6a23c;
}

.ms-conflict-tip.strategy-overwrite {
  background: rgba(245, 108, 108, 0.14);
  color: #f56c6c;
}

.ms-in-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
