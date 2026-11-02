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
  private _lastImageFingerprint: string = ''
  private _lastTextSummary: string = ''
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
            // Filter out any legacy or file-based items
            this._history = parsed.filter((item: ClipboardItemRecord) => {
              if (item.type !== 'image' && item.content) {
                const text = item.content.trim()
                if (text.startsWith('file://')) return false
                const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
                if (lines.length > 0 && lines.length <= 20) {
                  const allFiles = lines.every((line) => {
                    if ((line.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(line)) && line.length < 500) {
                      try {
                        return fs.existsSync(line)
                      } catch {
                        return false
                      }
                    }
                    return false
                  })
                  if (allFiles) return false
                }
              }
              return true
            })
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
        if (eventType === 'change') {
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
      const data = JSON.stringify(this._history, null, 2)
      await fsPromises.writeFile(this._historyFilePath, data, 'utf-8')
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

  private _isClipboardFiles(): boolean {
    try {
      const formats = clipboard.availableFormats()
      const fileFormats = [
        'public.file-url',
        'NSFilenamesPboardType',
        'FileName',
        'FileNameW',
        'FileContents',
        'text/uri-list'
      ]
      for (const fmt of fileFormats) {
        if (formats.includes(fmt)) {
          return true
        }
      }

      const text = clipboard.readText()
      if (text.startsWith('file://')) {
        return true
      }
    } catch (err) {
      log.warn('[ClipboardService] Error detecting file formats:', err)
    }
    return false
  }

  public async checkClipboardNow(): Promise<void> {
    await this._checkClipboard()
  }

  private async _checkClipboard(): Promise<void> {
    const formats = clipboard.availableFormats()

    // Priority 1: Check image if not empty
    const hasImageFormat = formats.some((fmt) =>
      fmt.startsWith('image/') ||
      fmt === 'public.tiff' ||
      fmt === 'public.png' ||
      fmt === 'public.jpeg' ||
      fmt === 'CF_DIB' ||
      fmt === 'CF_BITMAP' ||
      fmt === 'image'
    )

    if (hasImageFormat) {
      const img = clipboard.readImage()
      if (!img.isEmpty()) {
        const size = img.getSize()
        if (size.width > 0 && size.height > 0) {
          // Zero-CPU Fast Fingerprint:
          // Sample a tiny 8x8 corner and center patch without running full-resolution PNG encoding!
          const sampleW = Math.min(8, size.width)
          const sampleH = Math.min(8, size.height)
          const sample1 = img.crop({ x: 0, y: 0, width: sampleW, height: sampleH }).getBitmap()
          const sample2 = img.crop({
            x: Math.floor((size.width - sampleW) / 2),
            y: Math.floor((size.height - sampleH) / 2),
            width: sampleW,
            height: sampleH
          }).getBitmap()

          const fingerprint = `${size.width}x${size.height}_${crypto
            .createHash('md5')
            .update(sample1)
            .update(sample2)
            .digest('hex')}`

          if (fingerprint === this._lastImageFingerprint) {
            return
          }
          this._lastImageFingerprint = fingerprint

          // Only when a genuine new image is confirmed, encode PNG once for persistent storage
          const buffer = img.toPNG()
          const hash = crypto.createHash('md5').update(buffer).digest('hex')
          if (hash === this._lastHash) {
            return
          }

          this._lastHash = hash
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
            previewText: `截图 (${size.width} × ${size.height})`,
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
      }
    }

    // Priority 2: Filter out pure file-based copy records (Finder / Explorer file copies)
    if (this._isClipboardFiles()) {
      return
    }

    const text = clipboard.readText()

    // Priority 3: Check text / code / html
    if (text && text.trim().length > 0) {
      // Fast summary check: length + head + tail sample avoids unnecessary full text hashing
      const summary = `${text.length}_${text.slice(0, 40)}_${text.slice(-40)}`
      if (summary === this._lastTextSummary) {
        return
      }

      const hash = crypto.createHash('md5').update(text).digest('hex')
      if (hash === this._lastHash) {
        this._lastTextSummary = summary
        return
      }

      this._lastHash = hash
      this._lastTextSummary = summary
      this._lastImageFingerprint = ''

      const html = clipboard.readHTML()
      const rtf = clipboard.readRTF()
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
        htmlContent: html && html.trim() ? html : undefined,
        rtfContent: rtf && rtf.trim() ? rtf : undefined,
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

  public copyToClipboard(item: ClipboardItemRecord): void {
    if (item.type === 'image' && item.imagePath && fs.existsSync(item.imagePath)) {
      const img = nativeImage.createFromPath(item.imagePath)
      clipboard.writeImage(img)
    } else if (item.imageDataUrl) {
      const img = nativeImage.createFromDataURL(item.imageDataUrl)
      clipboard.writeImage(img)
    } else {
      if (item.htmlContent || item.rtfContent) {
        clipboard.write({
          text: item.content,
          html: item.htmlContent,
          rtf: item.rtfContent
        })
      } else {
        clipboard.writeText(item.content)
      }
    }
    this._lastHash = item.hash
  }

  public pasteItem(item: ClipboardItemRecord): void {
    this.copyToClipboard(item)
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
