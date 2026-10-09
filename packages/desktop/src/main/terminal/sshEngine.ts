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

export class SshEngineSession {
  public id: string
  public config: ITerminalConnectionConfig
  public client: Client
  public shellStream: ClientChannel | null = null
  public sftpClient: any = null
  public probe: LinuxHardwareProbe | null = null
  public status: ITerminalSessionInfo['status'] = 'connecting'
  public has2fa = false

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

      const connectConfig: ConnectConfig = {
        host: this.config.host,
        port: this.config.port || 22,
        username: this.config.username || 'root',
        keepaliveInterval: this.config.keepaliveInterval || 15000,
        keepaliveCountMax: 3,
        readyTimeout: this.config.readyTimeout || 20000,
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

      this.client.on('keyboard-interactive', (name, instructions, instructionsLang, prompts, finish) => {
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
        this.status = 'connected'
        this.onStatusCallback(this.getSessionInfo())

        // 1. Open Shell channel
        this.client.shell({ term: 'xterm-256color', cols, rows }, (err, stream) => {
          if (err) {
            if (!isResolved) {
              isResolved = true
              reject(err)
            }
            return
          }

          this.shellStream = stream

          stream.on('data', (chunk: Buffer) => {
            this.onDataCallback(chunk.toString('utf-8'))
          })

          stream.on('close', () => {
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
        this.status = 'error'
        this.onDataCallback(`\r\n\x1b[31;1m[连接失败] ${err.message || err}\x1b[0m\r\n`)
        this.onStatusCallback({ ...this.getSessionInfo(), error: err.message })
        if (!isResolved) {
          isResolved = true
          reject(err)
        }
      })

      this.client.on('close', () => {
        this.status = 'disconnected'
        this.onStatusCallback(this.getSessionInfo())
        this.cleanup()
      })

      this.client.connect(connectConfig)
    })
  }

  public write(data: string): void {
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
