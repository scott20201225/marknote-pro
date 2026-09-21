<template>
  <el-tooltip content="标题序号" placement="bottom" :open-delay="400">
    <button
      class="document-editor-control"
      :class="{ active: showHeadingNumbers }"
      type="button"
      aria-label="标题序号"
      :aria-pressed="showHeadingNumbers"
      @click="editorStore.TOGGLE_HEADING_NUMBERING()"
    >
      <span class="ordered-heading-icon" aria-hidden="true">
        <b>1.</b>
        <span class="ordered-heading-lines"><i /><i /></span>
      </span>
    </button>
  </el-tooltip>
  <el-tooltip
    v-if="showHeadingNumbers"
    content="顶级标题参与序号"
    placement="bottom"
    :open-delay="400"
  >
    <button
      class="document-editor-control"
      :class="{ active: includesTopLevel }"
      type="button"
      aria-label="顶级标题参与序号"
      :aria-pressed="includesTopLevel"
      @click="editorStore.TOGGLE_HEADING_NUMBERING_TOP_LEVEL()"
    >
      <span class="heading-level-icon" aria-hidden="true">Hm</span>
    </button>
  </el-tooltip>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/store/editor'

const editorStore = useEditorStore()
const { currentFile } = storeToRefs(editorStore)
const showHeadingNumbers = computed(() => currentFile.value?.showHeadingNumbers === true)
const includesTopLevel = computed(() => currentFile.value?.headingNumberingIncludesTopLevel === true)
</script>

<style scoped>
.ordered-heading-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  gap: 2px;
  width: 18px;
  height: 18px;
  font-family: inherit;
}

.ordered-heading-icon b {
  display: block;
  font-size: 8px;
  font-weight: 600;
  line-height: 1;
  transform: translateY(0.5px);
}

.ordered-heading-lines {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
  height: 8px;
}

.ordered-heading-icon i {
  display: block;
  width: 7px;
  height: 1px;
  background: currentColor;
}

.heading-level-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}

.heading-level-icon::first-letter {
  font-size: 14px;
}
</style>
