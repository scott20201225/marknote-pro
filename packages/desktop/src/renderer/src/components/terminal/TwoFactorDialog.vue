<template>
  <el-dialog
    v-model="visible"
    :title="t('terminal.twoFactor.title')"
    width="420px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
  >
    <div class="two-factor-content">
      <div v-if="promptPayload?.instruction" class="two-factor-instruction">
        {{ promptPayload.instruction }}
      </div>
      <div class="two-factor-prompt">
        {{ promptPayload?.prompt || t('terminal.twoFactor.defaultPrompt') }}
      </div>
      <el-input
        ref="inputRef"
        v-model="code"
        type="text"
        :placeholder="t('terminal.twoFactor.placeholder')"
        autocomplete="one-time-code"
        autofocus
        @keyup.enter="submit"
      />
    </div>
    <template #footer>
      <el-button @click="cancel">{{ t('terminal.twoFactor.cancel') }}</el-button>
      <el-button type="primary" :disabled="!code" @click="submit">{{ t('terminal.twoFactor.confirm') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { t } from '@/i18n'
import { useTerminalStore } from '@/store/terminal'
import { storeToRefs } from 'pinia'

const terminalStore = useTerminalStore()
const { pending2fa, is2faDialogOpen } = storeToRefs(terminalStore)

const visible = ref(false)
const code = ref('')
const promptPayload = ref<any>(null)
const inputRef = ref<any>(null)

watch(
  () => terminalStore.pending2fa,
  (val) => {
    if (val) {
      code.value = ''
      promptPayload.value = val
      visible.value = true
      nextTick(() => {
        inputRef.value?.focus()
      })
    } else {
      visible.value = false
    }
  },
  { immediate: true }
)

function submit(): void {
  if (!promptPayload.value) return
  terminalStore.send2faAnswer(promptPayload.value.promptId, code.value)
  code.value = ''
}

function cancel(): void {
  if (!promptPayload.value) return
  terminalStore.send2faAnswer(promptPayload.value.promptId, '')
  code.value = ''
}
</script>

<style scoped>
.two-factor-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.two-factor-instruction {
  font-size: 13px;
  color: var(--iconColor, #888);
  background: var(--sideBarBgColor, #252526);
  padding: 8px 12px;
  border-radius: 4px;
}

.two-factor-prompt {
  font-size: 14px;
  font-weight: 500;
  color: var(--editorColor, #e0e0e0);
}
</style>
