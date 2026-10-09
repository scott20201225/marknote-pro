<template>
  <el-dialog
    v-model="visible"
    title="双因素认证 (2FA / 键盘交互)"
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
        {{ promptPayload?.prompt || '请输入验证码 / 动态口令:' }}
      </div>
      <el-input
        ref="inputRef"
        v-model="code"
        type="text"
        placeholder="6位验证码或应答字符..."
        autocomplete="one-time-code"
        autofocus
        @keyup.enter="submit"
      />
    </div>
    <template #footer>
      <el-button @click="cancel">取消</el-button>
      <el-button type="primary" :disabled="!code" @click="submit">确认</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useTerminalStore } from '@/store/terminal'
import { storeToRefs } from 'pinia'

const terminalStore = useTerminalStore()
const { pending2fa, is2faDialogOpen } = storeToRefs(terminalStore)

const visible = ref(false)
const code = ref('')
const promptPayload = ref<any>(null)
const inputRef = ref<any>(null)

watch(is2faDialogOpen, (open) => {
  visible.value = open
  if (open) {
    code.value = ''
    promptPayload.value = pending2fa.value
    nextTick(() => {
      inputRef.value?.focus()
    })
  }
})

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
