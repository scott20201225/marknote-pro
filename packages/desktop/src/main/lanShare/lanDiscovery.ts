import dgram from 'dgram'
import os from 'os'
import { EventEmitter } from 'events'
import type { DiscoveredLanShare, LanShareRecord } from '../../shared/types/lanShare'

const BROADCAST_PORT = 45678
const HEARTBEAT_INTERVAL_MS = 4000
const EXPIRE_TIMEOUT_MS = 14000

export interface LanDiscoveryOptions {
  appType: 'marknotepro' | 'marktextpro'
}

export class LanDiscovery extends EventEmitter {
  private socket: dgram.Socket | null = null
  private senderId: string = `${os.hostname()}-${Math.random().toString(36).substring(2, 9)}`
  private deviceName: string = os.hostname()
  private appType: 'marknotepro' | 'marktextpro'
  private discovered: Map<string, DiscoveredLanShare> = new Map()
  private heartbeatTimer: NodeJS.Timeout | null = null
  private isClosed: boolean = false
  private activeSharesProvider: () => LanShareRecord[]

  constructor(options: LanDiscoveryOptions, activeSharesProvider: () => LanShareRecord[]) {
    super()
    this.appType = options.appType
    this.activeSharesProvider = activeSharesProvider
  }

  public start(): void {
    if (this.socket) return

    try {
      this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })

      this.socket.on('error', (err) => {
        console.warn('[LanDiscovery] UDP socket error:', err.message)
      })

      this.socket.on('message', (msg, rinfo) => {
        this.handleMessage(msg, rinfo)
      })

      this.socket.bind(BROADCAST_PORT, () => {
        if (!this.socket) return
        try {
          this.socket.setBroadcast(true)
        } catch (e) {
          console.warn('[LanDiscovery] Failed to set broadcast flag:', e)
        }
      })

      this.heartbeatTimer = setInterval(() => {
        this.broadcastHeartbeats()
        this.purgeExpiredShares()
      }, HEARTBEAT_INTERVAL_MS)
    } catch (err) {
      console.warn('[LanDiscovery] Failed to start discovery socket:', err)
    }
  }

  public stop(): void {
    this.isClosed = true
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }

    // Broadcast offline for active shares before close
    this.broadcastOfflineAll()

    if (this.socket) {
      try {
        this.socket.close()
      } catch {}
      this.socket = null
    }
    this.discovered.clear()
  }

  public getDiscoveredShares(): DiscoveredLanShare[] {
    return Array.from(this.discovered.values()).sort((a, b) => b.lastSeen - a.lastSeen)
  }

  public broadcastShareOnline(share: LanShareRecord): void {
    const payload = {
      type: 'share_announce',
      senderId: this.senderId,
      deviceName: this.deviceName,
      app: this.appType,
      share: {
        id: share.id,
        title: share.title || '',
        port: share.port,
        hasPassword: !!share.password,
        fileCount: share.files.length
      }
    }
    this.sendBroadcast(payload)
  }

  public broadcastShareOffline(shareId: string): void {
    const payload = {
      type: 'share_offline',
      senderId: this.senderId,
      shareId
    }
    this.sendBroadcast(payload)
  }

  private broadcastOfflineAll(): void {
    const active = this.activeSharesProvider()
    for (const share of active) {
      this.broadcastShareOffline(share.id)
    }
  }

  private broadcastHeartbeats(): void {
    const active = this.activeSharesProvider().filter((s) => s.status === 'running')
    for (const share of active) {
      this.broadcastShareOnline(share)
    }
  }

  private handleMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    let data: any
    try {
      data = JSON.parse(msg.toString('utf8'))
    } catch {
      return
    }

    if (!data || typeof data !== 'object') return

    // Ignore self-broadcasts
    if (data.senderId === this.senderId) return

    const now = Date.now()

    if (data.type === 'share_announce' && data.share) {
      const share = data.share
      const host = rinfo.address
      const key = `${data.senderId}_${share.id}`
      const url = `http://${host}:${share.port}`

      const entry: DiscoveredLanShare = {
        id: share.id,
        title: share.title || '',
        senderId: data.senderId,
        deviceName: data.deviceName || host,
        app: data.app || 'marknotepro',
        host,
        port: share.port,
        url,
        hasPassword: !!share.hasPassword,
        fileCount: share.fileCount || 0,
        lastSeen: now
      }

      const isNewOrUpdated = !this.discovered.has(key)
      this.discovered.set(key, entry)

      if (isNewOrUpdated) {
        this.emit('discovered-updated', this.getDiscoveredShares())
      }
    } else if (data.type === 'share_offline') {
      const key = `${data.senderId}_${data.shareId}`
      if (this.discovered.delete(key)) {
        this.emit('discovered-updated', this.getDiscoveredShares())
      }
    }
  }

  private purgeExpiredShares(): void {
    const now = Date.now()
    let changed = false
    for (const [key, share] of this.discovered.entries()) {
      if (now - share.lastSeen > EXPIRE_TIMEOUT_MS) {
        this.discovered.delete(key)
        changed = true
      }
    }
    if (changed) {
      this.emit('discovered-updated', this.getDiscoveredShares())
    }
  }

  private sendBroadcast(data: object): void {
    if (!this.socket || this.isClosed) return

    const msg = Buffer.from(JSON.stringify(data), 'utf8')
    const bcastAddrs = this.getBroadcastAddresses()

    for (const addr of bcastAddrs) {
      this.socket.send(msg, 0, msg.length, BROADCAST_PORT, addr, (err) => {
        if (err && (err as any).code !== 'EHOSTUNREACH' && (err as any).code !== 'ENETUNREACH') {
          console.debug('[LanDiscovery] Send broadcast warning:', addr, err.message)
        }
      })
    }
  }

  private getBroadcastAddresses(): string[] {
    const list: string[] = []
    const ifaces = os.networkInterfaces()

    for (const name of Object.keys(ifaces)) {
      const entries = ifaces[name]
      if (!entries) continue
      for (const net of entries) {
        if (net.family === 'IPv4' && !net.internal && net.netmask) {
          try {
            const addrParts = net.address.split('.').map(Number)
            const maskParts = net.netmask.split('.').map(Number)
            const bcastParts = addrParts.map((p, i) => p | (~maskParts[i] & 255))
            list.push(bcastParts.join('.'))
          } catch {}
        }
      }
    }

    return list.length > 0 ? list : ['255.255.255.255']
  }
}
