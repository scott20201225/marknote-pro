<template>
  <div class="side-bar-mark-share">
    <div class="title-spacer" />

    <!-- Prominent MarkShare Switches & Device Alias Card (no save path here) -->
    <div class="ms-control-card">
      <div class="ms-card-head">
        <div class="ms-card-title-wrap">
          <span class="ms-status-dot" :class="{ on: markShareStore.config.enabled }" />
          <span class="ms-card-title">MarkShare</span>
        </div>
        <span class="ms-status-pill" :class="{ on: markShareStore.config.enabled }">
          {{ markShareStore.config.enabled ? t('markShare.statusEnabled') : t('markShare.statusDisabled') }}
        </span>
      </div>

      <!-- Per-app Self Device Alias Row -->
      <div class="ms-alias-bar">
        <span class="ms-alias-label">{{ t('markShare.myDeviceLabel') }}：</span>
        <template v-if="!editingSelfAlias">
          <span class="ms-alias-value" :title="markShareStore.config.deviceName">
            {{ markShareStore.config.deviceName }}
          </span>
          <button
            type="button"
            class="ms-icon-edit-btn"
            :title="t('markShare.editAlias')"
            @click="startEditSelfAlias"
          >
            ✏️
          </button>
        </template>
        <template v-else>
          <input
            v-model="selfAliasDraft"
            type="text"
            class="ms-alias-input"
            :placeholder="markShareStore.config.hostname || t('markShare.aliasPlaceholder')"
            maxlength="48"
            @keydown.enter.prevent="saveSelfAlias"
            @keydown.escape.prevent="editingSelfAlias = false"
          />
          <button type="button" class="ms-alias-save-btn" @click="saveSelfAlias">
            {{ t('common.ok') }}
          </button>
          <button type="button" class="ms-alias-cancel-btn" @click="editingSelfAlias = false">
            {{ t('common.cancel') }}
          </button>
        </template>
      </div>

      <div class="ms-switch-row">
        <div class="ms-switch-text">
          <div class="ms-switch-label">{{ t('markShare.enableSwitch') }}</div>
          <div class="ms-switch-desc">{{ t('markShare.enableDesc') }}</div>
        </div>
        <el-switch
          :model-value="markShareStore.config.enabled"
          size="small"
          @change="(val: string | number | boolean) => markShareStore.setEnabled(Boolean(val))"
        />
      </div>

      <div class="ms-switch-row">
        <div class="ms-switch-text">
          <div class="ms-switch-label">{{ t('markShare.autoStartSwitch') }}</div>
          <div class="ms-switch-desc">{{ t('markShare.autoStartDesc') }}</div>
        </div>
        <el-switch
          :model-value="markShareStore.config.autoStart"
          size="small"
          @change="(val: string | number | boolean) => markShareStore.setAutoStart(Boolean(val))"
        />
      </div>
    </div>

    <!-- Navigation Tabs: Online Devices | Send/Receive History -->
    <div class="ms-tab-nav">
      <div
        class="ms-tab-item"
        :class="{ active: activeTab === 'devices' }"
        @click="activeTab = 'devices'"
      >
        {{ t('markShare.devicesTab') }} ({{ markShareStore.devices.length }})
      </div>
      <div
        class="ms-tab-item"
        :class="{ active: activeTab === 'history' }"
        @click="activeTab = 'history'"
      >
        {{ t('markShare.recordsTab') }} ({{ markShareStore.history.length }})
      </div>
    </div>

    <!-- Tab Body -->
    <div class="ms-panel-body">
      <!-- 1. Online MarkShare Devices -->
      <div v-if="activeTab === 'devices'" class="ms-tab-pane">
        <div v-if="markShareStore.devices.length === 0" class="ms-empty">
          <div class="ms-empty-icon">📡</div>
          <div class="ms-empty-title">{{ t('markShare.noDevicesTitle') }}</div>
          <div class="ms-empty-desc">{{ t('markShare.noDevicesDesc') }}</div>
        </div>

        <div
          v-for="device in markShareStore.devices"
          :key="device.peerKey"
          class="ms-device-card"
          :class="{ 'drop-hover': dropHoverId === device.peerKey }"
          @dragenter.prevent.stop="dropHoverId = device.peerKey"
          @dragover.prevent.stop="onDeviceDragOver(device.peerKey, $event)"
          @dragleave.stop="onDeviceDragLeave(device.peerKey)"
          @drop.prevent.stop="onDeviceDrop(device.peerKey, $event)"
        >
          <span class="ms-dev-icon">
            <os-device-icon :os-type="device.osType" />
          </span>
          <div class="ms-dev-info">
            <div v-if="editingPeerKey === device.peerKey" class="ms-peer-alias-edit">
              <input
                v-model="peerAliasDraft"
                type="text"
                class="ms-alias-input"
                :placeholder="t('markShare.aliasPlaceholder')"
                maxlength="48"
                @keydown.enter.prevent="savePeerAlias(device.peerKey)"
                @keydown.escape.prevent="editingPeerKey = null"
              />
              <button type="button" class="ms-alias-save-btn" @click="savePeerAlias(device.peerKey)">
                ✓
              </button>
              <button type="button" class="ms-alias-cancel-btn" @click="editingPeerKey = null">
                ✕
              </button>
            </div>
            <template v-else>
              <div class="ms-dev-name-row">
                <span class="ms-dev-name" :title="device.deviceName">{{ device.deviceName }}</span>
                <button
                  type="button"
                  class="ms-icon-edit-btn"
                  :title="t('markShare.setPeerAlias')"
                  @click.stop="startEditPeerAlias(device)"
                >
                  ✏️
                </button>
              </div>
              <div class="ms-dev-badges">
                <span v-if="device.isSameHost" class="ms-tag-local">{{ t('markShare.localHost') }}</span>
                <span class="ms-tag-app" :class="device.appType">
                  {{ device.appType === 'marktextpro' ? 'MarkTextPro' : 'MarkNotePro' }}
                </span>
              </div>
              <div class="ms-dev-sub">
                {{ osLabel(device.osType) }} · {{ device.hostIp }}
                <template v-if="device.hostname && device.hostname !== device.deviceName">
                  · {{ device.hostname }}
                </template>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- 2. Send & Receive Records -->
      <div v-else class="ms-tab-pane">
        <div class="ms-history-filter-row">
          <div class="ms-filter-pills">
            <button
              type="button"
              class="ms-filter-btn"
              :class="{ active: historyFilter === 'all' }"
              @click="historyFilter = 'all'"
            >
              {{ t('markShare.filterAll') }}
            </button>
            <button
              type="button"
              class="ms-filter-btn"
              :class="{ active: historyFilter === 'send' }"
              @click="historyFilter = 'send'"
            >
              {{ t('markShare.filterSent') }}
            </button>
            <button
              type="button"
              class="ms-filter-btn"
              :class="{ active: historyFilter === 'receive' }"
              @click="historyFilter = 'receive'"
            >
              {{ t('markShare.filterReceived') }}
            </button>
          </div>
          <button
            v-if="markShareStore.history.length > 0"
            type="button"
            class="ms-clear-btn"
            @click="markShareStore.clearHistory"
          >
            {{ t('markShare.clearRecords') }}
          </button>
        </div>

        <div v-if="filteredHistory.length === 0" class="ms-empty">
          <div class="ms-empty-icon">🗂️</div>
          <div class="ms-empty-title">{{ t('markShare.noRecordsTitle') }}</div>
          <div class="ms-empty-desc">{{ t('markShare.noRecordsDesc') }}</div>
        </div>

        <div
          v-for="rec in filteredHistory"
          :key="rec.id"
          class="ms-record-card"
          :class="`dir-${rec.direction}`"
        >
          <div class="ms-rec-top">
            <div class="ms-rec-dir-wrap">
              <span class="ms-rec-dir-badge" :class="rec.direction">
                <svg
                  v-if="rec.direction === 'send'"
                  viewBox="0 0 16 16"
                  width="12"
                  height="12"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M8 13V3" />
                  <path d="M3.5 7.5L8 3l4.5 4.5" />
                </svg>
                <svg
                  v-else
                  viewBox="0 0 16 16"
                  width="12"
                  height="12"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M8 3v10" />
                  <path d="M3.5 8.5L8 13l4.5-4.5" />
                </svg>
                <span>{{ rec.direction === 'send' ? t('markShare.directionSend') : t('markShare.directionReceive') }}</span>
              </span>
              <span class="ms-rec-title" :title="rec.rootLabel">{{ rec.rootLabel }}</span>
            </div>
            <span class="ms-rec-state" :class="rec.state">
              {{ stateLabel(rec.state) }}
            </span>
          </div>
          <div class="ms-rec-meta">
            <os-device-icon :os-type="rec.peerOsType" />
            <span class="ms-rec-peer-name" :title="rec.peerDeviceName">{{ rec.peerDeviceName }}</span>
            <span class="ms-tag-app" :class="rec.peerAppType">
              {{ rec.peerAppType === 'marktextpro' ? 'MarkTextPro' : 'MarkNotePro' }}
            </span>
          </div>
          <div class="ms-rec-subline">
            <span>{{ formatSize(rec.totalBytes) }}</span>
            <span>·</span>
            <span>{{ formatTime(rec.finishedAt) }}</span>
          </div>
          <div
            v-if="rec.direction === 'receive' && rec.state === 'completed' && (rec.savedRootPath || rec.saveDir)"
            class="ms-rec-actions"
          >
            <span class="ms-rec-path" :title="rec.savedRootPath || rec.saveDir">
              {{ rec.savedRootPath || rec.saveDir }}
            </span>
            <button
              type="button"
              class="ms-rec-btn"
              @click="markShareStore.openPath(rec.savedRootPath || rec.saveDir || '')"
            >
              {{ t('markShare.openFolder') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMarkShareStore } from '@/store/markShare'
import type {
  MarkShareDevice,
  MarkShareHistoryRecord,
  MarkShareOsType
} from '@shared/types/markShare'
import OsDeviceIcon from '../markShare/OsDeviceIcon.vue'

const { t } = useI18n()
const markShareStore = useMarkShareStore()

const activeTab = ref<'devices' | 'history'>('devices')
const historyFilter = ref<'all' | 'send' | 'receive'>('all')
const dropHoverId = ref<string | null>(null)

const editingSelfAlias = ref(false)
const selfAliasDraft = ref('')
const editingPeerKey = ref<string | null>(null)
const peerAliasDraft = ref('')

onMounted(() => {
  void markShareStore.init()
})

const filteredHistory = computed(() => {
  if (historyFilter.value === 'send') return markShareStore.sendHistory
  if (historyFilter.value === 'receive') return markShareStore.receiveHistory
  return markShareStore.history
})

const osLabel = (os: MarkShareOsType): string => {
  if (os === 'darwin') return 'macOS'
  if (os === 'win32') return 'Windows'
  return 'Linux'
}

const stateLabel = (state: MarkShareHistoryRecord['state']): string => {
  return t(`markShare.state.${state}`)
}

const formatSize = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)))
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`
}

const formatTime = (ts: number): string => {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const startEditSelfAlias = (): void => {
  selfAliasDraft.value = markShareStore.config.deviceAlias || markShareStore.config.deviceName || ''
  editingSelfAlias.value = true
}

const saveSelfAlias = async (): Promise<void> => {
  await markShareStore.setDeviceAlias(selfAliasDraft.value)
  editingSelfAlias.value = false
}

const startEditPeerAlias = (device: MarkShareDevice): void => {
  peerAliasDraft.value = device.deviceAlias || device.deviceName || ''
  editingPeerKey.value = device.peerKey
}

const savePeerAlias = async (peerKey: string): Promise<void> => {
  await markShareStore.setPeerAlias(peerKey, peerAliasDraft.value)
  editingPeerKey.value = null
}

const onDeviceDragOver = (peerKey: string, e: DragEvent): void => {
  dropHoverId.value = peerKey
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
}

const onDeviceDragLeave = (peerKey: string): void => {
  if (dropHoverId.value === peerKey) dropHoverId.value = null
}

const onDeviceDrop = async (peerKey: string, e: DragEvent): Promise<void> => {
  dropHoverId.value = null
  const paths: string[] = []
  if (e.dataTransfer) {
    const rawInternal = e.dataTransfer.getData('application/x-markshare-paths')
    if (rawInternal) {
      try {
        const parsed = JSON.parse(rawInternal) as string[]
        if (Array.isArray(parsed)) paths.push(...parsed)
      } catch {
        // ignore
      }
    }
    if (paths.length === 0 && e.dataTransfer.files?.length) {
      for (const f of Array.from(e.dataTransfer.files)) {
        const p = window.electron.webUtils.getPathForFile(f)
        if (p) paths.push(p)
      }
    }
  }
  if (paths.length === 0 && markShareStore.dragRadarPaths.length > 0) {
    paths.push(...markShareStore.dragRadarPaths)
  }
  markShareStore.hideDragRadarNow()

  if (paths.length === 0) return
  try {
    await markShareStore.sendToDevice(peerKey, paths)
    markShareStore.showNotice('info', t('markShare.offerSentToast'))
  } catch (err) {
    markShareStore.showNotice('error', err instanceof Error ? err.message : String(err))
  }
}
</script>

<style scoped>
.side-bar-mark-share {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
  color: var(--sideBarColor);
}

.title-spacer {
  height: 36px;
  flex-shrink: 0;
  -webkit-app-region: drag;
}

.ms-control-card {
  margin: 0 10px 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(128, 128, 128, 0.08);
  border: 1px solid rgba(128, 128, 128, 0.16);
  display: flex;
  flex-direction: column;
  gap: 8px;
  -webkit-app-region: no-drag;
}

.ms-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.ms-card-title-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ms-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(148, 163, 184, 0.6);
}

.ms-status-dot.on {
  background: #10b981;
  box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.2);
}

.ms-card-title {
  font-size: 13px;
  font-weight: 700;
}

.ms-status-pill {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 10px;
  background: rgba(148, 163, 184, 0.18);
}

.ms-status-pill.on {
  background: rgba(16, 185, 129, 0.18);
  color: #10b981;
  font-weight: 600;
}

.ms-alias-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  padding-bottom: 4px;
  border-bottom: 1px dashed rgba(128, 128, 128, 0.2);
}

.ms-alias-label {
  flex-shrink: 0;
  opacity: 0.72;
}

.ms-alias-value {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ms-icon-edit-btn {
  border: none;
  background: transparent;
  padding: 1px 3px;
  font-size: 11px;
  cursor: pointer;
  opacity: 0.72;
  flex-shrink: 0;
}

.ms-icon-edit-btn:hover {
  opacity: 1;
}

.ms-peer-alias-edit {
  display: flex;
  align-items: center;
  gap: 4px;
}

.ms-alias-input {
  flex: 1;
  min-width: 0;
  padding: 2px 6px;
  font-size: 11px;
  border-radius: 4px;
  border: 1px solid var(--themeColor, #409eff);
  background: rgba(128, 128, 128, 0.12);
  color: inherit;
  outline: none;
}

.ms-alias-save-btn,
.ms-alias-cancel-btn {
  border: none;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 10px;
  cursor: pointer;
  flex-shrink: 0;
}

.ms-alias-save-btn {
  background: var(--themeColor, #409eff);
  color: #fff;
}

.ms-alias-cancel-btn {
  background: rgba(128, 128, 128, 0.2);
  color: inherit;
}

.ms-switch-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.ms-switch-text {
  min-width: 0;
}

.ms-switch-label {
  font-size: 12px;
  font-weight: 600;
}

.ms-switch-desc {
  font-size: 10px;
  opacity: 0.68;
}

.ms-tab-nav {
  display: flex;
  border-bottom: 1px solid rgba(128, 128, 128, 0.18);
  padding: 0 10px;
  gap: 14px;
  flex-shrink: 0;
}

.ms-tab-item {
  font-size: 12px;
  padding: 6px 2px;
  cursor: pointer;
  opacity: 0.68;
  border-bottom: 2px solid transparent;
}

.ms-tab-item.active {
  opacity: 1;
  font-weight: 600;
  color: var(--themeColor, #409eff);
  border-bottom-color: var(--themeColor, #409eff);
}

.ms-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}

.ms-tab-pane {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ms-empty {
  text-align: center;
  padding: 28px 12px;
  opacity: 0.75;
}

.ms-empty-icon {
  font-size: 26px;
  margin-bottom: 6px;
}

.ms-empty-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
}

.ms-empty-desc {
  font-size: 11px;
  line-height: 1.45;
  opacity: 0.75;
}

.ms-device-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 8px;
  border: 1px solid rgba(128, 128, 128, 0.18);
  background: rgba(128, 128, 128, 0.04);
  transition: all 0.15s ease;
}

.ms-device-card.drop-hover {
  border-color: #38bdf8;
  background: rgba(56, 189, 248, 0.16);
}

.ms-dev-icon {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: rgba(128, 128, 128, 0.12);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  flex-shrink: 0;
}

.ms-dev-info {
  flex: 1;
  min-width: 0;
}

.ms-dev-name-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.35;
}

.ms-dev-name {
  flex: 1;
  min-width: 0;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.ms-dev-badges {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 4px;
}

.ms-tag-app,
.ms-tag-local {
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 4px;
  font-weight: 600;
  flex-shrink: 0;
}

.ms-tag-app {
  background: rgba(64, 158, 255, 0.16);
  color: var(--themeColor, #409eff);
}

.ms-tag-app.marktextpro {
  background: rgba(168, 85, 247, 0.16);
  color: #a855f7;
}

.ms-tag-local {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.ms-dev-sub {
  font-size: 11px;
  opacity: 0.65;
  margin-top: 3px;
  word-break: break-word;
}

.ms-history-filter-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
}

.ms-filter-pills {
  display: flex;
  gap: 4px;
}

.ms-filter-btn {
  border: 1px solid rgba(128, 128, 128, 0.22);
  background: transparent;
  color: inherit;
  border-radius: 10px;
  padding: 2px 8px;
  font-size: 11px;
  cursor: pointer;
}

.ms-filter-btn.active {
  background: rgba(64, 158, 255, 0.16);
  border-color: var(--themeColor, #409eff);
  color: var(--themeColor, #409eff);
  font-weight: 600;
}

.ms-clear-btn {
  border: none;
  background: transparent;
  color: #f87171;
  font-size: 11px;
  cursor: pointer;
}

.ms-record-card {
  padding: 9px 10px;
  border-radius: 8px;
  border: 1px solid rgba(128, 128, 128, 0.18);
  border-left-width: 3px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.ms-record-card.dir-send {
  border-left-color: #38bdf8;
}

.ms-record-card.dir-receive {
  border-left-color: #10b981;
}

.ms-rec-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.ms-rec-dir-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.ms-rec-dir-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 7px;
  border-radius: 5px;
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
}

.ms-rec-dir-badge.send {
  background: rgba(56, 189, 248, 0.22);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.4);
}

.ms-rec-dir-badge.receive {
  background: rgba(16, 185, 129, 0.22);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.4);
}

.ms-rec-title {
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ms-rec-state {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 6px;
  flex-shrink: 0;
}

.ms-rec-state.completed {
  background: rgba(16, 185, 129, 0.16);
  color: #10b981;
}

.ms-rec-state.rejected,
.ms-rec-state.expired,
.ms-rec-state.stopped,
.ms-rec-state.failed {
  background: rgba(239, 68, 68, 0.14);
  color: #f87171;
}

.ms-rec-state.cancelled {
  background: rgba(148, 163, 184, 0.18);
  opacity: 0.8;
}

.ms-rec-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  font-size: 11px;
  margin-top: 2px;
}

.ms-rec-peer-name {
  opacity: 0.85;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.ms-rec-subline {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  opacity: 0.62;
}

.ms-rec-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}

.ms-rec-path {
  font-size: 10px;
  opacity: 0.65;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ms-rec-btn {
  border: none;
  background: rgba(64, 158, 255, 0.15);
  color: var(--themeColor, #409eff);
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 10px;
  cursor: pointer;
  flex-shrink: 0;
}
</style>
