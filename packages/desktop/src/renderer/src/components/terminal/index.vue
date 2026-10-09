<template>
  <div class="terminal-workbench-shell" :class="{ 'is-osx': isOsx }">
    <!-- macOS Window Drag Region -->
    <div v-if="isOsx" class="terminal-title-drag-region" />

    <!-- Top Navigation & Tabs Bar -->
    <header class="terminal-header">
      <!-- Left Controls: Back to Note & Sidebar Toggle -->
      <div class="header-left-controls">
        <el-button class="back-note-btn" size="small" :icon="Back" @click="switchToNote">
          返回笔记
        </el-button>
        <el-button
          class="sidebar-toggle-btn"
          size="small"
          :icon="sidePanelVisible ? Fold : Expand"
          circle
          title="切换主机列表侧边栏"
          @click="sidePanelVisible = !sidePanelVisible"
        />
        <el-button
          type="primary"
          size="small"
          :icon="Plus"
          @click="openNewConnectionDialog"
        >
          新建连接
        </el-button>
      </div>

      <!-- Center: Session Tabs List -->
      <div class="header-tabs-container">
        <div
          v-for="session in sessions"
          :key="session.id"
          class="session-tab-item"
          :class="{ active: session.id === activeSessionId }"
          @click="activeSessionId = session.id"
        >
          <span class="session-status-dot" :class="session.status" />
          <el-icon class="session-type-icon">
            <Monitor v-if="session.config.type === 'ssh'" />
            <Connection v-else-if="session.config.type === 'telnet'" />
            <Cpu v-else-if="session.config.type === 'serial'" />
            <Share v-else />
          </el-icon>
          <span class="session-tab-title" :title="session.title">
            {{ session.title }}
          </span>
          <el-icon class="tab-close-icon" @click.stop="closeSession(session.id)">
            <Close />
          </el-icon>
        </div>

        <div v-if="sessions.length === 0" class="no-session-tabs">
          暂无活动终端会话
        </div>
      </div>

      <!-- Right Controls: Theme Selector, SFTP Toggle, Stats Toggle -->
      <div class="header-right-controls">
        <!-- Tabby 190+ Themes Selector -->
        <el-select
          v-model="selectedThemeName"
          size="small"
          filterable
          placeholder="选择终端主题"
          class="theme-selector"
          @change="onThemeSelect"
        >
          <el-option label="✨ 自动适配 MarkNote 主题 (推荐)" value="auto" />
          <el-option-group label="Tabby 官方色盘 (190+ 款)">
            <el-option
              v-for="t in allThemes"
              :key="t.name"
              :label="t.name"
              :value="t.name"
            >
              <div class="theme-option-item">
                <span>{{ t.name }}</span>
                <span class="theme-color-preview" :style="{ background: t.background, borderColor: t.foreground }" />
              </div>
            </el-option>
          </el-option-group>
        </el-select>

        <!-- SFTP Toggle Button -->
        <el-button
          v-if="activeSession?.config.type === 'ssh'"
          size="small"
          :type="sftpDrawerVisible ? 'primary' : 'default'"
          :icon="FolderOpened"
          @click="toggleSftpDrawer"
        >
          SFTP
        </el-button>

        <!-- Clear Terminal Screen -->
        <el-button
          v-if="activeSession"
          size="small"
          :icon="Delete"
          circle
          title="清屏"
          @click="clearActiveTerminal"
        />

        <!-- Search in Terminal -->
        <el-button
          v-if="activeSession"
          size="small"
          :icon="Search"
          circle
          title="查找"
          @click="searchActiveTerminal"
        />
      </div>
    </header>

    <!-- Main Workspace Body -->
    <div class="terminal-body-layout">
      <!-- Left Sidebar: Saved Hosts & Assets -->
      <aside v-if="sidePanelVisible" class="terminal-server-sidebar">
        <div class="sidebar-search-bar">
          <el-input
            v-model="serverSearchQuery"
            size="small"
            placeholder="搜索已保存的主机..."
            clearable
            :prefix-icon="Search"
          />
        </div>

        <div class="sidebar-server-list">
          <div
            v-for="server in filteredServers"
            :key="server.id"
            class="server-list-item"
            @dblclick="connectServer(server)"
            @contextmenu.prevent="openServerContextMenu(server, $event)"
          >
            <div class="server-item-header">
              <span class="server-type-badge" :class="server.type">
                {{ server.type.toUpperCase() }}
              </span>
              <span class="server-name" :title="server.name">{{ server.name }}</span>
            </div>
            <div class="server-item-sub">
              <span class="server-target">
                {{ server.type === 'serial' ? server.serialPort : `${server.username ? `${server.username}@` : ''}${server.host}:${server.port}` }}
              </span>
              <el-button
                class="quick-connect-btn"
                size="small"
                type="primary"
                link
                @click.stop="connectServer(server)"
              >
                连接
              </el-button>
            </div>
          </div>

          <div v-if="filteredServers.length === 0" class="sidebar-empty">
            <span v-if="savedServers.length === 0">暂无保存的主机配置</span>
            <span v-else>无匹配主机</span>
          </div>
        </div>
      </aside>

      <!-- Center: Active Terminals & Monitor Banner -->
      <main class="terminal-main-canvas">
        <!-- Linux Hardware Stats Monitor -->
        <stats-bar
          v-if="activeSession?.config.type === 'ssh' && currentActiveStats"
          :stats="currentActiveStats"
        />

        <!-- Active Terminals Render Container -->
        <div class="terminals-viewport">
          <template v-if="sessions.length > 0">
            <div
              v-for="session in sessions"
              :key="session.id"
              class="terminal-tab-canvas-wrap"
              :class="{ active: session.id === activeSessionId }"
              v-show="session.id === activeSessionId"
            >
              <terminal-canvas
                :ref="(el) => setCanvasRef(session.id, el)"
                :session="session"
                :is-active="session.id === activeSessionId"
                @reconnect="reconnectSession"
              />
            </div>
          </template>

          <!-- Empty Screen State -->
          <div v-else class="terminal-empty-screen">
            <div class="empty-hero-card">
              <el-icon class="hero-icon"><Monitor /></el-icon>
              <h2>MarkNotePro 终端工作台</h2>
              <p>原生集成 Tabby 核心协议引擎，支持 190+ 官方色盘与 KDBX 密码库无缝直连</p>
              <div class="empty-action-grid">
                <el-button type="primary" size="large" :icon="Plus" @click="openNewConnectionDialog">
                  新建终端连接 (SSH / 串口 / Telnet)
                </el-button>
                <el-button size="large" :icon="Key" @click="switchToNote">
                  从 KDBX 密码库选择主机直连
                </el-button>
              </div>
            </div>
          </div>
        </div>
      </main>

      <!-- Right: SFTP Drawer -->
      <sftp-drawer
        v-if="sftpDrawerVisible"
        :visible="sftpDrawerVisible"
        :session-id="activeSessionId"
        @close="sftpDrawerVisible = false"
      />
    </div>

    <!-- Modals -->
    <new-connection-dialog ref="newConnDialogRef" @connect="handleConnectNew" />
    <two-factor-dialog />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import {
  Back,
  Fold,
  Expand,
  Plus,
  Monitor,
  Connection,
  Cpu,
  Share,
  Close,
  FolderOpened,
  Delete,
  Search,
  Key
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { isOsx } from '@/util'
import { useTerminalStore } from '@/store/terminal'
import { TABBY_COLOR_SCHEMES } from '@shared/terminalThemes'
import type { ITerminalConnectionConfig, ITerminalSessionInfo } from '@shared/types/terminal'

import TerminalCanvas from './TerminalCanvas.vue'
import StatsBar from './StatsBar.vue'
import SFTPDrawer from './SFTPDrawer.vue'
import NewConnectionDialog from './NewConnectionDialog.vue'
import TwoFactorDialog from './TwoFactorDialog.vue'

const terminalStore = useTerminalStore()
const {
  sessions,
  activeSessionId,
  activeSession,
  savedServers,
  sessionStats,
  selectedThemeName,
  sftpDrawerVisible
} = storeToRefs(terminalStore)

const sidePanelVisible = ref(true)
const serverSearchQuery = ref('')
const newConnDialogRef = ref<InstanceType<typeof NewConnectionDialog> | null>(null)
const canvasRefs = new Map<string, any>()

const allThemes = TABBY_COLOR_SCHEMES

const currentActiveStats = computed(() => {
  if (!activeSessionId.value) return null
  return sessionStats.value[activeSessionId.value] || null
})

const filteredServers = computed(() => {
  const q = serverSearchQuery.value.trim().toLowerCase()
  if (!q) return savedServers.value
  return savedServers.value.filter((s) => {
    return (
      (s.name && s.name.toLowerCase().includes(q)) ||
      (s.host && s.host.toLowerCase().includes(q)) ||
      (s.username && s.username.toLowerCase().includes(q)) ||
      (s.serialPort && s.serialPort.toLowerCase().includes(q))
    )
  })
})

function setCanvasRef(sessionId: string, el: any): void {
  if (el) {
    canvasRefs.set(sessionId, el)
  } else {
    canvasRefs.delete(sessionId)
  }
}

function switchToNote(): void {
  window.dispatchEvent(new CustomEvent('marknotepro:switch-workbench', { detail: 'note' }))
}

function openNewConnectionDialog(): void {
  newConnDialogRef.value?.open()
}

async function handleConnectNew(config: ITerminalConnectionConfig): Promise<void> {
  try {
    await terminalStore.connect(config)
  } catch (err: any) {
    ElMessage.error(`连接失败: ${err.message || err}`)
  }
}

async function connectServer(server: ITerminalConnectionConfig): Promise<void> {
  try {
    await terminalStore.connect(server)
  } catch (err: any) {
    ElMessage.error(`连接失败: ${err.message || err}`)
  }
}

async function closeSession(sessionId: string): Promise<void> {
  await terminalStore.disconnect(sessionId)
}

function reconnectSession(session: ITerminalSessionInfo): void {
  closeSession(session.id)
  handleConnectNew(session.config)
}

function toggleSftpDrawer(): void {
  sftpDrawerVisible.value = !sftpDrawerVisible.value
}

function clearActiveTerminal(): void {
  if (activeSessionId.value) {
    const canvas = canvasRefs.get(activeSessionId.value)
    canvas?.clear()
  }
}

function searchActiveTerminal(): void {
  if (activeSessionId.value) {
    const canvas = canvasRefs.get(activeSessionId.value)
    canvas?.toggleSearch()
  }
}

function onThemeSelect(name: string): void {
  terminalStore.setPreference('theme', name)
}

async function openServerContextMenu(server: ITerminalConnectionConfig, _e: MouseEvent): Promise<void> {
  try {
    const action = await ElMessageBox.confirm(
      `主机: ${server.name || server.host}`,
      '主机配置操作',
      {
        distinguishCancelAndClose: true,
        confirmButtonText: '编辑配置',
        cancelButtonText: '删除配置',
        type: 'info'
      }
    )
    if (action === 'confirm') {
      newConnDialogRef.value?.open(server)
    }
  } catch (action) {
    if (action === 'cancel') {
      await terminalStore.deleteServer(server.id)
      ElMessage.success('已删除主机配置')
    }
  }
}

// Global CustomEvent listener for connecting from KDBX directly
function handleDirectConnectEvent(e: Event): void {
  const customEvent = e as CustomEvent<ITerminalConnectionConfig>
  if (customEvent.detail) {
    handleConnectNew(customEvent.detail)
  }
}

onMounted(() => {
  terminalStore.initIpcListeners()
  terminalStore.loadSavedServers()
  window.addEventListener('marknotepro:terminal-direct-connect', handleDirectConnectEvent)
})

onBeforeUnmount(() => {
  window.removeEventListener('marknotepro:terminal-direct-connect', handleDirectConnectEvent)
})
</script>

<style scoped>
.terminal-workbench-shell {
  position: relative;
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--editorBgColor, #181a1f);
  color: var(--editorColor, #abb2bf);
  overflow: hidden;
  user-select: none;
}

.terminal-title-drag-region {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 30px;
  -webkit-app-region: drag;
  z-index: 999;
  pointer-events: none;
}

.terminal-header {
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: var(--sideBarBgColor, #21252b);
  border-bottom: 1px solid var(--itemBgColor, #333);
  z-index: 10;
  flex-shrink: 0;
}

.is-osx .terminal-header {
  padding-left: 78px;
}

.header-left-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-tabs-container {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 16px;
  overflow-x: auto;
  height: 100%;
}

.session-tab-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
  cursor: pointer;
  font-size: 12px;
  color: var(--editorColor, #aaa);
  transition: all 0.15s ease;
  max-width: 180px;
}

.session-tab-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.session-tab-item.active {
  background: var(--themeColor, #409eff);
  color: #fff;
  font-weight: 500;
}

.session-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #67c23a;
}
.session-status-dot.connecting {
  background: #e6a23c;
}
.session-status-dot.disconnected,
.session-status-dot.error {
  background: #f56c6c;
}

.session-tab-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-close-icon {
  font-size: 12px;
  border-radius: 50%;
  padding: 2px;
}
.tab-close-icon:hover {
  background: rgba(0, 0, 0, 0.3);
}

.no-session-tabs {
  font-size: 12px;
  color: var(--iconColor, #666);
}

.header-right-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.theme-selector {
  width: 180px;
}

.theme-option-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.theme-color-preview {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1px solid #666;
}

.terminal-body-layout {
  flex: 1;
  display: flex;
  height: calc(100vh - 42px);
  overflow: hidden;
}

.terminal-server-sidebar {
  width: 240px;
  height: 100%;
  background: var(--sideBarBgColor, #1e1e1e);
  border-right: 1px solid var(--itemBgColor, #333);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-search-bar {
  padding: 8px;
  border-bottom: 1px solid var(--itemBgColor, #2a2a2a);
}

.sidebar-server-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
}

.server-list-item {
  padding: 8px 10px;
  border-radius: 6px;
  margin-bottom: 6px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
}

.server-list-item:hover {
  background: var(--sideBarItemHoverBgColor, rgba(255, 255, 255, 0.08));
  border-color: var(--itemBgColor, #444);
}

.server-item-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.server-type-badge {
  font-size: 9px;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 3px;
  background: #3a3f4b;
  color: #fff;
}
.server-type-badge.ssh {
  background: #409eff;
}
.server-type-badge.telnet {
  background: #e6a23c;
}
.server-type-badge.serial {
  background: #67c23a;
}
.server-type-badge.rawSocket {
  background: #909399;
}

.server-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--editorColor, #e0e0e0);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.server-item-sub {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: var(--iconColor, #888);
}

.server-target {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 140px;
}

.sidebar-empty {
  padding: 30px 10px;
  text-align: center;
  font-size: 12px;
  color: var(--iconColor, #666);
}

.terminal-main-canvas {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.terminals-viewport {
  flex: 1;
  position: relative;
  width: 100%;
  height: 100%;
}

.terminal-tab-canvas-wrap {
  width: 100%;
  height: 100%;
  position: absolute;
  inset: 0;
}

.terminal-empty-screen {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.empty-hero-card {
  text-align: center;
  max-width: 480px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.hero-icon {
  font-size: 56px;
  color: var(--themeColor, #409eff);
}

.empty-hero-card h2 {
  font-size: 20px;
  margin: 0;
  color: var(--editorColor, #fff);
}

.empty-hero-card p {
  font-size: 13px;
  color: var(--iconColor, #888);
  line-height: 1.5;
  margin: 0;
}

.empty-action-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
  width: 100%;
}
</style>
