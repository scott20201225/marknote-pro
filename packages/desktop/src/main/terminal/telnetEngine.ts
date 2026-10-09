import * as net from 'net'
import type { ITerminalConnectionConfig, ITerminalSessionInfo } from '../../shared/types/terminal'

const IAC = 255
const DONT = 254
const DO = 253
const WONT = 252
const WILL = 251

export class TelnetEngineSession {
  public id: string
  public config: ITerminalConnectionConfig
  public socket: net.Socket | null = null
  public status: ITerminalSessionInfo['status'] = 'connecting'

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

  public async connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let isResolved = false
      const socket = new net.Socket()
      this.socket = socket

      socket.setTimeout(this.config.readyTimeout || 15000)

      socket.connect(this.config.port || 23, this.config.host || 'localhost', () => {
        this.status = 'connected'
        this.onStatusCallback(this.getSessionInfo())
        if (!isResolved) {
          isResolved = true
          resolve()
        }
      })

      socket.on('data', (chunk: Buffer) => {
        const clean = this.processTelnetOptions(chunk)
        if (clean.length > 0) {
          this.onDataCallback(clean.toString('utf-8'))
        }
      })

      socket.on('error', (err) => {
        this.status = 'error'
        this.onStatusCallback({ ...this.getSessionInfo(), error: err.message })
        if (!isResolved) {
          isResolved = true
          reject(err)
        }
      })

      socket.on('close', () => {
        this.status = 'disconnected'
        this.onStatusCallback(this.getSessionInfo())
        this.cleanup()
      })
    })
  }

  public write(data: string): void {
    if (this.socket && this.socket.writable) {
      this.socket.write(data)
    }
  }

  public resize(_cols: number, _rows: number): void {
    // Telnet NAWS (Negotiate About Window Size) can be emitted if needed
  }

  public getSessionInfo(): ITerminalSessionInfo {
    return {
      id: this.id,
      title: this.config.name || `Telnet: ${this.config.host}:${this.config.port || 23}`,
      type: 'telnet',
      name: this.config.name,
      status: this.status,
      host: this.config.host,
      port: this.config.port,
      kdbxEntryId: this.config.kdbxEntryId,
      config: this.config
    }
  }

  public cleanup(): void {
    if (this.socket) {
      this.socket.destroy()
      this.socket = null
    }
  }

  private processTelnetOptions(buf: Buffer): Buffer {
    const out: number[] = []
    let i = 0
    while (i < buf.length) {
      if (buf[i] === IAC && i + 2 < buf.length) {
        const cmd = buf[i + 1]
        const opt = buf[i + 2]
        // Reply WONT/DONT to avoid blocking
        if (cmd === DO) {
          this.socket?.write(Buffer.from([IAC, WONT, opt]))
        } else if (cmd === WILL) {
          this.socket?.write(Buffer.from([IAC, DONT, opt]))
        }
        i += 3
      } else {
        out.push(buf[i])
        i++
      }
    }
    return Buffer.from(out)
  }
}
