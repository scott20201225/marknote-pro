import { usePreferencesStore } from '@/store/preferences'
import type { DrawioConfiguration } from '@shared/types/ipc'

const DRAWIO_THEME_VARIABLES = [
  'themeColor',
  'themeColor10',
  'themeColor20',
  'themeColor30',
  'editorColor',
  'editorColor30',
  'editorColor50',
  'editorBgColor',
  'sideBarBgColor',
  'sideBarItemHoverBgColor',
  'itemBgColor',
  'floatBgColor',
  'floatHoverColor',
  'floatBorderColor',
  'inputBgColor',
  'tableBorderColor'
] as const

const readThemeColors = (): Record<string, string> => {
  const style = window.getComputedStyle(document.documentElement)
  const colors: Record<string, string> = {}

  for (const name of DRAWIO_THEME_VARIABLES) {
    const value = style.getPropertyValue(`--${name}`).trim()
    if (value) colors[name] = value
  }

  return colors
}

/** Build the complete Drawio bootstrap configuration from the current app state. */
export const getDrawioConfiguration = (): DrawioConfiguration => {
  const preferencesStore = usePreferencesStore()
  return {
    language: preferencesStore.language,
    dark: document.body.classList.contains('dark'),
    theme: preferencesStore.theme,
    colors: readThemeColors()
  }
}
