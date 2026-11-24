import fs from 'fs'
import fsPromises from 'fs/promises'
import path from 'path'
import os from 'os'
import http from 'http'
import { app } from 'electron'
import { EventEmitter } from 'events'
import type {
  LanShareRecord,
  LanShareFileItem,
  CreateLanShareOptions,
  DiscoveredLanShare
} from '../../shared/types/lanShare'
import { LanShareServer } from './lanShareServer'
import { LanDiscovery } from './lanDiscovery'

export class LanShareManager extends EventEmitter {
  private shares: Map<string, LanShareRecord> = new Map()
  private servers: Map<string, LanShareServer> = new Map()
  private discovery: LanDiscovery
  private storagePath: string
  private appType: 'marknotepro' | 'marktextpro'
  private defaultPort: number

  constructor(appType: 'marknotepro' | 'marktextpro' = 'marknotepro') {
    super()
    this.appType = appType
    this.defaultPort = appType === 'marktextpro' ? 9627 : 9527
    this.storagePath = path.join(app.getPath('userData'), 'lan-shares.json')
    this.discovery = new LanDiscovery({ appType }, () => this.getMyShares())

    this.discovery.on('discovered-updated', (list) => {
      this.emit('discovered-updated', list)
    })
  }

  public async init(): Promise<void> {
    await this.loadPersistedShares()
    this.discovery.start()
  }

  public async cleanup(): Promise<void> {
    this.discovery.stop()
    for (const server of this.servers.values()) {
      try {
        await server.stop()
      } catch {}
    }
    this.servers.clear()
  }

  public getMyShares(): LanShareRecord[] {
    const list = Array.from(this.shares.values()).sort((a, b) => b.createdAt - a.createdAt)
    return JSON.parse(JSON.stringify(list))
  }

  public getDiscoveredShares(): DiscoveredLanShare[] {
    return JSON.parse(JSON.stringify(this.discovery.getDiscoveredShares()))
  }

  public async createShare(options: CreateLanShareOptions): Promise<LanShareRecord> {
    const id = `share_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    const fileItems: LanShareFileItem[] = []

    for (const filePath of options.filePaths) {
      try {
        const stat = await fsPromises.stat(filePath)
        if (stat.isFile()) {
          const relPath = options.isFolder
            ? path.relative(options.rootPath, filePath)
            : path.basename(filePath)
          fileItems.push({
            id: `f_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            name: path.basename(filePath),
            relativePath: relPath,
            absolutePath: filePath,
            size: stat.size,
            isDirectory: false,
            extension: path.extname(filePath),
            updatedAt: stat.mtimeMs
          })
        }
      } catch (e) {
        console.warn('[LanShareManager] Skip stat file error:', filePath, e)
      }
    }

    if (fileItems.length === 0) {
      throw new Error('未选择有效的文件进行分享')
    }

    const ip = this.getLocalLanIp()
    const record: LanShareRecord = {
      id,
      title: (options.title || '').trim(),
      rootPath: options.rootPath,
      isFolder: options.isFolder,
      files: fileItems,
      password: (options.password || '').trim(),
      port: this.defaultPort,
      ip,
      url: `http://${ip}:${this.defaultPort}`,
      status: 'stopped',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    const server = new LanShareServer(record)
    const boundPort = await server.start(record.port)
    record.port = boundPort
    record.url = `http://${ip}:${boundPort}`
    record.status = 'running'

    this.shares.set(id, record)
    this.servers.set(id, server)

    this.discovery.broadcastShareOnline(record)
    await this.persistShares()
    this.emit('my-shares-updated', this.getMyShares())

    return JSON.parse(JSON.stringify(record))
  }

  public async stopShare(id: string): Promise<void> {
    const record = this.shares.get(id)
    const server = this.servers.get(id)
    if (server) {
      await server.stop()
      this.servers.delete(id)
    }

    if (record) {
      record.status = 'stopped'
      record.updatedAt = Date.now()
      this.discovery.broadcastShareOffline(id)
      await this.persistShares()
      this.emit('my-shares-updated', this.getMyShares())
    }
  }

  public async resumeShare(id: string): Promise<LanShareRecord> {
    const record = this.shares.get(id)
    if (!record) throw new Error('分享记录不存在')

    // Stop existing if any
    const existingServer = this.servers.get(id)
    if (existingServer) {
      await existingServer.stop()
      this.servers.delete(id)
    }

    // Refresh valid file items (in case files were removed)
    const validFiles: LanShareFileItem[] = []
    for (const f of record.files) {
      try {
        const stat = await fsPromises.stat(f.absolutePath)
        if (stat.isFile()) {
          f.size = stat.size
          f.updatedAt = stat.mtimeMs
          validFiles.push(f)
        }
      } catch {}
    }
    if (validFiles.length === 0) {
      throw new Error('分享的文件已全部不存在，无法继续分享')
    }
    record.files = validFiles

    const ip = this.getLocalLanIp()
    record.ip = ip
    const server = new LanShareServer(record)
    const port = await server.start(record.port || this.defaultPort)
    record.port = port
    record.url = `http://${ip}:${port}`
    record.status = 'running'
    record.updatedAt = Date.now()

    this.servers.set(id, server)
    this.discovery.broadcastShareOnline(record)
    await this.persistShares()
    this.emit('my-shares-updated', this.getMyShares())

    return JSON.parse(JSON.stringify(record))
  }

  public async deleteShare(id: string): Promise<void> {
    await this.stopShare(id)
    this.shares.delete(id)
    await this.persistShares()
    this.emit('my-shares-updated', this.getMyShares())
  }

  public async scanFolderFiles(targetPath: string): Promise<LanShareFileItem[]> {
    const stat = await fsPromises.stat(targetPath)
    if (stat.isFile()) {
      return [
        {
          id: `f_${Date.now()}_0`,
          name: path.basename(targetPath),
          relativePath: path.basename(targetPath),
          absolutePath: targetPath,
          size: stat.size,
          isDirectory: false,
          extension: path.extname(targetPath),
          updatedAt: stat.mtimeMs
        }
      ]
    }

    const results: LanShareFileItem[] = []

    async function walk(dir: string) {
      const entries = await fsPromises.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          await walk(full)
        } else if (entry.isFile()) {
          try {
            const fileStat = await fsPromises.stat(full)
            results.push({
              id: `f_${Math.random().toString(36).substring(2, 9)}`,
              name: entry.name,
              relativePath: path.relative(targetPath, full),
              absolutePath: full,
              size: fileStat.size,
              isDirectory: false,
              extension: path.extname(entry.name),
              updatedAt: fileStat.mtimeMs
            })
          } catch {}
        }
      }
    }

    await walk(targetPath)
    return results.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  }

  public async verifyRemotePassword(remoteUrl: string, password: string): Promise<{ success: boolean; token?: string; error?: string }> {
    return new Promise((resolve) => {
      try {
        const url = new URL('/api/verify', remoteUrl)
        const postData = JSON.stringify({ password })
        const req = http.request(
          url,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 5000
          },
          (res) => {
            let data = ''
            res.on('data', (c) => (data += c))
            res.on('end', () => {
              try {
                const json = JSON.parse(data)
                resolve(json)
              } catch {
                if (res.statusCode === 200) {
                  resolve({ success: true })
                } else if (res.statusCode === 429) {
                  resolve({
                    success: false,
                    error: '该IP因连续输错密码5次已被锁定30分钟，禁止访问',
                    locked: true
                  })
                } else {
                  resolve({ success: false, error: '提取密码错误' })
                }
              }
            })
          }
        )

        req.on('error', (err) => {
          resolve({ success: false, error: '网络连接失败: ' + err.message })
        })
        req.on('timeout', () => {
          req.destroy()
          resolve({ success: false, error: '连接超时' })
        })
        req.write(postData)
        req.end()
      } catch (err: any) {
        resolve({ success: false, error: err.message })
      }
    })
  }

  public async fetchRemoteFiles(remoteUrl: string, token?: string): Promise<{ title: string; files: any[] }> {
    return new Promise((resolve, reject) => {
      try {
        const url = new URL('/api/files', remoteUrl)
        if (token) url.searchParams.set('token', token)

        const req = http.get(url, { timeout: 6000 }, (res) => {
          if (res.statusCode === 429) {
            reject(new Error('该IP因连续输错密码5次已被锁定30分钟，禁止访问'))
            return
          }
          if (res.statusCode === 401) {
            reject(new Error('需要提取密码'))
            return
          }
          if (res.statusCode !== 200) {
            reject(new Error(`请求失败 (HTTP ${res.statusCode})`))
            return
          }
          let data = ''
          res.on('data', (c) => (data += c))
          res.on('end', () => {
            try {
              resolve(JSON.parse(data))
            } catch (e) {
              reject(e)
            }
          })
        })

        req.on('error', reject)
        req.on('timeout', () => {
          req.destroy()
          reject(new Error('请求超时'))
        })
      } catch (err) {
        reject(err)
      }
    })
  }

  public async downloadRemoteFile(
    remoteUrl: string,
    fileId: string,
    destPath: string,
    token?: string,
    password?: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const url = new URL(`/api/download/${fileId}`, remoteUrl)
        if (password) url.searchParams.set('password', password)
        if (token) url.searchParams.set('token', token)

        const req = http.get(url, { timeout: 30000 }, (res) => {
          if (res.statusCode === 429) {
            reject(new Error('该IP因连续输错密码5次已被锁定30分钟，禁止下载'))
            return
          }
          if (res.statusCode !== 200) {
            reject(new Error(`下载失败 (HTTP ${res.statusCode})`))
            return
          }

          // Ensure directory exists
          fs.mkdirSync(path.dirname(destPath), { recursive: true })
          const fileStream = fs.createWriteStream(destPath)
          res.pipe(fileStream)

          fileStream.on('finish', () => {
            fileStream.close(() => resolve(destPath))
          })
          fileStream.on('error', reject)
        })

        req.on('error', reject)
        req.on('timeout', () => {
          req.destroy()
          reject(new Error('下载超时'))
        })
      } catch (err) {
        reject(err)
      }
    })
  }

  public getLocalLanIp(): string {
    const ifaces = os.networkInterfaces()
    for (const name of Object.keys(ifaces)) {
      const entries = ifaces[name]
      if (!entries) continue
      for (const net of entries) {
        if (net.family === 'IPv4' && !net.internal) {
          if (
            net.address.startsWith('192.168.') ||
            net.address.startsWith('10.') ||
            /^172\.(1[6-9]|2\d|3[01])\./.test(net.address)
          ) {
            return net.address
          }
        }
      }
    }
    return '127.0.0.1'
  }

  private async loadPersistedShares(): Promise<void> {
    try {
      if (fs.existsSync(this.storagePath)) {
        const content = await fsPromises.readFile(this.storagePath, 'utf8')
        const rawList = JSON.parse(content)
        if (Array.isArray(rawList)) {
          for (const item of rawList) {
            // Reset status to 'stopped' on boot
            item.status = 'stopped'
            this.shares.set(item.id, item)
          }
        }
      }
    } catch (err) {
      console.warn('[LanShareManager] Failed to load persisted shares:', err)
    }
  }

  private async persistShares(): Promise<void> {
    try {
      const list = Array.from(this.shares.values())
      await fsPromises.mkdir(path.dirname(this.storagePath), { recursive: true })
      await fsPromises.writeFile(this.storagePath, JSON.stringify(list, null, 2), 'utf8')
    } catch (err) {
      console.warn('[LanShareManager] Failed to persist shares:', err)
    }
  }
}

let managerInstance: LanShareManager | null = null

export function getLanShareManager(appType: 'marknotepro' | 'marktextpro' = 'marknotepro'): LanShareManager {
  if (!managerInstance) {
    managerInstance = new LanShareManager(appType)
  }
  return managerInstance
}
