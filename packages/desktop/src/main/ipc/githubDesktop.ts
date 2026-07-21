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
import { resolveEmbeddedGitDir } from 'dugite'
import { parseAppURL } from '../../githubDesktop/upstream/src/lib/parse-app-url'
import type { URLActionType } from '../../githubDesktop/upstream/src/lib/parse-app-url'

interface GitHubDesktopViewEntry {
  view: BrowserView
  loaded: boolean
  currentRepositoryPath: string | null
}

const views = new Map<number, GitHubDesktopViewEntry>()
const pendingURLActions: URLActionType[] = []
let protocolsRegistered = false
let protocolHandlersRegistered = false

const githubDesktopProtocols = [
  'x-github-client',
  'x-github-desktop-dev-auth',
  'x-github-desktop-auth',
  process.platform === 'darwin' ? 'github-mac' : 'github-windows'
].filter(Boolean)

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

const normalizeBounds = (bounds: Rectangle): Rectangle => ({
  x: Math.max(0, Math.floor(bounds.x || 0)),
  y: Math.max(0, Math.floor(bounds.y || 0)),
  width: Math.max(1, Math.floor(bounds.width || 1)),
  height: Math.max(1, Math.floor(bounds.height || 1))
})

const getOrCreateView = (win: BrowserWindow): GitHubDesktopViewEntry => {
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

  const entry = { view, loaded: false, currentRepositoryPath: null }
  views.set(win.id, entry)

  win.on('closed', () => {
    views.delete(win.id)
  })

  return entry
}

const showGitHubDesktop = async (win: BrowserWindow, bounds: Rectangle): Promise<void> => {
  const entry = getOrCreateView(win)
  if (!win.getBrowserViews().includes(entry.view)) {
    win.addBrowserView(entry.view)
  }

  entry.view.setBounds(normalizeBounds(bounds))
  entry.view.setAutoResize({ width: true, height: true })

  if (!entry.loaded) {
    entry.loaded = true
    await entry.view.webContents.loadFile(getGitHubDesktopIndexPath())
    flushURLActions(entry)
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

const configureGitHubDesktopGitEnvironment = (): void => {
  if (process.env.MARKNOTEPRO_GITHUB_DESKTOP_GIT_DIR) return

  try {
    process.env.MARKNOTEPRO_GITHUB_DESKTOP_GIT_DIR = resolveEmbeddedGitDir()
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
  ipcMain.handle('mt::github-desktop::show', async (event, bounds: Rectangle) => {
    const win = getWindowFromSender(event)
    if (!win) return
    await showGitHubDesktop(win, bounds)
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

  ipcMain.on('mt::github-desktop::set-bounds', (event, bounds: Rectangle) => {
    const win = getWindowFromSender(event)
    if (!win) return
    const entry = views.get(win.id)
    entry?.view.setBounds(normalizeBounds(bounds))
  })

  ipcMain.on('mt::github-desktop::hide', (event) => {
    const win = getWindowFromSender(event)
    if (win) hideGitHubDesktop(win)
  })
}

const registerGitHubDesktopRendererHandlers = (): void => {
  ipcMain.on('log', (_event, level: string, message: string) => {
    const logger = log[level as keyof typeof log]
    if (typeof logger === 'function') {
      logger.call(log, message)
    } else {
      log.info(message)
    }
  })

  ipcMain.on('renderer-ready', () => undefined)
  ipcMain.on('update-menu-state', () => undefined)
  ipcMain.on('update-preferred-app-menu-item-labels', () => undefined)
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
  ipcMain.on('set-window-zoom-factor', (event, zoomFactor: number) => {
    event.sender.setZoomFactor(zoomFactor)
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
  ipcMain.on('execute-menu-item-by-id', () => undefined)
  ipcMain.on('uncaught-exception', (_event, error) => {
    log.error('GitHub Desktop uncaught exception:', error)
  })
  ipcMain.on('send-error-report', (_event, error) => {
    log.error('GitHub Desktop error report:', error)
  })
  ipcMain.on('get-app-menu', (event) => {
    event.sender.send('app-menu', { type: 'menu', items: [] })
  })

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
  ipcMain.handle('show-contextual-menu', () => null)
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
