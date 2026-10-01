import { getThemeBackgroundColor, isDarkThemeId } from './theme'

export interface MindMapNodeStyle {
  fillColor?: string
  color?: string
  borderColor?: string
  borderWidth?: number
  fontSize?: number
  shape?: string
  borderRadius?: number
}

export interface MindMapThemeStyleConfig {
  backgroundColor: string
  lineColor?: string
  generalizationLineColor?: string
  root?: MindMapNodeStyle
  second?: MindMapNodeStyle
  node?: {
    color?: string
    fontSize?: number
  }
  [key: string]: unknown
}

export interface MindMapThemeDefinition {
  template: string
  themeConfig?: (backgroundColor: string) => Partial<MindMapThemeStyleConfig>
}

/**
 * 33套 MarkNotePro 主题到 Simple Mind Map 模板和节点/线条样式的精准适配映射表。
 * 大方向：深色对应 Simple Mind Map 深色模板，浅色对应经典/朴素浅色模板。
 * 二次筛选：根据主题色（--themeColor）与高亮色系微调节点背景、边框及连线颜色。
 */
export const marknoteThemeDefinitions: Readonly<Record<string, MindMapThemeDefinition>> = Object.freeze({
  // ==========================================
  // 浅色主题 (Light Themes) - 10套全独立模板
  // ==========================================

  // 1. light: 纯白简约，经典蓝节点
  light: {
    template: 'classic11',
    themeConfig: (bg) => ({
      backgroundColor: bg,
      lineColor: '#333333',
      root: { fillColor: '#409eff', color: '#ffffff' }
    })
  },

  // 2. ayu-light: 天空蓝明快，清亮蓝线
  'ayu-light': {
    template: 'blueSky',
    themeConfig: (bg) => ({
      backgroundColor: bg,
      lineColor: '#73a1bf',
      root: { fillColor: '#399ee6', color: '#ffffff' }
    })
  },

  // 3. catppuccin-latte: 柔和拿铁紫蓝，粉边次级节点
  'catppuccin-latte': {
    template: 'classic8',
    themeConfig: (bg) => ({
      backgroundColor: bg,
      lineColor: '#36aaa9',
      root: { fillColor: '#1e66f5', color: '#ffffff' },
      second: { borderColor: '#ea76cb' }
    })
  },

  // 4. everforest-light: 温暖牛油果森系自然绿
  'everforest-light': {
    template: 'avocado',
    themeConfig: (bg) => ({
      backgroundColor: bg,
      lineColor: '#a7b827',
      root: { fillColor: '#8da101', color: '#ffffff' }
    })
  },

  // 5. graphite: 石墨灰高反差建筑黑白极简风格
  graphite: {
    template: 'simpleBlack',
    themeConfig: (bg) => ({
      backgroundColor: bg,
      lineColor: '#222222',
      root: { fillColor: '#ffffff', color: '#222222', borderColor: '#222222', borderWidth: 2 }
    })
  },

  // 6. gruvbox-light: 复古羊皮纸，暖棕线与青绿节点
  'gruvbox-light': {
    template: 'classic14',
    themeConfig: (bg) => ({
      backgroundColor: bg,
      lineColor: '#976a43',
      root: { fillColor: '#458588', color: '#ffffff' },
      second: { borderColor: '#b57614' }
    })
  },

  // 7. rose-pine-dawn: 莫兰迪微醺粉调，优雅灰褐连线
  'rose-pine-dawn': {
    template: 'morandi',
    themeConfig: (bg) => ({
      backgroundColor: bg,
      lineColor: '#90726e',
      root: { fillColor: '#907aa9', color: '#ffffff' },
      second: { borderColor: '#b4637a' }
    })
  },

  // 8. solarized-light: 经典 Solarized 青绿/湖蓝调
  'solarized-light': {
    template: 'courseGreen',
    themeConfig: (bg) => ({
      backgroundColor: bg,
      lineColor: '#2aa198',
      root: { fillColor: '#268bd2', color: '#ffffff' },
      second: { borderColor: '#859900' }
    })
  },

  // 9. tokyo-night-light: 东京夜晨冷调靛青
  'tokyo-night-light': {
    template: 'classic15',
    themeConfig: (bg) => ({
      backgroundColor: bg,
      lineColor: '#3e416c',
      root: { fillColor: '#34548a', color: '#ffffff' }
    })
  },

  // 10. ulysses: 写作纸浅海天青蓝
  ulysses: {
    template: 'shallowSea',
    themeConfig: (bg) => ({
      backgroundColor: bg,
      lineColor: '#4a8baa',
      root: { fillColor: '#0c8bba', color: '#ffffff' }
    })
  },

  // ==========================================
  // 深色主题 (Dark Themes) - 23套全定制独立风格
  // ==========================================

  // 11. synthwave-84: 80年代复古未来霓虹品红
  'synthwave-84': {
    template: 'neonLamp',
    themeConfig: (bg) => ({
      backgroundColor: bg,
      lineColor: '#ff7edb',
      root: { fillColor: '#2b213a', color: '#ff7edb', borderColor: '#ff7edb' }
    })
  },

  // 12. nord: 极地冰川极光青白
  nord: {
    template: 'darkNightLceBlade',
    themeConfig: (bg) => ({
      backgroundColor: bg,
      lineColor: '#88c0d0',
      root: { fillColor: '#81a1c1', color: '#2e3440', borderColor: '#eceff4' }
    })
  },

  // 13. solarized-dark: 深青碧绿背景，亮青节点
  'solarized-dark': {
    template: 'dark6',
    themeConfig: (bg) => ({
      backgroundColor: bg,
      lineColor: '#2aa198',
      root: { fillColor: '#268bd2', color: '#002b36' },
      second: { borderColor: '#2aa198' }
    })
  },

  // 14. cyberdream: 赛博朋克深空荧光绿与电光蓝
  cyberdream: {
    template: 'dark5',
    themeConfig: (bg) => ({
      backgroundColor: bg,
      lineColor: '#5ea1ff',
      root: { fillColor: '#5eff6c', color: '#0d220f' },
      second: { borderColor: '#5ea1ff' }
    })
  },

  // 15. material-dark: 鲜明活力橙
  'material-dark': {
    template: 'orangeJuice',
    themeConfig: (bg) => ({
      backgroundColor: bg,
      lineColor: '#f48237',
      root: { fillColor: '#f48237', color: '#ffffff' }
    })
  },

  // 16. monokai-pro: 明亮亮黄暖金
  'monokai-pro': {
    template: 'blackGold',
    themeConfig: (bg) => ({
      backgroundColor: bg,
      lineColor: '#ffd866',
      root: { fillColor: '#ffd866', color: '#2d2a2e' },
      second: { borderColor: '#ff6188' }
    })
  },

  // 17. gruvbox-dark: 暖调炭黑底色搭配草绿与暖金
  'gruvbox-dark': {
    template: 'blackHumour',
    themeConfig: (bg) => ({
      backgroundColor: bg,
      lineColor: '#d79921',
      root: { fillColor: '#b8bb26', color: '#282828' },
      second: { fillColor: '#3c3836', color: '#ebdbb2', borderColor: '#fabd2f' }
    })
  },

  // 18. horizon-dark: 暖调珊瑚玫红与暗夜粉
  'horizon-dark': {
    template: 'dark3',
    themeConfig: (bg) => ({
      backgroundColor: bg,
      lineColor: '#e95678',
      root: { fillColor: '#e95678', color: '#ffffff' },
      second: { fillColor: '#232530', color: '#fab795', borderColor: '#26bbd9' }
    })
  },

  // 19. everforest-dark: 暗夜森林柔和鼠尾草绿
  'everforest-dark': {
    template: 'dark',
    themeConfig: (bg) => ({
      backgroundColor: bg,
      lineColor: '#83c092',
      root: { fillColor: '#a7c080', color: '#2d353b' }
    })
  },

  // 20. dark: 经典灰黑底色与 MarkNotePro 蓝线
  dark: {
    template: 'dark2',
    themeConfig: (bg) => ({
      backgroundColor: bg,
      lineColor: '#409eff',
      root: { fillColor: '#409eff', color: '#ffffff' }
    })
  },

  // 21. kanagawa: 和风葛饰北斋海浪靛青与抹茶绿
  kanagawa: {
    template: 'dark4',
    themeConfig: (bg) => ({
      backgroundColor: bg,
      lineColor: '#7e9cd8',
      root: { fillColor: '#7e9cd8', color: '#1f1f28' },
      second: { fillColor: '#2a2a37', color: '#dcd7ba', borderColor: '#98bb6c' }
    })
  },

  // 22. ayu-mirage: 深海暗蓝底色搭配阳光金
  'ayu-mirage': {
    template: 'lateNightOffice',
    themeConfig: (bg) => ({
      backgroundColor: bg,
      lineColor: '#73b8ff',
      root: { fillColor: '#ffcc66', color: '#1f2430' }
    })
  },

  // 23. nightfox: 午夜远航幽蓝与金色点缀
  nightfox: {
    template: 'dark7',
    themeConfig: (bg) => ({
      backgroundColor: bg,
      lineColor: '#719cd6',
      root: { fillColor: '#719cd6', color: '#192330' },
      second: { borderColor: '#dbc074' }
    })
  },

  // 24. oxocarbon-dark: 纯粹深黑极简冷峻白线
  'oxocarbon-dark': {
    template: 'classic',
    themeConfig: (bg) => ({
      backgroundColor: bg,
      backgroundImage: 'none',
      lineColor: '#ffffff',
      root: { fillColor: '#78a9ff', color: '#161616' }
    })
  },

  // 25. dracula: 德古拉经典纯正紫罗兰与亮粉
  dracula: {
    template: 'neonLamp',
    themeConfig: (bg) => ({
      backgroundColor: bg,
      lineColor: '#bd93f9',
      root: { fillColor: '#bd93f9', color: '#282a36' },
      second: { fillColor: '#44475a', color: '#f8f8f2', borderColor: '#ff79c6', borderWidth: 2 }
    })
  },

  // 26. rose-pine: 浪漫松林午夜紫与玫瑰粉
  'rose-pine': {
    template: 'dark4',
    themeConfig: (bg) => ({
      backgroundColor: bg,
      lineColor: '#eb6f92',
      root: { fillColor: '#c4a7e7', color: '#191724' },
      second: { fillColor: '#26233a', color: '#e0def4', borderColor: '#9ccfd8', borderWidth: 1 }
    })
  },

  // 27. rose-pine-moon: 月夜鸢尾紫与暖金光芒
  'rose-pine-moon': {
    template: 'dark7',
    themeConfig: (bg) => ({
      backgroundColor: bg,
      lineColor: '#ea9a97',
      root: { fillColor: '#ea9a97', color: '#232136' },
      second: { fillColor: '#393552', color: '#e0def4', borderColor: '#f6c177', borderWidth: 1 }
    })
  },

  // 28. ayu-dark: 极深暗夜底色搭配明朗电光青
  'ayu-dark': {
    template: 'darkNightLceBlade',
    themeConfig: (bg) => ({
      backgroundColor: bg,
      lineColor: '#39bae6',
      root: { fillColor: '#39bae6', color: '#0a0e14' },
      second: { fillColor: '#131721', color: '#b3b1ad', borderColor: '#ffb454', borderWidth: 1 }
    })
  },

  // 29. one-dark: 经典 Atom 暗蓝灰搭配翠绿边框
  'one-dark': {
    template: 'lateNightOffice',
    themeConfig: (bg) => ({
      backgroundColor: bg,
      lineColor: '#61afef',
      root: { fillColor: '#61afef', color: '#282c34' },
      second: { fillColor: '#3e4451', color: '#abb2bf', borderColor: '#98c379', borderWidth: 1 }
    })
  },

  // 30. tokyo-night: 东京午夜蓝与浅紫霞光
  'tokyo-night': {
    template: 'dark7',
    themeConfig: (bg) => ({
      backgroundColor: bg,
      lineColor: '#7aa2f7',
      root: { fillColor: '#7aa2f7', color: '#1a1b26' },
      second: { fillColor: '#24283b', color: '#c0caf5', borderColor: '#bb9af7', borderWidth: 1 }
    })
  },

  // 31. tokyo-night-storm: 东京风暴青蓝
  'tokyo-night-storm': {
    template: 'dark6',
    themeConfig: (bg) => ({
      backgroundColor: bg,
      lineColor: '#7dcfff',
      root: { fillColor: '#7dcfff', color: '#1f2335' },
      second: { fillColor: '#292e42', color: '#c0caf5', borderColor: '#7aa2f7', borderWidth: 1 }
    })
  },

  // 32. palenight: 优雅浅紫夜空与淡紫连线
  palenight: {
    template: 'dark4',
    themeConfig: (bg) => ({
      backgroundColor: bg,
      lineColor: '#c792ea',
      root: { fillColor: '#82aaff', color: '#292d3e' },
      second: { fillColor: '#444267', color: '#a6accd', borderColor: '#c792ea', borderWidth: 1 }
    })
  },

  // 33. catppuccin-mocha: 摩卡柔粉紫与火烈鸟粉
  'catppuccin-mocha': {
    template: 'dark2',
    themeConfig: (bg) => ({
      backgroundColor: bg,
      lineColor: '#89b4fa',
      root: { fillColor: '#89b4fa', color: '#1e1e2e' },
      second: { fillColor: '#313244', color: '#cdd6f4', borderColor: '#f5c2e7', borderWidth: 1 }
    })
  }
})

export const getMindMapThemeForMarknote = (theme: string | undefined): string => {
  if (typeof theme === 'string' && marknoteThemeDefinitions[theme]) {
    return marknoteThemeDefinitions[theme].template
  }
  return isDarkThemeId(theme) ? 'dark2' : 'classic11'
}

export interface MindMapThemeInfo {
  theme: string
  mindMapTheme: string
  backgroundColor: string
  isDark: boolean
  themeConfig: MindMapThemeStyleConfig
}

export const getMindMapThemeInfo = (theme: string | undefined): MindMapThemeInfo => {
  const normTheme = typeof theme === 'string' && theme ? theme : 'light'
  const isDark = isDarkThemeId(normTheme)
  const def = marknoteThemeDefinitions[normTheme]
  const mindMapTheme = def ? def.template : (isDark ? 'dark2' : 'classic11')
  const backgroundColor = getThemeBackgroundColor(normTheme)
  const customConfig = def?.themeConfig ? def.themeConfig(backgroundColor) : { backgroundColor }

  return {
    theme: normTheme,
    mindMapTheme,
    backgroundColor,
    isDark,
    themeConfig: {
      backgroundColor,
      backgroundImage: 'none',
      ...customConfig
    }
  }
}
