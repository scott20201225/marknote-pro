import path from 'path'
import { BrowserWindow, dialog, nativeImage, clipboard, screen } from 'electron'
import fsPromises from 'fs/promises'
import log from 'electron-log'
import type { PinWindowPayload } from '@shared/types/clipboard'
import { isOsx } from '../config'

export class PinWindowManager {
  private _windows: Map<string, BrowserWindow> = new Map()
  private _payloads: Map<string, PinWindowPayload> = new Map()

  public createPinWindow(payload: PinWindowPayload): BrowserWindow {
    const pinId = payload.id || `pin_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    payload.id = pinId
    this._payloads.set(pinId, payload)

    const cursorPoint = screen.getCursorScreenPoint()
    const currentDisplay = screen.getDisplayNearestPoint(cursorPoint)

    const width = Math.min(Math.max(payload.width || 400, 100), currentDisplay.workArea.width)
    const height = Math.min(Math.max(payload.height || 300, 60), currentDisplay.workArea.height)

    const posX =
      payload.x !== undefined
        ? payload.x
        : Math.round(currentDisplay.workArea.x + (currentDisplay.workArea.width - width) / 2)
    const posY =
      payload.y !== undefined
        ? payload.y
        : Math.round(currentDisplay.workArea.y + (currentDisplay.workArea.height - height) / 2)

    const win = new BrowserWindow({
      width: Math.round(width),
      height: Math.round(height),
      x: Math.round(posX),
      y: Math.round(posY),
      frame: false,
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

    win.setAlwaysOnTop(true, 'floating')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    const baseUrl =
      process.env.NODE_ENV === 'development'
        ? process.env['ELECTRON_RENDERER_URL']!
        : `file://${path.join(__dirname, '../renderer/index.html')}`

    const url = new URL(baseUrl)
    url.searchParams.set('type', 'pin')
    url.searchParams.set('pinId', pinId)
    url.hash = `/pin?pinId=${pinId}`

    win.loadURL(url.toString())

    win.webContents.once('did-finish-load', () => {
      if (win.isDestroyed()) return
      win.show()
      win.webContents.send('mt::pin-window-data', payload)
    })

    win.on('closed', () => {
      this._windows.delete(pinId)
      this._payloads.delete(pinId)
    })

    this._windows.set(pinId, win)
    return win
  }

  public getPayload(pinId: string): PinWindowPayload | null {
    return this._payloads.get(pinId) || null
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
