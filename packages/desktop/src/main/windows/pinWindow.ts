import path from 'path'
import url from 'url'
import fs from 'fs'
import fsPromises from 'fs/promises'
import { app, BrowserWindow, dialog, nativeImage, clipboard, screen, nativeTheme } from 'electron'
import log from 'electron-log'
import type { PinWindowPayload } from '@shared/types/clipboard'
import { isOsx } from '../config'
import { getMacNativeHelper } from './macNativeHelper'

export class PinWindowManager {
  private _windows: Map<string, BrowserWindow> = new Map()
  private _payloads: Map<string, PinWindowPayload> = new Map()
  private _winToPinId: Map<number, string> = new Map()
  private _toolbarWindows: Map<string, BrowserWindow> = new Map()

  constructor() {
    if (isOsx) {
      try {
        const helper = getMacNativeHelper()
        helper.addEventListener((event) => {
          if (event.event === 'edit' && event.pinId) {
            const payload = this._payloads.get(event.pinId)
            if (payload) {
              log.info(`[PinWindowManager] User requested edit on native pin: ${event.pinId}`)
              this.createElectronPinWindow(payload)
            }
          } else if (event.event === 'closed' && event.pinId) {
            this._payloads.delete(event.pinId)
          }
        })
      } catch (err) {
        log.warn('[PinWindowManager] Failed to initialize MacNativeHelper listener:', err)
      }
    }

    app.whenReady().then(() => {
      screen.on('display-metrics-changed', () => {
        for (const [pinId] of this._toolbarWindows.entries()) {
          this.repositionToolbar(pinId)
        }
      })
    })
  }

  public createPinWindow(payload: PinWindowPayload, forceNative?: boolean): BrowserWindow | null {
    const pinId = payload.id || `pin_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    payload.id = pinId
    this._payloads.set(pinId, payload)

    // On macOS, always use Lark-style native Cocoa pin mode for images (markdown pin, clipboard pin, capture pin)!
    if (isOsx && payload.type === 'image') {
      const cursorPoint = screen.getCursorScreenPoint()
      const currentDisplay = screen.getDisplayNearestPoint(cursorPoint)
      const scaleFactor = currentDisplay.scaleFactor || 1

      const maxW = Math.round(currentDisplay.workArea.width * 0.95)
      const maxH = Math.round(currentDisplay.workArea.height * 0.95)
      let w = payload.width || 400
      let h = payload.height || 300

      if (scaleFactor > 1 && (w > maxW || h > maxH)) {
        w = Math.round(w / scaleFactor)
        h = Math.round(h / scaleFactor)
      }

      if (w > maxW || h > maxH) {
        const scale = Math.min(maxW / w, maxH / h)
        w = Math.round(w * scale)
        h = Math.round(h * scale)
      }

      const width = Math.min(Math.max(w, 20), currentDisplay.workArea.width)
      const height = Math.min(Math.max(h, 20), currentDisplay.workArea.height)

      const posX =
        payload.x !== undefined
          ? payload.x
          : Math.round(currentDisplay.workArea.x + (currentDisplay.workArea.width - width) / 2)
      const posY =
        payload.y !== undefined
          ? payload.y
          : Math.round(currentDisplay.workArea.y + (currentDisplay.workArea.height - height) / 2)

      let imagePath = ''
      let base64 = ''
      let candidatePath = payload.content || ''
      if (candidatePath.startsWith('file://')) {
        try {
          candidatePath = decodeURIComponent(candidatePath.replace(/^file:\/\//, ''))
        } catch {}
      }
      if (candidatePath.startsWith('data:image')) {
        base64 = candidatePath
      } else if (fs.existsSync(candidatePath)) {
        imagePath = candidatePath
      } else {
        base64 = candidatePath
      }

      const helper = getMacNativeHelper()
      const ok = helper.pin({
        pinId,
        imagePath,
        base64,
        x: posX,
        y: posY,
        width,
        height,
        markdownMeta: payload.markdownMeta
      })
      if (ok) {
        log.info(`[PinWindowManager] Spawned native Cocoa pin: ${pinId}`)
        return null
      }
    }

    return this.createElectronPinWindow(payload)
  }

  public createElectronPinWindow(payload: PinWindowPayload): BrowserWindow {
    const pinId = payload.id || `pin_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    payload.id = pinId
    this._payloads.set(pinId, payload)

    const cursorPoint = screen.getCursorScreenPoint()
    const currentDisplay = screen.getDisplayNearestPoint(cursorPoint)
    const scaleFactor = currentDisplay.scaleFactor || 1

    const maxW = Math.round(currentDisplay.workArea.width * 0.95)
    const maxH = Math.round(currentDisplay.workArea.height * 0.95)
    let w = payload.width || 400
    let h = payload.height || 300

    // Convert raw physical pixels from capture/clipboard to logical points on Retina displays
    if (payload.type === 'image' && (payload.x === undefined || payload.y === undefined) && scaleFactor > 1 && (w > maxW || h > maxH)) {
      w = Math.round(w / scaleFactor)
      h = Math.round(h / scaleFactor)
    }

    if (w > maxW || h > maxH) {
      const scale = Math.min(maxW / w, maxH / h)
      w = Math.round(w * scale)
      h = Math.round(h * scale)
    }

    const width = Math.min(Math.max(w, 20), currentDisplay.workArea.width)
    const height = Math.min(Math.max(h, 20), currentDisplay.workArea.height)

    const posX =
      payload.x !== undefined
        ? payload.x
        : Math.round(currentDisplay.workArea.x + (currentDisplay.workArea.width - width) / 2)
    const posY =
      payload.y !== undefined
        ? payload.y
        : Math.round(currentDisplay.workArea.y + (currentDisplay.workArea.height - height) / 2)

    log.info(
      `[PinWindowManager] Creating pin window: ${pinId}, type: ${payload.type}, size: ${width}x${height}, pos: (${posX}, ${posY})`
    )

    const win = new BrowserWindow({
      width: Math.round(width),
      height: Math.round(height),
      x: Math.round(posX),
      y: Math.round(posY),
      type: isOsx ? 'panel' : undefined,
      frame: false,
      titleBarStyle: isOsx ? 'hidden' : undefined,
      trafficLightPosition: isOsx ? { x: -100, y: -100 } : undefined,
      resizable: true,
      movable: true,
      minimizable: false,
      maximizable: false,
      closable: true,
      fullscreen: false,
      fullscreenable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      enableLargerThanScreen: true,
      transparent: true,
      hasShadow: isOsx,
      thickFrame: isOsx ? undefined : false,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    // Pin windows stay above normal apps, but below the Clipboard History modal (which uses 'screen-saver')
    const topLevel = 'floating'
    win.setAlwaysOnTop(true, topLevel)
    win.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true
    })

    const baseUrl =
      process.env.NODE_ENV === 'development'
        ? process.env['ELECTRON_RENDERER_URL']!
        : `file://${path.join(__dirname, '../renderer/index.html')}`

    const url = new URL(baseUrl)
    url.searchParams.set('type', 'pin')
    url.searchParams.set('pinId', pinId)
    url.searchParams.set('wid', String(win.id))
    url.searchParams.set('theme', nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
    try {
      url.searchParams.set('udp', app.getPath('userData'))
    } catch {
      // ignore
    }
    url.hash = `/pin?pinId=${pinId}`

    const showAndFocus = (): void => {
      if (win.isDestroyed()) return
      try {
        win.setFullScreen(false)
      } catch {}
      win.setBounds({
        x: Math.round(posX),
        y: Math.round(posY),
        width: Math.round(width),
        height: Math.round(height)
      })
      if (!win.isVisible()) {
        // On macOS, attach an auxiliary pin window to the current full-screen
        // Space before giving its text input focus to the renderer.
        if (isOsx) {
          win.showInactive()
        } else {
          win.show()
        }
        win.focus()
        win.webContents?.focus()
      } else {
        win.focus()
        win.webContents?.focus()
      }
      win.webContents.send('mt::pin-window-data', payload)
    }

    win.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown') {
        if (
          input.key === 'Escape' ||
          ((input.meta || input.control) && (input.key === 'w' || input.key === 'W'))
        ) {
          event.preventDefault()
          this.closePin(pinId, win)
        }
      }
    })

    win.webContents.once('did-finish-load', () => {
      showAndFocus()
    })

    win.once('ready-to-show', () => {
      showAndFocus()
    })

    win.loadURL(url.toString())

    const syncToolbar = (): void => {
      const actualPinId = this._winToPinId.get(win.id)
      if (actualPinId && this._toolbarWindows.has(actualPinId)) {
        this.repositionToolbar(actualPinId)
      }
    }
    win.on('move', syncToolbar)
    win.on('moved', syncToolbar)
    win.on('resize', syncToolbar)

    win.on('closed', () => {
      this.closeEditToolbar(pinId)
      this._windows.delete(pinId)
      this._payloads.delete(pinId)
      this._winToPinId.delete(win.id)
      this.restoreEditorFocus()
    })

    this._windows.set(pinId, win)
    this._winToPinId.set(win.id, pinId)
    return win
  }

  public restoreEditorFocus(excludeWin?: BrowserWindow): void {
    // If there is another pin window open, focus that pin window (on Windows/Linux only to prevent macOS space jump)
    if (!isOsx) {
      for (const [, pinWin] of this._windows.entries()) {
        if (pinWin !== excludeWin && !pinWin.isDestroyed() && pinWin.isVisible()) {
          pinWin.focus()
          return
        }
      }
    }
    // When all pin windows are closed, never steal focus or switch Space to MarkNotePro!
  }

  public getPayload(pinId?: string, sourceWindow?: BrowserWindow): PinWindowPayload | null {
    if (pinId && this._payloads.has(pinId)) {
      return this._payloads.get(pinId) || null
    }
    if (sourceWindow && this._winToPinId.has(sourceWindow.id)) {
      const pid = this._winToPinId.get(sourceWindow.id)!
      return this._payloads.get(pid) || null
    }
    return null
  }

  public closePin(pinId?: string, sourceWindow?: BrowserWindow): void {
    if (isOsx && pinId) {
      try {
        getMacNativeHelper().closePin(pinId)
      } catch {}
    }
    let win = (pinId ? this._windows.get(pinId) : sourceWindow) || sourceWindow
    if (!win && pinId) {
      for (const [wId, pId] of this._winToPinId.entries()) {
        if (pId === pinId) {
          win = BrowserWindow.fromId(wId) || undefined
          break
        }
      }
    }
    if (win) {
      const actualPinId = pinId || this._winToPinId.get(win.id)
      if (actualPinId) {
        this.closeEditToolbar(actualPinId)
        this._windows.delete(actualPinId)
        this._payloads.delete(actualPinId)
      }
      this._winToPinId.delete(win.id)
      this.restoreEditorFocus(win)
      if (!win.isDestroyed()) {
        try {
          win.setVisibleOnAllWorkspaces(false, { skipTransformProcessType: true })
        } catch {}
        win.destroy()
      }
    }
  }

  public dragWindow(dx: number, dy: number, pinId?: string, sourceWindow?: BrowserWindow): void {
    const win = (pinId ? this._windows.get(pinId) : sourceWindow) || sourceWindow
    if (!win || win.isDestroyed()) return
    const [currX, currY] = win.getPosition()
    win.setPosition(Math.round(currX + dx), Math.round(currY + dy))

    const actualPinId = pinId || this._winToPinId.get(win.id)
    if (actualPinId) {
      const tbWin = this._toolbarWindows.get(actualPinId)
      if (tbWin && !tbWin.isDestroyed()) {
        const [tbX, tbY] = tbWin.getPosition()
        tbWin.setPosition(Math.round(tbX + dx), Math.round(tbY + dy))
      }
    }
  }

  public getBounds(
    pinId?: string,
    sourceWindow?: BrowserWindow
  ): { x: number; y: number; width: number; height: number } | null {
    const win = (pinId ? this._windows.get(pinId) : sourceWindow) || sourceWindow
    if (!win || win.isDestroyed()) return null
    const [x, y] = win.getPosition()
    const [width, height] = win.getSize()
    return { x, y, width, height }
  }

  public resizeWindow(
    bounds: { x: number; y: number; width: number; height: number },
    pinId?: string,
    sourceWindow?: BrowserWindow
  ): void {
    const win = (pinId ? this._windows.get(pinId) : sourceWindow) || sourceWindow
    if (!win || win.isDestroyed()) return
    win.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.max(20, Math.round(bounds.width)),
      height: Math.max(20, Math.round(bounds.height))
    })

    const actualPinId = pinId || this._winToPinId.get(win.id)
    if (actualPinId) {
      this.repositionToolbar(actualPinId, bounds)
    }
  }

  public fitSize(
    pinId?: string,
    naturalWidth?: number,
    naturalHeight?: number,
    zoom: number = 1.0,
    sourceWindow?: BrowserWindow
  ): void {
    const win = (pinId ? this._windows.get(pinId) : sourceWindow) || sourceWindow
    if (!win || win.isDestroyed() || !naturalWidth || !naturalHeight) return

    const [winX, winY] = win.getPosition()
    const [winW, winH] = win.getSize()
    const currentDisplay = screen.getDisplayNearestPoint({ x: winX, y: winY })
    const scaleFactor = currentDisplay.scaleFactor || 1

    const aspectRatio = naturalWidth / naturalHeight

    const baseW = naturalWidth / scaleFactor
    let targetW = Math.round(baseW * zoom)
    // Keep minimum 20px and maximum 10000px
    targetW = Math.max(Math.min(targetW, 10000), 20)
    let targetH = Math.max(20, Math.round(targetW / aspectRatio))

    const centerX = winX + winW / 2
    const centerY = winY + winH / 2
    const newX = Math.round(centerX - targetW / 2)
    const newY = Math.round(centerY - targetH / 2)

    const newBounds = {
      x: newX,
      y: newY,
      width: targetW,
      height: targetH
    }
    win.setBounds(newBounds)

    const actualPinId = pinId || this._winToPinId.get(win.id)
    if (actualPinId) {
      this.repositionToolbar(actualPinId, newBounds)
    }
  }

  public setAlwaysOnTop(flag: boolean, pinId?: string, sourceWindow?: BrowserWindow): void {
    const win = (pinId ? this._windows.get(pinId) : sourceWindow) || sourceWindow
    if (!win || win.isDestroyed()) return
    win.setAlwaysOnTop(flag, 'floating')
  }

  public focusPinWindow(pinId: string): void {
    const win = this._windows.get(pinId)
    if (win && !win.isDestroyed()) {
      win.focus()
      win.webContents?.focus()
    }
  }

  public setTextEditingMode(active: boolean, pinId?: string, sourceWindow?: BrowserWindow): void {
    const win = (pinId ? this._windows.get(pinId) : sourceWindow) || sourceWindow
    if (!win || win.isDestroyed()) return

    if (active) {
      try {
        win.setAlwaysOnTop(true, 'floating')
      } catch {}
      if (isOsx) {
        // Re-attach before focusing the textarea. A normal show/focus sequence
        // can leave the IME candidate panel in MarkNotePro's original Space.
        try {
          win.setVisibleOnAllWorkspaces(true, {
            visibleOnFullScreen: true,
            skipTransformProcessType: true
          })
          win.show()
          win.moveTop()
        } catch {}
      }
      win.focus()
      win.webContents?.focus()
    }
  }

  public async saveImage(content: string, sourceWindow?: BrowserWindow): Promise<string | null> {
    try {
      if (!content) return null
      const targetWin = sourceWindow || BrowserWindow.getFocusedWindow() || undefined

      const isText =
        !content.startsWith('data:image/') &&
        !content.startsWith('file://') &&
        !fs.existsSync(content)

      const { filePath, canceled } = await dialog.showSaveDialog(targetWin!, {
        title: isText ? '保存文本' : '保存贴图',
        defaultPath: isText ? `pin_${Date.now()}.txt` : `pin_${Date.now()}.png`,
        filters: isText
          ? [{ name: 'Text Document', extensions: ['txt'] }]
          : [{ name: 'PNG Image', extensions: ['png'] }, { name: 'JPEG Image', extensions: ['jpg'] }]
      })

      if (canceled || !filePath) return null

      if (content.startsWith('data:image/')) {
        const img = nativeImage.createFromDataURL(content)
        await fsPromises.writeFile(filePath, img.toPNG())
      } else if (content.startsWith('file://')) {
        const srcPath = url.fileURLToPath(content)
        await fsPromises.copyFile(srcPath, filePath)
      } else if (fs.existsSync(content)) {
        await fsPromises.copyFile(content, filePath)
      } else {
        await fsPromises.writeFile(filePath, content, 'utf-8')
      }
      return filePath
    } catch (err) {
      log.error('[PinWindowManager] Failed to save pinned image:', err)
      return null
    }
  }

  public copyImage(content: string): boolean {
    try {
      if (!content) return false

      let img = nativeImage.createEmpty()
      if (content.startsWith('data:image/')) {
        img = nativeImage.createFromDataURL(content)
      } else if (content.startsWith('file://')) {
        try {
          const filePath = url.fileURLToPath(content)
          img = nativeImage.createFromPath(filePath)
        } catch {}
      } else if (fs.existsSync(content)) {
        img = nativeImage.createFromPath(content)
      }

      if (!img.isEmpty()) {
        clipboard.writeImage(img)
        log.info('[PinWindowManager] Successfully copied pinned image to clipboard')
        return true
      }

      // Fallback for text/code pin
      clipboard.writeText(content)
      log.info('[PinWindowManager] Successfully copied pinned text to clipboard')
      return true
    } catch (err) {
      log.error('[PinWindowManager] Failed to copy pinned image:', err)
      return false
    }
  }

  public repositionToolbar(
    pinId: string,
    bounds?: { x: number; y: number; width: number; height: number }
  ): void {
    const tbWin = this._toolbarWindows.get(pinId)
    if (!tbWin || tbWin.isDestroyed()) return

    const pinWin = this._windows.get(pinId)
    if (!pinWin || pinWin.isDestroyed()) return

    const pinBounds = bounds || pinWin.getBounds()
    if (!pinBounds) return

    const [tbWidth, tbHeight] = tbWin.getSize()
    const currentDisplay = screen.getDisplayMatching(pinBounds)
    const workArea = currentDisplay.workArea

    let posX = Math.round(pinBounds.x + (pinBounds.width - tbWidth) / 2)
    posX = Math.max(workArea.x + 10, Math.min(posX, workArea.x + workArea.width - tbWidth - 10))

    let posY = Math.round(pinBounds.y + pinBounds.height + 2)
    const isTop = posY + tbHeight > workArea.y + workArea.height
    if (isTop) {
      posY = Math.round(pinBounds.y - tbHeight - 2)
    }

    tbWin.setPosition(posX, posY)
    try {
      tbWin.webContents.send('mt::pin-toolbar-placement', isTop ? 'top' : 'bottom')
    } catch {}
  }

  public openEditToolbar(
    pinId: string,
    bounds?: { x: number; y: number; width: number; height: number }
  ): BrowserWindow {
    const existing = this._toolbarWindows.get(pinId)
    if (existing && !existing.isDestroyed()) {
      existing.show()
      return existing
    }

    const pinWin = this._windows.get(pinId)
    const pinBounds =
      bounds ||
      (pinWin && !pinWin.isDestroyed()
        ? pinWin.getBounds()
        : { x: 200, y: 200, width: 400, height: 300 })

    const tbWidth = 780
    const tbHeight = 140

    const currentDisplay = screen.getDisplayMatching(pinBounds)
    const workArea = currentDisplay.workArea

    let posX = Math.round(pinBounds.x + (pinBounds.width - tbWidth) / 2)
    posX = Math.max(workArea.x + 10, Math.min(posX, workArea.x + workArea.width - tbWidth - 10))

    let posY = Math.round(pinBounds.y + pinBounds.height + 2)
    const isTop = posY + tbHeight > workArea.y + workArea.height
    if (isTop) {
      posY = Math.round(pinBounds.y - tbHeight - 2)
    }

    const tbWin = new BrowserWindow({
      width: tbWidth,
      height: tbHeight,
      x: posX,
      y: posY,
      type: isOsx ? 'panel' : undefined,
      frame: false,
      transparent: true,
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      closable: true,
      fullscreen: false,
      fullscreenable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    tbWin.setAlwaysOnTop(true, 'floating', 1)
    if (isOsx) {
      tbWin.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
        skipTransformProcessType: true
      })
    }

    const baseUrl =
      process.env.NODE_ENV === 'development'
        ? process.env['ELECTRON_RENDERER_URL']!
        : `file://${path.join(__dirname, '../renderer/index.html')}`

    const tbUrl = new URL(baseUrl)
    tbUrl.searchParams.set('type', 'pin-toolbar')
    tbUrl.searchParams.set('pinId', pinId)
    tbUrl.searchParams.set('wid', String(tbWin.id))
    tbUrl.searchParams.set('theme', nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
    tbUrl.searchParams.set('placement', isTop ? 'top' : 'bottom')
    try {
      tbUrl.searchParams.set('udp', app.getPath('userData'))
    } catch {}
    tbUrl.hash = `/pin-toolbar?pinId=${pinId}`

    tbWin.loadURL(tbUrl.toString())
    tbWin.show()

    this._toolbarWindows.set(pinId, tbWin)

    tbWin.on('closed', () => {
      this._toolbarWindows.delete(pinId)
    })

    return tbWin
  }

  public closeEditToolbar(pinId: string): void {
    const tbWin = this._toolbarWindows.get(pinId)
    if (tbWin && !tbWin.isDestroyed()) {
      tbWin.destroy()
    }
    this._toolbarWindows.delete(pinId)
  }

  public getPinWindow(pinId: string): BrowserWindow | undefined {
    return this._windows.get(pinId)
  }

  public getToolbarWindow(pinId: string): BrowserWindow | undefined {
    return this._toolbarWindows.get(pinId)
  }

  public focusToolbarWindow(pinId: string): void {
    const tbWin = this._toolbarWindows.get(pinId)
    if (tbWin && !tbWin.isDestroyed()) {
      tbWin.focus()
      tbWin.webContents?.focus()
    }
  }
}

let pinManagerInstance: PinWindowManager | null = null

export const getPinWindowManager = (): PinWindowManager => {
  if (!pinManagerInstance) {
    pinManagerInstance = new PinWindowManager()
  }
  return pinManagerInstance
}
