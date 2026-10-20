<template>
  <div
    class="editor-with-tabs"
    :style="{ 'max-width': `calc(100vw - ${effectiveSideBarWidth}px)` }"
  >
    <div class="container">
      <toc
        v-if="showDocumentToc && hasMarkdownFile"
        class="document-toc-panel"
        @close="layoutStore.TOGGLE_DOCUMENT_TOC()"
      />
      <div
        ref="editorContentRef"
        class="editor-content"
        :style="adaptiveEditorStyle"
      >
        <div class="document-editor-controls">
          <button
            v-if="!showDocumentToc && hasMarkdownFile"
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
        <editor-search />
      </div>
    </div>
    <tab-notifications />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useLayoutStore } from '@/store/layout'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import { storeToRefs } from 'pinia'
import { Memo } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import Editor from './editor.vue'
import SourceCode from './sourceCode.vue'
import EditorSearch from '../search/index.vue'
import TabNotifications from './notifications.vue'
import Toc from '../sideBar/toc.vue'
import HeadingNumberingControls from './headingNumberingControls.vue'
import { setEditorWidth } from '@/util/theme'

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
const preferencesStore = usePreferencesStore()
const { effectiveSideBarWidth, showDocumentToc } = storeToRefs(layoutStore)
const { currentFile } = storeToRefs(editorStore)
const { editorLineWidth } = storeToRefs(preferencesStore)

const editorContentRef = ref<HTMLElement | null>(null)
const contentWidth = ref<number>(0)
let contentResizeObserver: ResizeObserver | null = null

const updateContentWidth = () => {
  if (editorContentRef.value) {
    contentWidth.value = editorContentRef.value.clientWidth
  }
}

const hasMarkdownFile = computed(
  () =>
    !!currentFile.value &&
    !currentFile.value.isDrawing &&
    !currentFile.value.isGeoGebra &&
    !currentFile.value.isMindMap &&
    !currentFile.value.isKdbx
)

const adaptiveEditorStyle = computed(() => {
  if (editorLineWidth.value && editorLineWidth.value.trim() !== '') {
    return {}
  }

  const width = contentWidth.value
  if (!width || width <= 0) {
    return {}
  }

  const isTocExpanded = showDocumentToc.value && hasMarkdownFile.value
  let targetAreaWidth: number

  if (isTocExpanded) {
    // When TOC is open: reserve generous side margins (~14% on each side, min 80px, max 180px)
    const sideMargin = Math.max(80, Math.min(180, Math.floor(width * 0.14)))
    targetAreaWidth = Math.max(320, width - sideMargin * 2)
  } else {
    // When TOC is closed: reserve larger side margins (~16% on each side, min 100px, max 220px)
    const sideMargin = Math.max(100, Math.min(220, Math.floor(width * 0.16)))
    targetAreaWidth = Math.max(360, width - sideMargin * 2)
  }

  targetAreaWidth = Math.min(targetAreaWidth, width)

  return {
    '--editor-area-width': `${targetAreaWidth}px`,
    '--editorAreaWidth': `${targetAreaWidth}px`
  }
})

// Keep root variables in sync for floating elements / global tools when adaptive
watch(
  adaptiveEditorStyle,
  (style) => {
    if (editorLineWidth.value && editorLineWidth.value.trim() !== '') {
      return
    }
    const widthStr = (style as Record<string, string>)['--editor-area-width']
    if (widthStr) {
      document.documentElement.style.setProperty('--editor-area-width', widthStr)
      document.documentElement.style.setProperty('--editorAreaWidth', widthStr)
    }
  },
  { immediate: true }
)

watch(editorLineWidth, (val) => {
  if (val && val.trim() !== '') {
    document.documentElement.style.removeProperty('--editor-area-width')
    document.documentElement.style.removeProperty('--editorAreaWidth')
    setEditorWidth(val)
  } else {
    updateContentWidth()
  }
})

watch([showDocumentToc, hasMarkdownFile], () => {
  nextTick(() => {
    updateContentWidth()
  })
})

onMounted(() => {
  updateContentWidth()
  if (editorContentRef.value) {
    contentResizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentBoxSize && entry.contentBoxSize[0]) {
          contentWidth.value = entry.contentBoxSize[0].inlineSize
        } else {
          contentWidth.value = entry.contentRect.width
        }
      }
    })
    contentResizeObserver.observe(editorContentRef.value)
  }
})

onBeforeUnmount(() => {
  if (contentResizeObserver) {
    contentResizeObserver.disconnect()
    contentResizeObserver = null
  }
  document.documentElement.style.removeProperty('--editor-area-width')
  document.documentElement.style.removeProperty('--editorAreaWidth')
})
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
