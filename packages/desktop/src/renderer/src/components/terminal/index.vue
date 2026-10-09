<template>
  <div class="terminal-view-container">
    <!-- Slim Top Controls Bar -->
    <div class="terminal-control-header">
      <div class="header-left-info">
        <span
          class="session-status-dot"
          :class="currentSession?.status || 'disconnected'"
          :title="statusTitle"
        />
        <span class="session-protocol-badge" :class="currentSession?.config.type || 'ssh'">
          {{ (currentSession?.config.type || 'SSH').toUpperCase() }}
        </span>
        <span class="session-title-text" :title="currentSession?.title || file?.filename || '终端'">
          {{ currentSession?.title || file?.filename || '终端' }}
        </span>
        <span v-if="currentSession?.config.host" class="session-host-text">
          ({{ currentSession.config.username ? `${currentSession.config.username}@` : '' }}{{ currentSession.config.host }}{{ currentSession.config.port ? `:${currentSession.config.port}` : '' }})
        </span>
        <el-button
          v-if="currentSession && (currentSession.status === 'disconnected' || currentSession.status === 'error')"
          size="small"
          type="primary"
          link
          @click="reconnectSession(currentSession)"
        >
          重新连接
        </el-button>
      </div>

      <div class="header-right-tools">
        <!-- Tabby 190+ Themes Selector -->
        <el-select
          v-model="selectedThemeName"
          size="small"
          filterable
          placeholder="终端主题"
          class="terminal-theme-select"
          @change="onThemeSelect"
        >
          <el-option label="✨ 自动适配皮肤主题 (推荐)" value="auto" />
          <el-option-group label="Tabby 官方色盘 (190+ 款)">
            <el-option
              v-for="t in allThemes"
              :key="t.name"
              :label="t.name"
              :value="t.name"
            >
              <div class="theme-option-row">
                <span>{{ t.name }}</span>
                <span class="theme-color-chip" :style="{ background: t.background, borderColor: t.foreground }" />
              </div>
            </el-option>
          </el-option-group>
        </el-select>

        <!-- SFTP Toggle (SSH only) -->
        <el-button
          v-if="currentSession?.config.type === 'ssh'"
          size="small"
          :type="sftpDrawerVisible ? 'primary' : 'default'"
          :icon="FolderOpened"
          @click="toggleSftpDrawer"
        >
          SFTP
        </el-button>

        <!-- Clear Terminal Screen -->
        <el-tooltip content="清屏" placement="bottom" :show-after="400">
          <el-button
            size="small"
            :icon="Delete"
            circle
            @click="clearActiveTerminal"
          />
        </el-tooltip>

        <!-- Search in Terminal -->
        <el-tooltip content="在终端中查找" placement="bottom" :show-after="400">
          <el-button
            size="small"
            :icon="Search"
            circle
            @click="searchActiveTerminal"
          />
        </el-tooltip>

        <!-- New Connection Button -->
        <el-tooltip content="新建连接" placement="bottom" :show-after="400">
          <el-button
            size="small"
            :icon="Plus"
            circle
            @click="openNewConnectionDialog"
          />
        </el-tooltip>
      </div>
    </div>

    <!-- Main Canvas Area -->
    <div class="terminal-main-workspace">
      <!-- Linux Hardware Stats Monitor Banner -->
      <stats-bar
        v-if="currentSession?.config.type === 'ssh' && currentActiveStats"
        :stats="currentActiveStats"
      />

      <!-- Multi-session Canvas Viewport -->
      <div class="terminals-viewport">
        <template v-if="sessions.length > 0">
          <div
            v-for="session in sessions"
            :key="session.id"
            class="terminal-canvas-slot"
            v-show="session.id === currentSessionId"
          >
            <terminal-canvas
              :ref="(el) => setCanvasRef(session.id, el)"
              :session="session"
              :is-active="session.id === currentSessionId"
              @reconnect="reconnectSession"
            />
          </div>
        </template>

        <!-- No session state -->
        <div v-if="!currentSession" class="terminal-not-found-state">
          <div class="empty-card">
            <el-icon :size="48" class="empty-icon"><Monitor /></el-icon>
            <h3>终端会话未连接或已关闭</h3>
            <p>您可以新建连接，或在 KDBX 密码库中点击“直连终端”</p>
            <el-button type="primary" size="small" :icon="Plus" @click="openNewConnectionDialog">
              新建终端连接
            </el-button>
          </div>
        </div>
      </div>

      <!-- SFTP Drawer -->
      <sftp-drawer
        v-if="sftpDrawerVisible && currentSession?.config.type === 'ssh'"
        :visible="sftpDrawerVisible"
        :session-id="currentSessionId"
        @close="sftpDrawerVisible = false"
      />
    </div>

    <!-- Dialogs -->
    <new-connection-dialog ref="newConnDialogRef" @connect="handleConnectNew" />
    <two-factor-dialog />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import {
  Plus,
  Monitor,
  FolderOpened,
  Delete,
  Search
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useTerminalStore } from '@/store/terminal'
import { useEditorStore } from '@/store/editor'
import { TABBY_COLOR_SCHEMES } from '@shared/terminalThemes'
import bus from '@/bus'
import type { IFileState } from '@shared/types/files'
import type { ITerminalConnectionConfig, ITerminalSessionInfo } from '@shared/types/terminal'

import TerminalCanvas from './TerminalCanvas.vue'
import StatsBar from './StatsBar.vue'
import SFTPDrawer from './SFTPDrawer.vue'
import NewConnectionDialog from './NewConnectionDialog.vue'
import TwoFactorDialog from './TwoFactorDialog.vue'

const props = defineProps<{
  file?: IFileState | null
}>()

const terminalStore = useTerminalStore()
const editorStore = useEditorStore()

const {
  sessions,
  activeSessionId,
  sessionStats,
  selectedThemeName,
  sftpDrawerVisible
} = storeToRefs(terminalStore)

const newConnDialogRef = ref<InstanceType<typeof NewConnectionDialog> | null>(null)
const canvasRefs = new Map<string, any>()
const allThemes = TABBY_COLOR_SCHEMES

const currentSessionId = computed<string>(() => {
  if (props.file?.terminalSessionId) {
    return props.file.terminalSessionId
  }
  return activeSessionId.value
})

const currentSession = computed<ITerminalSessionInfo | null>(() => {
  const targetId = currentSessionId.value
  if (!targetId) return null
  return sessions.value.find((s) => s.id === targetId) || null
})

const currentActiveStats = computed(() => {
  const targetId = currentSessionId.value
  if (!targetId) return null
  return sessionStats.value[targetId] || null
})

const statusTitle = computed(() => {
  const s = currentSession.value?.status
  if (s === 'connected') return '已连接'
  if (s === 'connecting') return '正在连接...'
  if (s === 'error') return `连接错误: ${currentSession.value?.error || ''}`
  return '已断开'
})

watch(
  () => props.file?.terminalSessionId,
  (newSessionId) => {
    if (newSessionId) {
      terminalStore.activeSessionId = newSessionId
    }
  },
  { immediate: true }
)

function setCanvasRef(sessionId: string, el: any): void {
  if (el) {
    canvasRefs.set(sessionId, el)
  } else {
    canvasRefs.delete(sessionId)
  }
}

function onThemeSelect(name: string): void {
  terminalStore.setTheme(name)
}

function toggleSftpDrawer(): void {
  terminalStore.sftpDrawerVisible = !terminalStore.sftpDrawerVisible
}

function clearActiveTerminal(): void {
  const activeId = currentSessionId.value
  if (activeId && canvasRefs.has(activeId)) {
    canvasRefs.get(activeId).clear?.()
  }
}

function searchActiveTerminal(): void {
  const activeId = currentSessionId.value
  if (activeId && canvasRefs.has(activeId)) {
    canvasRefs.get(activeId).toggleSearch?.()
  }
}

function openNewConnectionDialog(): void {
  newConnDialogRef.value?.open()
}

async function handleConnectNew(config: ITerminalConnectionConfig): Promise<void> {
  try {
    const session = await terminalStore.connect(config)
    const proto = (session?.type || config?.type || 'ssh').toUpperCase()
    editorStore.OPEN_TERMINAL_TAB({
      sessionId: session.id,
      title: session.title ? `${proto}: ${session.title}` : `${proto}: ${config.name || config.host || '终端'}`
    })
  } catch (err: any) {
    ElMessage.error(`连接失败: ${err?.message || err}`)
  }
}

async function reconnectSession(session: ITerminalSessionInfo): Promise<void> {
  try {
    await terminalStore.connect(session.config)
  } catch (err: any) {
    ElMessage.error(`重连失败: ${err?.message || err}`)
  }
}

onMounted(() => {
  terminalStore.init()
  bus.on('open-terminal-dialog', openNewConnectionDialog)
})

onBeforeUnmount(() => {
  bus.off('open-terminal-dialog', openNewConnectionDialog)
})
</script>

<style scoped>
.terminal-view-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  flex: 1;
  min-height: 0;
  min-width: 0;
  position: relative;
  overflow: hidden;
  background: var(--editorBgColor, #1e1e1e);
  color: var(--editorColor, #e0e0e0);
}

.terminal-control-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 36px;
  min-height: 36px;
  padding: 0 12px;
  background: var(--editorBgColor, #1e1e1e);
  border-bottom: 1px solid var(--itemBgColor, #2d3139);
  user-select: none;
  gap: 12px;
}

.header-left-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
}

.session-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: #909399;
}

.session-status-dot.connected {
  background: #67c23a;
  box-shadow: 0 0 6px #67c23a;
}

.session-status-dot.connecting {
  background: #e6a23c;
  box-shadow: 0 0 6px #e6a23c;
  animation: pulse-dot 1.5s infinite;
}

.session-status-dot.error,
.session-status-dot.disconnected {
  background: #f56c6c;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.85); }
}

.session-protocol-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  text-transform: uppercase;
  flex-shrink: 0;
}

.session-protocol-badge.ssh {
  background: rgba(64, 158, 255, 0.18);
  color: #409eff;
  border: 1px solid rgba(64, 158, 255, 0.35);
}

.session-protocol-badge.telnet {
  background: rgba(230, 162, 60, 0.18);
  color: #e6a23c;
  border: 1px solid rgba(230, 162, 60, 0.35);
}

.session-protocol-badge.serial {
  background: rgba(103, 194, 58, 0.18);
  color: #67c23a;
  border: 1px solid rgba(103, 194, 58, 0.35);
}

.session-protocol-badge.rawSocket {
  background: rgba(144, 147, 153, 0.18);
  color: #909399;
  border: 1px solid rgba(144, 147, 153, 0.35);
}

.session-title-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--editorColor, #e0e0e0);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-host-text {
  font-size: 12px;
  color: var(--editorColor50, #888);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-right-tools {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.terminal-theme-select {
  width: 170px;
}

.theme-option-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.theme-color-chip {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1px solid #666;
  flex-shrink: 0;
}

.terminal-main-workspace {
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
  position: relative;
  overflow: hidden;
}

.terminals-viewport {
  flex: 1;
  min-height: 0;
  min-width: 0;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.terminal-canvas-slot {
  width: 100%;
  height: 100%;
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.terminal-not-found-state {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: var(--editorBgColor, #1e1e1e);
}

.empty-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 40px;
  background: var(--sideBarBgColor, #25282c);
  border: 1px solid var(--itemBgColor, #333);
  border-radius: 8px;
  text-align: center;
}

.empty-icon {
  color: var(--editorColor50, #888);
}

.empty-card h3 {
  margin: 0;
  font-size: 16px;
  color: var(--editorColor, #e0e0e0);
}

.empty-card p {
  margin: 0;
  font-size: 13px;
  color: var(--editorColor50, #888);
}
</style>
