import http from 'http'
import type { Socket } from 'net'
import fs from 'fs'
import fsPromises from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import type { LanShareRecord, LanShareFileItem } from '../../shared/types/lanShare'
import { createZipBuffer } from './zipUtil'
import { getTranslation, SUPPORTED_LANGUAGES } from 'common/i18n'
import { getCurrentLanguage } from '../i18n'
// @ts-ignore
import { marked } from 'marked'

interface IpLockRecord {
  failedAttempts: number
  lockedUntil: number // timestamp ms
}

/**
 * 局域网 IP 防暴力破解锁定管理器
 * 规则：同一个 IP 连续密码输入错误 5 次，该 IP 被锁定 30 分钟，不允许访问和下载分享。
 */
export class IpLockManager {
  private static attempts: Map<string, IpLockRecord> = new Map()

  public static normalizeIp(rawIp?: string): string {
    if (!rawIp) return '127.0.0.1'
    let ip = rawIp.trim()
    if (ip.startsWith('::ffff:')) {
      ip = ip.substring(7)
    }
    return ip
  }

  public static checkLock(ip: string): { locked: boolean; remainingMinutes: number } {
    const record = this.attempts.get(ip)
    if (!record) return { locked: false, remainingMinutes: 0 }
    const now = Date.now()
    if (record.lockedUntil > now) {
      const remainingMinutes = Math.ceil((record.lockedUntil - now) / 60000)
      return { locked: true, remainingMinutes }
    }
    if (record.lockedUntil > 0 && record.lockedUntil <= now) {
      this.attempts.delete(ip)
    }
    return { locked: false, remainingMinutes: 0 }
  }

  public static recordFailure(ip: string): { locked: boolean; remainingAttempts: number; remainingMinutes: number } {
    const now = Date.now()
    let record = this.attempts.get(ip)
    if (!record) {
      record = { failedAttempts: 0, lockedUntil: 0 }
      this.attempts.set(ip, record)
    }
    record.failedAttempts += 1
    if (record.failedAttempts >= 5) {
      record.lockedUntil = now + 30 * 60 * 1000 // 锁定 30 分钟
      return { locked: true, remainingAttempts: 0, remainingMinutes: 30 }
    }
    return { locked: false, remainingAttempts: 5 - record.failedAttempts, remainingMinutes: 0 }
  }

  public static recordSuccess(ip: string): void {
    this.attempts.delete(ip)
  }
}

export class LanShareServer {
  public share: LanShareRecord
  private readonly appType: 'marknotepro' | 'marktextpro'
  private server: http.Server | null = null
  private openSockets: Set<Socket> = new Set()
  private validTokens: Set<string> = new Set()
  private serverSecret: string = crypto.randomBytes(16).toString('hex')

  constructor(share: LanShareRecord, appType: 'marknotepro' | 'marktextpro' = 'marknotepro') {
    this.share = share
    this.appType = appType
  }

  private get brandName(): string {
    return this.appType === 'marktextpro' ? 'MarkTextPro' : 'MarkNotePro'
  }

  private resolveRequestLanguage(req?: http.IncomingMessage): string {
    const header = String(req?.headers['accept-language'] || '').trim()
    if (header) {
      const candidates = header
        .split(',')
        .map((part) => part.split(';')[0]?.trim())
        .filter((tag): tag is string => !!tag)
      for (const rawTag of candidates) {
        const lower = rawTag.toLowerCase()
        const exact = SUPPORTED_LANGUAGES.find((l) => l.toLowerCase() === lower)
        if (exact) return exact
        if (lower.startsWith('zh-tw') || lower.startsWith('zh-hk') || lower.startsWith('zh-mo') || lower.startsWith('zh-hant')) {
          return 'zh-TW'
        }
        if (lower.startsWith('zh')) {
          return 'zh-CN'
        }
        const base = lower.split('-')[0]
        const baseMatch = SUPPORTED_LANGUAGES.find((l) => l.toLowerCase() === base)
        if (baseMatch) return baseMatch
      }
    }
    return getCurrentLanguage()
  }

  private tr(lang: string, key: string, params: Record<string, string | number> = {}): string {
    return getTranslation(key, lang, params)
  }

  public async start(preferredPort: number = 9527): Promise<number> {
    const port = await this.findAvailablePort(preferredPort)
    this.share.port = port

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res).catch((err) => {
          console.error('[LanShareServer] Request error:', err)
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ error: 'Internal Server Error' }))
          }
        })
      })

      this.server.on('connection', (socket) => {
        this.openSockets.add(socket)
        socket.once('close', () => {
          this.openSockets.delete(socket)
        })
      })

      this.server.on('error', (err) => {
        reject(err)
      })

      this.server.listen(port, '0.0.0.0', () => {
        this.share.status = 'running'
        resolve(port)
      })
    })
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        this.share.status = 'stopped'
        resolve()
        return
      }

      const s = this.server
      this.server = null
      this.share.status = 'stopped'
      this.validTokens.clear()

      // 1. Force close idle & keep-alive connections in Node 18+
      if (typeof (s as any).closeAllConnections === 'function') {
        try {
          (s as any).closeAllConnections()
        } catch {}
      }

      // 2. Destroy all active browser sockets to immediately release keep-alive
      for (const socket of this.openSockets) {
        try {
          socket.destroy()
        } catch {}
      }
      this.openSockets.clear()

      let resolved = false
      const done = () => {
        if (!resolved) {
          resolved = true
          resolve()
        }
      }

      try {
        s.close(() => {
          done()
        })
      } catch {
        done()
      }

      // 3. Fallback safety timer so pause never hangs
      setTimeout(done, 300)
    })
  }

  private async findAvailablePort(startPort: number): Promise<number> {
    for (let p = startPort; p < startPort + 50; p++) {
      const isAvailable = await new Promise<boolean>((resolve) => {
        const testServer = http.createServer()
        testServer.once('error', () => resolve(false))
        testServer.once('listening', () => {
          testServer.close(() => resolve(true))
        })
        testServer.listen(p, '0.0.0.0')
      })
      if (isAvailable) return p
    }
    return startPort
  }

  private isAuthenticated(req: http.IncomingMessage, url: URL): boolean {
    if (!this.share.password) return true

    // Check token query parameter or header
    const token = url.searchParams.get('token') || (req.headers['x-share-token'] as string)
    if (token && this.validTokens.has(token)) {
      return true
    }

    // Check Authorization header for Basic auth or password
    const auth = req.headers['authorization']
    if (auth && auth.startsWith('Bearer ')) {
      const bToken = auth.slice(7)
      if (this.validTokens.has(bToken)) return true
    }

    // Check cookie
    const cookie = req.headers['cookie']
    if (cookie) {
      const match = cookie.match(/share_token=([a-zA-Z0-9_-]+)/)
      if (match && this.validTokens.has(match[1])) {
        return true
      }
    }

    return false
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // CORS headers for LAN communication
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Share-Token')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const host = req.headers.host || `localhost:${this.share.port}`
    const parsedUrl = new URL(req.url || '/', `http://${host}`)
    const pathname = decodeURIComponent(parsedUrl.pathname)

    const lang = this.resolveRequestLanguage(req)

    // Client IP extraction & lockout check (连续密码错误5次锁定30分钟)
    const clientIp = IpLockManager.normalizeIp(
      (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress
    )
    const lockStatus = IpLockManager.checkLock(clientIp)
    if (lockStatus.locked) {
      if (
        req.headers.accept &&
        req.headers.accept.includes('text/html') &&
        !pathname.startsWith('/api/')
      ) {
        res.writeHead(429, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(this.renderLockedHtml(lockStatus.remainingMinutes, lang))
      } else {
        res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(
          JSON.stringify({
            success: false,
            error: this.tr(lang, 'lanShare.errIpLockedRemaining', {
              minutes: lockStatus.remainingMinutes
            }),
            locked: true,
            remainingMinutes: lockStatus.remainingMinutes
          })
        )
      }
      return
    }

    // 1. API: Info
    if (pathname === '/api/info') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(
        JSON.stringify({
          id: this.share.id,
          title: this.share.title || '',
          fileCount: this.share.files.length,
          hasPassword: !!this.share.password,
          createdAt: this.share.createdAt
        })
      )
      return
    }

    // 2. API: Verify Password
    if (pathname === '/api/verify' && req.method === 'POST') {
      const body = await this.readRequestBody(req)
      let password = ''
      try {
        const json = JSON.parse(body)
        password = (json.password || '').trim()
      } catch {
        password = (body || '').trim()
      }

      if (!this.share.password || password === this.share.password) {
        IpLockManager.recordSuccess(clientIp)
        const token = crypto
          .createHmac('sha256', this.serverSecret)
          .update(`${Date.now()}-${Math.random()}`)
          .digest('hex')
        this.validTokens.add(token)

        res.setHeader('Set-Cookie', `share_token=${token}; Path=/; HttpOnly; SameSite=Lax`)
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ success: true, token }))
      } else {
        const failResult = IpLockManager.recordFailure(clientIp)
        if (failResult.locked) {
          res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8' })
          res.end(
            JSON.stringify({
              success: false,
              error: this.tr(lang, 'lanShare.errIpLocked30Min'),
              locked: true,
              remainingMinutes: failResult.remainingMinutes
            })
          )
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' })
          res.end(
            JSON.stringify({
              success: false,
              error: this.tr(lang, 'lanShare.errWrongPasswordAttempts', {
                attempts: failResult.remainingAttempts
              }),
              remainingAttempts: failResult.remainingAttempts
            })
          )
        }
      }
      return
    }

    // Check authentication for protected resources
    const isAuthed = this.isAuthenticated(req, parsedUrl)

    // 3. API: List Files
    if (pathname === '/api/files') {
      if (!isAuthed) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: this.tr(lang, 'lanShare.errPasswordRequired') }))
        return
      }

      const files = this.share.files.map((f) => ({
        id: f.id,
        name: f.name,
        relativePath: f.relativePath,
        size: f.size,
        extension: f.extension,
        updatedAt: f.updatedAt,
        isMarkdown: ['.md', '.markdown'].includes(f.extension.toLowerCase())
      }))

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(
        JSON.stringify({
          title: this.share.title,
          isFolder: !!this.share.isFolder,
          rootFolderName:
            this.share.isFolder && this.share.rootPath ? path.basename(this.share.rootPath) : '',
          files
        })
      )
      return
    }

    // 4. API: Download single file (只允许根据文件ID+密码/Token进行下载，严禁传入任何路径参数，防止路径遍历)
    if (pathname.startsWith('/api/download/')) {
      const fileId = pathname.replace('/api/download/', '').trim()

      // 安全校验：fileId 仅允许字母、数字、下划线和短横线，严禁任何路径分隔符或点号
      if (!fileId || !/^[a-zA-Z0-9_-]+$/.test(fileId)) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: this.tr(lang, 'lanShare.errInvalidFileId') }))
        return
      }

      // 严格仅在当前分享白名单列表中匹配文件
      const file = this.share.files.find((f) => f.id === fileId)
      if (!file) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end(this.tr(lang, 'lanShare.errFileNotInShare'))
        return
      }

      // 密码与权限校验（支持在请求中直接传入 password 参数或使用已校验 token）
      let authed = false
      if (!this.share.password) {
        authed = true
      } else {
        const reqPassword =
          parsedUrl.searchParams.get('password') ||
          parsedUrl.searchParams.get('pwd') ||
          (req.headers['x-share-password'] as string)

        if (reqPassword) {
          if (reqPassword === this.share.password) {
            IpLockManager.recordSuccess(clientIp)
            authed = true
          } else {
            const failResult = IpLockManager.recordFailure(clientIp)
            if (failResult.locked) {
              res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8' })
              res.end(
                JSON.stringify({
                  error: this.tr(lang, 'lanShare.errIpLocked30Min'),
                  locked: true,
                  remainingMinutes: failResult.remainingMinutes
                })
              )
            } else {
              res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' })
              res.end(
                JSON.stringify({
                  error: this.tr(lang, 'lanShare.errWrongPasswordAttempts', {
                    attempts: failResult.remainingAttempts
                  }),
                  remainingAttempts: failResult.remainingAttempts
                })
              )
            }
            return
          }
        } else if (this.isAuthenticated(req, parsedUrl)) {
          authed = true
        }
      }

      if (!authed) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: this.tr(lang, 'lanShare.errDownloadAuthRequired') }))
        return
      }

      try {
        const resolvedPath = path.resolve(file.absolutePath)
        const stat = await fsPromises.stat(resolvedPath)
        const encodedName = encodeURIComponent(file.name)
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': stat.size,
          'Content-Disposition': `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`
        })
        const readStream = fs.createReadStream(resolvedPath)
        readStream.pipe(res)
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end(this.tr(lang, 'lanShare.errReadFileFailed', { error: String(err) }))
      }
      return
    }

    // 5. API: Download All as ZIP
    if (pathname === '/api/download-all') {
      let authed = isAuthed
      if (!authed && this.share.password) {
        const reqPassword =
          parsedUrl.searchParams.get('password') ||
          parsedUrl.searchParams.get('pwd') ||
          (req.headers['x-share-password'] as string)
        if (reqPassword) {
          if (reqPassword === this.share.password) {
            IpLockManager.recordSuccess(clientIp)
            authed = true
          } else {
            const failResult = IpLockManager.recordFailure(clientIp)
            if (failResult.locked) {
              res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8' })
              res.end(
                JSON.stringify({
                  error: this.tr(lang, 'lanShare.errIpLocked30Min'),
                  locked: true,
                  remainingMinutes: failResult.remainingMinutes
                })
              )
            } else {
              res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' })
              res.end(
                JSON.stringify({
                  error: this.tr(lang, 'lanShare.errWrongPasswordAttempts', {
                    attempts: failResult.remainingAttempts
                  }),
                  remainingAttempts: failResult.remainingAttempts
                })
              )
            }
            return
          }
        }
      }

      if (!authed) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: this.tr(lang, 'lanShare.errPasswordRequired') }))
        return
      }

      try {
        const zipInputs = []
        for (const file of this.share.files) {
          try {
            const buf = await fsPromises.readFile(file.absolutePath)
            zipInputs.push({
              name: file.relativePath || file.name,
              content: buf
            })
          } catch (e) {
            console.warn('[LanShareServer] Skip unreadable file:', file.absolutePath, e)
          }
        }

        const zipBuffer = createZipBuffer(zipInputs)
        const zipName = encodeURIComponent(`${this.share.title || 'shared-files'}.zip`)

        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Length': zipBuffer.length,
          'Content-Disposition': `attachment; filename="${zipName}"; filename*=UTF-8''${zipName}`
        })
        res.end(zipBuffer)
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end(this.tr(lang, 'lanShare.errZipFailed', { error: String(err) }))
      }
      return
    }

    // 6. API: Preview single file (for markdown / raw view)
    if (pathname.startsWith('/api/preview/')) {
      const fileId = pathname.replace('/api/preview/', '').trim()
      if (!fileId || !/^[a-zA-Z0-9_-]+$/.test(fileId)) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(`<h2>${this.escapeHtml(this.tr(lang, 'lanShare.errInvalidFileIdHeading'))}</h2>`)
        return
      }

      if (!isAuthed) {
        res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(`<h2>${this.escapeHtml(this.tr(lang, 'lanShare.errPasswordRequiredHeading'))}</h2>`)
        return
      }

      const file = this.share.files.find((f) => f.id === fileId)
      if (!file) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(`<h2>${this.escapeHtml(this.tr(lang, 'lanShare.errFileNotFoundHeading'))}</h2>`)
        return
      }

      try {
        const content = await fsPromises.readFile(file.absolutePath, 'utf8')
        const html = this.renderMarkdownReaderHtml(file.name, content, file.id, lang)
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(html)
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(`<h2>${this.escapeHtml(this.tr(lang, 'lanShare.errReadFailedHeading'))}</h2>`)
      }
      return
    }

    // 7. Web UI: Browser / Mobile Portal
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(this.renderPortalHtml(isAuthed, lang))
  }

  private readRequestBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
        if (body.length > 1024 * 64) {
          req.destroy()
          reject(new Error('Payload too large'))
        }
      })
      req.on('end', () => resolve(body))
      req.on('error', reject)
    })
  }

  private renderPortalHtml(isAuthed: boolean, lang: string): string {
    const hasPassword = !!this.share.password
    let displayTitle = this.share.title
    if (!displayTitle) {
      if (hasPassword && !isAuthed) {
        displayTitle = this.tr(lang, 'lanShare.webEncryptedTitle')
      } else {
        displayTitle =
          this.share.files.length === 1
            ? this.share.files[0].name
            : this.share.files.length > 1
              ? this.tr(lang, 'lanShare.webTitleMore', {
                  first: this.share.files[0].name,
                  count: this.share.files.length
                })
              : this.tr(lang, 'lanShare.webDefaultTitle')
      }
    }
    const title = this.escapeHtml(displayTitle)
    const pageTitle = this.escapeHtml(
      this.tr(lang, 'lanShare.webPageTitle', {
        title: displayTitle,
        brand: this.brandName
      })
    )
    const fileCount = this.share.files.length

    return `<!DOCTYPE html>
<html lang="${this.escapeHtml(lang)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${pageTitle}</title>
  <style>
    :root {
      --primary: #2563eb;
      --primary-hover: #1d4ed8;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --text: #0f172a;
      --text-muted: #64748b;
      --border: #e2e8f0;
      --radius: 12px;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --primary: #3b82f6;
        --primary-hover: #2563eb;
        --bg: #0f172a;
        --card-bg: #1e293b;
        --text: #f8fafc;
        --text-muted: #94a3b8;
        --border: #334155;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 16px;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .container {
      width: 100%;
      max-width: 640px;
      margin: 0 auto;
    }
    .header {
      text-align: center;
      margin-bottom: 20px;
      padding-top: 10px;
    }
    .badge {
      display: inline-block;
      font-size: 12px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 9999px;
      background: #eff6ff;
      color: var(--primary);
      margin-bottom: 8px;
    }
    @media (prefers-color-scheme: dark) {
      .badge { background: #1e3a8a; }
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 6px;
      word-break: break-all;
    }
    .subtitle {
      font-size: 14px;
      color: var(--text-muted);
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
      padding: 20px;
      margin-bottom: 20px;
    }
    .password-box {
      text-align: center;
      padding: 30px 16px;
    }
    .password-input {
      font-size: 18px;
      letter-spacing: 2px;
      text-align: center;
      width: 100%;
      max-width: 320px;
      padding: 10px 14px;
      border: 2px solid var(--border);
      border-radius: 8px;
      background: var(--bg);
      color: var(--text);
      outline: none;
      margin: 16px 0;
      transition: border-color 0.2s;
    }
    .password-input:focus {
      border-color: var(--primary);
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: background 0.2s;
      text-decoration: none;
    }
    .btn-primary {
      background: var(--primary);
      color: #fff;
    }
    .btn-primary:hover {
      background: var(--primary-hover);
    }
    .btn-sm {
      padding: 6px 12px;
      font-size: 13px;
    }
    .btn-outline {
      background: transparent;
      color: var(--primary);
      border: 1px solid var(--primary);
    }
    .error-msg {
      color: #ef4444;
      font-size: 13px;
      margin-top: 8px;
      min-height: 18px;
    }
    .actions-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .file-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      border-radius: 8px;
      border: 1px solid var(--border);
      margin-bottom: 10px;
      background: var(--bg);
      gap: 12px;
    }
    .file-item:last-child {
      margin-bottom: 0;
    }
    .file-info {
      flex: 1;
      min-width: 0;
    }
    .file-name {
      font-size: 15px;
      font-weight: 500;
      word-break: break-all;
      color: var(--text);
    }
    .file-meta {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 2px;
    }
    .file-actions {
      display: flex;
      gap: 8px;
      flex-shrink: 0;
    }
    .footer {
      text-align: center;
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 24px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="badge">${this.escapeHtml(this.tr(lang, 'lanShare.webBadge'))}</div>
      <h1>${title}</h1>
      <div class="subtitle">${this.escapeHtml(this.tr(lang, 'lanShare.webSubtitle', { count: fileCount }))}</div>
    </div>

    ${
      !isAuthed && hasPassword
        ? `
    <div class="card password-box">
      <div style="font-size: 40px; margin-bottom: 8px;">🔒</div>
      <h2 style="font-size: 18px; margin-bottom: 6px;">${this.escapeHtml(this.tr(lang, 'lanShare.webEnterPwdHeading'))}</h2>
      <p style="font-size: 13px; color: var(--text-muted);">${this.escapeHtml(this.tr(lang, 'lanShare.webEnterPwdDesc'))}</p>
      <input id="pwdInput" class="password-input" type="text" maxlength="18" placeholder="${this.escapeHtml(this.tr(lang, 'lanShare.webPwdPlaceholder'))}" autofocus autocomplete="off" />
      <div>
        <button id="verifyBtn" class="btn btn-primary" onclick="verifyPassword()">${this.escapeHtml(this.tr(lang, 'lanShare.webVerifyBtn'))}</button>
      </div>
      <div id="errMsg" class="error-msg"></div>
    </div>
    `
        : `
    <div class="card">
      <div class="actions-bar">
        <span style="font-size: 14px; font-weight: 600; color: var(--text-muted);">${this.escapeHtml(this.tr(lang, 'lanShare.webFileListCount', { count: fileCount }))}</span>
        <a href="/api/download-all" class="btn btn-primary btn-sm">${this.escapeHtml(this.tr(lang, 'lanShare.webDownloadAllZip'))}</a>
      </div>
      <div id="fileList">
        ${this.share.files
          .map((f) => {
            const isMd = ['.md', '.markdown'].includes(f.extension.toLowerCase())
            const sizeStr = this.formatSize(f.size)
            const safeName = this.escapeHtml(f.name)
            const fileExtLabel = this.escapeHtml(f.extension || this.tr(lang, 'lanShare.fileFallback'))
            return `
        <div class="file-item">
          <div class="file-info">
            <div class="file-name">${safeName}</div>
            <div class="file-meta">${sizeStr} · ${fileExtLabel}</div>
          </div>
          <div class="file-actions">
            ${
              isMd
                ? `<a href="/api/preview/${f.id}" class="btn btn-outline btn-sm">${this.escapeHtml(this.tr(lang, 'lanShare.webOnlineRead'))}</a>`
                : ''
            }
            <a href="/api/download/${f.id}" class="btn btn-primary btn-sm">${this.escapeHtml(this.tr(lang, 'lanShare.webDownload'))}</a>
          </div>
        </div>
        `
          })
          .join('')}
      </div>
    </div>
    `
    }

    <div class="footer">${this.escapeHtml(this.tr(lang, 'lanShare.webFooter', { brand: this.brandName }))}</div>
  </div>

  <script>
    const I18N = ${JSON.stringify({
      pwdEmpty: this.tr(lang, 'lanShare.webJsPwdEmpty'),
      pwdLength: this.tr(lang, 'lanShare.webJsPwdLength'),
      verifying: this.tr(lang, 'lanShare.webJsVerifying'),
      wrongPwd: this.tr(lang, 'lanShare.errWrongPassword'),
      locked: this.tr(lang, 'lanShare.webJsLocked'),
      verifyBtn: this.tr(lang, 'lanShare.webVerifyBtn'),
      connectError: this.tr(lang, 'lanShare.webJsConnectError')
    }).replace(/</g, '\\u003c')};

    const pwdInput = document.getElementById('pwdInput');
    if (pwdInput) {
      pwdInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') verifyPassword();
      });

      // 支持类似百度网盘直达链接：URL 携带 ?pwd=xxx 或 ?password=xxx 自动填入并验证
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const autoPwd = (urlParams.get('pwd') || urlParams.get('password') || '').trim();
        if (autoPwd) {
          pwdInput.value = autoPwd;
          setTimeout(() => verifyPassword(), 200);
        }
      } catch (err) {}
    }

    async function verifyPassword() {
      const pwd = (pwdInput ? pwdInput.value : '').trim();
      const errMsg = document.getElementById('errMsg');
      const verifyBtn = document.getElementById('verifyBtn');
      if (!pwd) {
        errMsg.innerText = I18N.pwdEmpty;
        return;
      }
      if (pwd.length < 10 || pwd.length > 18) {
        errMsg.innerText = I18N.pwdLength;
        return;
      }
      errMsg.innerText = '';
      verifyBtn.disabled = true;
      verifyBtn.innerText = I18N.verifying;

      try {
        const res = await fetch('/api/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pwd })
        });
        const data = await res.json();
        if (data.success) {
          window.location.reload();
        } else {
          errMsg.innerText = data.error || I18N.wrongPwd;
          if (data.locked) {
            verifyBtn.disabled = true;
            verifyBtn.innerText = I18N.locked;
          } else {
            verifyBtn.disabled = false;
            verifyBtn.innerText = I18N.verifyBtn;
            if (pwdInput) pwdInput.select();
          }
        }
      } catch (e) {
        errMsg.innerText = I18N.connectError;
        verifyBtn.disabled = false;
        verifyBtn.innerText = I18N.verifyBtn;
      }
    }
  </script>
</body>
</html>`
  }

  private renderLockedHtml(remainingMinutes: number, lang: string): string {
    return `<!DOCTYPE html>
<html lang="${this.escapeHtml(lang)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${this.escapeHtml(this.tr(lang, 'lanShare.webLockedTitle'))}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 16px; box-sizing: border-box; text-align: center; }
    .box { background: #1e293b; padding: 36px 24px; border-radius: 14px; border: 1px solid #ef4444; max-width: 440px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5); }
    h1 { font-size: 20px; color: #ef4444; margin-bottom: 12px; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin-bottom: 12px; }
    .time { font-size: 26px; font-weight: bold; color: #f59e0b; margin: 18px 0; }
  </style>
</head>
<body>
  <div class="box">
    <div style="font-size: 52px; margin-bottom: 12px;">🚫</div>
    <h1>${this.escapeHtml(this.tr(lang, 'lanShare.webLockedHeading'))}</h1>
    <p>${this.escapeHtml(this.tr(lang, 'lanShare.webLockedDesc'))}</p>
    <div class="time">${this.escapeHtml(this.tr(lang, 'lanShare.webLockedRemaining', { minutes: remainingMinutes }))}</div>
    <p>${this.escapeHtml(this.tr(lang, 'lanShare.webLockedWait'))}</p>
  </div>
</body>
</html>`
  }

  private renderMarkdownReaderHtml(fileName: string, content: string, fileId: string, lang: string): string {
    const safeTitle = this.escapeHtml(fileName)
    const readerSuffix = this.escapeHtml(this.tr(lang, 'lanShare.webReaderSuffix'))
    const safeBody = this.convertMarkdownToHtml(content)

    return `<!DOCTYPE html>
<html lang="${this.escapeHtml(lang)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${safeTitle} - ${readerSuffix}</title>
  <style>
    :root {
      --primary: #2563eb;
      --primary-hover: #1d4ed8;
      --bg: #ffffff;
      --card-bg: #f8fafc;
      --text: #0f172a;
      --text-muted: #64748b;
      --border: #e2e8f0;
      --code-bg: #f1f5f9;
      --table-alt-bg: #f8fafc;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --primary: #3b82f6;
        --primary-hover: #60a5fa;
        --bg: #0f172a;
        --card-bg: #1e293b;
        --text: #f1f5f9;
        --text-muted: #94a3b8;
        --border: #334155;
        --code-bg: #1e293b;
        --table-alt-bg: #162032;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.75;
      padding: 16px 20px 60px;
      word-break: break-word;
    }
    .top-nav {
      max-width: 840px;
      margin: 0 auto 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 14px;
      border-bottom: 1px solid var(--border);
    }
    .nav-btn {
      font-size: 14px;
      color: var(--primary);
      text-decoration: none;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 6px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      transition: all 0.15s ease;
    }
    .nav-btn:hover {
      border-color: var(--primary);
      background: var(--bg);
    }
    .article {
      max-width: 840px;
      margin: 0 auto;
    }
    .article h1, .article h2, .article h3, .article h4, .article h5, .article h6 {
      margin-top: 1.6em;
      margin-bottom: 0.7em;
      font-weight: 700;
      line-height: 1.35;
      color: var(--text);
    }
    .article h1 { font-size: 26px; border-bottom: 1px solid var(--border); padding-bottom: 8px; margin-top: 0.4em; }
    .article h2 { font-size: 21px; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
    .article h3 { font-size: 18px; }
    .article h4 { font-size: 16px; }
    .article p { margin-bottom: 1.1em; }

    /* Lists */
    .article ul, .article ol {
      margin-left: 24px;
      margin-bottom: 1.2em;
    }
    .article li {
      margin-bottom: 6px;
    }
    .article li > p {
      margin-bottom: 6px;
    }

    /* Task list items & inline checkboxes */
    .article li.task-list-item {
      list-style-type: none;
      margin-left: -18px;
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    .article input[type="checkbox"] {
      width: 15px;
      height: 15px;
      margin: 0 4px 0 0;
      vertical-align: -2px;
      cursor: default;
      accent-color: var(--primary);
    }
    .article input[type="checkbox"].task-checkbox {
      margin-top: 3px;
      flex-shrink: 0;
    }
    .article input[type="checkbox"].inline-checkbox {
      margin-left: 2px;
      margin-right: 4px;
    }

    /* Tables */
    .article .table-wrapper {
      width: 100%;
      overflow-x: auto;
      margin-bottom: 1.4em;
      border: 1px solid var(--border);
      border-radius: 8px;
      -webkit-overflow-scrolling: touch;
    }
    .article table {
      border-collapse: collapse;
      width: 100%;
      border-spacing: 0;
      font-size: 14px;
    }
    .article th, .article td {
      border: 1px solid var(--border);
      padding: 10px 14px;
      text-align: left;
    }
    .article th {
      background: var(--code-bg);
      font-weight: 600;
    }
    .article tr:nth-child(even) td {
      background: var(--table-alt-bg);
    }

    /* Code blocks */
    .article pre {
      background: var(--code-bg);
      border: 1px solid var(--border);
      padding: 14px 18px;
      border-radius: 8px;
      overflow-x: auto;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      font-size: 13.5px;
      line-height: 1.55;
      margin-bottom: 1.3em;
    }
    .article code {
      background: var(--code-bg);
      border: 1px solid var(--border);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      font-size: 0.9em;
    }
    .article pre code {
      background: transparent;
      border: none;
      padding: 0;
      font-size: inherit;
    }

    /* Blockquote */
    .article blockquote {
      border-left: 4px solid var(--primary);
      padding: 10px 16px;
      color: var(--text-muted);
      background: var(--card-bg);
      border-radius: 0 8px 8px 0;
      margin: 1.2em 0;
    }

    /* Horizontal line */
    .article hr {
      border: none;
      border-top: 1px solid var(--border);
      margin: 2em 0;
    }

    /* Links & Images */
    .article a {
      color: var(--primary);
      text-decoration: underline;
      text-underline-offset: 3px;
    }
    .article img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      margin: 1em 0;
      border: 1px solid var(--border);
    }
  </style>
</head>
<body>
  <div class="top-nav">
    <a href="/" class="nav-btn">${this.escapeHtml(this.tr(lang, 'lanShare.webBackToList'))}</a>
    <a href="/api/download/${fileId}" class="nav-btn">${this.escapeHtml(this.tr(lang, 'lanShare.webDownloadSource'))}</a>
  </div>
  <div class="article">
    ${safeBody}
  </div>
</body>
</html>`
  }

  private convertMarkdownToHtml(md: string): string {
    try {
      const renderer = new marked.Renderer()
      const origText = renderer.text.bind(renderer)
      renderer.text = function (text: string) {
        let res = origText(text)
        // 支持普通文本与多级列表中行内 [ ] 与 [x] 复选框
        res = res.replace(/\[ \]/g, '<input type="checkbox" disabled class="inline-checkbox">')
        res = res.replace(/\[[xX]\]/g, '<input type="checkbox" checked disabled class="inline-checkbox">')
        return res
      }
      renderer.table = function (header: string, body: string) {
        return `<div class="table-wrapper"><table><thead>${header}</thead><tbody>${body}</tbody></table></div>`
      }
      renderer.listitem = function (text: string, task: boolean, checked: boolean) {
        if (task) {
          const cleanText = text.replace(/^<input[^>]+>/, '').trim()
          return `<li class="task-list-item"><input type="checkbox" ${checked ? 'checked' : ''} disabled class="task-checkbox"> <span>${cleanText}</span></li>`
        }
        return `<li>${text}</li>`
      }
      renderer.link = function (href: string, title: string | null | undefined, text: string) {
        const isExternal = /^https?:\/\//i.test(href || '')
        const titleAttr = title ? ` title="${title}"` : ''
        const targetAttr = isExternal ? ' target="_blank" rel="noopener noreferrer"' : ''
        return `<a href="${href || '#'}"${titleAttr}${targetAttr}>${text}</a>`
      }

      marked.setOptions({
        gfm: true,
        breaks: true,
        renderer
      })

      return marked.parse ? marked.parse(md) : marked(md)
    } catch (e) {
      console.warn('[LanShareServer] Markdown parse error:', e)
      return `<pre style="white-space: pre-wrap;">${this.escapeHtml(md)}</pre>`
    }
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
}
