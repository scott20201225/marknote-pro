<template>
  <el-dialog
    v-model="visible"
    :title="t('markShare.pickerTitle')"
    width="500px"
    append-to-body
    class="markshare-dialog"
    @close="handleClose"
  >
    <div class="ms-picker-body">
      <div class="ms-picker-target">
        <span class="ms-target-label">{{ t('markShare.sendingTarget') }}：</span>
        <span class="ms-target-name" :title="markShareStore.pickerLabel">
          {{ markShareStore.pickerLabel }}
        </span>
      </div>

      <div class="ms-picker-toolbar">
        <span class="ms-device-count">
          {{ t('markShare.onlineDevicesCount', { count: markShareStore.devices.length }) }}
        </span>
        <button type="button" class="ms-refresh-link" @click="markShareStore.refreshDevices">
          {{ t('markShare.refresh') }}
        </button>
      </div>

      <div v-if="markShareStore.devices.length === 0" class="ms-empty-box">
        <div class="ms-empty-title">{{ t('markShare.noDevicesTitle') }}</div>
        <div class="ms-empty-desc">{{ t('markShare.noDevicesDesc') }}</div>
      </div>

      <div v-else class="ms-device-list">
        <div
          v-for="device in markShareStore.devices"
          :key="device.peerKey"
          class="ms-device-row"
          :class="{ selected: selectedIds.includes(device.peerKey) }"
          @click="toggleSelect(device.peerKey)"
        >
          <div class="ms-row-left">
            <span class="ms-row-icon-wrap">
              <os-device-icon :os-type="device.osType" />
            </span>
            <div class="ms-row-info">
              <div class="ms-row-name-line">
                <span class="ms-row-name" :title="device.deviceName">{{ device.deviceName }}</span>
              </div>
              <div class="ms-row-badges">
                <span v-if="device.isSameHost" class="ms-tag-local">{{ t('markShare.localHost') }}</span>
                <span class="ms-tag-app" :class="device.appType">
                  {{ device.appType === 'marktextpro' ? 'MarkTextPro' : 'MarkNotePro' }}
                </span>
                <span class="ms-row-sub-inline">
                  {{ osLabel(device.osType) }} · {{ device.hostIp }}
                  <template v-if="device.hostname && device.hostname !== device.deviceName">
                    · {{ device.hostname }}
                  </template>
                </span>
              </div>
            </div>
          </div>
          <div class="ms-row-check">
            <span class="ms-check-dot" :class="{ checked: selectedIds.includes(device.peerKey) }">
              <span v-if="selectedIds.includes(device.peerKey)">✓</span>
            </span>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="ms-picker-footer">
        <el-button @click="handleClose">{{ t('common.cancel') }}</el-button>
        <el-button
          type="primary"
          :disabled="selectedIds.length === 0 || sending"
          :loading="sending"
          @click="handleConfirm"
        >
          {{ t('markShare.confirmSend') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import bus from '@/bus'
import { useMarkShareStore } from '@/store/markShare'
import type { MarkShareOsType } from '@shared/types/markShare'
import OsDeviceIcon from './OsDeviceIcon.vue'

const { t } = useI18n()
const markShareStore = useMarkShareStore()

const selectedIds = ref<string[]>([])
const sending = ref(false)

const visible = computed({
  get: () => markShareStore.pickerVisible,
  set: (val: boolean) => {
    if (!val) markShareStore.closeDevicePicker()
  }
})

watch(visible, (val) => {
  if (val) {
    bus.emit('host-overlay:show', 'markshare-picker-modal')
    void markShareStore.refreshDevices()
    if (markShareStore.devices.length === 1) {
      selectedIds.value = [markShareStore.devices[0]!.peerKey]
    } else {
      selectedIds.value = []
    }
  } else {
    bus.emit('host-overlay:hide', 'markshare-picker-modal')
  }
})

const osLabel = (osType: MarkShareOsType): string => {
  if (osType === 'darwin') return 'macOS'
  if (osType === 'win32') return 'Windows'
  return 'Linux'
}

const toggleSelect = (instanceId: string): void => {
  const idx = selectedIds.value.indexOf(instanceId)
  if (idx >= 0) {
    selectedIds.value.splice(idx, 1)
  } else {
    selectedIds.value.push(instanceId)
  }
}

const handleClose = (): void => {
  markShareStore.closeDevicePicker()
}

const handleConfirm = async (): Promise<void> => {
  if (selectedIds.value.length === 0 || markShareStore.pickerPaths.length === 0) return
  sending.value = true
  try {
    await markShareStore.sendToDevices(selectedIds.value, markShareStore.pickerPaths)
    markShareStore.showNotice('info', t('markShare.offerSentToast'))
    markShareStore.closeDevicePicker()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    markShareStore.showNotice('error', msg)
  } finally {
    sending.value = false
  }
}
</script>

<style scoped>
.ms-picker-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ms-picker-target {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--itemBgColor, rgba(128, 128, 128, 0.08));
  font-size: 13px;
}

.ms-target-label {
  flex-shrink: 0;
  opacity: 0.72;
}

.ms-target-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ms-picker-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  opacity: 0.8;
}

.ms-refresh-link {
  border: none;
  background: transparent;
  color: var(--themeColor, #409eff);
  cursor: pointer;
  padding: 2px 4px;
  font-size: 12px;
}

.ms-empty-box {
  text-align: center;
  padding: 24px 12px;
  border: 1px dashed rgba(128, 128, 128, 0.25);
  border-radius: 8px;
}

.ms-empty-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
}

.ms-empty-desc {
  font-size: 12px;
  opacity: 0.7;
  line-height: 1.5;
}

.ms-device-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 280px;
  overflow-y: auto;
}

.ms-device-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(128, 128, 128, 0.22);
  cursor: pointer;
  transition: all 0.15s ease;
}

.ms-device-row:hover {
  border-color: var(--themeColor, #409eff);
  background: rgba(64, 158, 255, 0.06);
}

.ms-device-row.selected {
  border-color: var(--themeColor, #409eff);
  background: rgba(64, 158, 255, 0.12);
}

.ms-row-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.ms-row-icon-wrap {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: rgba(128, 128, 128, 0.12);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}

.ms-row-info {
  min-width: 0;
}

.ms-row-name-line {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
}

.ms-row-name {
  display: block;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.ms-row-badges {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 4px;
}

.ms-tag-app,
.ms-tag-local {
  font-size: 10px;
  padding: 1px 6px;
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

.ms-row-sub-inline {
  font-size: 11px;
  opacity: 0.68;
}

.ms-check-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1.5px solid rgba(128, 128, 128, 0.45);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
}

.ms-check-dot.checked {
  background: var(--themeColor, #409eff);
  border-color: var(--themeColor, #409eff);
  color: #fff;
}

.ms-picker-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
