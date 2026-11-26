<template>
  <teleport to="body">
    <transition name="ms-radar-fade">
      <div
        v-if="markShareStore.dragRadarVisible"
        class="ms-radar-float"
        :style="dynamicContainerStyle"
        @dragenter.prevent.stop="onRadarEnter"
        @dragover.prevent.stop="onRadarOver"
        @dragleave.stop="onRadarLeave"
        @drop.prevent.stop="onRadarDropFallback"
      >
        <div class="ms-radar-header">
          <div class="ms-radar-title-group">
            <span class="ms-radar-pulse-dot" />
            <span class="ms-radar-title">{{ t('markShare.dropRadarTitle') }}</span>
          </div>
          <span class="ms-radar-hint">
            {{
              markShareStore.devices.length > 0
                ? t('markShare.dropRadarHint')
                : t('markShare.noDevicesTitle')
            }}
          </span>
        </div>

        <div v-if="markShareStore.devices.length === 0" class="ms-radar-empty">
          <div class="ms-radar-empty-circle">
            <span class="ms-radar-wave">📡</span>
          </div>
          <div class="ms-radar-empty-text">{{ t('markShare.noDevicesDesc') }}</div>
        </div>

        <div v-else class="ms-radar-grid" :style="dynamicGridStyle">
          <div
            v-for="device in markShareStore.devices"
            :key="device.peerKey"
            class="ms-radar-device-item"
            :class="{ hovered: hoveredId === device.peerKey }"
            @dragenter.prevent.stop="onCircleEnter(device.peerKey)"
            @dragover.prevent.stop="onCircleOver(device.peerKey, $event)"
            @dragleave.stop="onCircleLeave(device.peerKey)"
            @drop.prevent.stop="onCircleDrop(device.peerKey, $event)"
          >
            <div class="ms-device-circle">
              <div class="ms-circle-icon">
                <os-device-icon :os-type="device.osType" />
              </div>
            </div>
            <div class="ms-circle-name" :title="device.deviceName">
              {{ device.deviceName }}
            </div>
            <div class="ms-circle-badges">
              <span v-if="device.isSameHost" class="ms-radar-local">{{ t('markShare.localHost') }}</span>
              <span class="ms-radar-app" :class="device.appType">
                {{ device.appType === 'marktextpro' ? 'MarkTextPro' : 'MarkNotePro' }}
              </span>
            </div>
            <div class="ms-circle-meta">
              {{ osShort(device.osType) }} · {{ device.hostIp }}
            </div>
            <div
              v-if="device.hostname && device.hostname !== device.deviceName"
              class="ms-circle-host"
              :title="device.hostname"
            >
              {{ device.hostname }}
            </div>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
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
const hoveredId = ref<string | null>(null)

watch(
  () => markShareStore.dragRadarVisible,
  (visible) => {
    if (visible) {
      hoveredId.value = null
      bus.emit('host-overlay:show', 'markshare-drag-radar')
      void markShareStore.refreshDevices()
    } else {
      hoveredId.value = null
      bus.emit('host-overlay:hide', 'markshare-drag-radar')
    }
  }
)

const columnCount = computed(() => {
  const n = markShareStore.devices.length
  if (n <= 1) return 1
  if (n === 2) return 2
  return 3
})

const dynamicContainerStyle = computed(() => {
  const cols = columnCount.value
  const n = markShareStore.devices.length
  const widthPx = n === 0 ? 400 : Math.min(780, Math.max(400, cols * 226 + 56))
  return {
    width: `${widthPx}px`
  }
})

const dynamicGridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${columnCount.value}, minmax(208px, 1fr))`
}))

const osShort = (os: MarkShareOsType): string => {
  if (os === 'darwin') return 'macOS'
  if (os === 'win32') return 'Win'
  return 'Linux'
}

const onRadarEnter = (): void => {
  bus.emit('importDialog', false)
}

const onRadarOver = (): void => {
  bus.emit('importDialog', false)
  if (markShareStore.dragRadarVisible) {
    markShareStore.showDragRadar(markShareStore.dragRadarPaths, markShareStore.dragRadarIsExternal)
  }
}

const onRadarLeave = (): void => {
  // Handled gently by global dragleave / drop timer
}

const onRadarDropFallback = (): void => {
  hoveredId.value = null
  markShareStore.hideDragRadarNow()
}

const onCircleEnter = (instanceId: string): void => {
  hoveredId.value = instanceId
  bus.emit('importDialog', false)
}

const onCircleOver = (instanceId: string, e: DragEvent): void => {
  hoveredId.value = instanceId
  bus.emit('importDialog', false)
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy'
  }
  markShareStore.showDragRadar(markShareStore.dragRadarPaths, markShareStore.dragRadarIsExternal)
}

const onCircleLeave = (instanceId: string): void => {
  if (hoveredId.value === instanceId) {
    hoveredId.value = null
  }
}

const extractDroppedPaths = (e: DragEvent): string[] => {
  const paths: string[] = []
  if (e.dataTransfer) {
    const rawInternal = e.dataTransfer.getData('application/x-markshare-paths')
    if (rawInternal) {
      try {
        const parsed = JSON.parse(rawInternal) as string[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed
        }
      } catch {
        // ignore parse error
      }
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      for (const file of Array.from(e.dataTransfer.files)) {
        const resolved = window.electron.webUtils.getPathForFile(file)
        if (resolved) paths.push(resolved)
      }
    }
  }
  if (paths.length === 0 && markShareStore.dragRadarPaths.length > 0) {
    return [...markShareStore.dragRadarPaths]
  }
  return paths
}

const onCircleDrop = async (instanceId: string, e: DragEvent): Promise<void> => {
  hoveredId.value = null
  bus.emit('importDialog', false)
  const paths = extractDroppedPaths(e)
  markShareStore.hideDragRadarNow()

  if (paths.length === 0) {
    markShareStore.showNotice('warning', t('markShare.noValidDropPath'))
    return
  }

  try {
    await markShareStore.sendToDevice(instanceId, paths)
    markShareStore.showNotice('info', t('markShare.offerSentToast'))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    markShareStore.showNotice('error', msg)
  }
}
</script>

<style scoped>
.ms-radar-float {
  position: fixed;
  left: 50%;
  bottom: 36px;
  transform: translateX(-50%);
  z-index: 9998;
  padding: 18px 22px 20px;
  border-radius: 20px;
  background: var(--floatBgColor, rgba(24, 28, 38, 0.94));
  color: var(--sideBarTitleColor, #f3f4f6);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(148, 163, 184, 0.32);
  box-shadow: 0 24px 56px rgba(0, 0, 0, 0.42);
  max-width: 92vw;
  pointer-events: auto;
}

.ms-radar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.ms-radar-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ms-radar-pulse-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #38bdf8;
  box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.25);
}

.ms-radar-title {
  font-size: 13px;
  font-weight: 700;
}

.ms-radar-hint {
  font-size: 11px;
  opacity: 0.72;
}

.ms-radar-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px 6px;
  text-align: center;
}

.ms-radar-empty-circle {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  border: 1.5px dashed rgba(148, 163, 184, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  margin-bottom: 8px;
}

.ms-radar-empty-text {
  font-size: 12px;
  opacity: 0.75;
  line-height: 1.45;
}

.ms-radar-grid {
  display: grid;
  gap: 14px;
  max-height: 360px;
  overflow-y: auto;
  justify-items: stretch;
}

.ms-radar-device-item {
  min-height: 156px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 14px 12px;
  border-radius: 16px;
  border: 1.5px dashed rgba(148, 163, 184, 0.32);
  background: rgba(148, 163, 184, 0.06);
  transition: transform 0.16s ease, background-color 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}

.ms-radar-device-item.hovered {
  transform: scale(1.03);
  border-style: solid;
  border-color: #38bdf8;
  background: rgba(56, 189, 248, 0.18);
  box-shadow: 0 8px 24px rgba(56, 189, 248, 0.22);
}

.ms-device-circle {
  position: relative;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: linear-gradient(145deg, rgba(56, 189, 248, 0.22), rgba(99, 102, 241, 0.22));
  border: 2px solid rgba(148, 163, 184, 0.42);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.16s ease, box-shadow 0.16s ease;
}

.ms-radar-device-item.hovered .ms-device-circle {
  border-color: #38bdf8;
  box-shadow: 0 0 0 6px rgba(56, 189, 248, 0.24);
}

.ms-circle-icon {
  font-size: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ms-circle-name {
  margin-top: 10px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  width: 100%;
  text-align: center;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.ms-circle-badges {
  margin-top: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 5px;
}

.ms-radar-app,
.ms-radar-local {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 5px;
}

.ms-radar-app {
  background: rgba(64, 158, 255, 0.18);
  color: #60a5fa;
}

.ms-radar-app.marktextpro {
  background: rgba(168, 85, 247, 0.18);
  color: #c084fc;
}

.ms-radar-local {
  background: rgba(16, 185, 129, 0.18);
  color: #34d399;
}

.ms-circle-meta {
  margin-top: 4px;
  font-size: 11px;
  opacity: 0.78;
  text-align: center;
  word-break: break-word;
}

.ms-circle-host {
  margin-top: 2px;
  font-size: 10px;
  opacity: 0.58;
  width: 100%;
  text-align: center;
  word-break: break-word;
}

.ms-radar-fade-enter-active,
.ms-radar-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.ms-radar-fade-enter-from,
.ms-radar-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, 12px);
}
</style>
