import * as fs from 'fs'
import * as path from 'path'
import { dialog, BrowserWindow } from 'electron'
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
    const win = this.getWindow() || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]

    return new Promise<void>((resolve, reject) => {
      let isEnded = false

      zsession.on('offer', async (xfer: any) => {
        try {
          const details = xfer.get_details()
          const defaultName = details.name || 'download.bin'

          // Prompt user to save file
          const { canceled, filePath } = await dialog.showSaveDialog(win, {
            title: `ZMODEM 下载: ${defaultName}`,
            defaultPath: defaultName,
            buttonLabel: '保存'
          })

          if (canceled || !filePath) {
            this.onTerminalData(`\r\n\x1b[33m[ZMODEM] 取消接收: ${defaultName}\x1b[0m\r\n`)
            xfer.skip()
            return
          }

          this.onTerminalData(`\r\n\x1b[36m[ZMODEM] 开始下载: ${defaultName} (${this.formatBytes(details.size || 0)})\x1b[0m\r\n`)

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
        } catch (err) {
          try {
            xfer.skip()
          } catch {
            // ignore
          }
          reject(err)
        }
      })

      zsession.on('session_end', () => {
        if (!isEnded) {
          isEnded = true
          resolve()
        }
      })

      zsession.start()
    })
  }

  private async handleSend(zsession: any): Promise<void> {
    const win = this.getWindow() || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]

    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
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

  public abort(): void {
    if (this.activeSession) {
      try {
        this.activeSession.abort()
      } catch {
        // ignore
      }
      this.activeSession = null
      this.isActive = false
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
