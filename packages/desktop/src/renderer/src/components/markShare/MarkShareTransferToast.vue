<template>
  <!-- Rendered natively via MarkShareHudOverlay child window so transfers remain visible over BrowserViews -->
  <span style="display: none" />
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { oneDarkThemes, railscastsThemes } from '@/config'
import { usePreferencesStore } from '@/store/preferences'

const { t, locale } = useI18n()
const preferencesStore = usePreferencesStore()

const syncHudMeta = (): void => {
  const theme = preferencesStore.theme
  const isDark = oneDarkThemes.includes(theme) || railscastsThemes.includes(theme)
  window.electron.ipcRenderer.send('mt::mark-share:sync-hud-meta', {
    isDark,
    labels: {
      waitingConfirmSec: t('markShare.waitingConfirmSec', { sec: '__SEC__' }).replace('__SEC__', '{sec}'),
      sasCode: t('markShare.sasCode'),
      cancelSend: t('markShare.cancelSend'),
      stopTransfer: t('markShare.stopTransfer')
    }
  })
}

watch(
  [() => preferencesStore.theme, () => preferencesStore.preferenceLoaded, locale],
  () => {
    syncHudMeta()
  },
  { immediate: true }
)
</script>
