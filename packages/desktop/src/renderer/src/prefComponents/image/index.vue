<template>
  <div class="pref-image">
    <h4>{{ t('preferences.image.title') }}</h4>
    <section class="image-ctrl">
      <div>{{ t('preferences.image.screenshotSaveMethod') }}</div>
      <CurSelect
        :value="screenshotSaveMethod"
        :options="screenshotSaveMethods"
        :on-change="(value) => onSelectChange('screenshotSaveMethod', value)"
      />
    </section>
    <section class="image-ctrl image-folder">
      <div>{{ t('preferences.image.folderSetting.globalFolder') }}</div>
      <div class="attachment-path">{{ attachmentDirectory }}</div>
      <el-button
        size="mini"
        :disabled="!workspaceRootPath"
        @click="openAttachmentDirectory"
      >
        {{ t('preferences.image.folderSetting.showInFolder') }}
      </el-button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { usePreferencesStore } from '@/store/preferences'
import { NOTE_ATTACHMENTS_DIRECTORY } from '@/util/fileSystem'
import CurSelect from '../common/select/index.vue'
import type { PreferencesState } from '@/store/preferences'
import { getScreenshotSaveMethods } from './config'

const { t } = useI18n()

const preferenceStore = usePreferencesStore()

const { screenshotSaveMethod, lastOpenedFolder, defaultDirectoryToOpen } = storeToRefs(preferenceStore)

const screenshotSaveMethods = getScreenshotSaveMethods()
const attachmentDirectory = `${NOTE_ATTACHMENTS_DIRECTORY}/`
const workspaceRootPath = computed<string>(() =>
  lastOpenedFolder.value || defaultDirectoryToOpen.value || ''
)

const onSelectChange = (type: keyof PreferencesState, value: unknown): void => {
  preferenceStore.SET_SINGLE_PREFERENCE({ type, value })
}

const openAttachmentDirectory = async(): Promise<void> => {
  const rootPath = workspaceRootPath.value
  if (!rootPath) return
  const attachmentPath = window.path.join(rootPath, NOTE_ATTACHMENTS_DIRECTORY)
  await window.fileUtils.ensureDir(attachmentPath)
  await window.electron.shell.openPath(attachmentPath)
}
</script>

<style>
.pref-image {
  & .image-ctrl {
    font-size: 14px;
    margin: 20px 0;
    color: var(--editorColor);
    & label {
      display: block;
      margin: 20px 0;
    }
  }
  & .attachment-path {
    margin: 10px 0;
    color: var(--editorColor);
  }
}
</style>
