import { BrowserWindow } from 'electron'
import { Client, type ClientChannel, type ConnectConfig } from 'ssh2'
import { t } from '../i18n'
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
// 全局记录已消费的 2FA 动态口令及主机排队锁，防止多终端同时登录同一主机触发 Linux PAM 防重放拦截
const consumedTotpMap = new Map<string, { code: string; step: number; timestamp: number }>()
const totpMutexMap = new Map<string, Promise<void>>()

async function acquireUniqueTotp(
  hostKey: string,
  secret: string,
  onNotify?: (msg: string) => void
): Promise<string> {
  // 清理 120 秒前过期的防重放记录，防止内存泄漏
  const now = Date.now()
  for (const [key, val] of consumedTotpMap.entries()) {
    if (now - val.timestamp > 120000) {
      consumedTotpMap.delete(key)
    }
  }

  // 1. 获取该主机的排队锁，确保多个并发连接按顺序申请 2FA 动态码
  while (totpMutexMap.has(hostKey)) {
    await totpMutexMap.get(hostKey)
  }

  let releaseLock: () => void = () => {}
  const lockPromise = new Promise<void>((resolve) => {
    releaseLock = resolve
  })
  totpMutexMap.set(hostKey, lockPromise)

  try {
    let res = generateTotp(secret)
    if (!res) return ''

    // 2. 如果当前动态码处于周期末尾（剩余有效期 <= 2 秒），主动延迟进入新周期，防止网络延迟导致服务端拒登
    if (res.remainingSeconds <= 2) {
      const waitMs = res.remainingSeconds * 1000 + 300
      onNotify?.(`\x1b[33m${t('terminal.twoFactor.expiringWait', { sec: res.remainingSeconds })}\x1b[0m\r\n`)
      await new Promise((r) => setTimeout(r, waitMs))
      res = generateTotp(secret)
      if (!res) return ''
    }

    // 3. 检查当前 30 秒周期是否已被其他会话消费（Linux pam_google_authenticator 默认启用防重放规则：同一周期内同一验证码只能使用一次）
    const period = res.period || 30
    let currentStep = Math.floor(Date.now() / (1000 * period))
    const lastConsumed = consumedTotpMap.get(hostKey)

    if (lastConsumed && lastConsumed.step === currentStep) {
      const totalWaitSeconds = res.remainingSeconds || period
      onNotify?.(
        `\x1b[33m${t('terminal.twoFactor.replayNotice')}\x1b[0m\r\n`
      )
      for (let sec = totalWaitSeconds; sec > 0; sec--) {
        onNotify?.(`\r\x1b[33m${t('terminal.twoFactor.waitingNextCycle', { sec })}\x1b[0m`)
        await new Promise((r) => setTimeout(r, 1000))
      }
      onNotify?.(`\r\x1b[32m${t('terminal.twoFactor.readyConnecting')}\x1b[0m\r\n`)
      await new Promise((r) => setTimeout(r, 300))
      res = generateTotp(secret)
      if (!res) return ''
      currentStep = Math.floor(Date.now() / (1000 * period))
    }

    // 记录本次消费
    consumedTotpMap.set(hostKey, {
      code: res.code,
      step: currentStep,
      timestamp: Date.now()
    })

    return res.code
  } finally {
    totpMutexMap.delete(hostKey)
    releaseLock()
  }
}

export class SshEngineSession {
  public id: string
  public config: ITerminalConnectionConfig
  public client: Client
  public shellStream: ClientChannel | null = null
  public sftpClient: any = null
  private sftpPromise: Promise<any> | null = null
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
    if (this.client) {
      try {
        this.client.removeAllListeners()
        this.client.destroy()
      } catch {
        // ignore
      }
    }
    this.client = new Client()
    this.status = 'connecting'
    this.has2fa = false

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
        readyTimeout: this.config.readyTimeout && this.config.readyTimeout > 100 ? this.config.readyTimeout : (this.config.totpSecret ? 60000 : 20000),
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
              const hostKey = `${this.config.username || 'root'}@${this.config.host}:${this.config.port || 22}`
              const code = await acquireUniqueTotp(hostKey, this.config.totpSecret, (msg) => {
                this.onDataCallback(msg)
              })
              if (code) {
                console.log(`[Terminal/SSH] 自动提交 2FA 动态码: [${code}] for ${hostKey}`)
                responses.push(code)
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

          // 增加 150ms 自然缓冲，符合人机交互与 PAM 管道读取时序
          await new Promise((resolve) => setTimeout(resolve, 150))
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

        // 2. Start Linux hardware monitoring probe after connection has stabilized
        setTimeout(() => {
          if (this.status === 'connected' && this.client) {
            this.probe = new LinuxHardwareProbe(this.client, (stats) => {
              this.onStatsCallback(stats)
            })
            this.probe.start(5000)
          }
        }, 3000)
      })

      const target = `${this.config.username ? `${this.config.username}@` : ''}${this.config.host}:${this.config.port || 22}`
      this.onDataCallback(`\x1b[90m${t('terminal.connecting', { target })}\x1b[0m\r\n`)

      this.client.on('error', (err) => {
        console.error(`[Terminal/SSH] Connection error on ${this.config.host}:`, err)
        this.status = 'error'
        this.onDataCallback(`\r\n\x1b[31;1m${t('terminal.connectionFailed', { error: err.message || err })}\x1b[0m\r\n`)
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
      if (this.shellStream && this.shellStream.writable) {
        this.shellStream.write(data)
      }
      return
    }
    if (this.zmodemHandler?.isSessionActive()) {
      return
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

  public async getSftpClient(): Promise<any> {
    if (this.sftpClient) return this.sftpClient
    if (this.sftpPromise) return this.sftpPromise

    if (this.status === 'connecting') {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          cleanup()
          reject(new Error('SSH 正在连接中，等待超时'))
        }, 15000)

        const checkInterval = setInterval(() => {
          if (this.status === 'connected') {
            cleanup()
            resolve()
          } else if (this.status === 'disconnected' || this.status === 'error') {
            cleanup()
            reject(new Error('SSH 连接失败或已断开'))
          }
        }, 150)

        const cleanup = () => {
          clearTimeout(timer)
          clearInterval(checkInterval)
        }
      })
    }

    if (!this.client || this.status !== 'connected') {
      throw new Error('SSH 连接未就绪或已断开')
    }

    this.sftpPromise = new Promise((resolve, reject) => {
      this.client.sftp((err: any, sftp: any) => {
        if (err) {
          console.error(`[Terminal/SSH] Failed to open SFTP channel:`, err)
          this.sftpPromise = null
          return reject(err)
        }
        this.sftpClient = sftp
        sftp.on('close', () => {
          console.log('[Terminal/SSH] SFTP channel closed')
          this.sftpClient = null
          this.sftpPromise = null
        })
        sftp.on('error', (sftpErr: any) => {
          console.error('[Terminal/SSH] SFTP channel error:', sftpErr)
          this.sftpClient = null
          this.sftpPromise = null
        })
        resolve(sftp)
      })
    })

    return this.sftpPromise
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
      try {
        this.sftpClient.end()
      } catch {
        // ignore
      }
      this.sftpClient = null
    }
    this.sftpPromise = null
    if (this.shellStream) {
      this.shellStream.removeAllListeners()
      try {
        this.shellStream.end()
      } catch {
        // ignore
      }
      this.shellStream = null
    }
    if (this.client) {
      this.client.removeAllListeners()
      try {
        this.client.end()
        this.client.destroy()
      } catch {
        // ignore
      }
    }
  }
}
