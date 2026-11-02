import path from 'path'
import fs from 'fs'
import fsPromises from 'fs/promises'
import { exec } from 'child_process'
import util from 'util'
import {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  screen,
  dialog,
  shell,
  systemPreferences
} from 'electron'
import log from 'electron-log'
import type { ScreenCaptureDisplayInfo } from '@shared/types/clipboard'
import { isOsx } from '../config'

const execAsync = util.promisify(exec)

export class CaptureWindowManager {
  private _win: BrowserWindow | null = null
  private _currentPayload: ScreenCaptureDisplayInfo | null = null
  private _isCapturing = false
  private _wasEditorActive = false
  private _fallbackTimer: NodeJS.Timeout | null = null

  public get currentPayload(): ScreenCaptureDisplayInfo | null {
    return this._currentPayload
  }

  public get isCapturing(): boolean {
    return this._isCapturing
  }

  public async startCapture(): Promise<void> {
    console.log('[CaptureWindowManager] startCapture called!')
    this._isCapturing = true

    // Check whether MarkNotePro was the active window when shortcut was triggered
    const activeWin = BrowserWindow.getFocusedWindow()
    this._wasEditorActive = activeWin !== null && !activeWin.isDestroyed()

    if (this._fallbackTimer) {
      clearTimeout(this._fallbackTimer)
      this._fallbackTimer = null
    }

    if (this._win && !this._win.isDestroyed()) {
      this._win.destroy()
      this._win = null
    }

    try {
      const cursorPoint = screen.getCursorScreenPoint()
      const currentDisplay = screen.getDisplayNearestPoint(cursorPoint)
      const bounds = currentDisplay.bounds
      const scaleFactor = currentDisplay.scaleFactor || 1

      let dataUrl = ''
      let windowList: Array<{ x: number; y: number; w: number; h: number; owner?: string; title?: string }> = []

      if (isOsx) {
        const accessStatus = systemPreferences.getMediaAccessStatus('screen')
        log.info('[CaptureWindowManager] macOS screen mediaAccessStatus:', accessStatus)

        const tmpCapturePath = path.join('/tmp', `marknotepro_cap_${Date.now()}.png`)
        const staticDir = path.join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'static')
        const macScrollBin = path.join(staticDir, 'bin', 'mac-scroll')

        // Capture exact display bounds using -R to eliminate multi-screen mismatch and scaling distortion
        const capturePromise = execAsync(
          `/usr/sbin/screencapture -x -R ${bounds.x},${bounds.y},${bounds.width},${bounds.height} "${tmpCapturePath}"`
        )
          .then(async () => {
            if (fs.existsSync(tmpCapturePath)) {
              const buf = await fsPromises.readFile(tmpCapturePath)
              dataUrl = `data:image/png;base64,${buf.toString('base64')}`
              fsPromises.unlink(tmpCapturePath).catch(() => {})
            }
          })
          .catch((scErr) => log.warn('[CaptureWindowManager] screencapture CLI error:', scErr))

        const windowsPromise = fs.existsSync(macScrollBin)
          ? execAsync(`"${macScrollBin}" --list-windows`, { timeout: 1000 })
              .then(({ stdout }) => {
                if (stdout && stdout.trim().startsWith('[')) {
                  try {
                    windowList = JSON.parse(stdout.trim())
                  } catch (pErr) {
                    log.warn('[CaptureWindowManager] Failed to parse window list JSON:', pErr)
                  }
                }
              })
              .catch((wlErr) => log.warn('[CaptureWindowManager] list-windows error:', wlErr))
          : Promise.resolve()

        await Promise.all([capturePromise, windowsPromise])
      }

      if (!dataUrl) {
        try {
          // Native hardware resolution capture: pass 8192 to prevent Chromium from fractional downscaling
          const maxDim = 8192
          const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: {
              width: maxDim,
              height: maxDim
            }
          })

          const dispIdStr = String(currentDisplay.id)
          let targetSource = sources.find(
            (s) =>
              s.display_id === dispIdStr ||
              s.id === `screen:${dispIdStr}` ||
              s.id.startsWith(`screen:${dispIdStr}:`)
          )
          if (!targetSource && sources.length > 0) {
            targetSource = sources[0]
          }

          if (targetSource) {
            dataUrl = targetSource.thumbnail.toDataURL()
          }
        } catch (dcErr) {
          log.warn('[CaptureWindowManager] desktopCapturer getSources error:', dcErr)
        }
      }

      if (!dataUrl) {
        const accessStatus = isOsx ? systemPreferences.getMediaAccessStatus('screen') : 'unknown'
        log.error('[CaptureWindowManager] Both screencapture and desktopCapturer failed. accessStatus:', accessStatus)

        // Only prompt modal warning if permission was explicitly denied or not available
        if (accessStatus === 'denied') {
          const res = await dialog.showMessageBox({
            type: 'warning',
            title: 'MarkNotePro 截图权限提示',
            message: '未获得系统屏幕录制权限，无法截取屏幕。',
            detail:
              'MarkNotePro 需要屏幕录制权限以捕获屏幕画面：\n\n' +
              '1. 请前往「系统设置 -> 隐私与安全 -> 屏幕与系统音频录制」；\n' +
              '2. 开启 MarkNotePro 的访问开关；\n' +
              '3. 重新打开应用即可正常截图。',
            buttons: ['打开系统设置', '稍后再说'],
            defaultId: 0,
            cancelId: 1
          })
          if (res.response === 0) {
            shell.openExternal(
              'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
            )
          }
        }
        return
      }

      this._win = new BrowserWindow({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        useContentSize: false,
        frame: false,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        closable: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        enableLargerThanScreen: true,
        fullscreen: !isOsx, // Windows / Linux: Native fullscreen covers 100% of the screen including taskbars!
        fullscreenable: true,
        transparent: false, // 实体不透明全屏窗口，杜绝任何透底与 DWM 混合导致的重影/双任务栏
        backgroundColor: '#000000',
        hasShadow: false,
        show: false,
        webPreferences: {
          preload: path.join(__dirname, '../preload/index.js'),
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false
        }
      })

      // Zero-flicker: Avoid setting workspace flags on hidden windows,
      // which causes WindowServer to clear layers and trigger flashes.

      try {
        globalShortcut.register('Escape', () => {
          log.info('[CaptureWindowManager] Global Emergency Escape triggered')
          this.close()
        })
        globalShortcut.register('CommandOrControl+Escape', () => {
          log.info('[CaptureWindowManager] Global Emergency Cmd+Escape triggered')
          this.close()
        })
      } catch (gErr) {
        log.warn('[CaptureWindowManager] Failed to register global emergency shortcuts:', gErr)
      }

      const baseUrl =
        process.env.NODE_ENV === 'development'
          ? process.env['ELECTRON_RENDERER_URL']!
          : `file://${path.join(__dirname, '../renderer/index.html')}`

      const url = new URL(baseUrl)
      url.searchParams.set('type', 'capture')
      url.hash = '/capture'

      const payload: ScreenCaptureDisplayInfo = {
        id: currentDisplay.id,
        bounds,
        workArea: currentDisplay.workArea,
        windows: windowList,
        scaleFactor,
        dataUrl
      }
      this._currentPayload = payload

      this._win.webContents.once('did-finish-load', () => {
        if (!this._win || this._win.isDestroyed()) return
        this._win.webContents.send('mt::capture-data-ready', payload)

        // Safety fallback: only show after 2.5s if renderer signal fails,
        // preventing premature blank display that causes visual flicker.
        this._fallbackTimer = setTimeout(() => {
          this.showCaptureWindow()
        }, 2500)
      })

      this._win.loadURL(url.toString())

      this._win.on('closed', () => {
        try {
          globalShortcut.unregister('Escape')
          globalShortcut.unregister('CommandOrControl+Escape')
        } catch {}
        this._win = null
        this._isCapturing = false
      })
    } catch (err) {
      try {
        globalShortcut.unregister('Escape')
        globalShortcut.unregister('CommandOrControl+Escape')
      } catch {}
      console.error('[CaptureWindowManager] Failed to capture screen:', err)
      log.error('[CaptureWindowManager] Failed to capture screen:', err)
      this.close()
    }
  }

  public showCaptureWindow(): void {
    if (this._fallbackTimer) {
      clearTimeout(this._fallbackTimer)
      this._fallbackTimer = null
    }
    if (!this._win || this._win.isDestroyed() || this._win.isVisible()) return

    // Apply alwaysOnTop and workspace visibility at the exact moment of display
    try {
      if (isOsx) {
        // macOS: Use 'status' (level 25) with relativeLevel 1 (level 26) to cover Menu Bar (24) and Dock (20),
        // while strictly staying BELOW IME candidate pop-up windows (level 101) so candidates are visible!
        this._win.setAlwaysOnTop(true, 'status', 1)
        this._win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
        app.focus({ steal: true })
      } else {
        // Windows / Linux:
        // Position window onto target display before entering native full screen to cover taskbars and bezels
        if (this._currentPayload?.bounds) {
          this._win.setBounds({
            x: this._currentPayload.bounds.x,
            y: this._currentPayload.bounds.y,
            width: this._currentPayload.bounds.width,
            height: this._currentPayload.bounds.height
          })
        }
        this._win.setAlwaysOnTop(true, 'screen-saver')
        this._win.setVisibleOnAllWorkspaces(true)
        this._win.setFullScreen(true)
      }
    } catch (e) {
      log.warn('[CaptureWindowManager] setAlwaysOnTop error:', e)
    }

    this._win.show()
    this._win.focus()
    this._win.webContents?.focus()
  }

  public setTextEditingMode(active: boolean): void {
    if (!this._win || this._win.isDestroyed()) return

    if (active) {
      log.info('[CaptureWindowManager] Entering text editing mode: adjusting window level and focusing for IME')
      // 1. Temporarily unregister global Escape so typing/cancelling Pinyin candidates won't abort the screenshot
      try {
        globalShortcut.unregister('Escape')
        globalShortcut.unregister('CommandOrControl+Escape')
      } catch {}

      // 2. Adjust window level to 'floating' (3) so all IME candidate popups (101) stay reliably on top
      try {
        this._win.setAlwaysOnTop(true, 'floating')
      } catch (e) {
        log.warn('[CaptureWindowManager] setAlwaysOnTop floating error:', e)
      }

      if (isOsx) {
        app.focus({ steal: true })
      }
      this._win.focus()
      this._win.webContents?.focus()
    } else {
      log.info('[CaptureWindowManager] Exiting text editing mode: restoring window level and shortcuts')
      try {
        globalShortcut.register('Escape', () => {
          this.close()
        })
        globalShortcut.register('CommandOrControl+Escape', () => {
          this.close()
        })
      } catch {}

      try {
        this._win.setAlwaysOnTop(true, isOsx ? 'status' : 'screen-saver', isOsx ? 1 : 0)
      } catch {}
    }
  }

  public close(): void {
    if (this._fallbackTimer) {
      clearTimeout(this._fallbackTimer)
      this._fallbackTimer = null
    }
    this._isCapturing = false

    try {
      globalShortcut.unregister('Escape')
      globalShortcut.unregister('CommandOrControl+Escape')
    } catch {}

    const wasEditorActive = this._wasEditorActive
    this._wasEditorActive = false

    if (this._win && !this._win.isDestroyed()) {
      try {
        this._win.setVisibleOnAllWorkspaces(false)
      } catch {}
      this._win.destroy()
      this._win = null
    }

    // Natural Focus Restoration:
    // If MarkNotePro was the active application before capture started, gently return focus to editor.
    // If the user was in an external third-party application (e.g. Lark, Chrome, Terminal),
    // NEVER steal or hijack focus back to MarkNotePro. Let macOS return focus to the previous app naturally!
    if (wasEditorActive) {
      const allWins = BrowserWindow.getAllWindows()
      const editorWin = allWins.find((w) => !w.isDestroyed() && w !== this._win && w.isVisible())
      if (editorWin) {
        editorWin.focus()
      }
    }
  }

  public get win(): BrowserWindow | null {
    return this._win
  }
}

let captureManagerInstance: CaptureWindowManager | null = null

export const getCaptureWindowManager = (): CaptureWindowManager => {
  if (!captureManagerInstance) {
    captureManagerInstance = new CaptureWindowManager()
  }
  return captureManagerInstance
}
