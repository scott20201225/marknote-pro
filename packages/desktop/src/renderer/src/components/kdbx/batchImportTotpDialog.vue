<template>
  <el-dialog
    v-model="visible"
    class="kdbx-dialog kdbx-batch-totp-dialog"
    :title="t('kdbx.batchImportTotp')"
    width="min(720px, calc(100vw - 48px))"
    :close-on-click-modal="false"
    @closed="reset"
  >
    <div class="kdbx-batch-content">
      <div class="kdbx-batch-header">
        <label class="kdbx-batch-label">
          <span>{{ t('kdbx.batchImportInputLabel') }}</span>
          <span class="kdbx-batch-hint">{{ t('kdbx.batchImportHint') }}</span>
        </label>
      </div>

      <el-input
        v-model="rawText"
        type="textarea"
        :rows="6"
        :placeholder="t('kdbx.batchImportPlaceholder')"
        class="kdbx-batch-textarea"
        @input="onInputChanged"
      />

      <!-- Drag & drop / paste image support -->
      <div
        class="kdbx-batch-dropzone"
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
          multiple
          class="kdbx-hidden-input"
          @change="onFileSelected"
        />
        <el-icon v-if="scanning" class="is-loading"><Loading /></el-icon>
        <el-icon v-else><Upload /></el-icon>
        <span>{{ scanning ? t('kdbx.qrScanning') : t('kdbx.batchDropOrPasteImage') }}</span>
      </div>

      <!-- Preview parsed items -->
      <div v-if="parsedItems.length > 0" class="kdbx-batch-preview-section">
        <div class="kdbx-batch-preview-header">
          <strong>{{ t('kdbx.batchDetectedCount', { count: parsedItems.length }) }}</strong>
          <div class="kdbx-batch-options">
            <el-radio-group v-model="importMode" size="small">
              <el-radio-button value="append">{{ t('kdbx.batchAppend') }}</el-radio-button>
              <el-radio-button value="replace">{{ t('kdbx.batchReplace') }}</el-radio-button>
            </el-radio-group>
            <el-button size="small" text type="danger" @click="clearParsed">
              <el-icon><Delete /></el-icon>
              {{ t('common.clear') }}
            </el-button>
          </div>
        </div>

        <div class="kdbx-batch-table-wrapper">
          <table class="kdbx-batch-table">
            <thead>
              <tr>
                <th style="width: 40px">#</th>
                <th style="width: 220px">{{ t('kdbx.fieldName') }}</th>
                <th style="width: 140px">{{ t('kdbx.totpCurrentCode') }}</th>
                <th>{{ t('kdbx.account') }}</th>
                <th style="width: 44px"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in parsedItems" :key="item.id">
                <td class="kdbx-batch-index">{{ index + 1 }}</td>
                <td>
                  <el-input
                    v-model="item.key"
                    size="small"
                    :placeholder="t('kdbx.fieldName')"
                  />
                </td>
                <td class="kdbx-batch-code-cell">
                  <span class="kdbx-batch-code">{{ getLiveCode(item.parsed.secret) }}</span>
                </td>
                <td class="kdbx-batch-account-cell" :title="item.parsed.account || item.parsed.label || '-'">
                  <span v-if="item.parsed.issuer" class="kdbx-issuer-tag">{{ item.parsed.issuer }}</span>
                  <span class="kdbx-account-text">{{ item.parsed.account || item.parsed.label || '-' }}</span>
                </td>
                <td class="kdbx-batch-action-cell">
                  <button
                    class="kdbx-remove-btn"
                    type="button"
                    :title="t('common.delete')"
                    @click="removeItem(index)"
                  >
                    <el-icon><Delete /></el-icon>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div v-else-if="rawText.trim()" class="kdbx-batch-empty-hint">
        <span>{{ t('kdbx.batchNoValidFound') }}</span>
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button
        type="primary"
        :disabled="parsedItems.length === 0"
        @click="confirmImport"
      >
        {{ t('kdbx.confirmBatchImport', { count: parsedItems.length }) }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Delete, Loading, Upload } from '@element-plus/icons-vue'
import {
  decodeGoogleMigration,
  extractOtpFieldName,
  generateTotp,
  parseBatchOtpLines,
  parseOtpUri,
  scanQrFromBlob
} from '@shared/totp'
import type { BatchOtpItem } from '@shared/totp'

const emit = defineEmits<{
  (e: 'import', items: Array<{ key: string; value: string; protected: boolean }>, mode: 'append' | 'replace'): void
}>()

const { t } = useI18n()
const visible = ref(false)
const rawText = ref('')
const parsedItems = ref<BatchOtpItem[]>([])
const importMode = ref<'append' | 'replace'>('append')
const scanning = ref(false)
const isDragOver = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const now = ref(Date.now())
let timer: number | null = null
let existingFieldKeys: string[] = []

const open = (currentKeys: string[] = []): void => {
  existingFieldKeys = [...currentKeys]
  reset()
  visible.value = true
  timer = window.setInterval(() => {
    now.value = Date.now()
  }, 1000)
}

const reset = (): void => {
  rawText.value = ''
  parsedItems.value = []
  importMode.value = 'append'
  scanning.value = false
  isDragOver.value = false
  if (fileInput.value) fileInput.value.value = ''
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

const onInputChanged = (): void => {
  const baseKeys = importMode.value === 'append' ? existingFieldKeys : []
  parsedItems.value = parseBatchOtpLines(rawText.value, baseKeys)
}

const clearParsed = (): void => {
  rawText.value = ''
  parsedItems.value = []
}

const removeItem = (index: number): void => {
  parsedItems.value.splice(index, 1)
}

const getLiveCode = (secret: string): string => {
  const res = generateTotp(secret, now.value)
  return res ? `${res.formattedCode}` : '------'
}

const processImageBlob = async(blob: Blob): Promise<void> => {
  scanning.value = true
  try {
    const text = await scanQrFromBlob(blob)
    if (!text) return

    if (text.startsWith('otpauth-migration://')) {
      const list = decodeGoogleMigration(text)
      if (list.length > 0) {
        const used = new Set(parsedItems.value.map(item => item.key))
        for (const item of list) {
          const key = extractOtpFieldName(item, used)
          used.add(key)
          const totpRes = generateTotp(item.secret)
          parsedItems.value.push({
            id: `batch-${Date.now()}-${Math.random()}`,
            key,
            value: item.rawUri || `otpauth://totp/${encodeURIComponent(item.label || key)}?secret=${item.secret}&period=30&digits=${item.digits || 6}`,
            protected: true,
            parsed: item,
            codePreview: totpRes?.formattedCode || '------',
            remainingSeconds: totpRes?.remainingSeconds || 30
          })
        }
      }
      return
    }

    const parsed = parseOtpUri(text)
    if (parsed && parsed.secret) {
      const used = new Set(parsedItems.value.map(item => item.key))
      const key = extractOtpFieldName(parsed, used)
      used.add(key)
      const totpRes = generateTotp(parsed.secret)
      parsedItems.value.push({
        id: `batch-${Date.now()}-${Math.random()}`,
        key,
        value: text,
        protected: true,
        parsed,
        codePreview: totpRes?.formattedCode || '------',
        remainingSeconds: totpRes?.remainingSeconds || 30
      })
    }
  } catch (e) {
    console.error('Failed to scan image in batch dialog:', e)
  } finally {
    scanning.value = false
  }
}

const onDrop = async(e: DragEvent): Promise<void> => {
  isDragOver.value = false
  const files = e.dataTransfer?.files
  if (files && files.length > 0) {
    for (let i = 0; i < files.length; i++) {
      if (files[i].type.startsWith('image/')) {
        await processImageBlob(files[i])
      }
    }
  }
}

const onFileSelected = async(e: Event): Promise<void> => {
  const target = e.target as HTMLInputElement
  const files = target.files
  if (files && files.length > 0) {
    for (let i = 0; i < files.length; i++) {
      await processImageBlob(files[i])
    }
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
        await processImageBlob(file)
        return
      }
    }
  }
}

const confirmImport = (): void => {
  if (parsedItems.value.length === 0) return
  const results = parsedItems.value.map(item => ({
    key: item.key.trim() || '2FA',
    value: item.value,
    protected: true
  }))
  emit('import', results, importMode.value)
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
.kdbx-batch-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.kdbx-batch-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.kdbx-batch-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.kdbx-batch-label span:first-child {
  font-weight: 600;
  font-size: 13px;
  color: var(--editorColor);
}
.kdbx-batch-hint {
  font-size: 12px;
  color: var(--editorColor50);
}
.kdbx-batch-textarea :deep(.el-textarea__inner) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre;
  background: var(--inputBgColor) !important;
  color: var(--editorColor) !important;
  box-shadow: 0 0 0 1px var(--floatBorderColor) inset !important;
}
.kdbx-batch-dropzone {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  border: 1px dashed var(--floatBorderColor);
  border-radius: 6px;
  background: var(--inputBgColor);
  color: var(--editorColor50);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.kdbx-batch-dropzone:hover, .kdbx-batch-dropzone.is-dragover {
  border-color: var(--themeColor);
  color: var(--themeColor);
  background: var(--floatHoverColor);
}
.kdbx-hidden-input {
  display: none;
}
.kdbx-batch-preview-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}
.kdbx-batch-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
}
.kdbx-batch-preview-header strong {
  color: var(--themeColor);
}
.kdbx-batch-options {
  display: flex;
  align-items: center;
  gap: 12px;
}
.kdbx-batch-table-wrapper {
  max-height: 260px;
  overflow-y: auto;
  border: 1px solid var(--floatBorderColor);
  border-radius: 6px;
  background: var(--sideBarBgColor);
}
.kdbx-batch-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  text-align: left;
}
.kdbx-batch-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--floatBgColor);
  color: var(--editorColor50);
  padding: 6px 8px;
  font-weight: 600;
  border-bottom: 1px solid var(--floatBorderColor);
}
.kdbx-batch-table td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--floatBorderColor);
  vertical-align: middle;
}
.kdbx-batch-table tbody tr:hover {
  background: var(--floatHoverColor);
}
.kdbx-batch-index {
  color: var(--editorColor50);
  text-align: center;
}
.kdbx-batch-code-cell {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
.kdbx-batch-code {
  font-weight: 700;
  color: var(--themeColor);
  letter-spacing: 1px;
}
.kdbx-batch-account-cell {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.kdbx-issuer-tag {
  display: inline-block;
  padding: 1px 4px;
  margin-right: 4px;
  border-radius: 3px;
  background: var(--floatHoverColor);
  color: var(--editorColor80);
  font-size: 11px;
}
.kdbx-account-text {
  color: var(--editorColor50);
}
.kdbx-batch-action-cell {
  text-align: center;
}
.kdbx-remove-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 0;
  background: transparent;
  color: var(--editorColor50);
  border-radius: 3px;
  cursor: pointer;
}
.kdbx-remove-btn:hover {
  background: var(--floatHoverColor);
  color: var(--dangerColor, #d14343);
}
.kdbx-batch-empty-hint {
  padding: 12px;
  text-align: center;
  color: var(--editorColor50);
  font-size: 12px;
  border: 1px dashed var(--floatBorderColor);
  border-radius: 6px;
}
</style>
