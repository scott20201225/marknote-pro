import fs from 'fs-extra'
import fsPromises from 'fs/promises'
import path from 'path'
import { pathToFileURL } from 'url'
import { app, BrowserView, BrowserWindow, dialog, ipcMain } from 'electron'
import type { Rectangle } from 'electron'
import log from 'electron-log'
import type { DrawioConfiguration } from '../../shared/types/ipc'

const DRAWIO_EXTENSION = '.drawio'
const DRAWIO_RESOURCE_ENV = 'MARKNOTEPRO_DRAWIO_WEBAPP'
const EMPTY_DRAWIO =
  '<mxfile host="MarkNotePro"><diagram id="page-1" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>'

interface DrawioViewEntry {
  view: BrowserView
  filePath: string | null
  xml: string
  loaded: boolean
  configuration: DrawioConfiguration
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
    process.env[DRAWIO_RESOURCE_ENV],
    path.join(process.resourcesPath, 'drawio'),
    path.resolve(process.cwd(), '../../../drawio/src/main/webapp'),
    path.resolve(process.cwd(), '../../drawio/src/main/webapp'),
    path.resolve(process.cwd(), '../drawio/src/main/webapp'),
    path.resolve(__dirname, '../../../../../drawio/src/main/webapp')
  ].filter((candidate): candidate is string => !!candidate)
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
      `找不到 Draw.io Web 引擎。请设置 ${DRAWIO_RESOURCE_ENV}，或将 drawio 放在 MarkNotePro 同级目录。`
    )
  }
  const url = new URL(pathToFileURL(path.join(webapp, 'index.html')).toString())
  url.searchParams.set('embed', '1')
  url.searchParams.set('proto', 'json')
  url.searchParams.set('spin', '1')
  url.searchParams.set('libraries', '1')
  // Keep the full Draw.io interface, while locking its language and colour
  // mode to the MarkNotePro preferences instead of Draw.io local storage.
  url.searchParams.set('lang', getDrawioLanguage(configuration.language))
  url.searchParams.set('dark', configuration.dark ? '1' : '0')
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
window.addEventListener('message',async(event)=>{if(!frame.contentWindow||event.source!==frame.contentWindow)return;let message;try{message=typeof event.data==='string'?JSON.parse(event.data):event.data}catch{return}if(!message)return;if(message.event==='init'){const payload=window.__marknoteDrawioPayload||{};postToDrawio({action:'load',xml:payload.xml||'',title:payload.title||'Draw.io',autosave:1,saveAndExit:'0',modified:'unsavedChanges',exportProtocol:true})}else if(message.event==='save'||message.event==='autosave'){try{await saveDiagram(message.xml)}catch(error){console.error(error)}}else if(message.event==='exit'){try{if(message.xml&&message.modified!==false)await saveDiagram(message.xml);await window.electron.ipcRenderer.invoke('mt::drawio::close')}catch(error){console.error(error)}}else if(message.event==='openLink'&&message.href){await window.electron.shell.openExternal(message.href)}})
</script></body></html>`

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
    configuration: { language: 'zh-CN', dark: false }
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
      title: path.basename(filePath)
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
    entry.configuration = {
      language: typeof configuration?.language === 'string' ? configuration.language : 'zh-CN',
      dark: configuration?.dark === true
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
  ipcMain.handle('mt::drawio::close', (event) => {
    const ownerId = viewOwners.get(event.sender.id)
    if (ownerId === undefined) return
    const win = BrowserWindow.fromId(ownerId)
    if (win) hideDrawioView(win, true)
  })
}
