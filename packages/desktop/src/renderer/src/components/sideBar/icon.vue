<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import '@marknotepro/file-icons/build/index.css'

const props = defineProps<{
  name: string
}>()

type FileIconsLike = {
  matchName: (name: string) => { getClass: (index: number, asArray: boolean) => string } | null
}

const fileIcons = ref<FileIconsLike | null>(null)

// The legacy `muya/lib/ui/fileIcons` wrapper added a `getClassByName(name)`
// helper around the raw package's `matchName(name)?.getClass(0, false)`.
// Inline that here so we depend on `@marknotepro/file-icons` directly.
const getClassByName = (name: string): string | null => {
  const icon = fileIcons.value?.matchName(name)
  return icon ? icon.getClass(0, false) : null
}

const className = computed<string[]>(() => {
  if (/\.ggb$/i.test(props.name)) return ['geogebra-file-icon']
  if (/\.smm$/i.test(props.name)) return ['mindmap-file-icon']

  let classNames: string | null | undefined = getClassByName(
    props.name ? props.name : 'mock.md'
  )

  if (!classNames) {
    // Use fallback icon when the icon is unknown.
    classNames = getClassByName('mock.md')
  }
  return (classNames ?? '').split(/\s/)
})

onMounted(async() => {
  if (window.marknotepro?.env?.standalone) {
    return
  }

  try {
    const mod = await import('@marknotepro/file-icons')
    fileIcons.value = (mod.default ?? mod) as FileIconsLike
  } catch (error) {
    console.error('Failed to load file icons package.', error)
  }
})
</script>

<template>
  <span v-if="className[0] === 'geogebra-file-icon'" class="file-icon geogebra-file-icon">G</span>
  <span v-else-if="className[0] === 'mindmap-file-icon'" class="file-icon mindmap-file-icon">M</span>
  <span v-else :class="className" class="file-icon" />
</template>

<style scoped>
.file-icon {
  flex-shrink: 0;
  margin-right: 5px;
}

.geogebra-file-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-right: 5px;
  border-radius: 3px;
  background: #6f9f32;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 16px;
  font-family: Arial, sans-serif;
}

.mindmap-file-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-right: 5px;
  border-radius: 3px;
  background: #6366f1;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 16px;
  font-family: Arial, sans-serif;
}
</style>
