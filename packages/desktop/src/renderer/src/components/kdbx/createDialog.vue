<template>
  <el-dialog
    v-model="visible"
    class="kdbx-create-dialog"
    width="440px"
    :close-on-click-modal="false"
    @closed="reset"
  >
    <template #header><div class="kdbx-create-title"><span>{{ t('kdbx.createVault') }}</span><el-popover trigger="hover" placement="right-start" :width="360" :show-after="180" popper-class="kdbx-security-popover"><template #reference><button type="button" :aria-label="t('kdbx.vaultSecurityInfo')"><el-icon><QuestionFilled /></el-icon></button></template><p>{{ t('kdbx.vaultSecurityInfo') }}</p></el-popover></div></template>
    <el-form label-position="top" @submit.prevent="createVault">
      <el-form-item :label="t('kdbx.vaultFile')">
        <el-input :model-value="filename" disabled />
      </el-form-item>
      <el-form-item :label="t('kdbx.password')">
        <el-input v-model="password" :class="{ 'is-password-invalid': passwordInvalid }" type="password" show-password autocomplete="new-password" />
        <div class="kdbx-password-rule" :class="{ error: passwordInvalid }">{{ t('kdbx.passwordRule') }}</div>
      </el-form-item>
      <el-form-item :label="t('kdbx.confirmPassword')">
        <el-input v-model="confirmPassword" :class="{ 'is-password-invalid': passwordMismatch }" type="password" show-password autocomplete="new-password" />
        <div v-if="passwordMismatch" class="kdbx-password-rule error">{{ t('kdbx.passwordMismatch') }}</div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="creating" @click="createVault">{{ t('kdbx.createVault') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { QuestionFilled } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import bus from '@/bus'
import notice from '@/services/notification'
import { useProjectStore } from '@/store/project'
import { isKdbxPasswordValid } from '@shared/kdbxPassword'

interface KdbxCreateRequest {
  filePath: string
}

const { t } = useI18n()
const projectStore = useProjectStore()
const visible = ref(false)
const creating = ref(false)
const filePath = ref('')
const password = ref('')
const confirmPassword = ref('')
const filename = computed(() => filePath.value ? window.path.basename(filePath.value) : '')
const passwordInvalid = computed(() => password.value.length > 0 && !isKdbxPasswordValid(password.value))
const passwordMismatch = computed(() => confirmPassword.value.length > 0 && password.value !== confirmPassword.value)

const reset = (): void => {
  filePath.value = ''
  password.value = ''
  confirmPassword.value = ''
  projectStore.createCache = {}
}

const open = (request: KdbxCreateRequest): void => {
  filePath.value = request.filePath
  password.value = ''
  confirmPassword.value = ''
  visible.value = true
}

const onCreateRequest = (request: unknown): void => {
  if (
    !request ||
    typeof request !== 'object' ||
    typeof (request as Partial<KdbxCreateRequest>).filePath !== 'string'
  ) return
  open(request as KdbxCreateRequest)
}

const createVault = async(): Promise<void> => {
  if (!isKdbxPasswordValid(password.value)) {
    return
  }
  if (password.value !== confirmPassword.value) {
    return
  }
  creating.value = true
  try {
    await window.electron.ipcRenderer.invoke('mt::kdbx::create', filePath.value, password.value)
    visible.value = false
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    notice.notify({
      title: t('dialog.saveFailure'),
      message,
      type: 'error',
      time: 20000,
      showConfirm: false
    })
  } finally {
    creating.value = false
  }
}

onMounted(() => bus.on('KDBX::create-request', onCreateRequest))
onBeforeUnmount(() => bus.off('KDBX::create-request', onCreateRequest))
</script>

<style scoped>
.kdbx-create-title { display: flex; align-items: center; gap: 8px; }.kdbx-create-title button { display: inline-flex; width: 22px; height: 22px; align-items: center; justify-content: center; border: 0; border-radius: 50%; background: transparent; color: var(--themeColor); cursor: help; }.kdbx-create-title button:hover { background: var(--floatHoverColor); }.kdbx-password-rule { margin-top: 6px; color: var(--editorColor50); font-size: 12px; line-height: 1.4; }.kdbx-password-rule.error { color: var(--el-color-danger); }.kdbx-create-dialog :deep(.is-password-invalid .el-input__wrapper) { box-shadow: 0 0 0 1px var(--el-color-danger) inset !important; }
:global(.kdbx-create-dialog) { --el-bg-color: var(--floatBgColor); --el-bg-color-overlay: var(--floatBgColor); --el-fill-color-blank: var(--floatBgColor); --el-text-color-primary: var(--editorColor); --el-text-color-regular: var(--editorColor80); --el-text-color-secondary: var(--editorColor50); --el-border-color: var(--floatBorderColor); --el-border-color-light: var(--floatBorderColor); background: var(--floatBgColor); border: 1px solid var(--floatBorderColor); color: var(--editorColor); }.kdbx-create-dialog :deep(.el-dialog__title), .kdbx-create-dialog :deep(.el-form-item__label) { color: var(--editorColor); }.kdbx-create-dialog :deep(.el-dialog__close) { color: var(--editorColor50); }.kdbx-create-dialog :deep(.el-input__wrapper) { background: var(--inputBgColor); box-shadow: 0 0 0 1px var(--floatBorderColor) inset; }.kdbx-create-dialog :deep(.el-input__inner) { color: var(--editorColor); }.kdbx-create-dialog :deep(.el-button--default) { background: var(--floatBgColor); border-color: var(--floatBorderColor); color: var(--editorColor); }
:global(.kdbx-security-popover) { box-sizing: border-box; max-width: calc(100vw - 32px); padding: 10px 12px; border-color: var(--floatBorderColor); background: var(--floatBgColor); color: var(--editorColor); font-size: 13px; line-height: 1.55; white-space: normal; word-break: break-word; }.kdbx-security-popover p { margin: 0; }.kdbx-security-popover :global(.el-popper__arrow::before) { background: var(--floatBgColor); border-color: var(--floatBorderColor); }
</style>
