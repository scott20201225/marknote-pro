<template>
  <div class="recent-files-projects">
    <div class="centered-group">
      {{ message }}
      <el-button
        text
        bg
        type="primary"
        @click="primaryAction"
      >
        {{ actionLabel }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import { useProjectStore } from '@/store/project'
import { t } from '../../i18n'

const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()
const projectStore = useProjectStore()

const workspaceSelectionRequired = computed(() => {
  return (
    preferencesStore.preferenceLoaded &&
    !preferencesStore.defaultDirectoryToOpen &&
    !projectStore.projectTree
  )
})

const message = computed(() => {
  return workspaceSelectionRequired.value ? t('recent.workspaceRequired') : t('recent.noTabsOpen')
})

const actionLabel = computed(() => {
  return workspaceSelectionRequired.value ? t('recent.chooseWorkspace') : t('recent.newFile')
})

const primaryAction = () => {
  if (workspaceSelectionRequired.value) {
    projectStore.ASK_FOR_OPEN_PROJECT()
    return
  }

  editorStore.NEW_UNTITLED_TAB({})
}
</script>

<style scoped>
.recent-files-projects {
  background: var(--editorBgColor);
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-around;
  & .centered-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    color: var(--editorColor);
    & .el-button {
      margin-top: 20px;
    }
    & .el-button.is-text.is-has-bg {
      background-color: var(--buttonPrimaryBgColor);
      color: var(--buttonPrimaryFontColor);
      border-color: transparent;
    }
    & .el-button.is-text.is-has-bg:hover,
    & .el-button.is-text.is-has-bg:focus {
      background-color: var(--buttonPrimaryBgColorHover);
      color: var(--buttonPrimaryFontColorHover);
    }
  }
}
</style>
