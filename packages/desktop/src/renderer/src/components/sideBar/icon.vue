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
  <span
    :class="className"
    class="file-icon"
  />
</template>

<style scoped>
.file-icon {
  flex-shrink: 0;
  margin-right: 5px;
}
</style>
