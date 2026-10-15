import fs from 'fs-extra'
import fsPromises from 'fs/promises'
import path from 'path'
import { pathToFileURL } from 'url'
import { app, BrowserView, BrowserWindow, dialog, ipcMain, nativeTheme } from 'electron'
import type { Rectangle } from 'electron'
import log from 'electron-log'
import { onInternalChannel } from '../utils/internalIpc'
import { DEFAULT_LANGUAGE } from '../../shared/i18n'
import type { IUserPreferences } from '../../shared/types/preferences'
import type { PdfConfiguration } from '../../shared/types/ipc'

const PDF_EXTENSION = '.pdf'

interface PdfDocumentEntry {
  view: BrowserView
  filePath: string
  loaded: boolean
  lastBounds?: Rectangle
  state: {
    modified: boolean
    isSaved: boolean
    isSaving: boolean
    page?: number
    scale?: number | string
    rotation?: number
    sidebarView?: number
  }
}

interface PdfWindowEntry {
  documents: Map<string, PdfDocumentEntry>
  activePath: string | null
  visible: boolean
  configuration: PdfConfiguration
  lastBounds?: Rectangle
}

const views = new Map<number, PdfWindowEntry>()
const viewOwners = new Map<number, { windowId: number; filePath: string }>()

export const isPdfFile = (pathname: string): boolean =>
  typeof pathname === 'string' && path.extname(pathname).toLowerCase() === PDF_EXTENSION

const normalizePdfPath = (pathname: string): string => {
  const normalized = path.normalize(pathname)
  if (!isPdfFile(normalized)) throw new Error(`不是 PDF 文件: ${pathname}`)
  return normalized
}

export const findPdfWebapp = (): string | null => {
  const candidates = [
    path.join(process.resourcesPath, 'pdfjs'),
    path.resolve(process.cwd(), 'src/pdfWebApp/pdfjs'),
    path.resolve(__dirname, '../pdfWebApp/pdfjs'),
    path.resolve(__dirname, '../../src/pdfWebApp/pdfjs'),
    path.resolve(process.cwd(), 'packages/desktop/src/pdfWebApp/pdfjs')
  ]
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'web/viewer.html'))) ?? null
}

const normalizeBounds = (bounds: Rectangle): Rectangle => ({
  x: Math.max(0, Math.round(bounds.x)),
  y: Math.max(0, Math.round(bounds.y)),
  width: Math.max(1, Math.round(bounds.width)),
  height: Math.max(1, Math.round(bounds.height))
})

export const normalizePdfLanguage = (lang?: string): string => {
  if (!lang) return 'zh-CN'
  const lower = lang.toLowerCase()
  if (lower.startsWith('zh-tw') || lower.startsWith('zh-hk')) return 'zh-TW'
  if (lower.startsWith('zh')) return 'zh-CN'
  if (lower.startsWith('en')) return 'en-US'
  if (lower.startsWith('ja')) return 'ja'
  if (lower.startsWith('de')) return 'de'
  if (lower.startsWith('fr')) return 'fr'
  if (lower.startsWith('it')) return 'it'
  if (lower.startsWith('ko')) return 'ko'
  if (lower.startsWith('es')) return 'es-ES'
  if (lower.startsWith('pt')) return 'pt-PT'
  if (lower.startsWith('tr')) return 'tr'
  return lang
}

const getInitialPreferences = (): { language: string; isDark: boolean; theme: string } => {
  let language = DEFAULT_LANGUAGE || 'zh-CN'
  let isDark = nativeTheme.shouldUseDarkColors
  let theme = isDark ? 'dark' : 'light'
  try {
    const userData = app.getPath('userData')
    const prefFile = path.join(userData, 'preferences.json')
    if (fs.existsSync(prefFile)) {
      const data = fs.readJsonSync(prefFile)
      if (data) {
        if (typeof data.language === 'string') language = data.language
        if (typeof data.theme === 'string') theme = data.theme
        if (theme === 'dark') isDark = true
        else if (theme === 'light') isDark = false
      }
    }
  } catch {}
  return { language, isDark, theme }
}

let lastKnownPdfConfig: PdfConfiguration | null = null

const getOrCreateWindowEntry = (win: BrowserWindow): PdfWindowEntry => {
  const existing = views.get(win.id)
  if (existing) return existing
  const initPrefs = getInitialPreferences()
  const isDark = lastKnownPdfConfig ? lastKnownPdfConfig.dark === true : initPrefs.isDark
  const themeName = lastKnownPdfConfig?.theme || initPrefs.theme
  const lang = lastKnownPdfConfig?.language || initPrefs.language
  const entry: PdfWindowEntry = {
    documents: new Map(),
    activePath: null,
    visible: false,
    configuration: {
      language: lang,
      dark: isDark,
      theme: themeName,
      colors: lastKnownPdfConfig?.colors || {}
    }
  }
  views.set(win.id, entry)
  win.on('closed', () => {
    const current = views.get(win.id)
    if (!current) return
    for (const doc of current.documents.values()) {
      viewOwners.delete(doc.view.webContents.id)
      if (!doc.view.webContents.isDestroyed()) {
        try {
          doc.view.webContents.close()
        } catch {}
      }
    }
    views.delete(win.id)
  })
  return entry
}

const createDocumentEntry = (
  win: BrowserWindow,
  filePath: string,
  _configuration?: PdfConfiguration
): PdfDocumentEntry => {
  const windowEntry = getOrCreateWindowEntry(win)
  const view = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: false,
      preload: path.join(__dirname, '../preload/index.js')
    }
  })

  const entry: PdfDocumentEntry = {
    view,
    filePath,
    loaded: false,
    state: {
      modified: false,
      isSaved: true,
      isSaving: false
    }
  }
  windowEntry.documents.set(filePath, entry)
  viewOwners.set(view.webContents.id, { windowId: win.id, filePath })

  view.webContents.on('did-fail-load', (_event, code, description, url) => {
    log.error(`PDF 加载失败: ${code} ${description} @ ${url}`)
  })
  view.webContents.on('render-process-gone', (_event, details) => {
    log.error('PDF 渲染进程异常退出:', details)
  })
  view.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      log.error(`[PDF Web] ${message} (${sourceId}:${line})`)
    }
  })

  return entry
}

const ensureViewLoaded = async (
  entry: PdfDocumentEntry,
  filePath: string,
  config: PdfConfiguration
): Promise<void> => {
  if (entry.loaded) {
    entry.view.webContents.send('mt::pdf::theme', {
      dark: config.dark,
      theme: config.theme,
      colors: config.colors,
      language: config.language
    })
    return
  }
  entry.loaded = true
  const webapp = findPdfWebapp()
  if (!webapp) {
    throw new Error('找不到 PDF.js Web 引擎。请确认 packages/desktop/src/pdfWebApp 资源完整。')
  }

  const viewerPath = path.join(webapp, 'web/viewer.html')
  const viewerUrl = new URL(pathToFileURL(viewerPath).toString())
  const fileUrl = pathToFileURL(filePath).toString()

  const lang = normalizePdfLanguage(config.language)
  viewerUrl.searchParams.set('file', fileUrl)
  viewerUrl.searchParams.set('locale', lang)
  viewerUrl.searchParams.set('dark', config.dark ? '1' : '0')
  viewerUrl.searchParams.set('theme', config.theme || 'light')
  viewerUrl.searchParams.set('colors', JSON.stringify(config.colors || {}))
  viewerUrl.hash = `locale=${encodeURIComponent(lang)}`

  entry.view.webContents.once('did-finish-load', () => {
    entry.view.webContents.send('mt::pdf::theme', {
      dark: config.dark,
      theme: config.theme,
      colors: config.colors,
      language: lang
    })
  })

  await entry.view.webContents.loadURL(viewerUrl.toString())
}

const getActiveDocument = (win: BrowserWindow): PdfDocumentEntry | undefined => {
  const windowEntry = views.get(win.id)
  return windowEntry?.activePath ? windowEntry.documents.get(windowEntry.activePath) : undefined
}

export const showPdfView = (win: BrowserWindow, bounds: Rectangle): void => {
  const windowEntry = views.get(win.id)
  if (!windowEntry) return
  windowEntry.lastBounds = bounds
  const entry = getActiveDocument(win)
  if (!entry) return

  windowEntry.visible = true
  for (const document of windowEntry.documents.values()) {
    if (document !== entry && win.getBrowserViews().includes(document.view)) {
      win.removeBrowserView(document.view)
    }
  }

  const wasAttached = win.getBrowserViews().includes(entry.view)
  if (!wasAttached) win.addBrowserView(entry.view)

  const normalizedBounds = normalizeBounds(bounds)
  const [contentWidth, contentHeight] = win.getContentSize()
  const x = Math.min(normalizedBounds.x, Math.max(0, contentWidth - 1))
  const y = Math.min(normalizedBounds.y, Math.max(0, contentHeight - 1))
  const maxWidth = Math.max(1, contentWidth - x)
  const maxHeight = Math.max(1, contentHeight - y)
  const boundedBounds: Rectangle = {
    x,
    y,
    width: Math.max(1, Math.min(normalizedBounds.width, maxWidth)),
    height: Math.max(1, Math.min(normalizedBounds.height, maxHeight))
  }

  const prev = entry.lastBounds
  const boundsChanged =
    !prev ||
    prev.x !== boundedBounds.x ||
    prev.y !== boundedBounds.y ||
    prev.width !== boundedBounds.width ||
    prev.height !== boundedBounds.height

  if (!wasAttached || boundsChanged) {
    entry.lastBounds = boundedBounds
    entry.view.setBounds(boundedBounds)
  }
  win.setTopBrowserView(entry.view)
}

export const syncPdfViewBounds = (win: BrowserWindow, bounds: Rectangle): void => {
  const windowEntry = views.get(win.id)
  if (!windowEntry?.visible) return
  showPdfView(win, bounds)
}

export const hidePdfView = (win: BrowserWindow): void => {
  const windowEntry = views.get(win.id)
  if (windowEntry) windowEntry.visible = false
  for (const document of windowEntry?.documents.values() ?? []) {
    if (win.getBrowserViews().includes(document.view)) {
      win.removeBrowserView(document.view)
    }
  }
}

export const capturePdfSnapshot = async (win: BrowserWindow): Promise<string | null> => {
  const entry = getActiveDocument(win)
  if (!entry || entry.view.webContents.isDestroyed()) return null
  try {
    const image = await entry.view.webContents.capturePage()
    if (image.isEmpty()) return null
    return image.toDataURL()
  } catch (err) {
    log.error('capturePdfSnapshot error:', err)
    return null
  }
}

const emitState = (
  win: BrowserWindow,
  filePath: string,
  state: {
    modified: boolean
    isSaved: boolean
    isSaving: boolean
    page?: number
    scale?: number | string
    rotation?: number
    sidebarView?: number
    saveError?: string
  }
): void => {
  if (win.isDestroyed()) return
  win.webContents.send('mt::pdf::state', {
    filePath,
    ...state
  })
}

export const openPdfFile = async (
  pathname: string,
  owner?: BrowserWindow | null,
  configuration?: PdfConfiguration
): Promise<void> => {
  const filePath = normalizePdfPath(pathname)
  const win = owner ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  if (!win) return

  const windowEntry = getOrCreateWindowEntry(win)
  if (configuration) {
    windowEntry.configuration = { ...windowEntry.configuration, ...configuration }
    lastKnownPdfConfig = windowEntry.configuration
  }

  if (!configuration?.colors || Object.keys(configuration.colors).length === 0) {
    if (!win.isDestroyed() && win.webContents) {
      try {
        const liveConfig = await win.webContents.executeJavaScript(`
          (function() {
            try {
              const isDark = document.body.classList.contains('dark') || document.documentElement.classList.contains('dark') || false;
              const style = window.getComputedStyle(document.documentElement);
              const vars = [
                'themeColor', 'themeColor10', 'themeColor20', 'themeColor30',
                'editorColor', 'editorColor30', 'editorColor50', 'editorBgColor',
                'sideBarBgColor', 'sideBarItemHoverBgColor', 'itemBgColor',
                'floatBgColor', 'floatHoverColor', 'floatBorderColor',
                'inputBgColor', 'tableBorderColor'
              ];
              const colors = {};
              for (const name of vars) {
                const val = style.getPropertyValue('--' + name)?.trim();
                if (val) colors[name] = val;
              }
              return {
                dark: isDark,
                theme: isDark ? 'dark' : 'light',
                colors
              };
            } catch (e) {
              return null;
            }
          })()
        `, true)
        if (liveConfig && (liveConfig.dark || Object.keys(liveConfig.colors).length > 0)) {
          windowEntry.configuration = { ...windowEntry.configuration, ...liveConfig }
          lastKnownPdfConfig = windowEntry.configuration
        }
      } catch {}
    }
  }

  let entry = windowEntry.documents.get(filePath)
  if (!entry) {
    entry = createDocumentEntry(win, filePath, windowEntry.configuration)
    try {
      await ensureViewLoaded(entry, filePath, windowEntry.configuration)
    } catch (error) {
      log.error('打开 PDF 文件失败:', error)
      await dialog.showErrorBox('无法打开 PDF 文件', error instanceof Error ? error.message : String(error))
      return
    }
  } else {
    // If entry exists, make sure its theme matches current window theme
    try {
      await ensureViewLoaded(entry, filePath, windowEntry.configuration)
    } catch {}
  }

  windowEntry.activePath = filePath
  if (windowEntry.visible && windowEntry.lastBounds) {
    showPdfView(win, windowEntry.lastBounds)
  }

  win.webContents.send('mt::pdf::opened', { filePath, title: path.basename(filePath) })
  emitState(win, filePath, entry.state)
}

export const requestPdfSave = async (win: BrowserWindow, filePath: string): Promise<void> => {
  const windowEntry = views.get(win.id)
  const entry = windowEntry?.documents.get(filePath)
  if (!entry || entry.view.webContents.isDestroyed()) return

  entry.state.isSaving = true
  emitState(win, filePath, entry.state)

  try {
    const rawBytes = await entry.view.webContents.executeJavaScript(`
      (async () => {
        if (typeof window.marktextproSavePdfDocument === 'function') {
          return await window.marktextproSavePdfDocument();
        }
        const app = window.PDFViewerApplication;
        if (!app?.pdfDocument) return null;
        const bytes = await app.pdfDocument.saveDocument(app.externalServices?.printToPDF);
        return Array.from(bytes);
      })()
    `)

    if (rawBytes && Array.isArray(rawBytes) && rawBytes.length > 0) {
      const buffer = Buffer.from(rawBytes)
      const tempPath = `${filePath}.${Date.now()}.tmp`
      await fsPromises.writeFile(tempPath, buffer)
      await fsPromises.rename(tempPath, filePath)
      entry.state.modified = false
      entry.state.isSaved = true
      entry.state.isSaving = false
      emitState(win, filePath, entry.state)
      try {
        entry.view.webContents.send('mt::pdf::saved')
      } catch {}
    } else {
      entry.state.isSaving = false
      emitState(win, filePath, entry.state)
    }
  } catch (error) {
    log.error('保存 PDF 文件失败:', error)
    entry.state.isSaving = false
    emitState(win, filePath, {
      ...entry.state,
      saveError: error instanceof Error ? error.message : String(error)
    })
  }
}

export const closePdfFile = (win: BrowserWindow, filePath: string): void => {
  const windowEntry = views.get(win.id)
  if (!windowEntry) return

  const entry = windowEntry.documents.get(filePath)
  if (entry) {
    viewOwners.delete(entry.view.webContents.id)
    if (win.getBrowserViews().includes(entry.view)) {
      win.removeBrowserView(entry.view)
    }
    if (!entry.view.webContents.isDestroyed()) {
      try {
        entry.view.webContents.close()
      } catch {}
    }
    windowEntry.documents.delete(filePath)
  }

  if (windowEntry.activePath === filePath) {
    windowEntry.activePath = null
  }
  win.webContents.send('mt::pdf::closed', { filePath })
}

export const initPdfIpc = (): void => {
  ipcMain.handle('mt::pdf::open', async (event, pathname: string, configuration?: PdfConfiguration) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    await openPdfFile(pathname, win, configuration)
  })

  ipcMain.handle('mt::pdf::show', async (event, bounds: Rectangle) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    showPdfView(win, bounds)
  })

  ipcMain.handle('mt::pdf::capture-snapshot', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    return capturePdfSnapshot(win)
  })

  ipcMain.handle('mt::pdf::save-request', async (event, filePath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    await requestPdfSave(win, filePath)
  })

  ipcMain.handle('mt::pdf::close-file', async (event, filePath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    closePdfFile(win, filePath)
  })

  ipcMain.handle('mt::pdf::configure', async (event, configuration: PdfConfiguration) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    const windowEntry = views.get(win.id)
    if (!windowEntry) return
    windowEntry.configuration = { ...windowEntry.configuration, ...configuration }
    lastKnownPdfConfig = windowEntry.configuration
    for (const doc of windowEntry.documents.values()) {
      if (!doc.view.webContents.isDestroyed()) {
        doc.view.webContents.send('mt::pdf::theme', {
          dark: windowEntry.configuration.dark,
          theme: windowEntry.configuration.theme,
          colors: windowEntry.configuration.colors,
          language: windowEntry.configuration.language
        })
      }
    }
  })

  ipcMain.on('mt::pdf::set-bounds', (event, bounds: Rectangle) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    syncPdfViewBounds(win, bounds)
  })

  ipcMain.handle('mt::pdf::select-image', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: '选择插入图片',
      properties: ['openFile'],
      filters: [
        {
          name: '图片文件 (*.png, *.jpg, *.jpeg, *.gif, *.webp, *.svg)',
          extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']
        }
      ]
    })
    if (result.canceled || !result.filePaths.length) return null
    const selectedPath = result.filePaths[0]
    try {
      const buffer = await fsPromises.readFile(selectedPath)
      const ext = path.extname(selectedPath).toLowerCase().replace('.', '')
      const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
      return {
        name: path.basename(selectedPath),
        mime,
        dataUrl: `data:${mime};base64,${buffer.toString('base64')}`
      }
    } catch (err) {
      log.error('读取图片失败:', err)
      return null
    }
  })

  ipcMain.on('mt::pdf::hide', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    hidePdfView(win)
  })

  // Direct save shortcut triggered from within PDF BrowserView
  ipcMain.on('mt::pdf::request-save', (event) => {
    const owner = viewOwners.get(event.sender.id)
    if (!owner) return
    const win = BrowserWindow.fromId(owner.windowId)
    if (!win || win.isDestroyed()) return
    log.info(`[PDF Shortcut] Direct save triggered from BrowserView for ${owner.filePath}`)
    void requestPdfSave(win, owner.filePath)
  })

  // PDF BrowserView requesting latest theme
  ipcMain.on('mt::pdf::request-theme', (event) => {
    const owner = viewOwners.get(event.sender.id)
    if (!owner) return
    const win = BrowserWindow.fromId(owner.windowId)
    if (!win || win.isDestroyed()) return
    const windowEntry = views.get(win.id)
    const config = windowEntry?.configuration || lastKnownPdfConfig
    if (config) {
      event.sender.send('mt::pdf::theme', {
        dark: config.dark,
        theme: config.theme,
        colors: config.colors,
        language: config.language
      })
    }
  })

  // Internal state changed from PDF BrowserView
  ipcMain.on('mt::pdf::internal-state-changed', (event, stateData) => {
    const owner = viewOwners.get(event.sender.id)
    if (!owner) return
    const win = BrowserWindow.fromId(owner.windowId)
    if (!win || win.isDestroyed()) return
    const windowEntry = views.get(win.id)
    const entry = windowEntry?.documents.get(owner.filePath)
    if (!entry) return

    const prevModified = entry.state.modified
    entry.state = {
      ...entry.state,
      ...stateData,
      isSaved: !stateData.modified
    }

    if (prevModified !== entry.state.modified || stateData.reason) {
      log.info(`[PDF State] ${owner.filePath} modified=${entry.state.modified}, isSaved=${entry.state.isSaved}, actionId=${stateData.actionId}, savedActionId=${stateData.savedActionId}, reason=${stateData.reason || ''}`)
    }

    emitState(win, owner.filePath, entry.state)
  })

  // Listen to application preferences changes (e.g. language or theme change)
  onInternalChannel('broadcast-preferences-changed', (prefs: Partial<IUserPreferences>) => {
    if (prefs) {
      if (prefs.language && lastKnownPdfConfig) {
        lastKnownPdfConfig.language = prefs.language
      }
      for (const windowEntry of views.values()) {
        if (prefs.language) {
          windowEntry.configuration.language = prefs.language
        }
        for (const doc of windowEntry.documents.values()) {
          if (!doc.view.webContents.isDestroyed()) {
            doc.view.webContents.send('mt::pdf::theme', {
              dark: windowEntry.configuration.dark,
              theme: windowEntry.configuration.theme,
              colors: windowEntry.configuration.colors,
              language: normalizePdfLanguage(windowEntry.configuration.language)
            })
          }
        }
      }
    }
  })
}

// Register IPC handlers automatically when module is loaded
initPdfIpc()

