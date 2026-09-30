import { usePreferencesStore } from '@/store/preferences'
import type { GeoGebraConfiguration } from '@shared/types/ipc'

const GEOGEBRA_THEME_VARIABLES = [
  'themeColor',
  'themeColor10',
  'themeColor20',
  'themeColor30',
  'editorColor',
  'editorColor10',
  'editorColor30',
  'editorColor40',
  'editorColor50',
  'editorColor60',
  'editorColor80',
  'editorBgColor',
  'sideBarBgColor',
  'sideBarItemHoverBgColor',
  'itemBgColor',
  'floatBgColor',
  'floatHoverColor',
  'floatBorderColor',
  'inputBgColor',
  'tableBorderColor',
  'selectionColor',
  'highlightColor',
  'iconColor',
  'buttonBgColorHover',
  'buttonBgColorActive',
  'buttonPrimaryBgColorHover',
  'buttonPrimaryBgColorActive',
  'deleteColor'
] as const

const readThemeColors = (): Record<string, string> => {
  const style = window.getComputedStyle(document.documentElement)
  const colors: Record<string, string> = {}

  for (const name of GEOGEBRA_THEME_VARIABLES) {
    const value = style.getPropertyValue(`--${name}`).trim()
    if (value) colors[name] = value
  }

  return colors
}

/** Builds the host configuration used by the embedded GeoGebra BrowserView. */
export const getGeoGebraConfiguration = (): GeoGebraConfiguration => {
  const preferencesStore = usePreferencesStore()
  return {
    language: preferencesStore.language,
    dark: document.body.classList.contains('dark'),
    theme: preferencesStore.theme,
    colors: readThemeColors()
  }
}
