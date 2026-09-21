import fs from 'fs-extra'
import fsPromises from 'fs/promises'
import path from 'path'
import { pathToFileURL } from 'url'
import { app, BrowserView, BrowserWindow, dialog, ipcMain } from 'electron'
import type { Rectangle } from 'electron'
import log from 'electron-log'
import type { DrawioConfiguration } from '../../shared/types/ipc'

const DRAWIO_EXTENSION = '.drawio'
const EMPTY_DRAWIO =
  '<mxfile host="MarkNotePro"><diagram id="page-1" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>'

interface DrawioViewEntry {
  view: BrowserView
  filePath: string | null
  xml: string
  loaded: boolean
  autoSave: boolean
  configuration: DrawioConfiguration
}

interface DrawioExportPayload {
  format: string
  filename?: string
  data?: string
  xml?: string
}

const views = new Map<number, DrawioViewEntry>()
const viewOwners = new Map<number, number>()

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
const postToDrawio=(message)=>{if(frame.contentWindow)frame.contentWindow.postMessage(JSON.stringify(message),'*')}
const saveDiagram=async(xml)=>{const payload=window.__marknoteDrawioPayload;if(!payload||typeof xml!=='string')return;await window.electron.ipcRenderer.invoke('mt::drawio::save',xml);payload.xml=xml;postToDrawio({action:'status',messageKey:'allChangesSaved',modified:false})}
window.electron.ipcRenderer.on('mt::drawio::init',(_event,payload)=>{window.__marknoteDrawioPayload=payload;frame.src=payload.frameUrl})
window.electron.ipcRenderer.on('mt::drawio::configure',(_event,payload)=>{const current=window.__marknoteDrawioPayload;if(!current)return;window.__marknoteDrawioPayload={...current,...payload};frame.src=payload.frameUrl})
window.electron.ipcRenderer.on('mt::drawio::request-exit',()=>postToDrawio({action:'exit'}))
window.electron.ipcRenderer.on('mt::drawio::invoke-action',(_event,actionName)=>{if(typeof actionName==='string'&&actionName)postToDrawio({action:'invokeAction',actionName})})
window.addEventListener('message',async(event)=>{if(!frame.contentWindow||event.source!==frame.contentWindow)return;let message;try{message=typeof event.data==='string'?JSON.parse(event.data):event.data}catch{return}if(!message)return;if(message.event==='init'){const payload=window.__marknoteDrawioPayload||{};postToDrawio({action:'load',xml:payload.xml||'',title:payload.title||'Draw.io',autosave:payload.autoSave?1:0,saveAndExit:'0',modified:'unsavedChanges',exportProtocol:true})}else if(message.event==='save'||message.event==='autosave'){try{await saveDiagram(message.xml)}catch(error){console.error(error)}}else if(message.event==='export'){try{await window.electron.ipcRenderer.invoke('mt::drawio::export',message)}catch(error){console.error(error)}}else if(message.event==='print'){try{await window.electron.ipcRenderer.invoke('mt::drawio::print',message)}catch(error){console.error(error)}}else if(message.event==='preview'){try{await window.electron.ipcRenderer.invoke('mt::drawio::preview',message)}catch(error){console.error(error)}}else if(message.event==='presentation'){try{await window.electron.ipcRenderer.invoke('mt::drawio::presentation',message)}catch(error){console.error(error)}}else if(message.event==='exit'){try{if(message.xml&&message.modified!==false)await saveDiagram(message.xml);await window.electron.ipcRenderer.invoke('mt::drawio::close')}catch(error){console.error(error)}}else if(message.event==='openLink'&&message.href){await window.electron.shell.openExternal(message.href)}})
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

const getExportBuffer = (data: string): Buffer => {
  const dataUrl = /^data:[^,]*;base64,(.*)$/s.exec(data)
  return dataUrl ? Buffer.from(dataUrl[1], 'base64') : Buffer.from(data, 'utf8')
}

const getExportFilename = (entry: DrawioViewEntry, payload: DrawioExportPayload): string => {
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
  entry: DrawioViewEntry,
  payload: DrawioExportPayload
): Promise<void> => {
  if (!payload || !Object.prototype.hasOwnProperty.call(exportExtensions, payload.format)) {
    throw new Error('不支持的 Draw.io 导出格式')
  }
  const data = typeof payload.data === 'string' ? payload.data : payload.xml
  if (typeof data !== 'string' || !data.length) throw new Error('Draw.io 未返回可导出的内容')

  const filename = getExportFilename(entry, payload)
  const result = await dialog.showSaveDialog(owner, {
    title: '导出 Draw.io 绘图',
    defaultPath: path.join(path.dirname(entry.filePath ?? app.getPath('documents')), filename),
    filters: [{ name: payload.format.toUpperCase(), extensions: [exportExtensions[payload.format]] }]
  })
  if (!result.canceled && result.filePath) await fsPromises.writeFile(result.filePath, getExportBuffer(data))
}

const readDiagram = async (filePath: string): Promise<string> => {
  if (!(await fs.pathExists(filePath))) return EMPTY_DRAWIO
  const content = await fsPromises.readFile(filePath, 'utf8')
  if (content.trim()) return content
  await fsPromises.writeFile(filePath, EMPTY_DRAWIO, 'utf8')
  return EMPTY_DRAWIO
}

const normalizeBounds = (bounds: Rectangle): Rectangle => ({
  x: Math.max(0, Math.round(bounds.x)),
  y: Math.max(0, Math.round(bounds.y)),
  width: Math.max(1, Math.round(bounds.width)),
  height: Math.max(1, Math.round(bounds.height))
})

const getOrCreateView = (win: BrowserWindow): DrawioViewEntry => {
  const existing = views.get(win.id)
  if (existing) return existing
  const view = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: false,
      preload: path.join(__dirname, '../preload/index.js')
    }
  })
  const entry: DrawioViewEntry = {
    view,
    filePath: null,
    xml: EMPTY_DRAWIO,
    loaded: false,
    autoSave: true,
    configuration: { language: 'zh-CN', dark: false, theme: 'light', colors: {} }
  }
  views.set(win.id, entry)
  viewOwners.set(view.webContents.id, win.id)
  view.webContents.on('did-fail-load', (_event, code, description, url) => {
    log.error(`Draw.io 加载失败: ${code} ${description} @ ${url}`)
  })
  view.webContents.on('render-process-gone', (_event, details) => {
    log.error('Draw.io 渲染进程异常退出:', details)
  })
  win.on('closed', () => {
    if (views.get(win.id)?.view === view) {
      views.delete(win.id)
      viewOwners.delete(view.webContents.id)
    }
  })
  return entry
}

const ensureViewLoaded = async (entry: DrawioViewEntry): Promise<void> => {
  if (entry.loaded) return
  entry.loaded = true
  await entry.view.webContents.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(getHostHtml())}`
  )
}

const showDrawioView = (win: BrowserWindow, bounds: Rectangle): void => {
  const entry = views.get(win.id)
  if (!entry?.filePath) return
  if (!win.getBrowserViews().includes(entry.view)) win.addBrowserView(entry.view)
  entry.view.setBounds(normalizeBounds(bounds))
}

export const hideDrawioView = (win: BrowserWindow, closeTab = false): void => {
  const entry = views.get(win.id)
  if (!entry) return
  if (win.getBrowserViews().includes(entry.view)) win.removeBrowserView(entry.view)
  // Tab changes only hide the BrowserView. The explicit Draw.io "Exit"
  // action is the sole caller that also closes the renderer tab.
  if (closeTab) win.webContents.send('mt::drawio::closed')
}

/** Invoke a built-in Draw.io action through the embed protocol. */
export const invokeDrawioAction = (win: BrowserWindow, actionName: string): void => {
  const entry = views.get(win.id)
  if (!entry?.filePath || !actionName) return
  entry.view.webContents.send('mt::drawio::invoke-action', actionName)
}

/** Keep the native File menu's checkbox and Draw.io's own autosave state in sync. */
export const setDrawioAutosave = (win: BrowserWindow, enabled: boolean): void => {
  const entry = views.get(win.id)
  if (!entry?.filePath || entry.autoSave === enabled) return
  entry.autoSave = enabled
  invokeDrawioAction(win, 'autosave')
  win.webContents.send('mt::drawio::autosave-changed', enabled)
}

export const openDrawioFile = async (
  pathname: string,
  owner?: BrowserWindow | null
): Promise<void> => {
  const win = owner ?? BrowserWindow.getFocusedWindow()
  try {
    if (!win) throw new Error('请先打开 MarkNotePro 编辑窗口。')
    const filePath = normalizeDrawioPath(pathname)
    const entry = getOrCreateView(win)
    const [xml] = await Promise.all([readDiagram(filePath), ensureViewLoaded(entry)])
    entry.filePath = filePath
    entry.xml = xml
    entry.view.webContents.send('mt::drawio::init', {
      filePath,
      frameUrl: getDrawioFrameUrl(entry.configuration),
      xml,
      title: path.basename(filePath),
      autoSave: entry.autoSave
    })
    win.webContents.send('mt::drawio::opened', { filePath, title: path.basename(filePath) })
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
  await fsPromises.writeFile(filePath, EMPTY_DRAWIO, 'utf8')
  await openDrawioFile(filePath, owner)
}

export const registerDrawioHandlers = (): void => {
  ipcMain.handle('mt::drawio::configure', (event, configuration: DrawioConfiguration) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    const entry = owner ? views.get(owner.id) : undefined
    if (!entry || !entry.filePath) return
    const colors = Object.fromEntries(
      Object.entries(configuration?.colors ?? {}).filter(
        ([, value]) => typeof value === 'string' && value.length < 160
      )
    )
    entry.configuration = {
      language: typeof configuration?.language === 'string' ? configuration.language : 'zh-CN',
      dark: configuration?.dark === true,
      theme: typeof configuration?.theme === 'string' ? configuration.theme : 'light',
      colors
    }
    entry.view.webContents.send('mt::drawio::configure', {
      frameUrl: getDrawioFrameUrl(entry.configuration),
      xml: entry.xml
    })
  })
  ipcMain.handle('mt::drawio::open', (event, pathname: string) =>
    openDrawioFile(pathname, BrowserWindow.fromWebContents(event.sender))
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
  ipcMain.handle('mt::drawio::save', async (event, xml: string) => {
    const ownerId = viewOwners.get(event.sender.id)
    const entry = ownerId === undefined ? undefined : views.get(ownerId)
    if (!entry?.filePath || typeof xml !== 'string') throw new Error('无效的 Draw.io 保存请求')
    await fsPromises.writeFile(entry.filePath, xml, 'utf8')
    entry.xml = xml
  })
  ipcMain.handle('mt::drawio::export', async (event, payload: DrawioExportPayload) => {
    const ownerId = viewOwners.get(event.sender.id)
    const owner = ownerId === undefined ? undefined : BrowserWindow.fromId(ownerId)
    const entry = ownerId === undefined ? undefined : views.get(ownerId)
    if (!owner || !entry?.filePath) throw new Error('无效的 Draw.io 导出请求')

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
    const ownerId = viewOwners.get(event.sender.id)
    const owner = ownerId === undefined ? undefined : BrowserWindow.fromId(ownerId)
    const svg = typeof payload?.data === 'string' ? payload.data : payload?.xml
    if (!owner || typeof svg !== 'string' || !svg.length) throw new Error('无效的 Draw.io 打印请求')
    const printWindow = await createPrintWindow(svg)
    printWindow.webContents.print({ printBackground: true }, () => {
      if (!printWindow.isDestroyed()) printWindow.destroy()
    })
  })
  ipcMain.handle('mt::drawio::preview', async (event, payload: DrawioExportPayload) => {
    const ownerId = viewOwners.get(event.sender.id)
    const owner = ownerId === undefined ? undefined : BrowserWindow.fromId(ownerId)
    const svg = typeof payload?.data === 'string' ? payload.data : payload?.xml
    if (!owner || typeof svg !== 'string' || !svg.length) throw new Error('无效的 Draw.io 预览请求')
    await showPreviewWindow(owner, svg)
  })
  ipcMain.handle('mt::drawio::presentation', async (event, payload: DrawioExportPayload) => {
    const ownerId = viewOwners.get(event.sender.id)
    const owner = ownerId === undefined ? undefined : BrowserWindow.fromId(ownerId)
    const svg = typeof payload?.data === 'string' ? payload.data : payload?.xml
    if (!owner || typeof svg !== 'string' || !svg.length) throw new Error('无效的 Draw.io 演示请求')
    await showPresentationWindow(owner, svg)
  })
  ipcMain.handle('mt::drawio::close', (event) => {
    const ownerId = viewOwners.get(event.sender.id)
    if (ownerId === undefined) return
    const win = BrowserWindow.fromId(ownerId)
    if (win) hideDrawioView(win, true)
  })
}
