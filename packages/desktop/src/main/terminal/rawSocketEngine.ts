import * as net from 'net'
import * as dgram from 'dgram'
import type { ITerminalConnectionConfig, ITerminalSessionInfo } from '../../shared/types/terminal'

export class RawSocketEngineSession {
  public id: string
  public config: ITerminalConnectionConfig
  public tcpSocket: net.Socket | null = null
  public udpSocket: dgram.Socket | null = null
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
    if (this.config.socketProtocol === 'udp') {
      return this.connectUdp()
    }
    return this.connectTcp()
  }

  private async connectTcp(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let isResolved = false
      const socket = new net.Socket()
      this.tcpSocket = socket

      socket.connect(this.config.port || 9000, this.config.host || 'localhost', () => {
        this.status = 'connected'
        this.onStatusCallback(this.getSessionInfo())
        if (!isResolved) {
          isResolved = true
          resolve()
        }
      })

      socket.on('data', (chunk: Buffer) => {
        this.onDataCallback(chunk.toString('utf-8'))
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

  private async connectUdp(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        const socket = dgram.createSocket('udp4')
        this.udpSocket = socket

        socket.on('message', (msg) => {
          this.onDataCallback(msg.toString('utf-8'))
        })

        socket.on('error', (err) => {
          this.status = 'error'
          this.onStatusCallback({ ...this.getSessionInfo(), error: err.message })
        })

        socket.on('close', () => {
          this.status = 'disconnected'
          this.onStatusCallback(this.getSessionInfo())
        })

        this.status = 'connected'
        this.onStatusCallback(this.getSessionInfo())
        resolve()
      } catch (err: any) {
        this.status = 'error'
        reject(err)
      }
    })
  }

  public write(data: string): void {
    if (this.config.socketProtocol === 'udp' && this.udpSocket) {
      const buf = Buffer.from(data, 'utf-8')
      this.udpSocket.send(buf, 0, buf.length, this.config.port || 9000, this.config.host || 'localhost')
    } else if (this.tcpSocket && this.tcpSocket.writable) {
      this.tcpSocket.write(data)
    }
  }

  public resize(_cols: number, _rows: number): void {
    // No resize in raw socket
  }

  public getSessionInfo(): ITerminalSessionInfo {
    return {
      id: this.id,
      title: this.config.name || `Socket (${(this.config.socketProtocol || 'tcp').toUpperCase()}): ${this.config.host}:${this.config.port}`,
      type: 'rawSocket',
      name: this.config.name,
      status: this.status,
      host: this.config.host,
      port: this.config.port,
      kdbxEntryId: this.config.kdbxEntryId,
      config: this.config
    }
  }

  public cleanup(): void {
    if (this.tcpSocket) {
      this.tcpSocket.destroy()
      this.tcpSocket = null
    }
    if (this.udpSocket) {
      this.udpSocket.close()
      this.udpSocket = null
    }
  }
}
