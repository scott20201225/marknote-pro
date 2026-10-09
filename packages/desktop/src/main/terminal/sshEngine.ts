import { BrowserWindow } from 'electron'
import { Client, type ClientChannel, type ConnectConfig } from 'ssh2'
import { generateTotp } from '../../shared/totp'
import type {
  ITerminalConnectionConfig,
  ITerminalSessionInfo,
  IHardwareStats,
  ISftpItem,
  ISftpTransferProgress
} from '../../shared/types/terminal'
import { LinuxHardwareProbe } from './probeEngine'
import { ZModemSessionHandler } from './zmodemEngine'

export class SshEngineSession {
  public id: string
  public config: ITerminalConnectionConfig
  public client: Client
  public shellStream: ClientChannel | null = null
  public sftpClient: any = null
  public probe: LinuxHardwareProbe | null = null
  public status: ITerminalSessionInfo['status'] = 'connecting'
  public has2fa = false
  public zmodemHandler: ZModemSessionHandler | null = null

  private onDataCallback: (data: string) => void
  private onStatusCallback: (info: ITerminalSessionInfo) => void
  private onStatsCallback: (stats: IHardwareStats) => void
  private on2faPromptCallback: (prompt: string, instruction?: string) => Promise<string>
  private onTransferProgressCallback: (progress: ISftpTransferProgress) => void

  constructor(
    id: string,
    config: ITerminalConnectionConfig,
    callbacks: {
      onData: (data: string) => void
      onStatus: (info: ITerminalSessionInfo) => void
      onStats: (stats: IHardwareStats) => void
      on2faPrompt: (prompt: string, instruction?: string) => Promise<string>
      onTransferProgress: (progress: ISftpTransferProgress) => void
    }
  ) {
    this.id = id
    this.config = config
    this.client = new Client()
    this.onDataCallback = callbacks.onData
    this.onStatusCallback = callbacks.onStatus
    this.onStatsCallback = callbacks.onStats
    this.on2faPromptCallback = callbacks.on2faPrompt
    this.onTransferProgressCallback = callbacks.onTransferProgress
  }

  public async connect(cols = 80, rows = 24): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let isResolved = false

      // In ssh2, keepaliveInterval is in milliseconds (0 to disable).
      // UI / configs pass seconds. If > 0 and <= 600, convert to milliseconds.
      let kaInterval = 0
      if (typeof this.config.keepaliveInterval === 'number') {
        if (this.config.keepaliveInterval > 0 && this.config.keepaliveInterval <= 600) {
          kaInterval = this.config.keepaliveInterval * 1000
        } else if (this.config.keepaliveInterval > 600) {
          kaInterval = this.config.keepaliveInterval
        }
      }

      const connectConfig: ConnectConfig = {
        host: this.config.host,
        port: this.config.port || 22,
        username: this.config.username || 'root',
        keepaliveInterval: kaInterval,
        keepaliveCountMax: 10,
        readyTimeout: this.config.readyTimeout && this.config.readyTimeout > 100 ? this.config.readyTimeout : 20000,
        tryKeyboard: true
      }

      if (this.config.authType === 'privateKey' && this.config.privateKey) {
        connectConfig.privateKey = this.config.privateKey
        if (this.config.passphrase) {
          connectConfig.passphrase = this.config.passphrase
        }
      } else if (this.config.password) {
        connectConfig.password = this.config.password
      }

      console.log(`[Terminal/SSH] Connecting to ${connectConfig.username}@${connectConfig.host}:${connectConfig.port}`, {
        authType: this.config.authType,
        hasPassword: Boolean(this.config.password),
        hasKey: Boolean(this.config.privateKey),
        hasTotp: Boolean(this.config.totpSecret)
      })

      this.client.on('keyboard-interactive', (name, instructions, instructionsLang, prompts, finish) => {
        console.log('[Terminal/SSH] 2FA / keyboard-interactive prompt:', prompts.map(p => p.prompt))
        this.has2fa = true
        const responses: string[] = []

        const processPrompts = async (): Promise<void> => {
          for (const p of prompts) {
            const promptText = p.prompt.trim()
            const isPassword = /password/i.test(promptText)
            const isTotp = /verification|code|otp|token|one-time|2fa/i.test(promptText)

            if (isTotp && this.config.totpSecret) {
              const res = generateTotp(this.config.totpSecret)
              if (res?.code) {
                responses.push(res.code)
                continue
              }
            }

            if (isPassword && this.config.password) {
              responses.push(this.config.password)
              continue
            }

            try {
              const userInput = await this.on2faPromptCallback(promptText, instructions)
              responses.push(userInput)
            } catch {
              responses.push('')
            }
          }
          finish(responses)
        }

        processPrompts().catch(() => finish([]))
      })

      this.client.on('ready', () => {
        console.log(`[Terminal/SSH] Successfully connected to ${this.config.host}:${this.config.port || 22}`)
        this.status = 'connected'
        this.onStatusCallback(this.getSessionInfo())

        // 1. Open Shell channel
        this.client.shell({ term: 'xterm-256color', cols, rows }, (err, stream) => {
          if (err) {
            console.error('[Terminal/SSH] Failed to open shell channel:', err)
            if (!isResolved) {
              isResolved = true
              reject(err)
            }
            return
          }

          this.shellStream = stream

          this.zmodemHandler = new ZModemSessionHandler({
            onTerminalData: (text) => this.onDataCallback(text),
            sendToSession: (data) => {
              if (this.shellStream && this.shellStream.writable) {
                this.shellStream.write(data)
              }
            },
            getWindow: () => BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
          })

          stream.on('data', (chunk: Buffer) => {
            if (this.zmodemHandler) {
              this.zmodemHandler.consume(chunk)
            } else {
              this.onDataCallback(chunk.toString('utf-8'))
            }
          })

          stream.on('close', () => {
            console.log('[Terminal/SSH] Shell stream closed')
            this.zmodemHandler?.abort()
            this.status = 'disconnected'
            this.onStatusCallback(this.getSessionInfo())
          })

          if (!isResolved) {
            isResolved = true
            resolve()
          }
        })

        // 2. Open SFTP channel
        this.client.sftp((err, sftp) => {
          if (!err && sftp) {
            this.sftpClient = sftp
          }
        })

        // 3. Start Linux hardware monitoring probe
        this.probe = new LinuxHardwareProbe(this.client, (stats) => {
          this.onStatsCallback(stats)
        })
        this.probe.start(2500)
      })

      this.onDataCallback(`\x1b[90m正在连接至 ${this.config.username ? `${this.config.username}@` : ''}${this.config.host}:${this.config.port || 22}...\x1b[0m\r\n`)

      this.client.on('error', (err) => {
        console.error(`[Terminal/SSH] Connection error on ${this.config.host}:`, err)
        this.status = 'error'
        this.onDataCallback(`\r\n\x1b[31;1m[连接失败] ${err.message || err}\x1b[0m\r\n`)
        this.onStatusCallback({ ...this.getSessionInfo(), error: err.message })
        if (!isResolved) {
          isResolved = true
          reject(err)
        }
      })

      this.client.on('close', () => {
        console.log(`[Terminal/SSH] Connection closed: ${this.config.host}`)
        this.status = 'disconnected'
        this.onStatusCallback(this.getSessionInfo())
        this.cleanup()
      })

      this.client.connect(connectConfig)
    })
  }

  public write(data: string): void {
    if (data === '\x03') {
      this.zmodemHandler?.abort()
    }
    if (this.shellStream && this.shellStream.writable) {
      this.shellStream.write(data)
    }
  }

  public resize(cols: number, rows: number): void {
    if (this.shellStream && this.shellStream.setWindow) {
      this.shellStream.setWindow(rows, cols, 0, 0)
    }
  }

  public getSessionInfo(): ITerminalSessionInfo {
    return {
      id: this.id,
      title: this.config.name || `SSH: ${this.config.host}:${this.config.port}`,
      type: 'ssh',
      name: this.config.name,
      status: this.status,
      has2fa: this.has2fa || Boolean(this.config.totpSecret),
      host: this.config.host,
      port: this.config.port,
      username: this.config.username,
      kdbxEntryId: this.config.kdbxEntryId,
      config: this.config
    }
  }

  public cleanup(): void {
    if (this.zmodemHandler) {
      this.zmodemHandler.abort()
      this.zmodemHandler = null
    }
    if (this.probe) {
      this.probe.stop()
      this.probe = null
    }
    if (this.sftpClient) {
      this.sftpClient = null
    }
    if (this.shellStream) {
      this.shellStream.removeAllListeners()
      this.shellStream = null
    }
    if (this.client) {
      this.client.end()
    }
  }
}
