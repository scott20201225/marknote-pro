import path from 'path'
import fs from 'fs'
import fsPromises from 'fs/promises'
import { exec } from 'child_process'
import util from 'util'
import { BrowserWindow, desktopCapturer, screen } from 'electron'
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

        if (!targetSource) {
          throw new Error('No desktop capturer screen source found.')
        }

        dataUrl = targetSource.thumbnail.toDataURL()
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

      this._win.loadURL(url.toString())

      const payload: ScreenCaptureDisplayInfo = {
        id: currentDisplay.id,
        bounds,
        scaleFactor,
        dataUrl
      }

      this._win.webContents.once('did-finish-load', () => {
        if (!this._win || this._win.isDestroyed()) return
        this._win.show()
        this._win.focus()
        this._win.webContents.send('mt::capture-data-ready', payload)
      })

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
      await new Promise((resolve) => setTimeout(resolve, 60))

      const tmpPath = path.join('/tmp', `marknotepro_slice_${Date.now()}.png`)
      const d = screen.getDisplayNearestPoint({ x: rect.x, y: rect.y })
      const sf = d.scaleFactor || 1

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

  public async scrollDown(): Promise<void> {
    if (!isOsx) return
    try {
      // Simulate down arrow key or mouse scroll in macOS
      await execAsync(`osascript -e 'tell application "System Events" to key code 125'`)
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
