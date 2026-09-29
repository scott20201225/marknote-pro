import crypto from 'crypto'
import fs from 'fs-extra'
import fsPromises from 'fs/promises'
import { inflateRawSync } from 'zlib'
import path from 'path'
import { pathToFileURL } from 'url'
import { app, BrowserView, BrowserWindow, dialog, ipcMain } from 'electron'
import type { Rectangle } from 'electron'
import log from 'electron-log'
import { writeFile } from '../filesystem'
import type { GeoGebraMode } from '../../shared/types/files'
import type { GeoGebraConfiguration } from '../../shared/types/ipc'
import { buildGeoGebraThemeCss } from './theme'

const GEOGEBRA_EXTENSION = '.ggb'

interface GeoGebraDocumentEntry {
  view: BrowserView
  filePath: string
  mode: GeoGebraMode
  loaded: boolean
  controlsStyleKey?: string
  themeStyleKey?: string
  exportTitle?: string
}

interface GeoGebraWindowEntry {
  documents: Map<string, GeoGebraDocumentEntry>
  activePath: string | null
  visible: boolean
  language: string
  configuration: GeoGebraConfiguration
}

const views = new Map<number, GeoGebraWindowEntry>()
const viewOwners = new Map<number, { windowId: number; filePath: string }>()

const DEFAULT_GEOGEBRA_CONFIGURATION: GeoGebraConfiguration = {
  language: 'zh-CN',
  dark: false,
  theme: 'light',
  colors: {}
}

const normalizeGeoGebraConfiguration = (
  configuration?: Partial<GeoGebraConfiguration>
): GeoGebraConfiguration => ({
  language: normalizeGeoGebraLanguage(configuration?.language),
  dark: configuration?.dark === true,
  theme: typeof configuration?.theme === 'string' ? configuration.theme : 'light',
  colors: Object.fromEntries(
    Object.entries(configuration?.colors ?? {}).filter(
      ([, value]) => typeof value === 'string' && value.length < 160
    )
  )
})



const applyGeoGebraTheme = async (
  entry: GeoGebraDocumentEntry,
  configuration: GeoGebraConfiguration
): Promise<void> => {
  if (entry.view.webContents.isDestroyed()) return
  if (entry.themeStyleKey) {
    await entry.view.webContents.removeInsertedCSS(entry.themeStyleKey)
    entry.themeStyleKey = undefined
  }

  const css = buildGeoGebraThemeCss(configuration)
  if (css) entry.themeStyleKey = await entry.view.webContents.insertCSS(css)
}

export const isGeoGebraFile = (pathname: string): boolean =>
  typeof pathname === 'string' && path.extname(pathname).toLowerCase() === GEOGEBRA_EXTENSION

const normalizeGeoGebraPath = (pathname: string): string => {
  const normalized = path.normalize(pathname)
  if (!isGeoGebraFile(normalized)) throw new Error(`不是 GeoGebra 文件: ${pathname}`)
  return normalized
}

const extractZipEntry = (archive: Buffer, entryName: string): Buffer | null => {
  const endOfCentralDirectory = archive.lastIndexOf(Buffer.from('PK\x05\x06', 'binary'))
  if (endOfCentralDirectory < 0) return null

  const entryCount = archive.readUInt16LE(endOfCentralDirectory + 10)
  let centralDirectoryOffset = archive.readUInt32LE(endOfCentralDirectory + 16)

  for (let index = 0; index < entryCount; index += 1) {
    if (archive.readUInt32LE(centralDirectoryOffset) !== 0x02014b50) return null

    const compressionMethod = archive.readUInt16LE(centralDirectoryOffset + 10)
    const compressedSize = archive.readUInt32LE(centralDirectoryOffset + 20)
    const nameLength = archive.readUInt16LE(centralDirectoryOffset + 28)
    const extraLength = archive.readUInt16LE(centralDirectoryOffset + 30)
    const commentLength = archive.readUInt16LE(centralDirectoryOffset + 32)
    const localHeaderOffset = archive.readUInt32LE(centralDirectoryOffset + 42)
    const name = archive
      .subarray(centralDirectoryOffset + 46, centralDirectoryOffset + 46 + nameLength)
      .toString('utf8')

    if (name === entryName) {
      if (archive.readUInt32LE(localHeaderOffset) !== 0x04034b50) return null
      const localNameLength = archive.readUInt16LE(localHeaderOffset + 26)
      const localExtraLength = archive.readUInt16LE(localHeaderOffset + 28)
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength
      const compressed = archive.subarray(dataStart, dataStart + compressedSize)
      if (compressionMethod === 0) return compressed
      if (compressionMethod === 8) return inflateRawSync(compressed)
      return null
    }

    centralDirectoryOffset += 46 + nameLength + extraLength + commentLength
  }

  return null
}

const detectGeoGebraMode = async (filePath: string): Promise<GeoGebraMode> => {
  try {
    const archive = await fsPromises.readFile(filePath)
    const xmlBuffer = extractZipEntry(archive, 'geogebra.xml')
    if (!xmlBuffer) return 'graphing'

    const xml = xmlBuffer.toString('utf8')
    const appName = xml.match(/<geogebra\b[^>]*\bapp=["']([^"']+)["']/i)?.[1].toLowerCase()
    if (
      appName === '3d' ||
      /<euclidianView3D\b/i.test(xml) ||
      /<uses3D\b[^>]*\bval=["']true["']/i.test(xml)
    ) {
      return '3d'
    }
    if (appName === 'geometry') return 'geometry'
    if (appName === 'cas') return 'cas'
    if (appName === 'probability') return 'probability'
    if (appName === 'scientific') return 'scientific'
  } catch (error) {
    log.warn('读取 GeoGebra 文件模式失败，使用绘图计算模式:', error)
  }
  return 'graphing'
}

const findGeoGebraWebapp = (): string | null => {
  const candidates = [
    path.join(process.resourcesPath, 'geogebra'),
    path.resolve(process.cwd(), 'src/geoGebraWebApp/webapp'),
    path.resolve(__dirname, '../geoGebraWebApp/webapp'),
    path.resolve(__dirname, '../../src/geoGebraWebApp/webapp')
  ]
  return (
    candidates.find((candidate) => fs.existsSync(path.join(candidate, 'calculator.html'))) ?? null
  )
}

const normalizeGeoGebraLanguage = (language: string | undefined): string => {
  if (!language) return 'zh-CN'
  return language.replace('_', '-')
}

const getGeoGebraUrl = (mode: GeoGebraMode, language: string): string => {
  const webapp = findGeoGebraWebapp()
  if (!webapp) {
    throw new Error(
      '找不到 GeoGebra Web 引擎。请确认 packages/desktop/src/geoGebraWebApp/webapp 资源完整。'
    )
  }
  const htmlFile: Record<GeoGebraMode, string> = {
    graphing: 'graphing.html',
    '3d': '3d.html',
    geometry: 'geometry.html',
    cas: 'cas.html',
    // GeoGebra ships Probability as a Suite sub-app, not as a standalone
    // webapp HTML entry. Keep using the bundled local calculator page and
    // select its sub-app before the editor is initialized.
    probability: 'calculator.html',
    scientific: 'scientific.html'
  }
  // Each file opens one official GeoGebra application. The application picker
  // stays hidden because the mode is selected before the file is created.
  const url = new URL(pathToFileURL(path.join(webapp, htmlFile[mode])).toString())
  url.searchParams.set('lang', normalizeGeoGebraLanguage(language))
  url.searchParams.set('showAppsPicker', 'false')
  url.searchParams.set('enableFileFeatures', 'false')
  if (mode === 'probability') url.searchParams.set('subApp', 'probability')
  return url.toString()
}

const normalizeBounds = (bounds: Rectangle): Rectangle => ({
  x: Math.max(0, Math.round(bounds.x)),
  y: Math.max(0, Math.round(bounds.y)),
  width: Math.max(1, Math.round(bounds.width)),
  height: Math.max(1, Math.round(bounds.height))
})

const getOrCreateWindowEntry = (win: BrowserWindow): GeoGebraWindowEntry => {
  const existing = views.get(win.id)
  if (existing) return existing
  const entry: GeoGebraWindowEntry = {
    documents: new Map(),
    activePath: null,
    visible: false,
    language: DEFAULT_GEOGEBRA_CONFIGURATION.language,
    configuration: DEFAULT_GEOGEBRA_CONFIGURATION
  }
  views.set(win.id, entry)
  win.on('closed', () => {
    const current = views.get(win.id)
    if (!current) return
    for (const document of current.documents.values())
      viewOwners.delete(document.view.webContents.id)
    views.delete(win.id)
  })
  return entry
}

const createDocumentEntry = (
  win: BrowserWindow,
  filePath: string,
  mode: GeoGebraMode
): GeoGebraDocumentEntry => {
  const view = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: false,
      preload: path.join(__dirname, '../preload/index.js')
    }
  })
  const entry = { view, filePath, mode, loaded: false }
  getOrCreateWindowEntry(win).documents.set(filePath, entry)
  viewOwners.set(view.webContents.id, { windowId: win.id, filePath })
  view.webContents.on('did-fail-load', (_event, code, description, url) => {
    log.error(`GeoGebra 加载失败: ${code} ${description} @ ${url}`)
  })
  view.webContents.on('render-process-gone', (_event, details) => {
    log.error('GeoGebra 渲染进程异常退出:', details)
  })
  return entry
}

const ensureViewLoaded = async (
  entry: GeoGebraDocumentEntry,
  configuration: GeoGebraConfiguration
): Promise<void> => {
  if (entry.loaded) return
  entry.loaded = true
  await entry.view.webContents.loadURL(getGeoGebraUrl(entry.mode, configuration.language))
  if (!entry.controlsStyleKey && !entry.view.webContents.isDestroyed()) {
    entry.controlsStyleKey = await entry.view.webContents.insertCSS(`
      /* MarkNotePro exposes file, save, export and print in its native menu.
         Removing GeoGebra's duplicate header also removes its 64px layout
         reservation, so the applet container must explicitly fill the page. */
      .GeoGebraHeader {
        display: none !important;
      }

      #ggbApplet {
        display: block !important;
        height: 100vh !important;
        min-height: 100vh !important;
      }

      .GeoGebraFrame .appName::after,
      .GeoGebraFrame .shareBtn,
      .GeoGebraFrame .assignBtn,
      .GeoGebraFrame .signIn,
      .GeoGebraFrame .signInIcon {
        display: none !important;
      }

      .GeoGebraFrame .appName::after {
        content: none !important;
      }
    `)
  }
  await applyGeoGebraTheme(entry, configuration)
}

const getActiveDocument = (win: BrowserWindow): GeoGebraDocumentEntry | undefined => {
  const entry = views.get(win.id)
  return entry?.activePath ? entry.documents.get(entry.activePath) : undefined
}

const showGeoGebraView = (win: BrowserWindow, bounds: Rectangle): void => {
  const windowEntry = views.get(win.id)
  if (!windowEntry) return
  const entry = getActiveDocument(win)
  if (!entry) return
  windowEntry.visible = true
  if (!win.getBrowserViews().includes(entry.view)) win.addBrowserView(entry.view)
  const normalizedBounds = normalizeBounds(bounds)
  // BrowserView bounds are relative to Electron's native content area. The
  // renderer can temporarily report a taller CSS layout while macOS is
  // restoring/maximizing the window, so clamp the final rectangle against the
  // actual content size to keep it above the Dock and below the title row.
  const [contentWidth, contentHeight] = win.getContentSize()
  const x = Math.min(normalizedBounds.x, Math.max(0, contentWidth - 1))
  const y = Math.min(normalizedBounds.y, Math.max(0, contentHeight - 1))
  // GeoGebra occupies the whole remaining tab area. The renderer-provided
  // width/height can be stale during a maximize/restore transition, so derive
  // both dimensions from the native content area instead of preserving a
  // measured rectangle that may leave a gap or extend under the Dock.
  const boundedBounds: Rectangle = {
    x,
    y,
    width: Math.max(1, contentWidth - x),
    height: Math.max(1, contentHeight - y)
  }
  entry.view.setBounds(boundedBounds)

  // BrowserView.setBounds changes the native viewport, but embedded GeoGebra
  // does not always receive a browser resize event when a tab is restored or
  // shown again. Its generated layout can then keep the initial narrow canvas
  // and leave the remaining viewport as an empty gray area. Notify the page
  // through the normal browser resize path after the native bounds have been
  // applied. Do not call GeoGebra's setSize API here: it creates a second,
  // manually injected viewport size and can place its bottom controls below
  // the actual BrowserView after macOS maximize/restore.
  const refreshLayout = (): void => {
    if (entry.view.webContents.isDestroyed()) return
    void entry.view.webContents
      .executeJavaScript(
        `
        (() => {
          window.dispatchEvent(new Event('resize'))
          window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
        })()
      `
      )
      .catch(() => undefined)
  }
  refreshLayout()
  setTimeout(refreshLayout, 160)
  setTimeout(refreshLayout, 420)
  setTimeout(refreshLayout, 800)
  win.setTopBrowserView(entry.view)
}

const syncGeoGebraViewBounds = (win: BrowserWindow, bounds: Rectangle): void => {
  const windowEntry = views.get(win.id)
  // The renderer component stays mounted to preserve the embedded editor, but
  // its resize observers can still emit stale bounds after a tab switch.
  // Never let those bounds re-add a hidden native BrowserView.
  if (!windowEntry?.visible) return
  showGeoGebraView(win, bounds)
}

export const hideGeoGebraView = (win: BrowserWindow): void => {
  const windowEntry = views.get(win.id)
  if (!windowEntry) return
  windowEntry.visible = false
  for (const document of windowEntry.documents.values()) {
    if (win.getBrowserViews().includes(document.view)) win.removeBrowserView(document.view)
  }
}

type GeoGebraMenuAction = 'ggb' | 'png' | 'svg' | 'pdf' | 'stl' | 'print'

const GEOGEBRA_EXPORT_LABELS: Record<Exclude<GeoGebraMenuAction, 'print'>, string[]> = {
  ggb: ['GeoGebra 文件 (.ggb)', 'GeoGebra File (.ggb)'],
  png: ['PNG 图片 (.png)', 'PNG Image (.png)'],
  svg: ['SVG 图片 (.svg)', 'SVG Image (.svg)'],
  pdf: ['PDF 文档 (.pdf)', 'PDF Document (.pdf)'],
  stl: ['3D 打印 (.stl)', '3D Printing (.stl)', '3D Print (.stl)', '3D打印(stl)']
}

interface GeoGebraPrintData {
  type: 'svg' | 'png'
  content: string
}

const getGeoGebraPrintContent = async (
  entry: GeoGebraDocumentEntry
): Promise<GeoGebraPrintData | null> => {
  if (entry.view.webContents.isDestroyed()) return null
  return (await entry.view.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const api = window.ggbApplet
      if (!api) return resolve(null)

      const tryPng = () => {
        try {
          if (typeof api.getPNGBase64 === 'function') {
            const png = api.getPNGBase64(2, false, 300)
            if (typeof png === 'string' && png.length > 50) {
              return resolve({ type: 'png', content: png })
            }
          }
        } catch {}
        resolve(null)
      }

      try {
        if (typeof api.exportSVG === 'function') {
          let resolved = false
          const timer = setTimeout(() => {
            if (!resolved) {
              resolved = true
              tryPng()
            }
          }, 1200)

          api.exportSVG((svg) => {
            if (resolved) return
            resolved = true
            clearTimeout(timer)
            if (typeof svg === 'string' && svg.includes('<svg')) {
              return resolve({ type: 'svg', content: svg })
            }
            tryPng()
          })
          return
        }
      } catch {}

      tryPng()
    })
  `)) as GeoGebraPrintData | null
}

const createGeoGebraPrintWindow = async (data: GeoGebraPrintData): Promise<BrowserWindow> => {
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  const bodyContent =
    data.type === 'svg'
      ? data.content
      : `<img src="data:image/png;base64,${data.content}" alt="GeoGebra Construction" />`
  const document = `<!doctype html><html><head><meta charset="UTF-8"><style>@page{margin:10mm;size:auto}html,body{margin:0;padding:0;background:#fff;display:flex;justify-content:center;align-items:center;min-height:100vh}svg{display:block;max-width:100%;max-height:100vh;height:auto;width:auto}img{display:block;max-width:100%;max-height:100vh;width:auto;height:auto;object-fit:contain}</style></head><body>${bodyContent}</body></html>`
  await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(document)}`)
  return printWindow
}

export const printGeoGebraDocument = async (win: BrowserWindow): Promise<void> => {
  const entry = getActiveDocument(win)
  if (!entry || entry.view.webContents.isDestroyed()) return
  try {
    const data = await getGeoGebraPrintContent(entry)
    if (!data) {
      log.warn('未能获取 GeoGebra 打印图像数据')
      return
    }
    const printWindow = await createGeoGebraPrintWindow(data)
    printWindow.webContents.print({ printBackground: true }, () => {
      if (!printWindow.isDestroyed()) printWindow.destroy()
    })
  } catch (error) {
    log.error('打印 GeoGebra 文档失败:', error)
  }
}

/**
 * Routes each host export choice into the corresponding GeoGebra drawer item.
 * GeoGebra therefore still owns its filename/location dialog and output code.
 */
export const invokeGeoGebraMenuAction = (win: BrowserWindow, action: GeoGebraMenuAction): void => {
  const entry = getActiveDocument(win)
  if (!entry || entry.view.webContents.isDestroyed()) return

  if (action === 'print') {
    void printGeoGebraDocument(win)
    return
  }

  const targetLabels = GEOGEBRA_EXPORT_LABELS[action]
  const actionName = targetLabels[0]
  void entry.view.webContents
    .executeJavaScript(
      `
        new Promise((resolve, reject) => {
          const targetLabels = ${JSON.stringify(targetLabels)}
          const downloadLabels = ['下载', 'Download', '下载为', 'Download as', '下载为...', 'Download as...']
          const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim()
          const isVisible = (element) => {
            if (!(element instanceof HTMLElement)) return false
            if (!element.getClientRects().length) return false
            for (let current = element; current; current = current.parentElement) {
              if (current.getAttribute('aria-hidden') === 'true' || current.hasAttribute('inert')) {
                return false
              }
            }
            const style = window.getComputedStyle(element)
            return style.display !== 'none' && style.visibility !== 'hidden'
          }
          const findMenuItem = (labels) => [...document.querySelectorAll('.menuItemView')].find((element) =>
            isVisible(element) && labels.includes(normalize(element.textContent))
          )
          const click = (element) => element.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
          }))
          const existing = findMenuItem(targetLabels)
          if (existing) {
            click(existing)
            resolve(undefined)
            return
          }
          const selectTarget = () => {
            let attempts = 0
            const waitForTarget = () => {
              const item = findMenuItem(targetLabels)
              if (item) {
                click(item)
                resolve(undefined)
                return
              }
              if (++attempts >= 40) {
                reject(new Error('GeoGebra 下载菜单中未找到 ${actionName}'))
                return
              }
              window.setTimeout(waitForTarget, 50)
            }
            window.setTimeout(waitForTarget, 0)
          }
          const openDownload = () => {
            const item = findMenuItem(downloadLabels)
            if (item) {
              click(item)
              selectTarget()
              return true
            }
            return false
          }
          if (openDownload()) {
            return
          }
          const menuButton = [...document.querySelectorAll(
            '[aria-label="主菜单"], [aria-label="Main Menu"], [aria-label="菜单"], [aria-label="Menu"], ' +
            '[title="主菜单"], [title="Main Menu"], [title="菜单"], [title="Menu"], .menuBtn'
          )].find((element) => element instanceof HTMLElement)
          if (!menuButton) {
            reject(new Error('找不到 GeoGebra 主菜单按钮'))
            return
          }
          // The host intentionally hides GeoGebra's duplicate header.  A
          // synthetic event still reaches its native menu handler, while the
          // resulting menu items are rendered in the normal visible overlay.
          click(menuButton)
          let attempts = 0
          const waitForAction = () => {
            if (openDownload()) {
              return
            }
            if (++attempts >= 40) {
              reject(new Error('GeoGebra 主菜单中未找到 ${actionName}'))
              return
            }
            window.setTimeout(waitForAction, 50)
          }
          window.setTimeout(waitForAction, 0)
        })
      `,
      true
    )
    .catch((error) => log.error(`调用 GeoGebra ${actionName} 功能失败:`, error))
}

const emitState = (
  win: BrowserWindow,
  entry: GeoGebraDocumentEntry,
  state: {
    modified: boolean
    isSaved: boolean
    isSaving: boolean
    saveError?: string
    lastSavedHash?: string
  }
): void =>
  win.webContents.send('mt::geogebra::state', {
    filePath: entry.filePath,
    mode: entry.mode,
    ...state
  })

const readBase64 = async (filePath: string): Promise<string> => {
  if (!(await fs.pathExists(filePath))) return ''
  const file = await fsPromises.readFile(filePath)
  return file.length ? file.toString('base64') : ''
}

const getCurrentBase64 = async (entry: GeoGebraDocumentEntry): Promise<string> =>
  (await entry.view.webContents.executeJavaScript(`
    new Promise((resolve, reject) => {
      let attempts = 0
      const read = () => {
        const api = window.ggbApplet
        if (!api || typeof api.getBase64 !== 'function') {
          if (++attempts >= 300) return reject(new Error('GeoGebra 编辑器初始化超时'))
          return window.setTimeout(read, 100)
        }
        try {
          let settled = false
          const complete = (value) => {
            if (settled) return
            settled = true
            resolve(typeof value === 'string' ? value : '')
          }
          // GeoGebra's callback form serializes after pending construction
          // updates have been applied. This avoids saving the previous state
          // when the user edits and immediately switches or presses Save.
          const immediate = api.getBase64(complete)
          if (typeof immediate === 'string') complete(immediate)
          window.setTimeout(() => {
            if (settled) return
            try {
              complete(api.getBase64())
            } catch (error) {
              reject(error)
            }
          }, 1000)
        } catch (error) {
          reject(error)
        }
      }
      read()
    })
  `)) as string

const loadBase64 = async (entry: GeoGebraDocumentEntry, base64: string): Promise<void> => {
  await entry.view.webContents.executeJavaScript(`
    new Promise((resolve, reject) => {
      let attempts = 0
      const apply = () => {
        const api = window.ggbApplet
        if (!api || typeof api.setBase64 !== 'function') {
          if (++attempts >= 300) return reject(new Error('GeoGebra 编辑器初始化超时'))
          return window.setTimeout(apply, 100)
        }
        // GeoGebra emits an update while restoring a document. Keep that
        // initial restore out of the user's modified state, but continue to
        // report all later edits through the same listener.
        window.__marknoteGeoGebraHydrating = true
        if (
          !window.__marknoteGeoGebraChangeListener &&
          typeof api.registerUpdateListener === 'function'
        ) {
          window.__marknoteGeoGebraChangeListener = true
          // GeoGebra's Web API expects the name of a global callback here.
          // Use one callback for every construction mutation category. An
          // update listener alone does not fire when a new object is added,
          // which is the most common edit in the algebra input.
          window.__marknoteGeoGebraUpdate = () => {
            if (!window.__marknoteGeoGebraHydrating) {
              window.electron?.ipcRenderer?.send('mt::geogebra::state', { modified: true })
            }
          }
          const listenerName = '__marknoteGeoGebraUpdate'
          api.registerAddListener?.(listenerName)
          api.registerRemoveListener?.(listenerName)
          api.registerClearListener?.(listenerName)
          api.registerRenameListener?.(listenerName)
          api.registerUpdateListener(listenerName)
          api.registerStoreUndoListener?.(listenerName)

          // Some bundled GeoGebra builds do not dispatch every construction
          // mutation through the public listeners (notably algebra input
          // commits). Keep a small XML snapshot as a fallback so an edit can
          // never silently bypass IGeoGebraState.modified and auto-save.
          const snapshot = () => {
            if (window.__marknoteGeoGebraHydrating) return
            try {
              const xml = typeof api.getXML === 'function' ? api.getXML() : ''
              if (typeof xml !== 'string') return
              if (
                typeof window.__marknoteGeoGebraLastXml === 'string' &&
                window.__marknoteGeoGebraLastXml !== xml
              ) {
                window.__marknoteGeoGebraUpdate()
              }
              window.__marknoteGeoGebraLastXml = xml
            } catch {
              // The applet can briefly be between views while switching tabs.
            }
          }
          window.__marknoteGeoGebraSnapshot = snapshot
          window.__marknoteGeoGebraLastXml = null
          window.__marknoteGeoGebraMonitor = window.setInterval(snapshot, 500)
        }
        const finish = () => {
          window.setTimeout(() => {
            try {
              const api = window.ggbApplet
              window.__marknoteGeoGebraLastXml =
                api && typeof api.getXML === 'function' ? api.getXML() : null
            } catch {
              window.__marknoteGeoGebraLastXml = null
            }
            window.__marknoteGeoGebraHydrating = false
          }, 150)
          resolve()
        }
        if (${JSON.stringify(base64)}) {
          let finished = false
          const complete = () => {
            if (finished) return
            finished = true
            finish()
          }
          // setBase64 accepts a completion callback in the GeoGebra Web API.
          // The timeout keeps blank/newer builds compatible if that callback
          // is not invoked by a particular embedded build.
          api.setBase64(${JSON.stringify(base64)}, complete)
          window.setTimeout(complete, 1000)
        } else {
          // A newly created .ggb is an empty placeholder. BrowserView/GeoGebra
          // can retain the previous construction in its local app state, so
          // an empty file must explicitly start a fresh construction instead
          // of leaving stale objects visible and saving them into this file.
          api.newConstruction()
          window.setTimeout(finish, 0)
        }
      }
      apply()
    })
  `)
}

const setGeoGebraExportTitle = async (
  entry: GeoGebraDocumentEntry,
  exportTitle: string
): Promise<void> => {
  await entry.view.webContents.executeJavaScript(`
    new Promise((resolve, reject) => {
      let attempts = 0
      const apply = () => {
        const api = window.ggbApplet
        if (!api || typeof api.getXML !== 'function' || typeof api.setXML !== 'function') {
          if (++attempts >= 300) return reject(new Error('GeoGebra 编辑器初始化超时'))
          return window.setTimeout(apply, 100)
        }
        try {
          const escapeXmlAttribute = (value) => value
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
          const title = escapeXmlAttribute(${JSON.stringify(exportTitle)})
          const xml = api.getXML()
          if (typeof xml !== 'string') throw new Error('无法读取 GeoGebra 文档数据')
          const nextXml = xml.replace(/<construction\\b([^>]*)>/i, (_match, attributes) => {
            const nextAttributes = /\\btitle=(['"]).*?\\1/i.test(attributes)
              ? attributes.replace(/\\btitle=(['"]).*?\\1/i, 'title="' + title + '"')
              : attributes + ' title="' + title + '"'
            return '<construction' + nextAttributes + '>'
          })
          if (nextXml === xml) throw new Error('无法设置 GeoGebra 导出文件名')
          window.__marknoteGeoGebraHydrating = true
          api.setXML(nextXml)
          window.setTimeout(() => {
            try {
              window.__marknoteGeoGebraLastXml = api.getXML()
            } finally {
              window.__marknoteGeoGebraHydrating = false
              resolve()
            }
          }, 100)
        } catch (error) {
          window.__marknoteGeoGebraHydrating = false
          reject(error)
        }
      }
      apply()
    })
  `)
}

const setGeoGebraLanguage = async (
  entry: GeoGebraDocumentEntry,
  language: string
): Promise<void> => {
  await entry.view.webContents.executeJavaScript(`
    new Promise((resolve, reject) => {
      let attempts = 0
      const apply = () => {
        const api = window.ggbApplet
        if (!api || typeof api.setLanguage !== 'function') {
          if (++attempts >= 300) return reject(new Error('GeoGebra 编辑器初始化超时'))
          return window.setTimeout(apply, 100)
        }
        try {
          api.setLanguage(${JSON.stringify(normalizeGeoGebraLanguage(language))})
          resolve()
        } catch (error) {
          reject(error)
        }
      }
      apply()
    })
  `)
}

const configureGeoGebra = async (
  win: BrowserWindow,
  configuration: GeoGebraConfiguration
): Promise<void> => {
  const windowEntry = getOrCreateWindowEntry(win)
  const normalizedConfiguration = normalizeGeoGebraConfiguration(configuration)
  const { language } = normalizedConfiguration
  const languageChanged = windowEntry.language !== language
  windowEntry.language = language
  windowEntry.configuration = normalizedConfiguration
  await Promise.all(
    [...windowEntry.documents.values()]
      .filter((entry) => entry.loaded && !entry.view.webContents.isDestroyed())
      .map(async (entry) => {
        try {
          if (languageChanged) await setGeoGebraLanguage(entry, language)
          await applyGeoGebraTheme(entry, normalizedConfiguration)
        } catch (error) {
          log.warn('同步 GeoGebra 界面配置失败:', error)
        }
      })
  )
}

const requestGeoGebraSave = async (win: BrowserWindow, filePath: string): Promise<void> => {
  const normalizedPath = normalizeGeoGebraPath(filePath)
  const entry = views.get(win.id)?.documents.get(normalizedPath)
  if (!entry) throw new Error('找不到对应的 GeoGebra 标签页')
  emitState(win, entry, { modified: true, isSaved: false, isSaving: true })
  try {
    const base64 = await getCurrentBase64(entry)
    if (!base64) throw new Error('GeoGebra 尚未准备好，无法保存')
    const data = Buffer.from(base64, 'base64')
    await writeFile(entry.filePath, data, undefined, undefined)
    emitState(win, entry, {
      modified: false,
      isSaved: true,
      isSaving: false,
      lastSavedHash: crypto.createHash('sha256').update(data).digest('hex')
    })
  } catch (error) {
    const saveError = error instanceof Error ? error.message : String(error)
    emitState(win, entry, { modified: true, isSaved: false, isSaving: false, saveError })
    throw error
  }
}

const closeDocument = (win: BrowserWindow, filePath: string): void => {
  const windowEntry = views.get(win.id)
  const normalizedPath = normalizeGeoGebraPath(filePath)
  const entry = windowEntry?.documents.get(normalizedPath)
  if (!windowEntry || !entry) return
  if (win.getBrowserViews().includes(entry.view)) win.removeBrowserView(entry.view)
  viewOwners.delete(entry.view.webContents.id)
  windowEntry.documents.delete(normalizedPath)
  if (windowEntry.activePath === normalizedPath) windowEntry.activePath = null
}

export const openGeoGebraFile = async (
  pathname: string,
  owner?: BrowserWindow | null,
  requestedMode?: GeoGebraMode,
  configuration?: GeoGebraConfiguration
): Promise<void> => {
  const win = owner ?? BrowserWindow.getFocusedWindow()
  let createdEntry: GeoGebraDocumentEntry | undefined
  try {
    if (!win) throw new Error('请先打开 MarkNotePro 编辑窗口。')
    const filePath = normalizeGeoGebraPath(pathname)
    const windowEntry = getOrCreateWindowEntry(win)
    if (configuration) await configureGeoGebra(win, configuration)
    let entry = windowEntry.documents.get(filePath)
    if (!entry) {
      // A non-empty .ggb file is authoritative about its own application.
      // Never let a stale buffered-tab mode (usually the old graphing default)
      // open a real 3D document in the 2D engine, because saving it there can
      // discard 3D-specific data. The requested mode is only used for a new
      // empty placeholder created by MarkNotePro.
      const fileBase64 = await readBase64(filePath)
      const mode = fileBase64 ? await detectGeoGebraMode(filePath) : (requestedMode ?? 'graphing')
      entry = createDocumentEntry(win, filePath, mode)
      createdEntry = entry
      // These operations must be sequential. executeJavaScript can otherwise
      // run against the previous BrowserView document while loadURL is still
      // navigating, making setBase64 appear to succeed while the construction
      // is later replaced by the blank app bootstrap.
      await ensureViewLoaded(entry, windowEntry.configuration)
      await loadBase64(entry, fileBase64)

      // New files are created as an empty placeholder before the BrowserView
      // starts. Persist GeoGebra's first generated archive immediately so the
      // file contains its mode (especially 3D) and can be recognized correctly
      // after the tab or application is reopened.
      if (!fileBase64) {
        const initialBase64 = await getCurrentBase64(entry)
        if (initialBase64) {
          await writeFile(filePath, Buffer.from(initialBase64, 'base64'), undefined, undefined)
        }
      }
    } else {
      await ensureViewLoaded(entry, windowEntry.configuration)
    }
    const exportTitle = path.basename(filePath, path.extname(filePath))
    if (entry.exportTitle !== exportTitle) {
      // A GeoGebra construction does not always expose a <construction> node
      // that can carry a title. Export naming is optional, so it must never
      // prevent a valid .ggb archive from opening.
      try {
        await setGeoGebraExportTitle(entry, exportTitle)
        entry.exportTitle = exportTitle
      } catch (error) {
        log.warn('设置 GeoGebra 导出文件名失败，继续打开文件:', error)
      }
    }
    windowEntry.activePath = filePath
    win.webContents.send('mt::geogebra::opened', {
      filePath,
      title: path.basename(filePath),
      mode: entry.mode
    })
    emitState(win, entry, { modified: false, isSaved: true, isSaving: false })
  } catch (error) {
    // Do not retain a half-hydrated BrowserView. Reusing it would show a blank
    // construction on the next open and could make a later save overwrite the
    // still-valid file on disk.
    if (createdEntry && win) closeDocument(win, createdEntry.filePath)
    log.error('打开 GeoGebra 文件失败:', error)
    await dialog.showErrorBox(
      '无法打开 GeoGebra 文件',
      error instanceof Error ? error.message : String(error)
    )
  }
}

export const registerGeoGebraHandlers = (): void => {
  ipcMain.handle(
    'mt::geogebra::open',
    (event, pathname: string, mode?: GeoGebraMode, configuration?: GeoGebraConfiguration) =>
      openGeoGebraFile(pathname, BrowserWindow.fromWebContents(event.sender), mode, configuration)
  )
  ipcMain.handle('mt::geogebra::configure', (event, configuration: GeoGebraConfiguration) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || !configuration || typeof configuration.language !== 'string') return
    return configureGeoGebra(win, configuration)
  })
  ipcMain.handle('mt::geogebra::show', (event, bounds: Rectangle) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) showGeoGebraView(win, bounds)
  })
  ipcMain.on('mt::geogebra::set-bounds', (event, bounds: Rectangle) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) syncGeoGebraViewBounds(win, bounds)
  })
  ipcMain.on('mt::geogebra::hide', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) hideGeoGebraView(win)
  })
  ipcMain.on('mt::geogebra::state', (event, state: { modified?: boolean }) => {
    const owner = viewOwners.get(event.sender.id)
    const win = owner ? BrowserWindow.fromId(owner.windowId) : null
    const entry =
      owner && win ? views.get(owner.windowId)?.documents.get(owner.filePath) : undefined
    if (win && entry && state.modified)
      emitState(win, entry, { modified: true, isSaved: false, isSaving: false })
  })
  ipcMain.handle('mt::geogebra::save-request', (event, filePath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || typeof filePath !== 'string') throw new Error('无效的 GeoGebra 保存请求')
    return requestGeoGebraSave(win, filePath)
  })
  ipcMain.handle('mt::geogebra::close-file', (event, filePath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && typeof filePath === 'string') closeDocument(win, filePath)
  })
}
