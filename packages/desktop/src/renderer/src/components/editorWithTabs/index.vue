<template>
  <div
    class="editor-with-tabs"
    :style="{ 'max-width': `calc(100vw - ${effectiveSideBarWidth}px)` }"
  >
    <div class="container">
      <toc
        v-if="showDocumentToc"
        class="document-toc-panel"
        @close="layoutStore.TOGGLE_DOCUMENT_TOC()"
      />
      <div class="editor-content">
        <div class="document-editor-controls">
          <button
            v-if="!showDocumentToc"
            class="document-editor-control"
            type="button"
            :title="t('sideBar.icons.toc')"
            @click="layoutStore.TOGGLE_DOCUMENT_TOC()"
          >
            <el-icon :size="18">
              <Memo />
            </el-icon>
          </button>
          <div v-if="hasMarkdownFile" class="document-heading-controls">
            <heading-numbering-controls />
          </div>
        </div>
        <editor
          :markdown="markdown"
          :cursor="cursor"
          :text-direction="textDirection"
          :platform="platform"
        />
        <source-code
          v-if="sourceCode"
          :markdown="markdown"
          :muya-index-cursor="muyaIndexCursor"
          :text-direction="textDirection"
        />
      </div>
    </div>
    <tab-notifications />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useLayoutStore } from '@/store/layout'
import { useEditorStore } from '@/store/editor'
import { storeToRefs } from 'pinia'
import { Memo } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import Editor from './editor.vue'
import SourceCode from './sourceCode.vue'
import TabNotifications from './notifications.vue'
import Toc from '../sideBar/toc.vue'
import HeadingNumberingControls from './headingNumberingControls.vue'

defineProps<{
  markdown: string
  // `cursor` originates as `IFileState.cursor` which is `unknown`
  // (see src/shared/types/files.ts); align here instead of forcing every
  // caller to widen.
  cursor: unknown
  muyaIndexCursor?: unknown
  sourceCode: boolean
  textDirection: string
  platform: string
}>()

const { t } = useI18n()
const layoutStore = useLayoutStore()
const editorStore = useEditorStore()
const { effectiveSideBarWidth, showDocumentToc } = storeToRefs(layoutStore)
const { currentFile } = storeToRefs(editorStore)
const hasMarkdownFile = computed(() => !!currentFile.value && !currentFile.value.isDrawing)

</script>

<style scoped>
.editor-with-tabs {
  position: relative;
  height: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;

  overflow: hidden;
  background: var(--editorBgColor);
  & > .container {
    flex: 1;
    display: flex;
    overflow: hidden;
  }
}

.document-editor-controls {
  position: absolute;
  z-index: 2;
  top: 12px;
  left: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.document-heading-controls {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

:deep(.document-editor-control) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--editorColor);
  cursor: pointer;
}

:deep(.document-editor-control:hover),
:deep(.document-editor-control.active) {
  color: var(--themeColor);
  background: var(--floatHoverColor);
}

.document-toc-panel {
  flex: 0 0 260px;
  width: 260px;
  overflow: hidden;
  border-right: 1px solid var(--itemBgColor);
}

.editor-content {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
</style>
