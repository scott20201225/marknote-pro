import path from 'path'
import { app, BrowserWindow, screen, nativeTheme } from 'electron'
import log from 'electron-log'
import { getClipboardService } from '../clipboard'
import { isOsx } from '../config'

export class ClipboardModalWindow {
  private _win: BrowserWindow | null = null
  private _isReady: boolean = false
  private _wasMarkNoteActive: boolean = false
  private _activeDisplayId: number | null = null

  constructor() {
    // Pure lazy loading: do not eagerly create floating window at application startup,
    // which interferes with macOS keyWindow activation and text input context.
  }

  private _createWindow(initialBounds?: { x: number; y: number; width: number; height: number }): void {
    if (!app.isReady()) return

    const winWidth = 740
    const winHeight = 500

    let initX: number
    let initY: number

    if (initialBounds) {
      initX = initialBounds.x
      initY = initialBounds.y
    } else {
      const cursorPoint = screen.getCursorScreenPoint()
      const currentDisplay = screen.getDisplayNearestPoint(cursorPoint)
      const { x: dispX, y: dispY, width: dispW, height: dispH } = currentDisplay.workArea
      initX = Math.round(dispX + (dispW - winWidth) / 2)
      initY = Math.round(dispY + (dispH - winHeight) / 2)
    }

    this._win = new BrowserWindow({
      width: winWidth,
      height: winHeight,
      minWidth: winWidth,
      maxWidth: winWidth,
      minHeight: winHeight,
      maxHeight: winHeight,
      fullscreen: false,
      fullscreenable: false,
      type: isOsx ? 'panel' : undefined,
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

    const topLevel = 'floating'
    this._win.setAlwaysOnTop(true, topLevel)
    this._win.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true
    })

    const baseUrl =
      process.env.NODE_ENV === 'development'
        ? process.env['ELECTRON_RENDERER_URL']!
        : `file://${path.join(__dirname, '../renderer/index.html')}`

    const url = new URL(baseUrl)
    url.searchParams.set('wid', String(this._win.id))
    url.searchParams.set('type', 'clipboard')
    try {
      url.searchParams.set('udp', app.getPath('userData'))
    } catch {}
    url.searchParams.set('theme', nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
    url.hash = '/clipboard'

    this._win.loadURL(url.toString())

    this._win.webContents.once('did-finish-load', () => {
      this._isReady = true
    })

    this._win.on('blur', () => {
      if (this._win && !this._win.isDestroyed() && this._win.isVisible()) {
        this.hide()
      }
    })

    this._win.on('closed', () => {
      this._win = null
      this._isReady = false
    })
  }

  public async show(): Promise<void> {
    const cursorPoint = screen.getCursorScreenPoint()
    const currentDisplay = screen.getDisplayNearestPoint(cursorPoint)
    const { x: dispX, y: dispY, width: dispW, height: dispH } = currentDisplay.workArea

    const winWidth = 740
    const winHeight = 500
    const posX = Math.round(dispX + (dispW - winWidth) / 2)
    const posY = Math.round(dispY + (dispH - winHeight) / 2)

    if (!this._win || this._win.isDestroyed()) {
      this._createWindow({ x: posX, y: posY, width: winWidth, height: winHeight })
    }

    if (!this._win) return

    this._activeDisplayId = currentDisplay.id
    const currentFocused = BrowserWindow.getFocusedWindow()
    const activeDisplay =
      currentFocused && !currentFocused.isDestroyed()
        ? screen.getDisplayMatching(currentFocused.getBounds())
        : null
    this._wasMarkNoteActive = activeDisplay !== null && activeDisplay.id === currentDisplay.id

    // Immediately poll clipboard so latest system/Lark screenshot or copy is caught instantly!
    const clipboardService = getClipboardService()
    try {
      await clipboardService.checkClipboardNow()
    } catch (err) {
      log.warn('[ClipboardModal] checkClipboardNow error:', err as Error)
    }

    // Safety: ensure history modal never stays in full-screen state
    if (this._win.isFullScreen()) {
      this._win.setFullScreen(false)
    }

    // Set bounds accurately onto cursor display workArea
    this._win.setBounds({ x: posX, y: posY, width: winWidth, height: winHeight })
    const topLevel = 'floating'
    this._win.setAlwaysOnTop(true, topLevel)
    this._win.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true
    })
    this._win.moveTop()

    if (isOsx) {
      // Crucial: showInactive() displays on top of native full-screen apps without triggering
      // macOS application activation or space jumping!
      this._win.showInactive()
      this._win.focus()
      this._win.webContents?.focus()
    } else {
      this._win.show()
      this._win.focus()
      this._win.webContents?.focus()
    }

    this._win.webContents.send('mt::clipboard-modal-show', {
      history: clipboardService.history,
      isDark: nativeTheme.shouldUseDarkColors
    })
  }

  public hide(): void {
    if (this._win && !this._win.isDestroyed() && this._win.isVisible()) {
      this._win.hide()
    }
  }

  public restoreEditorFocus(): void {
    // Intentionally no-op: auxiliary window close/hide must never steal focus or switch spaces to MarkNotePro!
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
