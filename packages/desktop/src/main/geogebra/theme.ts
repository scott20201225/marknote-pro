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
      --ggb-primary-color: var(--ggb-theme-accent) !important;
      --ggb-primary-variant-color: var(--ggb-theme-accent-light) !important;
      --ggb-dark-color: var(--ggb-theme-accent-hover) !important;
      --ggb-light-color: var(--ggb-theme-accent-light) !important;
      --ggb-selection-color: var(--ggb-theme-selection) !important;
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
    .GeoGebraFrame .euclidianView {
      background-color: var(--ggb-theme-surface) !important;
      color: var(--ggb-theme-text) !important;
    }

    .GeoGebraFrame canvas {
      background-color: var(--ggb-theme-canvas-bg) !important;
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

    /* 文本按钮鼠标移动上的颜色 (Button Hover) */
    .GeoGebraFrame .materialTextButton:hover,
    .GeoGebraFrame .gwt-Button:hover,
    .GeoGebraFrame .buttonPanel .button:hover,
    .GeoGebraFrame .flatDialogBtn:hover {
      background-color: var(--ggb-theme-hover) !important;
      color: var(--ggb-theme-accent-hover) !important;
      border-color: transparent !important;
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

    /* 工具栏选中的工具 (Selected Tools) */
    .GeoGebraFrame .toolbar,
    .GeoGebraFrame .toolPanel,
    .GeoGebraFrame .toolBPanel,
    .GeoGebraFrame .toolbarPanel {
      background-color: var(--ggb-theme-panel) !important;
      color: var(--ggb-theme-text) !important;
      border-color: var(--ggb-theme-border-subtle) !important;
    }
    .GeoGebraFrame .toolButton {
      background-color: transparent !important;
      color: var(--ggb-theme-text) !important;
    }
    .GeoGebraFrame .toolsPanel .button {
      background-color: var(--ggb-theme-elevated) !important;
      border: 1px solid var(--ggb-theme-border) !important;
    }
    .GeoGebraFrame .toolsPanel .button[selected=false]:hover,
    .GeoGebraFrame .toolsPanel .button[selected=false]:focus,
    .GeoGebraFrame .toolButton[selected=false]:hover {
      border-color: var(--ggb-theme-accent) !important;
      background-color: var(--ggb-theme-hover) !important;
    }
    .GeoGebraFrame .toolButton[selected=false]:hover .gwt-Label {
      color: var(--ggb-theme-text) !important;
    }
    /* 工具被选中 */
    .GeoGebraFrame .toolsPanel .button[selected=true] {
      border: 2px solid var(--ggb-theme-accent) !important;
      background-color: var(--ggb-theme-active) !important;
    }
    .GeoGebraFrame .toolButton[selected=true],
    .GeoGebraFrame .toolButton.selected,
    .GeoGebraFrame .toolbarPanel .toolBPanel .touched {
      border-color: var(--ggb-theme-accent) !important;
      background-color: var(--ggb-theme-active) !important;
    }
    .GeoGebraFrame .toolButton[selected=true] .gwt-Label {
      color: var(--ggb-theme-accent) !important;
      font-weight: 600 !important;
    }

    /* 顶栏与套件标签页选中态 (Tabs) */
    .GeoGebraFrame .header .tabButton {
      color: var(--ggb-theme-text-muted) !important;
    }
    .GeoGebraFrame .header .tabButton:hover {
      background-color: var(--ggb-theme-hover) !important;
      color: var(--ggb-theme-text) !important;
    }
    .GeoGebraFrame .header .tabButton.selected {
      color: var(--ggb-theme-accent) !important;
      border-bottom: 2px solid var(--ggb-theme-accent) !important;
    }
    .GeoGebraFrame .header .tabButton.selected .gwt-Label {
      color: var(--ggb-theme-accent) !important;
    }

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

    /* 代数区选中的表达式行 (Algebra View Expression Selection) */
    .GeoGebraFrame .avItem.avSelectedRow,
    .GeoGebraFrame .avItem.avSelectedRow.keyboardFocus {
      background-color: var(--ggb-theme-active) !important;
      outline: 2px solid var(--ggb-theme-accent) !important;
      outline-offset: -2px !important;
    }
    .GeoGebraFrame .avItem.avSelectedRow .marblePanel {
      background-color: var(--ggb-theme-active) !important;
      border-color: var(--ggb-theme-border) !important;
    }
    .GeoGebraFrame .marble {
      background-color: var(--ggb-theme-accent) !important;
      border: 1px solid var(--ggb-theme-accent) !important;
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
    .GeoGebraFrame .newRadioButtonTreeItemParent {
      background-color: var(--ggb-theme-surface) !important;
      border-top: 1px solid var(--ggb-theme-border-subtle) !important;
      border-bottom: 1px solid var(--ggb-theme-border-subtle) !important;
    }
    .GeoGebraFrame .newRadioButtonTreeItemParent.focused,
    .GeoGebraFrame .algebraPanelScientific .newRadioButtonTreeItemParent.focused {
      border-top: 1px solid var(--ggb-theme-accent) !important;
      border-bottom: 1px solid var(--ggb-theme-accent) !important;
      background-color: var(--ggb-theme-active) !important;
    }
    .GeoGebraFrame .newRadioButtonTreeItemParent.focused .scrollableTextBox,
    .GeoGebraFrame .algebraPanelScientific .newRadioButtonTreeItemParent.focused .scrollableTextBox {
      border-bottom: 1px solid var(--ggb-theme-accent) !important;
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

    /* 表格编辑器处于单元格编辑状态 (Table Spreadsheet Cell Edit Mode) */
    .GeoGebraFrame .tableViewMain,
    .GeoGebraFrame .tvTable,
    .GeoGebraFrame .geogebraweb-table-spreadsheet {
      background-color: var(--ggb-theme-surface) !important;
      color: var(--ggb-theme-text) !important;
    }
    .GeoGebraFrame .tvTable td,
    .GeoGebraFrame .tvTable th,
    .GeoGebraFrame .geogebraweb-table-spreadsheet td {
      border-color: var(--ggb-theme-border-subtle) !important;
      color: var(--ggb-theme-text) !important;
    }
    .GeoGebraFrame .tvTable .values thead th,
    .GeoGebraFrame .geogebraweb-table-spreadsheet td.SVheader {
      background-color: var(--ggb-theme-panel) !important;
      color: var(--ggb-theme-text) !important;
    }
    .GeoGebraFrame .tvTable .highlighted,
    .GeoGebraFrame .geogebraweb-table-spreadsheet td.SVheader.selected {
      background-color: var(--ggb-theme-active) !important;
    }
    .GeoGebraFrame .tvTable td.keyboardFocusedCell,
    .GeoGebraFrame .tvTable th.keyboardFocusedCell {
      outline: 2px solid var(--ggb-theme-accent) !important;
      outline-offset: -2px !important;
    }
    .GeoGebraFrame .tableEditor,
    .GeoGebraFrame .tableEditor input {
      background-color: var(--ggb-theme-input) !important;
      color: var(--ggb-theme-text) !important;
      outline: 2px solid var(--ggb-theme-accent) !important;
      caret-color: var(--ggb-theme-accent) !important;
    }

    /* 表格遮罩渐变 (Spreadsheet Shaded Gradient Fix) */
    .GeoGebraFrame .tvTable .shaded:after {
      background: linear-gradient(to left, var(--ggb-theme-surface) 70px, transparent 120px),
                  linear-gradient(to top, var(--ggb-theme-surface) 20px, transparent 52px) !important;
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
       8. 图标色调自适应与悬浮反馈系统 (Icon Adaptive Filtering & Hover Feedback)
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
    .GeoGebraFrame .header .gwt-Image:not(.profileImage),
    .GeoGebraFrame .toolPanel .gwt-Image,
    .GeoGebraFrame .toolPanelHeading .gwt-Image,
    .GeoGebraFrame .zoomPanelBtn .gwt-Image,
    .GeoGebraFrame .graphicsControlsPanel .gwt-Image,
    .GeoGebraFrame .quickStylebar .gwt-Image,
    .GeoGebraFrame .marblePanel img,
    .GeoGebraFrame .speedPanel img,
    .GeoGebraFrame .playOnly img,
    .GeoGebraFrame .KeyBoardButton img,
    .GeoGebraFrame .menuItemView img,
    .GeoGebraFrame .gwt-MenuItem img,
    .GeoGebraFrame .listMenuItem img:not(.profileImage) {
      filter: ${palette.iconFilter} !important;
    }

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
        const applyToApp = () => {
          const api = window.ggbApplet
          if (!api || typeof api.setGraphicsOptions !== 'function') return false
          const opts = {
            bgColor: ${JSON.stringify(palette.canvasBg)},
            axesColor: ${JSON.stringify(palette.axesColor)},
            gridColor: ${JSON.stringify(palette.gridColor)}
          }
          try { api.setGraphicsOptions(1, opts) } catch (e) {}
          try { api.setGraphicsOptions(16, opts) } catch (e) {}
          try { api.setGraphicsOptions(512, opts) } catch (e) {}
          return true
        }

        if (applyToApp()) return

        let attempts = 0
        const interval = setInterval(() => {
          if (applyToApp() || ++attempts >= 30) {
            clearInterval(interval)
          }
        }, 150)
      })()
    `)
  } catch (error) {
    log.warn('同步 GeoGebra 绘图区背景/坐标轴失败:', error)
  }
}
