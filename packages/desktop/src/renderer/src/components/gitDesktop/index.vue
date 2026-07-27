<template>
  <div class="github-desktop-shell" :class="{ 'is-osx': isOsx }">
    <div v-if="isOsx" class="github-desktop-title-drag-region" />
    <div
      ref="surfaceRef"
      class="github-desktop-surface"
    />
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ElMessage } from 'element-plus'
import { usePreferencesStore } from '@/store/preferences'
import bus from '@/bus'
import { isOsx } from '@/util'
import type {
  GitHubDesktopLocalePayload,
  GitHubDesktopShowOptions,
  GitHubDesktopThemePayload
} from '@shared/types/ipc'

const surfaceRef = ref<HTMLDivElement | null>(null)
const preferencesStore = usePreferencesStore()
const { language, theme, zoom } = storeToRefs(preferencesStore)
let boundsSyncAnimationFrame = 0

const GITHUB_DESKTOP_THEME_VARIABLES = [
  'themeColor',
  'themeColor10',
  'themeColor20',
  'themeColor30',
  'themeColor40',
  'themeColor50',
  'selectionColor',
  'editorColor',
  'editorColor80',
  'editorColor60',
  'editorColor50',
  'editorColor40',
  'editorColor30',
  'editorColor10',
  'editorBgColor',
  'sideBarBgColor',
  'sideBarItemHoverBgColor',
  'itemBgColor',
  'floatBgColor',
  'floatHoverColor',
  'floatBorderColor',
  'inputBgColor',
  'tableBorderColor',
  'iconColor',
  'deleteColor',
  'buttonPrimaryFontColor'
] as const

const getCurrentWindowZoomFactor = (): number => {
  const currentZoom = window.electron.webFrame.getZoomFactor()
  if (typeof currentZoom === 'number' && currentZoom > 0) return currentZoom
  return typeof zoom.value === 'number' && zoom.value > 0 ? zoom.value : 1
}

const getPreferredWindowZoomFactor = (): number => {
  return typeof zoom.value === 'number' && zoom.value > 0 ? zoom.value : getCurrentWindowZoomFactor()
}

const getBounds = () => {
  const rect = surfaceRef.value?.getBoundingClientRect()
  if (!rect) return null
  const zoomFactor = getCurrentWindowZoomFactor()
  return {
    x: rect.left * zoomFactor,
    y: rect.top * zoomFactor,
    width: rect.width * zoomFactor,
    height: rect.height * zoomFactor
  }
}

const syncBounds = (): void => {
  const bounds = getBounds()
  if (!bounds) return
  window.electron.ipcRenderer.send('mt::github-desktop::set-bounds', bounds)
}

const syncBoundsDuringZoom = (duration = 220): void => {
  if (boundsSyncAnimationFrame) {
    window.cancelAnimationFrame(boundsSyncAnimationFrame)
  }

  const startedAt = window.performance.now()
  const step = (): void => {
    syncBounds()
    if (window.performance.now() - startedAt < duration) {
      boundsSyncAnimationFrame = window.requestAnimationFrame(step)
    } else {
      boundsSyncAnimationFrame = 0
    }
  }

  boundsSyncAnimationFrame = window.requestAnimationFrame(step)
}

const showGitHubDesktop = async(): Promise<void> => {
  await nextTick()
  const bounds = getBounds()
  if (!bounds) return
  const options: GitHubDesktopShowOptions = {
    bounds,
    zoomFactor: getPreferredWindowZoomFactor(),
    themePayload: readGitHubDesktopThemePayload(),
    localePayload: readGitHubDesktopLocalePayload()
  }
  await window.electron.ipcRenderer.invoke('mt::github-desktop::show', options)
}

const readGitHubDesktopThemePayload = (): GitHubDesktopThemePayload => {
  const style = window.getComputedStyle(document.documentElement)
  const colors: Record<string, string> = {}
  for (const name of GITHUB_DESKTOP_THEME_VARIABLES) {
    const value = style.getPropertyValue(`--${name}`).trim()
    if (value) {
      colors[name] = value
    }
  }

  return {
    theme: theme.value,
    isDark: document.body.classList.contains('dark'),
    colors
  }
}

const syncGitHubDesktopTheme = async(): Promise<void> => {
  await nextTick()
  window.requestAnimationFrame(() => {
    window.electron.ipcRenderer.send('mt::github-desktop::theme-update', readGitHubDesktopThemePayload())
  })
}

const readGitHubDesktopLocalePayload = (locale = language.value): GitHubDesktopLocalePayload => ({
  language: locale
})

const syncGitHubDesktopLocale = async(locale = language.value): Promise<void> => {
  await nextTick()
  window.electron.ipcRenderer.send('mt::github-desktop::locale-update', readGitHubDesktopLocalePayload(locale))
}

const switchToNote = (): void => {
  window.dispatchEvent(new CustomEvent('marknotepro:switch-workbench', { detail: 'note' }))
}

const setWorkspacePath = async(
  workspacePath: string,
  options: { switchToNote: boolean; showMessage: boolean }
): Promise<void> => {
  const normalizedWorkspacePath = window.path.normalize(workspacePath)
  await window.fileUtils.ensureDir(normalizedWorkspacePath)
  preferencesStore.SET_SINGLE_PREFERENCE({
    type: 'defaultDirectoryToOpen',
    value: normalizedWorkspacePath
  })
  window.electron.ipcRenderer.send('mt::reload-workspace', normalizedWorkspacePath)
  if (options.switchToNote) {
    window.dispatchEvent(new CustomEvent('marknotepro:switch-workbench', { detail: 'note' }))
  }
  if (options.showMessage) {
    ElMessage.success('已切换笔记工作区。')
  }
}

const applyWorkspacePath = async(_event: unknown, workspacePath: string): Promise<void> => {
  await setWorkspacePath(workspacePath, { switchToNote: true, showMessage: true })
}

const applyWorkspacePathSilently = async(_event: unknown, workspacePath: string): Promise<void> => {
  await setWorkspacePath(workspacePath, { switchToNote: false, showMessage: false })
}

onMounted(() => {
  showGitHubDesktop()
    .then(async() => {
      await syncGitHubDesktopTheme()
      await syncGitHubDesktopLocale(language.value)
    })
    .catch(() => {})
  window.electron.ipcRenderer.on('mt::github-desktop::switch-to-note', switchToNote)
  window.electron.ipcRenderer.on('mt::github-desktop::workspace-selected', applyWorkspacePath)
  window.electron.ipcRenderer.on('mt::github-desktop::workspace-selected-silent', applyWorkspacePathSilently)
  window.addEventListener('resize', syncBounds)
  bus.on('language-changed', handleLanguageChanged)
})

watch(theme, () => {
  syncGitHubDesktopTheme()
})

watch(zoom, () => {
  void nextTick(() => {
    syncBoundsDuringZoom()
  })
})

watch(language, (locale) => {
  syncGitHubDesktopLocale(locale)
})

const handleLanguageChanged = (locale?: unknown): void => {
  if (typeof locale === 'string') {
    syncGitHubDesktopLocale(locale)
  } else {
    syncGitHubDesktopLocale()
  }
}

onBeforeUnmount(() => {
  if (boundsSyncAnimationFrame) {
    window.cancelAnimationFrame(boundsSyncAnimationFrame)
    boundsSyncAnimationFrame = 0
  }
  window.removeEventListener('resize', syncBounds)
  bus.off('language-changed', handleLanguageChanged)
  window.electron.ipcRenderer.removeAllListeners('mt::github-desktop::switch-to-note')
  window.electron.ipcRenderer.removeAllListeners('mt::github-desktop::workspace-selected')
  window.electron.ipcRenderer.removeAllListeners('mt::github-desktop::workspace-selected-silent')
  window.electron.ipcRenderer.send('mt::github-desktop::hide')
})
</script>

<style scoped>
.github-desktop-shell {
  position: fixed;
  inset: 0;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--editorBgColor);
}

.github-desktop-surface {
  position: absolute;
  inset: 0;
  min-width: 0;
  min-height: 0;
}

.github-desktop-shell.is-osx .github-desktop-surface {
  top: var(--titleBarHeight);
}

.github-desktop-title-drag-region {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  height: var(--titleBarHeight);
  z-index: 2;
  user-select: none;
  -webkit-app-region: drag;
  app-region: drag;
}
</style>
