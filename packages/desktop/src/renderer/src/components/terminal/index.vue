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
        <span class="session-title-text" :title="currentSession?.title || file?.filename || t('terminal.title')">
          {{ currentSession?.title || file?.filename || t('terminal.title') }}
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
          {{ t('terminal.reconnect') }}
        </el-button>
      </div>

      <div class="header-right-tools">
        <!-- SFTP Toggle (SSH only) -->
        <el-tooltip :content="t('terminal.sftp.tooltip')" placement="bottom" :show-after="400">
          <el-button
            v-if="currentSession?.config.type === 'ssh'"
            size="small"
            :type="isCurrentSftpOpen ? 'primary' : 'default'"
            :icon="FolderOpened"
            @click="toggleSftpDrawer"
          >
            SFTP
          </el-button>
        </el-tooltip>

        <!-- Clear Terminal Screen -->
        <el-tooltip :content="t('terminal.clearScreen')" placement="bottom" :show-after="400">
          <el-button
            size="small"
            :icon="Delete"
            circle
            @click="clearActiveTerminal"
          />
        </el-tooltip>

        <!-- Search in Terminal -->
        <el-tooltip :content="t('terminal.search')" placement="bottom" :show-after="400">
          <el-button
            size="small"
            :icon="Search"
            circle
            @click="searchActiveTerminal"
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

      <div class="terminal-body-container">
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
              <h3>{{ t('terminal.noSessionTitle') }}</h3>
              <p>{{ t('terminal.noSessionDesc') }}</p>
            </div>
          </div>
        </div>

        <!-- Multi-session SFTP Drawers (Preserves each session's drawer state, hidden when inactive) -->
        <template v-for="session in sessions" :key="session.id">
          <SftpDrawer
            v-if="session.config.type === 'ssh' && terminalStore.hasEverOpenedSftp(session.id)"
            :visible="session.id === currentSessionId && terminalStore.isSftpOpen(session.id)"
            :session-id="session.id"
            :session-status="session.status"
            @close="terminalStore.setSftpOpen(session.id, false)"
          />
        </template>
      </div>
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
import { t } from '@/i18n'
import { useTerminalStore } from '@/store/terminal'
import { useEditorStore } from '@/store/editor'
import bus from '@/bus'
import type { IFileState } from '@shared/types/files'
import type { ITerminalConnectionConfig, ITerminalSessionInfo } from '@shared/types/terminal'

import TerminalCanvas from './TerminalCanvas.vue'
import StatsBar from './StatsBar.vue'
import SftpDrawer from './SFTPDrawer.vue'
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
  sessionStats
} = storeToRefs(terminalStore)

const newConnDialogRef = ref<InstanceType<typeof NewConnectionDialog> | null>(null)
const canvasRefs = new Map<string, any>()

const currentSessionId = computed<string>(() => {
  if (props.file?.terminalSessionId) {
    return props.file.terminalSessionId
  }
  return activeSessionId.value
})

const isCurrentSftpOpen = computed(() => {
  if (!currentSessionId.value) return false
  return terminalStore.isSftpOpen(currentSessionId.value)
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
  if (s === 'connected') return t('terminal.status.connected')
  if (s === 'connecting') return t('terminal.status.connecting')
  if (s === 'error') return `${t('terminal.status.error')}: ${currentSession.value?.error || ''}`
  return t('terminal.status.disconnected')
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

function toggleSftpDrawer(): void {
  if (!currentSessionId.value) return
  terminalStore.toggleSftp(currentSessionId.value)
}

function closeSftpDrawer(): void {
  if (!currentSessionId.value) return
  terminalStore.setSftpOpen(currentSessionId.value, false)
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
      title: session.title ? `${proto}: ${session.title}` : `${proto}: ${config.name || config.host || t('terminal.title')}`,
      config: JSON.parse(JSON.stringify(config))
    })
  } catch (err: any) {
    ElMessage.error(t('terminal.connectionFailed', { error: err?.message || err }))
  }
}

async function reconnectSession(session: ITerminalSessionInfo): Promise<void> {
  try {
    if (!session.config && props.file?.terminalConfig) {
      session.config = props.file.terminalConfig
    }
    await terminalStore.reconnect(session.id)
  } catch (err: any) {
    ElMessage.error(t('terminal.reconnectFailed', { error: err?.message || err }))
  }
}

onMounted(() => {
  terminalStore.initIpcListeners()
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

.terminal-main-workspace {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
  position: relative;
  overflow: hidden;
  background: var(--editorBgColor, #1e1e1e);
}

.terminal-body-container {
  display: flex;
  flex-direction: row;
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
  background: var(--editorBgColor, #1e1e1e);
}

.terminal-canvas-slot {
  width: 100%;
  height: 100%;
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--editorBgColor, #1e1e1e);
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
