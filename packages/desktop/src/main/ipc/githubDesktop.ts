import path from 'path'
import fs from 'fs-extra'
import {
  app,
  BrowserView,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  session,
  shell,
  systemPreferences,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type OpenDialogOptions,
  type Rectangle
} from 'electron'
import keytar from 'keytar'
import log from 'electron-log'
import { resolveEmbeddedGitDir, resolveGitExecPath } from 'dugite'
import { parseAppURL } from '../../githubDesktop/upstream/src/lib/parse-app-url'
import type { URLActionType } from '../../githubDesktop/upstream/src/lib/parse-app-url'
import { buildDefaultMenu } from '../../githubDesktop/upstream/src/main-process/menu/build-default-menu'
import { buildContextMenu } from '../../githubDesktop/upstream/src/main-process/menu/build-context-menu'
import type { MenuEvent } from '../../githubDesktop/upstream/src/main-process/menu/menu-event'
import { buildSpellCheckMenu } from '../../githubDesktop/upstream/src/main-process/menu/build-spell-check-menu'
import type { MenuLabelsEvent } from '../../githubDesktop/upstream/src/models/menu-labels'
import { menuFromElectronMenu } from '../../githubDesktop/upstream/src/models/app-menu'
import type { IMenu, MenuItem } from '../../githubDesktop/upstream/src/models/app-menu'
import type { ISerializableMenuItem } from '../../githubDesktop/upstream/src/lib/menu-item'
import {
  buildOpenInTargetLabel,
  findMenuTranslation,
  getGitHubDesktopDialogText,
  getGitHubDesktopLocalePayload,
  getGitHubDesktopMenuTranslations,
  normalizeMenuLabel
} from '../../githubDesktop/i18n/locale'
import { SUPPORTED_LANGUAGES } from '../../shared/i18n'
import type {
  GitHubDesktopLocalePayload,
  GitHubDesktopShowOptions,
  GitHubDesktopThemePayload
} from '../../shared/types/ipc'
import {
  handleWindowZoomShortcut,
  setWindowZoomFactor,
  shouldIgnoreZoomChanged,
  zoomIn,
  zoomOut
} from '../windows/utils'

interface GitHubDesktopViewEntry {
  view: BrowserView
  loaded: boolean
  currentRepositoryPath: string | null
  currentThemePayload: GitHubDesktopThemePayload | null
  currentLocalePayload: GitHubDesktopLocalePayload | null
}

interface WorkspacePathRenamePayload {
  src: string
  dest: string
}

const views = new Map<number, GitHubDesktopViewEntry>()
const pendingWorkspacePathRenames = new Map<number, WorkspacePathRenamePayload[]>()
const pendingURLActions: URLActionType[] = []
let protocolsRegistered = false
let protocolHandlersRegistered = false
let currentMenuLabels: MenuLabelsEvent = {
  selectedShell: null,
  selectedExternalEditor: null,
  askForConfirmationOnForcePush: false,
  askForConfirmationOnRepositoryRemoval: false
}
let githubDesktopMenu = buildDefaultMenu(currentMenuLabels)
const GITHUB_DESKTOP_THEME_CHANNEL = 'marknotepro-theme-updated'
const GITHUB_DESKTOP_LOCALE_CHANNEL = 'marknotepro-locale-updated'

const githubDesktopProtocols = [
  'x-github-client',
  'x-github-desktop-dev-auth',
  'x-github-desktop-auth',
  process.platform === 'darwin' ? 'github-mac' : 'github-windows'
].filter(Boolean)

const menuEventById: Record<string, MenuEvent> = {
  about: 'show-about',
  preferences: 'show-preferences',
  'install-cli': 'install-darwin-cli',
  'new-repository': 'create-repository',
  'add-local-repository': 'add-local-repository',
  'clone-repository': 'clone-repository',
  find: 'find-text',
  'show-changes': 'show-changes',
  'show-history': 'show-history',
  'show-repository-list': 'choose-repository',
  'show-branches-list': 'show-branches',
  'show-worktrees-list': 'show-worktrees',
  'go-to-commit-message': 'go-to-commit-message',
  'toggle-changes-filter': 'toggle-changes-filter',
  'increase-active-resizable-width': 'increase-active-resizable-width',
  'decrease-active-resizable-width': 'decrease-active-resizable-width',
  pull: 'pull',
  fetch: 'fetch',
  'remove-repository': 'remove-repository',
  'view-repository-on-github': 'view-repository-on-github',
  'open-in-shell': 'open-in-shell',
  'open-working-directory': 'open-working-directory',
  'open-external-editor': 'open-external-editor',
  'open-with-external-editor': 'open-with-external-editor',
  'create-issue-in-repository-on-github': 'create-issue-in-repository-on-github',
  'create-worktree': 'create-worktree',
  'show-repository-settings': 'show-repository-settings',
  'create-branch': 'create-branch',
  'rename-branch': 'rename-branch',
  'delete-branch': 'delete-branch',
  'discard-all-changes': 'discard-all-changes',
  'stash-all-changes': 'stash-all-changes',
  'update-branch-with-contribution-target-branch': 'update-branch-with-contribution-target-branch',
  'compare-to-branch': 'compare-to-branch',
  'merge-branch': 'merge-branch',
  'squash-and-merge-branch': 'squash-and-merge-branch',
  'rebase-branch': 'rebase-branch',
  'compare-on-github': 'compare-on-github',
  'branch-on-github': 'branch-on-github',
  'preview-pull-request': 'preview-pull-request',
  'create-pull-request': 'open-pull-request'
}

const allGitHubDesktopMenuTranslations = SUPPORTED_LANGUAGES.map(language =>
  getGitHubDesktopMenuTranslations(language)
)

const getDialogText = getGitHubDesktopDialogText

const normalizeMenuLabelKey = (label: string | null | undefined): string =>
  normalizeMenuLabel(label).toLocaleLowerCase()

const translateMenuLabel = (
  label: string | null | undefined,
  translations: Record<string, string>,
  language: string | null | undefined
): string | undefined => {
  if (!label) return label ?? undefined

  const normalized = normalizeMenuLabel(label)
  const normalizedLower = normalized.toLocaleLowerCase()
  const exact = findMenuTranslation(normalized, translations)
  if (exact) return exact

  if (normalizedLower === 'show toggle changes filter') {
    return findMenuTranslation('Show Changes Filter', translations) ?? label
  }

  if (normalizedLower === 'hide toggle changes filter') {
    return findMenuTranslation('Hide Changes Filter', translations) ?? label
  }

  if (normalizedLower.startsWith('delete tag ')) {
    const tagName = normalized.slice('Delete tag '.length)
    const prefix = findMenuTranslation('Delete tag', translations)
    if (prefix) {
      return prefix.replace(/…$/, ` ${tagName}`)
    }
  }

  if (normalized.toLocaleLowerCase().startsWith('open in ')) {
    const target = normalized.slice('Open in '.length)
    return buildOpenInTargetLabel(language, target) ?? label
  }

  return label
}

const localizeSerializedMenuItems = (
  items: ReadonlyArray<ISerializableMenuItem>,
  translations: Record<string, string>,
  language: string | null | undefined
): ReadonlyArray<ISerializableMenuItem> => {
  return items.map(item => ({
    ...item,
    label: translateMenuLabel(item.label, translations, language),
    submenu: item.submenu ? localizeSerializedMenuItems(item.submenu, translations, language) : undefined
  }))
}

const localizeElectronMenuItems = (
  items: Electron.MenuItem[],
  translations: Record<string, string>,
  language: string | null | undefined
): void => {
  for (const item of items) {
    if (item.type !== 'separator') {
      const translatedLabel = translateMenuLabel(item.label, translations, language)
      if (translatedLabel && translatedLabel !== item.label) {
        item.label = translatedLabel
      }
    }

    if (item.submenu) {
      localizeElectronMenuItems(item.submenu.items, translations, language)
    }
  }
}

const serializedMacOSServicesLabels = new Set([
  'Services',
  ...allGitHubDesktopMenuTranslations.map(translations => translations.Services)
].map(normalizeMenuLabelKey))

const permanentlyHiddenMenuItemIds = new Set([
  'about'
])

const localizedHiddenMenuLabels = [
  ...allGitHubDesktopMenuTranslations.flatMap(translations => [
    translations['About GitHub Desktop'],
    translations.Services,
    translations['Hide marknotepro'],
    translations['Hide Others'],
    translations['Show All'],
    translations['Quit marknotepro'],
    translations.Exit
  ])
].filter(Boolean) as string[]

const permanentlyHiddenMenuLabels = new Set([
  'About GitHub Desktop',
  'Services',
  'Hide MarkNotePro',
  'Hide marknotepro',
  'Hide Others',
  'Show All',
  'Quit MarkNotePro',
  'Quit marknotepro',
  'Exit',
  'Toggle Full Screen',
  'Reset Zoom',
  'Zoom In',
  'Zoom Out',
  'Minimize',
  'Zoom',
  'Close',
  'Bring All to Front',
  'Report Issue',
  'Contact GitHub Support',
  'Show User Guides',
  'Show Keyboard Shortcuts'
].concat(localizedHiddenMenuLabels).map(normalizeMenuLabelKey))

const permanentlyHiddenTopLevelMenuLabels = new Set([
  'Window'
].map(normalizeMenuLabelKey))

const showLogsMenuLabels = new Set([
  'Show Logs in Finder',
  'Show logs in Explorer',
  'Show logs in your File Manager'
].map(normalizeMenuLabelKey))

const isShowLogsMenuItem = (item: MenuItem): boolean => {
  if (item.type === 'separator') return false
  return showLogsMenuLabels.has(normalizeMenuLabelKey(item.label))
}

const shouldHideSerializedMenuItem = (item: MenuItem, parentMenuId?: string): boolean => {
  if (item.type !== 'submenuItem') return false

  const isMacOSServicesMenu = serializedMacOSServicesLabels.has(normalizeMenuLabelKey(item.label))
  const hasVisibleAction = item.menu.items.some(menuItem =>
    menuItem.visible && menuItem.type !== 'separator'
  )

  if (isMacOSServicesMenu && !hasVisibleAction) return true

  if (parentMenuId === undefined) {
    return permanentlyHiddenTopLevelMenuLabels.has(normalizeMenuLabelKey(item.label))
  }

  return false
}

const shouldPermanentlyHideMenuItem = (item: MenuItem, parentMenuId?: string): boolean => {
  if (shouldHideSerializedMenuItem(item, parentMenuId)) return true
  if (permanentlyHiddenMenuItemIds.has(item.id)) return true
  if (item.type === 'separator') return false

  return permanentlyHiddenMenuLabels.has(normalizeMenuLabelKey(item.label))
}

const collapseMenuSeparators = (items: ReadonlyArray<MenuItem>): ReadonlyArray<MenuItem> => {
  const collapsed: MenuItem[] = []

  for (const item of items) {
    if (!item.visible) {
      collapsed.push(item)
      continue
    }

    if (item.type === 'separator') {
      const previous = collapsed[collapsed.length - 1]
      const previousVisible = previous && previous.visible
      if (!previous || !previousVisible || previous.type === 'separator') {
        collapsed.push({ ...item, visible: false })
        continue
      }
    }

    collapsed.push(item)
  }

  for (let index = collapsed.length - 1; index >= 0; index--) {
    const item = collapsed[index]
    if (!item.visible) continue
    if (item.type !== 'separator') break
    collapsed[index] = { ...item, visible: false }
  }

  return collapsed
}

const cloneMenuItemWithLocale = (
  item: MenuItem,
  translations: Record<string, string>,
  language: string | null | undefined,
  parentMenuId?: string
): MenuItem => {
  if (item.type === 'separator') return item

  const label = translateMenuLabel(item.label, translations, language) ?? item.label
  const visible = item.visible && !shouldPermanentlyHideMenuItem(item, parentMenuId)

  if (item.type === 'submenuItem') {
    return {
      ...item,
      label,
      visible,
      accessKey: null,
      menu: localizeAppMenu(item.menu, translations, language)
    }
  }

  return {
    ...item,
    label,
    visible,
    accessKey: null
  }
}

const findShowLogsMenuItem = (menu: IMenu): MenuItem | null => {
  for (const item of menu.items) {
    if (isShowLogsMenuItem(item)) return item
    if (item.type === 'submenuItem') {
      const found = findShowLogsMenuItem(item.menu)
      if (found) return found
    }
  }

  return null
}

const withShowLogsInViewMenu = (menu: IMenu): IMenu => {
  const showLogsItem = findShowLogsMenuItem(menu)
  if (!showLogsItem) return menu

  const items = menu.items.map(item => {
    if (item.type !== 'submenuItem' || normalizeMenuLabelKey(item.label) !== 'view') {
      return item
    }

    const alreadyHasShowLogs = item.menu.items.some(isShowLogsMenuItem)
    if (alreadyHasShowLogs) return item

    return {
      ...item,
      menu: {
        ...item.menu,
        items: [
          ...item.menu.items,
          {
            id: `${item.id}.marknotepro-show-logs-separator`,
            type: 'separator',
            visible: true
          },
          showLogsItem
        ]
      }
    }
  })

  return {
    ...menu,
    items: items as ReadonlyArray<MenuItem>
  }
}

const localizeAppMenu = (
  menu: IMenu,
  translations: Record<string, string>,
  language: string | null | undefined
): IMenu => {
  const selectedItem = menu.selectedItem
    ? cloneMenuItemWithLocale(menu.selectedItem, translations, language, menu.id)
    : undefined
  const items = collapseMenuSeparators(
    menu.items.map(item => cloneMenuItemWithLocale(item, translations, language, menu.id))
  )

  return {
    ...menu,
    selectedItem,
    items
  }
}

const getLocalizedAppMenu = (language: string | null | undefined): IMenu => {
  const menu = withShowLogsInViewMenu(menuFromElectronMenu(githubDesktopMenu))
  const translations = getGitHubDesktopMenuTranslations(language)
  return localizeAppMenu(menu, translations, language)
}

const sendAppMenu = (event: IpcMainEvent | IpcMainInvokeEvent): void => {
  const win = getWindowFromSender(event)
  const language = win ? views.get(win.id)?.currentLocalePayload?.language : null
  event.sender.send('app-menu', getLocalizedAppMenu(language))
}

const rebuildAppMenu = (): void => {
  githubDesktopMenu = buildDefaultMenu(currentMenuLabels)
}

const getMenuEventForId = (id: string): MenuEvent | null => {
  if (id === 'push') {
    return currentMenuLabels.isForcePushForCurrentRepository ? 'force-push' : 'push'
  }

  if (id === 'toggle-stashed-changes') {
    return currentMenuLabels.isStashedChangesVisible
      ? 'hide-stashed-changes'
      : 'show-stashed-changes'
  }

  return menuEventById[id] ?? null
}

const shouldBlockHiddenMenuExecution = (id: string): boolean => {
  const menuItem = githubDesktopMenu.getMenuItemById(id)
  if (!menuItem) return permanentlyHiddenMenuItemIds.has(id)

  const label = normalizeMenuLabelKey(menuItem.label)
  const role = (menuItem as unknown as { role?: string }).role

  return permanentlyHiddenMenuItemIds.has(id) ||
    permanentlyHiddenMenuLabels.has(label) ||
    role === 'quit' ||
    role === 'togglefullscreen' ||
    role === 'minimize' ||
    role === 'zoom' ||
    role === 'close' ||
    role === 'front'
}

const executeRoleMenuItem = (
  event: IpcMainEvent,
  role: string | undefined
): boolean => {
  switch (role) {
    case 'undo':
      event.sender.undo()
      return true
    case 'redo':
      event.sender.redo()
      return true
    case 'cut':
      event.sender.cut()
      return true
    case 'copy':
      event.sender.copy()
      return true
    case 'paste':
      event.sender.paste()
      return true
    case 'selectAll':
    case 'selectall':
      event.sender.selectAll()
      return true
    case 'togglefullscreen': {
      const win = getWindowFromSender(event)
      if (win) {
        win.setFullScreen(!win.isFullScreen())
        return true
      }
      return false
    }
    case 'minimize':
      getWindowFromSender(event)?.minimize()
      return true
    case 'zoom': {
      const win = getWindowFromSender(event)
      if (win?.isMaximized()) win.unmaximize()
      else win?.maximize()
      return true
    }
    case 'close':
      getWindowFromSender(event)?.close()
      return true
    case 'quit':
      app.quit()
      return true
    default:
      return false
  }
}

const getWindowFromSender = (
  event: IpcMainEvent | IpcMainInvokeEvent
): BrowserWindow | null => {
  const directWindow = BrowserWindow.fromWebContents(event.sender)
  if (directWindow) return directWindow

  for (const [windowId, entry] of views) {
    if (entry.view.webContents.id === event.sender.id) {
      return BrowserWindow.fromId(windowId)
    }
  }

  return null
}

const getGitHubDesktopIndexPath = (): string => {
  const devPath = path.join(process.cwd(), 'src', 'githubDesktop', 'out', 'index.html')
  if (fs.existsSync(devPath)) return devPath

  const resourcePath = path.join(
    process.resourcesPath,
    'githubDesktop',
    'out',
    'index.html'
  )
  if (fs.existsSync(resourcePath)) return resourcePath

  return path.join(__dirname, '..', 'githubDesktop', 'out', 'index.html')
}

const installGitHubDesktopZoomBridge = async (entry: GitHubDesktopViewEntry): Promise<void> => {
  if (entry.view.webContents.isDestroyed()) return

  try {
    await entry.view.webContents.executeJavaScript(`
      (() => {
        if (window.__marknoteproZoomBridgeInstalled) return
        window.__marknoteproZoomBridgeInstalled = true

        const { ipcRenderer } = require('electron')
        let lastGestureScale = 1
        const isMac = process.platform === 'darwin'
        const hasZoomModifier = event => isMac ? event.metaKey : event.ctrlKey
        const zoom = direction => ipcRenderer.send('mt::github-desktop::zoom-delta', direction)

        window.addEventListener('wheel', event => {
          if (!hasZoomModifier(event) && !event.ctrlKey) return
          event.preventDefault()
          zoom(event.deltaY < 0 ? 'in' : 'out')
        }, { capture: true, passive: false })

        window.addEventListener('gesturestart', event => {
          lastGestureScale = event.scale || 1
        })
        window.addEventListener('gesturechange', event => {
          const scale = event.scale || 1
          const diff = scale - lastGestureScale
          if (Math.abs(diff) < 0.03) return
          event.preventDefault()
          zoom(diff > 0 ? 'in' : 'out')
          lastGestureScale = scale
        })
      })()
    `)
  } catch (error) {
    log.warn('Failed to install GitHub Desktop zoom bridge:', error)
  }
}

const normalizeBounds = (bounds: Rectangle): Rectangle => ({
  x: Math.max(0, Math.floor(bounds.x || 0)),
  y: Math.max(0, Math.floor(bounds.y || 0)),
  width: Math.max(1, Math.floor(bounds.width || 1)),
  height: Math.max(1, Math.floor(bounds.height || 1))
})

const normalizeShowOptions = (options: GitHubDesktopShowOptions | Rectangle): GitHubDesktopShowOptions => {
  if ('bounds' in options) return options
  return { bounds: options }
}

const getShowZoomFactor = (win: BrowserWindow, options: GitHubDesktopShowOptions): number => {
  const zoomFactor = options.zoomFactor
  return typeof zoomFactor === 'number' && zoomFactor > 0
    ? zoomFactor
    : win.webContents.getZoomFactor()
}

const sendGitHubDesktopTheme = (
  entry: GitHubDesktopViewEntry,
  payload: GitHubDesktopThemePayload
): void => {
  if (!entry.view.webContents.isDestroyed()) {
    entry.view.webContents.send(GITHUB_DESKTOP_THEME_CHANNEL, payload)
  }
}

const sendGitHubDesktopLocale = (
  entry: GitHubDesktopViewEntry,
  payload: GitHubDesktopLocalePayload
): void => {
  if (!entry.view.webContents.isDestroyed()) {
    entry.view.webContents.send(GITHUB_DESKTOP_LOCALE_CHANNEL, payload)
    entry.view.webContents.send('app-menu', getLocalizedAppMenu(payload.language))
  }
}

const replayGitHubDesktopState = (entry: GitHubDesktopViewEntry): void => {
  const sendState = (): void => {
    if (entry.currentThemePayload) {
      sendGitHubDesktopTheme(entry, entry.currentThemePayload)
    }
    if (entry.currentLocalePayload) {
      sendGitHubDesktopLocale(entry, entry.currentLocalePayload)
    }
  }

  sendState()
  setTimeout(sendState, 100)
  setTimeout(sendState, 400)
}

const isChildPath = (parentPath: string, candidatePath: string): boolean => {
  const relativePath = path.relative(path.resolve(parentPath), path.resolve(candidatePath))
  return !!relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
}

const isWorkspacePathRenamePayload = (payload: unknown): payload is WorkspacePathRenamePayload => {
  if (!payload || typeof payload !== 'object') return false

  const { src, dest } = payload as Partial<WorkspacePathRenamePayload>
  return typeof src === 'string' && !!src && typeof dest === 'string' && !!dest
}

const normalizeComparablePath = (pathname: string): string => {
  const normalized = path.normalize(pathname)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

const isSameOrChildPath = (pathname: string, basePath: string): boolean => {
  const normalizedPathname = normalizeComparablePath(pathname)
  const normalizedBasePath = normalizeComparablePath(basePath)
  if (normalizedPathname === normalizedBasePath) return true

  const relativePath = path.relative(normalizedBasePath, normalizedPathname)
  return !!relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
}

const replacePathPrefix = (pathname: string, src: string, dest: string): string => {
  if (!isSameOrChildPath(pathname, src)) return pathname
  if (normalizeComparablePath(pathname) === normalizeComparablePath(src)) return path.normalize(dest)
  return path.join(dest, path.relative(src, pathname))
}

const sendWorkspacePathRename = (
  win: BrowserWindow,
  payload: WorkspacePathRenamePayload
): void => {
  if (!isWorkspacePathRenamePayload(payload) || normalizeComparablePath(payload.src) === normalizeComparablePath(payload.dest)) {
    return
  }

  const entry = views.get(win.id)
  if (!entry || entry.view.webContents.isDestroyed()) return

  if (!entry.loaded) {
    const pending = pendingWorkspacePathRenames.get(win.id) ?? []
    pending.push(payload)
    pendingWorkspacePathRenames.set(win.id, pending)
    return
  }

  if (entry.currentRepositoryPath && isSameOrChildPath(entry.currentRepositoryPath, payload.src)) {
    entry.currentRepositoryPath = replacePathPrefix(entry.currentRepositoryPath, payload.src, payload.dest)
  }
  entry.view.webContents.send('marknotepro-workspace-path-renamed', payload)
}

const flushWorkspacePathRenames = (win: BrowserWindow, entry: GitHubDesktopViewEntry): void => {
  if (entry.view.webContents.isDestroyed()) return

  const pending = pendingWorkspacePathRenames.get(win.id)
  if (!pending?.length) return

  pendingWorkspacePathRenames.delete(win.id)
  for (const payload of pending) {
    if (!isWorkspacePathRenamePayload(payload) || normalizeComparablePath(payload.src) === normalizeComparablePath(payload.dest)) {
      continue
    }

    if (entry.currentRepositoryPath && isSameOrChildPath(entry.currentRepositoryPath, payload.src)) {
      entry.currentRepositoryPath = replacePathPrefix(entry.currentRepositoryPath, payload.src, payload.dest)
    }
    entry.view.webContents.send('marknotepro-workspace-path-renamed', payload)
  }
}

const prependPathEntries = (entries: string[]): void => {
  const currentPath = process.env.PATH ?? process.env.Path ?? ''
  const currentEntries = currentPath.split(path.delimiter).filter(Boolean)
  const normalizedExisting = new Set(currentEntries.map(entry => path.normalize(entry)))
  const nextEntries = entries.filter(entry => fs.existsSync(entry) && !normalizedExisting.has(path.normalize(entry)))

  if (!nextEntries.length) return

  const nextPath = [...nextEntries, ...currentEntries].join(path.delimiter)
  process.env.PATH = nextPath
  if (process.platform === 'win32') {
    process.env.Path = nextPath
  }
}

const getWin32GitSubfolder = (): string => {
  if (process.arch === 'arm64') return 'clangarm64'
  if (process.arch === 'x64') return 'mingw64'
  return 'mingw32'
}

const getGitPathEntries = (gitDir: string, gitExecPath: string): string[] => {
  if (process.platform === 'win32') {
    const win32GitSubfolder = getWin32GitSubfolder()
    return [
      path.join(gitDir, 'cmd'),
      path.join(gitDir, win32GitSubfolder, 'bin'),
      path.join(gitDir, win32GitSubfolder, 'usr', 'bin'),
      gitExecPath
    ]
  }

  return [path.join(gitDir, 'bin'), gitExecPath]
}

const configureGitProcessEnvironment = (gitDir: string): void => {
  const gitExecPath = resolveGitExecPath(gitDir)

  process.env.MARKNOTEPRO_GITHUB_DESKTOP_GIT_DIR = gitDir
  process.env.LOCAL_GIT_DIRECTORY = gitDir
  process.env.GIT_EXEC_PATH = gitExecPath

  const gitConfigSystem = path.join(gitDir, 'etc', 'gitconfig')
  if (process.platform !== 'win32' && fs.existsSync(gitConfigSystem)) {
    process.env.GIT_CONFIG_SYSTEM = gitConfigSystem
  }

  const gitTemplateDir = path.join(gitDir, 'share', 'git-core', 'templates')
  if ((process.platform === 'darwin' || process.platform === 'linux') && fs.existsSync(gitTemplateDir)) {
    process.env.GIT_TEMPLATE_DIR = gitTemplateDir
  }

  if (process.platform === 'linux') {
    process.env.PREFIX = gitDir
    const sslCABundle = path.join(gitDir, 'ssl', 'cacert.pem')
    if (!process.env.GIT_SSL_CAINFO && fs.existsSync(sslCABundle)) {
      process.env.GIT_SSL_CAINFO = sslCABundle
    }
  }

  prependPathEntries(getGitPathEntries(gitDir, gitExecPath))
}

const getOrCreateView = (win: BrowserWindow): GitHubDesktopViewEntry => {
  configureGitHubDesktopGitEnvironment()

  const existing = views.get(win.id)
  if (existing) return existing

  const view = new BrowserView({
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
      spellcheck: true
    }
  })

  view.webContents.on('render-process-gone', (_event, details) => {
    log.error('GitHub Desktop renderer gone:', details)
  })
  view.webContents.on('did-fail-load', (_event, code, description, url) => {
    log.error(`GitHub Desktop failed to load: ${code}; ${description}; ${url}`)
  })
  view.webContents.on('zoom-changed', (_event, zoomDirection) => {
    if (shouldIgnoreZoomChanged(view.webContents)) return
    if (zoomDirection === 'in') {
      zoomIn(win)
    } else if (zoomDirection === 'out') {
      zoomOut(win)
    }
  })
  view.webContents.on('before-input-event', (event, input) => {
    handleWindowZoomShortcut(win, event, input)
  })

  const entry = {
    view,
    loaded: false,
    currentRepositoryPath: null,
    currentThemePayload: null,
    currentLocalePayload: null
  }
  views.set(win.id, entry)

  win.on('closed', () => {
    views.delete(win.id)
    pendingWorkspacePathRenames.delete(win.id)
  })

  return entry
}

const showGitHubDesktop = async (
  win: BrowserWindow,
  rawOptions: GitHubDesktopShowOptions | Rectangle
): Promise<void> => {
  const options = normalizeShowOptions(rawOptions)
  const entry = getOrCreateView(win)
  if (options.themePayload) {
    entry.currentThemePayload = options.themePayload
  }
  if (options.localePayload?.language) {
    entry.currentLocalePayload = getGitHubDesktopLocalePayload(options.localePayload.language)
  }

  if (!win.getBrowserViews().includes(entry.view)) {
    win.addBrowserView(entry.view)
  }

  entry.view.setBounds(normalizeBounds(options.bounds))
  entry.view.setAutoResize({ width: true, height: true })
  setWindowZoomFactor(win, getShowZoomFactor(win, options), {
    animated: false,
    notifyRenderer: false
  })

  if (!entry.loaded) {
    entry.loaded = true
    await entry.view.webContents.loadFile(getGitHubDesktopIndexPath())
    await installGitHubDesktopZoomBridge(entry)
    flushURLActions(entry)
    replayGitHubDesktopState(entry)
    flushWorkspacePathRenames(win, entry)
  } else {
    replayGitHubDesktopState(entry)
  }
}

const hideGitHubDesktop = (win: BrowserWindow): void => {
  const entry = views.get(win.id)
  if (!entry) return
  if (win.getBrowserViews().includes(entry.view)) {
    win.removeBrowserView(entry.view)
  }
}

const getWindowState = (win: BrowserWindow): string => {
  if (win.isFullScreen()) return 'full-screen'
  if (win.isMaximized()) return 'maximized'
  if (win.isMinimized()) return 'minimized'
  if (!win.isVisible()) return 'hidden'
  return 'normal'
}

const getGuidPath = (): string => path.join(app.getPath('userData'), '.github-desktop-guid')

const getPackagedEmbeddedGitDir = (): string | null => {
  const gitDir = path.join(process.resourcesPath, 'embedded-git')
  return fs.existsSync(gitDir) ? gitDir : null
}

const configureGitHubDesktopGitEnvironment = (): void => {
  if (process.env.MARKNOTEPRO_GITHUB_DESKTOP_GIT_DIR) {
    configureGitProcessEnvironment(process.env.MARKNOTEPRO_GITHUB_DESKTOP_GIT_DIR)
    return
  }

  const packagedGitDir = getPackagedEmbeddedGitDir()
  if (packagedGitDir) {
    configureGitProcessEnvironment(packagedGitDir)
    return
  }

  try {
    configureGitProcessEnvironment(resolveEmbeddedGitDir())
  } catch (err) {
    log.error('Failed to resolve GitHub Desktop embedded Git directory', err)
  }
}

const flushURLActions = (entry?: GitHubDesktopViewEntry): void => {
  const entries = entry ? [entry] : Array.from(views.values()).filter(item => item.loaded)
  if (!entries.length || !pendingURLActions.length) return

  const actions = pendingURLActions.splice(0, pendingURLActions.length)
  for (const action of actions) {
    for (const target of entries) {
      target.view.webContents.send('url-action', action)
    }
  }
}

const dispatchURLAction = (action: URLActionType): void => {
  const loadedEntries = Array.from(views.values()).filter(entry => entry.loaded)
  if (!loadedEntries.length) {
    pendingURLActions.push(action)
    return
  }

  for (const entry of loadedEntries) {
    entry.view.webContents.send('url-action', action)
  }
}

const handleProtocolURL = (url: string): void => {
  if (!githubDesktopProtocols.some(protocol => url.startsWith(`${protocol}:`))) {
    return
  }

  log.info(`GitHub Desktop protocol callback received: ${url.split('?')[0]}`)
  dispatchURLAction(parseAppURL(url))
}

const registerGitHubDesktopProtocols = (): void => {
  if (protocolsRegistered) return
  protocolsRegistered = true

  const protocolArgs = app.isPackaged ? [] : [app.getAppPath()]

  for (const protocol of githubDesktopProtocols) {
    try {
      if (process.platform === 'win32') {
        app.setAsDefaultProtocolClient(protocol, process.execPath, [
          ...protocolArgs,
          '--protocol-launcher'
        ])
      } else {
        app.setAsDefaultProtocolClient(protocol, process.execPath, protocolArgs)
      }
    } catch (err) {
      log.error(`Failed to register GitHub Desktop protocol '${protocol}'`, err)
    }
  }
}

const registerGitHubDesktopProtocolHandlers = (): void => {
  if (protocolHandlersRegistered) return
  protocolHandlersRegistered = true

  app.whenReady().then(registerGitHubDesktopProtocols).catch(err => {
    log.error('Failed to register GitHub Desktop protocols', err)
  })

  app.on('open-url', (event, url) => {
    event.preventDefault()
    handleProtocolURL(url)
  })

  app.on('second-instance', (_event, argv) => {
    for (const arg of argv) {
      handleProtocolURL(arg)
    }
  })
}

const registerGitHubDesktopViewHandlers = (): void => {
  ipcMain.handle('mt::github-desktop::show', async (event, options: GitHubDesktopShowOptions | Rectangle) => {
    const win = getWindowFromSender(event)
    if (!win) return
    await showGitHubDesktop(win, options)
  })

  ipcMain.handle('mt::github-desktop::get-selected-repository-path', (event) => {
    const win = getWindowFromSender(event)
    if (!win) return null
    return views.get(win.id)?.currentRepositoryPath ?? null
  })

  ipcMain.handle('mt::github-desktop::select-workspace-directory', async (event, defaultPath: string) => {
    const win = getWindowFromSender(event)
    const options: OpenDialogOptions = {
      defaultPath,
      properties: ['openDirectory', 'createDirectory']
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? null : result.filePaths[0] ?? null
  })

  ipcMain.handle('mt::github-desktop::choose-workspace-from-current-repository', async (event) => {
    const win = getWindowFromSender(event)
    if (!win) return null

    const viewEntry = views.get(win.id)
    const text = getDialogText(viewEntry?.currentLocalePayload?.language)
    const repositoryPath = viewEntry?.currentRepositoryPath
    if (!repositoryPath) {
      await dialog.showMessageBox(win, {
        type: 'warning',
        message: text.selectRepositoryFirst,
        buttons: [text.ok]
      })
      return null
    }

    const normalizedRepositoryPath = path.normalize(repositoryPath)
    const choice = await dialog.showMessageBox(win, {
      type: 'question',
      message: text.setWorkspaceTitle,
      detail: text.setWorkspaceDetail,
      buttons: [text.useRepositoryRoot, text.selectSubdirectory, text.cancel],
      defaultId: 0,
      cancelId: 2
    })

    if (choice.response === 2) return null

    let workspacePath = normalizedRepositoryPath
    if (choice.response === 1) {
      const result = await dialog.showOpenDialog(win, {
        defaultPath: normalizedRepositoryPath,
        properties: ['openDirectory', 'createDirectory']
      })
      if (result.canceled) return null

      const selectedPath = path.normalize(result.filePaths[0] ?? '')
      if (!selectedPath || !isChildPath(normalizedRepositoryPath, selectedPath)) {
        await dialog.showMessageBox(win, {
          type: 'warning',
          message: text.selectRepositorySubdirectory,
          buttons: [text.ok]
        })
        return null
      }
      workspacePath = selectedPath
    }

    await fs.ensureDir(workspacePath)
    win.webContents.send('mt::github-desktop::workspace-selected', workspacePath)
    return workspacePath
  })

  ipcMain.on('mt::github-desktop::set-bounds', (event, bounds: Rectangle) => {
    const win = getWindowFromSender(event)
    if (!win) return
    const entry = views.get(win.id)
    entry?.view.setBounds(normalizeBounds(bounds))
  })

  ipcMain.on('mt::github-desktop::workspace-path-renamed', (event, payload: WorkspacePathRenamePayload) => {
    const win = getWindowFromSender(event)
    if (!win || !isWorkspacePathRenamePayload(payload)) return
    sendWorkspacePathRename(win, payload)
  })

  ipcMain.on('mt::github-desktop::theme-update', (event, payload: GitHubDesktopThemePayload) => {
    const win = getWindowFromSender(event)
    if (!win) return
    const entry = views.get(win.id)
    if (!entry) return
    entry.currentThemePayload = payload
    if (entry.loaded) {
      sendGitHubDesktopTheme(entry, payload)
    }
  })

  ipcMain.on('mt::github-desktop::locale-update', (event, payload: GitHubDesktopLocalePayload) => {
    const win = getWindowFromSender(event)
    if (!win) return
    const entry = views.get(win.id)
    if (!entry) return
    const localizedPayload = getGitHubDesktopLocalePayload(payload.language)
    entry.currentLocalePayload = localizedPayload
    if (entry.loaded) {
      sendGitHubDesktopLocale(entry, localizedPayload)
    }
  })

  ipcMain.on('mt::github-desktop::hide', (event) => {
    const win = getWindowFromSender(event)
    if (win) hideGitHubDesktop(win)
  })

  ipcMain.on('mt::github-desktop::switch-to-note', (event) => {
    const win = getWindowFromSender(event)
    win?.webContents.send('mt::github-desktop::switch-to-note')
  })

  ipcMain.on('mt::github-desktop::workspace-selected-silent', (event, workspacePath: string) => {
    const win = getWindowFromSender(event)
    if (!win || !workspacePath) return
    win.webContents.send('mt::github-desktop::workspace-selected-silent', workspacePath)
  })
}

const registerGitHubDesktopRendererHandlers = (): void => {
  ipcMain.on('log', (_event, level: string, message: string) => {
    const logger = log[level as keyof typeof log]
    if (typeof logger === 'function') {
      ;(logger as (...args: unknown[]) => void)(message)
    } else {
      log.info(message)
    }
  })

  ipcMain.on('renderer-ready', () => undefined)
  ipcMain.on('update-menu-state', (event, items: Array<{ id: string; state: Partial<Electron.MenuItem> }>) => {
    let changed = false
    for (const item of items) {
      const menuItem = githubDesktopMenu.getMenuItemById(item.id)
      if (!menuItem) continue

      if (typeof item.state.enabled === 'boolean' && menuItem.enabled !== item.state.enabled) {
        menuItem.enabled = item.state.enabled
        changed = true
      }
      if (typeof item.state.visible === 'boolean' && menuItem.visible !== item.state.visible) {
        menuItem.visible = item.state.visible
        changed = true
      }
      if (typeof item.state.checked === 'boolean' && menuItem.checked !== item.state.checked) {
        menuItem.checked = item.state.checked
        changed = true
      }
    }

    if (changed) {
      sendAppMenu(event)
    }
  })
  ipcMain.on('update-preferred-app-menu-item-labels', (event, labels: MenuLabelsEvent) => {
    currentMenuLabels = labels
    rebuildAppMenu()
    sendAppMenu(event)
  })
  ipcMain.on('dialog-did-open', () => undefined)
  ipcMain.on('update-accounts', () => undefined)
  ipcMain.on('mt::github-desktop::selected-repository-path', (event, repositoryPath: string | null) => {
    const win = getWindowFromSender(event)
    if (!win) return
    const entry = views.get(win.id)
    if (entry) {
      entry.currentRepositoryPath = repositoryPath
    }
    win.webContents.send('mt::github-desktop::selected-repository-path', repositoryPath)
  })
  ipcMain.on('install-windows-cli', () => undefined)
  ipcMain.on('uninstall-windows-cli', () => undefined)
  ipcMain.on('set-native-theme-source', () => undefined)
  ipcMain.on('mt::github-desktop::zoom-delta', (event, direction: 'in' | 'out') => {
    const win = getWindowFromSender(event)
    if (!win) return
    if (direction === 'in') {
      zoomIn(win)
    } else if (direction === 'out') {
      zoomOut(win)
    }
  })
  ipcMain.on('set-window-zoom-factor', (event, zoomFactor: number) => {
    const win = getWindowFromSender(event)
    let nextZoom = zoomFactor
    if (win) {
      nextZoom = setWindowZoomFactor(win, zoomFactor) ?? zoomFactor
    } else {
      event.sender.setZoomFactor(zoomFactor)
    }
    event.sender.send('zoom-factor-changed', nextZoom)
  })
  ipcMain.on('focus-window', (event) => {
    getWindowFromSender(event)?.focus()
  })
  ipcMain.on('minimize-window', (event) => getWindowFromSender(event)?.minimize())
  ipcMain.on('maximize-window', (event) => getWindowFromSender(event)?.maximize())
  ipcMain.on('unmaximize-window', (event) => getWindowFromSender(event)?.unmaximize())
  ipcMain.on('close-window', (event) => getWindowFromSender(event)?.close())
  ipcMain.on('quit-app', () => app.quit())
  ipcMain.on('quit-and-install-updates', () => app.quit())
  ipcMain.on('unsafe-open-directory', (_event, targetPath: string) => {
    shell.openPath(targetPath).catch(err => log.error('open directory failed:', err))
  })
  ipcMain.on('execute-menu-item-by-id', (event, id: string) => {
    if (shouldBlockHiddenMenuExecution(id)) {
      return
    }

    const menuEvent = getMenuEventForId(id)
    if (menuEvent) {
      event.sender.send('menu-event', menuEvent)
      return
    }

    const menuItem = githubDesktopMenu.getMenuItemById(id)
    const role = (menuItem as unknown as { role?: string } | null)?.role
    if (executeRoleMenuItem(event, role)) {
      return
    }

    if (menuItem) {
      const win = getWindowFromSender(event) || undefined
      const fakeEvent = { preventDefault: () => {}, sender: event.sender }
      menuItem.click(fakeEvent as Electron.KeyboardEvent, win, event.sender)
    }
  })
  ipcMain.on('uncaught-exception', (_event, error) => {
    log.error('GitHub Desktop uncaught exception:', error)
  })
  ipcMain.on('send-error-report', (_event, error) => {
    log.error('GitHub Desktop error report:', error)
  })
  ipcMain.on('get-app-menu', sendAppMenu)

  ;['will-quit', 'will-quit-even-if-updating', 'cancel-quitting'].forEach(channel => {
    ipcMain.on(channel, (event) => {
      event.returnValue = undefined
    })
  })

  ipcMain.handle('get-current-window-state', (event) => {
    const win = getWindowFromSender(event)
    return win ? getWindowState(win) : 'normal'
  })
  ipcMain.handle('get-current-window-zoom-factor', (event) => event.sender.getZoomFactor())
  ipcMain.handle('is-window-focused', (event) => !!getWindowFromSender(event)?.isFocused())
  ipcMain.handle('is-window-maximized', (event) => !!getWindowFromSender(event)?.isMaximized())
  ipcMain.handle('get-apple-action-on-double-click', () =>
    process.platform === 'darwin'
      ? systemPreferences.getUserDefault('AppleActionOnDoubleClick', 'string')
      : 'Maximize'
  )
  ipcMain.handle('should-use-dark-colors', () => nativeTheme.shouldUseDarkColors)
  ipcMain.handle('open-external', async (_event, target: string) => {
    await shell.openExternal(target)
    return true
  })
  ipcMain.handle('show-item-in-folder', async (_event, targetPath: string) => {
    shell.showItemInFolder(targetPath)
  })
  ipcMain.handle('move-to-trash', async (_event, targetPath: string) => {
    await shell.trashItem(targetPath)
  })
  ipcMain.handle('show-open-dialog', async (event, options: Electron.OpenDialogOptions) => {
    const win = getWindowFromSender(event)
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? null : result.filePaths[0] ?? null
  })
  ipcMain.handle('show-save-dialog', async (event, options: Electron.SaveDialogOptions) => {
    const win = getWindowFromSender(event)
    const result = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options)
    return result.canceled ? null : result.filePath ?? null
  })
  ipcMain.handle('get-path', (_event, name: Parameters<typeof app.getPath>[0]) =>
    app.getPath(name)
  )
  ipcMain.handle('get-app-architecture', () => process.arch)
  ipcMain.handle('get-app-path', () => app.getAppPath())
  ipcMain.handle('get-exec-path', () => process.env.PATH ?? '')
  ipcMain.handle('is-running-under-arm64-translation', () => false)
  ipcMain.handle('is-in-application-folder', () => false)
  ipcMain.handle('move-to-applications-folder', () => undefined)
  ipcMain.handle('check-for-updates', () => undefined)
  ipcMain.handle('resolve-proxy', (_event, url: string) => session.defaultSession.resolveProxy(url))
  ipcMain.handle(
    'show-contextual-menu',
    async (
      event,
      items: ReadonlyArray<ISerializableMenuItem>,
      addSpellCheckMenu: boolean
    ) => {
      return new Promise<ReadonlyArray<number> | null>(async (resolve) => {
        const win = getWindowFromSender(event) || undefined
        const language = win ? views.get(win.id)?.currentLocalePayload?.language : null
        const translations = getGitHubDesktopMenuTranslations(language)

        const spellCheckMenuItems = addSpellCheckMenu
          ? await buildSpellCheckMenu(win)
          : undefined

        const menu = buildContextMenu(
          localizeSerializedMenuItems(items, translations, language),
          (indices) => resolve(indices),
          spellCheckMenuItems
        )
        localizeElectronMenuItems(menu.items, translations, language)

        menu.popup({
          window: win,
          callback: () => resolve(null)
        })
      })
    }
  )
  ipcMain.handle('save-guid', async (_event, guid: string) => {
    await fs.outputFile(getGuidPath(), guid)
  })
  ipcMain.handle('get-guid', async () => {
    const guidPath = getGuidPath()
    if (await fs.pathExists(guidPath)) {
      return fs.readFile(guidPath, 'utf8')
    }
    return ''
  })
  ipcMain.handle('show-notification', () => null)
  ipcMain.handle('get-notifications-permission', () => 'default')
  ipcMain.handle('request-notifications-permission', () => false)
}

const registerGitHubDesktopKeytarHandlers = (): void => {
  ipcMain.handle('mt::github-desktop::keytar-get-password', async (_e, service: string, account: string) => {
    try {
      return await keytar.getPassword(service, account)
    } catch (err) {
      log.error('GitHub Desktop keytar getPassword failed:', err)
      return null
    }
  })

  ipcMain.handle('mt::github-desktop::keytar-set-password', async (_e, service: string, account: string, password: string) => {
    try {
      await keytar.setPassword(service, account, password)
      return true
    } catch (err) {
      log.error('GitHub Desktop keytar setPassword failed:', err)
      return false
    }
  })

  ipcMain.handle('mt::github-desktop::keytar-delete-password', async (_e, service: string, account: string) => {
    try {
      return await keytar.deletePassword(service, account)
    } catch (err) {
      log.error('GitHub Desktop keytar deletePassword failed:', err)
      return false
    }
  })
}

export const registerGitHubDesktopHandlers = (): void => {
  configureGitHubDesktopGitEnvironment()
  registerGitHubDesktopProtocolHandlers()
  registerGitHubDesktopViewHandlers()
  registerGitHubDesktopRendererHandlers()
  registerGitHubDesktopKeytarHandlers()
}
