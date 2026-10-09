import * as fs from 'fs'
import { t } from '../i18n'
import type { ITerminalConnectionConfig, ITerminalSessionInfo } from '../../shared/types/terminal'

export interface ISerialPortInfo {
  path: string
  manufacturer?: string
  friendlyName?: string
}

export class SerialEngineSession {
  public id: string
  public config: ITerminalConnectionConfig
  public status: ITerminalSessionInfo['status'] = 'connecting'
  private stream: any = null

  private onDataCallback: (data: string) => void
  private onStatusCallback: (info: ITerminalSessionInfo) => void

  constructor(
    id: string,
    config: ITerminalConnectionConfig,
    callbacks: {
      onData: (data: string) => void
      onStatus: (info: ITerminalSessionInfo) => void
    }
  ) {
    this.id = id
    this.config = config
    this.onDataCallback = callbacks.onData
    this.onStatusCallback = callbacks.onStatus
  }

  public static async listPorts(): Promise<ISerialPortInfo[]> {
    const list: ISerialPortInfo[] = []
    try {
      if (process.platform === 'darwin' || process.platform === 'linux') {
        if (fs.existsSync('/dev')) {
          const files = fs.readdirSync('/dev')
          for (const f of files) {
            if (
              f.startsWith('tty.usb') ||
              f.startsWith('cu.usb') ||
              f.startsWith('ttyUSB') ||
              f.startsWith('ttyACM') ||
              f.startsWith('ttyS')
            ) {
              list.push({ path: `/dev/${f}`, friendlyName: f })
            }
          }
        }
      } else if (process.platform === 'win32') {
        for (let i = 1; i <= 16; i++) {
          list.push({ path: `COM${i}`, friendlyName: `COM${i}` })
        }
      }
    } catch {
      // ignore
    }
    return list
  }

  public async connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        // Use fs read/write stream on macOS/Linux serial devices
        const port = this.config.serialPort || this.config.portPath || ''
        const target = `Serial ${port} (${this.config.baudRate || 115200} bps)`
        this.onDataCallback(`\x1b[90m${t('terminal.connecting', { target })}\x1b[0m\r\n`)
        if (process.platform === 'darwin' || process.platform === 'linux') {
          if (!fs.existsSync(port)) {
            const err = new Error(`Serial port not found: ${port}`)
            this.onDataCallback(`\r\n\x1b[31;1m${t('terminal.connectionFailed', { error: err.message })}\x1b[0m\r\n`)
            throw err
          }
          const readStream = fs.createReadStream(port)
          const writeStream = fs.createWriteStream(port)

          readStream.on('data', (chunk: Buffer | string) => {
            this.onDataCallback(chunk.toString('utf-8'))
          })

          readStream.on('error', (err) => {
            this.status = 'error'
            this.onDataCallback(`\r\n\x1b[31;1m[连接失败] ${err.message || err}\x1b[0m\r\n`)
            this.onStatusCallback({ ...this.getSessionInfo(), error: err.message })
          })

          this.stream = { readStream, writeStream }
          this.status = 'connected'
          this.onStatusCallback(this.getSessionInfo())
          resolve()
        } else {
          this.status = 'connected'
          this.onStatusCallback(this.getSessionInfo())
          resolve()
        }
      } catch (err: any) {
        this.status = 'error'
        this.onStatusCallback({ ...this.getSessionInfo(), error: err.message })
        reject(err)
      }
    })
  }

  public write(data: string): void {
    if (this.stream?.writeStream) {
      this.stream.writeStream.write(data)
    }
  }

  public resize(_cols: number, _rows: number): void {
    // No resize in serial
  }

  public getSessionInfo(): ITerminalSessionInfo {
    const port = this.config.serialPort || this.config.portPath || 'COM'
    return {
      id: this.id,
      title: this.config.name || `Serial: ${port}`,
      type: 'serial',
      name: this.config.name,
      status: this.status,
      host: port,
      port: this.config.baudRate,
      kdbxEntryId: this.config.kdbxEntryId,
      config: this.config
    }
  }

  public cleanup(): void {
    if (this.stream?.readStream) {
      this.stream.readStream.destroy()
    }
    if (this.stream?.writeStream) {
      this.stream.writeStream.end()
    }
    this.stream = null
  }
}
