import { usePreferencesStore } from '@/store/preferences'
import type { MindMapConfiguration } from '@shared/types/ipc'
import { getMindMapThemeInfo } from 'common/mindmapTheme'

const MINDMAP_THEME_VARIABLES = [
  'themeColor',
  'themeColor10',
  'themeColor20',
  'themeColor30',
  'editorColor',
  'editorColor10',
  'editorColor30',
  'editorColor50',
  'editorColor80',
  'editorBgColor',
  'sideBarBgColor',
  'sideBarColor',
  'itemBgColor',
  'floatBgColor',
  'floatFontColor',
  'floatBorderColor',
  'inputBgColor',
  'tableBorderColor',
  'selectionColor',
  'highlightColor'
] as const

const readThemeColors = (): Record<string, string> => {
  const style = window.getComputedStyle(document.documentElement)
  const colors: Record<string, string> = {}

  for (const name of MINDMAP_THEME_VARIABLES) {
    const value = style.getPropertyValue(`--${name}`).trim()
    if (value) colors[name] = value
  }

  return colors
}

export const getMindMapConfiguration = (): MindMapConfiguration => {
  const preferencesStore = usePreferencesStore()
  const theme = preferencesStore.theme
  const themeInfo = getMindMapThemeInfo(theme)
  return {
    language: preferencesStore.language || 'zh-CN',
    dark: themeInfo.isDark,
    theme,
    mindMapTheme: themeInfo.mindMapTheme,
    backgroundColor: themeInfo.backgroundColor,
    themeConfig: themeInfo.themeConfig,
    colors: readThemeColors()
  }
}

