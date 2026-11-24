<template>
  <div class="side-bar-lan-share">
    <!-- macOS 顶部留白，避开左上角红绿灯控制按钮 -->
    <div class="title-spacer" />

    <!-- Tab 导航 -->
    <div class="tab-nav">
      <div
        class="tab-item"
        :class="{ active: activeTab === 'mine' }"
        @click="activeTab = 'mine'"
      >
        {{ t('lanShare.myShares') }} ({{ myShares.length }})
      </div>
      <div
        class="tab-item"
        :class="{ active: activeTab === 'discovered' }"
        @click="activeTab = 'discovered'"
      >
        {{ t('lanShare.discoveredShares') }}
        <span v-if="discoveredShares.length > 0" class="tab-badge">
          {{ discoveredShares.length }}
        </span>
      </div>
    </div>

    <!-- 列表内容区 -->
    <div class="panel-content">
      <!-- 1. 我的分享记录 -->
      <div v-if="activeTab === 'mine'" class="shares-list">
        <div v-if="myShares.length === 0" class="empty-state">
          <div class="empty-icon">📤</div>
          <div class="empty-title">{{ t('lanShare.noMySharesTitle') }}</div>
          <div class="empty-desc">
            {{ t('lanShare.noMySharesDesc') }}
          </div>
        </div>

        <div
          v-for="share in myShares"
          :key="share.id"
          class="share-card"
        >
          <!-- 标题行：填写了标题展示标题；未填写展示文件名 -->
          <div class="card-top">
            <span class="share-name" :title="getShareMainTitle(share)">
              {{ getShareMainTitle(share) }}
            </span>
            <span
              class="status-tag"
              :class="share.status === 'running' ? 'running' : 'stopped'"
            >
              {{ share.status === 'running' ? t('lanShare.running') : t('lanShare.stopped') }}
            </span>
          </div>

          <!-- 文件名展示：单文件展示具体文件名；多文件展示前5个，光标悬停展示全部 -->
          <div class="card-files-section">
            <div v-if="share.files?.length === 1" class="single-file-line" :title="share.files[0].name">
              <span class="file-icon">📄</span>
              <span class="file-name-text">{{ share.files[0].name }}</span>
              <span class="file-size-hint">{{ formatSize(share.files[0].size) }}</span>
            </div>

            <el-tooltip
              v-else-if="share.files && share.files.length > 1"
              placement="top"
              effect="dark"
              popper-class="lan-share-files-tooltip"
            >
              <template #content>
                <div class="tooltip-file-list">
                  <div class="tooltip-header">
                    {{ t('lanShare.allFilesTooltip', { count: share.files.length }) }}
                  </div>
                  <div class="tooltip-items-scroll">
                    <div
                      v-for="(f, idx) in share.files"
                      :key="f.id || idx"
                      class="tooltip-file-item"
                    >
                      <span class="item-idx">{{ idx + 1 }}.</span>
                      <span class="item-name">{{ f.name }}</span>
                      <span class="item-size">{{ formatSize(f.size) }}</span>
                    </div>
                  </div>
                </div>
              </template>
              <div class="multi-files-box" :title="getAllFileNamesText(share.files)">
                <div class="file-tags-row">
                  <span
                    v-for="(f, idx) in share.files.slice(0, 5)"
                    :key="f.id || idx"
                    class="file-pill"
                  >
                    📄 {{ f.name }}
                  </span>
                  <span v-if="share.files.length > 5" class="file-pill-more">
                    +{{ share.files.length - 5 }}...
                  </span>
                </div>
              </div>
            </el-tooltip>
          </div>

          <!-- 元数据：文件数、提取码 -->
          <div class="card-meta">
            <span class="meta-count">{{ t('lanShare.filesCount', { count: share.files?.length || 0 }) }}</span>
            <span
              v-if="share.password"
              class="meta-pwd"
              :title="t('lanShare.copyPassword')"
              @click="copyText(share.password, t('lanShare.copyPasswordSuccess'))"
            >
              {{ t('lanShare.passwordLabel') }}<b>{{ share.password }}</b>
            </span>
            <span v-else class="meta-no-pwd">{{ t('lanShare.noPassword') }}</span>
          </div>

          <!-- 访问链接与百度网盘式一键复制链接及提取码 -->
          <div v-if="share.status === 'running'" class="url-share-bar">
            <div
              class="card-url"
              :title="t('lanShare.copyLink')"
              @click="copyText(share.url, t('lanShare.copyLinkSuccess'))"
            >
              🔗 {{ share.url }}
            </div>
            <el-tooltip :content="t('lanShare.copyShareInfo')" placement="top">
              <el-button
                size="small"
                class="btn-copy-all"
                type="primary"
                plain
                @click="copyShareInfo(share)"
              >
                📋 {{ t('lanShare.copyShareInfo') }}
              </el-button>
            </el-tooltip>
          </div>

          <!-- 操作按钮行 -->
          <div class="card-actions">
            <el-button
              v-if="share.status === 'running'"
              size="small"
              type="warning"
              plain
              @click="stopShare(share.id)"
            >
              {{ t('lanShare.pause') }}
            </el-button>
            <el-button
              v-else
              size="small"
              type="success"
              plain
              @click="resumeShare(share.id)"
            >
              {{ t('lanShare.resume') }}
            </el-button>

            <el-button
              v-if="share.status === 'running'"
              size="small"
              type="primary"
              plain
              @click="showQr(share)"
            >
              {{ t('lanShare.qrCode') }}
            </el-button>

            <el-button
              size="small"
              type="danger"
              link
              @click="deleteShare(share.id)"
            >
              {{ t('lanShare.delete') }}
            </el-button>
          </div>
        </div>
      </div>

      <!-- 2. 局域网他人分享 -->
      <div v-else class="shares-list">
        <div v-if="discoveredShares.length === 0" class="empty-state">
          <div class="empty-icon">📡</div>
          <div class="empty-title">{{ t('lanShare.searchingDevices') }}</div>
          <div class="empty-desc">
            {{ t('lanShare.searchingDesc') }}
          </div>
        </div>

        <div
          v-for="item in discoveredShares"
          :key="`${item.senderId}_${item.id}`"
          class="share-card discovered-card"
        >
          <!-- 标题行：填写了标题展示标题；未填写展示来源/文件名 -->
          <div class="card-top">
            <span class="share-name" :title="getDiscoveredMainTitle(item)">
              {{ getDiscoveredMainTitle(item) }}
            </span>
            <span class="app-tag">{{ item.app === 'marktextpro' ? 'MarkText' : 'MarkNote' }}</span>
          </div>

          <div class="device-line">
            {{ t('lanShare.sourceDevice') }}<b>{{ item.deviceName }}</b>
          </div>

          <div class="card-meta">
            <span class="meta-count">{{ t('lanShare.filesCount', { count: item.fileCount }) }}</span>
            <span v-if="item.hasPassword" class="meta-pwd">{{ t('lanShare.needPassword') }}</span>
            <span v-else class="meta-no-pwd">{{ t('lanShare.noPassword') }}</span>
          </div>

          <div class="card-actions">
            <el-button
              type="primary"
              size="small"
              @click="openRemoteShare(item)"
            >
              {{ t('lanShare.viewAndExtract') }}
            </el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import bus from '@/bus'
import { useProjectStore } from '@/store/project'
import type { LanShareRecord, DiscoveredLanShare, LanShareFileItem } from '@shared/types/lanShare'

const { t } = useI18n()
const activeTab = ref<'mine' | 'discovered'>('mine')
const myShares = ref<LanShareRecord[]>([])
const discoveredShares = ref<DiscoveredLanShare[]>([])

const projectStore = useProjectStore()

let unlistenMyShares: (() => void) | null = null
let unlistenDiscovered: (() => void) | null = null

const getShareMainTitle = (share: LanShareRecord): string => {
  if (share.title && share.title.trim()) {
    return share.title.trim()
  }
  if (share.files && share.files.length === 1) {
    return share.files[0].name
  }
  if (share.files && share.files.length > 1) {
    return `${share.files[0].name} ${t('lanShare.moreFilesSuffix', { count: share.files.length })}`
  }
  return t('lanShare.untitledShare')
}

const getDiscoveredMainTitle = (item: DiscoveredLanShare): string => {
  if (item.title && item.title.trim()) {
    return item.title.trim()
  }
  return `${item.deviceName} - ${t('lanShare.untitledShare')}`
}

const getAllFileNamesText = (files: LanShareFileItem[]): string => {
  if (!files) return ''
  return files.map((f, i) => `${i + 1}. ${f.name} (${formatSize(f.size)})`).join('\n')
}

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const loadMyShares = async () => {
  try {
    const list = await window.electron.ipcRenderer.invoke('mt::lan-share:get-my-shares')
    myShares.value = list || []
  } catch (e) {
    console.warn('Failed to load my shares:', e)
  }
}

const loadDiscoveredShares = async () => {
  try {
    const list = await window.electron.ipcRenderer.invoke(
      'mt::lan-share:get-discovered-shares'
    )
    discoveredShares.value = list || []
  } catch (e) {
    console.warn('Failed to load discovered shares:', e)
  }
}

const handleCreateShare = () => {
  const root = projectStore.projectTree?.pathname
  if (root) {
    bus.emit('LAN_SHARE::open-create-modal', {
      pathname: root,
      isDirectory: true,
      title: ''
    })
  } else {
    ElMessage.info(t('lanShare.noMySharesDesc'))
  }
}

const stopShare = async (id: string) => {
  try {
    await window.electron.ipcRenderer.invoke('mt::lan-share:stop', id)
    ElMessage.success(t('lanShare.sharePaused'))
    await loadMyShares()
  } catch (e: any) {
    ElMessage.error(e.message)
  }
}

const resumeShare = async (id: string) => {
  try {
    await window.electron.ipcRenderer.invoke('mt::lan-share:resume', id)
    ElMessage.success(t('lanShare.shareResumed'))
    await loadMyShares()
  } catch (e: any) {
    ElMessage.error(e.message)
  }
}

const deleteShare = async (id: string) => {
  try {
    await ElMessageBox.confirm(t('lanShare.deleteConfirmMsg'), t('lanShare.deleteConfirmTitle'), {
      confirmButtonText: t('common.ok'),
      cancelButtonText: t('lanShare.cancel'),
      type: 'warning'
    })
    await window.electron.ipcRenderer.invoke('mt::lan-share:delete', id)
    ElMessage.success(t('lanShare.shareDeleted'))
    await loadMyShares()
  } catch (e) {
    // cancelled
  }
}

const showQr = (share: LanShareRecord) => {
  bus.emit('LAN_SHARE::open-qr-modal', share)
}

const openRemoteShare = (item: DiscoveredLanShare) => {
  bus.emit('LAN_SHARE::open-remote-modal', item)
}

const copyText = (text: string, msg: string) => {
  if (window.electron?.clipboard) {
    window.electron.clipboard.writeText(text)
  } else {
    navigator.clipboard.writeText(text)
  }
  ElMessage.success(msg)
}

const copyShareInfo = (share: LanShareRecord) => {
  const mainTitle = getShareMainTitle(share)
  let text = ''
  if (share.password) {
    text = `【${mainTitle}】${t('lanShare.panelTitle')}\n链接: ${share.url}\n提取码: ${share.password}`
  } else {
    text = `【${mainTitle}】${t('lanShare.panelTitle')}\n链接: ${share.url} (${t('lanShare.noPassword')})`
  }
  copyText(text, t('lanShare.copyShareInfoSuccess'))
}

onMounted(() => {
  void loadMyShares()
  void loadDiscoveredShares()

  unlistenMyShares = window.electron.ipcRenderer.on(
    'mt::lan-share:my-shares-updated',
    (_event, list) => {
      myShares.value = list || []
    }
  )

  unlistenDiscovered = window.electron.ipcRenderer.on(
    'mt::lan-share:discovered-updated',
    (_event, list) => {
      discoveredShares.value = list || []
    }
  )
})

onBeforeUnmount(() => {
  if (unlistenMyShares) unlistenMyShares()
  if (unlistenDiscovered) unlistenDiscovered()
})
</script>

<style scoped>
.side-bar-lan-share {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  box-sizing: border-box;
  background: var(--sideBarBgColor, #232323);
  color: var(--sideBarColor, rgba(255, 255, 255, 0.7));
  user-select: none;
}

.title-spacer {
  height: 35px;
  flex-shrink: 0;
  -webkit-app-region: drag;
}

.tab-nav {
  display: flex;
  border-bottom: 1px solid var(--floatBorderColor, rgba(255, 255, 255, 0.08));
  background: var(--sideBarBgColor, #232323);
  -webkit-app-region: no-drag;
}

.tab-item {
  flex: 1;
  text-align: center;
  padding: 8px 6px;
  font-size: 13px;
  cursor: pointer;
  color: var(--sideBarTextColor, rgba(255, 255, 255, 0.5));
  border-bottom: 2px solid transparent;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 4px;
  transition: all 0.15s;
}

.tab-item.active {
  color: var(--themeColor, #409eff);
  border-bottom-color: var(--themeColor, #409eff);
  font-weight: 600;
  background: var(--sideBarItemHoverBgColor, rgba(255, 255, 255, 0.03));
}

.tab-badge {
  background: #ef4444;
  color: #fff;
  border-radius: 999px;
  padding: 0 5px;
  font-size: 11px;
  font-weight: bold;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 40px 16px;
  gap: 8px;
}

.empty-icon {
  font-size: 32px;
}

.empty-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--sideBarTitleColor, #ffffff);
}

.empty-desc {
  font-size: 12px;
  color: var(--sideBarTextColor, rgba(255, 255, 255, 0.5));
  line-height: 1.5;
}

.share-card {
  background: var(--itemBgColor, #303030);
  border: 1px solid var(--floatBorderColor, rgba(255, 255, 255, 0.1));
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: border-color 0.2s;
}

.share-card:hover {
  border-color: var(--themeColor, #409eff);
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.share-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--sideBarTitleColor, #ffffff);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 170px;
}

.status-tag {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
}

.status-tag.running {
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
  border: 1px solid rgba(74, 222, 128, 0.3);
}

.status-tag.stopped {
  background: rgba(148, 163, 184, 0.15);
  color: #94a3b8;
  border: 1px solid rgba(148, 163, 184, 0.3);
}

.app-tag {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(59, 130, 246, 0.18);
  color: #60a5fa;
  border: 1px solid rgba(96, 165, 250, 0.3);
}

.card-files-section {
  background: rgba(0, 0, 0, 0.18);
  border-radius: 6px;
  padding: 6px 8px;
  border: 1px solid var(--floatBorderColor, rgba(255, 255, 255, 0.06));
}

.single-file-line {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--sideBarColor, rgba(255, 255, 255, 0.85));
}

.file-name-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.file-size-hint {
  font-size: 11px;
  color: var(--sideBarTextColor, rgba(255, 255, 255, 0.45));
}

.multi-files-box {
  cursor: pointer;
}

.file-tags-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.file-pill {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--sideBarTitleColor, #ffffff);
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-pill-more {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(64, 158, 255, 0.25);
  color: var(--themeColor, #409eff);
  font-weight: 600;
}

.device-line {
  font-size: 12px;
  color: var(--sideBarColor, rgba(255, 255, 255, 0.7));
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--sideBarTextColor, rgba(255, 255, 255, 0.5));
}

.meta-pwd {
  color: var(--themeColor, #409eff);
  cursor: pointer;
}

.meta-pwd:hover {
  text-decoration: underline;
}

.meta-no-pwd {
  color: #34d399;
}

.url-share-bar {
  display: flex;
  gap: 6px;
  align-items: center;
}

.card-url {
  flex: 1;
  font-family: monospace;
  font-size: 11px;
  color: var(--themeColor, #409eff);
  cursor: pointer;
  background: rgba(64, 158, 255, 0.1);
  padding: 4px 6px;
  border-radius: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 1px solid rgba(64, 158, 255, 0.25);
}

.card-url:hover {
  background: rgba(64, 158, 255, 0.2);
}

.btn-copy-all {
  flex-shrink: 0;
  font-size: 11px;
  padding: 4px 8px;
  height: 24px;
}

.card-actions {
  display: flex;
  gap: 6px;
  margin-top: 2px;
  align-items: center;
}
</style>

<style>
/* 全局 Tooltip 悬浮全量文件名清单样式 */
.lan-share-files-tooltip {
  max-width: 340px !important;
  line-height: 1.4 !important;
  font-size: 12px !important;
}

.lan-share-files-tooltip .tooltip-header {
  font-weight: 600;
  margin-bottom: 6px;
  border-bottom: 1px solid var(--el-border-color-lighter, rgba(128, 128, 128, 0.25));
  padding-bottom: 4px;
  color: var(--el-text-color-primary, currentColor);
}

.lan-share-files-tooltip .tooltip-items-scroll {
  max-height: 240px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.lan-share-files-tooltip .tooltip-file-item {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--el-text-color-regular, currentColor);
}

.lan-share-files-tooltip .item-name {
  flex: 1;
  word-break: break-all;
}

.lan-share-files-tooltip .item-size {
  font-size: 11px;
  opacity: 0.8;
  white-space: nowrap;
  color: var(--el-text-color-secondary, currentColor);
}
</style>
