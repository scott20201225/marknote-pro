import path from 'path'
import fs from 'fs'
import { spawn, ChildProcess } from 'child_process'
import readline from 'readline'
import { app, ipcMain, nativeTheme } from 'electron'
import log from 'electron-log'
import { isOsx } from '../config'

export interface MacPinPayload {
  pinId: string
  imagePath?: string
  base64?: string
  x?: number
  y?: number
  width?: number
  height?: number
  markdownMeta?: any
  theme?: string
  lang?: string
}

export type MacPinEventHandler = (event: {
  event: string
  pinId?: string
  imagePath?: string
  path?: string
  [key: string]: any
}) => void

export class MacNativeHelper {
  private static _instance: MacNativeHelper | null = null
  private _proc: ChildProcess | null = null
  private _isReady = false
  private _pendingPins: MacPinPayload[] = []
  private _activePins = new Map<string, MacPinPayload>()
  private _eventListeners = new Set<MacPinEventHandler>()

  private constructor() {
    if (isOsx) {
      this.ensureRunning()
      this.initThemeAndLanguageListener()
    }
  }

  public static getInstance(): MacNativeHelper {
    if (!MacNativeHelper._instance) {
      MacNativeHelper._instance = new MacNativeHelper()
    }
    return MacNativeHelper._instance
  }

  private initThemeAndLanguageListener(): void {
    try {
      ipcMain.on('broadcast-preferences-changed', (prefs: Record<string, unknown>) => {
        if (prefs && (prefs.theme || prefs.language)) {
          const { theme, lang } = this.getCurrentThemeAndLanguage()
          this.updateThemeAndLanguage(theme, lang)
        }
      })
      nativeTheme.on('updated', () => {
        const { theme, lang } = this.getCurrentThemeAndLanguage()
        this.updateThemeAndLanguage(theme, lang)
      })
    } catch (e) {
      log.warn('[MacNativeHelper] Error setting up theme/lang listener:', e)
    }
  }

  public getCurrentThemeAndLanguage(): { theme: string; lang: string } {
    try {
      const prefFile = path.join(app.getPath('userData'), 'preferences.json')
      if (fs.existsSync(prefFile)) {
        const data = JSON.parse(fs.readFileSync(prefFile, 'utf-8'))
        return {
          theme: data.theme || (nativeTheme.shouldUseDarkColors ? 'dark' : 'light'),
          lang: data.language || 'zh-CN'
        }
      }
    } catch (e) {
      log.warn('[MacNativeHelper] Error reading preferences.json:', e)
    }
    return {
      theme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
      lang: 'zh-CN'
    }
  }

  public updateThemeAndLanguage(theme?: string, lang?: string): boolean {
    if (!isOsx || !this._proc || !this._proc.stdin) return false
    try {
      const current = this.getCurrentThemeAndLanguage()
      const cmd = JSON.stringify({
        action: 'theme',
        theme: theme || current.theme,
        lang: lang || current.lang
      })
      this._proc.stdin.write(cmd + '\n')
      return true
    } catch (err) {
      log.warn('[MacNativeHelper] Failed to send theme update:', err)
      return false
    }
  }

  public addEventListener(listener: MacPinEventHandler): () => void {
    this._eventListeners.add(listener)
    return () => this._eventListeners.delete(listener)
  }

  private getHelperBinaryPath(): string | null {
    const binNames = ['MarkNoteProPinHelper', 'mac-pin-helper']
    const baseDirs = [
      path.join(process.resourcesPath || '', 'static', 'bin'),
      path.join(app.getAppPath ? app.getAppPath() : '', 'static', 'bin'),
      path.join(app.getAppPath ? app.getAppPath() : '', '..', 'static', 'bin'),
      path.join(__dirname, '../../static/bin'),
      path.join(__dirname, '../../../static/bin'),
      path.join(__dirname, '../../../../static/bin'),
      path.join(process.cwd(), 'packages', 'desktop', 'static', 'bin'),
      path.join(process.cwd(), 'static', 'bin')
    ]
    for (const name of binNames) {
      for (const dir of baseDirs) {
        const full = path.join(dir, name)
        if (fs.existsSync(full)) {
          try {
            fs.chmodSync(full, 0o755)
          } catch {}
          return full
        }
      }
    }
    return null
  }

  public ensureRunning(): boolean {
    if (!isOsx) return false
    if (this._proc && !this._proc.killed && this._proc.exitCode === null) {
      return true
    }

    const binPath = this.getHelperBinaryPath()
    if (!binPath) {
      log.warn('[MacNativeHelper] Native helper binary mac-pin-helper not found in any candidate path!')
      return false
    }

    try {
      log.info(`[MacNativeHelper] Launching native helper: ${binPath}`)
      this._proc = spawn(binPath, [], {
        stdio: ['pipe', 'pipe', 'inherit'],
        detached: false
      })

      log.info(`[MacNativeHelper] Native helper spawned successfully (PID: ${this._proc.pid})`)

      const rl = readline.createInterface({
        input: this._proc.stdout!
      })

      rl.on('line', (line) => {
        try {
          const msg = JSON.parse(line.trim())
          this.handleHelperMessage(msg)
        } catch (e) {
          log.warn(`[MacNativeHelper] Error parsing message from helper: ${line}`, e)
        }
      })

      this._proc.on('error', (err) => {
        log.error('[MacNativeHelper] Sub-process error:', err)
      })

      this._proc.on('exit', (code, signal) => {
        log.info(`[MacNativeHelper] Process exited: code=${code}, signal=${signal}`)
        this._isReady = false
        this._proc = null
      })

      app.on('will-quit', () => {
        this.kill()
      })

      return true
    } catch (err) {
      log.error('[MacNativeHelper] Failed to spawn native helper:', err)
      return false
    }
  }

  private handleHelperMessage(msg: any): void {
    if (msg.event === 'ready') {
      log.info(`[MacNativeHelper] Native helper is ready! (PID: ${this._proc?.pid})`)
      this._isReady = true
      // Flush pending pins
      while (this._pendingPins.length > 0) {
        const pin = this._pendingPins.shift()!
        this.sendPin(pin)
      }
      return
    }

    if (msg.event === 'closed' && msg.pinId) {
      this._activePins.delete(msg.pinId)
    }

    for (const listener of this._eventListeners) {
      try {
        listener(msg)
      } catch (err) {
        log.warn('[MacNativeHelper] Error in event listener:', err)
      }
    }
  }

  public startCapture(imagePath?: string): boolean {
    if (!isOsx) return false
    this.ensureRunning()
    if (!this._proc || !this._proc.stdin) return false
    try {
      const { theme, lang } = this.getCurrentThemeAndLanguage()
      log.info(`[MacNativeHelper] Sending capture action to native helper (theme=${theme}, lang=${lang})`)
      const cmd = JSON.stringify({ action: 'capture', imagePath, theme, lang })
      this._proc.stdin.write(cmd + '\n')
      return true
    } catch (err) {
      log.error('[MacNativeHelper] Error sending capture action:', err)
      return false
    }
  }

  public toggleClipboard(): boolean {
    if (!isOsx) return false
    this.ensureRunning()
    if (!this._proc || !this._proc.stdin) return false
    try {
      const { theme, lang } = this.getCurrentThemeAndLanguage()
      log.info(`[MacNativeHelper] Sending clipboard action to native helper (theme=${theme}, lang=${lang})`)
      const cmd = JSON.stringify({ action: 'clipboard', theme, lang })
      this._proc.stdin.write(cmd + '\n')
      return true
    } catch (err) {
      log.error('[MacNativeHelper] Error sending clipboard action:', err)
      return false
    }
  }

  public pin(payload: MacPinPayload): boolean {
    if (!isOsx) return false
    this.ensureRunning()
    const { theme, lang } = this.getCurrentThemeAndLanguage()
    const enrichedPayload: MacPinPayload = {
      theme,
      lang,
      ...payload
    }
    this._activePins.set(enrichedPayload.pinId, enrichedPayload)

    if (!this._isReady) {
      this._pendingPins.push(enrichedPayload)
      return true
    }

    return this.sendPin(enrichedPayload)
  }

  private sendPin(payload: MacPinPayload): boolean {
    if (!this._proc || !this._proc.stdin) return false
    try {
      const { theme, lang } = this.getCurrentThemeAndLanguage()
      const cmd = JSON.stringify({
        action: 'pin',
        theme: payload.theme || theme,
        lang: payload.lang || lang,
        ...payload
      })
      this._proc.stdin.write(cmd + '\n')
      return true
    } catch (err) {
      log.error('[MacNativeHelper] Error writing to native helper:', err)
      return false
    }
  }

  public closePin(pinId: string): void {
    if (!isOsx || !this._proc || !this._proc.stdin) return
    try {
      this._activePins.delete(pinId)
      const cmd = JSON.stringify({ action: 'close', pinId })
      this._proc.stdin.write(cmd + '\n')
    } catch {}
  }

  public closeAll(): void {
    if (!isOsx || !this._proc || !this._proc.stdin) return
    try {
      this._activePins.clear()
      const cmd = JSON.stringify({ action: 'close-all' })
      this._proc.stdin.write(cmd + '\n')
    } catch {}
  }

  public kill(): void {
    if (this._proc) {
      try {
        this._proc.kill()
      } catch {}
      this._proc = null
    }
  }
}

export const getMacNativeHelper = (): MacNativeHelper => MacNativeHelper.getInstance()
