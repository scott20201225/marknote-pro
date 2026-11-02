import path from 'path'
import { app, BrowserWindow, screen, nativeTheme } from 'electron'
import log from 'electron-log'
import { getClipboardService } from '../clipboard'
import { isOsx } from '../config'

export class ClipboardModalWindow {
  private _win: BrowserWindow | null = null
  private _isReady: boolean = false
  private _wasMarkNoteActive: boolean = false

  constructor() {
    // Pure lazy loading: do not eagerly create floating window at application startup,
    // which interferes with macOS keyWindow activation and text input context.
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

    const topLevel = 'floating'
    this._win.setAlwaysOnTop(true, topLevel)
    this._win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    const baseUrl =
      process.env.NODE_ENV === 'development'
        ? process.env['ELECTRON_RENDERER_URL']!
        : `file://${path.join(__dirname, '../renderer/index.html')}`

    const url = new URL(baseUrl)
    url.searchParams.set('type', 'clipboard')
    url.searchParams.set('theme', nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
    url.hash = '/clipboard'

    this._win.loadURL(url.toString())

    this._win.webContents.once('did-finish-load', () => {
      this._isReady = true
    })

    this._win.on('blur', () => {
      if (this._win && !this._win.isDestroyed() && this._win.isVisible()) {
        this.hide(this._wasMarkNoteActive)
      }
    })

    this._win.on('closed', () => {
      this._win = null
      this._isReady = false
    })
  }

  public async show(): Promise<void> {
    if (!this._win || this._win.isDestroyed()) {
      this._createWindow()
    }

    if (!this._win) return

    const currentFocused = BrowserWindow.getFocusedWindow()
    this._wasMarkNoteActive = currentFocused !== null

    // Immediately poll clipboard so latest system/Lark screenshot or copy is caught instantly!
    const clipboardService = getClipboardService()
    try {
      await clipboardService.checkClipboardNow()
    } catch (err) {
      log.warn('[ClipboardModal] checkClipboardNow error:', err as Error)
    }

    // Center on the display where the cursor currently is
    const cursorPoint = screen.getCursorScreenPoint()
    const currentDisplay = screen.getDisplayNearestPoint(cursorPoint)
    const { x: dispX, y: dispY, width: dispW, height: dispH } = currentDisplay.workArea

    const winWidth = 740
    const winHeight = 500
    const posX = Math.round(dispX + (dispW - winWidth) / 2)
    const posY = Math.round(dispY + (dispH - winHeight) / 2)

    this._win.setPosition(posX, posY)
    const topLevel = 'floating'
    this._win.setAlwaysOnTop(true, topLevel)
    this._win.moveTop()
    this._win.show()
    this._win.focus()

    this._win.webContents.send('mt::clipboard-modal-show', {
      history: clipboardService.history,
      isDark: nativeTheme.shouldUseDarkColors
    })
  }

  public hide(restoreFocusToEditor?: boolean): void {
    const shouldRestore = restoreFocusToEditor ?? this._wasMarkNoteActive
    if (this._win && !this._win.isDestroyed() && this._win.isVisible()) {
      this._win.hide()
    }
    if (shouldRestore) {
      this.restoreEditorFocus()
    }
  }

  public restoreEditorFocus(): void {
    const allWindows = BrowserWindow.getAllWindows()
    const editorWin = allWindows.find(
      (w) => w !== this._win && !w.isDestroyed() && w.isVisible()
    )
    if (editorWin) {
      if (isOsx) {
        app.focus({ steal: true })
      }
      editorWin.focus()
      editorWin.webContents?.focus()
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
