<template>
  <div v-if="stats" class="terminal-stats-bar">
    <!-- CPU -->
    <div class="stat-item" :title="t('terminal.stats.cpu', { val: stats.cpuUsage.toFixed(1) })">
      <span class="stat-label">CPU</span>
      <el-progress
        :percentage="Math.min(100, Math.max(0, Math.round(stats.cpuUsage)))"
        :stroke-width="6"
        :color="getProgressColor(stats.cpuUsage)"
        :show-text="false"
        class="stat-progress"
      />
      <span class="stat-value">{{ stats.cpuUsage.toFixed(1) }}%</span>
    </div>

    <!-- RAM -->
    <div
      class="stat-item"
      :title="t('terminal.stats.memory', { used: formatBytes(stats.memoryUsed), total: formatBytes(stats.memoryTotal), percent: stats.memoryPercent.toFixed(1) })"
    >
      <span class="stat-label">RAM</span>
      <el-progress
        :percentage="Math.min(100, Math.max(0, Math.round(stats.memoryPercent)))"
        :stroke-width="6"
        :color="getProgressColor(stats.memoryPercent)"
        :show-text="false"
        class="stat-progress"
      />
      <span class="stat-value">{{ stats.memoryPercent.toFixed(0) }}%</span>
      <span class="stat-sub">({{ formatBytes(stats.memoryUsed) }})</span>
    </div>

    <!-- Load Average -->
    <div v-if="stats.loadAvg" class="stat-item stat-load" :title="t('terminal.stats.load', { load: stats.loadAvg.join(', ') })">
      <span class="stat-label">LOAD</span>
      <span class="stat-value">{{ stats.loadAvg[0] }}</span>
    </div>

    <!-- Network Speed -->
    <div class="stat-item stat-net" :title="t('terminal.stats.netSpeed', { tx: formatSpeed(stats.networkTx), rx: formatSpeed(stats.networkRx) })">
      <span class="stat-label">NET</span>
      <span class="stat-net-val">
        <span class="net-arrow down">↓</span> {{ formatSpeed(stats.networkRx) }}
        <span class="net-arrow up">↑</span> {{ formatSpeed(stats.networkTx) }}
      </span>
    </div>

    <!-- Uptime -->
    <div v-if="stats.uptime" class="stat-item stat-uptime" :title="t('terminal.stats.uptime', { uptime: stats.uptime })">
      <span class="stat-label">UP</span>
      <span class="stat-sub">{{ stats.uptime }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { t } from '@/i18n'
import type { IHardwareStats } from '@shared/types/terminal'

defineProps<{
  stats: IHardwareStats | null | undefined
}>()

function getProgressColor(percent: number): string {
  if (percent > 85) return '#f56c6c'
  if (percent > 65) return '#e6a23c'
  return '#67c23a'
}

function formatBytes(bytes: number): string {
  if (!bytes || isNaN(bytes)) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i]
}

function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 B/s'
  const k = 1024
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s']
  const i = Math.floor(Math.log(bytesPerSec) / Math.log(k))
  return (bytesPerSec / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i]
}
</script>

<style scoped>
.terminal-stats-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 4px 12px;
  background: var(--sideBarBgColor, #1e1e1e);
  border-bottom: 1px solid var(--itemBgColor, #333);
  font-size: 11px;
  color: var(--editorColor, #ccc);
  user-select: none;
  overflow-x: auto;
  flex-shrink: 0;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.stat-label {
  font-weight: 600;
  font-size: 10px;
  letter-spacing: 0.5px;
  color: var(--iconColor, #888);
}

.stat-progress {
  width: 50px;
}

.stat-value {
  font-family: Menlo, Monaco, monospace;
  font-weight: 500;
}

.stat-sub {
  color: var(--iconColor, #888);
  font-size: 10px;
}

.stat-net-val {
  font-family: Menlo, Monaco, monospace;
  display: flex;
  align-items: center;
  gap: 4px;
}

.net-arrow {
  font-weight: bold;
}
.net-arrow.down {
  color: #67c23a;
}
.net-arrow.up {
  color: #409eff;
}
</style>
