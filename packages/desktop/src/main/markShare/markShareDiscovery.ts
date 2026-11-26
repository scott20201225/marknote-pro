import { execFileSync } from 'child_process'
import crypto from 'crypto'
import dgram from 'dgram'
import fs from 'fs'
import os from 'os'
import { EventEmitter } from 'events'
import type {
  MarkShareAppType,
  MarkShareDevice,
  MarkShareOsType
} from '../../shared/types/markShare'

const MARKSHARE_DISCOVERY_PORT = 45679
const HEARTBEAT_INTERVAL_MS = 4000
const PEER_EXPIRE_TIMEOUT_MS = 14000

interface MarkShareBeaconMessage {
  protocol: 'markshare-v1'
  type: 'markshare-presence' | 'markshare-offline'
  peerKey: string
  deviceId: string
  deviceName: string
  deviceAlias?: string
  hostname?: string
  osType: MarkShareOsType
  appType: MarkShareAppType
  port: number
}

export interface MarkShareDiscoveryOptions {
  getDeviceId: () => string
  appType: MarkShareAppType
  osType: MarkShareOsType
  hostname: string
  getDeviceName: () => string
  getDeviceAlias: () => string
  getTransferPort: () => number
  isBroadcastEnabled: () => boolean
}

const DEVICE_ID_REGEX = /^ms-([0-9a-f]{16})-([0-9a-f]{6})$/
const DEVICE_ID_TAG_SALT = 'markshare-device-id-v1:'
export const MARKSHARE_DEVICE_ID_EV1_PREFIX = 'Ev1:'
const DEVICE_ID_EV1_AAD = Buffer.from('markshare-ev1-device-id', 'utf8')
// Hardcoded symmetric key material for Ev1: config encryption at rest
const DEVICE_ID_EV1_KEY = crypto
  .createHash('sha256')
  .update('MarkShare::Config::DeviceId::Ev1::StaticKey::9c4f2a8d1e7b')
  .digest()

function computeDeviceIdTag(bodyHex: string): string {
  return crypto
    .createHash('sha256')
    .update(`${DEVICE_ID_TAG_SALT}${bodyHex}`)
    .digest('hex')
    .slice(0, 6)
}

export function formatMarkShareDeviceIdFromBody(rawBodyHex: string): string {
  const normalized = rawBodyHex.toLowerCase().slice(0, 16)
  const bodyHex = /^0{16}$/.test(normalized) ? '1000000000000001' : normalized
  return `ms-${bodyHex}-${computeDeviceIdTag(bodyHex)}`
}

export function formatMarkShareDeviceIdFromSeed(seed: string): string {
  const bodyHex = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 16)
  return formatMarkShareDeviceIdFromBody(bodyHex)
}

export function generateUniqueMarkShareDeviceId(): string {
  const bodyHex = crypto.randomBytes(8).toString('hex')
  return formatMarkShareDeviceIdFromBody(bodyHex)
}

export function isValidMarkShareDeviceId(candidate: unknown): candidate is string {
  if (typeof candidate !== 'string') return false
  const trimmed = candidate.trim()
  const match = DEVICE_ID_REGEX.exec(trimmed)
  if (!match) return false
  const bodyHex = match[1]
  const tagHex = match[2]
  if (!bodyHex || !tagHex || /^0{16}$/.test(bodyHex)) return false
  const expected = Buffer.from(computeDeviceIdTag(bodyHex), 'utf8')
  const actual = Buffer.from(tagHex, 'utf8')
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}

export function encryptMarkShareDeviceIdEv1(deviceId: string): string {
  if (!isValidMarkShareDeviceId(deviceId)) {
    throw new Error('Cannot encrypt invalid MarkShare device ID')
  }
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', DEVICE_ID_EV1_KEY, iv)
  cipher.setAAD(DEVICE_ID_EV1_AAD)
  const encrypted = Buffer.concat([cipher.update(deviceId, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${MARKSHARE_DEVICE_ID_EV1_PREFIX}${Buffer.concat([iv, authTag, encrypted]).toString('base64')}`
}

export function resolveMarkShareDeviceIdFromStored(stored: unknown): string | null {
  if (typeof stored !== 'string') return null
  const trimmed = stored.trim()
  if (!trimmed.startsWith(MARKSHARE_DEVICE_ID_EV1_PREFIX)) return null
  const encoded = trimmed.slice(MARKSHARE_DEVICE_ID_EV1_PREFIX.length).trim()
  if (!encoded) return null

  try {
    const raw = Buffer.from(encoded, 'base64')
    if (raw.length < 29) return null
    const iv = raw.subarray(0, 12)
    const authTag = raw.subarray(12, 28)
    const ciphertext = raw.subarray(28)
    const decipher = crypto.createDecipheriv('aes-256-gcm', DEVICE_ID_EV1_KEY, iv)
    decipher.setAAD(DEVICE_ID_EV1_AAD)
    decipher.setAuthTag(authTag)
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
    return isValidMarkShareDeviceId(plain) ? plain : null
  } catch {
    return null
  }
}

/**
 * Probe a stable OS hardware identifier (without relying on volatile NICs/MAC addresses).
 * Returns null if unavailable so the caller can generate and persist a rule-based unique ID.
 */
export function tryAcquireHardwareDeviceId(): string | null {
  try {
    if (process.platform === 'darwin') {
      const out = execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], {
        encoding: 'utf8',
        timeout: 1500
      })
      const m = out.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/)
      if (m?.[1]?.trim()) {
        return formatMarkShareDeviceIdFromSeed(`hw:darwin:${m[1].trim()}`)
      }
    } else if (process.platform === 'linux') {
      for (const p of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
        if (fs.existsSync(p)) {
          const raw = fs.readFileSync(p, 'utf8').trim()
          if (raw) {
            return formatMarkShareDeviceIdFromSeed(`hw:linux:${raw}`)
          }
        }
      }
    } else if (process.platform === 'win32') {
      const out = execFileSync(
        'reg',
        ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
        { encoding: 'utf8', timeout: 1500, windowsHide: true }
      )
      const m = out.match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/i)
      if (m?.[1]?.trim()) {
        return formatMarkShareDeviceIdFromSeed(`hw:win32:${m[1].trim()}`)
      }
    }
  } catch {
    // Hardware UUID probe failed; caller falls back to unique ID generation rule
  }
  return null
}

/**
 * Acquire hardware-derived device ID on first launch, or fall back to rule-based unique ID generation.
 */
export function createMarkShareDeviceId(
  hardwareProbe: () => string | null = tryAcquireHardwareDeviceId
): string {
  const hwId = hardwareProbe()
  if (hwId && isValidMarkShareDeviceId(hwId)) {
    return hwId
  }
  return generateUniqueMarkShareDeviceId()
}

export function makeMarkSharePeerKey(deviceId: string, appType: MarkShareAppType): string {
  return `${deviceId}:${appType}`
}

export function getLocalIPv4Addresses(): string[] {
  const interfaces = os.networkInterfaces()
  const ips: string[] = []
  for (const name of Object.keys(interfaces)) {
    const entries = interfaces[name]
    if (!entries) continue
    for (const info of entries) {
      if (info.family === 'IPv4' && !info.internal) {
        ips.push(info.address)
      }
    }
  }
  return ips.length > 0 ? ips : ['127.0.0.1']
}

function getDirectedBroadcastAddresses(): string[] {
  const interfaces = os.networkInterfaces()
  const addrs = new Set<string>(['255.255.255.255'])
  for (const name of Object.keys(interfaces)) {
    const entries = interfaces[name]
    if (!entries) continue
    for (const info of entries) {
      if (info.family !== 'IPv4' || info.internal) continue
      const ipParts = info.address.split('.').map(Number)
      const maskParts = (info.netmask || '255.255.255.0').split('.').map(Number)
      if (ipParts.length === 4 && maskParts.length === 4) {
        const bcast = ipParts
          .map((octet, idx) => ((octet | (~maskParts[idx]! & 255)) & 255))
          .join('.')
        addrs.add(bcast)
      }
    }
  }
  addrs.add('127.0.0.1')
  return Array.from(addrs)
}

export class MarkShareDiscovery extends EventEmitter {
  private socket: dgram.Socket | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null
  private peers: Map<string, MarkShareDevice> = new Map()
  private isStarted = false
  private options: MarkShareDiscoveryOptions

  constructor(options: MarkShareDiscoveryOptions) {
    super()
    this.options = options
  }

  private getSelfPeerKey(): string {
    return makeMarkSharePeerKey(this.options.getDeviceId(), this.options.appType)
  }

  public start(): void {
    if (this.isStarted) return
    this.isStarted = true

    try {
      const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true })
      this.socket = sock

      sock.on('error', (err) => {
        console.warn('[MarkShareDiscovery] UDP socket error:', err.message)
      })

      sock.on('message', (msg, rinfo) => {
        this.handleMessage(msg, rinfo)
      })

      sock.bind(MARKSHARE_DISCOVERY_PORT, () => {
        try {
          sock.setBroadcast(true)
        } catch (e) {
          console.warn('[MarkShareDiscovery] Failed to set broadcast:', e)
        }
        if (this.options.isBroadcastEnabled()) {
          this.broadcastNow()
        }
      })

      this.heartbeatTimer = setInterval(() => {
        if (this.options.isBroadcastEnabled()) {
          this.broadcastNow()
        }
        this.purgeExpiredPeers()
      }, HEARTBEAT_INTERVAL_MS)
    } catch (err) {
      console.warn('[MarkShareDiscovery] Failed to initialize UDP discovery:', err)
    }
  }

  public stop(): void {
    if (!this.isStarted) return
    this.isStarted = false

    this.broadcastOffline()

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    if (this.socket) {
      try {
        this.socket.close()
      } catch {
        // ignore
      }
      this.socket = null
    }
    this.peers.clear()
  }

  public getDevices(): MarkShareDevice[] {
    return Array.from(this.peers.values()).sort((a, b) => {
      const nameCmp = a.deviceName.localeCompare(b.deviceName)
      return nameCmp !== 0 ? nameCmp : a.appType.localeCompare(b.appType)
    })
  }

  public broadcastNow(): void {
    if (!this.socket || !this.options.isBroadcastEnabled()) return
    const port = this.options.getTransferPort()
    if (!port) return

    const deviceId = this.options.getDeviceId()
    const payload: MarkShareBeaconMessage = {
      protocol: 'markshare-v1',
      type: 'markshare-presence',
      peerKey: makeMarkSharePeerKey(deviceId, this.options.appType),
      deviceId,
      deviceName: this.options.getDeviceName(),
      deviceAlias: this.options.getDeviceAlias(),
      hostname: this.options.hostname,
      osType: this.options.osType,
      appType: this.options.appType,
      port
    }
    this.sendBeacon(payload)
  }

  public broadcastOffline(): void {
    if (!this.socket) return
    const deviceId = this.options.getDeviceId()
    const payload: MarkShareBeaconMessage = {
      protocol: 'markshare-v1',
      type: 'markshare-offline',
      peerKey: makeMarkSharePeerKey(deviceId, this.options.appType),
      deviceId,
      deviceName: this.options.getDeviceName(),
      deviceAlias: this.options.getDeviceAlias(),
      hostname: this.options.hostname,
      osType: this.options.osType,
      appType: this.options.appType,
      port: this.options.getTransferPort()
    }
    this.sendBeacon(payload)
  }

  private sendBeacon(payload: MarkShareBeaconMessage): void {
    if (!this.socket) return
    const buf = Buffer.from(JSON.stringify(payload), 'utf8')
    for (const addr of getDirectedBroadcastAddresses()) {
      try {
        this.socket.send(buf, 0, buf.length, MARKSHARE_DISCOVERY_PORT, addr)
      } catch {
        // ignore transient interface errors
      }
    }
  }

  private handleMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    try {
      const data = JSON.parse(msg.toString('utf8')) as MarkShareBeaconMessage
      if (!data || data.protocol !== 'markshare-v1') return
      if (!data.deviceId || !data.appType) return

      const peerKey = makeMarkSharePeerKey(data.deviceId, data.appType)
      // Strict self-deduplication: same machine + same app is always filtered out
      if (peerKey === this.getSelfPeerKey()) return

      if (data.type === 'markshare-offline') {
        if (this.peers.delete(peerKey)) {
          this.emit('devices-updated', this.getDevices())
        }
        return
      }

      if (data.type !== 'markshare-presence' || !data.port) return

      const localIps = getLocalIPv4Addresses()
      const isSameHost =
        data.deviceId === this.options.getDeviceId() ||
        rinfo.address === '127.0.0.1' ||
        localIps.includes(rinfo.address)

      const existing = this.peers.get(peerKey)
      const next: MarkShareDevice = {
        peerKey,
        deviceId: data.deviceId,
        deviceName: data.deviceName || data.hostname || rinfo.address,
        deviceAlias: data.deviceAlias || '',
        hostname: data.hostname || '',
        osType: data.osType || 'linux',
        appType: data.appType,
        hostIp: isSameHost ? '127.0.0.1' : rinfo.address,
        port: Number(data.port),
        isSameHost,
        lastSeen: Date.now()
      }

      const changed =
        !existing ||
        existing.hostIp !== next.hostIp ||
        existing.port !== next.port ||
        existing.deviceName !== next.deviceName ||
        existing.deviceAlias !== next.deviceAlias ||
        existing.osType !== next.osType ||
        existing.appType !== next.appType

      this.peers.set(peerKey, next)
      if (changed) {
        this.emit('devices-updated', this.getDevices())
      }
    } catch {
      // ignore malformed UDP packet
    }
  }

  private purgeExpiredPeers(): void {
    const now = Date.now()
    let changed = false
    for (const [key, peer] of this.peers.entries()) {
      if (now - peer.lastSeen > PEER_EXPIRE_TIMEOUT_MS) {
        this.peers.delete(key)
        changed = true
      }
    }
    if (changed) {
      this.emit('devices-updated', this.getDevices())
    }
  }
}
