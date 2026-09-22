import fs from 'fs-extra'
import fsPromises from 'fs/promises'
import crypto from 'crypto'
import path from 'path'
import { pathToFileURL } from 'url'
import { app, BrowserView, BrowserWindow, dialog, ipcMain } from 'electron'
import type { Rectangle } from 'electron'
import log from 'electron-log'
import type { DrawioConfiguration } from '../../shared/types/ipc'
import { writeFile } from '../filesystem'

const DRAWIO_EXTENSION = '.drawio'
const EMPTY_DRAWIO =
  '<mxfile host="MarkNotePro"><diagram id="page-1" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>'

interface DrawioDocumentEntry {
  view: BrowserView
  filePath: string
  loaded: boolean
  saveWaiters: Array<{ resolve: () => void; reject: (error: unknown) => void }>
}

interface DrawioWindowEntry {
  documents: Map<string, DrawioDocumentEntry>
  activePath: string | null
  autoSave: boolean
  configuration: DrawioConfiguration
}

interface DrawioExportPayload {
  format: string
  filename?: string
  data?: string
  xml?: string
}

const views = new Map<number, DrawioWindowEntry>()
const viewOwners = new Map<number, { windowId: number; filePath: string }>()

const normalizeDrawioConfiguration = (
  configuration?: Partial<DrawioConfiguration>
): DrawioConfiguration => {
  const colors = Object.fromEntries(
    Object.entries(configuration?.colors ?? {}).filter(
      ([, value]) => typeof value === 'string' && value.length < 160
    )
  )
  return {
    language: typeof configuration?.language === 'string' ? configuration.language : 'zh-CN',
    dark: configuration?.dark === true,
    theme: typeof configuration?.theme === 'string' ? configuration.theme : 'light',
    colors
  }
}

export const isDrawioFile = (pathname: string): boolean =>
  typeof pathname === 'string' && path.extname(pathname).toLowerCase() === DRAWIO_EXTENSION

const normalizeDrawioPath = (pathname: string): string => {
  const normalized = path.normalize(pathname)
  if (!isDrawioFile(normalized)) throw new Error(`不是 Draw.io 文件: ${pathname}`)
  return normalized
}

const findDrawioWebapp = (): string | null => {
  const candidates = [
    path.join(process.resourcesPath, 'drawio'),
    path.resolve(process.cwd(), 'src/drawioWebApp/drawio'),
    path.resolve(__dirname, '../drawioWebApp/drawio'),
    path.resolve(__dirname, '../../src/drawioWebApp/drawio')
  ]
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'index.html'))) ?? null
}

const getDrawioLanguage = (language: string): string => {
  const normalized = language.trim().toLowerCase()
  if (normalized === 'zh-cn' || normalized === 'zh_hans') return 'zh'
  if (normalized === 'zh-tw' || normalized === 'zh_hant') return 'zh-tw'
  return normalized || 'zh'
}

const getDrawioFrameUrl = (configuration: DrawioConfiguration): string => {
  const webapp = findDrawioWebapp()
  if (!webapp) {
    throw new Error(
      '找不到 Draw.io Web 引擎。请确认 MarkNotePro 项目中的 packages/desktop/src/drawioWebApp 资源完整。'
    )
  }
  const url = new URL(pathToFileURL(path.join(webapp, 'index.html')).toString())
  url.searchParams.set('embed', '1')
  url.searchParams.set('proto', 'json')
  url.searchParams.set('spin', '1')
  url.searchParams.set('libraries', '1')
  // MarkNotePro owns saving and closing through the host protocol, so the
  // embedded editor must not render a duplicate save/exit control pair.
  url.searchParams.set('noSaveBtn', '1')
  url.searchParams.set('noExitBtn', '1')
  // Keep the full Draw.io interface, while locking its language and colour
  // mode to the MarkNotePro preferences instead of Draw.io local storage.
  url.searchParams.set('lang', getDrawioLanguage(configuration.language))
  url.searchParams.set('dark', configuration.dark ? '1' : '0')
  url.searchParams.set('marknoteproTheme', configuration.theme)
  url.searchParams.set('marknoteproThemeColors', JSON.stringify(configuration.colors))
  return url.toString()
}

const getHostHtml = (): string => `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>Draw.io</title>
<style>html,body,iframe{width:100%;height:100%;margin:0;border:0;overflow:hidden}body{background:#fff}</style>
</head><body><iframe id="drawio" title="Draw.io 绘图编辑器"></iframe><script>
const frame=document.getElementById('drawio')
let pendingFrameUrl=null
let frameReady=false
const postToDrawio=(message)=>{if(frame.contentWindow)frame.contentWindow.postMessage(JSON.stringify(message),'*')}
const loadFrame=(url)=>{if(typeof url!=='string'||!url)return;frameReady=false;frame.src=url}
const saveDiagram=async(xml)=>{const payload=window.__marknoteDrawioPayload;if(!payload||typeof xml!=='string')return;await window.electron.ipcRenderer.invoke('mt::drawio::save',xml);payload.xml=xml;postToDrawio({action:'status',messageKey:'allChangesSaved',modified:false});if(pendingFrameUrl){const next=pendingFrameUrl;pendingFrameUrl=null;payload.frameUrl=next;loadFrame(next)}}
window.electron.ipcRenderer.on('mt::drawio::init',(_event,payload)=>{window.__marknoteDrawioPayload=payload;loadFrame(payload.frameUrl)})
window.electron.ipcRenderer.on('mt::drawio::configure',(_event,payload)=>{const current=window.__marknoteDrawioPayload;if(!current)return;window.__marknoteDrawioPayload={...current,...payload};if(!frameReady){loadFrame(payload.frameUrl);return}pendingFrameUrl=payload.frameUrl;postToDrawio({action:'invokeAction',actionName:'save'})})
window.electron.ipcRenderer.on('mt::drawio::request-exit',()=>postToDrawio({action:'exit'}))
window.electron.ipcRenderer.on('mt::drawio::invoke-action',(_event,actionName)=>{if(typeof actionName==='string'&&actionName)postToDrawio({action:'invokeAction',actionName})})
window.electron.ipcRenderer.on('mt::drawio::request-save',()=>postToDrawio({action:'invokeAction',actionName:'save'}))
window.addEventListener('message',async(event)=>{if(!frame.contentWindow||event.source!==frame.contentWindow)return;let message;try{message=typeof event.data==='string'?JSON.parse(event.data):event.data}catch{return}if(!message)return;if(message.event==='init'){frameReady=true;const payload=window.__marknoteDrawioPayload||{};postToDrawio({action:'load',xml:payload.xml||'',title:payload.title||'Draw.io',autosave:1,saveAndExit:'0',modified:'unsavedChanges',exportProtocol:true})}else if(message.event==='save'){try{await saveDiagram(message.xml)}catch(error){console.error(error)}}else if(message.event==='autosave'){if(typeof message.xml==='string'&&window.__marknoteDrawioPayload)window.__marknoteDrawioPayload.xml=message.xml;window.electron.ipcRenderer.send('mt::drawio::state',{modified:true});if(window.__marknoteDrawioPayload?.autoSave){try{await saveDiagram(message.xml)}catch(error){console.error(error)}}}else if(message.event==='export'){try{await window.electron.ipcRenderer.invoke('mt::drawio::export',message)}catch(error){console.error(error)}}else if(message.event==='print'){try{await window.electron.ipcRenderer.invoke('mt::drawio::print',message)}catch(error){console.error(error)}}else if(message.event==='preview'){try{await window.electron.ipcRenderer.invoke('mt::drawio::preview',message)}catch(error){console.error(error)}}else if(message.event==='presentation'){try{await window.electron.ipcRenderer.invoke('mt::drawio::presentation',message)}catch(error){console.error(error)}}else if(message.event==='exit'){try{if(message.xml&&message.modified!==false)await saveDiagram(message.xml);await window.electron.ipcRenderer.invoke('mt::drawio::close')}catch(error){console.error(error)}}else if(message.event==='openLink'&&message.href){await window.electron.shell.openExternal(message.href)}})
</script></body></html>`

const exportExtensions: Record<string, string> = {
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp',
  gif: 'gif',
  svg: 'svg',
  pdf: 'pdf',
  html: 'html',
  xml: 'xml',
  drawio: 'drawio'
}

// Draw.io's canvas exporter normalizes JPEG to the internal protocol format
// `jpg`. Keep the public menu format as `jpeg`, but accept that protocol alias
// at the host boundary so the native save flow is reached.
const normalizeDrawioExportFormat = (format: string): string =>
  format.toLowerCase() === 'jpg' ? 'jpeg' : format

const getExportBuffer = (data: string): Buffer => {
  const dataUrl = /^data:[^,]*;base64,(.*)$/s.exec(data)
  return dataUrl ? Buffer.from(dataUrl[1], 'base64') : Buffer.from(data, 'utf8')
}

const getExportFilename = (entry: DrawioDocumentEntry, payload: DrawioExportPayload): string => {
  const extension = exportExtensions[payload.format]
  const baseName = path.basename(entry.filePath ?? 'drawing.drawio', DRAWIO_EXTENSION)
  const rawCandidate = typeof payload.filename === 'string' ? path.basename(payload.filename) : ''
  // Embedded Draw.io has no local filename and emits names such as `.png`.
  // Fall back to the active drawing name instead of presenting `.png.png`.
  const candidate = rawCandidate && !rawCandidate.startsWith('.') ? rawCandidate : ''
  const name = candidate || `${baseName}.${extension}`
  return path.extname(name).toLowerCase() === `.${extension}` ? name : `${name}.${extension}`
}

const createPrintWindow = async (svg: string): Promise<BrowserWindow> => {
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  const document = `<!doctype html><html><head><meta charset="UTF-8"><style>@page{margin:12mm}html,body{margin:0;padding:0;background:#fff}svg{display:block;max-width:100%;height:auto}</style></head><body>${svg}</body></html>`
  await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(document)}`)
  return printWindow
}

const showPreviewWindow = async (owner: BrowserWindow, svg: string): Promise<void> => {
  const previewWindow = new BrowserWindow({
    parent: owner,
    title: 'Draw.io 预览',
    width: 1040,
    height: 760,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  const document = `<!doctype html><html><head><meta charset="UTF-8"><style>html,body{height:100%;margin:0;background:#f4f4f4}body{display:grid;place-items:center;overflow:auto;padding:24px;box-sizing:border-box}svg{display:block;max-width:100%;max-height:100%;height:auto;background:#fff;box-shadow:0 1px 4px rgb(0 0 0 / 18%)}</style></head><body>${svg}</body></html>`
  await previewWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(document)}`)
}

const showPresentationWindow = async (owner: BrowserWindow, svg: string): Promise<void> => {
  const presentationWindow = new BrowserWindow({
    parent: owner,
    title: 'Draw.io 演示模式',
    fullscreen: true,
    backgroundColor: '#000000',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  const document = `<!doctype html><html><head><meta charset="UTF-8"><style>html,body{width:100%;height:100%;margin:0;background:#000}body{display:grid;place-items:center;overflow:hidden}svg{display:block;max-width:100%;max-height:100%;width:auto;height:auto;background:#fff}</style></head><body>${svg}<script>window.addEventListener('keydown',event=>{if(event.key==='Escape')window.close()})</script></body></html>`
  await presentationWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(document)}`)
}

const saveDrawioExport = async (
  owner: BrowserWindow,
  entry: DrawioDocumentEntry,
  payload: DrawioExportPayload
): Promise<void> => {
  const format =
    payload && typeof payload.format === 'string' ? normalizeDrawioExportFormat(payload.format) : ''
  if (!Object.prototype.hasOwnProperty.call(exportExtensions, format)) {
    throw new Error('不支持的 Draw.io 导出格式')
  }
  const data = typeof payload.data === 'string' ? payload.data : payload.xml
  if (typeof data !== 'string' || !data.length) throw new Error('Draw.io 未返回可导出的内容')

  const filename = getExportFilename(entry, { ...payload, format })
  const result = await dialog.showSaveDialog(owner, {
    title: '导出 Draw.io 绘图',
    defaultPath: path.join(path.dirname(entry.filePath ?? app.getPath('documents')), filename),
    filters: [{ name: format.toUpperCase(), extensions: [exportExtensions[format]] }]
  })
  if (!result.canceled && result.filePath)
    await fsPromises.writeFile(result.filePath, getExportBuffer(data))
}

const readDiagram = async (filePath: string): Promise<string> => {
  if (!(await fs.pathExists(filePath))) return EMPTY_DRAWIO
  const content = await fsPromises.readFile(filePath, 'utf8')
  if (content.trim()) return content
  await writeFile(filePath, EMPTY_DRAWIO, undefined, 'utf8')
  return EMPTY_DRAWIO
}

const normalizeBounds = (bounds: Rectangle): Rectangle => ({
  x: Math.max(0, Math.round(bounds.x)),
  y: Math.max(0, Math.round(bounds.y)),
  width: Math.max(1, Math.round(bounds.width)),
  height: Math.max(1, Math.round(bounds.height))
})

const getOrCreateWindowEntry = (win: BrowserWindow): DrawioWindowEntry => {
  const existing = views.get(win.id)
  if (existing) return existing
  const entry: DrawioWindowEntry = {
    documents: new Map(),
    activePath: null,
    autoSave: true,
    configuration: { language: 'zh-CN', dark: false, theme: 'light', colors: {} }
  }
  views.set(win.id, entry)
  win.on('closed', () => {
    const current = views.get(win.id)
    if (!current) return
    for (const document of current.documents.values()) {
      viewOwners.delete(document.view.webContents.id)
    }
    views.delete(win.id)
  })
  return entry
}

const createDocumentEntry = (win: BrowserWindow, filePath: string): DrawioDocumentEntry => {
  const view = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: false,
      preload: path.join(__dirname, '../preload/index.js')
    }
  })
  const entry: DrawioDocumentEntry = { view, filePath, loaded: false, saveWaiters: [] }
  getOrCreateWindowEntry(win).documents.set(filePath, entry)
  viewOwners.set(view.webContents.id, { windowId: win.id, filePath })
  view.webContents.on('did-fail-load', (_event, code, description, url) => {
    log.error(`Draw.io 加载失败: ${code} ${description} @ ${url}`)
  })
  view.webContents.on('render-process-gone', (_event, details) => {
    log.error('Draw.io 渲染进程异常退出:', details)
  })
  return entry
}

const ensureViewLoaded = async (entry: DrawioDocumentEntry): Promise<void> => {
  if (entry.loaded) return
  entry.loaded = true
  await entry.view.webContents.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(getHostHtml())}`
  )
}

const getActiveDocument = (win: BrowserWindow): DrawioDocumentEntry | undefined => {
  const windowEntry = views.get(win.id)
  return windowEntry?.activePath ? windowEntry.documents.get(windowEntry.activePath) : undefined
}

const showDrawioView = (win: BrowserWindow, bounds: Rectangle): void => {
  const entry = getActiveDocument(win)
  if (!entry) return
  if (!win.getBrowserViews().includes(entry.view)) win.addBrowserView(entry.view)
  entry.view.setBounds(normalizeBounds(bounds))
  // Keep previously opened Drawio views attached so switching tabs does not
  // tear down the native view. Only change the z-order to reveal the active
  // tab; this preserves its web state and removes the visible flash.
  win.setTopBrowserView(entry.view)
}

export const hideDrawioView = (win: BrowserWindow, closeTab = false): void => {
  const windowEntry = views.get(win.id)
  const entry = getActiveDocument(win)
  if (!windowEntry || !entry) return
  // All Drawio views may remain attached while switching between Drawio tabs,
  // so remove every view only when the editor switches back to Markdown.
  for (const document of windowEntry.documents.values()) {
    if (win.getBrowserViews().includes(document.view)) win.removeBrowserView(document.view)
  }
  // Tab changes only hide the BrowserView. The explicit Draw.io "Exit"
  // action is the sole caller that also closes the renderer tab.
  if (closeTab) win.webContents.send('mt::drawio::closed', { filePath: entry.filePath })
}

/** Invoke a built-in Draw.io action through the embed protocol. */
export const invokeDrawioAction = (win: BrowserWindow, actionName: string): void => {
  const entry = getActiveDocument(win)
  if (!entry || !actionName) return
  entry.view.webContents.send('mt::drawio::invoke-action', actionName)
}

/** Keep the native File menu's checkbox and Draw.io's own autosave state in sync. */
export const setDrawioAutosave = (win: BrowserWindow, enabled: boolean): void => {
  const entry = views.get(win.id)
  if (!entry || entry.autoSave === enabled) return
  entry.autoSave = enabled
  invokeDrawioAction(win, 'autosave')
  win.webContents.send('mt::drawio::autosave-changed', enabled)
}

const emitDrawioState = (
  win: BrowserWindow,
  entry: DrawioDocumentEntry,
  state: {
    modified: boolean
    isSaved: boolean
    isSaving: boolean
    saveError?: string
    lastSavedHash?: string
  }
): void => {
  win.webContents.send('mt::drawio::state', { filePath: entry.filePath, ...state })
}

const saveDocumentXml = async (
  win: BrowserWindow,
  entry: DrawioDocumentEntry,
  xml: string
): Promise<void> => {
  emitDrawioState(win, entry, { modified: true, isSaved: false, isSaving: true })
  try {
    await writeFile(entry.filePath, xml, undefined, 'utf-8')
    const lastSavedHash = crypto.createHash('sha256').update(xml, 'utf8').digest('hex')
    emitDrawioState(win, entry, {
      modified: false,
      isSaved: true,
      isSaving: false,
      lastSavedHash
    })
    const waiters = entry.saveWaiters.splice(0)
    waiters.forEach(({ resolve }) => resolve())
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    emitDrawioState(win, entry, {
      modified: true,
      isSaved: false,
      isSaving: false,
      saveError: message
    })
    const waiters = entry.saveWaiters.splice(0)
    waiters.forEach(({ reject }) => reject(error))
    throw error
  }
}

const requestDrawioSave = async (win: BrowserWindow, filePath: string): Promise<void> => {
  const windowEntry = views.get(win.id)
  const normalizedPath = normalizeDrawioPath(filePath)
  const entry = windowEntry?.documents.get(normalizedPath)
  if (!entry) throw new Error('找不到对应的 Draw.io 标签页')
  emitDrawioState(win, entry, { modified: true, isSaved: false, isSaving: true })
  await new Promise<void>((resolve, reject) => {
    entry.saveWaiters.push({ resolve, reject })
    entry.view.webContents.send('mt::drawio::request-save')
  })
}

export const saveDrawioDocuments = async (win: BrowserWindow, filePaths: string[]): Promise<void> => {
  await Promise.all(filePaths.map((filePath) => requestDrawioSave(win, filePath)))
}

const closeDrawioDocument = (win: BrowserWindow, filePath: string): void => {
  const windowEntry = views.get(win.id)
  const normalizedPath = normalizeDrawioPath(filePath)
  const entry = windowEntry?.documents.get(normalizedPath)
  if (!windowEntry || !entry) return
  if (win.getBrowserViews().includes(entry.view)) win.removeBrowserView(entry.view)
  viewOwners.delete(entry.view.webContents.id)
  windowEntry.documents.delete(normalizedPath)
  if (windowEntry.activePath === normalizedPath) windowEntry.activePath = null
}

export const openDrawioFile = async (
  pathname: string,
  owner?: BrowserWindow | null,
  configuration?: DrawioConfiguration
): Promise<void> => {
  const win = owner ?? BrowserWindow.getFocusedWindow()
  try {
    if (!win) throw new Error('请先打开 MarkNotePro 编辑窗口。')
    const filePath = normalizeDrawioPath(pathname)
    const windowEntry = getOrCreateWindowEntry(win)
    if (configuration) {
      windowEntry.configuration = normalizeDrawioConfiguration(configuration)
    }
    let entry = windowEntry.documents.get(filePath)
    if (!entry) {
      entry = createDocumentEntry(win, filePath)
      const [xml] = await Promise.all([readDiagram(filePath), ensureViewLoaded(entry)])
      entry.view.webContents.send('mt::drawio::init', {
        filePath,
        frameUrl: getDrawioFrameUrl(windowEntry.configuration),
        xml,
        title: path.basename(filePath),
        // MarkNotePro owns the delayed auto-save timer. Draw.io still emits
        // change snapshots, but must not write the file by itself.
        autoSave: false
      })
    } else {
      await ensureViewLoaded(entry)
    }
    windowEntry.activePath = filePath
    win.webContents.send('mt::drawio::opened', { filePath, title: path.basename(filePath) })
    emitDrawioState(win, entry, { modified: false, isSaved: true, isSaving: false })
  } catch (error) {
    log.error('打开 Draw.io 文件失败:', error)
    await dialog.showErrorBox(
      '无法打开绘图文件',
      error instanceof Error ? error.message : String(error)
    )
  }
}

export const createDrawioFile = async (owner?: BrowserWindow | null): Promise<void> => {
  const result = owner
    ? await dialog.showSaveDialog(owner, {
        title: '新建绘图',
        defaultPath: path.join(app.getPath('documents'), '未命名.drawio'),
        filters: [{ name: 'Draw.io 绘图', extensions: ['drawio'] }]
      })
    : await dialog.showSaveDialog({
        title: '新建绘图',
        defaultPath: path.join(app.getPath('documents'), '未命名.drawio'),
        filters: [{ name: 'Draw.io 绘图', extensions: ['drawio'] }]
      })
  if (result.canceled || !result.filePath) return
  const filePath = isDrawioFile(result.filePath)
    ? result.filePath
    : `${result.filePath}${DRAWIO_EXTENSION}`
  await writeFile(filePath, EMPTY_DRAWIO, undefined, 'utf8')
  await openDrawioFile(filePath, owner)
}

export const registerDrawioHandlers = (): void => {
  ipcMain.handle('mt::drawio::configure', (event, configuration: DrawioConfiguration) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (!owner) return
    // Cache the renderer's current preferences even before the first Drawio
    // BrowserView exists. File-menu and restored-tab opens can then build their
    // first frame URL from the real MarkNotePro settings.
    const entry = getOrCreateWindowEntry(owner)
    entry.configuration = normalizeDrawioConfiguration(configuration)
    for (const document of entry.documents.values()) {
      document.view.webContents.send('mt::drawio::configure', {
        frameUrl: getDrawioFrameUrl(entry.configuration)
      })
    }
  })
  ipcMain.handle(
    'mt::drawio::open',
    (event, pathname: string, configuration?: DrawioConfiguration) =>
      openDrawioFile(pathname, BrowserWindow.fromWebContents(event.sender), configuration)
  )
  ipcMain.handle('mt::drawio::show', (event, bounds: Rectangle) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) showDrawioView(win, bounds)
  })
  ipcMain.on('mt::drawio::set-bounds', (event, bounds: Rectangle) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) showDrawioView(win, bounds)
  })
  ipcMain.on('mt::drawio::hide', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) hideDrawioView(win)
  })
  ipcMain.on('mt::drawio::state', (event, state: { modified: boolean }) => {
    const owner = viewOwners.get(event.sender.id)
    if (!owner) return
    const win = BrowserWindow.fromId(owner.windowId)
    const entry = win ? views.get(owner.windowId)?.documents.get(owner.filePath) : undefined
    if (win && entry) {
      emitDrawioState(win, entry, {
        modified: state.modified === true,
        isSaved: state.modified !== true,
        isSaving: false
      })
    }
  })
  ipcMain.handle('mt::drawio::save', async (event, xml: string) => {
    const owner = viewOwners.get(event.sender.id)
    const win = owner ? BrowserWindow.fromId(owner.windowId) : undefined
    const entry = owner && win ? views.get(owner.windowId)?.documents.get(owner.filePath) : undefined
    if (!win || !entry || typeof xml !== 'string') throw new Error('无效的 Draw.io 保存请求')
    await saveDocumentXml(win, entry, xml)
  })
  ipcMain.handle('mt::drawio::save-request', async (event, filePath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || typeof filePath !== 'string') throw new Error('无效的 Draw.io 保存请求')
    await requestDrawioSave(win, filePath)
  })
  ipcMain.handle('mt::drawio::close-file', (event, filePath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && typeof filePath === 'string') closeDrawioDocument(win, filePath)
  })
  ipcMain.handle('mt::drawio::export', async (event, payload: DrawioExportPayload) => {
    const viewOwner = viewOwners.get(event.sender.id)
    const owner = viewOwner === undefined ? undefined : BrowserWindow.fromId(viewOwner.windowId)
    const entry = viewOwner && owner ? views.get(viewOwner.windowId)?.documents.get(viewOwner.filePath) : undefined
    if (!owner || !entry) throw new Error('无效的 Draw.io 导出请求')

    if (payload?.format === 'pdf') {
      const svg = typeof payload.data === 'string' ? payload.data : payload.xml
      if (typeof svg !== 'string' || !svg.length) throw new Error('Draw.io 未返回可打印内容')
      const filename = getExportFilename(entry, payload)
      const result = await dialog.showSaveDialog(owner, {
        title: '导出 Draw.io PDF',
        defaultPath: path.join(path.dirname(entry.filePath), filename),
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      })
      if (!result.canceled && result.filePath) {
        const printWindow = await createPrintWindow(svg)
        try {
          const pdf = await printWindow.webContents.printToPDF({ printBackground: true })
          await fsPromises.writeFile(result.filePath, pdf)
        } finally {
          if (!printWindow.isDestroyed()) printWindow.destroy()
        }
      }
      return
    }

    await saveDrawioExport(owner, entry, payload)
  })
  ipcMain.handle('mt::drawio::print', async (event, payload: DrawioExportPayload) => {
    const ownerId = viewOwners.get(event.sender.id)?.windowId
    const owner = ownerId === undefined ? undefined : BrowserWindow.fromId(ownerId)
    const svg = typeof payload?.data === 'string' ? payload.data : payload?.xml
    if (!owner || typeof svg !== 'string' || !svg.length) throw new Error('无效的 Draw.io 打印请求')
    const printWindow = await createPrintWindow(svg)
    printWindow.webContents.print({ printBackground: true }, () => {
      if (!printWindow.isDestroyed()) printWindow.destroy()
    })
  })
  ipcMain.handle('mt::drawio::preview', async (event, payload: DrawioExportPayload) => {
    const ownerId = viewOwners.get(event.sender.id)?.windowId
    const owner = ownerId === undefined ? undefined : BrowserWindow.fromId(ownerId)
    const svg = typeof payload?.data === 'string' ? payload.data : payload?.xml
    if (!owner || typeof svg !== 'string' || !svg.length) throw new Error('无效的 Draw.io 预览请求')
    await showPreviewWindow(owner, svg)
  })
  ipcMain.handle('mt::drawio::presentation', async (event, payload: DrawioExportPayload) => {
    const ownerId = viewOwners.get(event.sender.id)?.windowId
    const owner = ownerId === undefined ? undefined : BrowserWindow.fromId(ownerId)
    const svg = typeof payload?.data === 'string' ? payload.data : payload?.xml
    if (!owner || typeof svg !== 'string' || !svg.length) throw new Error('无效的 Draw.io 演示请求')
    await showPresentationWindow(owner, svg)
  })
  ipcMain.handle('mt::drawio::close', (event) => {
    const viewOwner = viewOwners.get(event.sender.id)
    if (!viewOwner) return
    const win = BrowserWindow.fromId(viewOwner.windowId)
    if (win) {
      closeDrawioDocument(win, viewOwner.filePath)
      win.webContents.send('mt::drawio::closed', { filePath: viewOwner.filePath })
    }
  })
}
