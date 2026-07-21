import * as ipcRenderer from '../lib/ipc-renderer'

interface MarkNoteProThemePayload {
  readonly theme: string
  readonly isDark: boolean
  readonly colors: Record<string, string>
}

interface MarkNoteProLocalePayload {
  readonly language: string
}

const STYLE_ID = 'marknotepro-github-desktop-theme'
const ACTIONS_ID = 'marknotepro-github-desktop-actions'
const MENU_OBSERVER_ID = 'marknotepro-menu-observer-installed'

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

const localeText: Record<SupportedLanguage, {
  readonly note: string
  readonly setWorkspace: string
}> = {
  de: {
    note: 'Notizen',
    setWorkspace: 'Aktuelles Repository als Notiz-Arbeitsbereich festlegen'
  },
  en: {
    note: 'Notes',
    setWorkspace: 'Set current repository as notes workspace'
  },
  es: {
    note: 'Notas',
    setWorkspace: 'Usar el repositorio actual como espacio de notas'
  },
  fr: {
    note: 'Notes',
    setWorkspace: 'Utiliser le depot actuel comme espace de notes'
  },
  it: {
    note: 'Note',
    setWorkspace: 'Usa il repository corrente come area note'
  },
  ja: {
    note: 'ノート',
    setWorkspace: '現在のリポジトリをノート作業領域に設定'
  },
  ko: {
    note: '노트',
    setWorkspace: '현재 저장소를 노트 작업 영역으로 설정'
  },
  pt: {
    note: 'Notas',
    setWorkspace: 'Usar o repositorio atual como area de notas'
  },
  tr: {
    note: 'Notlar',
    setWorkspace: 'Gecerli depoyu not calisma alani yap'
  },
  'zh-CN': {
    note: '笔记',
    setWorkspace: '设为笔记工作区'
  },
  'zh-TW': {
    note: '筆記',
    setWorkspace: '設為筆記工作區'
  }
}

let currentLanguage: SupportedLanguage = 'zh-CN'

const normalizeLanguage = (language: string | undefined): SupportedLanguage => {
  if (language && SUPPORTED_LANGUAGES.includes(language as SupportedLanguage)) {
    return language as SupportedLanguage
  }
  return 'en'
}

const t = (key: keyof typeof localeText.en): string => localeText[currentLanguage][key]

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
  z-index: 9998;
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
  z-index: 10000;
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
  z-index: 10000;
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

const createActionButton = (
  key: keyof typeof localeText.en,
  title: string,
  icon: string,
  onClick: (button: HTMLButtonElement) => void | Promise<void>
): HTMLButtonElement => {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'marknotepro-desktop-action'
  button.dataset.localeKey = key
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
    const key = button.dataset.localeKey as keyof typeof localeText.en | undefined
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
  document.documentElement.dataset.marknoteproLanguage = currentLanguage
  updateActionButtonLocales()
  syncAppMenuButtons()
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
