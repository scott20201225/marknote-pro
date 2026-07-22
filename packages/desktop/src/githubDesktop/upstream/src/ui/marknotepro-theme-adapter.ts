import * as ipcRenderer from '../lib/ipc-renderer'

const SUPPORTED_LANGUAGES = [
  'de',
  'en',
  'es',
  'fr',
  'it',
  'ja',
  'ko',
  'pt',
  'tr',
  'zh-CN',
  'zh-TW'
] as const

type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number]

interface MarkNoteProActionTranslations {
  readonly note: string
  readonly setWorkspace: string
}

type ActionKey = keyof MarkNoteProActionTranslations

interface MarkNoteProThemePayload {
  readonly theme: string
  readonly isDark: boolean
  readonly colors: Record<string, string>
}

interface MarkNoteProLocalePayload {
  readonly language: string
  readonly actions?: MarkNoteProActionTranslations
  readonly internalText?: Record<string, string>
}

const STYLE_ID = 'marknotepro-github-desktop-theme'
const ACTIONS_ID = 'marknotepro-github-desktop-actions'
const MENU_OBSERVER_ID = 'marknotepro-menu-observer-installed'
const INTERNAL_I18N_OBSERVER_ID = 'marknotepro-internal-i18n-observer-installed'

interface InternalTextNodeState {
  original: string
  lastTranslated: string
}

const internalTextNodes = new WeakMap<Text, InternalTextNodeState>()
const TRANSLATABLE_ATTRIBUTES = ['title', 'aria-label', 'placeholder'] as const

let currentLanguage: SupportedLanguage = 'zh-CN'
let currentActions: MarkNoteProActionTranslations = {
  note: 'Notes',
  setWorkspace: 'Set current repository as notes workspace'
}
let currentInternalText: Record<string, string> = {}

const ORIGINAL_ATTRIBUTE_PREFIX = 'data-marknotepro-original-'
const LAST_TRANSLATED_ATTRIBUTE_PREFIX = 'data-marknotepro-last-translated-'

const formatLocalizedRelativeTime = (
  value: number,
  unit: Intl.RelativeTimeFormatUnit
): string | null => {
  try {
    return new Intl.RelativeTimeFormat(currentLanguage, {
      numeric: 'auto'
    }).format(value, unit)
  } catch {
    return null
  }
}

const normalizeLanguage = (language: string | undefined): SupportedLanguage => {
  if (language && SUPPORTED_LANGUAGES.includes(language as SupportedLanguage)) {
    return language as SupportedLanguage
  }
  return 'en'
}

const t = (key: keyof MarkNoteProActionTranslations): string => currentActions[key]

const sanitize = (value: string | undefined, fallback: string): string => {
  const color = value?.trim()
  return color ? color.replace(/[{};]/g, '') : fallback
}

const getColor = (
  payload: MarkNoteProThemePayload,
  name: string,
  lightFallback: string,
  darkFallback: string = lightFallback
): string => sanitize(payload.colors[name], payload.isDark ? darkFallback : lightFallback)

const getAdapterCss = (payload: MarkNoteProThemePayload): string => {
  const background = getColor(payload, 'editorBgColor', '#ffffff', '#24292e')
  const panel = getColor(payload, 'itemBgColor', '#f6f8fa', '#2f363d')
  const toolbar = getColor(payload, 'editorBgColor', '#ffffff', '#24292e')
  const hover = getColor(payload, 'floatHoverColor', '#f3f4f6', '#3a3f4b')
  const border = getColor(payload, 'floatBorderColor', '#d0d7de', '#444c56')
  const contrastBorder = getColor(payload, 'editorColor30', '#8c959f', '#6e7681')
  const text = getColor(payload, 'editorColor', '#24292f', '#c9d1d9')
  const textStrong = getColor(payload, 'editorColor80', '#1f2328', '#f0f3f6')
  const textSecondary = getColor(payload, 'editorColor60', '#57606a', '#8b949e')
  const textMuted = getColor(payload, 'editorColor40', '#6e7781', '#6e7681')
  const accent = getColor(payload, 'themeColor', '#0969da', '#58a6ff')
  const accentSoft = getColor(payload, 'themeColor20', 'rgba(9, 105, 218, 0.16)', 'rgba(88, 166, 255, 0.18)')
  const accentSofter = getColor(payload, 'themeColor10', 'rgba(9, 105, 218, 0.08)', 'rgba(88, 166, 255, 0.10)')
  const selection = getColor(payload, 'selectionColor', accentSoft, accentSoft)
  const input = getColor(payload, 'inputBgColor', '#ffffff', '#1f242b')
  const deleteColor = getColor(payload, 'deleteColor', '#cf222e', '#ff7b72')

  return `
:root,
body,
body.theme-light,
body.theme-dark {
  --marknotepro-github-action-rail-width: 45px;
  --background-color: ${background};
  --box-background-color: ${background};
  --box-alt-background-color: ${panel};
  --box-skeleton-background-color: ${panel};
  --box-border-color: ${border};
  --box-border-contrast-color: ${contrastBorder};
  --box-border-accent-color: ${accent};
  --box-selected-background-color: ${selection};
  --box-selected-active-background-color: ${accentSoft};
  --box-selected-text-color: ${textStrong};
  --box-hover-background-color: ${hover};
  --box-hover-text-color: ${textStrong};
  --text-color: ${text};
  --text-secondary-color: ${textSecondary};
  --text-secondary-color-muted: ${textMuted};
  --toolbar-background-color: ${toolbar};
  --toolbar-border-color: ${border};
  --toolbar-text-color: ${text};
  --toolbar-text-secondary-color: ${textSecondary};
  --toolbar-button-color: ${text};
  --toolbar-button-background-color: transparent;
  --toolbar-button-border-color: ${border};
  --toolbar-button-secondary-color: ${textSecondary};
  --toolbar-button-hover-color: ${textStrong};
  --toolbar-button-hover-background-color: ${hover};
  --toolbar-button-hover-border-color: ${border};
  --toolbar-button-focus-background-color: ${hover};
  --toolbar-button-active-color: ${textStrong};
  --toolbar-button-active-background-color: ${panel};
  --toolbar-button-active-border-color: ${border};
  --toolbar-button-progress-color: ${accentSofter};
  --toolbar-button-focus-progress-color: ${accentSoft};
  --toolbar-button-hover-progress-color: ${accentSoft};
  --toolbar-dropdown-open-progress-color: ${accentSoft};
  --toolbar-badge-background-color: ${payload.isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.12)'};
  --toolbar-badge-active-background-color: ${accentSoft};
  --tab-bar-background-color: ${panel};
  --tab-bar-active-background-color: ${background};
  --tab-bar-hover-background-color: ${hover};
  --app-menu-button-color: ${text};
  --app-menu-button-hover-color: ${textStrong};
  --app-menu-button-active-color: ${textStrong};
  --app-menu-pane-color: ${text};
  --app-menu-pane-secondary-color: ${textSecondary};
  --app-menu-pane-background-color: ${panel};
  --app-menu-divider-color: ${border};
  --app-menu-button-hover-background-color: ${hover};
  --app-menu-button-active-background-color: ${accentSoft};
  --button-background: ${accent};
  --button-hover-background: ${accent};
  --button-text-color: ${getColor(payload, 'buttonPrimaryFontColor', '#ffffff', '#ffffff')};
  --button-focus-border-color: ${accentSoft};
  --secondary-button-background: ${panel};
  --secondary-button-hover-background: ${hover};
  --secondary-button-border-color: ${border};
  --secondary-button-hover-border-color: ${contrastBorder};
  --secondary-button-text-color: ${text};
  --link-button-color: ${accent};
  --link-button-hover-color: ${accent};
  --link-button-selected-hover-color: ${accent};
  --scroll-bar-thumb-background-color: ${payload.isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'};
  --scroll-bar-thumb-background-color-active: ${payload.isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.45)'};
  --input-background-color: ${input};
  --text-field-background-color: ${input};
  --form-control-background-color: ${input};
  --color-renamed: ${accent};
  --color-deleted: ${deleteColor};
}

html,
body,
#desktop-app-container {
  background: ${background};
}

body.marknotepro-theme-adapted {
  color: ${text};
}

body.marknotepro-theme-adapted::before {
  content: "";
  position: fixed;
  z-index: 15;
  top: 0;
  bottom: 0;
  left: calc(var(--marknotepro-github-action-rail-width) - 1px);
  width: 1px;
  background: ${border};
  pointer-events: none;
}

body.marknotepro-theme-adapted #desktop-app-contents {
  width: calc(100% - var(--marknotepro-github-action-rail-width));
  margin-left: var(--marknotepro-github-action-rail-width);
}

body.marknotepro-theme-adapted #desktop-app-title-bar,
body.marknotepro-theme-adapted #desktop-app-title-bar.light-title-bar,
body.marknotepro-theme-adapted #desktop-app-toolbar {
  background: ${toolbar} !important;
  background-color: ${toolbar} !important;
  border-color: ${border} !important;
}

body.marknotepro-theme-adapted #desktop-app-title-bar {
  border-bottom: 1px solid ${border} !important;
}

body.marknotepro-theme-adapted #desktop-app-toolbar {
  border-bottom: 1px solid ${border} !important;
}

body.marknotepro-theme-adapted #desktop-app-toolbar .toolbar-button > button {
  background-color: transparent;
  border-right-color: ${border};
}

body.marknotepro-theme-adapted #desktop-app-toolbar .toolbar-dropdown.open > .toolbar-button > button,
body.marknotepro-theme-adapted #desktop-app-toolbar .toolbar-button > button:focus,
body.marknotepro-theme-adapted #desktop-app-toolbar .toolbar-button > button:not(:disabled):hover {
  background-color: ${hover};
}

body.marknotepro-theme-adapted .panel,
body.marknotepro-theme-adapted .toolbar {
  border-color: ${border};
}

body.marknotepro-theme-adapted ::selection {
  background: ${accentSofter};
}

body.marknotepro-theme-adapted #app-menu-bar {
  position: fixed;
  z-index: 16;
  left: 10px;
  top: 72px;
  bottom: auto;
  width: 35px;
  height: auto;
  display: flex;
  flex-direction: column;
  gap: 7px;
  align-items: center;
  overflow: visible;
  -webkit-app-region: no-drag;
}

body.marknotepro-theme-adapted #app-menu-bar .toolbar-dropdown,
body.marknotepro-theme-adapted #app-menu-bar .toolbar-button {
  width: 34px;
  height: 34px;
  min-width: 34px;
  min-height: 34px;
}

body.marknotepro-theme-adapted #app-menu-bar .toolbar-button > button {
  width: 34px;
  height: 34px;
  min-width: 34px;
  min-height: 34px;
  justify-content: center;
  padding: 0 !important;
  border: 0;
  border-radius: 6px;
  color: ${textSecondary};
  background: transparent;
}

body.marknotepro-theme-adapted #app-menu-bar .toolbar-button > button > :not(.marknotepro-menu-button-icon) {
  display: none !important;
}

body.marknotepro-theme-adapted #app-menu-bar .toolbar-button > button:hover,
body.marknotepro-theme-adapted #app-menu-bar .toolbar-button > button:focus,
body.marknotepro-theme-adapted #app-menu-bar .toolbar-dropdown.open > .toolbar-button > button {
  color: ${accent};
  background: ${hover};
}

body.marknotepro-theme-adapted #app-menu-bar .toolbar-button .menu-item {
  width: 34px;
  height: 34px;
  min-width: 34px;
  justify-content: center;
  padding: 0;
}

body.marknotepro-theme-adapted #app-menu-bar .toolbar-button .menu-item .label,
body.marknotepro-theme-adapted #app-menu-bar .toolbar-button .menu-item .access-key {
  display: none !important;
}

body.marknotepro-theme-adapted .marknotepro-menu-button-icon {
  width: 19px;
  height: 19px;
  display: inline-flex;
  color: currentColor;
  pointer-events: none;
}

body.marknotepro-theme-adapted .marknotepro-menu-button-icon svg {
  width: 19px;
  height: 19px;
  display: block;
  stroke: currentColor;
}

body.marknotepro-theme-adapted #app-menu-bar #foldout-container .foldout {
  pointer-events: none;
}

body.marknotepro-theme-adapted #app-menu-bar #foldout-container .foldout .menu-pane {
  pointer-events: auto;
  border: 1px solid ${border};
  border-radius: 8px;
  box-shadow: 0 12px 36px ${payload.isDark ? 'rgba(0, 0, 0, 0.36)' : 'rgba(27, 31, 36, 0.16)'};
}

body.marknotepro-theme-adapted #app-menu-bar #app-menu-foldout {
  position: fixed;
  left: calc(var(--marknotepro-github-action-rail-width) + 8px);
  top: 72px;
  max-height: calc(100vh - 92px);
}

body.marknotepro-theme-adapted #app-menu-bar .menu-pane {
  padding: 5px 0 !important;
  min-width: 238px;
}

body.marknotepro-theme-adapted #app-menu-bar .menu-pane .menu-item {
  height: 28px;
  min-height: 28px;
  font-size: 13px;
}

body.marknotepro-theme-adapted #app-menu-bar .menu-pane .menu-item .label {
  margin-left: 14px;
  margin-right: 14px;
}

body.marknotepro-theme-adapted #app-menu-bar .menu-pane .menu-item .accelerator,
body.marknotepro-theme-adapted #app-menu-bar .menu-pane .menu-item .access-key {
  display: none !important;
}

body.marknotepro-theme-adapted #app-menu-bar .menu-pane hr {
  margin: 4px 0;
  height: 0;
  border: 0;
  border-bottom: 1px solid ${border};
}

.marknotepro-desktop-actions {
  position: fixed;
  left: 10px;
  bottom: 10px;
  z-index: 16;
  display: flex;
  flex-direction: column;
  gap: 7px;
  pointer-events: auto;
}

.marknotepro-desktop-action {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 6px;
  color: ${textSecondary};
  background: transparent;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.marknotepro-desktop-action:hover {
  color: ${accent};
  background: ${hover};
}

.marknotepro-desktop-action:disabled {
  cursor: wait;
  opacity: 0.55;
}

.marknotepro-desktop-action svg {
  width: 19px;
  height: 19px;
  stroke: currentColor;
}
`.trim()
}

const noteIcon = `
<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M4 19.5V5.75A2.75 2.75 0 0 1 6.75 3H20v16H6.75A2.75 2.75 0 0 0 4 21.75" />
  <path d="M8 7h8" />
  <path d="M8 11h6" />
</svg>
`

const workspaceIcon = `
<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M3 7.75A2.75 2.75 0 0 1 5.75 5H9l2 2h7.25A2.75 2.75 0 0 1 21 9.75v6.5A2.75 2.75 0 0 1 18.25 19H5.75A2.75 2.75 0 0 1 3 16.25z" />
  <path d="m9 13 2 2 4-4" />
</svg>
`

const menuButtonIcons = [
  `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.75 20.25 7.5v9L12 21.25 3.75 16.5v-9z"/><path d="M12 12.25v9"/><path d="m3.95 7.75 8.05 4.5 8.05-4.5"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 6.75A2.75 2.75 0 0 1 7.25 4h3l2 2h4.5a2.75 2.75 0 0 1 2.75 2.75v8A2.75 2.75 0 0 1 16.75 19H7.25a2.75 2.75 0 0 1-2.75-2.75z"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 19 3.75-1 9.5-9.5a2.12 2.12 0 0 0-3-3L5.75 15z"/><path d="m14 6 4 4"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.75 12s3.5-6 9.25-6 9.25 6 9.25 6-3.5 6-9.25 6-9.25-6-9.25-6z"/><circle cx="12" cy="12" r="2.5"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 7.5A2.5 2.5 0 0 1 7 5h10a2.5 2.5 0 0 1 2.5 2.5v9A2.5 2.5 0 0 1 17 19H7a2.5 2.5 0 0 1-2.5-2.5z"/><path d="M8 9h8"/><path d="M8 13h5"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="6" r="2.25"/><circle cx="18" cy="12" r="2.25"/><circle cx="6" cy="18" r="2.25"/><path d="M6 8.25v7.5"/><path d="M8.15 7 15.9 11"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2.5"/><path d="M4 9h16"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.75 9.25a2.4 2.4 0 0 1 4.65.8c0 1.85-2.4 2.2-2.4 3.95"/><path d="M12 17.2h.01"/></svg>`
]

const syncAppMenuButtons = (): void => {
  const menuBar = document.getElementById('app-menu-bar')
  if (!menuBar) return

  menuBar.querySelectorAll<HTMLButtonElement>('.toolbar-button > button').forEach((button, index) => {
    const label =
      button.querySelector<HTMLElement>('.label')?.innerText?.trim() ||
      button.getAttribute('aria-label') ||
      ''
    if (label) {
      button.title = label
      button.setAttribute('aria-label', label)
    }

    let icon = button.querySelector<HTMLSpanElement>('.marknotepro-menu-button-icon')
    if (!icon) {
      icon = document.createElement('span')
      icon.className = 'marknotepro-menu-button-icon'
      button.appendChild(icon)
    }
    const iconIndex = String(index)
    if (icon.dataset.iconIndex !== iconIndex) {
      icon.dataset.iconIndex = iconIndex
      icon.innerHTML = menuButtonIcons[index] ?? menuButtonIcons[menuButtonIcons.length - 1]
    }
  })
}

const ensureAppMenuButtonObserver = (): void => {
  if (document.documentElement.getAttribute(MENU_OBSERVER_ID)) {
    syncAppMenuButtons()
    return
  }

  document.documentElement.setAttribute(MENU_OBSERVER_ID, 'true')
  const observer = new MutationObserver(() => syncAppMenuButtons())
  observer.observe(document.body, { childList: true, subtree: true })
  syncAppMenuButtons()
}

const shouldSkipInternalI18n = (element: Element | null): boolean => {
  if (!element) return true
  return !!element.closest([
    'script',
    'style',
    'textarea',
    'input',
    'pre',
    'code',
    '[contenteditable="true"]',
    '.CodeMirror',
    '.diff',
    '.diff-line-code',
    '.blob-code',
    '.cm-editor'
  ].join(','))
}

const shouldSkipInternalAttributeI18n = (element: Element | null): boolean => {
  if (!element) return true
  return !!element.closest([
    'script',
    'style',
    'pre',
    'code',
    '[contenteditable="true"]',
    '.CodeMirror',
    '.diff',
    '.diff-line-code',
    '.blob-code',
    '.cm-editor'
  ].join(','))
}

const translateDynamicText = (value: string): string | null => {
  if (currentLanguage === 'en') return value
  const dictionary = currentInternalText

  if (value === 'Last fetched') {
    return dictionary['Last fetched'] ?? value
  }

  let match = value.match(/^(.+)\s+menu or$/)
  if (match) {
    const suffix = dictionary['menu or'] ?? 'menu or'
    return `${match[1]} ${suffix}`
  }

  if (value === 'just now') {
    return dictionary['just now'] ?? value
  }

  match = value.match(/^(\d+)\s+(second|minute|hour|day|month|year)s?\s+ago$/)
  if (match) {
    return (
      formatLocalizedRelativeTime(
        -Number(match[1]),
        match[2] as Intl.RelativeTimeFormatUnit
      ) ?? value
    )
  }

  match = value.match(/^in\s+(\d+)\s+(second|minute|hour|day|month|year)s?$/)
  if (match) {
    return (
      formatLocalizedRelativeTime(
        Number(match[1]),
        match[2] as Intl.RelativeTimeFormatUnit
      ) ?? value
    )
  }

  const relativeAliases: Record<string, readonly [number, Intl.RelativeTimeFormatUnit]> = {
    yesterday: [-1, 'day'],
    tomorrow: [1, 'day'],
    'last month': [-1, 'month'],
    'next month': [1, 'month'],
    'last year': [-1, 'year'],
    'next year': [1, 'year']
  }
  const relativeAlias = relativeAliases[value]
  if (relativeAlias) {
    return formatLocalizedRelativeTime(relativeAlias[0], relativeAlias[1]) ?? value
  }

  match = value.match(/^(\d+)\s+changed files?$/)
  if (match) {
    return `${match[1]} ${dictionary[Number(match[1]) === 1 ? 'changed file' : 'changed files'] ?? 'changed files'}`
  }

  match = value.match(/^(\d+)\s+added lines?$/)
  if (match) {
    return `${match[1]} ${dictionary['added lines'] ?? 'added lines'}`
  }

  match = value.match(/^(\d+)\s+removed lines?$/)
  if (match) {
    return `${match[1]} ${dictionary['removed lines'] ?? 'removed lines'}`
  }

  match = value.match(
    /^(Included in commit|Excluded from commit|New files|Modified files|Deleted files) \((\d+)\)$/
  )
  if (match) {
    const translatedLabel = dictionary[match[1]] ?? match[1]
    return `${translatedLabel} (${match[2]})`
  }

  match = value.match(/^Last fetched (.+) ago$/)
  if (match) {
    const tail = match[1]
    switch (currentLanguage) {
      case 'zh-CN':
        return `上次获取于 ${tail} 前`
      case 'zh-TW':
        return `上次擷取於 ${tail} 前`
      case 'ja':
        return `最終フェッチ: ${tail}前`
      case 'ko':
        return `마지막 가져오기: ${tail} 전`
      case 'de':
        return `Zuletzt vor ${tail} abgerufen`
      case 'es':
        return `Última obtención hace ${tail}`
      case 'fr':
        return `Dernière récupération il y a ${tail}`
      case 'it':
        return `Ultimo fetch ${tail} fa`
      case 'pt':
        return `Última busca há ${tail}`
      case 'tr':
        return `Son getirme ${tail} önce`
      default:
        return null
    }
  }

  match = value.match(/^View the files of your repository in (.+)$/)
  if (match) {
    switch (currentLanguage) {
      case 'zh-CN':
        return `在 ${match[1]} 中查看仓库文件`
      case 'zh-TW':
        return `在 ${match[1]} 中檢視存放庫檔案`
      case 'ja':
        return `${match[1]} でリポジトリのファイルを表示`
      case 'ko':
        return `${match[1]}에서 저장소 파일 보기`
      case 'de':
        return `Die Dateien Ihres Repositorys in ${match[1]} anzeigen`
      case 'es':
        return `Ver los archivos de tu repositorio en ${match[1]}`
      case 'fr':
        return `Afficher les fichiers de votre dépôt dans ${match[1]}`
      case 'it':
        return `Visualizza i file del repository in ${match[1]}`
      case 'pt':
        return `Ver os arquivos do seu repositório no ${match[1]}`
      case 'tr':
        return `Deponuzdaki dosyalari ${match[1]} içinde görüntüleyin`
      default:
        return null
    }
  }

  match = value.match(/^Commit to (.+)$/)
  if (match) {
    return `${dictionary['Commit to'] ?? 'Commit to'} ${match[1]}`
  }

  match = value.match(/^Clone (.+)$/)
  if (match) {
    switch (currentLanguage) {
      case 'zh-CN':
        return `克隆 ${match[1]}`
      case 'zh-TW':
        return `複製 ${match[1]}`
      case 'ja':
        return `${match[1]} をクローン`
      case 'ko':
        return `${match[1]} 클론`
      case 'de':
        return `${match[1]} klonen`
      case 'es':
        return `Clonar ${match[1]}`
      case 'fr':
        return `Cloner ${match[1]}`
      case 'it':
        return `Clona ${match[1]}`
      case 'pt':
        return `Clonar ${match[1]}`
      case 'tr':
        return `${match[1]} deposunu klonla`
      default:
        return null
    }
  }

  match = value.match(/^Rename (.+)$/)
  if (match) {
    switch (currentLanguage) {
      case 'zh-CN':
        return `重命名 ${match[1]}`
      case 'zh-TW':
        return `重新命名 ${match[1]}`
      case 'ja':
        return `${match[1]} の名前を変更`
      case 'ko':
        return `${match[1]} 이름 변경`
      case 'de':
        return `${match[1]} umbenennen`
      case 'es':
        return `Renombrar ${match[1]}`
      case 'fr':
        return `Renommer ${match[1]}`
      case 'it':
        return `Rinomina ${match[1]}`
      case 'pt':
        return `Renomear ${match[1]}`
      case 'tr':
        return `${match[1]} öğesini yeniden adlandır`
      default:
        return null
    }
  }

  match = value.match(/^Choose a branch to merge into (.+)$/)
  if (match) {
    const prefix =
      dictionary['Choose a branch to merge into'] ??
      'Choose a branch to merge into'
    switch (currentLanguage) {
      case 'ja':
        return `${match[1]} にマージするブランチを選択`
      case 'ko':
        return `${match[1]}에 병합할 브랜치 선택`
      default:
        return `${prefix} ${match[1]}`
    }
  }

  match = value.match(
    /^The compared branch \((.+)\) is up to date with your branch$/
  )
  if (match) {
    switch (currentLanguage) {
      case 'zh-CN':
        return `比较的分支（${match[1]}）与当前分支已保持最新`
      case 'zh-TW':
        return `比較的分支（${match[1]}）與目前分支已保持最新`
      case 'ja':
        return `比較対象のブランチ（${match[1]}）は現在のブランチと同じ状態です`
      case 'ko':
        return `비교 중인 브랜치(${match[1]})는 현재 브랜치와 동일한 최신 상태입니다`
      case 'de':
        return `Der verglichene Branch (${match[1]}) ist mit Ihrem Branch auf dem neuesten Stand`
      case 'es':
        return `La rama comparada (${match[1]}) esta actualizada con tu rama`
      case 'fr':
        return `La branche comparee (${match[1]}) est a jour avec votre branche`
      case 'it':
        return `Il branch confrontato (${match[1]}) e aggiornato con il tuo branch`
      case 'pt':
        return `A branch comparada (${match[1]}) esta atualizada com a sua branch`
      case 'tr':
        return `Karsilastirilan dal (${match[1]}) mevcut dalinizla guncel durumda`
      default:
        return null
    }
  }

  match = value.match(
    /^Your branch is up to date with the compared branch \((.+)\)$/
  )
  if (match) {
    switch (currentLanguage) {
      case 'zh-CN':
        return `当前分支与比较的分支（${match[1]}）已保持最新`
      case 'zh-TW':
        return `目前分支與比較的分支（${match[1]}）已保持最新`
      case 'ja':
        return `現在のブランチは比較対象のブランチ（${match[1]}）と同じ状態です`
      case 'ko':
        return `현재 브랜치는 비교 중인 브랜치(${match[1]})와 동일한 최신 상태입니다`
      case 'de':
        return `Ihr Branch ist mit dem verglichenen Branch (${match[1]}) auf dem neuesten Stand`
      case 'es':
        return `Tu rama esta actualizada con la rama comparada (${match[1]})`
      case 'fr':
        return `Votre branche est a jour avec la branche comparee (${match[1]})`
      case 'it':
        return `Il tuo branch e aggiornato con il branch confrontato (${match[1]})`
      case 'pt':
        return `Sua branch esta atualizada com a branch comparada (${match[1]})`
      case 'tr':
        return `Mevcut daliniz, karsilastirilan dal (${match[1]}) ile guncel durumda`
      default:
        return null
    }
  }

  match = value.match(/^Are you sure you want to discard all (\d+) changed files\?$/)
  if (match) {
    switch (currentLanguage) {
      case 'zh-CN':
        return `确定要丢弃全部 ${match[1]} 个已更改文件吗？`
      case 'zh-TW':
        return `確定要捨棄全部 ${match[1]} 個已變更檔案嗎？`
      case 'ja':
        return `${match[1]} 個の変更済みファイルをすべて破棄しますか？`
      case 'ko':
        return `변경된 파일 ${match[1]}개를 모두 삭제하시겠습니까?`
      case 'de':
        return `Möchten Sie wirklich alle ${match[1]} geänderten Dateien verwerfen?`
      case 'es':
        return `¿Seguro que quieres descartar los ${match[1]} archivos modificados?`
      case 'fr':
        return `Voulez-vous vraiment abandonner les ${match[1]} fichiers modifiés ?`
      case 'it':
        return `Vuoi davvero eliminare tutti i ${match[1]} file modificati?`
      case 'pt':
        return `Tem certeza de que deseja descartar todos os ${match[1]} arquivos alterados?`
      case 'tr':
        return `${match[1]} değiştirilmiş dosyanın tümünü silmek istediğinizden emin misiniz?`
      default:
        return null
    }
  }

  match = value.match(/^(Commit|Amend|Committing|Amending)\s+(.+)\s+to\s+(.+)$/)
  if (match) {
    const verb = dictionary[match[1]] ?? match[1]
    return `${verb} ${match[2]} ${dictionary['Commit to'] ?? 'Commit to'} ${match[3]}`
  }

  match = value.match(/^A branch named (.+) already exists\.$/)
  if (match) {
    switch (currentLanguage) {
      case 'zh-CN':
        return `名为 ${match[1]} 的分支已存在。`
      case 'zh-TW':
        return `名稱為 ${match[1]} 的分支已存在。`
      case 'ja':
        return `${match[1]} という名前のブランチは既に存在します。`
      case 'ko':
        return `${match[1]} 이름의 브랜치가 이미 존재합니다.`
      case 'de':
        return `Ein Branch mit dem Namen ${match[1]} existiert bereits.`
      case 'es':
        return `Ya existe una rama llamada ${match[1]}.`
      case 'fr':
        return `Une branche nommée ${match[1]} existe déjà.`
      case 'it':
        return `Esiste già un branch chiamato ${match[1]}.`
      case 'pt':
        return `Já existe uma branch chamada ${match[1]}.`
      case 'tr':
        return `${match[1]} adında bir dal zaten var.`
      default:
        return null
    }
  }

  match = value.match(/^Discard (\d+) Selected Changes$/)
  if (match) {
    switch (currentLanguage) {
      case 'zh-CN':
        return `放弃所选的 ${match[1]} 处变更`
      case 'zh-TW':
        return `捨棄所選的 ${match[1]} 項變更`
      case 'ja':
        return `選択した ${match[1]} 件の変更を破棄`
      case 'ko':
        return `선택한 변경 ${match[1]}개 버리기`
      case 'de':
        return `${match[1]} ausgewählte Änderungen verwerfen`
      case 'es':
        return `Descartar ${match[1]} cambios seleccionados`
      case 'fr':
        return `Abandonner ${match[1]} changements sélectionnés`
      case 'it':
        return `Scarta ${match[1]} modifiche selezionate`
      case 'pt':
        return `Descartar ${match[1]} alterações selecionadas`
      case 'tr':
        return `Seçili ${match[1]} değişikliği at`
      default:
        return null
    }
  }

  match = value.match(/^Discard (\d+) selected changes$/)
  if (match) {
    switch (currentLanguage) {
      case 'zh-CN':
        return `放弃所选的 ${match[1]} 处变更`
      case 'zh-TW':
        return `捨棄所選的 ${match[1]} 項變更`
      case 'ja':
        return `選択した ${match[1]} 件の変更を破棄`
      case 'ko':
        return `선택한 변경 ${match[1]}개 버리기`
      case 'de':
        return `${match[1]} ausgewählte Änderungen verwerfen`
      case 'es':
        return `Descartar ${match[1]} cambios seleccionados`
      case 'fr':
        return `Abandonner ${match[1]} changements sélectionnés`
      case 'it':
        return `Scarta ${match[1]} modifiche selezionate`
      case 'pt':
        return `Descartar ${match[1]} alterações selecionadas`
      case 'tr':
        return `Seçili ${match[1]} değişikliği at`
      default:
        return null
    }
  }

  match = value.match(/^Ignore (\d+) Selected Files \(Add to \.gitignore\)$/)
  if (match) {
    switch (currentLanguage) {
      case 'zh-CN':
        return `忽略所选的 ${match[1]} 个文件（添加到 .gitignore）`
      case 'zh-TW':
        return `忽略所選的 ${match[1]} 個檔案（加入 .gitignore）`
      case 'ja':
        return `選択した ${match[1]} 個のファイルを無視（.gitignore に追加）`
      case 'ko':
        return `선택한 파일 ${match[1]}개 무시 (.gitignore에 추가)`
      case 'de':
        return `${match[1]} ausgewählte Dateien ignorieren (.gitignore hinzufügen)`
      case 'es':
        return `Ignorar ${match[1]} archivos seleccionados (añadir a .gitignore)`
      case 'fr':
        return `Ignorer ${match[1]} fichiers sélectionnés (ajouter à .gitignore)`
      case 'it':
        return `Ignora ${match[1]} file selezionati (aggiungi a .gitignore)`
      case 'pt':
        return `Ignorar ${match[1]} arquivos selecionados (adicionar ao .gitignore)`
      case 'tr':
        return `Seçili ${match[1]} dosyayı yoksay (.gitignore'a ekle)`
      default:
        return null
    }
  }

  match = value.match(/^Ignore (\d+) selected files \(add to \.gitignore\)$/)
  if (match) {
    switch (currentLanguage) {
      case 'zh-CN':
        return `忽略所选的 ${match[1]} 个文件（添加到 .gitignore）`
      case 'zh-TW':
        return `忽略所選的 ${match[1]} 個檔案（加入 .gitignore）`
      case 'ja':
        return `選択した ${match[1]} 個のファイルを無視（.gitignore に追加）`
      case 'ko':
        return `선택한 파일 ${match[1]}개 무시 (.gitignore에 추가)`
      case 'de':
        return `${match[1]} ausgewählte Dateien ignorieren (.gitignore hinzufügen)`
      case 'es':
        return `Ignorar ${match[1]} archivos seleccionados (añadir a .gitignore)`
      case 'fr':
        return `Ignorer ${match[1]} fichiers sélectionnés (ajouter à .gitignore)`
      case 'it':
        return `Ignora ${match[1]} file selezionati (aggiungi a .gitignore)`
      case 'pt':
        return `Ignorar ${match[1]} arquivos selecionados (adicionar ao .gitignore)`
      case 'tr':
        return `Seçili ${match[1]} dosyayı yoksay (.gitignore'a ekle)`
      default:
        return null
    }
  }

  match = value.match(/^Ignore All (.+) Files \(Add to \.gitignore\)$/)
  if (match) {
    switch (currentLanguage) {
      case 'zh-CN':
        return `忽略所有 ${match[1]} 文件（添加到 .gitignore）`
      case 'zh-TW':
        return `忽略所有 ${match[1]} 檔案（加入 .gitignore）`
      case 'ja':
        return `すべての ${match[1]} ファイルを無視（.gitignore に追加）`
      case 'ko':
        return `모든 ${match[1]} 파일 무시 (.gitignore에 추가)`
      case 'de':
        return `Alle ${match[1]}-Dateien ignorieren (.gitignore hinzufügen)`
      case 'es':
        return `Ignorar todos los archivos ${match[1]} (añadir a .gitignore)`
      case 'fr':
        return `Ignorer tous les fichiers ${match[1]} (ajouter à .gitignore)`
      case 'it':
        return `Ignora tutti i file ${match[1]} (aggiungi a .gitignore)`
      case 'pt':
        return `Ignorar todos os arquivos ${match[1]} (adicionar ao .gitignore)`
      case 'tr':
        return `Tüm ${match[1]} dosyalarını yoksay (.gitignore'a ekle)`
      default:
        return null
    }
  }

  match = value.match(/^Ignore all (.+) files \(add to \.gitignore\)$/)
  if (match) {
    switch (currentLanguage) {
      case 'zh-CN':
        return `忽略所有 ${match[1]} 文件（添加到 .gitignore）`
      case 'zh-TW':
        return `忽略所有 ${match[1]} 檔案（加入 .gitignore）`
      case 'ja':
        return `すべての ${match[1]} ファイルを無視（.gitignore に追加）`
      case 'ko':
        return `모든 ${match[1]} 파일 무시 (.gitignore에 추가)`
      case 'de':
        return `Alle ${match[1]}-Dateien ignorieren (.gitignore hinzufügen)`
      case 'es':
        return `Ignorar todos los archivos ${match[1]} (añadir a .gitignore)`
      case 'fr':
        return `Ignorer tous les fichiers ${match[1]} (ajouter à .gitignore)`
      case 'it':
        return `Ignora tutti i file ${match[1]} (aggiungi a .gitignore)`
      case 'pt':
        return `Ignorar todos os arquivos ${match[1]} (adicionar ao .gitignore)`
      case 'tr':
        return `Tüm ${match[1]} dosyalarını yoksay (.gitignore'a ekle)`
      default:
        return null
    }
  }

  return null
}

const translateInternalValue = (value: string): string => {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return value
  if (currentLanguage === 'en') return value

  const dictionary = currentInternalText
  const translated = dictionary[normalized] ?? translateDynamicText(normalized)
  if (!translated || translated === normalized) return value

  const leading = value.match(/^\s*/)?.[0] ?? ''
  const trailing = value.match(/\s*$/)?.[0] ?? ''
  return `${leading}${translated}${trailing}`
}

const translateTextNode = (node: Text): void => {
  const parent = node.parentElement
  if (shouldSkipInternalI18n(parent)) return

  const current = node.nodeValue ?? ''
  let state = internalTextNodes.get(node)
  if (!state) {
    state = {
      original: current,
      lastTranslated: current
    }
    internalTextNodes.set(node, state)
  } else if (current !== state.original && current !== state.lastTranslated) {
    state.original = current
    state.lastTranslated = current
  }

  const translated = translateInternalValue(state.original)
  state.lastTranslated = translated
  if (node.nodeValue !== translated) {
    node.nodeValue = translated
  }
}

const translateElementAttributes = (element: Element): void => {
  if (shouldSkipInternalAttributeI18n(element)) return

  for (const attribute of TRANSLATABLE_ATTRIBUTES) {
    const originalAttribute = `${ORIGINAL_ATTRIBUTE_PREFIX}${attribute}`
    const lastTranslatedAttribute = `${LAST_TRANSLATED_ATTRIBUTE_PREFIX}${attribute}`
    const current = element.getAttribute(attribute)
    if (!current) continue

    if (!element.hasAttribute(originalAttribute)) {
      element.setAttribute(originalAttribute, current)
    }
    if (!element.hasAttribute(lastTranslatedAttribute)) {
      element.setAttribute(lastTranslatedAttribute, current)
    }

    let original = element.getAttribute(originalAttribute)
    if (!original) continue
    const lastTranslated = element.getAttribute(lastTranslatedAttribute) ?? current
    if (current !== original && current !== lastTranslated) {
      original = current
      element.setAttribute(originalAttribute, original)
      element.setAttribute(lastTranslatedAttribute, current)
    }

    const translated = translateInternalValue(original)
    element.setAttribute(lastTranslatedAttribute, translated)
    if (current !== translated) {
      element.setAttribute(attribute, translated)
    }
  }
}

const translateInternalTree = (root: ParentNode): void => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text)
  }
  textNodes.forEach(translateTextNode)

  if (root instanceof Element) {
    translateElementAttributes(root)
  }
  root.querySelectorAll?.('*').forEach(translateElementAttributes)
}

const applyInternalI18n = (): void => {
  translateInternalTree(document.body)
}

const ensureInternalI18nObserver = (): void => {
  if (document.documentElement.getAttribute(INTERNAL_I18N_OBSERVER_ID)) {
    applyInternalI18n()
    return
  }

  document.documentElement.setAttribute(INTERNAL_I18N_OBSERVER_ID, 'true')
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData' && record.target instanceof Text) {
        translateTextNode(record.target)
      }
      for (const node of Array.from(record.addedNodes)) {
        if (node instanceof Text) {
          translateTextNode(node)
        } else if (node instanceof Element) {
          translateInternalTree(node)
        }
      }
    }
  })
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  })
  applyInternalI18n()
}

const createActionButton = (
  key: ActionKey,
  title: string,
  icon: string,
  onClick: (button: HTMLButtonElement) => void | Promise<void>
): HTMLButtonElement => {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'marknotepro-desktop-action'
  button.dataset.localeKey = String(key)
  button.title = title
  button.setAttribute('aria-label', title)
  button.innerHTML = icon
  button.addEventListener('click', () => {
    void onClick(button)
  })
  return button
}

const updateActionButtonLocales = (): void => {
  const container = document.getElementById(ACTIONS_ID)
  if (!container) return

  container.querySelectorAll<HTMLButtonElement>('.marknotepro-desktop-action').forEach(button => {
    const key = button.dataset.localeKey as ActionKey | undefined
    if (!key) return

    const title = t(key)
    button.title = title
    button.setAttribute('aria-label', title)
  })
}

const ensureMarkNoteProActions = (): void => {
  if (document.getElementById(ACTIONS_ID)) {
    updateActionButtonLocales()
    return
  }

  const container = document.createElement('div')
  container.id = ACTIONS_ID
  container.className = 'marknotepro-desktop-actions'

  container.appendChild(createActionButton('setWorkspace', t('setWorkspace'), workspaceIcon, async button => {
    button.disabled = true
    try {
      await ipcRenderer.invoke('mt::github-desktop::choose-workspace-from-current-repository')
    } finally {
      button.disabled = false
    }
  }))

  container.appendChild(createActionButton('note', t('note'), noteIcon, () => {
    ipcRenderer.send('mt::github-desktop::switch-to-note')
  }))

  document.body.appendChild(container)
}

const applyMarkNoteProTheme = (payload: MarkNoteProThemePayload): void => {
  ensureMarkNoteProActions()
  ensureAppMenuButtonObserver()
  ensureInternalI18nObserver()
  document.body.classList.add('marknotepro-theme-adapted')
  document.body.classList.toggle('marknotepro-theme-dark', payload.isDark)
  document.body.classList.toggle('marknotepro-theme-light', !payload.isDark)
  document.body.classList.toggle('theme-dark', payload.isDark)
  document.body.classList.toggle('theme-light', !payload.isDark)
  document.documentElement.style.colorScheme = payload.isDark ? 'dark' : 'light'
  document.documentElement.dataset.marknoteproTheme = payload.theme

  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.appendChild(style)
  }
  style.textContent = getAdapterCss(payload)
}

const applyMarkNoteProLocale = (payload: MarkNoteProLocalePayload): void => {
  currentLanguage = normalizeLanguage(payload.language)
  currentActions = {
    ...currentActions,
    ...(payload.actions ?? {})
  }
  currentInternalText = payload.internalText ?? {}
  document.documentElement.dataset.marknoteproLanguage = currentLanguage
  updateActionButtonLocales()
  syncAppMenuButtons()
  applyInternalI18n()
  window.setTimeout(applyInternalI18n, 100)
  window.setTimeout(applyInternalI18n, 350)
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => applyInternalI18n())
  })
}

export const installMarkNoteProThemeAdapter = (): void => {
  ipcRenderer.on('marknotepro-theme-updated', (_event, payload: MarkNoteProThemePayload) => {
    applyMarkNoteProTheme(payload)
    window.setTimeout(() => applyMarkNoteProTheme(payload), 100)
    window.setTimeout(() => applyMarkNoteProTheme(payload), 500)
  })

  ipcRenderer.on('marknotepro-locale-updated', (_event, payload: MarkNoteProLocalePayload) => {
    applyMarkNoteProLocale(payload)
  })
}
