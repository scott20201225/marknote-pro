import path from 'path'
import fs from 'fs'
import fsPromises from 'fs/promises'
import { exec } from 'child_process'
import util from 'util'
import {
  app,
  BrowserWindow,
  desktopCapturer,
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

  public get currentPayload(): ScreenCaptureDisplayInfo | null {
    return this._currentPayload
  }

  public async startCapture(): Promise<void> {
    console.log('[CaptureWindowManager] startCapture called!')
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

      if (isOsx) {
        const accessStatus = systemPreferences.getMediaAccessStatus('screen')
        log.info('[CaptureWindowManager] macOS screen mediaAccessStatus:', accessStatus)

        try {
          const micStatus = systemPreferences.getMediaAccessStatus('microphone')
          log.info('[CaptureWindowManager] macOS mic mediaAccessStatus:', micStatus)
          if (micStatus === 'not-determined') {
            await systemPreferences.askForMediaAccess('microphone')
          }
        } catch (mErr) {
          log.warn('[CaptureWindowManager] askForMediaAccess microphone error:', mErr)
        }
        try {
          const tmpCapturePath = path.join('/tmp', `marknotepro_cap_${Date.now()}.png`)
          await execAsync(`/usr/sbin/screencapture -x "${tmpCapturePath}"`)
          if (fs.existsSync(tmpCapturePath)) {
            const buf = await fsPromises.readFile(tmpCapturePath)
            dataUrl = `data:image/png;base64,${buf.toString('base64')}`
            fsPromises.unlink(tmpCapturePath).catch(() => {})
          }
        } catch (scErr) {
          log.warn('[CaptureWindowManager] screencapture CLI error:', scErr)
        }
      }

      if (!dataUrl) {
        try {
          const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: {
              width: Math.round(bounds.width * scaleFactor),
              height: Math.round(bounds.height * scaleFactor)
            }
          })

          let targetSource = sources.find((s) => s.display_id === String(currentDisplay.id))
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
        log.error('[CaptureWindowManager] Both screencapture and desktopCapturer failed. Requesting permission.')
        const res = await dialog.showMessageBox({
          type: 'warning',
          title: 'MarkNotePro 截图权限提示',
          message: '未获得系统屏幕录制权限，无法截取屏幕。',
          detail:
            '由于 macOS 系统安全机制，重新安装或更新应用后可能需要刷新授权：\n\n' +
            '1. 请打开「系统设置 -> 隐私与安全 -> 屏幕与系统音频录制」；\n' +
            '2. 找到并选中 MarkNotePro，先点击开关关闭，再重新打开（或用 “-” 号移除后重新添加）；\n' +
            '3. 重启 MarkNotePro 后即可正常截图。',
          buttons: ['打开系统设置', '稍后再说'],
          defaultId: 0,
          cancelId: 1
        })
        if (res.response === 0) {
          shell.openExternal(
            'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
          )
        }
        return
      }

      this._win = new BrowserWindow({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        frame: false,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        closable: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        enableLargerThanScreen: true,
        show: false,
        backgroundColor: '#000000',
        webPreferences: {
          preload: path.join(__dirname, '../preload/index.js'),
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false
        }
      })

      this._win.setAlwaysOnTop(true, 'normal')
      this._win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

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
        scaleFactor,
        dataUrl
      }
      this._currentPayload = payload

      this._win.webContents.once('did-finish-load', () => {
        if (!this._win || this._win.isDestroyed()) return
        this._win.show()
        this._win.focus()
        this._win.webContents.send('mt::capture-data-ready', payload)
      })

      this._win.once('ready-to-show', () => {
        if (!this._win || this._win.isDestroyed()) return
        this._win.show()
        this._win.focus()
      })

      this._win.loadURL(url.toString())

      this._win.on('closed', () => {
        this._win = null
      })
    } catch (err) {
      console.error('[CaptureWindowManager] Failed to capture screen:', err)
      log.error('[CaptureWindowManager] Failed to capture screen:', err)
      this.close()
    }
  }

  public async captureSlice(rect: { x: number; y: number; width: number; height: number }): Promise<string | null> {
    if (!this._win || this._win.isDestroyed()) return null
    try {
      this._win.setOpacity(0)
      await new Promise((resolve) => setTimeout(resolve, 80))

      const tmpPath = path.join('/tmp', `marknotepro_slice_${Date.now()}.png`)

      if (isOsx) {
        await execAsync(
          `/usr/sbin/screencapture -x -R${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)},${Math.round(rect.height)} "${tmpPath}"`
        )
      }

      this._win.setOpacity(1)

      if (fs.existsSync(tmpPath)) {
        const buf = await fsPromises.readFile(tmpPath)
        fsPromises.unlink(tmpPath).catch(() => {})
        return `data:image/png;base64,${buf.toString('base64')}`
      }
    } catch (err) {
      log.error('[CaptureWindowManager] captureSlice error:', err)
      if (this._win && !this._win.isDestroyed()) {
        this._win.setOpacity(1)
      }
    }
    return null
  }

  public async scrollDown(rect?: { x: number; y: number; width: number; height: number }): Promise<void> {
    if (!isOsx) return
    try {
      const staticDir = path.join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'static')
      const macScrollBin = path.join(staticDir, 'bin', 'mac-scroll')
      let args = '-8'
      if (rect) {
        const cx = Math.round(rect.x + rect.width / 2)
        const cy = Math.round(rect.y + rect.height / 2)
        args = `-8 ${cx} ${cy}`
      }
      if (fs.existsSync(macScrollBin)) {
        await execAsync(`"${macScrollBin}" ${args}`)
      } else {
        await execAsync(`osascript -e 'tell application "System Events" to key code 125'`)
      }
    } catch (err) {
      log.warn('[CaptureWindowManager] scrollDown error:', err)
    }
  }

  public close(): void {
    if (this._win && !this._win.isDestroyed()) {
      this._win.destroy()
      this._win = null
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
