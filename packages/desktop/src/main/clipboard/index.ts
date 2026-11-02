import path from 'path'
import os from 'os'
import fs from 'fs'
import fsPromises from 'fs/promises'
import crypto from 'crypto'
import { exec } from 'child_process'
import { promisify } from 'util'
import { clipboard, nativeImage } from 'electron'
import log from 'electron-log'

const execAsync = promisify(exec)
import { TypedEmitter } from '@shared/types/typedEmitter'
import type { ClipboardItemRecord, ClipboardContentType } from '@shared/types/clipboard'

export interface ClipboardServiceEvents {
  'history-updated': [history: ClipboardItemRecord[]]
}

const MAX_HISTORY_ITEMS = 500
const POLL_INTERVAL_MS = 800

export class ClipboardService extends TypedEmitter<ClipboardServiceEvents> {
  private _storageDir: string
  private _imagesDir: string
  private _historyFilePath: string
  private _history: ClipboardItemRecord[] = []
  private _lastHash: string = ''
  private _pollTimer: NodeJS.Timeout | null = null
  private _fileWatcher: fs.FSWatcher | null = null
  private _isWritingFile: boolean = false

  constructor() {
    super()
    this._storageDir = path.join(os.homedir(), '.mark-suite', 'clipboard')
    this._imagesDir = path.join(this._storageDir, 'images')
    this._historyFilePath = path.join(this._storageDir, 'history.json')
    this._ensureDirs()
    this._loadHistoryFromDisk()
    this._watchHistoryFile()
  }

  public get storageDir(): string {
    return this._storageDir
  }

  public get imagesDir(): string {
    return this._imagesDir
  }

  public get history(): ClipboardItemRecord[] {
    return [...this._history]
  }

  private _ensureDirs(): void {
    try {
      if (!fs.existsSync(this._storageDir)) {
        fs.mkdirSync(this._storageDir, { recursive: true })
      }
      if (!fs.existsSync(this._imagesDir)) {
        fs.mkdirSync(this._imagesDir, { recursive: true })
      }
    } catch (err) {
      log.error('[ClipboardService] Failed to create shared directories:', err)
    }
  }

  private _loadHistoryFromDisk(): void {
    try {
      if (fs.existsSync(this._historyFilePath)) {
        const raw = fs.readFileSync(this._historyFilePath, 'utf-8')
        if (raw.trim()) {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) {
            this._history = parsed
            if (this._history.length > 0) {
              this._lastHash = this._history[0].hash
            }
          }
        }
      }
    } catch (err) {
      log.error('[ClipboardService] Failed to load history from disk:', err)
      this._history = []
    }
  }

  private _watchHistoryFile(): void {
    try {
      if (!fs.existsSync(this._historyFilePath)) {
        fs.writeFileSync(this._historyFilePath, '[]', 'utf-8')
      }
      this._fileWatcher = fs.watch(this._historyFilePath, (eventType) => {
        if (this._isWritingFile) return
        if (eventType === 'change' || eventType === 'rename') {
          setTimeout(() => {
            if (this._isWritingFile) return
            this._loadHistoryFromDisk()
            this.emit('history-updated', this.history)
          }, 150)
        }
      })
    } catch (err) {
      log.warn('[ClipboardService] Failed to set up file watch on history.json:', err)
    }
  }

  private async _saveHistoryToDisk(): Promise<void> {
    this._isWritingFile = true
    try {
      const tmpPath = `${this._historyFilePath}.${Date.now()}.tmp`
      const data = JSON.stringify(this._history, null, 2)
      await fsPromises.writeFile(tmpPath, data, 'utf-8')
      await fsPromises.rename(tmpPath, this._historyFilePath)
    } catch (err) {
      log.error('[ClipboardService] Failed to write history.json:', err)
    } finally {
      setTimeout(() => {
        this._isWritingFile = false
      }, 200)
    }
  }

  public startMonitoring(): void {
    if (this._pollTimer) return
    this._pollTimer = setInterval(() => {
      this._checkClipboard().catch((err) => {
        log.error('[ClipboardService] Error during clipboard check:', err)
      })
    }, POLL_INTERVAL_MS)
  }

  public stopMonitoring(): void {
    if (this._pollTimer) {
      clearInterval(this._pollTimer)
      this._pollTimer = null
    }
    if (this._fileWatcher) {
      this._fileWatcher.close()
      this._fileWatcher = null
    }
  }

  private async _checkClipboard(): Promise<void> {
    const img = clipboard.readImage()
    const text = clipboard.readText()
    const html = clipboard.readHTML()

    // Priority 1: Check image if not empty
    if (!img.isEmpty()) {
      const buffer = img.toPNG()
      const hash = crypto.createHash('md5').update(buffer).digest('hex')
      if (hash === this._lastHash) {
        return
      }

      this._lastHash = hash
      const size = img.getSize()
      const fileName = `img_${Date.now()}_${hash.slice(0, 8)}.png`
      const filePath = path.join(this._imagesDir, fileName)

      try {
        await fsPromises.writeFile(filePath, buffer)
      } catch (err) {
        log.error('[ClipboardService] Failed to save clipboard image file:', err)
      }

      const thumbnail = img.resize({ width: Math.min(300, size.width) }).toDataURL()

      const item: ClipboardItemRecord = {
        id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: 'image',
        content: `[Image: ${size.width}x${size.height}]`,
        previewText: `图片 (${size.width} × ${size.height})`,
        imagePath: filePath,
        imageDataUrl: thumbnail,
        width: size.width,
        height: size.height,
        timestamp: Date.now(),
        hash
      }

      this._addItem(item)
      return
    }

    // Priority 2: Check text / code / html
    if (text && text.trim().length > 0) {
      const hash = crypto.createHash('md5').update(text).digest('hex')
      if (hash === this._lastHash) {
        return
      }

      this._lastHash = hash
      const trimmed = text.trim()
      let type: ClipboardContentType = 'text'

      // Heuristic for code detection
      if (
        (trimmed.includes('{') && trimmed.includes('}')) ||
        (trimmed.includes('function') || trimmed.includes('const ') || trimmed.includes('let ')) ||
        (trimmed.includes('import ') && trimmed.includes('from ')) ||
        (trimmed.includes('<div') || trimmed.includes('</')) ||
        (trimmed.includes('class ') && trimmed.includes(':'))
      ) {
        type = 'code'
      } else if (html && html.includes('<') && html.includes('>')) {
        type = 'html'
      }

      const preview = trimmed.slice(0, 160).replace(/\r?\n/g, ' ')

      const item: ClipboardItemRecord = {
        id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type,
        content: text,
        previewText: preview,
        charCount: text.length,
        timestamp: Date.now(),
        hash
      }

      this._addItem(item)
    }
  }

  private _addItem(item: ClipboardItemRecord): void {
    // Deduplicate existing identical hash from previous positions
    this._history = this._history.filter((h) => h.hash !== item.hash)
    this._history.unshift(item)

    if (this._history.length > MAX_HISTORY_ITEMS) {
      this._history = this._history.slice(0, MAX_HISTORY_ITEMS)
    }

    this._saveHistoryToDisk()
    this.emit('history-updated', this.history)
  }

  public async addCapturedImage(dataUrl: string, width: number, height: number): Promise<ClipboardItemRecord> {
    const img = nativeImage.createFromDataURL(dataUrl)
    const buffer = img.toPNG()
    const hash = crypto.createHash('md5').update(buffer).digest('hex')
    this._lastHash = hash

    const fileName = `capture_${Date.now()}_${hash.slice(0, 8)}.png`
    const filePath = path.join(this._imagesDir, fileName)
    await fsPromises.writeFile(filePath, buffer)

    const thumbnail = img.resize({ width: Math.min(300, width) }).toDataURL()

    const item: ClipboardItemRecord = {
      id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: 'image',
      content: `[Screenshot: ${width}x${height}]`,
      previewText: `截图 (${width} × ${height})`,
      imagePath: filePath,
      imageDataUrl: thumbnail,
      width,
      height,
      timestamp: Date.now(),
      hash
    }

    this._addItem(item)
    return item
  }

  public async deleteItem(id: string): Promise<boolean> {
    const target = this._history.find((item) => item.id === id)
    if (target && target.imagePath) {
      try {
        if (fs.existsSync(target.imagePath)) {
          await fsPromises.unlink(target.imagePath)
        }
      } catch (err) {
        log.warn('[ClipboardService] Failed to remove image asset on delete:', err)
      }
    }
    this._history = this._history.filter((item) => item.id !== id)
    await this._saveHistoryToDisk()
    this.emit('history-updated', this.history)
    return true
  }

  public async clearHistory(): Promise<boolean> {
    this._history = []
    this._lastHash = ''
    await this._saveHistoryToDisk()
    this.emit('history-updated', this.history)
    return true
  }

  public pasteItem(item: ClipboardItemRecord): void {
    if (item.type === 'image' && item.imagePath && fs.existsSync(item.imagePath)) {
      const img = nativeImage.createFromPath(item.imagePath)
      clipboard.writeImage(img)
    } else if (item.imageDataUrl) {
      const img = nativeImage.createFromDataURL(item.imageDataUrl)
      clipboard.writeImage(img)
    } else {
      clipboard.writeText(item.content)
    }
    this._lastHash = item.hash
  }

  public async simulatePaste(): Promise<void> {
    // Wait for the window manager to return focus to the previous application
    await new Promise((resolve) => setTimeout(resolve, 120))
    try {
      if (process.platform === 'darwin') {
        await execAsync(`osascript -e 'tell application "System Events" to keystroke "v" using command down'`)
      } else if (process.platform === 'win32') {
        await execAsync(`powershell -NoProfile -Command "$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys('^v')"` )
      } else if (process.platform === 'linux') {
        await execAsync(`xdotool key ctrl+v`)
      }
      log.info('[ClipboardService] Successfully simulated paste keystroke')
    } catch (err) {
      log.warn('[ClipboardService] Failed to simulate paste keystroke:', err)
    }
  }
}

let instance: ClipboardService | null = null

export const getClipboardService = (): ClipboardService => {
  if (!instance) {
    instance = new ClipboardService()
    instance.startMonitoring()
  }
  return instance
}
