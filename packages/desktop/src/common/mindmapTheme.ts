import { getThemeBackgroundColor, isDarkThemeId } from './theme'

/**
 * Mapping between MarkNotePro theme IDs and the visually most corresponding
 * Simple Mind Map themes (structure, lines, node accents, contrast).
 */
export const marknoteToMindMapThemeMap: Readonly<Record<string, string>> = Object.freeze({
  // Light themes
  light: 'classic4',
  'ayu-light': 'classic11',
  'catppuccin-latte': 'morandi',
  'everforest-light': 'avocado',
  graphite: 'classic11',
  'gruvbox-light': 'classic14',
  'rose-pine-dawn': 'rose',
  'solarized-light': 'classicGreen',
  'tokyo-night-light': 'classic15',
  ulysses: 'classic10',

  // Dark themes
  'ayu-dark': 'dark',
  'ayu-mirage': 'lateNightOffice',
  'catppuccin-mocha': 'dark4',
  cyberdream: 'dark5',
  dark: 'dark2',
  dracula: 'dark4',
  'everforest-dark': 'classic',
  'gruvbox-dark': 'blackGold',
  'horizon-dark': 'blackHumour',
  kanagawa: 'dark4',
  'material-dark': 'classic',
  'monokai-pro': 'blackGold',
  nightfox: 'dark7',
  nord: 'darkNightLceBlade',
  'one-dark': 'lateNightOffice',
  'oxocarbon-dark': 'dark3',
  palenight: 'dark7',
  'rose-pine': 'dark5',
  'rose-pine-moon': 'dark4',
  'solarized-dark': 'dark6',
  'synthwave-84': 'neonLamp',
  'tokyo-night': 'dark2',
  'tokyo-night-storm': 'dark7'
})

export const getMindMapThemeForMarknote = (theme: string | undefined): string => {
  if (typeof theme === 'string' && marknoteToMindMapThemeMap[theme]) {
    return marknoteToMindMapThemeMap[theme]
  }
  return isDarkThemeId(theme) ? 'dark2' : 'classic4'
}

export interface MindMapThemeInfo {
  theme: string
  mindMapTheme: string
  backgroundColor: string
  isDark: boolean
}

export const getMindMapThemeInfo = (theme: string | undefined): MindMapThemeInfo => {
  const normTheme = typeof theme === 'string' && theme ? theme : 'light'
  const isDark = isDarkThemeId(normTheme)
  const mindMapTheme = getMindMapThemeForMarknote(normTheme)
  const backgroundColor = getThemeBackgroundColor(normTheme)
  return {
    theme: normTheme,
    mindMapTheme,
    backgroundColor,
    isDark
  }
}
