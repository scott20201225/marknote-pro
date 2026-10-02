import fs from 'fs-extra'
import fsPromises from 'fs/promises'
import path from 'path'
import { pathToFileURL } from 'url'
import { app, BrowserView, BrowserWindow, dialog, ipcMain } from 'electron'
import type { Rectangle } from 'electron'
import log from 'electron-log'
import { writeFile } from '../filesystem'
import type { MindMapConfiguration } from '../../shared/types/ipc'
import type { MindMapStructure } from '../../shared/types/files'
import { getMindMapThemeInfo } from '../../common/mindmapTheme'

const MINDMAP_EXTENSION = '.smm'
const DEFAULT_MINDMAP_DATA = {
  root: {
    data: {
      text: '中心主题'
    },
    children: []
  },
  theme: {
    template: 'classic4',
    config: {}
  },
  layout: 'logicalStructure',
  config: {},
  view: null
}

const getInitialMindMapData = (
  configuration?: MindMapConfiguration,
  structure?: MindMapStructure
) => {
  const themeInfo = getMindMapThemeInfo(configuration?.theme)
  const template = configuration?.mindMapTheme || themeInfo.mindMapTheme
  const backgroundColor = configuration?.backgroundColor || themeInfo.backgroundColor
  const themeConfig = {
    ...themeInfo.themeConfig,
    ...(configuration?.themeConfig || {}),
    backgroundColor
  }
  return {
    ...DEFAULT_MINDMAP_DATA,
    layout: structure || DEFAULT_MINDMAP_DATA.layout,
    theme: {
      template,
      config: themeConfig
    }
  }
}

interface MindMapDocumentEntry {
  view: BrowserView
  filePath: string
  loaded: boolean
  lastBounds?: Rectangle
}

interface MindMapWindowEntry {
  documents: Map<string, MindMapDocumentEntry>
  activePath: string | null
  visible: boolean
  configuration: MindMapConfiguration
}

const views = new Map<number, MindMapWindowEntry>()
const viewOwners = new Map<number, { windowId: number; filePath: string }>()

export const isMindMapFile = (pathname: string): boolean =>
  typeof pathname === 'string' && path.extname(pathname).toLowerCase() === MINDMAP_EXTENSION

const normalizeMindMapPath = (pathname: string): string => {
  const normalized = path.normalize(pathname)
  if (!isMindMapFile(normalized)) throw new Error(`不是思维导图文件: ${pathname}`)
  return normalized
}

const findMindMapWebapp = (): string | null => {
  const candidates = [
    path.join(process.resourcesPath, 'mindmap'),
    path.resolve(process.cwd(), 'src/mindMapWebApp/mind-map'),
    path.resolve(__dirname, '../mindMapWebApp/mind-map'),
    path.resolve(__dirname, '../../src/mindMapWebApp/mind-map')
  ]
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'index.html'))) ?? null
}

const normalizeBounds = (bounds: Rectangle): Rectangle => ({
  x: Math.max(0, Math.round(bounds.x)),
  y: Math.max(0, Math.round(bounds.y)),
  width: Math.max(1, Math.round(bounds.width)),
  height: Math.max(1, Math.round(bounds.height))
})

const getOrCreateWindowEntry = (win: BrowserWindow): MindMapWindowEntry => {
  const existing = views.get(win.id)
  if (existing) return existing
  const defaultThemeInfo = getMindMapThemeInfo('light')
  const entry: MindMapWindowEntry = {
    documents: new Map(),
    activePath: null,
    visible: false,
    configuration: {
      language: 'zh',
      dark: false,
      theme: 'light',
      mindMapTheme: defaultThemeInfo.mindMapTheme,
      backgroundColor: defaultThemeInfo.backgroundColor,
      themeConfig: defaultThemeInfo.themeConfig
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

const createDocumentEntry = (win: BrowserWindow, filePath: string): MindMapDocumentEntry => {
  const view = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: false,
      preload: path.join(__dirname, '../preload/index.js')
    }
  })
  const entry: MindMapDocumentEntry = { view, filePath, loaded: false }
  getOrCreateWindowEntry(win).documents.set(filePath, entry)
  viewOwners.set(view.webContents.id, { windowId: win.id, filePath })
  view.webContents.on('did-fail-load', (_event, code, description, url) => {
    log.error(`思维导图加载失败: ${code} ${description} @ ${url}`)
  })
  view.webContents.on('render-process-gone', (_event, details) => {
    log.error('思维导图渲染进程异常退出:', details)
  })
  return entry
}

const readMindMapData = async (
  filePath: string,
  configuration?: MindMapConfiguration,
  structure?: MindMapStructure
): Promise<unknown> => {
  const fallbackData = getInitialMindMapData(configuration, structure)
  if (!(await fs.pathExists(filePath))) return fallbackData
  try {
    const content = await fsPromises.readFile(filePath, 'utf8')
    if (content.trim()) {
      return JSON.parse(content)
    }
  } catch (error) {
    log.warn('解析思维导图数据失败，使用默认结构:', error)
  }
  await writeFile(filePath, JSON.stringify(fallbackData, null, 2), undefined, 'utf8')
  return fallbackData
}

const ensureViewLoaded = async (
  entry: MindMapDocumentEntry,
  initialPayload: {
    filePath: string
    data: unknown
    isDark: boolean
    language: string
    theme?: string
    mindMapTheme?: string
    backgroundColor?: string
    themeConfig?: Record<string, unknown>
    colors?: Record<string, string>
  }
): Promise<void> => {
  if (entry.loaded) {
    entry.view.webContents.send('mt::mindmap::init', initialPayload)
    return
  }
  entry.loaded = true
  const webapp = findMindMapWebapp()
  if (!webapp) {
    throw new Error(
      '找不到 MindMap Web 引擎。请确认 MarkNotePro 项目中的 packages/desktop/src/mindMapWebApp 资源完整。'
    )
  }
  const indexPath = path.join(webapp, 'index.html')
  const fileUrl = pathToFileURL(indexPath).toString()

  entry.view.webContents.once('did-finish-load', () => {
    entry.view.webContents.send('mt::mindmap::init', initialPayload)
  })

  await entry.view.webContents.loadURL(fileUrl)
}

const getActiveDocument = (win: BrowserWindow): MindMapDocumentEntry | undefined => {
  const windowEntry = views.get(win.id)
  return windowEntry?.activePath ? windowEntry.documents.get(windowEntry.activePath) : undefined
}

export const showMindMapView = (win: BrowserWindow, bounds: Rectangle): void => {
  const windowEntry = views.get(win.id)
  if (!windowEntry) return
  const entry = getActiveDocument(win)
  if (!entry) return
  windowEntry.visible = true
  if (!win.getBrowserViews().includes(entry.view)) win.addBrowserView(entry.view)
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
  entry.view.setBounds(boundedBounds)
  win.setTopBrowserView(entry.view)
}

export const syncMindMapViewBounds = (win: BrowserWindow, bounds: Rectangle): void => {
  const windowEntry = views.get(win.id)
  if (!windowEntry?.visible) return
  const entry = getActiveDocument(win)
  if (!entry) return
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
  entry.view.setBounds(boundedBounds)
}

export const hideMindMapView = (win: BrowserWindow): void => {
  const windowEntry = views.get(win.id)
  if (windowEntry) windowEntry.visible = false
  for (const document of windowEntry?.documents.values() ?? []) {
    if (win.getBrowserViews().includes(document.view)) {
      win.removeBrowserView(document.view)
    }
  }
}

const emitState = (
  win: BrowserWindow,
  entry: MindMapDocumentEntry,
  state: { modified: boolean; isSaved: boolean; isSaving: boolean }
): void => {
  if (win.isDestroyed()) return
  win.webContents.send('mt::mindmap::state', {
    filePath: entry.filePath,
    ...state
  })
}

export const openMindMapFile = async (
  pathname: string,
  owner?: BrowserWindow | null,
  configuration?: MindMapConfiguration,
  structure?: MindMapStructure
): Promise<void> => {
  const filePath = normalizeMindMapPath(pathname)
  const win = owner ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  if (!win) return

  const windowEntry = getOrCreateWindowEntry(win)
  if (configuration) {
    windowEntry.configuration = { ...windowEntry.configuration, ...configuration }
  }
  const themeInfo = getMindMapThemeInfo(windowEntry.configuration.theme)
  const isDark =
    typeof windowEntry.configuration.dark === 'boolean'
      ? windowEntry.configuration.dark
      : themeInfo.isDark
  const mindMapTheme = windowEntry.configuration.mindMapTheme || themeInfo.mindMapTheme
  const backgroundColor = windowEntry.configuration.backgroundColor || themeInfo.backgroundColor
  const themeConfig = windowEntry.configuration.themeConfig || themeInfo.themeConfig

  let entry = windowEntry.documents.get(filePath)
  if (!entry) {
    entry = createDocumentEntry(win, filePath)
  }

  windowEntry.activePath = filePath

  try {
    const data = await readMindMapData(filePath, windowEntry.configuration, structure)
    await ensureViewLoaded(entry, {
      filePath,
      data,
      isDark,
      language: windowEntry.configuration.language,
      theme: windowEntry.configuration.theme,
      mindMapTheme,
      backgroundColor,
      themeConfig,
      colors: windowEntry.configuration.colors
    })

    win.webContents.send('mt::mindmap::opened', { filePath, title: path.basename(filePath) })
    emitState(win, entry, { modified: false, isSaved: true, isSaving: false })
  } catch (error) {
    log.error('打开思维导图文件失败:', error)
    await dialog.showErrorBox(
      '无法打开思维导图文件',
      error instanceof Error ? error.message : String(error)
    )
  }
}

export const createMindMapFile = async (owner?: BrowserWindow | null): Promise<void> => {
  const win = owner ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const windowEntry = win ? views.get(win.id) : undefined
  const initialData = getInitialMindMapData(windowEntry?.configuration)
  const result = win
    ? await dialog.showSaveDialog(win, {
        title: '新建思维导图',
        defaultPath: path.join(app.getPath('documents'), '未命名.smm'),
        filters: [{ name: '思维导图', extensions: ['smm'] }]
      })
    : await dialog.showSaveDialog({
        title: '新建思维导图',
        defaultPath: path.join(app.getPath('documents'), '未命名.smm'),
        filters: [{ name: '思维导图', extensions: ['smm'] }]
      })
  if (result.canceled || !result.filePath) return
  const filePath = isMindMapFile(result.filePath)
    ? result.filePath
    : `${result.filePath}${MINDMAP_EXTENSION}`
  await writeFile(filePath, JSON.stringify(initialData, null, 2), undefined, 'utf8')
  await openMindMapFile(filePath, win)
}

export const requestMindMapSave = async (win: BrowserWindow, filePath: string): Promise<void> => {
  const windowEntry = views.get(win.id)
  const entry = windowEntry?.documents.get(filePath)
  if (!entry || entry.view.webContents.isDestroyed()) return

  emitState(win, entry, { modified: true, isSaved: false, isSaving: true })
  try {
    const data = await entry.view.webContents.executeJavaScript(`
      new Promise((resolve) => {
        let fullData = null
        if (window.__mindMap && typeof window.__mindMap.getData === 'function') {
          fullData = window.__mindMap.getData(true)
        } else if (window.takeOverAppMethods && typeof window.takeOverAppMethods.getMindMapData === 'function') {
          fullData = window.takeOverAppMethods.getMindMapData()
        }
        if (window.__isCustomTheme && fullData) {
          if (!fullData.theme) fullData.theme = {}
          fullData.theme._isCustomTheme = true
          fullData.theme._customThemeIsDark = window.__customThemeIsDark
          if (!fullData.theme.config) fullData.theme.config = {}
          fullData.theme.config._isCustomTheme = true
          fullData.theme.config._customThemeIsDark = window.__customThemeIsDark
          if (window.__currentBackgroundColor) {
            fullData.theme.config.backgroundColor = window.__currentBackgroundColor
            fullData.theme.config.backgroundImage = 'none'
          }
        }
        resolve(fullData)
      })
    `)
    if (data && typeof data === 'object') {
      await writeFile(entry.filePath, JSON.stringify(data, null, 2), undefined, 'utf8')
      emitState(win, entry, { modified: false, isSaved: true, isSaving: false })
    }
  } catch (error) {
    log.error('保存思维导图文件失败:', error)
    emitState(win, entry, { modified: true, isSaved: false, isSaving: false })
    throw error
  }
}

export const saveMindMapDocuments = async (
  win: BrowserWindow,
  filePaths?: string[]
): Promise<void> => {
  const windowEntry = views.get(win.id)
  if (!windowEntry) return
  const targets = filePaths?.length
    ? filePaths
        .map((p) => windowEntry.documents.get(p))
        .filter((d): d is MindMapDocumentEntry => !!d)
    : Array.from(windowEntry.documents.values())

  for (const document of targets) {
    await requestMindMapSave(win, document.filePath)
  }
}

export const closeMindMapDocument = (win: BrowserWindow, filePath: string): void => {
  const windowEntry = views.get(win.id)
  if (!windowEntry) return
  const entry = windowEntry.documents.get(filePath)
  if (!entry) return

  if (win.getBrowserViews().includes(entry.view)) {
    win.removeBrowserView(entry.view)
  }
  viewOwners.delete(entry.view.webContents.id)
  if (!entry.view.webContents.isDestroyed()) {
    try {
      entry.view.webContents.close()
    } catch {}
  }
  windowEntry.documents.delete(filePath)
  if (windowEntry.activePath === filePath) {
    windowEntry.activePath = null
  }
}

export const configureMindMap = (win: BrowserWindow, configuration: MindMapConfiguration): void => {
  const windowEntry = views.get(win.id)
  if (!windowEntry) return
  windowEntry.configuration = { ...windowEntry.configuration, ...configuration }
  const themeInfo = getMindMapThemeInfo(windowEntry.configuration.theme)
  const mindMapTheme = windowEntry.configuration.mindMapTheme || themeInfo.mindMapTheme
  const backgroundColor = windowEntry.configuration.backgroundColor || themeInfo.backgroundColor
  const themeConfig = windowEntry.configuration.themeConfig || themeInfo.themeConfig
  const isDark =
    typeof windowEntry.configuration.dark === 'boolean'
      ? windowEntry.configuration.dark
      : themeInfo.isDark

  for (const doc of windowEntry.documents.values()) {
    if (!doc.view.webContents.isDestroyed()) {
      doc.view.webContents.send('mt::mindmap::set-theme', {
        isDark,
        language: windowEntry.configuration.language,
        theme: windowEntry.configuration.theme,
        mindMapTheme,
        backgroundColor,
        themeConfig,
        colors: windowEntry.configuration.colors
      })
      doc.view.webContents.send('mt::mindmap::set-language', {
        language: windowEntry.configuration.language
      })
    }
  }
}

export type MindMapMenuAction = 'import' | 'export' | 'print'

interface MindMapPrintData {
  type: 'svg' | 'png'
  content: string
}

const getMindMapPrintContent = async (entry: MindMapDocumentEntry): Promise<MindMapPrintData | null> => {
  return (await entry.view.webContents.executeJavaScript(`
    new Promise(async (resolve) => {
      try {
        if (window.__mindMap && typeof window.__mindMap.export === 'function') {
          const png = await window.__mindMap.export('png', false, 'mindmap')
          if (typeof png === 'string' && png.length > 50) {
            return resolve({ type: 'png', content: png })
          }
          const svg = await window.__mindMap.export('svg', false, 'mindmap')
          if (typeof svg === 'string' && svg.includes('<svg')) {
            return resolve({ type: 'svg', content: svg })
          }
        }
      } catch (e) {
        console.error('getMindMapPrintContent error:', e)
      }
      resolve(null)
    })
  `)) as MindMapPrintData | null
}

const createMindMapPrintWindow = async (data: MindMapPrintData): Promise<BrowserWindow> => {
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  const bodyContent =
    data.type === 'svg'
      ? data.content
      : `<img src="${data.content.startsWith('data:') ? data.content : `data:image/png;base64,${data.content}`}" alt="Mind Map" />`
  const document = `<!doctype html><html><head><meta charset="UTF-8"><style>@page{margin:10mm;size:auto}html,body{margin:0;padding:0;background:#fff;display:flex;justify-content:center;align-items:center;min-height:100vh}svg{display:block;max-width:100%;max-height:100vh;height:auto;width:auto}img{display:block;max-width:100%;max-height:100vh;width:auto;height:auto;object-fit:contain}</style></head><body>${bodyContent}</body></html>`
  await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(document)}`)
  return printWindow
}

export const printMindMapDocument = async (win: BrowserWindow): Promise<void> => {
  const entry = getActiveDocument(win)
  if (!entry || entry.view.webContents.isDestroyed()) return
  try {
    const data = await getMindMapPrintContent(entry)
    if (data) {
      const printWindow = await createMindMapPrintWindow(data)
      printWindow.webContents.print({ printBackground: true }, () => {
        if (!printWindow.isDestroyed()) printWindow.destroy()
      })
      return
    }
    log.warn('未能获取思维导图打印图像数据，回退到页面直接打印')
  } catch (error) {
    log.error('打印思维导图失败:', error)
  }

  try {
    entry.view.webContents.print({ printBackground: true })
  } catch (err) {
    log.error('思维导图页面直接打印失败:', err)
  }
}

export const importMindMapDocument = async (win: BrowserWindow): Promise<void> => {
  const entry = getActiveDocument(win)
  if (!entry || entry.view.webContents.isDestroyed()) return

  const result = await dialog.showOpenDialog(win, {
    title: '导入思维导图文件',
    properties: ['openFile'],
    filters: [
      {
        name: '思维导图 / 数据文件 (*.smm, *.json, *.xmind, *.md)',
        extensions: ['smm', 'json', 'xmind', 'md']
      },
      { name: 'Simple Mind Map (*.smm)', extensions: ['smm'] },
      { name: 'JSON (*.json)', extensions: ['json'] },
      { name: 'XMind (*.xmind)', extensions: ['xmind'] },
      { name: 'Markdown (*.md)', extensions: ['md'] }
    ]
  })

  if (result.canceled || !result.filePaths || !result.filePaths.length) return
  const selectedPath = result.filePaths[0]
  const ext = path.extname(selectedPath).toLowerCase()
  const baseNameWithoutExt = path.basename(selectedPath, path.extname(selectedPath))
  const fileName = `${baseNameWithoutExt}${ext}`

  try {
    const fileBuffer = await fsPromises.readFile(selectedPath)
    const base64Data = fileBuffer.toString('base64')

    await entry.view.webContents.executeJavaScript(`
      (async () => {
        try {
          const base64 = ${JSON.stringify(base64Data)};
          const fileName = ${JSON.stringify(fileName)};
          const binaryString = window.atob(base64);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const file = new File([bytes], fileName);
          const bus = window.$bus || (window.__vueApp && (window.__vueApp.$bus || (window.__vueApp.__proto__ && window.__vueApp.__proto__.$bus)));
          if (bus) {
            bus.$emit('importFile', file);
          }
        } catch (err) {
          console.error('导入思维导图数据失败:', err);
        }
      })()
    `)
  } catch (error) {
    log.error('读取导入文件失败:', error)
  }
}

export const invokeMindMapMenuAction = (win: BrowserWindow, action: MindMapMenuAction): void => {
  const entry = getActiveDocument(win)
  if (!entry || entry.view.webContents.isDestroyed()) return

  if (action === 'print') {
    void printMindMapDocument(win)
    return
  }

  if (action === 'import') {
    void importMindMapDocument(win)
    return
  }

  if (action === 'export') {
    void entry.view.webContents.executeJavaScript(`
      (() => {
        const bus = window.$bus || (window.__vueApp && (window.__vueApp.$bus || (window.__vueApp.__proto__ && window.__vueApp.__proto__.$bus)));
        if (bus) {
          bus.$emit('showExport');
        }
      })()
    `)
    return
  }
}

export const registerMindMapHandlers = (): void => {
  ipcMain.on('mt::mindmap::menu-action', (event, action: MindMapMenuAction) => {
    const owner = viewOwners.get(event.sender.id)
    const win = owner
      ? BrowserWindow.fromId(owner.windowId)
      : BrowserWindow.fromWebContents(event.sender)
    if (win && action) {
      invokeMindMapMenuAction(win, action)
    }
  })
  ipcMain.handle(
    'mt::mindmap::open',
    (
      event,
      pathname: string,
      configuration?: MindMapConfiguration,
      structure?: MindMapStructure
    ) =>
      openMindMapFile(
        pathname,
        BrowserWindow.fromWebContents(event.sender),
        configuration,
        structure
      )
  )
  ipcMain.handle('mt::mindmap::configure', (event, configuration: MindMapConfiguration) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || !configuration) return
    configureMindMap(win, configuration)
  })
  ipcMain.handle('mt::mindmap::show', (event, bounds: Rectangle) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) showMindMapView(win, bounds)
  })
  ipcMain.on('mt::mindmap::set-bounds', (event, bounds: Rectangle) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) syncMindMapViewBounds(win, bounds)
  })
  ipcMain.on('mt::mindmap::hide', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) hideMindMapView(win)
  })
  ipcMain.on('mt::mindmap::state', (event, state: { modified?: boolean; isSaved?: boolean }) => {
    const owner = viewOwners.get(event.sender.id)
    const win = owner ? BrowserWindow.fromId(owner.windowId) : null
    const entry =
      owner && win ? views.get(owner.windowId)?.documents.get(owner.filePath) : undefined
    if (win && entry) {
      if (state.modified) {
        emitState(win, entry, { modified: true, isSaved: false, isSaving: false })
      } else if (state.isSaved) {
        emitState(win, entry, { modified: false, isSaved: true, isSaving: false })
      }
    }
  })
  ipcMain.handle('mt::mindmap::save', async (event, data: unknown) => {
    const owner = viewOwners.get(event.sender.id)
    const win = owner ? BrowserWindow.fromId(owner.windowId) : null
    const entry =
      owner && win ? views.get(owner.windowId)?.documents.get(owner.filePath) : undefined
    if (win && entry && data && typeof data === 'object') {
      await writeFile(entry.filePath, JSON.stringify(data, null, 2), undefined, 'utf8')
      emitState(win, entry, { modified: false, isSaved: true, isSaving: false })
    }
  })
  ipcMain.handle('mt::mindmap::save-request', (event, filePath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || typeof filePath !== 'string') throw new Error('无效的思维导图保存请求')
    return requestMindMapSave(win, filePath)
  })
  ipcMain.handle('mt::mindmap::close-file', (event, filePath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && typeof filePath === 'string') closeMindMapDocument(win, filePath)
  })
  ipcMain.handle('mt::mindmap::ready', async (event) => {
    const owner = viewOwners.get(event.sender.id)
    if (!owner) return null
    const windowEntry = views.get(owner.windowId)
    const entry = windowEntry?.documents.get(owner.filePath)
    if (!entry || !windowEntry) return null
    const themeInfo = getMindMapThemeInfo(windowEntry.configuration.theme)
    const isDark =
      typeof windowEntry.configuration.dark === 'boolean'
        ? windowEntry.configuration.dark
        : themeInfo.isDark
    const mindMapTheme = windowEntry.configuration.mindMapTheme || themeInfo.mindMapTheme
    const backgroundColor = windowEntry.configuration.backgroundColor || themeInfo.backgroundColor
    const themeConfig = windowEntry.configuration.themeConfig || themeInfo.themeConfig
    const data = await readMindMapData(entry.filePath, windowEntry.configuration)
    return {
      filePath: entry.filePath,
      data,
      isDark,
      language: windowEntry.configuration.language,
      theme: windowEntry.configuration.theme,
      mindMapTheme,
      backgroundColor,
      themeConfig,
      colors: windowEntry.configuration.colors
    }
  })
}
