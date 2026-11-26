<template>
  <span class="ms-os-icon" :class="`os-${osType}`">
    <!-- macOS Apple/Finder-style glyph -->
    <svg v-if="osType === 'darwin'" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        d="M16.52 12.64c-.02-2.21 1.81-3.28 1.89-3.33-1.03-1.51-2.64-1.72-3.21-1.74-1.35-.14-2.66.81-3.35.81-.69 0-1.76-.79-2.9-.77-1.48.02-2.85.87-3.61 2.2-1.55 2.69-.4 6.66 1.1 8.83.74 1.07 1.62 2.27 2.77 2.22 1.12-.04 1.54-.72 2.89-.72 1.35 0 1.73.72 2.9.69 1.2-.02 1.96-1.08 2.69-2.15.86-1.25 1.21-2.46 1.23-2.52-.03-.01-2.38-.92-2.4-3.42zM14.32 6.08c.61-.75 1.03-1.78.91-2.83-.88.04-1.97.59-2.6 1.33-.56.65-1.06 1.71-.93 2.72.99.08 2-.49 2.62-1.22z"
      />
    </svg>

    <!-- Windows 4-pane logo -->
    <svg v-else-if="osType === 'win32'" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 5.2L10.8 4v7.3H3V5.2zm8.9-1.3L21 2.5v8.8h-9.1V3.9zM3 12.6h7.8V20L3 18.8v-6.2zm8.9 0H21v8.9l-9.1-1.4v-7.5z" />
    </svg>

    <!-- Linux terminal / penguin badge -->
    <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M7 9l4 3-4 3" />
      <path d="M13 15h4" />
    </svg>
  </span>
</template>

<script setup lang="ts">
import type { MarkShareOsType } from '@shared/types/markShare'

defineProps<{
  osType: MarkShareOsType
}>()
</script>

<style scoped>
.ms-os-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1em;
  height: 1em;
  line-height: 1;
}

.ms-os-icon svg {
  width: 100%;
  height: 100%;
  display: block;
}

.os-darwin {
  color: #38bdf8;
}

.os-win32 {
  color: #60a5fa;
}

.os-linux {
  color: #f59e0b;
}
</style>
