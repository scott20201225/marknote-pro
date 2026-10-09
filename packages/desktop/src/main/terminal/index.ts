import { ipcMain, BrowserWindow, dialog } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { SshEngineSession } from './sshEngine'
import { TelnetEngineSession } from './telnetEngine'
import { SerialEngineSession } from './serialEngine'
import { RawSocketEngineSession } from './rawSocketEngine'
import { SftpManager } from './sftpEngine'
import { TerminalServerStore } from './serverStore'
import { t } from '../i18n'
import type {
  ITerminalConnectionConfig,
  ITerminalSessionInfo,
  IHardwareStats,
  ISftpTransferProgress
} from '../../shared/types/terminal'

type AnySession = SshEngineSession | TelnetEngineSession | SerialEngineSession | RawSocketEngineSession

export class TerminalManager {
  private static instance: TerminalManager | null = null
  private sessions = new Map<string, AnySession>()
  private serverStore = new TerminalServerStore()
  private pending2faResolvers = new Map<string, (val: string) => void>()

  public static getInstance(): TerminalManager {
    if (!TerminalManager.instance) {
      TerminalManager.instance = new TerminalManager()
    }
    return TerminalManager.instance
  }

  public registerHandlers(): void {
    // 1. Connect
    ipcMain.handle(
      'mt::terminal:connect',
      async (_event, config: ITerminalConnectionConfig, cols?: number, rows?: number, existingSessionId?: string) => {
        const sessionId = existingSessionId || `term_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
        const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]

        console.log(`[Terminal/Manager] mt::terminal:connect requested:`, {
          sessionId,
          type: config.type,
          host: config.host,
          port: config.port,
          existingSessionId
        })

        // Cleanup old engine session if reconnecting an existing session
        const oldSession = this.sessions.get(sessionId)
        if (oldSession) {
          try {
            oldSession.cleanup()
          } catch {
            // ignore
          }
          this.sessions.delete(sessionId)
        }

        const callbacks = {
          onData: (data: string) => {
            if (win && !win.isDestroyed()) {
              win.webContents.send('mt::terminal:data', { sessionId, data })
            }
          },
          onStatus: (info: ITerminalSessionInfo) => {
            if (win && !win.isDestroyed()) {
              win.webContents.send('mt::terminal:status', info)
            }
          },
          onStats: (stats: IHardwareStats) => {
            if (win && !win.isDestroyed()) {
              win.webContents.send('mt::terminal:stats', { sessionId, stats })
            }
          },
          on2faPrompt: async (prompt: string, instruction?: string) => {
            return new Promise<string>((resolve) => {
              const promptId = `2fa_${Date.now()}`
              this.pending2faResolvers.set(promptId, resolve)
              if (win && !win.isDestroyed()) {
                win.webContents.send('mt::terminal:2fa-prompt', {
                  sessionId,
                  promptId,
                  prompt,
                  instruction
                })
              }
            })
          },
          onTransferProgress: (progress: ISftpTransferProgress) => {
            if (win && !win.isDestroyed()) {
              win.webContents.send('mt::terminal:sftp-progress', { sessionId, progress })
            }
          }
        }

        let session: AnySession
        if (config.type === 'ssh') {
          session = new SshEngineSession(sessionId, config, callbacks)
        } else if (config.type === 'telnet') {
          session = new TelnetEngineSession(sessionId, config, callbacks)
        } else if (config.type === 'serial') {
          session = new SerialEngineSession(sessionId, config, callbacks)
        } else if (config.type === 'rawSocket') {
          session = new RawSocketEngineSession(sessionId, config, callbacks)
        } else {
          throw new Error(`不支持的连接类型: ${(config as any).type}`)
        }

        this.sessions.set(sessionId, session)

        // Asynchronously initiate connection so the session info & tab are created immediately
        Promise.resolve().then(() => {
          if (config.type === 'ssh') {
            return (session as SshEngineSession).connect(cols, rows)
          } else {
            return session.connect()
          }
        }).catch((err) => {
          callbacks.onData(`\r\n\x1b[31;1m${t('terminal.connectionFailed', { error: err?.message || err })}\x1b[0m\r\n`)
          callbacks.onStatus({ ...session.getSessionInfo(), status: 'error', error: err?.message || String(err) })
        })

        return session.getSessionInfo()
      }
    )

    // 2. Write & Resize
    ipcMain.on('mt::terminal:write', (_event, { sessionId, data }: { sessionId: string; data: string }) => {
      const s = this.sessions.get(sessionId)
      if (s) s.write(data)
    })

    ipcMain.on('mt::terminal:resize', (_event, { sessionId, cols, rows }: { sessionId: string; cols: number; rows: number }) => {
      const s = this.sessions.get(sessionId)
      if (s) s.resize(cols, rows)
    })

    // 3. Disconnect
    ipcMain.handle('mt::terminal:disconnect', async (_event, sessionId: string) => {
      const s = this.sessions.get(sessionId)
      if (s) {
        s.cleanup()
        this.sessions.delete(sessionId)
      }
      return true
    })

    // 4. 2FA Answer
    ipcMain.on('mt::terminal:2fa-answer', (_event, { promptId, code }: { promptId: string; code: string }) => {
      const resolve = this.pending2faResolvers.get(promptId)
      if (resolve) {
        resolve(code)
        this.pending2faResolvers.delete(promptId)
      }
    })

    // 5. SFTP Operations
    ipcMain.handle('mt::terminal:sftp-list', async (_event, sessionId: string, dirPath: string) => {
      const s = this.sessions.get(sessionId) as SshEngineSession | undefined
      if (!s) throw new Error(t('terminal.sessionNotFound'))
      const sftp = await s.getSftpClient()
      return SftpManager.listDir(sftp, dirPath)
    })

    ipcMain.handle('mt::terminal:sftp-upload', async (_event, sessionId: string, localPath: string, remotePath: string) => {
      const s = this.sessions.get(sessionId) as SshEngineSession | undefined
      if (!s) throw new Error(t('terminal.sessionNotFound'))
      const sftp = await s.getSftpClient()
      const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
      return SftpManager.uploadFile(sftp, localPath, remotePath, (progress) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('mt::terminal:sftp-progress', { sessionId, progress })
        }
      })
    })

    ipcMain.handle('mt::terminal:sftp-download', async (_event, sessionId: string, remotePath: string, targetLocalPath?: string) => {
      const s = this.sessions.get(sessionId) as SshEngineSession | undefined
      if (!s) throw new Error(t('terminal.sessionNotFound'))

      let localPath = targetLocalPath
      if (!localPath) {
        const defaultFileName = path.posix.basename(remotePath)
        let defaultPath: string | undefined
        if (process.env.HOME) {
          const downloadDir = path.join(process.env.HOME, 'Downloads')
          if (fs.existsSync(downloadDir)) {
            defaultPath = path.join(downloadDir, defaultFileName)
          }
        }

        const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
        if (win && !win.isDestroyed()) {
          try {
            win.focus()
          } catch {
            // ignore
          }
        }

        const dialogOpts = {
          title: t('terminal.sftp.downloadDialogTitle', { name: defaultFileName }),
          defaultPath,
          buttonLabel: t('terminal.sftp.save')
        }

        const { canceled, filePath } = win && !win.isDestroyed()
          ? await dialog.showSaveDialog(win, dialogOpts)
          : await dialog.showSaveDialog(dialogOpts)

        if (canceled || !filePath) {
          return { canceled: true }
        }
        localPath = filePath
      }

      const sftp = await s.getSftpClient()
      const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
      await SftpManager.downloadFile(sftp, remotePath, localPath, (progress) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('mt::terminal:sftp-progress', { sessionId, progress })
        }
      })
      return { canceled: false, localPath }
    })

    ipcMain.handle('mt::terminal:sftp-mkdir', async (_event, sessionId: string, remotePath: string) => {
      const s = this.sessions.get(sessionId) as SshEngineSession | undefined
      if (!s) throw new Error(t('terminal.sessionNotFound'))
      const sftp = await s.getSftpClient()
      return SftpManager.mkdir(sftp, remotePath)
    })

    ipcMain.handle('mt::terminal:sftp-delete', async (_event, sessionId: string, remotePath: string, isDirectory: boolean) => {
      const s = this.sessions.get(sessionId) as SshEngineSession | undefined
      if (!s) throw new Error(t('terminal.sessionNotFound'))
      const sftp = await s.getSftpClient()
      return SftpManager.deleteItem(sftp, remotePath, isDirectory)
    })

    ipcMain.handle('mt::terminal:sftp-rename', async (_event, sessionId: string, oldPath: string, newPath: string) => {
      const s = this.sessions.get(sessionId) as SshEngineSession | undefined
      if (!s) throw new Error(t('terminal.sessionNotFound'))
      const sftp = await s.getSftpClient()
      return SftpManager.rename(sftp, oldPath, newPath)
    })

    ipcMain.handle('mt::terminal:sftp-read', async (_event, sessionId: string, remotePath: string) => {
      const s = this.sessions.get(sessionId) as SshEngineSession | undefined
      if (!s) throw new Error(t('terminal.sessionNotFound'))
      const sftp = await s.getSftpClient()
      return SftpManager.readFile(sftp, remotePath)
    })

    ipcMain.handle('mt::terminal:sftp-write', async (_event, sessionId: string, remotePath: string, content: string) => {
      const s = this.sessions.get(sessionId) as SshEngineSession | undefined
      if (!s) throw new Error(t('terminal.sessionNotFound'))
      const sftp = await s.getSftpClient()
      return SftpManager.writeFile(sftp, remotePath, content)
    })

    // 6. Serial Port Enumeration
    ipcMain.handle('mt::terminal:list-serial-ports', async () => {
      return SerialEngineSession.listPorts()
    })

    // 7. Server Store & Ping
    ipcMain.handle('mt::terminal:get-stored-servers', async () => {
      return this.serverStore.getAll()
    })

    ipcMain.handle('mt::terminal:save-stored-server', async (_event, config: ITerminalConnectionConfig) => {
      return this.serverStore.save(config)
    })

    ipcMain.handle('mt::terminal:delete-stored-server', async (_event, id: string) => {
      this.serverStore.delete(id)
      return true
    })

    ipcMain.handle('mt::terminal:test-latency', async (_event, host: string, port = 22) => {
      return TerminalServerStore.testLatency(host, port)
    })
  }
}

export function registerTerminalHandlers(): void {
  TerminalManager.getInstance().registerHandlers()
}
