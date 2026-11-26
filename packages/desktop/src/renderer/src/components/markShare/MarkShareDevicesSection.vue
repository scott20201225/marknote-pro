<template>
  <div class="ms-sidebar-section">
    <div class="ms-sec-header">
      <div class="ms-sec-title-row">
        <span class="ms-sec-dot" :class="{ online: markShareStore.config.enabled }" />
        <span class="ms-sec-title">MarkShare</span>
        <span class="ms-sec-count">({{ markShareStore.devices.length }})</span>
      </div>
      <div class="ms-sec-switches">
        <label class="ms-inline-toggle" :title="t('markShare.enableDesc')">
          <input
            type="checkbox"
            :checked="markShareStore.config.enabled"
            @change="onToggleEnabled"
          />
          <span>{{ t('markShare.enableSwitchShort') }}</span>
        </label>
        <label class="ms-inline-toggle" :title="t('markShare.autoStartDesc')">
          <input
            type="checkbox"
            :checked="markShareStore.config.autoStart"
            @change="onToggleAutoStart"
          />
          <span>{{ t('markShare.autoStartShort') }}</span>
        </label>
      </div>
    </div>

    <div v-if="markShareStore.devices.length === 0" class="ms-sec-empty">
      {{ t('markShare.noDevicesShort') }}
    </div>

    <div v-else class="ms-sec-device-list">
      <div
        v-for="device in markShareStore.devices"
        :key="device.peerKey"
        class="ms-sec-device-item"
        :class="{ 'drop-hover': dropHoverId === device.peerKey }"
        @dragenter.prevent.stop="dropHoverId = device.peerKey"
        @dragover.prevent.stop="onDeviceDragOver(device.peerKey, $event)"
        @dragleave.stop="onDeviceDragLeave(device.peerKey)"
        @drop.prevent.stop="onDeviceDrop(device.peerKey, $event)"
      >
        <span class="ms-sec-icon">
          <os-device-icon :os-type="device.osType" />
        </span>
        <div class="ms-sec-info">
          <div class="ms-sec-name">
            <span class="ms-name-full" :title="device.deviceName">{{ device.deviceName }}</span>
          </div>
          <div class="ms-sec-tags">
            <span v-if="device.isSameHost" class="ms-badge-local">{{ t('markShare.localHost') }}</span>
            <span class="ms-badge-app" :class="device.appType">
              {{ device.appType === 'marktextpro' ? 'MarkTextPro' : 'MarkNotePro' }}
            </span>
            <span class="ms-sec-ip">{{ device.hostIp }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMarkShareStore } from '@/store/markShare'
import OsDeviceIcon from './OsDeviceIcon.vue'

const { t } = useI18n()
const markShareStore = useMarkShareStore()
const dropHoverId = ref<string | null>(null)

onMounted(() => {
  void markShareStore.init()
})

const onToggleEnabled = (e: Event): void => {
  const checked = (e.target as HTMLInputElement).checked
  void markShareStore.setEnabled(checked)
}

const onToggleAutoStart = (e: Event): void => {
  const checked = (e.target as HTMLInputElement).checked
  void markShareStore.setAutoStart(checked)
}

const onDeviceDragOver = (instanceId: string, e: DragEvent): void => {
  dropHoverId.value = instanceId
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy'
  }
}

const onDeviceDragLeave = (instanceId: string): void => {
  if (dropHoverId.value === instanceId) {
    dropHoverId.value = null
  }
}

const onDeviceDrop = async (instanceId: string, e: DragEvent): Promise<void> => {
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
    await markShareStore.sendToDevice(instanceId, paths)
    markShareStore.showNotice('info', t('markShare.offerSentToast'))
  } catch (err) {
    markShareStore.showNotice('error', err instanceof Error ? err.message : String(err))
  }
}
</script>

<style scoped>
.ms-sidebar-section {
  border-top: 1px solid rgba(128, 128, 128, 0.2);
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 240px;
  background: rgba(128, 128, 128, 0.03);
}

.ms-sec-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ms-sec-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
}

.ms-sec-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgba(148, 163, 184, 0.6);
}

.ms-sec-dot.online {
  background: #10b981;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
}

.ms-sec-count {
  font-weight: 500;
  opacity: 0.7;
}

.ms-sec-switches {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ms-inline-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  cursor: pointer;
  opacity: 0.9;
}

.ms-sec-empty {
  font-size: 11px;
  opacity: 0.65;
  padding: 8px 4px;
  text-align: center;
}

.ms-sec-device-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
}

.ms-sec-device-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 7px;
  border: 1px solid rgba(128, 128, 128, 0.18);
  transition: all 0.15s ease;
}

.ms-sec-device-item.drop-hover {
  border-color: #38bdf8;
  background: rgba(56, 189, 248, 0.15);
}

.ms-sec-icon {
  font-size: 16px;
  flex-shrink: 0;
  display: inline-flex;
}

.ms-sec-info {
  flex: 1;
  min-width: 0;
}

.ms-sec-name {
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
}

.ms-name-full {
  display: block;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.ms-sec-tags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 3px;
}

.ms-badge-app,
.ms-badge-local {
  font-size: 9px;
  padding: 0 5px;
  border-radius: 4px;
  flex-shrink: 0;
}

.ms-badge-app {
  background: rgba(64, 158, 255, 0.16);
  color: var(--themeColor, #409eff);
}

.ms-badge-app.marktextpro {
  background: rgba(168, 85, 247, 0.16);
  color: #a855f7;
}

.ms-badge-local {
  background: rgba(16, 185, 129, 0.16);
  color: #10b981;
}

.ms-sec-ip {
  font-size: 10px;
  opacity: 0.65;
}
</style>
