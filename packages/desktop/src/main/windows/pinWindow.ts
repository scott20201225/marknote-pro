import path from 'path'
import { app, BrowserWindow, dialog, nativeImage, clipboard, screen } from 'electron'
import fsPromises from 'fs/promises'
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

    const width = Math.min(Math.max(w, 80), currentDisplay.workArea.width)
    const height = Math.min(Math.max(h, 40), currentDisplay.workArea.height)

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
      frame: false,
      titleBarStyle: isOsx ? 'hidden' : undefined,
      trafficLightPosition: isOsx ? { x: -100, y: -100 } : undefined,
      resizable: true,
      movable: true,
      minimizable: false,
      maximizable: false,
      closable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      transparent: true,
      hasShadow: true,
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
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    const baseUrl =
      process.env.NODE_ENV === 'development'
        ? process.env['ELECTRON_RENDERER_URL']!
        : `file://${path.join(__dirname, '../renderer/index.html')}`

    const url = new URL(baseUrl)
    url.searchParams.set('type', 'pin')
    url.searchParams.set('pinId', pinId)
    url.searchParams.set('wid', '1')
    try {
      url.searchParams.set('udp', app.getPath('userData'))
    } catch {
      // ignore
    }
    url.hash = `/pin?pinId=${pinId}`

    const showAndFocus = (): void => {
      if (win.isDestroyed()) return
      if (!win.isVisible()) {
        win.show()
      }
      if (isOsx) {
        app.focus({ steal: true })
      }
      win.focus()
      win.webContents.send('mt::pin-window-data', payload)
    }

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
    })

    this._windows.set(pinId, win)
    this._winToPinId.set(win.id, pinId)
    return win
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
    if (pinId && this._windows.has(pinId)) {
      const win = this._windows.get(pinId)
      if (win && !win.isDestroyed()) {
        win.destroy()
      }
      this._windows.delete(pinId)
      this._payloads.delete(pinId)
      return
    }

    if (sourceWindow && !sourceWindow.isDestroyed()) {
      sourceWindow.destroy()
    }
  }

  public dragWindow(dx: number, dy: number, pinId?: string, sourceWindow?: BrowserWindow): void {
    const win = (pinId ? this._windows.get(pinId) : sourceWindow) || sourceWindow
    if (!win || win.isDestroyed()) return
    const [currX, currY] = win.getPosition()
    win.setPosition(Math.round(currX + dx), Math.round(currY + dy))
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

    let targetW = Math.round((naturalWidth / scaleFactor) * zoom)
    let targetH = Math.round((naturalHeight / scaleFactor) * zoom)

    const maxW = Math.round(currentDisplay.workArea.width * 0.95)
    const maxH = Math.round(currentDisplay.workArea.height * 0.95)
    if (targetW > maxW || targetH > maxH) {
      const scale = Math.min(maxW / targetW, maxH / targetH)
      targetW = Math.round(targetW * scale)
      targetH = Math.round(targetH * scale)
    }

    targetW = Math.max(targetW, 80)
    targetH = Math.max(targetH, 40)

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

  public async saveImage(dataUrl: string, sourceWindow?: BrowserWindow): Promise<string | null> {
    try {
      const targetWin = sourceWindow || BrowserWindow.getFocusedWindow() || undefined
      const { filePath, canceled } = await dialog.showSaveDialog(targetWin!, {
        title: '保存贴图',
        defaultPath: `snipaste_${Date.now()}.png`,
        filters: [{ name: 'Images', extensions: ['png', 'jpg'] }]
      })

      if (canceled || !filePath) return null

      const img = nativeImage.createFromDataURL(dataUrl)
      await fsPromises.writeFile(filePath, img.toPNG())
      return filePath
    } catch (err) {
      log.error('[PinWindowManager] Failed to save pinned image:', err)
      return null
    }
  }

  public copyImage(dataUrl: string): boolean {
    try {
      const img = nativeImage.createFromDataURL(dataUrl)
      clipboard.writeImage(img)
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
