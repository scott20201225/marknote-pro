import { usePreferencesStore } from '@/store/preferences'
import type { MindMapConfiguration } from '@shared/types/ipc'
import { getMindMapThemeInfo } from 'common/mindmapTheme'

export const getMindMapConfiguration = (): MindMapConfiguration => {
  const preferencesStore = usePreferencesStore()
  const theme = preferencesStore.theme
  const themeInfo = getMindMapThemeInfo(theme)
  return {
    language: preferencesStore.language === 'en' ? 'en' : 'zh',
    dark: document.body.classList.contains('dark'),
    theme,
    mindMapTheme: themeInfo.mindMapTheme,
    backgroundColor: themeInfo.backgroundColor,
    themeConfig: themeInfo.themeConfig
  }
}

