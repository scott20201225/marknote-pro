<template>
  <teleport to="body">
    <transition name="ms-radar-fade">
      <div
        v-if="markShareStore.dragRadarVisible"
        ref="radarFloatRef"
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

        <div v-else class="ms-radar-scroll-wrap">
          <div
            v-if="canScrollUp"
            class="ms-scroll-edge top"
            :class="{ active: autoScrollDir === -1 }"
          >
            <span class="ms-scroll-chevron">▲</span>
          </div>
          <div
            ref="scrollContainerRef"
            class="ms-radar-scroll"
            @scroll="syncScrollBounds"
          >
            <div class="ms-radar-grid" :style="dynamicGridStyle">
              <div
                v-for="device in markShareStore.devices"
                :key="device.peerKey"
                class="ms-radar-device-item"
                :class="{ hovered: hoveredId === device.peerKey }"
                @dragenter.prevent.stop="onCircleEnter(device.peerKey, $event)"
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
          <div
            v-if="canScrollDown"
            class="ms-scroll-edge bottom"
            :class="{ active: autoScrollDir === 1 }"
          >
            <span class="ms-scroll-chevron">▼</span>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import bus from '@/bus'
import { useMarkShareStore } from '@/store/markShare'
import type { MarkShareOsType } from '@shared/types/markShare'
import OsDeviceIcon from './OsDeviceIcon.vue'

const { t } = useI18n()
const markShareStore = useMarkShareStore()
const hoveredId = ref<string | null>(null)
const radarFloatRef = ref<HTMLElement | null>(null)
const scrollContainerRef = ref<HTMLElement | null>(null)
const canScrollUp = ref(false)
const canScrollDown = ref(false)
const autoScrollDir = ref<-1 | 0 | 1>(0)

let autoScrollRaf: number | null = null
let lastFrameTime = 0
let lastPointerY: number | null = null
let scrollRemainder = 0
let windowListenersAttached = false

const syncScrollBounds = (): void => {
  const el = scrollContainerRef.value
  if (!el) {
    canScrollUp.value = false
    canScrollDown.value = false
    return
  }
  const maxScrollTop = el.scrollHeight - el.clientHeight
  canScrollUp.value = el.scrollTop > 1
  canScrollDown.value = maxScrollTop > 2 && el.scrollTop < maxScrollTop - 1
}

const computeAutoScroll = (clientY: number): { dir: -1 | 0 | 1; speed: number } => {
  const floatEl = radarFloatRef.value
  const scrollEl = scrollContainerRef.value
  if (!floatEl || !scrollEl) return { dir: 0, speed: 0 }

  const maxScrollTop = scrollEl.scrollHeight - scrollEl.clientHeight
  if (maxScrollTop <= 2) return { dir: 0, speed: 0 }

  const floatRect = floatEl.getBoundingClientRect()
  const scrollRect = scrollEl.getBoundingClientRect()
  const hotZone = Math.min(60, Math.max(44, scrollRect.height * 0.25))

  const upperThreshold = scrollRect.top + hotZone
  if (clientY <= upperThreshold && clientY >= floatRect.top - 8 && scrollEl.scrollTop > 0.5) {
    const depth = Math.min(1, Math.max(0, (upperThreshold - clientY) / hotZone))
    const speed = 220 + 400 * Math.pow(depth, 1.15)
    return { dir: -1, speed }
  }

  const lowerThreshold = scrollRect.bottom - hotZone
  if (
    clientY >= lowerThreshold &&
    clientY <= floatRect.bottom + 8 &&
    scrollEl.scrollTop < maxScrollTop - 0.5
  ) {
    const depth = Math.min(1, Math.max(0, (clientY - lowerThreshold) / hotZone))
    const speed = 220 + 400 * Math.pow(depth, 1.15)
    return { dir: 1, speed }
  }

  return { dir: 0, speed: 0 }
}

const stopAutoScroll = (): void => {
  if (autoScrollRaf !== null) {
    cancelAnimationFrame(autoScrollRaf)
    autoScrollRaf = null
  }
  lastFrameTime = 0
  lastPointerY = null
  scrollRemainder = 0
  autoScrollDir.value = 0
}

const stepAutoScroll = (now: number): void => {
  autoScrollRaf = null
  if (!markShareStore.dragRadarVisible || lastPointerY === null) {
    stopAutoScroll()
    return
  }

  const scrollEl = scrollContainerRef.value
  if (!scrollEl) {
    stopAutoScroll()
    return
  }

  const { dir, speed } = computeAutoScroll(lastPointerY)
  if (dir === 0 || speed <= 0) {
    autoScrollDir.value = 0
    lastFrameTime = 0
    scrollRemainder = 0
    syncScrollBounds()
    return
  }

  autoScrollDir.value = dir
  const dt = lastFrameTime > 0 ? Math.min(0.05, (now - lastFrameTime) / 1000) : 1 / 60
  lastFrameTime = now

  const step = dir * speed * dt + scrollRemainder
  const whole = step > 0 ? Math.floor(step) : Math.ceil(step)
  scrollRemainder = step - whole
  if (whole !== 0) {
    scrollEl.scrollTop += whole
    syncScrollBounds()
  }

  const stillNeeded = computeAutoScroll(lastPointerY)
  if (stillNeeded.dir !== 0) {
    autoScrollRaf = requestAnimationFrame(stepAutoScroll)
  } else {
    autoScrollDir.value = 0
    lastFrameTime = 0
    scrollRemainder = 0
    syncScrollBounds()
  }
}

const updateDragScrollFromEvent = (e: DragEvent): void => {
  if (e.clientX === 0 && e.clientY === 0) return
  lastPointerY = e.clientY
  const { dir } = computeAutoScroll(e.clientY)
  autoScrollDir.value = dir
  if (dir === 0) {
    if (autoScrollRaf !== null) {
      cancelAnimationFrame(autoScrollRaf)
      autoScrollRaf = null
    }
    lastFrameTime = 0
    scrollRemainder = 0
    return
  }
  if (autoScrollRaf === null) {
    lastFrameTime = performance.now()
    autoScrollRaf = requestAnimationFrame(stepAutoScroll)
  }
}

const onWindowDragOverCapture = (e: DragEvent): void => {
  const floatEl = radarFloatRef.value
  if (!floatEl || !(e.target instanceof Node) || !floatEl.contains(e.target)) {
    stopAutoScroll()
  }
}

const onWindowDragFinish = (): void => {
  stopAutoScroll()
}

const attachWindowListeners = (): void => {
  if (windowListenersAttached) return
  windowListenersAttached = true
  window.addEventListener('dragover', onWindowDragOverCapture, true)
  window.addEventListener('dragend', onWindowDragFinish, true)
  window.addEventListener('drop', onWindowDragFinish, true)
  window.addEventListener('blur', onWindowDragFinish)
}

const detachWindowListeners = (): void => {
  if (!windowListenersAttached) return
  windowListenersAttached = false
  window.removeEventListener('dragover', onWindowDragOverCapture, true)
  window.removeEventListener('dragend', onWindowDragFinish, true)
  window.removeEventListener('drop', onWindowDragFinish, true)
  window.removeEventListener('blur', onWindowDragFinish)
}

watch(
  () => markShareStore.dragRadarVisible,
  (visible) => {
    if (visible) {
      hoveredId.value = null
      attachWindowListeners()
      bus.emit('host-overlay:show', 'markshare-drag-radar')
      void markShareStore.refreshDevices()
      void nextTick(() => syncScrollBounds())
    } else {
      hoveredId.value = null
      stopAutoScroll()
      detachWindowListeners()
      bus.emit('host-overlay:hide', 'markshare-drag-radar')
    }
  }
)

watch(
  () => markShareStore.devices.length,
  () => {
    if (markShareStore.dragRadarVisible) {
      void nextTick(() => syncScrollBounds())
    }
  }
)

onBeforeUnmount(() => {
  stopAutoScroll()
  detachWindowListeners()
})

const columnCount = computed(() => {
  const n = markShareStore.devices.length
  if (n <= 1) return 1
  if (n === 2) return 2
  return 3
})

const dynamicContainerStyle = computed(() => {
  const n = markShareStore.devices.length
  const cols = columnCount.value
  const widthPx = n === 0 ? 400 : Math.min(760, Math.max(400, cols * 232 + 56))
  return {
    width: `${widthPx}px`
  }
})

const dynamicGridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${columnCount.value}, minmax(0, 1fr))`
}))

const osShort = (os: MarkShareOsType): string => {
  if (os === 'darwin') return 'macOS'
  if (os === 'win32') return 'Win'
  return 'Linux'
}

const onRadarEnter = (e: DragEvent): void => {
  bus.emit('importDialog', false)
  updateDragScrollFromEvent(e)
}

const onRadarOver = (e: DragEvent): void => {
  bus.emit('importDialog', false)
  updateDragScrollFromEvent(e)
  if (markShareStore.dragRadarVisible) {
    markShareStore.showDragRadar(markShareStore.dragRadarPaths, markShareStore.dragRadarIsExternal)
  }
}

const onRadarLeave = (e: DragEvent): void => {
  const floatEl = radarFloatRef.value
  if (!floatEl) {
    stopAutoScroll()
    return
  }
  if (e.relatedTarget instanceof Node && floatEl.contains(e.relatedTarget)) {
    return
  }
  const rect = floatEl.getBoundingClientRect()
  const insideRect =
    e.clientX >= rect.left &&
    e.clientX <= rect.right &&
    e.clientY >= rect.top &&
    e.clientY <= rect.bottom
  if (!insideRect || e.relatedTarget !== null) {
    stopAutoScroll()
  }
}

const onRadarDropFallback = (): void => {
  hoveredId.value = null
  stopAutoScroll()
  markShareStore.hideDragRadarNow()
}

const onCircleEnter = (instanceId: string, e: DragEvent): void => {
  hoveredId.value = instanceId
  bus.emit('importDialog', false)
  updateDragScrollFromEvent(e)
}

const onCircleOver = (instanceId: string, e: DragEvent): void => {
  hoveredId.value = instanceId
  bus.emit('importDialog', false)
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy'
  }
  updateDragScrollFromEvent(e)
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
  stopAutoScroll()
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
  display: flex;
  flex-direction: column;
  padding: 18px 22px 20px;
  border-radius: 20px;
  background: var(--floatBgColor, rgba(24, 28, 38, 0.94));
  color: var(--sideBarTitleColor, #f3f4f6);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(148, 163, 184, 0.32);
  box-shadow: 0 24px 56px rgba(0, 0, 0, 0.42);
  max-width: 92vw;
  max-height: 80vh;
  box-sizing: border-box;
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
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
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

.ms-radar-scroll-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ms-radar-scroll {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  max-height: min(396px, calc(78vh - 84px));
  overflow-x: hidden;
  overflow-y: auto;
}

.ms-scroll-edge {
  position: absolute;
  left: 0;
  right: 10px;
  height: 22px;
  pointer-events: none;
  z-index: 3;
  display: flex;
  justify-content: center;
  border-radius: 8px;
  color: rgba(148, 163, 184, 0.72);
  transition: background 0.14s ease, color 0.14s ease;
}

.ms-scroll-edge.top {
  top: 0;
  align-items: flex-start;
  padding-top: 2px;
  background: linear-gradient(to bottom, rgba(148, 163, 184, 0.14), transparent);
}

.ms-scroll-edge.bottom {
  bottom: 0;
  align-items: flex-end;
  padding-bottom: 2px;
  background: linear-gradient(to top, rgba(148, 163, 184, 0.14), transparent);
}

.ms-scroll-edge.top.active {
  color: #38bdf8;
  background: linear-gradient(to bottom, rgba(56, 189, 248, 0.24), transparent);
}

.ms-scroll-edge.bottom.active {
  color: #38bdf8;
  background: linear-gradient(to top, rgba(56, 189, 248, 0.24), transparent);
}

.ms-scroll-chevron {
  font-size: 9px;
  line-height: 1;
}

.ms-radar-grid {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  display: grid;
  grid-auto-rows: max-content;
  gap: 14px;
  padding: 6px 4px;
  justify-items: stretch;
  align-content: start;
}

.ms-radar-device-item {
  box-sizing: border-box;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  min-height: 156px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 14px 12px;
  border-radius: 16px;
  border: 1.5px dashed rgba(148, 163, 184, 0.32);
  background: rgba(148, 163, 184, 0.06);
  transition: background-color 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}

.ms-radar-device-item.hovered {
  border-style: solid;
  border-color: #38bdf8;
  background: rgba(56, 189, 248, 0.18);
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.25), 0 8px 20px rgba(56, 189, 248, 0.2);
}

.ms-device-circle {
  position: relative;
  flex-shrink: 0;
  width: 72px;
  height: 72px;
  min-width: 72px;
  min-height: 72px;
  aspect-ratio: 1 / 1;
  box-sizing: border-box;
  border-radius: 50%;
  background: linear-gradient(145deg, rgba(56, 189, 248, 0.22), rgba(99, 102, 241, 0.22));
  border: 2px solid rgba(148, 163, 184, 0.42);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}

.ms-radar-device-item.hovered .ms-device-circle {
  transform: scale(1.06);
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
  width: 100%;
  font-size: 11px;
  opacity: 0.78;
  text-align: center;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.ms-circle-host {
  margin-top: 2px;
  font-size: 10px;
  opacity: 0.58;
  width: 100%;
  text-align: center;
  word-break: break-word;
  overflow-wrap: anywhere;
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
