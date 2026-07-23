import { loadTranslations, type Translations } from '../../common/i18n'
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from '../../shared/i18n'
import type {
  GitHubDesktopActionTranslations,
  GitHubDesktopDialogTranslations,
  GitHubDesktopLocalePayload
} from '../../shared/types/ipc'

interface GitHubDesktopLocaleData {
  language: string
  ui: {
    actions: GitHubDesktopActionTranslations
    internalText: Record<string, string>
  }
  menu: {
    root: Record<string, string>
    dialogs: GitHubDesktopDialogTranslations
  }
}

const DEFAULT_ACTIONS: GitHubDesktopActionTranslations = {
  note: 'Notes',
  setWorkspace: 'Set current repository as notes workspace'
}

const DEFAULT_DIALOGS: GitHubDesktopDialogTranslations = {
  selectRepositoryFirst: 'Please select a Git repository first.',
  ok: 'OK',
  setWorkspaceTitle: 'Set notes workspace',
  setWorkspaceDetail:
    'This will switch the notes directory. By default the current Git project root is used, or you can choose a subdirectory inside the project.',
  useRepositoryRoot: 'Use repository root',
  selectSubdirectory: 'Select subdirectory',
  cancel: 'Cancel',
  selectRepositorySubdirectory: 'Please select a subdirectory inside the current Git project.'
}

const localeCache = new Map<string, GitHubDesktopLocaleData>()

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const isStringRecord = (value: unknown): value is Record<string, string> =>
  isRecord(value) && Object.values(value).every(item => typeof item === 'string')

const normalizeLanguage = (language: string | null | undefined): string => {
  if (language && SUPPORTED_LANGUAGES.includes(language)) {
    return language
  }
  return DEFAULT_LANGUAGE
}

const readLocaleData = (language: string): GitHubDesktopLocaleData => {
  const normalized = normalizeLanguage(language)
  const cached = localeCache.get(normalized)
  if (cached) {
    return cached
  }

  const source = loadTranslations(normalized) ?? loadTranslations('en') ?? {}
  const fallback = loadTranslations('en') ?? {}

  const localeData = buildLocaleData(normalized, source, fallback)
  localeCache.set(normalized, localeData)
  return localeData
}

const buildLocaleData = (
  language: string,
  source: Translations,
  fallback: Translations
): GitHubDesktopLocaleData => {
  const sourceGithubDesktop = isRecord(source.githubDesktop) ? source.githubDesktop : {}
  const fallbackGithubDesktop = isRecord(fallback.githubDesktop) ? fallback.githubDesktop : {}

  const sourceUi = isRecord(sourceGithubDesktop.ui) ? sourceGithubDesktop.ui : {}
  const fallbackUi = isRecord(fallbackGithubDesktop.ui) ? fallbackGithubDesktop.ui : {}
  const sourceMenu = isRecord(sourceGithubDesktop.menu) ? sourceGithubDesktop.menu : {}
  const fallbackMenu = isRecord(fallbackGithubDesktop.menu) ? fallbackGithubDesktop.menu : {}

  const sourceActions = isRecord(sourceUi.actions) ? sourceUi.actions : {}
  const fallbackActions = isRecord(fallbackUi.actions) ? fallbackUi.actions : {}
  const sourceInternalText = isRecord(sourceUi.internalText) ? sourceUi.internalText : {}
  const fallbackInternalText = isRecord(fallbackUi.internalText) ? fallbackUi.internalText : {}
  const sourceMenuRoot = isRecord(sourceMenu.root) ? sourceMenu.root : {}
  const fallbackMenuRoot = isRecord(fallbackMenu.root) ? fallbackMenu.root : {}
  const sourceDialogs = isRecord(sourceMenu.dialogs) ? sourceMenu.dialogs : {}
  const fallbackDialogs = isRecord(fallbackMenu.dialogs) ? fallbackMenu.dialogs : {}

  const actions = {
    ...DEFAULT_ACTIONS,
    ...(isStringRecord(fallbackActions) ? fallbackActions : {}),
    ...(isStringRecord(sourceActions) ? sourceActions : {})
  }

  const dialogs = {
    ...DEFAULT_DIALOGS,
    ...(isStringRecord(fallbackDialogs) ? fallbackDialogs : {}),
    ...(isStringRecord(sourceDialogs) ? sourceDialogs : {})
  }

  return {
    language,
    ui: {
      actions,
      internalText: {
        ...(isStringRecord(fallbackInternalText) ? fallbackInternalText : {}),
        ...(isStringRecord(sourceInternalText) ? sourceInternalText : {})
      }
    },
    menu: {
      root: {
        ...(isStringRecord(fallbackMenuRoot) ? fallbackMenuRoot : {}),
        ...(isStringRecord(sourceMenuRoot) ? sourceMenuRoot : {})
      },
      dialogs
    }
  }
}

export const clearGitHubDesktopLocaleCache = (): void => {
  localeCache.clear()
}

export const getGitHubDesktopLocalePayload = (
  language: string | null | undefined
): GitHubDesktopLocalePayload => {
  const localeData = readLocaleData(normalizeLanguage(language))
  return {
    language: localeData.language,
    actions: localeData.ui.actions,
    internalText: localeData.ui.internalText
  }
}

export const getGitHubDesktopMenuTranslations = (
  language: string | null | undefined
): Record<string, string> => {
  return readLocaleData(normalizeLanguage(language)).menu.root
}

export const getGitHubDesktopDialogText = (
  language: string | null | undefined
): GitHubDesktopDialogTranslations => {
  return readLocaleData(normalizeLanguage(language)).menu.dialogs
}

export const getNormalizedGitHubDesktopLanguage = (
  language: string | null | undefined
): string => normalizeLanguage(language)

export const normalizeMenuLabel = (label: string | null | undefined): string =>
  (label ?? '').replace(/&/g, '').replace(/\.\.\.$/, '').replace(/…$/, '')

export const findMenuTranslation = (
  normalizedLabel: string,
  translations: Record<string, string>
): string | undefined => {
  const normalizedLower = normalizedLabel.toLocaleLowerCase()

  for (const [source, translation] of Object.entries(translations)) {
    if (normalizeMenuLabel(source).toLocaleLowerCase() === normalizedLower) {
      return translation
    }
  }

  return undefined
}

export const buildOpenInTargetLabel = (
  language: string | null | undefined,
  target: string
): string | null => {
  switch (normalizeLanguage(language)) {
    case 'de':
      return `Öffnen in ${target}`
    case 'es':
      return `Abrir en ${target}`
    case 'fr':
      return `Ouvrir dans ${target}`
    case 'it':
      return `Apri in ${target}`
    case 'ja':
      return `${target} で開く`
    case 'ko':
      return `${target}에서 열기`
    case 'pt':
      return `Abrir em ${target}`
    case 'tr':
      return `${target} içinde aç`
    case 'zh-CN':
      return `在 ${target} 中打开`
    case 'zh-TW':
      return `在 ${target} 中開啟`
    default:
      return null
  }
}
