<template>
  <div class="recent-files-projects">
    <div class="centered-group">
      {{ message }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { usePreferencesStore } from '@/store/preferences'
import { useProjectStore } from '@/store/project'
import { t } from '../../i18n'

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
  }
}
</style>
