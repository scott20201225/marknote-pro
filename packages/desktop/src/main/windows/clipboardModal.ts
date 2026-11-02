import path from 'path'
import { app, BrowserWindow, screen } from 'electron'
import { getClipboardService } from '../clipboard'
import { isOsx } from '../config'

export class ClipboardModalWindow {
  private _win: BrowserWindow | null = null
  private _isReady: boolean = false

  constructor() {
    if (app.isReady()) {
      this._createWindow()
    } else {
      app.whenReady().then(() => {
        this._createWindow()
      })
    }
  }

  private _createWindow(): void {
    if (!app.isReady()) return
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

    const winWidth = 740
    const winHeight = 500

    this._win = new BrowserWindow({
      width: winWidth,
      height: winHeight,
      x: Math.round((screenWidth - winWidth) / 2),
      y: Math.round((screenHeight - winHeight) / 2),
      frame: false,
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      closable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      transparent: true,
      hasShadow: true,
      vibrancy: isOsx ? 'under-window' : undefined,
      visualEffectState: isOsx ? 'active' : undefined,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    const topLevel = isOsx ? 'screen-saver' : 'screen-saver'
    this._win.setAlwaysOnTop(true, topLevel)
    this._win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    const baseUrl =
      process.env.NODE_ENV === 'development'
        ? process.env['ELECTRON_RENDERER_URL']!
        : `file://${path.join(__dirname, '../renderer/index.html')}`

    const url = new URL(baseUrl)
    url.searchParams.set('type', 'clipboard')
    url.hash = '/clipboard'

    this._win.loadURL(url.toString())

    this._win.webContents.once('did-finish-load', () => {
      this._isReady = true
    })

    this._win.on('blur', () => {
      this.hide()
    })

    this._win.on('closed', () => {
      this._win = null
      this._isReady = false
    })
  }

  public show(): void {
    if (!this._win || this._win.isDestroyed()) {
      this._createWindow()
    }

    if (!this._win) return

    // Center on the display where the cursor currently is
    const cursorPoint = screen.getCursorScreenPoint()
    const currentDisplay = screen.getDisplayNearestPoint(cursorPoint)
    const { x: dispX, y: dispY, width: dispW, height: dispH } = currentDisplay.workArea

    const winWidth = 740
    const winHeight = 500
    const posX = Math.round(dispX + (dispW - winWidth) / 2)
    const posY = Math.round(dispY + (dispH - winHeight) / 2)

    this._win.setPosition(posX, posY)
    const topLevel = isOsx ? 'screen-saver' : 'screen-saver'
    this._win.setAlwaysOnTop(true, topLevel)
    this._win.moveTop()
    if (isOsx) {
      app.focus({ steal: true })
    }
    this._win.show()
    this._win.focus()

    const clipboardService = getClipboardService()
    this._win.webContents.send('mt::clipboard-modal-show', clipboardService.history)
  }

  public hide(): void {
    if (this._win && !this._win.isDestroyed() && this._win.isVisible()) {
      this._win.hide()
    }
  }

  public toggle(): void {
    if (this._win && !this._win.isDestroyed() && this._win.isVisible()) {
      this.hide()
    } else {
      this.show()
    }
  }

  public get win(): BrowserWindow | null {
    return this._win
  }
}

let clipboardModalInstance: ClipboardModalWindow | null = null

export const getClipboardModalWindow = (): ClipboardModalWindow => {
  if (!clipboardModalInstance) {
    clipboardModalInstance = new ClipboardModalWindow()
  }
  return clipboardModalInstance
}
