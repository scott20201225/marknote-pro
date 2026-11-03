import path from 'path'
import url from 'url'
import fs from 'fs'
import fsPromises from 'fs/promises'
import { app, BrowserWindow, dialog, nativeImage, clipboard, screen, nativeTheme } from 'electron'
import log from 'electron-log'
import type { PinWindowPayload } from '@shared/types/clipboard'
import { isOsx } from '../config'

export class PinWindowManager {
  private _windows: Map<string, BrowserWindow> = new Map()
  private _payloads: Map<string, PinWindowPayload> = new Map()
  private _winToPinId: Map<number, string> = new Map()

  public createPinWindow(payload: PinWindowPayload): BrowserWindow {
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
        if (isOsx) {
          win.showInactive()
        } else {
          win.show()
        }
      }
      win.focus()
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

    win.on('closed', () => {
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
    // If there is another pin window open, focus that pin window
    for (const [, pinWin] of this._windows.entries()) {
      if (pinWin !== excludeWin && !pinWin.isDestroyed() && pinWin.isVisible()) {
        pinWin.focus()
        return
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
    const win = (pinId ? this._windows.get(pinId) : sourceWindow) || sourceWindow
    if (win) {
      this.restoreEditorFocus(win)
      if (!win.isDestroyed()) {
        try {
          win.setVisibleOnAllWorkspaces(false)
        } catch {}
        win.destroy()
      }
      if (pinId) {
        this._windows.delete(pinId)
        this._payloads.delete(pinId)
      }
      this._winToPinId.delete(win.id)
      this.restoreEditorFocus()
    }
  }

  public dragWindow(dx: number, dy: number, pinId?: string, sourceWindow?: BrowserWindow): void {
    const win = (pinId ? this._windows.get(pinId) : sourceWindow) || sourceWindow
    if (!win || win.isDestroyed()) return
    const [currX, currY] = win.getPosition()
    win.setPosition(Math.round(currX + dx), Math.round(currY + dy))
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

    win.setBounds({
      x: newX,
      y: newY,
      width: targetW,
      height: targetH
    })
  }

  public setAlwaysOnTop(flag: boolean, pinId?: string, sourceWindow?: BrowserWindow): void {
    const win = (pinId ? this._windows.get(pinId) : sourceWindow) || sourceWindow
    if (!win || win.isDestroyed()) return
    win.setAlwaysOnTop(flag, 'floating')
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
}

let pinManagerInstance: PinWindowManager | null = null

export const getPinWindowManager = (): PinWindowManager => {
  if (!pinManagerInstance) {
    pinManagerInstance = new PinWindowManager()
  }
  return pinManagerInstance
}
