<template>
  <el-dialog
    v-model="visible"
    class="kdbx-dialog kdbx-qr-dialog"
    :title="t('kdbx.scanQrTitle')"
    width="540px"
    :close-on-click-modal="false"
    @closed="reset"
  >
    <div
      class="kdbx-qr-dropzone"
      :class="{ 'is-dragover': isDragOver, 'is-scanning': scanning }"
      @dragover.prevent="isDragOver = true"
      @dragleave.prevent="isDragOver = false"
      @drop.prevent="onDrop"
      @click="fileInput?.click()"
    >
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        class="kdbx-hidden-input"
        @change="onFileSelected"
      />
      <div v-if="scanning" class="kdbx-qr-status">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>{{ t('kdbx.qrScanning') }}</span>
      </div>
      <div v-else class="kdbx-qr-prompt">
        <el-icon class="kdbx-qr-icon"><FullScreen /></el-icon>
        <p class="kdbx-qr-main-text">{{ t('kdbx.qrDropOrClick') }}</p>
        <p class="kdbx-qr-sub-text">{{ t('kdbx.qrPasteHint') }}</p>
      </div>
    </div>

    <div class="kdbx-qr-actions">
      <el-button :loading="scanning" @click="readFromClipboard">
        <el-icon><DocumentCopy /></el-icon>
        {{ t('kdbx.qrFromClipboard') }}
      </el-button>
      <el-button @click="fileInput?.click()">
        <el-icon><Upload /></el-icon>
        {{ t('kdbx.qrSelectFile') }}
      </el-button>
    </div>

    <!-- Error message -->
    <div v-if="errorMessage" class="kdbx-qr-error">
      <el-icon><WarningFilled /></el-icon>
      <span>{{ errorMessage }}</span>
    </div>

    <!-- Single Account Result Preview -->
    <div v-if="singleResult" class="kdbx-qr-result-card">
      <div class="kdbx-qr-result-header">
        <strong>{{ t('kdbx.qrDetectedAccount') }}</strong>
        <span v-if="singleResult.issuer" class="kdbx-tag-chip">{{ singleResult.issuer }}</span>
      </div>
      <dl class="kdbx-entry-view kdbx-qr-preview-dl">
        <dt>{{ t('kdbx.account') }}</dt>
        <dd>{{ singleResult.account || singleResult.label || '-' }}</dd>
        <dt>{{ t('kdbx.totpCurrentCode') }}</dt>
        <dd class="kdbx-totp-view">
          <span class="kdbx-totp-code">{{ liveTotp?.formattedCode || '------' }}</span>
          <span v-if="liveTotp" class="kdbx-totp-seconds">⏱️ {{ liveTotp.remainingSeconds }}s</span>
        </dd>
        <dt>{{ t('kdbx.totpSecret') }}</dt>
        <dd class="kdbx-secret-preview">{{ maskSecret(singleResult.secret) }}</dd>
      </dl>
      <div class="kdbx-qr-result-actions">
        <el-button type="primary" @click="applySingleResult">
          {{ t('kdbx.qrApply') }}
        </el-button>
      </div>
    </div>

    <!-- Multiple Accounts Result List (e.g. Google Authenticator Migration Export) -->
    <div v-if="multiResults.length > 0" class="kdbx-qr-multi-card">
      <div class="kdbx-qr-result-header">
        <strong>{{ t('kdbx.qrDetectedMulti', { count: multiResults.length }) }}</strong>
      </div>
      <div class="kdbx-qr-accounts-list">
        <div
          v-for="(item, index) in multiResults"
          :key="`${item.secret}-${index}`"
          class="kdbx-qr-account-item"
        >
          <div class="kdbx-qr-account-info">
            <div class="kdbx-qr-account-title">
              <span v-if="item.issuer" class="kdbx-issuer">{{ item.issuer }}</span>
              <span class="kdbx-name">{{ item.account || item.label || t('kdbx.untitled') }}</span>
            </div>
            <div class="kdbx-qr-account-code">
              <code>{{ getLiveCode(item.secret) }}</code>
            </div>
          </div>
          <el-button size="small" type="primary" @click="applyAccount(item)">
            {{ t('kdbx.qrUseAccount') }}
          </el-button>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  DocumentCopy,
  FullScreen,
  Loading,
  Upload,
  WarningFilled
} from '@element-plus/icons-vue'
import {
  decodeGoogleMigration,
  generateTotp,
  parseOtpUri,
  scanQrFromBlob,
  scanQrFromClipboard
} from '@shared/totp'
import type { OtpParsedInfo } from '@shared/totp'

const emit = defineEmits<{
  (e: 'select', result: {
    secret: string
    uri: string
    issuer?: string
    account?: string
    label?: string
  }): void
}>()

const { t } = useI18n()
const visible = ref(false)
const scanning = ref(false)
const isDragOver = ref(false)
const errorMessage = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const singleResult = ref<OtpParsedInfo | null>(null)
const multiResults = ref<OtpParsedInfo[]>([])
const now = ref(Date.now())

let timer: number | null = null

const liveTotp = computed(() => {
  if (!singleResult.value?.secret) return null
  return generateTotp(singleResult.value.secret, now.value)
})

const getLiveCode = (secret: string): string => {
  const res = generateTotp(secret, now.value)
  return res ? `${res.formattedCode} (${res.remainingSeconds}s)` : '------'
}

const maskSecret = (secret: string): string => {
  if (!secret || secret.length <= 8) return secret
  return `${secret.slice(0, 4)}••••••••${secret.slice(-4)}`
}

const reset = (): void => {
  scanning.value = false
  isDragOver.value = false
  errorMessage.value = ''
  singleResult.value = null
  multiResults.value = []
  if (fileInput.value) fileInput.value.value = ''
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

const open = (): void => {
  reset()
  visible.value = true
  timer = window.setInterval(() => {
    now.value = Date.now()
  }, 1000)
}

const handleDecodedText = (text: string | null): void => {
  if (!text) {
    errorMessage.value = t('kdbx.qrNotFound')
    return
  }

  // 1. Google Authenticator Migration format
  if (text.startsWith('otpauth-migration://')) {
    const list = decodeGoogleMigration(text)
    if (list.length === 0) {
      errorMessage.value = t('kdbx.qrInvalidData')
    } else if (list.length === 1) {
      singleResult.value = list[0]
      multiResults.value = []
      errorMessage.value = ''
    } else {
      multiResults.value = list
      singleResult.value = null
      errorMessage.value = ''
    }
    return
  }

  // 2. Standard otpauth:// format or raw secret
  const parsed = parseOtpUri(text)
  if (parsed && parsed.secret) {
    singleResult.value = parsed
    multiResults.value = []
    errorMessage.value = ''
  } else {
    errorMessage.value = t('kdbx.qrInvalid2FA')
  }
}

const processBlob = async(blob: Blob): Promise<void> => {
  scanning.value = true
  errorMessage.value = ''
  singleResult.value = null
  multiResults.value = []
  try {
    const text = await scanQrFromBlob(blob)
    handleDecodedText(text)
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : String(e)
  } finally {
    scanning.value = false
  }
}

const onDrop = async(e: DragEvent): Promise<void> => {
  isDragOver.value = false
  const files = e.dataTransfer?.files
  if (files && files.length > 0) {
    await processBlob(files[0])
  }
}

const onFileSelected = async(e: Event): Promise<void> => {
  const target = e.target as HTMLInputElement
  const files = target.files
  if (files && files.length > 0) {
    await processBlob(files[0])
  }
}

const readFromClipboard = async(): Promise<void> => {
  scanning.value = true
  errorMessage.value = ''
  try {
    const res = await scanQrFromClipboard()
    if (res.error) {
      errorMessage.value = res.error === 'No image found in clipboard'
        ? t('kdbx.qrNoClipboardImage')
        : res.error
    } else {
      handleDecodedText(res.text)
    }
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : String(e)
  } finally {
    scanning.value = false
  }
}

const onGlobalPaste = async(e: ClipboardEvent): Promise<void> => {
  if (!visible.value) return
  const items = e.clipboardData?.items
  if (!items) return

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) {
        e.preventDefault()
        await processBlob(file)
        return
      }
    } else if (item.type === 'text/plain') {
      item.getAsString((text) => {
        if (text && (text.startsWith('otpauth://') || text.startsWith('otpauth-migration://'))) {
          e.preventDefault()
          handleDecodedText(text)
        }
      })
    }
  }
}

const applySingleResult = (): void => {
  if (!singleResult.value) return
  emit('select', {
    secret: singleResult.value.secret,
    uri: singleResult.value.rawUri || `otpauth://totp/${encodeURIComponent(singleResult.value.label || 'Item')}?secret=${singleResult.value.secret}&period=30&digits=6`,
    issuer: singleResult.value.issuer,
    account: singleResult.value.account,
    label: singleResult.value.label
  })
  visible.value = false
}

const applyAccount = (item: OtpParsedInfo): void => {
  emit('select', {
    secret: item.secret,
    uri: item.rawUri || `otpauth://totp/${encodeURIComponent(item.label || 'Item')}?secret=${item.secret}&period=30&digits=6`,
    issuer: item.issuer,
    account: item.account,
    label: item.label
  })
  visible.value = false
}

onMounted(() => {
  window.addEventListener('paste', onGlobalPaste)
})

onBeforeUnmount(() => {
  window.removeEventListener('paste', onGlobalPaste)
  if (timer) clearInterval(timer)
})

defineExpose({
  open
})
</script>

<style scoped>
.kdbx-qr-dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 140px;
  border: 2px dashed var(--floatBorderColor);
  border-radius: 8px;
  padding: 16px;
  background: var(--inputBgColor);
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: center;
}
.kdbx-qr-dropzone:hover,
.kdbx-qr-dropzone.is-dragover {
  border-color: var(--themeColor);
  background: var(--floatHoverColor);
}
.kdbx-hidden-input {
  display: none;
}
.kdbx-qr-icon {
  font-size: 32px;
  color: var(--themeColor);
  margin-bottom: 8px;
}
.kdbx-qr-main-text {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 500;
  color: var(--editorColor);
}
.kdbx-qr-sub-text {
  margin: 0;
  font-size: 12px;
  color: var(--editorColor50);
}
.kdbx-qr-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--themeColor);
  font-size: 14px;
}
.kdbx-qr-actions {
  display: flex;
  gap: 10px;
  margin-top: 12px;
  justify-content: center;
}
.kdbx-qr-error {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 8px 12px;
  background: rgba(255, 105, 105, 0.12);
  border-radius: 6px;
  color: var(--deleteColor, #ff6969);
  font-size: 13px;
}
.kdbx-qr-result-card,
.kdbx-qr-multi-card {
  margin-top: 16px;
  padding: 14px;
  background: var(--inputBgColor);
  border: 1px solid var(--floatBorderColor);
  border-radius: 8px;
}
.kdbx-qr-result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--editorColor);
}
.kdbx-qr-preview-dl {
  grid-template-columns: 80px 1fr;
  margin: 0 0 12px;
  font-size: 13px;
}
.kdbx-secret-preview {
  font-family: var(--monospace);
  color: var(--editorColor80);
}
.kdbx-qr-result-actions {
  display: flex;
  justify-content: flex-end;
}
.kdbx-qr-accounts-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 220px;
  overflow-y: auto;
}
.kdbx-qr-account-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  background: var(--floatBgColor);
  border: 1px solid var(--floatBorderColor);
  border-radius: 6px;
}
.kdbx-qr-account-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.kdbx-qr-account-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--editorColor);
}
.kdbx-issuer {
  font-weight: 600;
  color: var(--themeColor);
}
.kdbx-qr-account-code code {
  font-family: var(--monospace);
  font-size: 13px;
  color: var(--editorColor80);
  background: transparent;
}
</style>
