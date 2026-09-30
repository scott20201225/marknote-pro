import type { WebContents } from 'electron'
import log from 'electron-log'
import type { GeoGebraConfiguration } from '../../shared/types/ipc'

/**
 * Comprehensive theme palette tokens for GeoGebra.
 * All tokens are systematically derived from MarkNotePro's active theme.
 */
export interface GeoGebraThemePalette {
  readonly isDark: boolean
  // Euclidean drawing area & canvas
  readonly canvasBg: string
  readonly axesColor: string
  readonly gridColor: string

  // Surfaces & Panels
  readonly surface: string
  readonly panel: string
  readonly headerBg: string
  readonly headerColor: string
  readonly elevated: string
  readonly inputBg: string
  readonly inputBgActive: string

  // Typography
  readonly textPrimary: string
  readonly textSecondary: string
  readonly textMuted: string

  // Borders & Structure
  readonly border: string
  readonly borderSubtle: string
  readonly borderHover: string
  readonly borderFocus: string

  // Interaction States
  readonly hover: string
  readonly hoverStrong: string
  readonly active: string
  readonly selected: string
  readonly selectedText: string

  // Accent & Actions
  readonly accent: string
  readonly accentHover: string
  readonly accentActive: string
  readonly accentLight: string
  readonly accentText: string
  readonly selection: string
  readonly focusRing: string
  readonly shadow: string
  readonly error: string

  // Switcher / Toggles
  readonly switchTrackOff: string
  readonly switchThumbOff: string

  // Icons
  readonly iconFilter: string
}

interface RgbaColor {
  r: number
  g: number
  b: number
  a: number
}

const parseColor = (str: string | undefined): RgbaColor | null => {
  if (!str) return null
  const trimmed = str.trim()

  const hexMatch = trimmed.match(/^#([0-9a-f]{3,8})$/i)
  if (hexMatch) {
    let hex = hexMatch[1]
    if (hex.length === 3 || hex.length === 4) {
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('')
    }
    const r = parseInt(hex.substring(0, 2), 16)
    const g = parseInt(hex.substring(2, 4), 16)
    const b = parseInt(hex.substring(4, 6), 16)
    const a = hex.length >= 8 ? parseInt(hex.substring(6, 8), 16) / 255 : 1
    return { r, g, b, a }
  }

  const rgbMatch = trimmed.match(
    /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)$/i
  )
  if (rgbMatch) {
    return {
      r: Math.round(parseFloat(rgbMatch[1])),
      g: Math.round(parseFloat(rgbMatch[2])),
      b: Math.round(parseFloat(rgbMatch[3])),
      a: rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1
    }
  }

  return null
}

const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)))

const toHex = (r: number, g: number, b: number): string => {
  const h = (v: number): string => clamp(v).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

const getLuminance = (c: RgbaColor): number => {
  const sR = c.r / 255
  const sG = c.g / 255
  const sB = c.b / 255
  const r = sR <= 0.03928 ? sR / 12.92 : Math.pow((sR + 0.055) / 1.055, 2.4)
  const g = sG <= 0.03928 ? sG / 12.92 : Math.pow((sG + 0.055) / 1.055, 2.4)
  const b = sB <= 0.03928 ? sB / 12.92 : Math.pow((sB + 0.055) / 1.055, 2.4)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const mix = (c1: RgbaColor, c2: RgbaColor, weight: number): RgbaColor => ({
  r: c1.r * (1 - weight) + c2.r * weight,
  g: c1.g * (1 - weight) + c2.g * weight,
  b: c1.b * (1 - weight) + c2.b * weight,
  a: c1.a * (1 - weight) + c2.a * weight
})

const sanitizeColor = (value: string | undefined, fallback: string): string => {
  if (!value) return fallback
  const trimmed = value.trim()
  return trimmed && !/[;{}]/.test(trimmed) ? trimmed : fallback
}

/**
 * Computes a unified GeoGebra palette from MarkNotePro's theme configuration.
 *
 * Baseline Reference (1cd03011 and before):
 * In 1cd03011, stock GeoGebra operated with its native light UI without custom overrides.
 *
 * For all 33 themes in MarkNotePro (light themes like gruvbox-light, solarized-light,
 * catppuccin-latte, everforest-light, graphite, etc., and dark themes like one-dark,
 * dracula, nord, catppuccin-mocha, dark, tokyo-night, etc.):
 * The engine dynamically computes a cohesive palette mapped to ALL GeoGebra components,
 * crucially including the drawing canvas background, coordinate axes, grid, hover states,
 * selection states, and editable active states.
 */
export const computeGeoGebraThemePalette = (
  configuration: GeoGebraConfiguration
): GeoGebraThemePalette => {
  const isDark = configuration.dark === true
  const colors = configuration.colors ?? {}

  // 1. Reference Baseline: Pure Native GeoGebra Light Skin
  if (!isDark && (configuration.theme === 'light' || !configuration.theme)) {
    const accent = sanitizeColor(colors.themeColor, '#6557D2')
    return {
      isDark: false,
      canvasBg: '#ffffff',
      axesColor: '#666666',
      gridColor: '#e0e0e0',
      surface: '#ffffff',
      panel: '#f8f8f8',
      headerBg: '#ffffff',
      headerColor: '#1c1c1f',
      elevated: '#ffffff',
      inputBg: '#ffffff',
      inputBgActive: '#ffffff',
      textPrimary: '#1c1c1f',
      textSecondary: '#6e6d73',
      textMuted: '#909399',
      border: '#dcdcdc',
      borderSubtle: '#e6e6eb',
      borderHover: '#999999',
      borderFocus: accent,
      hover: '#f3f2f7',
      hoverStrong: '#e8e7ef',
      active: 'rgba(101, 87, 210, 0.18)',
      selected: '#f0eef9',
      selectedText: accent,
      accent,
      accentHover: '#5243be',
      accentActive: '#4334a9',
      accentLight: sanitizeColor(colors.themeColor10, 'rgba(101, 87, 210, 0.12)'),
      accentText: '#ffffff',
      selection: '#accef7',
      focusRing: accent,
      shadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
      error: '#b00020',
      switchTrackOff: '#c5c5c5',
      switchThumbOff: '#f1f1f1',
      iconFilter: 'none'
    }
  }

  // Parse key base colors from theme
  const bgRaw =
    parseColor(colors.editorBgColor) ||
    (isDark ? { r: 40, g: 40, b: 40, a: 1 } : { r: 250, g: 250, b: 250, a: 1 })
  const textRaw =
    parseColor(colors.editorColor) ||
    (isDark ? { r: 220, g: 223, b: 230, a: 1 } : { r: 44, g: 62, b: 80, a: 1 })
  const accentRaw = parseColor(colors.themeColor) || { r: 64, g: 158, b: 255, a: 1 }
  const borderRaw =
    parseColor(colors.tableBorderColor) ||
    (isDark ? mix(bgRaw, textRaw, 0.25) : mix(bgRaw, textRaw, 0.18))
  const floatRaw =
    parseColor(colors.floatBgColor) ||
    (isDark ? mix(bgRaw, { r: 255, g: 255, b: 255, a: 1 }, 0.08) : { r: 255, g: 255, b: 255, a: 1 })

  // 2. Compute Drawing Area (Euclidean View) Graphics Options
  const canvasBgHex = toHex(bgRaw.r, bgRaw.g, bgRaw.b)
  let axesColorHex: string
  let gridColorHex: string

  if (isDark) {
    // Contrast axes on dark canvas: mix text towards crisp white
    const axesMix = mix(textRaw, { r: 255, g: 255, b: 255, a: 1 }, 0.25)
    axesColorHex = toHex(axesMix.r, axesMix.g, axesMix.b)
    // Grid lines: subtle 16% luminance above background
    const gridMix = mix(bgRaw, { r: 255, g: 255, b: 255, a: 1 }, 0.16)
    gridColorHex = toHex(gridMix.r, gridMix.g, gridMix.b)
  } else {
    // Contrast axes on light canvas: mix text towards deep neutral
    const axesMix = mix(textRaw, { r: 0, g: 0, b: 0, a: 1 }, 0.35)
    axesColorHex = toHex(axesMix.r, axesMix.g, axesMix.b)
    // Grid lines: subtle 12% darker than background
    const gridMix = mix(bgRaw, { r: 0, g: 0, b: 0, a: 1 }, 0.12)
    gridColorHex = toHex(gridMix.r, gridMix.g, gridMix.b)
  }

  // Compute text contrast on accent button
  const accentLum = getLuminance(accentRaw)
  const accentText = accentLum > 0.55 ? '#1c1c1f' : '#ffffff'

  // 3. Dark Theme System
  if (isDark) {
    const surface = canvasBgHex
    const panel = sanitizeColor(
      colors.sideBarBgColor,
      toHex(
        mix(bgRaw, { r: 0, g: 0, b: 0, a: 1 }, 0.12).r,
        mix(bgRaw, { r: 0, g: 0, b: 0, a: 1 }, 0.12).g,
        mix(bgRaw, { r: 0, g: 0, b: 0, a: 1 }, 0.12).b
      )
    )
    const elevated = sanitizeColor(colors.floatBgColor, toHex(floatRaw.r, floatRaw.g, floatRaw.b))
    const inputBg = sanitizeColor(colors.inputBgColor, surface)
    const inputBgActive = toHex(
      mix(parseColor(colors.inputBgColor) || bgRaw, { r: 255, g: 255, b: 255, a: 1 }, 0.05).r,
      mix(parseColor(colors.inputBgColor) || bgRaw, { r: 255, g: 255, b: 255, a: 1 }, 0.05).g,
      mix(parseColor(colors.inputBgColor) || bgRaw, { r: 255, g: 255, b: 255, a: 1 }, 0.05).b
    )
    const textPrimary = sanitizeColor(colors.editorColor, '#dcdfe6')
    const textSecondary = sanitizeColor(
      colors.editorColor80 || colors.editorColor50,
      toHex(mix(textRaw, bgRaw, 0.35).r, mix(textRaw, bgRaw, 0.35).g, mix(textRaw, bgRaw, 0.35).b)
    )
    const textMuted = sanitizeColor(
      colors.editorColor30 || colors.editorColor40,
      toHex(mix(textRaw, bgRaw, 0.58).r, mix(textRaw, bgRaw, 0.58).g, mix(textRaw, bgRaw, 0.58).b)
    )
    const border = sanitizeColor(colors.tableBorderColor, toHex(borderRaw.r, borderRaw.g, borderRaw.b))
    const borderSubtle = sanitizeColor(
      colors.floatBorderColor,
      toHex(mix(bgRaw, textRaw, 0.12).r, mix(bgRaw, textRaw, 0.12).g, mix(bgRaw, textRaw, 0.12).b)
    )
    const borderHover = toHex(
      mix(borderRaw, textRaw, 0.4).r,
      mix(borderRaw, textRaw, 0.4).g,
      mix(borderRaw, textRaw, 0.4).b
    )
    const accent = sanitizeColor(colors.themeColor, '#409eff')
    const borderFocus = accent

    const hover = sanitizeColor(
      colors.floatHoverColor || colors.sideBarItemHoverBgColor,
      'rgba(255, 255, 255, 0.08)'
    )
    const hoverStrong = sanitizeColor(colors.buttonBgColorHover, 'rgba(255, 255, 255, 0.14)')
    const active = sanitizeColor(colors.buttonBgColorActive, 'rgba(255, 255, 255, 0.22)')
    const selected = sanitizeColor(colors.themeColor20, 'rgba(64, 158, 255, 0.25)')
    const selectedText = accent

    const accentHover = sanitizeColor(
      colors.buttonPrimaryBgColorHover,
      toHex(
        mix(accentRaw, { r: 255, g: 255, b: 255, a: 1 }, 0.15).r,
        mix(accentRaw, { r: 255, g: 255, b: 255, a: 1 }, 0.15).g,
        mix(accentRaw, { r: 255, g: 255, b: 255, a: 1 }, 0.15).b
      )
    )
    const accentActive = sanitizeColor(
      colors.buttonPrimaryBgColorActive,
      toHex(
        mix(accentRaw, { r: 0, g: 0, b: 0, a: 1 }, 0.15).r,
        mix(accentRaw, { r: 0, g: 0, b: 0, a: 1 }, 0.15).g,
        mix(accentRaw, { r: 0, g: 0, b: 0, a: 1 }, 0.15).b
      )
    )
    const accentLight = sanitizeColor(colors.themeColor10 || colors.themeColor20, 'rgba(64, 158, 255, 0.2)')
    const selection = sanitizeColor(colors.selectionColor, 'rgba(64, 158, 255, 0.35)')
    const error = sanitizeColor(colors.deleteColor, '#f56c6c')

    return {
      isDark: true,
      canvasBg: canvasBgHex,
      axesColor: axesColorHex,
      gridColor: gridColorHex,
      surface,
      panel,
      headerBg: panel,
      headerColor: textPrimary,
      elevated,
      inputBg,
      inputBgActive,
      textPrimary,
      textSecondary,
      textMuted,
      border,
      borderSubtle,
      borderHover,
      borderFocus,
      hover,
      hoverStrong,
      active,
      selected,
      selectedText,
      accent,
      accentHover,
      accentActive,
      accentLight,
      accentText,
      selection,
      focusRing: accent,
      shadow: '0 4px 20px rgba(0, 0, 0, 0.45)',
      error,
      switchTrackOff: 'rgba(255, 255, 255, 0.2)',
      switchThumbOff: '#909399',
      iconFilter: 'invert(0.85) hue-rotate(180deg)'
    }
  }

  // 4. Light Custom Theme System (graphite, ulysses, solarized-light, gruvbox-light,
  // catppuccin-latte, everforest-light, ayu-light, rose-pine-dawn)
  const surface = canvasBgHex
  const panel = sanitizeColor(
    colors.sideBarBgColor,
    toHex(
      mix(bgRaw, { r: 0, g: 0, b: 0, a: 1 }, 0.04).r,
      mix(bgRaw, { r: 0, g: 0, b: 0, a: 1 }, 0.04).g,
      mix(bgRaw, { r: 0, g: 0, b: 0, a: 1 }, 0.04).b
    )
  )
  const elevated = sanitizeColor(colors.floatBgColor, '#ffffff')
  const inputBg = sanitizeColor(colors.inputBgColor, '#ffffff')
  const inputBgActive = toHex(
    mix(parseColor(colors.inputBgColor) || bgRaw, { r: 0, g: 0, b: 0, a: 1 }, 0.02).r,
    mix(parseColor(colors.inputBgColor) || bgRaw, { r: 0, g: 0, b: 0, a: 1 }, 0.02).g,
    mix(parseColor(colors.inputBgColor) || bgRaw, { r: 0, g: 0, b: 0, a: 1 }, 0.02).b
  )
  const textPrimary = sanitizeColor(colors.editorColor, '#2c3e50')
  const textSecondary = sanitizeColor(
    colors.editorColor80 || colors.editorColor50,
    toHex(mix(textRaw, bgRaw, 0.35).r, mix(textRaw, bgRaw, 0.35).g, mix(textRaw, bgRaw, 0.35).b)
  )
  const textMuted = sanitizeColor(
    colors.editorColor30 || colors.editorColor40,
    toHex(mix(textRaw, bgRaw, 0.55).r, mix(textRaw, bgRaw, 0.55).g, mix(textRaw, bgRaw, 0.55).b)
  )
  const border = sanitizeColor(colors.tableBorderColor, '#dcdcdc')
  const borderSubtle = sanitizeColor(colors.floatBorderColor, '#e8eaed')
  const borderHover = toHex(
    mix(borderRaw, textRaw, 0.4).r,
    mix(borderRaw, textRaw, 0.4).g,
    mix(borderRaw, textRaw, 0.4).b
  )
  const accent = sanitizeColor(colors.themeColor, '#409eff')
  const borderFocus = accent

  const hover = sanitizeColor(
    colors.floatHoverColor || colors.sideBarItemHoverBgColor,
    'rgba(0, 0, 0, 0.05)'
  )
  const hoverStrong = sanitizeColor(colors.buttonBgColorHover, 'rgba(0, 0, 0, 0.09)')
  const active = sanitizeColor(colors.buttonBgColorActive, 'rgba(0, 0, 0, 0.14)')
  const selected = sanitizeColor(colors.themeColor10 || colors.themeColor20, 'rgba(64, 158, 255, 0.15)')
  const selectedText = accent

  const accentHover = sanitizeColor(
    colors.buttonPrimaryBgColorHover,
    toHex(
      mix(accentRaw, { r: 0, g: 0, b: 0, a: 1 }, 0.1).r,
      mix(accentRaw, { r: 0, g: 0, b: 0, a: 1 }, 0.1).g,
      mix(accentRaw, { r: 0, g: 0, b: 0, a: 1 }, 0.1).b
    )
  )
  const accentActive = sanitizeColor(
    colors.buttonPrimaryBgColorActive,
    toHex(
      mix(accentRaw, { r: 0, g: 0, b: 0, a: 1 }, 0.2).r,
      mix(accentRaw, { r: 0, g: 0, b: 0, a: 1 }, 0.2).g,
      mix(accentRaw, { r: 0, g: 0, b: 0, a: 1 }, 0.2).b
    )
  )
  const accentLight = sanitizeColor(colors.themeColor10, 'rgba(64, 158, 255, 0.12)')
  const selection = sanitizeColor(colors.selectionColor, 'rgba(64, 158, 255, 0.25)')
  const error = sanitizeColor(colors.deleteColor, '#f56c6c')

  return {
    isDark: false,
    canvasBg: canvasBgHex,
    axesColor: axesColorHex,
    gridColor: gridColorHex,
    surface,
    panel,
    headerBg: panel,
    headerColor: textPrimary,
    elevated,
    inputBg,
    inputBgActive,
    textPrimary,
    textSecondary,
    textMuted,
    border,
    borderSubtle,
    borderHover,
    borderFocus,
    hover,
    hoverStrong,
    active,
    selected,
    selectedText,
    accent,
    accentHover,
    accentActive,
    accentLight,
    accentText,
    selection,
    focusRing: accent,
    shadow: '0 2px 12px rgba(0, 0, 0, 0.1)',
    error,
    switchTrackOff: '#c5c5c5',
    switchThumbOff: '#f1f1f1',
    iconFilter: 'none'
  }
}

/**
 * Builds the comprehensive stylesheet to inject into GeoGebra's web view.
 * Covers all UI component layers with design tokens.
 */
export const buildGeoGebraThemeCss = (configuration: GeoGebraConfiguration): string => {
  // Baseline fidelity: for default 'light' theme, leave stock GeoGebra CSS untouched
  if (!configuration.dark && configuration.theme === 'light') {
    return ''
  }

  const palette = computeGeoGebraThemePalette(configuration)

  return `
    .GeoGebraFrame {
      /* Comprehensive Design Tokens */
      --ggb-theme-surface: ${palette.surface};
      --ggb-theme-canvas-bg: ${palette.canvasBg};
      --ggb-theme-panel: ${palette.panel};
      --ggb-theme-header: ${palette.headerBg};
      --ggb-theme-header-color: ${palette.headerColor};
      --ggb-theme-elevated: ${palette.elevated};
      --ggb-theme-input: ${palette.inputBg};
      --ggb-theme-input-active: ${palette.inputBgActive};
      --ggb-theme-text: ${palette.textPrimary};
      --ggb-theme-text-secondary: ${palette.textSecondary};
      --ggb-theme-text-muted: ${palette.textMuted};
      --ggb-theme-border: ${palette.border};
      --ggb-theme-border-subtle: ${palette.borderSubtle};
      --ggb-theme-border-hover: ${palette.borderHover};
      --ggb-theme-border-focus: ${palette.borderFocus};
      --ggb-theme-hover: ${palette.hover};
      --ggb-theme-hover-strong: ${palette.hoverStrong};
      --ggb-theme-active: ${palette.active};
      --ggb-theme-selected: ${palette.selected};
      --ggb-theme-selected-text: ${palette.selectedText};
      --ggb-theme-accent: ${palette.accent};
      --ggb-theme-accent-hover: ${palette.accentHover};
      --ggb-theme-accent-active: ${palette.accentActive};
      --ggb-theme-accent-light: ${palette.accentLight};
      --ggb-theme-accent-text: ${palette.accentText};
      --ggb-theme-selection: ${palette.selection};
      --ggb-theme-focus-ring: ${palette.focusRing};
      --ggb-theme-shadow: ${palette.shadow};
      --ggb-theme-error: ${palette.error};
      --ggb-theme-switch-track-off: ${palette.switchTrackOff};
      --ggb-theme-switch-thumb-off: ${palette.switchThumbOff};

      /* GeoGebra built-in CSS vars mapped to tokens */
      --ggb-primary-color: ${palette.accent} !important;
      --ggb-primary-variant-color: ${palette.accentLight} !important;
      --ggb-dark-color: ${palette.accentHover} !important;
      --ggb-light-color: ${palette.accentLight} !important;
      --ggb-selection-color: ${palette.selection} !important;
    }

    /* Global Selection Highlight */
    .GeoGebraFrame *::selection {
      background-color: var(--ggb-theme-selection) !important;
      color: inherit !important;
    }

    /* =========================================================================
       1. 全局字体与图标色彩统一治理 (消除未配置元素默认黑色问题)
       ========================================================================= */

    /* 统一人类可读文本基础前景色 */
    .GeoGebraFrame,
    .GeoGebraFrame span,
    .GeoGebraFrame div,
    .GeoGebraFrame p,
    .GeoGebraFrame b,
    .GeoGebraFrame strong,
    .GeoGebraFrame label,
    .GeoGebraFrame th,
    .GeoGebraFrame td,
    .GeoGebraFrame input,
    .GeoGebraFrame textarea,
    .GeoGebraFrame select,
    .GeoGebraFrame option,
    .GeoGebraFrame .gwt-Label,
    .GeoGebraFrame .gwt-HTML,
    .GeoGebraFrame .gwt-InlineLabel,
    .GeoGebraFrame .gwt-Tree,
    .GeoGebraFrame .gwt-TreeItem,
    .GeoGebraFrame .gwt-TextBox,
    .GeoGebraFrame .gwt-TextArea,
    .GeoGebraFrame .title,
    .GeoGebraFrame .dialogTitle,
    .GeoGebraFrame .appName,
    .GeoGebraFrame .elemText,
    .GeoGebraFrame .avOutput,
    .GeoGebraFrame .avValue,
    .GeoGebraFrame .canvasVal,
    .GeoGebraFrame .selectedOption {
      color: var(--ggb-theme-text) !important;
    }

    /* 次级文字、占位符与提示文本 */
    .GeoGebraFrame .groupLabel,
    .GeoGebraFrame .dialogSubTitle,
    .GeoGebraFrame .subtext,
    .GeoGebraFrame .supportLabel,
    .GeoGebraFrame .avDummyLabel,
    .GeoGebraFrame .avNameLogo,
    .GeoGebraFrame .catLabel,
    .GeoGebraFrame .versionNumber,
    .GeoGebraFrame .optionLabelHolder .label,
    .GeoGebraFrame .popupSliderLabel,
    .GeoGebraFrame .sliderLabel,
    .GeoGebraFrame .displayValue,
    .GeoGebraFrame .prefix,
    .GeoGebraFrame .prefixLatex,
    .GeoGebraFrame .header .tabButton:not(.selected) {
      color: var(--ggb-theme-text-muted) !important;
    }

    .GeoGebraFrame input::placeholder,
    .GeoGebraFrame textarea::placeholder {
      color: var(--ggb-theme-text-muted) !important;
      opacity: 0.7 !important;
    }

    /* 图标字体与矢量 SVG 前景色治理 (FontAwesome & Inline SVGs) */
    .GeoGebraFrame .fa-solid,
    .GeoGebraFrame .fa-light {
      color: var(--ggb-theme-text) !important;
      opacity: 0.75 !important;
      transition: color 150ms ease, opacity 150ms ease !important;
    }

    .GeoGebraFrame svg:not(.checkmarkSvg):not(.checkmark) {
      fill: var(--ggb-theme-text) !important;
    }

    .GeoGebraFrame .arrow svg,
    .GeoGebraFrame .headerArrow svg {
      fill: var(--ggb-theme-text-muted) !important;
    }

    /* =========================================================================
       2. 框架、视口、分割条与滚动条
       ========================================================================= */
    .GeoGebraFrame,
    .GeoGebraFrame .gwt-SplitLayoutPanel.neutral-0,
    .GeoGebraFrame .main,
    .GeoGebraFrame .dockPanel,
    .GeoGebraFrame .euclidianViewPanel,
    .GeoGebraFrame .EuclidianPanel,
    .GeoGebraFrame .EuclidianPanel3D,
    .GeoGebraFrame .euclidianView,
    .GeoGebraFrame .euclidianView3D,
    .GeoGebraFrame .EuclidianView3D {
      background-color: var(--ggb-theme-surface) !important;
      color: var(--ggb-theme-text) !important;
    }

    .GeoGebraFrame .euclidianViewPanel canvas:not(.overlayGraphics),
    .GeoGebraFrame .EuclidianPanel canvas:not(.overlayGraphics),
    .GeoGebraFrame .EuclidianPanel3D canvas:not(.overlayGraphics),
    .GeoGebraFrame .euclidianView canvas:not(.overlayGraphics),
    .GeoGebraFrame .euclidianView3D canvas:not(.overlayGraphics),
    .GeoGebraFrame .EuclidianView3D canvas:not(.overlayGraphics),
    .GeoGebraFrame .euclidianView2 canvas:not(.overlayGraphics),
    .GeoGebraFrame .EuclidianPanel2 canvas:not(.overlayGraphics) {
      background-color: var(--ggb-theme-canvas-bg) !important;
    }

    /* 画笔、手绘函数及高亮覆盖层 Canvas 必须保持绝对透明，防止遮挡主绘图区内容与坐标网格 */
    .GeoGebraFrame .overlayGraphics,
    .GeoGebraFrame canvas.overlayGraphics {
      background: transparent !important;
      background-color: transparent !important;
    }

    /* 所有公式、代数、输入框及表格编辑 Canvas 默认透明底色，防止反色产生底色色块 */
    .GeoGebraFrame .algebraView canvas,
    .GeoGebraFrame .algebraPanel canvas,
    .GeoGebraFrame .avItem canvas,
    .GeoGebraFrame .avInputItem canvas,
    .GeoGebraFrame .elem canvas,
    .GeoGebraFrame .elemText canvas,
    .GeoGebraFrame .scrollableTextBox canvas,
    .GeoGebraFrame .latexItem canvas,
    .GeoGebraFrame .canvasVal,
    .GeoGebraFrame .canvasDef,
    .GeoGebraFrame .newRadioButtonTreeItemParent canvas,
    .GeoGebraFrame .tableEditor canvas,
    .GeoGebraFrame .tableEditorWrap canvas,
    .GeoGebraFrame .tvTable canvas,
    .GeoGebraFrame .mathTextField canvas,
    .GeoGebraFrame .evInputEditor canvas,
    .GeoGebraFrame .CAS_outputPanel canvas,
    .GeoGebraFrame .textDialog .previewPanel canvas,
    .GeoGebraFrame .insertPopup canvas {
      background: transparent !important;
      background-color: transparent !important;
    }

    .GeoGebraFrame .EuclidianStyleBar3D,
    .GeoGebraFrame .styleBar3D {
      background-color: var(--ggb-theme-panel) !important;
      border-bottom: 1px solid var(--ggb-theme-border-subtle) !important;
    }

    .GeoGebraFrame .gwt-SplitLayoutPanel-HDragger,
    .GeoGebraFrame .gwt-SplitLayoutPanel-VDragger {
      background-color: var(--ggb-theme-border-subtle) !important;
    }

    .GeoGebraFrame ::-webkit-scrollbar {
      background-color: var(--ggb-theme-surface) !important;
      width: 6px !important;
      height: 6px !important;
    }
    .GeoGebraFrame ::-webkit-scrollbar-thumb {
      background-color: var(--ggb-theme-border) !important;
      border-radius: 3px !important;
    }
    .GeoGebraFrame ::-webkit-scrollbar-thumb:hover {
      background-color: var(--ggb-theme-text-muted) !important;
    }
    .GeoGebraFrame .customScrollbar {
      scrollbar-color: var(--ggb-theme-border) var(--ggb-theme-surface) !important;
    }

    /* =========================================================================
       3. 下拉菜单与各类弹出层 (Dropdowns, Popups, Menus, Selects)
          - 覆盖：dropDownPopup, autoCompletePopup, SuggestBox, quickStyleBarPopup,
                 appPickerPopup, contextSubMenu, menuView, gwt-PopupPanel
       ========================================================================= */
    .GeoGebraFrame .floatingMenuView,
    .GeoGebraFrame .headeredMenuView,
    .GeoGebraFrame .menuView,
    .GeoGebraFrame .mainMenu,
    .GeoGebraFrame .subMenu,
    .GeoGebraFrame .contextSubMenu,
    .GeoGebraFrame .compactMenu,
    .GeoGebraFrame .menuPicker,
    .GeoGebraFrame .dropDownPopup,
    .GeoGebraFrame .autoCompletePopup,
    .GeoGebraFrame .gwt-SuggestBoxPopup,
    .GeoGebraFrame .ggb-AlgebraViewSuggestionPopup,
    .GeoGebraFrame .helpPopupAV,
    .GeoGebraFrame .optionsPopup,
    .GeoGebraFrame .appPickerPopup,
    .GeoGebraFrame .quickStyleBarPopup,
    .GeoGebraFrame .quickStyleBarFontSizePopup,
    .GeoGebraFrame .insertPopup,
    .GeoGebraFrame .previewPointsPopup,
    .GeoGebraFrame .SymbolTablePopup,
    .GeoGebraFrame .matPopupPanel,
    .GeoGebraFrame .gwt-PopupPanel {
      background-color: var(--ggb-theme-elevated) !important;
      color: var(--ggb-theme-text) !important;
      border: 1px solid var(--ggb-theme-border) !important;
      box-shadow: var(--ggb-theme-shadow) !important;
    }

    .GeoGebraFrame .headerDivider,
    .GeoGebraFrame .menuView .divider,
    .GeoGebraFrame .menuSeparator,
    .GeoGebraFrame .divider {
      background-color: var(--ggb-theme-border-subtle) !important;
      border-color: var(--ggb-theme-border-subtle) !important;
    }

    /* 选项元素的基础样式 */
    .GeoGebraFrame .dropDownElement,
    .GeoGebraFrame .menuItemView,
    .GeoGebraFrame .listMenuItem,
    .GeoGebraFrame .gwt-MenuItem,
    .GeoGebraFrame .gwt-SuggestBoxPopup .item,
    .GeoGebraFrame .inputHelp-leaf,
    .GeoGebraFrame .appPickerLabel,
    .GeoGebraFrame .insertPopup .gwt-Label,
    .GeoGebraFrame .matSelectionTable td .gwt-Label {
      background: transparent !important;
      color: var(--ggb-theme-text) !important;
      transition: background-color 120ms ease, color 120ms ease !important;
    }

    /* 下拉菜单与弹出项：鼠标移动上的颜色 (Hover) */
    .GeoGebraFrame .dropDownElement:hover,
    .GeoGebraFrame .dropDownPopup .listMenuItem:hover,
    .GeoGebraFrame .dropDownPopup .gwt-MenuItem:hover,
    .GeoGebraFrame .menuItemView:hover,
    .GeoGebraFrame .listMenuItem:hover,
    .GeoGebraFrame .gwt-MenuItem:hover,
    .GeoGebraFrame .listMenuItem .text:hover,
    .GeoGebraFrame .listMenuItem .itemWithButton:hover,
    .GeoGebraFrame .listMenuItem .itemWithButton .text:hover,
    .GeoGebraFrame .gwt-SuggestBoxPopup .item:hover,
    .GeoGebraFrame .autoCompletePopup tr:hover,
    .GeoGebraFrame .gwt-SuggestBoxPopup tr:hover,
    .GeoGebraFrame .inputHelp-leaf:hover,
    .GeoGebraFrame .appPickerPopup .appPickerRow:hover,
    .GeoGebraFrame .quickStyleBarPopup .checkMarkMenuItem:hover,
    .GeoGebraFrame .lineThicknessItem:hover,
    .GeoGebraFrame .insertPopup .gwt-Label:hover,
    .GeoGebraFrame .insertPopup canvas:hover,
    .GeoGebraFrame .SymbolTable td:hover,
    .GeoGebraFrame .SymbolTable td.focus,
    .GeoGebraFrame .matSelectionTable td .gwt-Label:hover {
      background-color: var(--ggb-theme-hover) !important;
      color: var(--ggb-theme-text) !important;
    }

    .GeoGebraFrame .menuItemView:hover .fa-solid,
    .GeoGebraFrame .menuItemView:hover .fa-light,
    .GeoGebraFrame .listMenuItem:hover .fa-solid,
    .GeoGebraFrame .listMenuItem:hover .fa-light {
      color: var(--ggb-theme-accent) !important;
      opacity: 1 !important;
    }

    /* 下拉菜单与弹出项：鼠标选中后的颜色 (Selected / Active) */
    .GeoGebraFrame .selectedDropDownElement,
    .GeoGebraFrame .selectedDropDownElement:hover,
    .GeoGebraFrame .dropDownPopup [aria-selected="true"],
    .GeoGebraFrame .menuItemView.selected,
    .GeoGebraFrame .gwt-MenuItem-selected,
    .GeoGebraFrame .listMenuItem.selectedItem,
    .GeoGebraFrame .gwt-SuggestBoxPopup .item.selectedItem,
    .GeoGebraFrame .autoCompletePopup .item.selectedItem,
    .GeoGebraFrame .autoCompletePopup tr.selected,
    .GeoGebraFrame .appPickerPopup .appPickerRow.selected,
    .GeoGebraFrame .quickStyleBarPopup .checkMarkMenuItem.selected,
    .GeoGebraFrame .lineThicknessItem .checkImg.selected,
    .GeoGebraFrame .matSelectionTable td .gwt-Label.selected,
    .GeoGebraFrame .matSelectionTable td .selected {
      background-color: var(--ggb-theme-active) !important;
      color: var(--ggb-theme-accent) !important;
      font-weight: 600 !important;
    }

    /* 下拉菜单键盘聚焦态 (Focused / FakeFocus) */
    .GeoGebraFrame .dropDownPopup.keyboardFocus .dropDownElement:focus-visible,
    .GeoGebraFrame .dropDownPopup.forceKeyboardFocus .selectedDropDownElement,
    .GeoGebraFrame .menuItemView.keyboardFocus:focus-visible,
    .GeoGebraFrame .listMenuItem.fakeFocus,
    .GeoGebraFrame .listMenuItem.keyboardFocus:focus-visible {
      outline: 2px solid var(--ggb-theme-accent) !important;
      outline-offset: -2px !important;
      background-color: var(--ggb-theme-accent-light) !important;
      color: var(--ggb-theme-accent) !important;
    }

    /* 原生 select 与 .gwt-ListBox */
    .GeoGebraFrame select,
    .GeoGebraFrame .gwt-ListBox {
      background-color: var(--ggb-theme-input) !important;
      color: var(--ggb-theme-text) !important;
      border: 1px solid var(--ggb-theme-border) !important;
      border-radius: 4px !important;
      padding: 4px 8px !important;
    }
    .GeoGebraFrame select:hover,
    .GeoGebraFrame .gwt-ListBox:hover {
      border-color: var(--ggb-theme-border-hover) !important;
    }
    .GeoGebraFrame select:focus,
    .GeoGebraFrame .gwt-ListBox:focus {
      border-color: var(--ggb-theme-accent) !important;
      outline: 2px solid var(--ggb-theme-accent-light) !important;
    }
    .GeoGebraFrame select option,
    .GeoGebraFrame .gwt-ListBox option {
      background-color: var(--ggb-theme-elevated) !important;
      color: var(--ggb-theme-text) !important;
    }
    .GeoGebraFrame select option:checked,
    .GeoGebraFrame .gwt-ListBox option:checked {
      background-color: var(--ggb-theme-active) !important;
      color: var(--ggb-theme-accent) !important;
    }

    /* =========================================================================
       4. 按钮交互体系 (Buttons: Hover, Active, Focus, Selected)
       ========================================================================= */

    /* 文本按钮与基础操作按钮 */
    .GeoGebraFrame .materialTextButton,
    .GeoGebraFrame .gwt-Button,
    .GeoGebraFrame .buttonPanel .button,
    .GeoGebraFrame .flatDialogBtn {
      background: transparent !important;
      color: var(--ggb-theme-accent) !important;
      border: 1px solid transparent !important;
      transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease !important;
    }

    .GeoGebraFrame .materialTextButton .gwt-Label,
    .GeoGebraFrame .flatDialogBtn .gwt-Label {
      color: var(--ggb-theme-accent) !important;
    }

    /* 文本按钮鼠标移动上的颜色 (Button Hover) */
    .GeoGebraFrame .materialTextButton:hover,
    .GeoGebraFrame .gwt-Button:hover,
    .GeoGebraFrame .buttonPanel .button:hover,
    .GeoGebraFrame .flatDialogBtn:hover {
      background-color: var(--ggb-theme-hover) !important;
      color: var(--ggb-theme-accent-hover) !important;
      border-color: transparent !important;
    }

    .GeoGebraFrame .materialTextButton:hover .gwt-Label,
    .GeoGebraFrame .flatDialogBtn:hover .gwt-Label {
      color: var(--ggb-theme-accent-hover) !important;
    }

    /* 填充主按钮 (Filled Primary Button) */
    .GeoGebraFrame .materialFilledButton,
    .GeoGebraFrame .buttonPanel .primary,
    .GeoGebraFrame .buttonPanel .confirm {
      background-color: var(--ggb-theme-accent) !important;
      color: var(--ggb-theme-accent-text) !important;
      border-color: var(--ggb-theme-accent) !important;
    }
    .GeoGebraFrame .materialFilledButton:hover,
    .GeoGebraFrame .buttonPanel .primary:hover,
    .GeoGebraFrame .buttonPanel .confirm:hover {
      background-color: var(--ggb-theme-accent-hover) !important;
      color: var(--ggb-theme-accent-text) !important;
      border-color: var(--ggb-theme-accent-hover) !important;
    }
    .GeoGebraFrame .materialFilledButton:active,
    .GeoGebraFrame .buttonPanel .primary:active,
    .GeoGebraFrame .buttonPanel .confirm:active {
      background-color: var(--ggb-theme-accent-active) !important;
      border-color: var(--ggb-theme-accent-active) !important;
    }

    /* 轮廓按钮 (Outlined Button) */
    .GeoGebraFrame .materialOutlinedButton {
      background: transparent !important;
      border: 1px solid var(--ggb-theme-border) !important;
      color: var(--ggb-theme-text) !important;
    }
    .GeoGebraFrame .materialOutlinedButton:hover {
      background-color: var(--ggb-theme-hover) !important;
      border-color: var(--ggb-theme-border-hover) !important;
      color: var(--ggb-theme-text) !important;
    }

    /* 色调/次级按钮 (Tonal Button) */
    .GeoGebraFrame .materialTonalButton {
      background-color: var(--ggb-theme-panel) !important;
      color: var(--ggb-theme-text) !important;
    }
    .GeoGebraFrame .materialTonalButton:hover {
      background-color: var(--ggb-theme-hover-strong) !important;
      color: var(--ggb-theme-text) !important;
    }

    /* 图标按钮 (Icon Buttons) */
    .GeoGebraFrame .iconButton,
    .GeoGebraFrame .flatButtonHeader,
    .GeoGebraFrame .buttonWithIcon,
    .GeoGebraFrame .flatButton,
    .GeoGebraFrame .algebraView .more,
    .GeoGebraFrame .speedPanel .flatButton,
    .GeoGebraFrame .playOnly {
      background: transparent !important;
      color: var(--ggb-theme-text) !important;
      transition: background-color 150ms ease, color 150ms ease !important;
    }

    .GeoGebraFrame .iconButton:hover,
    .GeoGebraFrame .flatButtonHeader:hover,
    .GeoGebraFrame .buttonWithIcon:hover,
    .GeoGebraFrame .flatButton:hover,
    .GeoGebraFrame .algebraView .more:hover,
    .GeoGebraFrame .speedPanel .flatButton:hover,
    .GeoGebraFrame .playOnly:hover {
      background-color: var(--ggb-theme-hover) !important;
      color: var(--ggb-theme-text) !important;
    }

    .GeoGebraFrame .iconButton.active,
    .GeoGebraFrame .quickStylebar .IconButton.active {
      background-color: var(--ggb-theme-active) !important;
      color: var(--ggb-theme-accent) !important;
    }

    /* 悬浮操作按钮 (Floating Buttons) */
    .GeoGebraFrame .moveFloatingBtn {
      background-color: var(--ggb-theme-accent) !important;
      color: var(--ggb-theme-accent-text) !important;
    }
    .GeoGebraFrame .moveFloatingBtn:hover,
    .GeoGebraFrame .moveFloatingBtn:focus {
      background-color: var(--ggb-theme-accent-hover) !important;
    }

    .GeoGebraFrame .zoomPanelBtn,
    .GeoGebraFrame .graphicsControlsPanel,
    .GeoGebraFrame .graphicsControlsPanel .iconButton,
    .GeoGebraFrame .quickStylebar,
    .GeoGebraFrame .quickStylebar .IconButton {
      background-color: var(--ggb-theme-elevated) !important;
      color: var(--ggb-theme-text) !important;
      border-color: var(--ggb-theme-border) !important;
      box-shadow: var(--ggb-theme-shadow) !important;
    }
    .GeoGebraFrame .zoomPanelBtn:hover,
    .GeoGebraFrame .graphicsControlsPanel .iconButton:hover,
    .GeoGebraFrame .quickStylebar .IconButton:hover {
      background-color: var(--ggb-theme-hover) !important;
    }

    /* 连体按钮组 (Connected Button Group) */
    .GeoGebraFrame .connectedButtonGroup .connectedButton {
      background-color: var(--ggb-theme-panel) !important;
      border: 1px solid var(--ggb-theme-border-subtle) !important;
    }
    .GeoGebraFrame .connectedButtonGroup .connectedButton .gwt-Label {
      color: var(--ggb-theme-text) !important;
    }
    .GeoGebraFrame .connectedButtonGroup .connectedButton:hover {
      background-color: var(--ggb-theme-hover-strong) !important;
    }
    /* 连体按钮选中态 */
    .GeoGebraFrame .connectedButtonGroup .connectedButton.selected,
    .GeoGebraFrame .connectedButtonGroup .connectedButton.selected:hover {
      background-color: var(--ggb-theme-accent) !important;
    }
    .GeoGebraFrame .connectedButtonGroup .connectedButton.selected .gwt-Label,
    .GeoGebraFrame .connectedButtonGroup .connectedButton.selected:hover .gwt-Label {
      color: var(--ggb-theme-accent-text) !important;
    }

    /* 芯片标签 (Component Chips) */
    .GeoGebraFrame .componentChips {
      background-color: var(--ggb-theme-panel) !important;
      border: 1px solid var(--ggb-theme-border) !important;
    }
    .GeoGebraFrame .componentChips .gwt-Label {
      color: var(--ggb-theme-text) !important;
    }
    .GeoGebraFrame .componentChips:hover {
      background-color: var(--ggb-theme-hover) !important;
      border-color: var(--ggb-theme-border-hover) !important;
    }
    .GeoGebraFrame .componentChips.primary {
      background-color: var(--ggb-theme-accent-light) !important;
      border-color: var(--ggb-theme-accent) !important;
    }
    .GeoGebraFrame .componentChips.primary .gwt-Label {
      color: var(--ggb-theme-accent) !important;
    }
    .GeoGebraFrame .componentChips.primary:hover {
      background-color: var(--ggb-theme-active) !important;
    }

    /* 软键盘按键 (Virtual Keyboard Keys) */
    .GeoGebraFrame .KeyBoard,
    .GeoGebraFrame .TabbedKeyBoard.KeyBoard {
      background-color: var(--ggb-theme-panel) !important;
      color: var(--ggb-theme-text) !important;
      border-top: 1px solid var(--ggb-theme-border) !important;
    }
    .GeoGebraFrame .KeyBoard.TabbedKeyBoard .KeyBoardButton {
      background-color: var(--ggb-theme-input) !important;
      color: var(--ggb-theme-text) !important;
      border: 1px solid var(--ggb-theme-border-subtle) !important;
      border-radius: 8px !important;
    }
    .GeoGebraFrame .KeyBoard.TabbedKeyBoard .KeyBoardButton:hover {
      background-color: var(--ggb-theme-hover) !important;
      border-color: var(--ggb-theme-border-hover) !important;
    }
    .GeoGebraFrame .KeyBoard.TabbedKeyBoard .KeyBoardButton.colored,
    .GeoGebraFrame .KeyBoard.TabbedKeyBoard .KeyBoardButton.accentDown {
      background-color: var(--ggb-theme-hover-strong) !important;
      color: var(--ggb-theme-text) !important;
    }
    .GeoGebraFrame .KeyBoardButton:active {
      box-shadow: inset 0 0 0 2px var(--ggb-theme-accent) !important;
    }
    .GeoGebraFrame .KeyboardSwitcher .gwt-Button {
      color: var(--ggb-theme-text) !important;
      background: transparent !important;
    }
    .GeoGebraFrame .KeyboardSwitcher .gwt-Button:hover {
      color: var(--ggb-theme-accent) !important;
      background-color: var(--ggb-theme-hover) !important;
    }
    .GeoGebraFrame .KeyboardSwitcher .switcherContents .gwt-Button.selected,
    .GeoGebraFrame .KeyboardSwitcher .gwt-Button.selected {
      background-color: var(--ggb-theme-accent) !important;
      color: var(--ggb-theme-accent-text) !important;
    }
    .GeoGebraFrame .closeTabbedKeyboardButton:hover,
    .GeoGebraFrame .matOpenKeyboardBtn:hover {
      background-color: var(--ggb-theme-hover) !important;
    }

    /* 按钮键盘聚焦焦点环 (Focus-Visible Ring) */
    .GeoGebraFrame .materialTextButton.keyboardFocus:focus-visible,
    .GeoGebraFrame .materialFilledButton.keyboardFocus:focus-visible,
    .GeoGebraFrame .materialOutlinedButton.keyboardFocus:focus-visible,
    .GeoGebraFrame .materialTonalButton.keyboardFocus:focus-visible,
    .GeoGebraFrame .iconButton.focused,
    .GeoGebraFrame .iconButton:focus-visible,
    .GeoGebraFrame .tabBtn.keyboardFocus:focus-visible,
    .GeoGebraFrame .connectedButtonGroup .connectedButton.keyboardFocus:focus-visible,
    .GeoGebraFrame .componentChips.keyboardFocus:focus-visible {
      outline: 2px solid var(--ggb-theme-focus-ring) !important;
      outline-offset: 2px !important;
    }

    /* =========================================================================
       5. 选中态与激活态全面覆盖 (Selected / Active Components)
       ========================================================================= */

    /* 左侧/底部导航条容器 (Navigation Rail: Toolbar Header) */
    .GeoGebraFrame .toolbar,
    .GeoGebraFrame .toolbar .header,
    .GeoGebraFrame .header,
    .GeoGebraFrame .header-open-landscape,
    .GeoGebraFrame .header-close-landscape,
    .GeoGebraFrame .header-open-portrait,
    .GeoGebraFrame .header-close-portrait,
    .GeoGebraFrame .header .contents,
    .GeoGebraFrame .header .center {
      background-color: var(--ggb-theme-panel) !important;
      color: var(--ggb-theme-text) !important;
    }

    .GeoGebraFrame .header-open-landscape,
    .GeoGebraFrame .header-close-landscape {
      border-right: 1px solid var(--ggb-theme-border-subtle) !important;
      box-shadow: none !important;
    }

    .GeoGebraFrame .header-open-portrait,
    .GeoGebraFrame .header-close-portrait {
      border-top: 1px solid var(--ggb-theme-border-subtle) !important;
      box-shadow: none !important;
    }

    /* 导航标签项 (Navigation Tab Buttons: 代数区/工具/表格/数据) */
    .GeoGebraFrame .tabButton,
    .GeoGebraFrame .header .tabButton {
      background-color: transparent !important;
      opacity: 0.7 !important;
      transition: background-color 150ms ease, opacity 150ms ease !important;
    }

    .GeoGebraFrame .tabButton .gwt-Label,
    .GeoGebraFrame .header .tabButton .gwt-Label {
      color: var(--ggb-theme-text-secondary) !important;
    }

    .GeoGebraFrame .tabButton:hover,
    .GeoGebraFrame .header .tabButton:hover {
      background-color: var(--ggb-theme-hover) !important;
      opacity: 1 !important;
    }

    .GeoGebraFrame .tabButton:hover .gwt-Label,
    .GeoGebraFrame .header .tabButton:hover .gwt-Label {
      color: var(--ggb-theme-text) !important;
    }

    /* 选中的导航标签 (Selected Navigation Tab) */
    .GeoGebraFrame .tabButton.selected,
    .GeoGebraFrame .header .tabButton.selected {
      background-color: var(--ggb-theme-active) !important;
      opacity: 1 !important;
    }

    .GeoGebraFrame .header-open-landscape .tabButton.selected,
    .GeoGebraFrame .header-close-landscape .tabButton.selected {
      border-left: 3px solid var(--ggb-theme-accent) !important;
      border-bottom: none !important;
    }

    .GeoGebraFrame .header-open-portrait .tabButton.selected,
    .GeoGebraFrame .header-close-portrait .tabButton.selected {
      border-bottom: 3px solid var(--ggb-theme-accent) !important;
    }

    .GeoGebraFrame .tabButton.selected .gwt-Label,
    .GeoGebraFrame .header .tabButton.selected .gwt-Label {
      color: var(--ggb-theme-accent) !important;
      font-weight: 600 !important;
    }

    /* 工具面板整体与分类标题 (Tools Panel) */
    .GeoGebraFrame .toolsPanel,
    .GeoGebraFrame .toolsPanel .categoryPanel,
    .GeoGebraFrame .toolPanel,
    .GeoGebraFrame .toolBPanel,
    .GeoGebraFrame .toolbarPanel {
      background-color: var(--ggb-theme-panel) !important;
      color: var(--ggb-theme-text) !important;
      border-color: var(--ggb-theme-border-subtle) !important;
    }

    .GeoGebraFrame .toolsPanel .catLabel {
      color: var(--ggb-theme-text) !important;
      font-weight: 600 !important;
    }

    /* 工具按钮 (ToolButton: 包含图标与文本) */
    .GeoGebraFrame .toolsPanel .toolButton,
    .GeoGebraFrame .toolButton {
      background-color: transparent !important;
      color: var(--ggb-theme-text) !important;
      border-radius: 6px !important;
      transition: background-color 150ms ease !important;
    }

    .GeoGebraFrame .toolsPanel .toolButton .gwt-Label,
    .GeoGebraFrame .toolButton .gwt-Label {
      color: var(--ggb-theme-text-secondary) !important;
      transition: color 150ms ease !important;
    }

    .GeoGebraFrame .toolsPanel .toolButton:hover,
    .GeoGebraFrame .toolButton:hover {
      background-color: var(--ggb-theme-hover) !important;
    }

    .GeoGebraFrame .toolsPanel .toolButton:hover .gwt-Label,
    .GeoGebraFrame .toolButton:hover .gwt-Label {
      color: var(--ggb-theme-text) !important;
    }

    /* 选中工具状态 (Selected Tool) */
    .GeoGebraFrame .toolsPanel .toolButton[selected=true],
    .GeoGebraFrame .toolButton[selected=true],
    .GeoGebraFrame .toolButton.selected,
    .GeoGebraFrame .toolbarPanel .toolBPanel .touched {
      border-color: var(--ggb-theme-accent) !important;
      background-color: var(--ggb-theme-active) !important;
    }

    .GeoGebraFrame .toolsPanel .toolButton[selected=true] .gwt-Label,
    .GeoGebraFrame .toolButton[selected=true] .gwt-Label {
      color: var(--ggb-theme-accent) !important;
      font-weight: 600 !important;
    }

    /* 紧凑型工具小按钮 (Tools Panel Category Small Buttons) */
    .GeoGebraFrame .toolsPanel .button {
      background-color: var(--ggb-theme-elevated) !important;
      border: 1px solid var(--ggb-theme-border) !important;
      border-radius: 6px !important;
    }

    .GeoGebraFrame .toolsPanel .button[selected=false]:hover,
    .GeoGebraFrame .toolsPanel .button[selected=false]:focus {
      border-color: var(--ggb-theme-accent) !important;
      background-color: var(--ggb-theme-hover) !important;
    }

    .GeoGebraFrame .toolsPanel .button[selected=true] {
      border: 2px solid var(--ggb-theme-accent) !important;
      background-color: var(--ggb-theme-active) !important;
    }

    /* 顶栏与套件标签页选中态 (Tabs) */
    .GeoGebraFrame .componentTab .tabList .tabBtn .gwt-Label {
      color: var(--ggb-theme-text-muted) !important;
    }
    .GeoGebraFrame .componentTab .tabList .tabBtn:hover {
      background-color: var(--ggb-theme-hover) !important;
    }
    .GeoGebraFrame .componentTab .tabList .tabBtn:hover .gwt-Label {
      color: var(--ggb-theme-text) !important;
    }
    .GeoGebraFrame .componentTab .tabList .tabBtn.selected {
      background-color: var(--ggb-theme-active) !important;
    }
    .GeoGebraFrame .componentTab .tabList .tabBtn.selected .gwt-Label {
      color: var(--ggb-theme-accent) !important;
      font-weight: 600 !important;
    }

    .GeoGebraFrame .gwt-TabBar .gwt-TabBarItem-selected {
      border-bottom: 2px solid var(--ggb-theme-accent) !important;
      color: var(--ggb-theme-accent) !important;
    }

    /* 代数区表达式列表项与边框 (Algebra View Rows & Borders) */
    .GeoGebraFrame .algebraView,
    .GeoGebraFrame .algebraPanel {
      background-color: var(--ggb-theme-surface) !important;
    }

    .GeoGebraFrame .avItem,
    .GeoGebraFrame .avInputItem,
    .GeoGebraFrame .newRadioButtonTreeItemParent {
      border-top: 1px solid var(--ggb-theme-border-subtle) !important;
      border-bottom: 1px solid var(--ggb-theme-border-subtle) !important;
      background-color: var(--ggb-theme-surface) !important;
      transition: background-color 150ms ease !important;
    }

    .GeoGebraFrame .avItem:hover,
    .GeoGebraFrame .avInputItem:hover,
    .GeoGebraFrame .newRadioButtonTreeItemParent:hover {
      background-color: var(--ggb-theme-hover) !important;
    }

    .GeoGebraFrame .marblePanel {
      border-right: 1px solid var(--ggb-theme-border-subtle) !important;
    }

    .GeoGebraFrame .avItem.avSelectedRow,
    .GeoGebraFrame .avItem.avSelectedRow.keyboardFocus,
    .GeoGebraFrame .newRadioButtonTreeItemParent.focused,
    .GeoGebraFrame .newRadioButtonTreeItemParent.gwt-TreeItem-selected,
    .GeoGebraFrame .newRadioButtonTreeItemParent.keyboardFocus,
    .GeoGebraFrame .algebraPanelScientific .newRadioButtonTreeItemParent.focused {
      background-color: var(--ggb-theme-active) !important;
      border-top: 1px solid var(--ggb-theme-accent) !important;
      border-bottom: 1px solid var(--ggb-theme-accent) !important;
      outline: none !important;
    }

    .GeoGebraFrame .avItem.avSelectedRow .marblePanel,
    .GeoGebraFrame .newRadioButtonTreeItemParent.focused .marblePanel {
      background-color: var(--ggb-theme-active) !important;
      border-right: 1px solid var(--ggb-theme-border-subtle) !important;
    }

    /* 严禁代数项内部元素（公式容器、文本包裹、GWT 选中态）产生硬编码白色底色 */
    .GeoGebraFrame .gwt-TreeItem-selected,
    .GeoGebraFrame .gwt-TreeItem.gwt-TreeItem-selected,
    .GeoGebraFrame .gwt-Tree .gwt-TreeItem-selected,
    .GeoGebraFrame .elem,
    .GeoGebraFrame .elemText,
    .GeoGebraFrame .scrollableTextBox,
    .GeoGebraFrame .latexItem,
    .GeoGebraFrame .avValue,
    .GeoGebraFrame .avOutput,
    .GeoGebraFrame .avDefinition,
    .GeoGebraFrame .avDefinitionPlain,
    .GeoGebraFrame .avPlainText,
    .GeoGebraFrame .newRadioButtonTreeItemParent .elem,
    .GeoGebraFrame .newRadioButtonTreeItemParent .elemText,
    .GeoGebraFrame .newRadioButtonTreeItemParent .scrollableTextBox,
    .GeoGebraFrame .newRadioButtonTreeItemParent .latexItem,
    .GeoGebraFrame .avItem .elem,
    .GeoGebraFrame .avItem .elemText,
    .GeoGebraFrame .avItem .scrollableTextBox,
    .GeoGebraFrame .avItem .latexItem,
    .GeoGebraFrame .avItem .avValue,
    .GeoGebraFrame .avItem .avOutput {
      background: transparent !important;
      background-color: transparent !important;
    }

    .GeoGebraFrame .marble {
      background-color: var(--ggb-theme-accent) !important;
      border: 1px solid var(--ggb-theme-accent) !important;
    }

    .GeoGebraFrame .algebraView .more,
    .GeoGebraFrame .more {
      background: transparent !important;
      border-radius: 4px !important;
      opacity: 0.65 !important;
      transition: background-color 150ms ease, opacity 150ms ease !important;
    }

    .GeoGebraFrame .algebraView .more:hover,
    .GeoGebraFrame .more:hover {
      background-color: var(--ggb-theme-hover) !important;
      opacity: 1 !important;
    }

    /* 代数区菜单弹出项白色背景修复 (More Context Menu Hardcoded White Fix) */
    .GeoGebraFrame .listMenuItem.settingsItem,
    .GeoGebraFrame .listMenuItem.iconButtonPanel,
    .GeoGebraFrame .listMenuItem.ariaItemWithButton.selectedItem {
      background-color: var(--ggb-theme-elevated) !important;
    }

    /* 复选框 (Checkbox) */
    .GeoGebraFrame .checkbox .background {
      border-color: var(--ggb-theme-border-hover) !important;
      background-color: transparent !important;
    }
    .GeoGebraFrame .checkbox:hover .hoverBg {
      background-color: var(--ggb-theme-hover) !important;
      opacity: 1 !important;
    }
    .GeoGebraFrame .checkbox.selected .background {
      border-color: var(--ggb-theme-accent) !important;
      background-color: var(--ggb-theme-accent) !important;
    }
    .GeoGebraFrame .checkbox.selected .checkmark .checkmarkPath {
      stroke: var(--ggb-theme-accent-text) !important;
    }
    .GeoGebraFrame .checkbox.selected:hover .hoverBg {
      background-color: var(--ggb-theme-hover) !important;
    }

    /* 单选框 (Radio Button) */
    .GeoGebraFrame .radioButton .radioBg .outerCircle {
      border-color: var(--ggb-theme-border-hover) !important;
    }
    .GeoGebraFrame .radioButton:hover .radioBg {
      background-color: var(--ggb-theme-hover) !important;
    }
    .GeoGebraFrame .radioButton.selected .outerCircle {
      border-color: var(--ggb-theme-accent) !important;
    }
    .GeoGebraFrame .radioButton.selected .innerCircle {
      background-color: var(--ggb-theme-accent) !important;
    }
    .GeoGebraFrame .radioButton.selected:hover .radioBg {
      background-color: var(--ggb-theme-hover) !important;
    }

    /* 开关组件 (Switch Toggle) */
    .GeoGebraFrame .switch.off .track {
      background-color: var(--ggb-theme-switch-track-off) !important;
    }
    .GeoGebraFrame .switch.off .thumb {
      background-color: var(--ggb-theme-switch-thumb-off) !important;
    }
    .GeoGebraFrame .switch.on .track {
      background-color: var(--ggb-theme-accent-light) !important;
    }
    .GeoGebraFrame .switch.on .thumb {
      background-color: var(--ggb-theme-accent) !important;
    }

    /* 网格卡片选中 (Grid Card Selected) */
    .GeoGebraFrame .gridCard .cardImagePanel {
      border: 2px solid var(--ggb-theme-border) !important;
    }
    .GeoGebraFrame .gridCard:hover .cardImagePanel {
      border-color: var(--ggb-theme-border-hover) !important;
    }
    .GeoGebraFrame .gridCard.selected .cardImagePanel {
      border-color: var(--ggb-theme-accent) !important;
    }
    .GeoGebraFrame .gridCard.selected .cardTitle {
      color: var(--ggb-theme-accent) !important;
      font-weight: 600 !important;
    }
    .GeoGebraFrame .gridCard.selected .checkMarkPanel {
      background-color: var(--ggb-theme-accent) !important;
      visibility: visible !important;
    }

    /* =========================================================================
       6. 可编辑区域编辑状态 (Editable Areas in Edit Mode)
       ========================================================================= */

    /* 输入框容器正常状态 */
    .GeoGebraFrame .inputTextField,
    .GeoGebraFrame .dropDown,
    .GeoGebraFrame .comboBox,
    .GeoGebraFrame .textEdit {
      background-color: var(--ggb-theme-input) !important;
      border: 1px solid var(--ggb-theme-border) !important;
      color: var(--ggb-theme-text) !important;
      border-radius: 8px !important;
      box-sizing: border-box !important;
      transition: border-color 150ms ease, box-shadow 150ms ease !important;
    }

    /* 输入框容器鼠标悬停状态 (Input Hover) */
    .GeoGebraFrame .inputTextField:hover:not(.error),
    .GeoGebraFrame .inputTextField.hoverState:not(.error),
    .GeoGebraFrame .dropDown:hover:not(.error),
    .GeoGebraFrame .dropDown.hoverState:not(.error),
    .GeoGebraFrame .comboBox:hover:not(.error),
    .GeoGebraFrame .textEdit:hover:not(.error) {
      border-color: var(--ggb-theme-border-hover) !important;
    }

    /* 输入框编辑聚焦状态 (Input Active / Edit State) */
    .GeoGebraFrame .inputTextField.active:not(.error),
    .GeoGebraFrame .inputTextField.keyboardFocus:focus-visible:not(.error),
    .GeoGebraFrame .dropDown.active:not(.error),
    .GeoGebraFrame .dropDown.keyboardFocus:focus-visible:not(.error),
    .GeoGebraFrame .comboBox.active:not(.error),
    .GeoGebraFrame .comboBox.keyboardFocus:focus-visible:not(.error),
    .GeoGebraFrame .textEdit.active:not(.error),
    .GeoGebraFrame .textEdit.keyboardFocus:focus-visible:not(.error) {
      border: 2px solid var(--ggb-theme-accent) !important;
      padding: 0 !important;
      box-shadow: 0 0 0 1px var(--ggb-theme-accent-light) !important;
      background-color: var(--ggb-theme-input-active) !important;
    }

    /* 浮动标签 (Floating Label) */
    .GeoGebraFrame .optionLabelHolder .label {
      background-color: var(--ggb-theme-elevated) !important;
      color: var(--ggb-theme-text-muted) !important;
    }
    .GeoGebraFrame .inputTextField.active .optionLabelHolder .label,
    .GeoGebraFrame .inputTextField.keyboardFocus .optionLabelHolder .label,
    .GeoGebraFrame .dropDown.active .optionLabelHolder .label,
    .GeoGebraFrame .dropDown.keyboardFocus .optionLabelHolder .label,
    .GeoGebraFrame .comboBox.active .optionLabelHolder .label,
    .GeoGebraFrame .comboBox.keyboardFocus .optionLabelHolder .label {
      background-color: var(--ggb-theme-elevated) !important;
      color: var(--ggb-theme-accent) !important;
    }

    /* 下拉指示箭头处于激活状态 */
    .GeoGebraFrame .dropDown.active .arrow svg,
    .GeoGebraFrame .comboBox.active .arrow svg {
      fill: var(--ggb-theme-accent) !important;
    }

    /* 原生输入控件、光标颜色与去背景 */
    .GeoGebraFrame input[type=text],
    .GeoGebraFrame input[type=number],
    .GeoGebraFrame textarea,
    .GeoGebraFrame .TextField,
    .GeoGebraFrame .AutoCompleteTextFieldW input,
    .GeoGebraFrame .gwt-TextArea.textArea,
    .GeoGebraFrame .gwt-SuggestBox {
      background-color: transparent !important;
      color: var(--ggb-theme-text) !important;
      caret-color: var(--ggb-theme-accent) !important;
    }

    .GeoGebraFrame input[type=text]:focus,
    .GeoGebraFrame textarea:focus,
    .GeoGebraFrame .TextField:focus {
      outline: none !important;
      caret-color: var(--ggb-theme-accent) !important;
    }

    /* 正在编辑的代数行 (Active/Focused Expression Item) */
    .GeoGebraFrame .newRadioButtonTreeItemParent.focused .scrollableTextBox,
    .GeoGebraFrame .algebraPanelScientific .newRadioButtonTreeItemParent.focused .scrollableTextBox {
      border-bottom: 1px solid var(--ggb-theme-accent) !important;
      background: transparent !important;
      background-color: transparent !important;
    }

    /* 数学公式输入框在编辑状态 (MathTextField in Edit Mode) */
    .GeoGebraFrame .mathTextField {
      background-color: var(--ggb-theme-input) !important;
      color: var(--ggb-theme-text) !important;
      caret-color: var(--ggb-theme-accent) !important;
      border-radius: 4px !important;
    }
    .GeoGebraFrame .mathTextField:focus,
    .GeoGebraFrame .mathTextField.focusState,
    .GeoGebraFrame .evaluationRow.focusState .mathTextField,
    .GeoGebraFrame .evInputEditor {
      border: 2px solid var(--ggb-theme-accent) !important;
      outline: none !important;
    }

    /* 虚拟数学光标 (MathQuill / Virtual Cursor) */
    .GeoGebraFrame .cursorOverlay .virtualCursor,
    .GeoGebraFrame .cursor-overlay .cursor,
    .GeoGebraFrame .mathTextField .virtualCursor {
      color: var(--ggb-theme-accent) !important;
      border-left: 2px solid var(--ggb-theme-accent) !important;
    }
    .GeoGebraFrame .cursorOverlay .select-content,
    .GeoGebraFrame .selected-content {
      background: var(--ggb-theme-selection) !important;
    }

    /* 搜索栏在编辑聚焦状态 (Search Bar in Edit Mode) */
    .GeoGebraFrame .searchBar {
      background-color: var(--ggb-theme-panel) !important;
      border: 2px solid transparent !important;
    }
    .GeoGebraFrame .searchBar.focusState {
      border: 2px solid var(--ggb-theme-accent) !important;
      background-color: var(--ggb-theme-input) !important;
    }
    .GeoGebraFrame .searchBar.focusState .TextField {
      color: var(--ggb-theme-text) !important;
    }

    /* 滑块在激活与拖动编辑状态 (Slider Active/Dragging) */
    .GeoGebraFrame input[type=range].slider::-webkit-slider-runnable-track {
      background: var(--ggb-theme-border) !important;
    }
    .GeoGebraFrame input[type=range].slider::-webkit-slider-thumb {
      background: var(--ggb-theme-accent) !important;
    }
    .GeoGebraFrame input[type=range].slider:hover::-webkit-slider-thumb {
      outline: 6px solid var(--ggb-theme-accent-light) !important;
    }
    .GeoGebraFrame input[type=range].slider:focus::-webkit-slider-thumb,
    .GeoGebraFrame input[type=range].slider:active::-webkit-slider-thumb {
      outline: 8px solid var(--ggb-theme-selection) !important;
      background: var(--ggb-theme-accent) !important;
    }

    /* =========================================================================
       6.1 数值表格视图 (Table of Values View: tvTable)
       ========================================================================= */
    .GeoGebraFrame .tableViewParent,
    .GeoGebraFrame .tableViewMain,
    .GeoGebraFrame .tvTable,
    .GeoGebraFrame .tvTable .mainScrollPanel,
    .GeoGebraFrame .tvTable .outerScrollPanel,
    .GeoGebraFrame .tvTable .valueScroller,
    .GeoGebraFrame .tvTable .values {
      background-color: var(--ggb-theme-surface) !important;
      color: var(--ggb-theme-text) !important;
    }

    .GeoGebraFrame .tvTable td,
    .GeoGebraFrame .tvTable th {
      border: 1px solid var(--ggb-theme-border) !important;
      color: var(--ggb-theme-text) !important;
    }

    .GeoGebraFrame .tvTable td .content,
    .GeoGebraFrame .tvTable th .content {
      color: var(--ggb-theme-text) !important;
    }

    .GeoGebraFrame .tvTable td.notEditable .content {
      color: var(--ggb-theme-text-muted) !important;
    }

    /* 数值表表头 (Sticky Header: 如 x 及函数列标题与菜单按钮) */
    .GeoGebraFrame .tvTable .values thead th,
    .GeoGebraFrame .tvTable .values thead th.emptyColumn {
      background-color: var(--ggb-theme-panel) !important;
      border: 1px solid var(--ggb-theme-border) !important;
      color: var(--ggb-theme-text) !important;
    }

    .GeoGebraFrame .tvTable .values thead th .gwt-Label {
      color: var(--ggb-theme-text) !important;
    }

    .GeoGebraFrame .tvTable .values thead th .button {
      background: transparent !important;
    }

    .GeoGebraFrame .tvTable .values thead th .button:hover {
      background-color: var(--ggb-theme-hover) !important;
      border-radius: 4px !important;
    }

    .GeoGebraFrame .tvTable .highlighted {
      background-color: var(--ggb-theme-active) !important;
    }

    .GeoGebraFrame .tvTable td.keyboardFocusedCell,
    .GeoGebraFrame .tvTable th.keyboardFocusedCell {
      outline: 2px solid var(--ggb-theme-accent) !important;
      outline-offset: -2px !important;
    }

    /* 表格就地编辑框 (Table In-Place Editor) */
    .GeoGebraFrame .tableEditorWrap {
      border: 2px solid var(--ggb-theme-accent) !important;
      background: transparent !important;
      background-color: transparent !important;
    }

    .GeoGebraFrame .tableEditor {
      background: transparent !important;
      background-color: transparent !important;
      color: var(--ggb-theme-text) !important;
    }

    .GeoGebraFrame .tableEditor canvas {
      background: transparent !important;
      background-color: transparent !important;
    }

    .GeoGebraFrame .tableEditor input,
    .GeoGebraFrame .tableEditor textarea,
    .GeoGebraFrame .tableEditor * {
      color: var(--ggb-theme-text) !important;
      caret-color: var(--ggb-theme-accent) !important;
    }

    /* 表格遮罩渐变：使用主题背景色淡出，彻底清除硬编码白色渐变 */
    .GeoGebraFrame .tvTable .shaded:after {
      background: linear-gradient(to left, var(--ggb-theme-surface) 70px, transparent 120px),
                  linear-gradient(to top, var(--ggb-theme-surface) 20px, transparent 52px) !important;
    }

    /* 科学计算器下的表格没有右侧占位空列，原生样式仅保留底部纵向淡出，不能叠加右侧横向遮罩否则会遮挡最右侧 g(x) 列内容与边框 */
    .GeoGebraFrame .scientific.tvTable .shaded:after {
      background: linear-gradient(to top, var(--ggb-theme-surface) 20px, transparent 52px) !important;
    }

    /* =========================================================================
       6.2 电子表格视图 (Spreadsheet View: Canvas & HTML Grid & StyleBar)
       ========================================================================= */
    /* 电子表格工具条 (Spreadsheet Style Bar) */
    .GeoGebraFrame .spreadsheetStyleBarParent,
    .GeoGebraFrame .spreadsheetStyleBar,
    .GeoGebraFrame .toolPanelHeading .spreadsheetStyleBar {
      background-color: var(--ggb-theme-panel) !important;
      border-bottom: 1px solid var(--ggb-theme-border-subtle) !important;
    }

    .GeoGebraFrame .spreadsheetStyleBar .iconButton {
      background: transparent !important;
      border-radius: 6px !important;
      color: var(--ggb-theme-text) !important;
      transition: background-color 150ms ease !important;
    }

    .GeoGebraFrame .spreadsheetStyleBar .iconButton:hover {
      background-color: var(--ggb-theme-hover) !important;
    }

    .GeoGebraFrame .spreadsheetStyleBar .iconButton.active {
      background-color: var(--ggb-theme-active) !important;
      color: var(--ggb-theme-accent) !important;
    }

    /* 电子表格面板容器与滚动覆盖层 */
    .GeoGebraFrame .spreadsheetPanel,
    .GeoGebraFrame .SpreadsheetWrapView {
      background-color: var(--ggb-theme-surface) !important;
      color: var(--ggb-theme-text) !important;
    }

    .GeoGebraFrame .spreadsheetScrollOverlay {
      scrollbar-color: var(--ggb-theme-border) var(--ggb-theme-surface) !important;
    }

    .GeoGebraFrame .spreadsheetScrollOverlay::-webkit-scrollbar {
      width: 8px !important;
      height: 8px !important;
      background-color: var(--ggb-theme-surface) !important;
    }

    .GeoGebraFrame .spreadsheetScrollOverlay::-webkit-scrollbar-track,
    .GeoGebraFrame .spreadsheetScrollOverlay::-webkit-scrollbar-corner {
      background-color: var(--ggb-theme-surface) !important;
    }

    .GeoGebraFrame .spreadsheetScrollOverlay::-webkit-scrollbar-thumb {
      background-color: var(--ggb-theme-border) !important;
      border-radius: 4px !important;
    }

    /* 电子表格单元格编辑器 */
    .GeoGebraFrame .spreadsheetEditor {
      background-color: var(--ggb-theme-input) !important;
      border: 2px solid var(--ggb-theme-accent) !important;
      color: var(--ggb-theme-text) !important;
    }

    /* HTML 表格模式电子表格 (Classic Grid) */
    .GeoGebraFrame .geogebraweb-table-spreadsheet {
      background-color: var(--ggb-theme-surface) !important;
      color: var(--ggb-theme-text) !important;
    }

    .GeoGebraFrame .geogebraweb-table-spreadsheet td {
      background-color: var(--ggb-theme-surface) !important;
      border-right: 1px solid var(--ggb-theme-border-subtle) !important;
      border-bottom: 1px solid var(--ggb-theme-border-subtle) !important;
      color: var(--ggb-theme-text) !important;
    }

    .GeoGebraFrame .geogebraweb-table-spreadsheet td.SVheader,
    .GeoGebraFrame .geogebraweb-table-spreadsheet.upperCorner td,
    .GeoGebraFrame .geogebraweb-table-spreadsheet-lowerLeftCorner {
      background-color: var(--ggb-theme-panel) !important;
      border-color: var(--ggb-theme-border-subtle) !important;
      color: var(--ggb-theme-text) !important;
    }

    .GeoGebraFrame .geogebraweb-table-spreadsheet td.SVheader.selected {
      background-color: var(--ggb-theme-active) !important;
      color: var(--ggb-theme-accent) !important;
      font-weight: 600 !important;
    }

    /* 表单校验错误状态 (Validation Error State) */
    .GeoGebraFrame .validation.error,
    .GeoGebraFrame .inputTextField.error,
    .GeoGebraFrame .mathTextField.errorStyle {
      border-color: var(--ggb-theme-error) !important;
    }
    .GeoGebraFrame .validation.error.active,
    .GeoGebraFrame .inputTextField.error.active {
      border: 2px solid var(--ggb-theme-error) !important;
    }
    .GeoGebraFrame .validation.error .label,
    .GeoGebraFrame .inputTextField.error .errorLabel {
      color: var(--ggb-theme-error) !important;
    }

    /* =========================================================================
       6.3 概率计算器视图 (Probability Calculator: PlotPanel & Distribution Controls)
       ========================================================================= */
    .GeoGebraFrame .probabilityTab,
    .GeoGebraFrame .probabilityTab .tabPanel,
    .GeoGebraFrame .probabilityTab .panelContainer,
    .GeoGebraFrame .probabilityTab .PlotPanelPlus,
    .GeoGebraFrame .distributionPanel,
    .GeoGebraFrame .distributionPanel .parameterHolder,
    .GeoGebraFrame .distributionPanel .probabilityResultRow,
    .GeoGebraFrame .probCalcPanel {
      background-color: var(--ggb-theme-surface) !important;
      color: var(--ggb-theme-text) !important;
    }

    .GeoGebraFrame .distributionPanel .gwt-Label {
      color: var(--ggb-theme-text) !important;
    }

    .GeoGebraFrame .distributionPanel .holder.focusState .gwt-Label {
      color: var(--ggb-theme-accent) !important;
    }

    .GeoGebraFrame .distributionPanel .mathTextField,
    .GeoGebraFrame .distributionPanel .inputTextField,
    .GeoGebraFrame .distributionPanel .probabilityResultRow .mathTextField {
      background-color: var(--ggb-theme-input) !important;
      border-bottom: 1px solid var(--ggb-theme-border) !important;
      color: var(--ggb-theme-text) !important;
    }

    .GeoGebraFrame .distributionPanel .holder.focusState .mathTextField,
    .GeoGebraFrame .distributionPanel .mathTextField:focus-within {
      border-bottom: 2px solid var(--ggb-theme-accent) !important;
    }

    .GeoGebraFrame .distributionPanel .iconPanel .iconButton {
      background: transparent !important;
      border-radius: 6px !important;
      border: 1px solid transparent !important;
    }

    .GeoGebraFrame .distributionPanel .iconPanel .iconButton:hover {
      background-color: var(--ggb-theme-hover) !important;
    }

    .GeoGebraFrame .distributionPanel .iconPanel .iconButton.active,
    .GeoGebraFrame .distributionPanel .iconPanel .iconButton[aria-pressed="true"] {
      background-color: var(--ggb-theme-active) !important;
      border-color: var(--ggb-theme-accent) !important;
    }

    /* =========================================================================
       6.4 科学计算器视图 (Scientific Calculator Layout)
       ========================================================================= */
    .GeoGebraFrame .tab.scientific,
    .GeoGebraFrame .panelScientificDefaults,
    .GeoGebraFrame .panelScientificDefaults > div,
    .GeoGebraFrame .algebraPanelScientific,
    .GeoGebraFrame .algebraPanelScientificSmallScreen,
    .GeoGebraFrame .undoRedoSettingsPanelScientific {
      background-color: var(--ggb-theme-surface) !important;
      color: var(--ggb-theme-text) !important;
    }

    .GeoGebraFrame .panelScientificDefaults > div {
      background: var(--ggb-theme-surface) !important;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3) !important;
    }

    .GeoGebraFrame .undoRedoSettingsPanelScientific .gwt-Button,
    .GeoGebraFrame .undoRedoSettingsPanelScientific .button {
      background: transparent !important;
      color: var(--ggb-theme-text) !important;
    }

    .GeoGebraFrame .avItemHeaderScientific {
      color: var(--ggb-theme-text-muted) !important;
    }

    /* =========================================================================
       6.5 计算机代数系统 (CAS View: Table, Input & Output)
       ========================================================================= */
    .GeoGebraFrame .casView,
    .GeoGebraFrame .casView table,
    .GeoGebraFrame .CAS-table,
    .GeoGebraFrame .CAS-table > tbody > tr > td,
    .GeoGebraFrame .CAS_inputPanel,
    .GeoGebraFrame .CAS_outputPanel {
      background-color: var(--ggb-theme-surface) !important;
      color: var(--ggb-theme-text) !important;
      border-color: var(--ggb-theme-border) !important;
    }

    .GeoGebraFrame .cas_header {
      background-color: var(--ggb-theme-panel) !important;
      color: var(--ggb-theme-text-muted) !important;
      border-color: var(--ggb-theme-border) !important;
    }

    .GeoGebraFrame .cas_header.selected {
      background-color: var(--ggb-theme-active) !important;
      color: var(--ggb-theme-accent) !important;
    }

    .GeoGebraFrame .CAS_table_first_row_selected {
      background-color: var(--ggb-theme-active) !important;
    }

    /* =========================================================================
       7. 标签页边缘横向渐变、抽屉与对话框
       ========================================================================= */
    .GeoGebraFrame .componentTab .left {
      background: linear-gradient(270deg, transparent 0%, var(--ggb-theme-elevated) 40%) !important;
    }
    .GeoGebraFrame .componentTab .right {
      background: linear-gradient(90deg, transparent 0%, var(--ggb-theme-elevated) 40%) !important;
    }

    .GeoGebraFrame .floatingSideSheet,
    .GeoGebraFrame .PropertiesViewW,
    .GeoGebraFrame .sideSheet {
      background-color: var(--ggb-theme-elevated) !important;
      color: var(--ggb-theme-text) !important;
      border-left: 1px solid var(--ggb-theme-border) !important;
      box-shadow: var(--ggb-theme-shadow) !important;
    }
    .GeoGebraFrame .sideSheet .titlePanel .title {
      color: var(--ggb-theme-text) !important;
    }

    .GeoGebraFrame .expandableList .header:hover {
      background-color: var(--ggb-theme-hover) !important;
    }
    .GeoGebraFrame .expandableList .header:hover .headerArrow svg {
      fill: var(--ggb-theme-accent) !important;
    }

    .GeoGebraFrame .dialogComponent,
    .GeoGebraFrame .gwt-DialogBox,
    .GeoGebraFrame .MaterialDialogBox {
      background-color: var(--ggb-theme-elevated) !important;
      color: var(--ggb-theme-text) !important;
      border: 1px solid var(--ggb-theme-border) !important;
      box-shadow: var(--ggb-theme-shadow) !important;
      border-radius: 12px !important;
    }
    .GeoGebraFrame .dialogComponent .dialogTitle,
    .GeoGebraFrame .gwt-DialogBox .Caption,
    .GeoGebraFrame .MaterialDialogBox .Caption {
      background-color: var(--ggb-theme-elevated) !important;
      color: var(--ggb-theme-text) !important;
      border-bottom: 1px solid var(--ggb-theme-border-subtle) !important;
    }
    .GeoGebraFrame .dialogContent {
      color: var(--ggb-theme-text) !important;
    }

    /* 文本工具对话框与富文本编辑区 (Text Tool Dialog: .textDialog, .textTopBar, .textEditor, .previewPanel, .insertPopup) */
    .GeoGebraFrame .textDialog .dialogMainPanel .dialogContent {
      border: 1px solid var(--ggb-theme-border) !important;
      background-color: var(--ggb-theme-surface) !important;
      border-radius: 8px !important;
      overflow: hidden !important;
    }
    .GeoGebraFrame .textDialog .dialogMainPanel .dialogContent .textTopBar {
      background-color: var(--ggb-theme-panel) !important;
      border-bottom: 1px solid var(--ggb-theme-border-subtle) !important;
    }
    .GeoGebraFrame .textDialog .textTopBar .iconButton img,
    .GeoGebraFrame .textDialog .textTopBar .iconButton .gwt-Image,
    .GeoGebraFrame .dialogComponent .iconButton img,
    .GeoGebraFrame .dialogComponent .iconButton .gwt-Image {
      opacity: 0.85 !important;
    }
    .GeoGebraFrame .textDialog .textTopBar .iconButton:hover img,
    .GeoGebraFrame .textDialog .textTopBar .iconButton:hover .gwt-Image,
    .GeoGebraFrame .textDialog .textTopBar .iconButton.active img,
    .GeoGebraFrame .textDialog .textTopBar .iconButton.active .gwt-Image {
      opacity: 1 !important;
    }
    .GeoGebraFrame .iconButton .textIcon,
    .GeoGebraFrame .quickStylebar .iconButton.fontButton .textIcon {
      color: var(--ggb-theme-text) !important;
    }
    .GeoGebraFrame .iconButton.active .textIcon,
    .GeoGebraFrame .quickStylebar .iconButton.fontButton.active .textIcon {
      color: var(--ggb-theme-accent) !important;
    }
    .GeoGebraFrame .iconButton.disabled:hover {
      background-color: transparent !important;
    }
    .GeoGebraFrame .quickStyleBarPopup .lineThicknessItem .linePreview {
      background-color: var(--ggb-theme-text) !important;
    }
    .GeoGebraFrame .textEditor,
    .GeoGebraFrame .textDialog .dialogMainPanel .dialogContent .textEditor {
      background-color: var(--ggb-theme-input) !important;
      color: var(--ggb-theme-text) !important;
      caret-color: var(--ggb-theme-accent) !important;
      border-color: var(--ggb-theme-border-subtle) !important;
    }
    .GeoGebraFrame .textDialog .dialogMainPanel .dialogContent .textEditor {
      border: none !important;
      border-bottom: 1px solid var(--ggb-theme-border-subtle) !important;
    }
    .GeoGebraFrame .MaterialDialogBox .textEditor:focus:not([readonly]),
    .GeoGebraFrame .dialogComponent .textEditor:focus:not([readonly]),
    .GeoGebraFrame .textDialog .dialogMainPanel .dialogContent .textEditor:focus {
      background-color: var(--ggb-theme-input-active) !important;
      border-color: var(--ggb-theme-accent) !important;
      box-shadow: inset 0 0 0 1px var(--ggb-theme-accent) !important;
      outline: none !important;
    }
    .GeoGebraFrame .textDialog .dialogMainPanel .dialogContent .header {
      background-color: var(--ggb-theme-panel) !important;
      border-bottom: 1px solid var(--ggb-theme-border-subtle) !important;
      color: var(--ggb-theme-text) !important;
    }
    .GeoGebraFrame .textDialog .dialogMainPanel .dialogContent .header.closed {
      border-bottom: none !important;
    }
    .GeoGebraFrame .textDialog .dialogMainPanel .dialogContent .header .button,
    .GeoGebraFrame .textDialog .dialogMainPanel .dialogContent .header .button:hover {
      background: transparent !important;
    }
    .GeoGebraFrame .textDialog .dialogMainPanel .dialogContent .header .button .gwt-Label {
      color: var(--ggb-theme-text) !important;
    }
    .GeoGebraFrame .textDialog .dialogMainPanel .dialogContent .previewPanel,
    .GeoGebraFrame .textDialog .dialogMainPanel .dialogContent .previewPanel > div {
      background-color: var(--ggb-theme-surface) !important;
      color: var(--ggb-theme-text) !important;
    }
    .GeoGebraFrame .dynamicText {
      background-color: var(--ggb-theme-panel) !important;
      border: 1px solid var(--ggb-theme-border) !important;
      color: var(--ggb-theme-text) !important;
    }
    .GeoGebraFrame .dynamicText:hover {
      border-color: var(--ggb-theme-accent) !important;
      background-color: var(--ggb-theme-hover) !important;
    }
    .GeoGebraFrame .textEditPopup {
      background-color: var(--ggb-theme-elevated) !important;
      border: 1px solid var(--ggb-theme-accent) !important;
      box-shadow: var(--ggb-theme-shadow) !important;
    }
    .GeoGebraFrame .insertPopup,
    .GeoGebraFrame .insertPopup .panelContainer,
    .GeoGebraFrame .insertPopup .tabPanel {
      background-color: var(--ggb-theme-elevated) !important;
      color: var(--ggb-theme-text) !important;
    }
    .GeoGebraFrame .insertPopup .group .gwt-Label:hover,
    .GeoGebraFrame .insertPopup .group canvas:hover {
      background-color: var(--ggb-theme-hover) !important;
      border-radius: 4px !important;
    }

    .GeoGebraFrame .toast,
    .GeoGebraFrame .snackbarComponent,
    .GeoGebraFrame .dataImporter {
      background-color: var(--ggb-theme-elevated) !important;
      color: var(--ggb-theme-text) !important;
      border: 1px solid var(--ggb-theme-border) !important;
      box-shadow: var(--ggb-theme-shadow) !important;
    }
    .GeoGebraFrame .toast .content {
      color: var(--ggb-theme-text) !important;
    }

    /* =========================================================================
       8. 图标色调自适应、电子表格Canvas反色与悬浮反馈系统
          (Icon Adaptive Filtering, Canvas Inversion & Hover Feedback)
       ========================================================================= */
    .GeoGebraFrame img {
      transition: opacity 150ms ease !important;
    }
    .GeoGebraFrame .button:hover img,
    .GeoGebraFrame .toolButton:hover img,
    .GeoGebraFrame .iconButton:hover img,
    .GeoGebraFrame .menuItemView:hover img,
    .GeoGebraFrame .listMenuItem:hover img,
    .GeoGebraFrame .tabButton:hover img {
      opacity: 1 !important;
    }

    ${
      palette.isDark
        ? `
    /* 左侧/底部导航栏未选中标签图标 */
    .GeoGebraFrame .tabButton:not(.selected) img,
    .GeoGebraFrame .tabButton:not(.selected) .gwt-Image,
    .GeoGebraFrame .header .tabButton:not(.selected) img,
    .GeoGebraFrame .header .tabButton:not(.selected) .gwt-Image,
    /* 工具栏所有工具图标 (分类按钮与常规工具按钮，选中时内部SVG仍为黑色线条，必须统一反色) */
    .GeoGebraFrame .toolsPanel .toolButton img,
    .GeoGebraFrame .toolsPanel .toolButton .gwt-Image,
    .GeoGebraFrame .toolsPanel .button img,
    .GeoGebraFrame .toolsPanel .button .gwt-Image,
    .GeoGebraFrame .toolsPanel img,
    .GeoGebraFrame .toolButton img,
    .GeoGebraFrame .toolButton .gwt-Image,
    .GeoGebraFrame .toolPanel .gwt-Image,
    .GeoGebraFrame .toolPanelHeading .gwt-Image,
    /* 通用未激活态图标按钮、文本弹窗格式栏与快速样式弹窗图标 */
    .GeoGebraFrame .iconButton:not(.active) img,
    .GeoGebraFrame .iconButton:not(.active) .gwt-Image,
    .GeoGebraFrame .textTopBar .iconButton:not(.active) img,
    .GeoGebraFrame .textTopBar .iconButton:not(.active) .gwt-Image,
    .GeoGebraFrame .textDialog .header .button img,
    .GeoGebraFrame .textDialog .header .button .gwt-Image,
    .GeoGebraFrame .dialogComponent .iconButton:not(.active) img,
    .GeoGebraFrame .dialogComponent .iconButton:not(.active) .gwt-Image,
    .GeoGebraFrame .quickStyleBarPopup .iconButton:not(.active) img,
    .GeoGebraFrame .quickStyleBarPopup .iconButton:not(.active) .gwt-Image,
    .GeoGebraFrame .quickStyleBarPopup .checkMarkMenuItem img,
    /* 数值表格操作按钮图标 */
    .GeoGebraFrame .tvTable th .button img,
    .GeoGebraFrame .tvTable .content .button img,
    /* 电子表格工具条图标 */
    .GeoGebraFrame .spreadsheetStyleBar img,
    .GeoGebraFrame .spreadsheetStyleBar .iconButton img,
    .GeoGebraFrame .spreadsheetStyleBar .iconButton .gwt-Image,
    /* 代数区操作按钮图标与公式箭头 */
    .GeoGebraFrame .algebraView .more img,
    .GeoGebraFrame .more img,
    .GeoGebraFrame .marblePanel img,
    .GeoGebraFrame .speedPanel img,
    .GeoGebraFrame .playOnly img,
    .GeoGebraFrame .arrowOutputImg,
    .GeoGebraFrame .show-fraction img,
    /* 绘图区浮动控件图标 */
    .GeoGebraFrame .zoomPanelBtn .gwt-Image,
    .GeoGebraFrame .graphicsControlsPanel .gwt-Image,
    .GeoGebraFrame .quickStylebar .gwt-Image,
    .GeoGebraFrame .quickStylebar img,
    /* 虚拟键盘按键图标 */
    .GeoGebraFrame .KeyBoardButton img,
    .GeoGebraFrame .KeyboardSwitcher img,
    .GeoGebraFrame .closeTabbedKeyboardButton img,
    .GeoGebraFrame .matOpenKeyboardBtn img,
    /* 菜单与下拉项图标 */
    .GeoGebraFrame .menuItemView img,
    .GeoGebraFrame .gwt-MenuItem img,
    .GeoGebraFrame .listMenuItem img:not(.profileImage),
    .GeoGebraFrame .contextSubMenu img,
    .GeoGebraFrame .iconButtonPanel img,
    /* 概率计算器、科学计算器与 CAS 视图图标 */
    .GeoGebraFrame .distributionPanel .iconPanel img,
    .GeoGebraFrame .distributionPanel .iconPanel .gwt-Image,
    .GeoGebraFrame .probCalcStylbarBtn img,
    .GeoGebraFrame .probCalcStylbarBtn .gwt-Image,
    .GeoGebraFrame .undoRedoSettingsPanelScientific img,
    .GeoGebraFrame .undoRedoSettingsPanelScientific .gwt-Image,
    .GeoGebraFrame .CAS-table img,
    .GeoGebraFrame .casRowHeader img,
    .GeoGebraFrame .EuclidianStyleBar3D img,
    .GeoGebraFrame .EuclidianStyleBar3D .gwt-Image {
      filter: ${palette.iconFilter} !important;
    }

    /* 概率计算器绘图区域 Canvas 自动反色 (Probability Plot Canvas Inversion) */
    .GeoGebraFrame .PlotPanelPlus canvas,
    .GeoGebraFrame .probabilityTab .PlotPanelPlus canvas,
    .GeoGebraFrame .probCalcPlotPanel canvas {
      filter: invert(0.88) hue-rotate(180deg) brightness(0.95) contrast(0.95) !important;
    }

    /* 代数区数学公式、单元格就地编辑器、数学输入框、文本预览与 CAS 公式输出 Canvas 浅色自适应反色 */
    .GeoGebraFrame .algebraView canvas,
    .GeoGebraFrame .algebraPanel canvas,
    .GeoGebraFrame .avItem canvas,
    .GeoGebraFrame .avInputItem canvas,
    .GeoGebraFrame .elem canvas,
    .GeoGebraFrame .elemText canvas,
    .GeoGebraFrame .scrollableTextBox canvas,
    .GeoGebraFrame .latexItem canvas,
    .GeoGebraFrame .canvasVal,
    .GeoGebraFrame .canvasDef,
    .GeoGebraFrame .newRadioButtonTreeItemParent canvas,
    .GeoGebraFrame .tableEditor canvas,
    .GeoGebraFrame .tableEditorWrap canvas,
    .GeoGebraFrame .tvTable .tableEditorWrap canvas,
    .GeoGebraFrame .tvTable .tableEditor canvas,
    .GeoGebraFrame .spreadsheetEditor canvas,
    .GeoGebraFrame .mathTextField canvas,
    .GeoGebraFrame .evInputEditor canvas,
    .GeoGebraFrame .CAS_outputPanel canvas,
    .GeoGebraFrame .textDialog .previewPanel canvas,
    .GeoGebraFrame .insertPopup canvas {
      filter: invert(1) hue-rotate(180deg) !important;
      background: transparent !important;
      background-color: transparent !important;
    }

    /* 已拥有品牌高亮色或彩色选中的元素免除反色滤镜，保证色彩纯正 */
    .GeoGebraFrame .tabButton.selected img,
    .GeoGebraFrame .tabButton.selected .gwt-Image,
    .GeoGebraFrame .header .tabButton.selected img,
    .GeoGebraFrame .header .tabButton.selected .gwt-Image,
    .GeoGebraFrame .headerLogo,
    .GeoGebraFrame .profileImage {
      filter: none !important;
    }
    `
        : ''
    }
  `
}

/**
 * Synchronizes GeoGebra's Euclidean drawing area background, axes, and grid colors
 * to match MarkNotePro's theme.
 */
export const syncGeoGebraGraphics = async (
  webContents: WebContents,
  palette: GeoGebraThemePalette
): Promise<void> => {
  if (webContents.isDestroyed()) return
  try {
    await webContents.executeJavaScript(`
      (() => {
        window.__ggbDarkTheme = ${palette.isDark};
        window.__ggbThemePalette = ${JSON.stringify({
          surface: palette.surface,
          panel: palette.panel,
          gridColor: palette.gridColor,
          border: palette.border,
          borderSubtle: palette.borderSubtle,
          borderHover: palette.borderHover,
          hover: palette.hover,
          hoverStrong: palette.hoverStrong,
          active: palette.active,
          selected: palette.selected,
          textPrimary: palette.textPrimary,
          accent: palette.accent,
          accentText: palette.accentText,
          error: palette.error
        })};

        if (!window.__ggbFillRectHooked) {
          window.__ggbFillRectHooked = true;
          const origFillRect = CanvasRenderingContext2D.prototype.fillRect;
          const origStroke = CanvasRenderingContext2D.prototype.stroke;
          const origFillText = CanvasRenderingContext2D.prototype.fillText;
          const origFill = CanvasRenderingContext2D.prototype.fill;

          const isSpreadsheetCanvas = (el) =>
            !!(el && el.classList && el.classList.contains('spreadsheetWidget'));

          const normalizeStyle = (val) =>
            typeof val === 'string' ? val.toLowerCase().replace(/\\s+/g, '') : '';

          const mapSpreadsheetFillRectColor = (fs, p) => {
            if (!p || !fs) return null;
            if (
              fs === '#ffffff' ||
              fs === '#fff' ||
              fs === 'white' ||
              fs === 'rgb(255,255,255)' ||
              fs === 'rgba(255,255,255,1)' ||
              fs === 'rgba(255,255,255,1.0)'
            ) {
              return p.surface;
            }
            if (fs === '#f3f2f7' || fs === 'rgb(243,242,247)' || fs === 'rgba(243,242,247,1)') {
              return p.panel;
            }
            if (fs === '#e6e6eb' || fs === 'rgb(230,230,235)' || fs === 'rgba(230,230,235,1)') {
              return p.hoverStrong;
            }
            if (fs === '#6e6d73' || fs === 'rgb(110,109,115)' || fs === 'rgba(110,109,115,1)') {
              return p.accent;
            }
            if (fs === '#f3f0ff' || fs === 'rgb(243,240,255)' || fs === 'rgba(243,240,255,1)') {
              return p.selected;
            }
            if (fs === '#6557d2' || fs === 'rgb(101,87,210)' || fs === 'rgba(101,87,210,1)') {
              return p.accent;
            }
            return null;
          };

          const mapSpreadsheetStrokeColor = (ss, p) => {
            if (!p || !ss) return null;
            if (ss === '#e6e6eb' || ss === 'rgb(230,230,235)' || ss === 'rgba(230,230,235,1)') {
              return p.gridColor;
            }
            if (ss === '#6557d2' || ss === 'rgb(101,87,210)' || ss === 'rgba(101,87,210,1)') {
              return p.accent;
            }
            if (ss === '#6e6d73' || ss === 'rgb(110,109,115)' || ss === 'rgba(110,109,115,1)') {
              return p.borderHover;
            }
            if (ss === '#b4b3ba' || ss === 'rgb(180,179,186)' || ss === 'rgba(180,179,186,1)') {
              return p.border;
            }
            if (
              ss === '#ffffff' ||
              ss === '#fff' ||
              ss === 'white' ||
              ss === 'rgb(255,255,255)' ||
              ss === 'rgba(255,255,255,1)'
            ) {
              return p.surface;
            }
            if (
              ss === '#000000' ||
              ss === '#000' ||
              ss === 'black' ||
              ss === 'rgb(0,0,0)' ||
              ss === 'rgba(0,0,0,1)' ||
              ss === '#1c1c1f' ||
              ss === 'rgb(28,28,31)' ||
              ss === 'rgba(28,28,31,1)'
            ) {
              return p.textPrimary;
            }
            if (ss === '#b00020' || ss === 'rgb(176,0,32)' || ss === 'rgba(176,0,32,1)') {
              return p.error;
            }
            return null;
          };

          const mapSpreadsheetTextFillColor = (fs, p) => {
            if (!p || !fs) return null;
            if (
              fs === '#1c1c1f' ||
              fs === 'rgb(28,28,31)' ||
              fs === 'rgba(28,28,31,1)' ||
              fs === '#000000' ||
              fs === '#000' ||
              fs === 'black' ||
              fs === 'rgb(0,0,0)' ||
              fs === 'rgba(0,0,0,1)'
            ) {
              return p.textPrimary;
            }
            if (
              fs === '#ffffff' ||
              fs === '#fff' ||
              fs === 'white' ||
              fs === 'rgb(255,255,255)' ||
              fs === 'rgba(255,255,255,1)'
            ) {
              return p.accentText;
            }
            if (fs === '#b00020' || fs === 'rgb(176,0,32)' || fs === 'rgba(176,0,32,1)') {
              return p.error;
            }
            return null;
          };

          CanvasRenderingContext2D.prototype.fillRect = function(x, y, w, h) {
            const el = this.canvas;
            if (el) {
              try {
                if (isSpreadsheetCanvas(el) && window.__ggbThemePalette) {
                  const fs = normalizeStyle(this.fillStyle);
                  const mapped = mapSpreadsheetFillRectColor(fs, window.__ggbThemePalette);
                  if (mapped) {
                    const prev = this.fillStyle;
                    this.fillStyle = mapped;
                    try {
                      return origFillRect.call(this, x, y, w, h);
                    } finally {
                      this.fillStyle = prev;
                    }
                  }
                } else if (window.__ggbDarkTheme) {
                  const inEditor = el.closest && el.closest(
                    '.algebraView, .algebraPanel, .scrollableTextBox, .latexItem, .newRadioButtonTreeItemParent, .avItem, .avInputItem, .tableEditor, .tableEditorWrap, .tvTable, .spreadsheetEditor, .mathTextField, .evInputEditor, .previewPanel, .insertPopup, .textDialog'
                  );
                  if (inEditor) {
                    const fs = normalizeStyle(this.fillStyle);
                    if (
                      fs === '#ffffff' ||
                      fs === '#fff' ||
                      fs === 'white' ||
                      fs === 'rgb(255,255,255)' ||
                      fs === 'rgba(255,255,255,1)' ||
                      fs === 'rgba(255,255,255,1.0)' ||
                      (fs.startsWith('rgba(255,255,255') && !fs.includes(',0)'))
                    ) {
                      return this.clearRect(x, y, w, h);
                    }
                  }
                }
              } catch (e) {}
            }
            return origFillRect.call(this, x, y, w, h);
          };

          CanvasRenderingContext2D.prototype.stroke = function(...args) {
            const el = this.canvas;
            if (isSpreadsheetCanvas(el) && window.__ggbThemePalette) {
              try {
                const ss = normalizeStyle(this.strokeStyle);
                const mapped = mapSpreadsheetStrokeColor(ss, window.__ggbThemePalette);
                if (mapped) {
                  const prev = this.strokeStyle;
                  this.strokeStyle = mapped;
                  try {
                    return origStroke.apply(this, args);
                  } finally {
                    this.strokeStyle = prev;
                  }
                }
              } catch (e) {}
            }
            return origStroke.apply(this, args);
          };

          CanvasRenderingContext2D.prototype.fillText = function(text, x, y, maxWidth) {
            const el = this.canvas;
            if (isSpreadsheetCanvas(el) && window.__ggbThemePalette) {
              try {
                const fs = normalizeStyle(this.fillStyle);
                const mapped = mapSpreadsheetTextFillColor(fs, window.__ggbThemePalette);
                if (mapped) {
                  const prev = this.fillStyle;
                  this.fillStyle = mapped;
                  try {
                    return maxWidth !== undefined
                      ? origFillText.call(this, text, x, y, maxWidth)
                      : origFillText.call(this, text, x, y);
                  } finally {
                    this.fillStyle = prev;
                  }
                }
              } catch (e) {}
            }
            return maxWidth !== undefined
              ? origFillText.call(this, text, x, y, maxWidth)
              : origFillText.call(this, text, x, y);
          };

          CanvasRenderingContext2D.prototype.fill = function(...args) {
            const el = this.canvas;
            if (isSpreadsheetCanvas(el) && window.__ggbThemePalette) {
              try {
                const fs = normalizeStyle(this.fillStyle);
                const mapped = mapSpreadsheetTextFillColor(fs, window.__ggbThemePalette);
                if (mapped) {
                  const prev = this.fillStyle;
                  this.fillStyle = mapped;
                  try {
                    return origFill.apply(this, args);
                  } finally {
                    this.fillStyle = prev;
                  }
                }
              } catch (e) {}
            }
            return origFill.apply(this, args);
          };
        }

        const adaptObject = (name) => {
          const api = window.ggbApplet
          if (!name || !api || typeof api.getObjectType !== 'function') return
          try {
            const type = (api.getObjectType(name) || '').toLowerCase()
            const targetTypes = [
              'line',
              'ray',
              'segment',
              'vector',
              'polyline',
              'penstroke',
              'conic',
              'conicpart',
              'implicitpoly',
              'curvecartesian',
              'line3d',
              'segment3d',
              'ray3d',
              'vector3d',
              'text'
            ]
            if (targetTypes.includes(type)) {
              const hex = (api.getColor(name) || '').toUpperCase()
              if (window.__ggbDarkTheme) {
                if (hex.length === 7 && hex.startsWith('#')) {
                  const r = parseInt(hex.slice(1, 3), 16)
                  const g = parseInt(hex.slice(3, 5), 16)
                  const b = parseInt(hex.slice(5, 7), 16)
                  // 默认深色/黑色几何元素在深色背景下自适应为高对比度亮灰色
                  if (r < 70 && g < 70 && b < 70 && Math.abs(r - g) < 15 && Math.abs(g - b) < 15) {
                    window.__ggbAdaptedObjects = window.__ggbAdaptedObjects || new Set()
                    window.__ggbAdaptedObjects.add(name)
                    api.setColor(name, 224, 224, 224)
                  }
                }
              } else {
                if (window.__ggbAdaptedObjects && window.__ggbAdaptedObjects.has(name)) {
                  window.__ggbAdaptedObjects.delete(name)
                  api.setColor(name, 32, 33, 36)
                }
              }
            }
          } catch (e) {}
        }

        const onObjectAdded = (name) => {
          const api = window.ggbApplet
          if (!name || !api) return
          try {
            const type = typeof api.getObjectType === 'function' ? (api.getObjectType(name) || '').toLowerCase() : ''
            // 按钮对象默认被设为辅助对象而无法在代数区显示和删除，此处解除辅助对象标记以便管理和删除
            if (type === 'button') {
              try {
                if (typeof api.setAuxiliary === 'function') api.setAuxiliary(name, false)
              } catch (e) {}
            }
            adaptObject(name)
            setTimeout(() => {
              if (type === 'button') {
                try { if (typeof api.setAuxiliary === 'function') api.setAuxiliary(name, false) } catch (e) {}
              }
              adaptObject(name)
            }, 30)
          } catch (e) {}
        }

        const adaptAllObjects = () => {
          const api = window.ggbApplet
          if (!api || typeof api.getAllObjectNames !== 'function') return
          try {
            const names = api.getAllObjectNames() || []
            for (let i = 0; i < names.length; i++) {
              const name = names[i]
              const type = (api.getObjectType(name) || '').toLowerCase()
              if (type === 'button') {
                try { if (typeof api.setAuxiliary === 'function') api.setAuxiliary(name, false) } catch (e) {}
              }
              adaptObject(name)
            }
          } catch (e) {}
        }

        const syncPenColor = () => {
          const api = window.ggbApplet
          if (!api) return
          try {
            if (typeof api.getPenColor === 'function' && typeof api.setPenColor === 'function') {
              const penColor = (api.getPenColor() || '').toUpperCase()
              if (window.__ggbDarkTheme) {
                if (penColor === '#202124' || penColor === '#000000' || penColor === '#1C1C1F') {
                  api.setPenColor(224, 224, 224)
                }
              } else {
                if (penColor === '#E0E0E0' || penColor === '#FFFFFF') {
                  api.setPenColor(32, 33, 36)
                }
              }
            }
          } catch (e) {}
        }

        const refreshSpreadsheetView = () => {
          try {
            if (document.fonts && typeof document.fonts.dispatchEvent === 'function') {
              document.fonts.dispatchEvent(new Event('loadingdone'));
            }
          } catch (e) {}
          try {
            const overlays = document.querySelectorAll('.spreadsheetScrollOverlay');
            for (let i = 0; i < overlays.length; i++) {
              overlays[i].dispatchEvent(new Event('scroll'));
            }
          } catch (e) {}
        }

        const applyToApp = () => {
          const api = window.ggbApplet
          if (!api || typeof api.setGraphicsOptions !== 'function') return false
          const opts = {
            bgColor: ${JSON.stringify(palette.canvasBg)},
            axesColor: ${JSON.stringify(palette.axesColor)},
            gridColor: ${JSON.stringify(palette.gridColor)}
          }
          // 视图映射：1 (绘图区1), 2 (绘图区2), 3/-1 (3D 绘图区)
          try { api.setGraphicsOptions(1, opts) } catch (e) {}
          try { api.setGraphicsOptions(2, opts) } catch (e) {}
          try { api.setGraphicsOptions(3, opts) } catch (e) {}
          try { api.setGraphicsOptions(-1, opts) } catch (e) {}
          try { if (typeof api.refreshViews === 'function') api.refreshViews() } catch (e) {}
          refreshSpreadsheetView()
          syncPenColor()
          adaptAllObjects()
          return true
        }

        const hookEvents = () => {
          const api = window.ggbApplet
          if (!api) return false

          if (typeof api.registerAddListener === 'function' && !window.__ggbThemeAddHooked) {
            window.__ggbThemeAddHooked = true
            api.registerAddListener(onObjectAdded)
          }

          if (typeof api.registerClientListener === 'function' && !window.__ggbThemeClientHooked) {
            window.__ggbThemeClientHooked = true
            api.registerClientListener((event) => {
              const type = (event && (event.type || event[0])) || ''
              if (
                type === 'undo' ||
                type === 'redo' ||
                type === 'clear' ||
                type === 'perspectiveChange'
              ) {
                setTimeout(applyToApp, 0)
                setTimeout(applyToApp, 60)
                setTimeout(applyToApp, 200)
              }
            })
          }

          if (typeof api.registerClearListener === 'function' && !window.__ggbThemeClearHooked) {
            window.__ggbThemeClearHooked = true
            api.registerClearListener(() => {
              setTimeout(applyToApp, 0)
              setTimeout(applyToApp, 60)
              setTimeout(applyToApp, 200)
            })
          }

          return true
        }

        if (applyToApp()) {
          hookEvents()
          return
        }

        let attempts = 0
        const interval = setInterval(() => {
          if (applyToApp()) {
            hookEvents()
            clearInterval(interval)
          } else if (++attempts >= 40) {
            clearInterval(interval)
          }
        }, 150)
      })()
    `)
  } catch (error) {
    log.warn('同步 GeoGebra 绘图区背景/坐标轴失败:', error)
  }
}
