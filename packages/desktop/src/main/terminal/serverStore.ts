import * as fs from 'fs'
import * as path from 'path'
import * as net from 'net'
import { app } from 'electron'
import type { ITerminalConnectionConfig } from '../../shared/types/terminal'

export class TerminalServerStore {
  private filePath: string

  constructor() {
    const userDataPath = app.getPath('userData')
    this.filePath = path.join(userDataPath, 'terminal_servers.json')
  }

  public getAll(): ITerminalConnectionConfig[] {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8')
        return JSON.parse(raw)
      }
    } catch {
      // ignore
    }
    return []
  }

  public save(config: ITerminalConnectionConfig): ITerminalConnectionConfig {
    const list = this.getAll()
    if (!config.id) {
      config.id = `srv_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
    }
    const index = list.findIndex((s) => s.id === config.id)
    if (index >= 0) {
      list[index] = config
    } else {
      list.push(config)
    }

    try {
      fs.writeFileSync(this.filePath, JSON.stringify(list, null, 2), 'utf-8')
    } catch (e) {
      console.error('Failed to write terminal_servers.json', e)
    }
    return config
  }

  public delete(id: string): void {
    let list = this.getAll()
    list = list.filter((s) => s.id !== id)
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(list, null, 2), 'utf-8')
    } catch (e) {
      console.error('Failed to update terminal_servers.json', e)
    }
  }

  public static async testLatency(host: string, port = 22, timeoutMs = 4000): Promise<number> {
    return new Promise((resolve, reject) => {
      const start = Date.now()
      const socket = new net.Socket()

      socket.setTimeout(timeoutMs)

      socket.connect(port, host, () => {
        const latency = Date.now() - start
        socket.destroy()
        resolve(latency)
      })

      socket.on('error', (err) => {
        socket.destroy()
        reject(err)
      })

      socket.on('timeout', () => {
        socket.destroy()
        reject(new Error('Connection timed out'))
      })
    })
  }
}
