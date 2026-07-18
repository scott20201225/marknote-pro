<template>
  <div class="pref-general">
    <h4>{{ t('preferences.general.title') }}</h4>
    <compound>
      <template #head>
        <h6 class="title">
          {{ t('preferences.general.autoSave.title') }}
        </h6>
      </template>
      <template #children>
        <bool
          :description="t('preferences.general.autoSave.description')"
          :bool="autoSave"
          :on-change="(value) => onSelectChange('autoSave', value)"
        />
        <range
          :description="t('preferences.general.autoSave.delayDescription')"
          :value="autoSaveDelay"
          :min="1000"
          :max="10000"
          unit="ms"
          :step="100"
          :on-change="(value) => onSelectChange('autoSaveDelay', value)"
        />
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">
          {{ t('preferences.general.window.title') }}
        </h6>
      </template>
      <template #children>
        <cur-select
          v-if="!isOsx && !isWindows"
          :description="t('preferences.general.window.titleBarStyle.title')"
          :notes="t('preferences.general.window.requiresRestart')"
          :value="titleBarStyle"
          :options="getTitleBarStyleOptions()"
          :on-change="(value) => onSelectChange('titleBarStyle', value)"
        />
        <bool
          :description="t('preferences.general.window.hideScrollbars')"
          :bool="hideScrollbar"
          :on-change="(value) => onSelectChange('hideScrollbar', value)"
        />
        <bool
          :description="t('preferences.general.window.openFoldersInNewWindow')"
          :bool="openFolderInNewWindow"
          :on-change="(value) => onSelectChange('openFolderInNewWindow', value)"
        />
        <cur-select
          :description="t('preferences.general.window.zoom')"
          :value="zoom"
          :options="zoomOptions"
          :on-change="(value) => onSelectChange('zoom', value)"
        />
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">
          {{ t('preferences.general.sidebar.title') }}
        </h6>
      </template>
      <template #children>
        <bool
          :description="t('preferences.general.sidebar.wrapTextInToc')"
          :bool="wordWrapInToc"
          :on-change="(value) => onSelectChange('wordWrapInToc', value)"
        />
        <bool
          :description="t('preferences.general.sidebar.showOpenedFiles')"
          :bool="openedFilesInSidebar"
          :on-change="(value) => onSelectChange('openedFilesInSidebar', value)"
        />

        <text-box
          :description="t('preferences.general.sidebar.excludePatterns')"
          :notes="t('preferences.general.sidebar.excludePatternsNotes')"
          :input="projectPaths.join(',')"
          :on-change="(value) => onSelectChange('treePathExcludePatterns', value.split(','))"
          more="https://github.com/isaacs/minimatch"
        />

        <cur-select
          :description="t('preferences.general.sidebar.fileSortBy.title')"
          :value="fileSortBy"
          :options="getFileSortByOptions()"
          :on-change="(value) => onSelectChange('fileSortBy', value)"
        />
        <cur-select
          :description="t('preferences.general.sidebar.fileSortOrder.title')"
          :value="fileSortOrder"
          :options="getFileSortOrderOptions(String(fileSortBy))"
          :on-change="(value) => onSelectChange('fileSortOrder', value)"
        />
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">
          {{ t('preferences.general.startup.title') }}
        </h6>
      </template>
      <template #children>
        <section>
          <div class="workspace-setting">
            <div class="workspace-title">
              {{ t('preferences.general.startup.openDefaultDirectory') }}
            </div>
            <div class="workspace-path">
              {{ defaultDirectoryToOpen || t('preferences.general.startup.workspaceNotSelected') }}
            </div>
            <el-button size="small" @click="selectDefaultDirectoryToOpen">
              {{ t('preferences.general.startup.selectFolder') }}
            </el-button>
          </div>
        </section>
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">
          {{ t('preferences.general.misc.title') }}
        </h6>
      </template>
      <template #children>
        <cur-select
          :description="t('preferences.general.misc.language.title')"
          :value="language"
          :options="getLanguageOptions()"
          :on-change="(value) => onSelectChange('language', value)"
        />
      </template>
    </compound>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { usePreferencesStore } from '@/store/preferences'
import type { PreferencesState } from '@/store/preferences'
import Compound from '../common/compound/index.vue'
import Range from '../common/range/index.vue'
import CurSelect from '../common/select/index.vue'
import Bool from '../common/bool/index.vue'
import textBox from '../common/textBox/index.vue'
import { isOsx, isWindows } from '@/util'

import {
  getTitleBarStyleOptions,
  zoomOptions,
  getFileSortByOptions,
  getFileSortOrderOptions,
  getLanguageOptions
} from './config'

const { t } = useI18n()
const preferenceStore = usePreferencesStore()

const {
  autoSave,
  autoSaveDelay,
  titleBarStyle,
  defaultDirectoryToOpen,
  openFolderInNewWindow,
  treePathExcludePatterns: projectPaths,
  zoom,
  hideScrollbar,
  wordWrapInToc,
  fileSortBy,
  fileSortOrder,
  language,
  openedFilesInSidebar
} = storeToRefs(preferenceStore)

const onSelectChange = (type: keyof PreferencesState, value: unknown): void => {
  preferenceStore.SET_SINGLE_PREFERENCE({ type, value })
}

const selectDefaultDirectoryToOpen = (): void => {
  preferenceStore.SET_SINGLE_PREFERENCE({ type: 'startUpAction', value: 'folder' })
  preferenceStore.SELECT_DEFAULT_DIRECTORY_TO_OPEN()
}
</script>

<style scoped>
.workspace-setting {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--editorColor);
}

.workspace-title {
  font-size: 14px;
  font-weight: 500;
}

.workspace-path {
  font-size: 13px;
  line-height: 1.5;
  word-break: break-all;
}
</style>
