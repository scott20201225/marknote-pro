import type { WebContents } from 'electron'
import log from 'electron-log'
import type { GeoGebraConfiguration } from '../../shared/types/ipc'

/**
 * Structured theme palette tokens for GeoGebra.
 * All properties are derived systematically from MarkNotePro's active theme.
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
  // Typography
  readonly textPrimary: string
  readonly textSecondary: string
  // Borders & Structure
  readonly border: string
  readonly borderSubtle: string
  // Accent & Interaction
  readonly accent: string
  readonly accentLight: string
  readonly accentText: string
  readonly hover: string
  readonly active: string
  readonly shadow: string
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
 * For all themes in MarkNotePro (light themes like gruvbox-light, solarized-light,
 * catppuccin-latte, everforest-light, graphite, etc., and dark themes like one-dark,
 * dracula, nord, catppuccin-mocha, dark, tokyo-night, etc.):
 * The engine dynamically computes a cohesive palette mapped to ALL GeoGebra components,
 * crucially including the drawing canvas background, coordinate axes, and grid.
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
      textPrimary: '#1c1c1f',
      textSecondary: '#6e6d73',
      border: '#dcdcdc',
      borderSubtle: '#e6e6eb',
      accent,
      accentLight: sanitizeColor(colors.themeColor10, 'rgba(101, 87, 210, 0.12)'),
      accentText: '#ffffff',
      hover: '#f3f2f7',
      active: sanitizeColor(colors.themeColor20, 'rgba(101, 87, 210, 0.18)'),
      shadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
      iconFilter: 'none'
    }
  }

  // Parse key base colors from theme
  const bgRaw = parseColor(colors.editorBgColor) || (isDark ? { r: 40, g: 40, b: 40, a: 1 } : { r: 250, g: 250, b: 250, a: 1 })
  const textRaw = parseColor(colors.editorColor) || (isDark ? { r: 220, g: 223, b: 230, a: 1 } : { r: 44, g: 62, b: 80, a: 1 })
  const accentRaw = parseColor(colors.themeColor) || { r: 64, g: 158, b: 255, a: 1 }

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
    const panel = sanitizeColor(colors.sideBarBgColor, '#232323')
    const elevated = sanitizeColor(colors.floatBgColor, '#383838')
    const inputBg = sanitizeColor(colors.inputBgColor, surface)
    const textPrimary = sanitizeColor(colors.editorColor, '#dcdfe6')
    const textSecondary = sanitizeColor(colors.editorColor50, '#909399')
    const border = sanitizeColor(colors.tableBorderColor, 'rgba(255, 255, 255, 0.14)')
    const borderSubtle = sanitizeColor(colors.floatBorderColor, 'rgba(255, 255, 255, 0.08)')
    const accent = sanitizeColor(colors.themeColor, '#409eff')
    const accentLight = sanitizeColor(colors.themeColor20, 'rgba(64, 158, 255, 0.2)')
    const hover = sanitizeColor(colors.floatHoverColor, 'rgba(255, 255, 255, 0.06)')
    const active = sanitizeColor(colors.themeColor30, 'rgba(64, 158, 255, 0.28)')

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
      textPrimary,
      textSecondary,
      border,
      borderSubtle,
      accent,
      accentLight,
      accentText,
      hover,
      active,
      shadow: '0 4px 16px rgba(0, 0, 0, 0.36)',
      iconFilter: 'invert(0.85) hue-rotate(180deg)'
    }
  }

  // 4. Light Custom Theme System (graphite, ulysses, solarized-light, gruvbox-light,
  // catppuccin-latte, everforest-light, ayu-light, rose-pine-dawn)
  const surface = canvasBgHex
  const panel = sanitizeColor(colors.sideBarBgColor, '#f2f2f2')
  const elevated = sanitizeColor(colors.floatBgColor, '#ffffff')
  const inputBg = sanitizeColor(colors.inputBgColor, '#ffffff')
  const textPrimary = sanitizeColor(colors.editorColor, '#2c3e50')
  const textSecondary = sanitizeColor(colors.editorColor50, '#7f8c8d')
  const border = sanitizeColor(colors.tableBorderColor, '#dcdcdc')
  const borderSubtle = sanitizeColor(colors.floatBorderColor, '#e8eaed')
  const accent = sanitizeColor(colors.themeColor, '#409eff')
  const accentLight = sanitizeColor(colors.themeColor10, 'rgba(64, 158, 255, 0.12)')
  const hover = sanitizeColor(colors.floatHoverColor, '#f5f5f5')
  const active = sanitizeColor(colors.themeColor20, 'rgba(64, 158, 255, 0.18)')

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
    textPrimary,
    textSecondary,
    border,
    borderSubtle,
    accent,
    accentLight,
    accentText,
    hover,
    active,
    shadow: '0 2px 10px rgba(0, 0, 0, 0.08)',
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
      --ggb-theme-surface: ${palette.surface};
      --ggb-theme-canvas-bg: ${palette.canvasBg};
      --ggb-theme-panel: ${palette.panel};
      --ggb-theme-header: ${palette.headerBg};
      --ggb-theme-header-color: ${palette.headerColor};
      --ggb-theme-elevated: ${palette.elevated};
      --ggb-theme-input: ${palette.inputBg};
      --ggb-theme-text: ${palette.textPrimary};
      --ggb-theme-text-muted: ${palette.textSecondary};
      --ggb-theme-border: ${palette.border};
      --ggb-theme-border-subtle: ${palette.borderSubtle};
      --ggb-theme-accent: ${palette.accent};
      --ggb-theme-accent-light: ${palette.accentLight};
      --ggb-theme-accent-text: ${palette.accentText};
      --ggb-theme-hover: ${palette.hover};
      --ggb-theme-active: ${palette.active};
      --ggb-theme-shadow: ${palette.shadow};

      --ggb-primary-color: var(--ggb-theme-accent) !important;
      --ggb-primary-variant-color: var(--ggb-theme-accent-light) !important;
      --ggb-dark-color: var(--ggb-theme-accent) !important;
      --ggb-light-color: var(--ggb-theme-accent-light) !important;
      --ggb-selection-color: var(--ggb-theme-accent-light) !important;
    }

    /* 1. App Frame, Viewport & Canvas Surroundings */
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

    /* 2. Header & Navigation Bars */
    .GeoGebraFrame .GeoGebraHeader,
    .GeoGebraFrame .header,
    .GeoGebraFrame .headerView,
    .GeoGebraFrame .upperHeader,
    .GeoGebraFrame .toolPanelHeading {
      background-color: var(--ggb-theme-header) !important;
      color: var(--ggb-theme-header-color) !important;
      border-color: var(--ggb-theme-border-subtle) !important;
    }

    .GeoGebraFrame .appName,
    .GeoGebraFrame .header .gwt-Label,
    .GeoGebraFrame .toolPanelHeading .gwt-Label,
    .GeoGebraFrame .header .button,
    .GeoGebraFrame .toolPanelHeading .button {
      color: var(--ggb-theme-header-color) !important;
    }

    .GeoGebraFrame .header .tabButton {
      color: var(--ggb-theme-text-muted) !important;
    }
    .GeoGebraFrame .header .tabButton:hover {
      background-color: var(--ggb-theme-hover) !important;
    }
    .GeoGebraFrame .header .tabButton.selected {
      color: var(--ggb-theme-accent) !important;
      border-bottom: 2px solid var(--ggb-theme-accent) !important;
    }
    .GeoGebraFrame .header .tabButton.selected .gwt-Label {
      color: var(--ggb-theme-accent) !important;
    }

    .GeoGebraFrame .suiteAppPickerButton {
      background-color: var(--ggb-theme-elevated) !important;
      border-color: var(--ggb-theme-border) !important;
      color: var(--ggb-theme-text) !important;
    }
    .GeoGebraFrame .suiteAppPickerButton:hover,
    .GeoGebraFrame .suiteAppPickerButton[aria-expanded=true] {
      background-color: var(--ggb-theme-hover) !important;
    }
    .GeoGebraFrame .suiteAppPickerButton .gwt-Label {
      color: var(--ggb-theme-text) !important;
    }

    /* 3. Algebra Panel & Construction Items */
    .GeoGebraFrame .algebraView,
    .GeoGebraFrame .algebraPanel,
    .GeoGebraFrame .algebraView .gwt-Tree,
    .GeoGebraFrame .algebraView .gwt-TreeItem {
      background-color: var(--ggb-theme-surface) !important;
      color: var(--ggb-theme-text) !important;
    }

    .GeoGebraFrame .avItem,
    .GeoGebraFrame .avInputItem,
    .GeoGebraFrame .newRadioButtonTreeItemParent,
    .GeoGebraFrame .panelRow {
      background-color: var(--ggb-theme-surface) !important;
      color: var(--ggb-theme-text) !important;
      border-color: var(--ggb-theme-border-subtle) !important;
    }

    .GeoGebraFrame .newRadioButtonTreeItemParent.focused,
    .GeoGebraFrame .avItem.avSelectedRow,
    .GeoGebraFrame .avItem.avSelectedRow.keyboardFocus {
      background-color: var(--ggb-theme-active) !important;
      border-color: var(--ggb-theme-accent) !important;
    }

    .GeoGebraFrame .marblePanel {
      background-color: var(--ggb-theme-surface) !important;
      border-color: var(--ggb-theme-border-subtle) !important;
    }
    .GeoGebraFrame .avItem.avSelectedRow .marblePanel {
      background-color: var(--ggb-theme-active) !important;
    }

    .GeoGebraFrame .marble {
      background-color: var(--ggb-theme-accent) !important;
    }

    .GeoGebraFrame .scrollableTextBox,
    .GeoGebraFrame .AutoCompleteTextFieldW,
    .GeoGebraFrame .AutoCompleteTextFieldW input,
    .GeoGebraFrame .TextField,
    .GeoGebraFrame .mathTextField,
    .GeoGebraFrame .gwt-SuggestBox {
      background-color: var(--ggb-theme-input) !important;
      color: var(--ggb-theme-text) !important;
      caret-color: var(--ggb-theme-accent) !important;
    }

    .GeoGebraFrame .cursorOverlay .virtualCursor {
      color: var(--ggb-theme-accent) !important;
    }
    .GeoGebraFrame .cursorOverlay .select-content {
      background: var(--ggb-theme-accent-light) !important;
    }

    .GeoGebraFrame .avOutput,
    .GeoGebraFrame .elemText,
    .GeoGebraFrame .avValue,
    .GeoGebraFrame .canvasVal,
    .GeoGebraFrame .evaluationRow {
      color: var(--ggb-theme-text) !important;
    }

    .GeoGebraFrame .avDummyLabel,
    .GeoGebraFrame .avNameLogo {
      color: var(--ggb-theme-text-muted) !important;
    }

    .GeoGebraFrame .algebraView .more,
    .GeoGebraFrame .speedPanel .flatButton,
    .GeoGebraFrame .playOnly {
      background: transparent !important;
      color: var(--ggb-theme-text-muted) !important;
      border: none !important;
      box-shadow: none !important;
    }
    .GeoGebraFrame .algebraView .more:hover,
    .GeoGebraFrame .speedPanel .flatButton:hover {
      background-color: var(--ggb-theme-hover) !important;
      color: var(--ggb-theme-text) !important;
    }
    .GeoGebraFrame .symbolicButton {
      background-color: var(--ggb-theme-accent) !important;
      color: var(--ggb-theme-accent-text) !important;
    }

    /* 4. Toolbar & Floating Panels */
    .GeoGebraFrame .toolbar,
    .GeoGebraFrame .toolPanel,
    .GeoGebraFrame .toolBPanel,
    .GeoGebraFrame .toolbarPanel {
      background-color: var(--ggb-theme-panel) !important;
      color: var(--ggb-theme-text) !important;
      border-color: var(--ggb-theme-border-subtle) !important;
    }

    .GeoGebraFrame .toolbar_button,
    .GeoGebraFrame .toolButton,
    .GeoGebraFrame .customizableToolbarItem {
      background-color: transparent !important;
      color: var(--ggb-theme-text) !important;
    }
    .GeoGebraFrame .toolbar_button:hover,
    .GeoGebraFrame .toolButton:hover {
      background-color: var(--ggb-theme-hover) !important;
    }
    .GeoGebraFrame .toolButton.selected,
    .GeoGebraFrame .toolbarPanel .toolBPanel .touched {
      border-color: var(--ggb-theme-accent) !important;
      background-color: var(--ggb-theme-active) !important;
    }

    .GeoGebraFrame .toolbar_submenu .submenuContent {
      background-color: var(--ggb-theme-elevated) !important;
      color: var(--ggb-theme-text) !important;
      border: 1px solid var(--ggb-theme-border) !important;
      box-shadow: var(--ggb-theme-shadow) !important;
    }
    .GeoGebraFrame .toolbar_submenu .submenuContent li:hover {
      background-color: var(--ggb-theme-hover) !important;
      color: var(--ggb-theme-text) !important;
    }

    /* 5. Floating Controls & Quick Style Bar */
    .GeoGebraFrame .zoomPanel,
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

    /* 6. Settings Drawer & Properties View */
    .GeoGebraFrame .floatingSideSheet,
    .GeoGebraFrame .PropertiesViewW,
    .GeoGebraFrame .sideSheet {
      background-color: var(--ggb-theme-elevated) !important;
      color: var(--ggb-theme-text) !important;
      border-left: 1px solid var(--ggb-theme-border) !important;
      box-shadow: var(--ggb-theme-shadow) !important;
    }
    .GeoGebraFrame .propertiesTab,
    .GeoGebraFrame .componentTab,
    .GeoGebraFrame .tabPanel,
    .GeoGebraFrame .headeredMenuView {
      background-color: var(--ggb-theme-elevated) !important;
      color: var(--ggb-theme-text) !important;
    }
    .GeoGebraFrame .tabPanel .dropDown,
    .GeoGebraFrame .tabPanel .comboBox,
    .GeoGebraFrame .tabPanel .expandableList,
    .GeoGebraFrame .tabPanel .inputTextField input,
    .GeoGebraFrame .tabPanel .textEdit input {
      background-color: var(--ggb-theme-input) !important;
      color: var(--ggb-theme-text) !important;
      border-color: var(--ggb-theme-border) !important;
    }
    .GeoGebraFrame .tabPanel .buttonWithIcon:hover {
      background-color: var(--ggb-theme-hover) !important;
    }

    /* 7. Virtual On-Screen Keyboard */
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
    .GeoGebraFrame .KeyBoard.TabbedKeyBoard .KeyBoardButton.colored,
    .GeoGebraFrame .KeyBoard.TabbedKeyBoard .KeyBoardButton.accentDown {
      background-color: var(--ggb-theme-hover) !important;
      color: var(--ggb-theme-text) !important;
    }
    .GeoGebraFrame .KeyBoardButton:active {
      box-shadow: inset 0 0 0 2px var(--ggb-theme-accent) !important;
    }
    .GeoGebraFrame .KeyboardSwitcher .gwt-Button {
      color: var(--ggb-theme-text) !important;
    }
    .GeoGebraFrame .KeyboardSwitcher .gwt-Button.selected {
      background-color: var(--ggb-theme-accent) !important;
      color: var(--ggb-theme-accent-text) !important;
    }
    .GeoGebraFrame .matOpenKeyboardBtn,
    .GeoGebraFrame .closeTabbedKeyboardButton {
      color: var(--ggb-theme-text) !important;
    }

    /* 8. Dialogs, Popups & Context Menus */
    .GeoGebraFrame .gwt-DialogBox,
    .GeoGebraFrame .MaterialDialogBox,
    .GeoGebraFrame .gwt-PopupPanel,
    .GeoGebraFrame .contextMenu,
    .GeoGebraFrame .menuPicker,
    .GeoGebraFrame .optionsPopup {
      background-color: var(--ggb-theme-elevated) !important;
      color: var(--ggb-theme-text) !important;
      border: 1px solid var(--ggb-theme-border) !important;
      box-shadow: var(--ggb-theme-shadow) !important;
      border-radius: 6px !important;
    }

    .GeoGebraFrame .gwt-DialogBox .Caption,
    .GeoGebraFrame .MaterialDialogBox .Caption {
      background-color: var(--ggb-theme-elevated) !important;
      color: var(--ggb-theme-text) !important;
      border-bottom: 1px solid var(--ggb-theme-border-subtle) !important;
    }

    .GeoGebraFrame .dialogContent,
    .GeoGebraFrame .dialogContent table,
    .GeoGebraFrame .dialogContent tr,
    .GeoGebraFrame .dialogContent td {
      background-color: transparent !important;
      color: var(--ggb-theme-text) !important;
    }

    .GeoGebraFrame .dialogContent input[type=text],
    .GeoGebraFrame .dialogContent select,
    .GeoGebraFrame .dialogContent textarea,
    .GeoGebraFrame .gwt-DialogBox input,
    .GeoGebraFrame .gwt-DialogBox select,
    .GeoGebraFrame .gwt-DialogBox textarea {
      background-color: var(--ggb-theme-input) !important;
      color: var(--ggb-theme-text) !important;
      border: 1px solid var(--ggb-theme-border) !important;
      border-radius: 4px !important;
    }

    .GeoGebraFrame .menuItemView,
    .GeoGebraFrame .gwt-MenuItem {
      background-color: var(--ggb-theme-elevated) !important;
      color: var(--ggb-theme-text) !important;
    }

    .GeoGebraFrame .menuItemView:hover,
    .GeoGebraFrame .menuItemView.selected,
    .GeoGebraFrame .gwt-MenuItem-selected {
      background-color: var(--ggb-theme-hover) !important;
      color: var(--ggb-theme-text) !important;
    }

    /* 9. Table View & Spreadsheet */
    .GeoGebraFrame .tableViewMain,
    .GeoGebraFrame .tvTable,
    .GeoGebraFrame .tableEditor {
      background-color: var(--ggb-theme-surface) !important;
      color: var(--ggb-theme-text) !important;
    }
    .GeoGebraFrame .tvTable td,
    .GeoGebraFrame .tvTable th {
      border-color: var(--ggb-theme-border-subtle) !important;
      color: var(--ggb-theme-text) !important;
    }
    .GeoGebraFrame .tvTable .values thead th {
      background-color: var(--ggb-theme-panel) !important;
      color: var(--ggb-theme-text) !important;
    }
    .GeoGebraFrame .tvTable .highlighted {
      background-color: var(--ggb-theme-active) !important;
    }
    .GeoGebraFrame .tvTable td.keyboardFocusedCell,
    .GeoGebraFrame .tvTable th.keyboardFocusedCell {
      box-shadow: inset 0 0 0 2px var(--ggb-theme-accent) !important;
    }

    /* 10. Buttons, Badges, Toasts & Icons */
    .GeoGebraFrame .gwt-Button,
    .GeoGebraFrame .buttonPanel .button {
      background: transparent !important;
      color: var(--ggb-theme-accent) !important;
      border: 1px solid var(--ggb-theme-border) !important;
      border-radius: 4px !important;
    }

    .GeoGebraFrame .gwt-Button:hover,
    .GeoGebraFrame .buttonPanel .button:hover {
      background-color: var(--ggb-theme-hover) !important;
    }

    .GeoGebraFrame .buttonPanel .primary,
    .GeoGebraFrame .buttonPanel .confirm,
    .GeoGebraFrame .materialFilledButton {
      background-color: var(--ggb-theme-accent) !important;
      color: var(--ggb-theme-accent-text) !important;
      border-color: var(--ggb-theme-accent) !important;
    }

    .GeoGebraFrame .snackbarComponent,
    .GeoGebraFrame .dataImporter {
      background-color: var(--ggb-theme-elevated) !important;
      color: var(--ggb-theme-text) !important;
      border: 1px solid var(--ggb-theme-border) !important;
    }

    /* Icon Filter System */
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
    .GeoGebraFrame .gwt-MenuItem img {
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
