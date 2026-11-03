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
  private _isClosing = false
  private _wasEditorActive = false
  private _fallbackTimer: NodeJS.Timeout | null = null
  private _hasPromptedSystemPermission = false

  public get currentPayload(): ScreenCaptureDisplayInfo | null {
    return this._currentPayload
  }

  public get isCapturing(): boolean {
    return this._isCapturing
  }

  public async startCapture(): Promise<void> {
    log.info('[CaptureWindowManager] startCapture called!')
    this._isClosing = false
    this._isCapturing = true

    // Check whether MarkNotePro was the active window on this EXACT display when shortcut was triggered
    const activeWin = BrowserWindow.getFocusedWindow()
    const cursorPoint = screen.getCursorScreenPoint()
    const currentDisplay = screen.getDisplayNearestPoint(cursorPoint)
    const activeDisplay =
      activeWin && !activeWin.isDestroyed() ? screen.getDisplayMatching(activeWin.getBounds()) : null
    this._wasEditorActive = activeDisplay !== null && activeDisplay.id === currentDisplay.id

    if (this._fallbackTimer) {
      clearTimeout(this._fallbackTimer)
      this._fallbackTimer = null
    }

    if (this._win && !this._win.isDestroyed()) {
      try {
        this._win.destroy()
      } catch {}
      this._win = null
    }

    try {
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
          const reqW = Math.max(1, Math.round(bounds.width * scaleFactor))
          const reqH = Math.max(1, Math.round(bounds.height * scaleFactor))
          const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: {
              width: reqW,
              height: reqH
            }
          })

          const dispIdStr = String(currentDisplay.id)
          let targetSource = sources.find(
            (s) =>
              s.display_id === dispIdStr ||
              s.id === `screen:${dispIdStr}` ||
              s.id.startsWith(`screen:${dispIdStr}:`)
          )
          if (!targetSource) {
            const allDisplays = screen.getAllDisplays()
            const dispIndex = allDisplays.findIndex((d) => d.id === currentDisplay.id)
            if (dispIndex >= 0 && sources[dispIndex]) {
              targetSource = sources[dispIndex]
            }
          }
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
        this._isCapturing = false
        const accessStatus = isOsx ? systemPreferences.getMediaAccessStatus('screen') : 'unknown'
        log.error('[CaptureWindowManager] Both screencapture and desktopCapturer failed. accessStatus:', accessStatus)

        if (isOsx) {
          // On macOS, desktopCapturer.getSources() triggers macOS's native system permission prompt:
          // '"MarkNotePro" wants to record this computer\'s screen and audio. [Open System Settings] [Deny]'
          // On the first attempt, do NOT show a redundant blocking modal dialog that collides with the system prompt!
          if (!this._hasPromptedSystemPermission) {
            this._hasPromptedSystemPermission = true
            log.info('[CaptureWindowManager] First macOS permission attempt: letting system prompt handle user interaction.')
            return
          }
        }

        // Only prompt modal warning if permission was explicitly denied or not available
        if (accessStatus === 'denied' || !isOsx) {
          const res = await dialog.showMessageBox({
            type: 'warning',
            title: 'MarkNotePro 截图权限提示',
            message: '未获得系统屏幕录制权限，无法截取屏幕。',
            detail:
              'MarkNotePro 需要屏幕录制权限以捕获屏幕画面：\n\n' +
              '1. 请前往「系统设置 -> 隐私与安全 -> 屏幕与系统音频录制」；\n' +
              '2. 开启 MarkNotePro 的访问开关；\n' +
              '3. ⚠️ 重要：macOS 机制要求开启后必须完全退出并重新启动 MarkNotePro 才能生效。',
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
        this.close()
        return
      }

      this._win = new BrowserWindow({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        type: isOsx ? 'panel' : undefined,
        useContentSize: false,
        frame: false,
        resizable: false,
        movable: false,
        thickFrame: false,
        minimizable: false,
        maximizable: false,
        closable: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        enableLargerThanScreen: true,
        fullscreen: false,
        fullscreenable: false,
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

      // Auxiliary full-screen behavior:
      // Must set visibleOnFullScreen immediately upon creation so macOS attaches this overlay
      // to the current Space (including full-screen spaces) without jumping to Desktop 1!
      if (isOsx) {
        this._win.setAlwaysOnTop(true, 'status', 1)
        this._win.setVisibleOnAllWorkspaces(true, {
          visibleOnFullScreen: true,
          skipTransformProcessType: true
        })
      }

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
      url.searchParams.set('wid', String(this._win.id))
      url.searchParams.set('type', 'capture')
      try {
        url.searchParams.set('udp', app.getPath('userData'))
      } catch {}
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
        this._isClosing = false
        this._currentPayload = null
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

    // Apply bounds and window levels onto target display
    try {
      if (this._currentPayload?.bounds) {
        this._win.setBounds({
          x: this._currentPayload.bounds.x,
          y: this._currentPayload.bounds.y,
          width: this._currentPayload.bounds.width,
          height: this._currentPayload.bounds.height
        })
      }

      if (isOsx) {
        // macOS: Use 'status' (level 25) with relativeLevel 1 (level 26) to cover Menu Bar (24) and Dock (20),
        // while strictly staying BELOW IME candidate pop-up windows (level 101) so candidates are visible!
        this._win.setAlwaysOnTop(true, 'status', 1)
        this._win.setVisibleOnAllWorkspaces(true, {
          visibleOnFullScreen: true,
          skipTransformProcessType: true
        })
        // Crucial: showInactive() displays the overlay on the current Space (including full-screen spaces)
        // WITHOUT activating the app, preventing macOS WindowServer from switching to Desktop 1!
        this._win.showInactive()
        this._win.focus()
        this._win.webContents?.focus()
      } else {
        // Windows / Linux:
        // Position window onto target display exact bounds and place above Taskbar with 'screen-saver'
        this._win.setAlwaysOnTop(true, 'screen-saver')
        this._win.setVisibleOnAllWorkspaces(true)
        this._win.show()
        this._win.focus()
        this._win.webContents?.focus()
      }
    } catch (e) {
      log.warn('[CaptureWindowManager] setAlwaysOnTop error:', e)
    }
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
    if (this._isClosing) return
    this._isClosing = true
    this._isCapturing = false

    try {
      if (this._fallbackTimer) {
        clearTimeout(this._fallbackTimer)
        this._fallbackTimer = null
      }

      try {
        globalShortcut.unregister('Escape')
        globalShortcut.unregister('CommandOrControl+Escape')
      } catch {}

      this._wasEditorActive = false

      if (this._win && !this._win.isDestroyed()) {
        try {
          this._win.setVisibleOnAllWorkspaces(false)
        } catch {}
        this._win.destroy()
        this._win = null
      }
    } catch (e) {
      log.error('[CaptureWindowManager] Error closing window:', e)
    } finally {
      // Completely release the large screenshot image data from memory
      this._currentPayload = null
      this._isClosing = false
      this._isCapturing = false
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
