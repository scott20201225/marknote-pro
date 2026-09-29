import type { GeoGebraConfiguration } from '../../shared/types/ipc'

/**
 * Structured theme palette tokens for GeoGebra.
 * All properties are derived systematically from MarkNotePro's active theme.
 */
export interface GeoGebraThemePalette {
  readonly isDark: boolean
  readonly surface: string
  readonly panel: string
  readonly headerBg: string
  readonly headerColor: string
  readonly elevated: string
  readonly inputBg: string
  readonly textPrimary: string
  readonly textSecondary: string
  readonly border: string
  readonly borderSubtle: string
  readonly accent: string
  readonly accentLight: string
  readonly accentText: string
  readonly hover: string
  readonly active: string
  readonly shadow: string
  readonly iconFilter: string
}

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
 * Here, when the user chooses default 'light', we preserve or calculate from this baseline.
 *
 * For all other themes in MarkNotePro (light themes like gruvbox-light, solarized-light,
 * catppuccin-latte, everforest-light, graphite, etc., and dark themes like one-dark,
 * dracula, nord, catppuccin-mocha, dark, tokyo-night, etc.):
 * The engine dynamically computes a cohesive, comprehensive palette mapped to
 * GeoGebra's structural components.
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

  // 2. Dark Theme Calculation
  if (isDark) {
    const surface = sanitizeColor(colors.editorBgColor, '#282828')
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
      accentText: '#ffffff',
      hover,
      active,
      shadow: '0 4px 16px rgba(0, 0, 0, 0.36)',
      iconFilter: 'invert(0.85) hue-rotate(180deg)'
    }
  }

  // 3. Light Custom Themes (e.g. graphite, ulysses, solarized-light, gruvbox-light,
  // catppuccin-latte, everforest-light, ayu-light, rose-pine-dawn)
  const surface = sanitizeColor(colors.editorBgColor, '#fafafa')
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
    accentText: '#ffffff',
    hover,
    active,
    shadow: '0 2px 10px rgba(0, 0, 0, 0.08)',
    iconFilter: 'none'
  }
}

/**
 * Builds the comprehensive stylesheet to inject into GeoGebra's web view.
 * Uses CSS custom properties and structured component layers rather than ad-hoc patches.
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

    /* 1. App Frame & Surrounding Layout */
    .GeoGebraFrame,
    .GeoGebraFrame .gwt-SplitLayoutPanel.neutral-0,
    .GeoGebraFrame .main,
    .GeoGebraFrame .dockPanel {
      background-color: var(--ggb-theme-surface) !important;
      color: var(--ggb-theme-text) !important;
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
    .GeoGebraFrame .avItem.avSelectedRow {
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
    .GeoGebraFrame .mathTextField {
      background-color: var(--ggb-theme-input) !important;
      color: var(--ggb-theme-text) !important;
      caret-color: var(--ggb-theme-accent) !important;
    }

    .GeoGebraFrame .avDummyLabel,
    .GeoGebraFrame .avNameLogo {
      color: var(--ggb-theme-text-muted) !important;
    }

    .GeoGebraFrame .algebraView .more {
      background: transparent !important;
      color: var(--ggb-theme-text-muted) !important;
      border: none !important;
      box-shadow: none !important;
    }
    .GeoGebraFrame .algebraView .more:hover {
      background-color: var(--ggb-theme-hover) !important;
      color: var(--ggb-theme-text) !important;
    }

    /* 4. Toolbar & Floating Panels */
    .GeoGebraFrame .toolbar,
    .GeoGebraFrame .toolPanel {
      background-color: var(--ggb-theme-panel) !important;
      color: var(--ggb-theme-text) !important;
      border-color: var(--ggb-theme-border-subtle) !important;
    }

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

    /* 5. Dialogs, Popups & Context Menus */
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
    }

    .GeoGebraFrame .gwt-DialogBox .Caption,
    .GeoGebraFrame .MaterialDialogBox .Caption {
      background-color: var(--ggb-theme-elevated) !important;
      color: var(--ggb-theme-text) !important;
      border-bottom: 1px solid var(--ggb-theme-border) !important;
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

    /* 6. Buttons & Interactions */
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

    /* 7. Icon System */
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
