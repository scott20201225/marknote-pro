import * as fs from 'fs'
import * as path from 'path'
import { dialog, BrowserWindow, app } from 'electron'
import * as ZModem from 'zmodem.js'

export class ZModemSessionHandler {
  private sentry: any
  private isActive = false
  private activeSession: any = null
  private onTerminalData: (data: string) => void
  private sendToSession: (data: Buffer | string) => void
  private getWindow: () => BrowserWindow | null

  constructor(options: {
    onTerminalData: (data: string) => void
    sendToSession: (data: Buffer | string) => void
    getWindow: () => BrowserWindow | null
  }) {
    this.onTerminalData = options.onTerminalData
    this.sendToSession = options.sendToSession
    this.getWindow = options.getWindow

    this.sentry = new ZModem.Sentry({
      to_terminal: (octets: number[] | Uint8Array) => {
        this.onTerminalData(Buffer.from(octets).toString('utf-8'))
      },
      sender: (octets: number[] | Uint8Array) => {
        this.sendToSession(Buffer.from(octets))
      },
      on_detect: async (detection: any) => {
        this.isActive = true
        await this.handleDetection(detection)
      },
      on_retract: () => {
        this.onTerminalData('\r\n\x1b[33m[ZMODEM] 传输已取消\x1b[0m\r\n')
        this.activeSession = null
        this.isActive = false
      }
    })
  }

  public consume(chunk: Buffer): void {
    if (this.isActive || this.activeSession) {
      try {
        this.sentry.consume(chunk)
      } catch (err: any) {
        console.error('[ZMODEM] Protocol error:', err)
        this.onTerminalData(`\r\n\x1b[31;1m[ZMODEM 错误] ${err?.message || err}\x1b[0m\r\n`)
        try {
          this.activeSession?.abort()
        } catch {
          // ignore
        }
        this.activeSession = null
        this.isActive = false
      }
    } else {
      try {
        this.sentry.consume(chunk)
      } catch (err: any) {
        // Fallback: forward raw data to terminal if detection fails
        this.onTerminalData(chunk.toString('utf-8'))
      }
    }
  }

  private async handleDetection(detection: any): Promise<void> {
    let zsession: any
    try {
      zsession = detection.confirm()
      this.activeSession = zsession
    } catch (err) {
      console.error('[ZMODEM] Confirm error:', err)
      this.isActive = false
      return
    }

    try {
      if (zsession.type === 'receive') {
        // Remote initiated send to us (sz)
        await this.handleReceive(zsession)
      } else if (zsession.type === 'send') {
        // Remote is waiting for our file upload (rz)
        await this.handleSend(zsession)
      }
    } catch (err: any) {
      console.error('[ZMODEM] Session error:', err)
      this.onTerminalData(`\r\n\x1b[31;1m[ZMODEM 失败] ${err?.message || err}\x1b[0m\r\n`)
      try {
        zsession.abort()
      } catch {
        // ignore
      }
    } finally {
      this.activeSession = null
      this.isActive = false
    }
  }

  private async handleReceive(zsession: any): Promise<void> {
    const pendingReceives: Promise<void>[] = []

    zsession.on('offer', (xfer: any) => {
      pendingReceives.push(this.receiveFile(xfer, zsession))
    })

    zsession.start()

    await new Promise<void>((resolve) => zsession.on('session_end', resolve))
    await Promise.all(pendingReceives)
  }

  private async receiveFile(xfer: any, zsession: any): Promise<void> {
    try {
      const details = xfer.get_details()
      const defaultName = details.name || 'download.bin'
      const win = this.getWindow() || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]

      let defaultPath = defaultName
      try {
        defaultPath = path.join(app.getPath('downloads'), defaultName)
      } catch {
        if (process.env.HOME) {
          defaultPath = path.join(process.env.HOME, 'Downloads', defaultName)
        }
      }

      const dialogOpts = {
        title: `ZMODEM 下载文件: ${defaultName}`,
        defaultPath,
        buttonLabel: '保存'
      }

      if (win && !win.isDestroyed()) {
        try {
          win.focus()
        } catch {
          // ignore
        }
      }

      const { canceled, filePath } = win && !win.isDestroyed()
        ? await dialog.showSaveDialog(win, dialogOpts)
        : await dialog.showSaveDialog(dialogOpts)

      if (canceled || !filePath) {
        this.onTerminalData(`\r\n\x1b[33m[ZMODEM] 用户拒绝接收: ${defaultName}\x1b[0m\r\n`)
        try {
          xfer.skip()
        } catch {
          // ignore
        }
        return
      }

      this.onTerminalData(`\r\n\x1b[36m[ZMODEM] 开始接收文件: ${defaultName} (${this.formatBytes(details.size || 0)})\x1b[0m\r\n`)

      const writeStream = fs.createWriteStream(filePath)
      let receivedBytes = 0
      let lastReport = Date.now()

      await xfer.accept({
        on_input: (chunk: Uint8Array | number[]) => {
          const buf = Buffer.from(chunk)
          writeStream.write(buf)
          receivedBytes += buf.length

          const now = Date.now()
          if (now - lastReport > 300 || (details.size && receivedBytes >= details.size)) {
            lastReport = now
            const pct = details.size > 0 ? Math.round((receivedBytes / details.size) * 100) : 0
            this.onTerminalData(`\r\x1b[33m[ZMODEM 进度] ${pct}% (${this.formatBytes(receivedBytes)}/${this.formatBytes(details.size || 0)})\x1b[0m`)
          }
        }
      })

      await new Promise<void>((resStream) => {
        writeStream.end(() => resStream())
      })

      this.onTerminalData(`\r\n\x1b[32;1m[ZMODEM 完成] 文件已保存至: ${filePath}\x1b[0m\r\n`)
    } catch (err: any) {
      console.error('[ZMODEM] receiveFile error:', err)
      this.onTerminalData(`\r\n\x1b[31;1m[ZMODEM 错误] ${err?.message || err}\x1b[0m\r\n`)
      try {
        xfer.skip()
      } catch {
        // ignore
      }
    }
  }

  private async handleSend(zsession: any): Promise<void> {
    const win = this.getWindow() || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]

    if (win && !win.isDestroyed()) {
      try {
        win.focus()
      } catch {
        // ignore
      }
    }

    const { canceled, filePaths } = win && !win.isDestroyed()
      ? await dialog.showOpenDialog(win, {
          title: 'ZMODEM 选择上传文件',
          properties: ['openFile', 'multiSelections'],
          buttonLabel: '上传'
        })
      : await dialog.showOpenDialog({
          title: 'ZMODEM 选择上传文件',
          properties: ['openFile', 'multiSelections'],
          buttonLabel: '上传'
        })

    if (canceled || !filePaths || filePaths.length === 0) {
      this.onTerminalData('\r\n\x1b[33m[ZMODEM] 取消文件上传\x1b[0m\r\n')
      try {
        zsession.abort()
      } catch {
        // ignore
      }
      return
    }

    for (const filePath of filePaths) {
      const stats = fs.statSync(filePath)
      const fileName = path.basename(filePath)

      this.onTerminalData(`\r\n\x1b[36m[ZMODEM] 开始上传: ${fileName} (${this.formatBytes(stats.size)})\x1b[0m\r\n`)

      const offer = {
        name: fileName,
        size: stats.size,
        mode: stats.mode,
        mtime: stats.mtime
      }

      const xfer = await zsession.send_offer(offer)
      if (!xfer) {
        this.onTerminalData(`\r\n\x1b[31m[ZMODEM] 远程拒绝接收: ${fileName}\x1b[0m\r\n`)
        continue
      }

      const fileBuffer = fs.readFileSync(filePath)
      const chunkSize = 8192
      let sentBytes = 0
      let lastReport = Date.now()

      for (let offset = 0; offset < fileBuffer.length; offset += chunkSize) {
        const chunk = fileBuffer.subarray(offset, offset + chunkSize)
        await xfer.send(chunk)
        sentBytes += chunk.length

        const now = Date.now()
        if (now - lastReport > 300 || sentBytes >= stats.size) {
          lastReport = now
          const pct = Math.round((sentBytes / stats.size) * 100)
          this.onTerminalData(`\r\x1b[33m[ZMODEM 进度] ${pct}% (${this.formatBytes(sentBytes)}/${this.formatBytes(stats.size)})\x1b[0m`)
        }
      }

      await xfer.end()
      this.onTerminalData(`\r\n\x1b[32;1m[ZMODEM 完成] 文件已上传: ${fileName}\x1b[0m\r\n`)
    }

    try {
      await zsession.close()
    } catch {
      // ignore
    }
  }

  public isSessionActive(): boolean {
    return this.isActive || this.activeSession !== null
  }

  public abort(): void {
    if (this.activeSession) {
      try {
        this.activeSession.abort()
      } catch {
        // ignore
      }
      this.activeSession = null
      this.isActive = false
      this.onTerminalData('\r\n\x1b[33m[ZMODEM] 传输已中止\x1b[0m\r\n')
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
  }
}
