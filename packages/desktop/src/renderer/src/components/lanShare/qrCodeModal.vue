<template>
  <el-dialog
    v-model="visible"
    :title="t('lanShare.qrModalTitle')"
    width="460px"
    custom-class="lan-share-qr-dialog"
    destroy-on-close
  >
    <div v-if="share" class="qr-modal-body">
      <!-- 标题展示 -->
      <div class="qr-title">{{ displayTitle }}</div>
      <div class="qr-subtitle">
        {{ t('lanShare.filesCount', { count: share.files?.length || 0 }) }} · {{ t('lanShare.running') }}
      </div>

      <!-- 文件名列表精简展示（单文件直接展示，多文件展示前5个并可展开/悬浮） -->
      <div v-if="share.files && share.files.length > 0" class="qr-files-box">
        <div v-if="share.files.length === 1" class="single-file-row">
          <span>📄</span>
          <span class="file-name" :title="share.files[0].name">{{ share.files[0].name }}</span>
        </div>
        <el-tooltip
          v-else
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
                </div>
              </div>
            </div>
          </template>
          <div class="multi-files-row" :title="allFileNames">
            <span
              v-for="(f, idx) in share.files.slice(0, 4)"
              :key="f.id || idx"
              class="file-chip"
            >
              📄 {{ f.name }}
            </span>
            <span v-if="share.files.length > 4" class="file-chip-more">
              +{{ share.files.length - 4 }}...
            </span>
          </div>
        </el-tooltip>
      </div>

      <!-- 二维码展示 -->
      <div class="qr-container" v-html="qrSvg" />

      <!-- 类似百度网盘：一键复制完整链接及提取码 -->
      <div class="one-click-copy-area">
        <el-button
          type="primary"
          class="btn-copy-full"
          @click="copyShareInfo"
        >
          📋 {{ t('lanShare.copyShareInfo') }}
        </el-button>
      </div>

      <!-- 提取密码展示与单独复制 -->
      <div v-if="share.password" class="info-card password-card">
        <span class="card-label">{{ t('lanShare.passwordLabel') }}</span>
        <span class="password-val">{{ share.password }}</span>
        <el-button link type="primary" size="small" @click="copyText(share.password, t('lanShare.copyPasswordSuccess'))">
          {{ t('lanShare.copyPassword') }}
        </el-button>
      </div>

      <!-- 局域网访问地址展示与单独复制 -->
      <div class="info-card url-card">
        <div class="url-text" :title="share.url">{{ share.url }}</div>
        <el-button type="primary" plain size="small" @click="copyText(share.url, t('lanShare.copyLinkSuccess'))">
          {{ t('lanShare.copyLink') }}
        </el-button>
      </div>

      <div class="qr-tip">
        {{ t('lanShare.qrTip') }}
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="openInBrowser">{{ t('lanShare.openInBrowser') }}</el-button>
        <el-button type="primary" @click="visible = false">{{ t('lanShare.done') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import bus from '@/bus'
import type { LanShareRecord } from '@shared/types/lanShare'
import { generateQrSvg } from '@/util/qrCode'

const { t } = useI18n()
const visible = ref(false)
const share = ref<LanShareRecord | null>(null)

const displayTitle = computed(() => {
  if (share.value?.title && share.value.title.trim()) {
    return share.value.title.trim()
  }
  if (share.value?.files && share.value.files.length === 1) {
    return share.value.files[0].name
  }
  if (share.value?.files && share.value.files.length > 1) {
    return `${share.value.files[0].name} ${t('lanShare.moreFilesSuffix', { count: share.value.files.length })}`
  }
  return t('lanShare.untitledShare')
})

const allFileNames = computed(() => {
  return share.value?.files?.map((f, i) => `${i + 1}. ${f.name}`).join('\n') || ''
})

const qrSvg = computed(() => {
  if (!share.value?.url) return ''
  // 二维码包含直达参数（若有密码则附加 ?pwd=... 方便扫码直达）
  const targetUrl = share.value.password
    ? `${share.value.url}?pwd=${encodeURIComponent(share.value.password)}`
    : share.value.url
  return generateQrSvg(targetUrl, 190)
})

const copyText = (text: string, msg: string) => {
  if (window.electron?.clipboard) {
    window.electron.clipboard.writeText(text)
  } else {
    navigator.clipboard.writeText(text)
  }
  ElMessage.success(msg)
}

const copyShareInfo = () => {
  if (!share.value) return
  const title = displayTitle.value
  let text = ''
  if (share.value.password) {
    text = `【${title}】${t('lanShare.panelTitle')}\n${t('lanShare.shareLinkPrefix')}${share.value.url}\n${t('lanShare.shareCodePrefix')}${share.value.password}`
  } else {
    text = `【${title}】${t('lanShare.panelTitle')}\n${t('lanShare.shareLinkPrefix')}${share.value.url} (${t('lanShare.noPassword')})`
  }
  copyText(text, t('lanShare.copyShareInfoSuccess'))
}

const openInBrowser = () => {
  if (share.value?.url) {
    const url = share.value.password
      ? `${share.value.url}?pwd=${encodeURIComponent(share.value.password)}`
      : share.value.url
    window.electron.shell.openExternal(url)
  }
}

const openModal = (record: LanShareRecord) => {
  share.value = record
  visible.value = true
}

onMounted(() => {
  bus.on('LAN_SHARE::open-qr-modal', openModal)
})

onBeforeUnmount(() => {
  bus.off('LAN_SHARE::open-qr-modal', openModal)
})
</script>

<style scoped>
.qr-modal-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}

.qr-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--sideBarTitleColor, #ffffff);
  word-break: break-all;
  max-width: 380px;
}

.qr-subtitle {
  font-size: 12px;
  color: var(--sideBarTextColor, rgba(255, 255, 255, 0.6));
  margin-top: -6px;
}

.qr-files-box {
  width: 100%;
  background: var(--sideBarItemHoverBgColor, rgba(255, 255, 255, 0.05));
  border: 1px solid var(--floatBorderColor, rgba(255, 255, 255, 0.08));
  border-radius: 6px;
  padding: 6px 10px;
  box-sizing: border-box;
}

.single-file-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 12px;
  color: var(--sideBarTitleColor, #ffffff);
}

.file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 320px;
}

.multi-files-row {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 4px;
}

.file-chip {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--sideBarTitleColor, #ffffff);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-chip-more {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(64, 158, 255, 0.2);
  color: var(--themeColor, #409eff);
  font-weight: 600;
}

.qr-container {
  padding: 12px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  justify-content: center;
  align-items: center;
  margin: 4px 0;
}

.one-click-copy-area {
  width: 100%;
}

.btn-copy-full {
  width: 100%;
  font-size: 14px;
  font-weight: 600;
  height: 38px;
  border-radius: 8px;
}

.info-card {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  box-sizing: border-box;
}

.password-card {
  background: rgba(64, 158, 255, 0.12);
  border: 1px dashed rgba(64, 158, 255, 0.4);
}

.card-label {
  color: var(--sideBarTextColor, rgba(255, 255, 255, 0.7));
}

.password-val {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--themeColor, #409eff);
}

.url-card {
  background: var(--itemBgColor, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--floatBorderColor, rgba(255, 255, 255, 0.1));
}

.url-text {
  font-family: monospace;
  font-size: 13px;
  color: var(--sideBarTitleColor, #ffffff);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 260px;
}

.qr-tip {
  font-size: 12px;
  color: var(--el-color-warning, #e6a23c);
  background: rgba(230, 162, 60, 0.1);
  border: 1px solid rgba(230, 162, 60, 0.25);
  border-radius: 6px;
  padding: 8px 10px;
  line-height: 1.5;
  margin-top: 4px;
  text-align: left;
}
</style>

<style>
/* 弹窗深浅模式自适应覆盖 */
.lan-share-qr-dialog {
  --el-dialog-bg-color: var(--floatBgColor, #2a2a2a) !important;
  --el-bg-color: var(--floatBgColor, #2a2a2a) !important;
  --el-bg-color-overlay: var(--floatBgColor, #2a2a2a) !important;
  --el-text-color-primary: var(--sideBarTitleColor, #ffffff) !important;
  --el-text-color-regular: var(--sideBarColor, rgba(255, 255, 255, 0.8)) !important;
  --el-border-color: var(--floatBorderColor, rgba(255, 255, 255, 0.1)) !important;
  background: var(--floatBgColor, #2a2a2a) !important;
  border: 1px solid var(--floatBorderColor, rgba(255, 255, 255, 0.12)) !important;
  color: var(--sideBarTitleColor, #ffffff) !important;
  border-radius: 12px !important;
}

.lan-share-qr-dialog .el-dialog__title {
  color: var(--sideBarTitleColor, #ffffff) !important;
  font-weight: 600 !important;
}

.lan-share-qr-dialog .el-dialog__close {
  color: var(--sideBarTextColor, rgba(255, 255, 255, 0.6)) !important;
}
</style>
