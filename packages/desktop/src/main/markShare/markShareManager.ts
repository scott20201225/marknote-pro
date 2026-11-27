import fs from 'fs'
import fsPromises from 'fs/promises'
import http, { type IncomingMessage, type ServerResponse } from 'http'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import { EventEmitter } from 'events'
import { app } from 'electron'
import type {
  MarkShareAcceptRequest,
  MarkShareAppType,
  MarkShareConfigState,
  MarkShareConflictPreview,
  MarkShareDevice,
  MarkShareHistoryRecord,
  MarkShareManifestItem,
  MarkShareOffer,
  MarkShareOsType,
  MarkShareSessionState
} from '../../shared/types/markShare'
import { buildTransferPlan } from '../utils/transferConflictResolver'
import {
  MARKSHARE_CHUNK_BYTES,
  MARKSHARE_CONFIRM_TTL_MS,
  MARKSHARE_PROTOCOL_VERSION,
  computeAuthMac,
  decryptBinaryFrame,
  decryptJson,
  deriveSessionSecrets,
  encryptBinaryFrame,
  encryptJson,
  generateEphemeralX25519KeyPair,
  resolveSafeRelativePath,
  safeEqualHex,
  type EncryptedEnvelope,
  type EphemeralKeyPair
} from './markShareProtocol'
import {
  MarkShareDiscovery,
  createMarkShareDeviceId,
  encryptMarkShareDeviceIdEv1,
  getLocalIPv4Addresses,
  makeMarkSharePeerKey,
  resolveMarkShareDeviceIdFromStored,
  tryAcquireHardwareDeviceId
} from './markShareDiscovery'
import { t } from '../i18n'

const MAX_HISTORY_RECORDS = 200
const MAX_JSON_BODY_BYTES = 16 * 1024 * 1024
const MAX_FRAME_CIPHER_BYTES = 2 * 1024 * 1024
const HANDSHAKE_IDLE_TTL_MS = 20_000
const PROGRESS_THROTTLE_MS = 150

interface PersistedConfigFile {
  deviceId: string
  autoStart: boolean
  defaultSaveDir: string
  deviceAlias: string
  peerAliases: Record<string, string>
}

export interface MarkShareManagerOptions {
  hardwareProbe?: () => string | null
}

interface ReceiverHandshakeContext {
  handshakeId: string
  senderId: string
  senderPeerKey: string
  senderName: string
  senderOsType: MarkShareOsType
  senderAppType: MarkShareAppType
  senderHostIp: string
  sessionKey: Buffer
  sasCode: string
  idleTimer: NodeJS.Timeout | null
  consumed: boolean
}

interface ReceiverOfferSession {
  offer: MarkShareOffer
  handshakeId: string
  sessionKey: Buffer
  sessionToken: string | null
  confirmTimer: NodeJS.Timeout | null
  sseRes: ServerResponse | null
  sseKeepaliveTimer: NodeJS.Timeout | null
  targetRelPathByFileId: Map<string, string>
  skippedFileIds: Set<string>
  skipMkdir: boolean
  activePartFiles: Set<string>
  activeWriteStreams: Set<fs.WriteStream>
  receivedFileShas: Map<string, string>
  aborted: boolean
}

interface SenderOfferSession {
  offer: MarkShareOffer
  handshakeId: string
  sessionKey: Buffer
  sessionToken: string | null
  confirmTimer: NodeJS.Timeout | null
  sseReq: http.ClientRequest | null
  abortController: AbortController
  filePathById: Map<string, string>
  skippedFileIds: Set<string>
  aborted: boolean
}

interface HelloRequestPayload {
  protocolVersion: string
  senderId: string
  senderPeerKey: string
  senderName: string
  osType: MarkShareOsType
  appType: MarkShareAppType
  ephemeralPubKeyB64: string
  nonceB64: string
}

interface HelloResponsePayload {
  protocolVersion: string
  handshakeId: string
  receiverId: string
  receiverPeerKey: string
  receiverName: string
  osType: MarkShareOsType
  appType: MarkShareAppType
  ephemeralPubKeyB64: string
  nonceB64: string
}

interface OfferDecryptedPayload {
  offerId: string
  rootLabel: string
  rootType: 'file' | 'folder' | 'mixed'
  items: MarkShareManifestItem[]
  totalFiles: number
  totalBytes: number
}

function getCurrentOsType(): MarkShareOsType {
  if (process.platform === 'darwin') return 'darwin'
  if (process.platform === 'win32') return 'win32'
  return 'linux'
}

export function getDefaultMarkShareSaveDir(): string {
  try {
    return app.getPath('downloads')
  } catch {
    return path.join(os.homedir(), 'Downloads')
  }
}

async function readJsonBody<T>(req: IncomingMessage, maxBytes = MAX_JSON_BODY_BYTES): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > maxBytes) {
        reject(new Error('Payload too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve(JSON.parse(text || '{}') as T)
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

async function httpJsonRequest<TRes>(params: {
  host: string
  port: number
  path: string
  method?: 'GET' | 'POST'
  body?: unknown
  timeoutMs?: number
}): Promise<TRes> {
  return new Promise((resolve, reject) => {
    const payload = params.body !== undefined ? JSON.stringify(params.body) : undefined
    const req = http.request(
      {
        hostname: params.host,
        port: params.port,
        path: params.path,
        method: params.method || 'POST',
        headers: payload
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload)
            }
          : undefined,
        timeout: params.timeoutMs ?? 8000
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          if ((res.statusCode || 500) >= 400) {
            let msg = `HTTP ${res.statusCode}`
            try {
              const parsed = JSON.parse(text) as { error?: string }
              if (parsed.error) msg = parsed.error
            } catch {
              // ignore
            }
            reject(new Error(msg))
            return
          }
          try {
            resolve((text ? JSON.parse(text) : {}) as TRes)
          } catch (err) {
            reject(err)
          }
        })
      }
    )
    req.on('timeout', () => {
      req.destroy(new Error('Request timeout'))
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function scanPathsToManifest(inputPaths: string[]): Promise<{
  items: MarkShareManifestItem[]
  filePathById: Map<string, string>
  totalFiles: number
  totalBytes: number
  rootLabel: string
  rootType: 'file' | 'folder' | 'mixed'
}> {
  const uniquePaths = Array.from(new Set(inputPaths.map((p) => path.resolve(p))))
  const items: MarkShareManifestItem[] = []
  const filePathById = new Map<string, string>()
  const visitedRealDirs = new Set<string>()
  const usedTopNames = new Set<string>()
  let totalFiles = 0
  let totalBytes = 0
  let hasFileRoot = false
  let hasDirRoot = false

  const allocateTopName = (rawName: string): string => {
    const clean = rawName || 'item'
    if (!usedTopNames.has(clean)) {
      usedTopNames.add(clean)
      return clean
    }
    const ext = path.extname(clean)
    const stem = clean.slice(0, clean.length - ext.length)
    let idx = 1
    let candidate = `${stem} (${idx})${ext}`
    while (usedTopNames.has(candidate)) {
      idx++
      candidate = `${stem} (${idx})${ext}`
    }
    usedTopNames.add(candidate)
    return candidate
  }

  const walkDir = async (dirAbs: string, relBasePosix: string): Promise<void> => {
    let real = dirAbs
    try {
      real = await fsPromises.realpath(dirAbs)
    } catch {
      return
    }
    if (visitedRealDirs.has(real)) return
    visitedRealDirs.add(real)

    const entries = await fsPromises.readdir(dirAbs, { withFileTypes: true })
    if (entries.length === 0) {
      items.push({
        fileId: crypto.randomUUID(),
        relativePath: relBasePosix,
        name: path.posix.basename(relBasePosix),
        size: 0,
        isDirectory: true
      })
      return
    }

    for (const entry of entries) {
      const childAbs = path.join(dirAbs, entry.name)
      const childRel = `${relBasePosix}/${entry.name}`
      try {
        const st = await fsPromises.stat(childAbs)
        if (st.isDirectory()) {
          await walkDir(childAbs, childRel)
        } else if (st.isFile()) {
          const fileId = crypto.randomUUID()
          items.push({
            fileId,
            relativePath: childRel,
            name: entry.name,
            size: st.size,
            isDirectory: false
          })
          filePathById.set(fileId, childAbs)
          totalFiles++
          totalBytes += st.size
        }
      } catch {
        // skip unreadable entries
      }
    }
  }

  const rootLabels: string[] = []
  for (const absPath of uniquePaths) {
    const st = await fsPromises.stat(absPath)
    const topName = allocateTopName(path.basename(absPath))
    rootLabels.push(topName)
    if (st.isDirectory()) {
      hasDirRoot = true
      await walkDir(absPath, topName)
    } else if (st.isFile()) {
      hasFileRoot = true
      const fileId = crypto.randomUUID()
      items.push({
        fileId,
        relativePath: topName,
        name: topName,
        size: st.size,
        isDirectory: false
      })
      filePathById.set(fileId, absPath)
      totalFiles++
      totalBytes += st.size
    }
  }

  if (items.length === 0) {
    throw new Error(t('markShare.errNoTransferableItems'))
  }

  const rootType: 'file' | 'folder' | 'mixed' =
    hasFileRoot && hasDirRoot ? 'mixed' : hasDirRoot ? 'folder' : 'file'

  const rootLabel =
    rootLabels.length === 1
      ? rootLabels[0]!
      : t('markShare.multiItemsLabel', { first: rootLabels[0]!, count: rootLabels.length })

  return { items, filePathById, totalFiles, totalBytes, rootLabel, rootType }
}

export class MarkShareManager extends EventEmitter {
  private readonly appType: MarkShareAppType
  private readonly osType: MarkShareOsType = getCurrentOsType()
  private readonly hostname: string = os.hostname()
  private readonly hardwareProbe: () => string | null
  private deviceId = ''
  private peerKey = ''
  private readonly configPath: string
  private readonly historyPath: string

  private config: PersistedConfigFile
  private history: MarkShareHistoryRecord[] = []
  private enabled = false
  private transferPort = 0

  private server: http.Server | null = null
  private discovery: MarkShareDiscovery

  private handshakes = new Map<string, ReceiverHandshakeContext>()
  private incomingSessions = new Map<string, ReceiverOfferSession>()
  private outgoingSessions = new Map<string, SenderOfferSession>()
  /** Short-lived buffer so GET /events arriving milliseconds after REJECT/EXPIRED/STOP still receives the terminal SSE event */
  private recentTerminalEvents = new Map<
    string,
    { handshakeId: string; sessionKey: Buffer; eventName: string; dataLine: string; timer: NodeJS.Timeout }
  >()
  private lastProgressEmitAt = 0

  constructor(appType: MarkShareAppType = 'marknotepro', options?: MarkShareManagerOptions) {
    super()
    this.appType = appType
    this.hardwareProbe = options?.hardwareProbe ?? tryAcquireHardwareDeviceId
    const userDataDir = app.getPath('userData')
    // App-scoped filenames guarantee zero interference between MarkNotePro and MarkTextPro even on the same machine
    this.configPath = path.join(userDataDir, `mark-share-${this.appType}-config.json`)
    this.historyPath = path.join(userDataDir, `mark-share-${this.appType}-history.json`)

    this.config = {
      deviceId: '',
      autoStart: false,
      defaultSaveDir: getDefaultMarkShareSaveDir(),
      deviceAlias: '',
      peerAliases: {}
    }

    this.discovery = new MarkShareDiscovery({
      getDeviceId: () => this.deviceId,
      appType: this.appType,
      osType: this.osType,
      hostname: this.hostname,
      getDeviceName: () => this.getEffectiveDeviceName(),
      getDeviceAlias: () => this.config.deviceAlias,
      getTransferPort: () => this.transferPort,
      isBroadcastEnabled: () => this.enabled
    })

    this.discovery.on('devices-updated', () => {
      this.emit('devices-updated', this.getDevices())
      this.syncActiveSessionPeerNames()
      this.emit('history-updated', this.getHistory())
    })
  }

  public getEffectiveDeviceName(): string {
    return this.config.deviceAlias.trim() || this.hostname
  }

  public async init(): Promise<void> {
    await this.loadConfig()
    await this.loadHistory()

    // Always listen passively on discovery socket so the local device can see nearby MarkShare peers;
    // own presence beacon and TCP transfer server only turn on when enabled === true.
    this.discovery.start()

    if (this.config.autoStart) {
      await this.setEnabled(true)
    }
  }

  public async cleanup(): Promise<void> {
    for (const offerId of Array.from(this.outgoingSessions.keys())) {
      await this.cancelOutgoingOffer(offerId).catch(() => {})
    }
    for (const offerId of Array.from(this.incomingSessions.keys())) {
      await this.stopTransfer(offerId).catch(() => {})
    }
    this.discovery.stop()
    await this.stopServer()
  }

  public getConfigState(): MarkShareConfigState {
    return {
      enabled: this.enabled,
      autoStart: this.config.autoStart,
      defaultSaveDir: this.config.defaultSaveDir,
      deviceId: this.deviceId,
      peerKey: this.peerKey,
      deviceName: this.getEffectiveDeviceName(),
      deviceAlias: this.config.deviceAlias,
      hostname: this.hostname,
      osType: this.osType,
      appType: this.appType,
      port: this.transferPort,
      localIps: getLocalIPv4Addresses()
    }
  }

  public getDevices(): MarkShareDevice[] {
    return this.discovery.getDevices().map((d) => {
      const localOverride = this.config.peerAliases[d.peerKey]?.trim()
      return {
        ...d,
        deviceName: localOverride || d.deviceName,
        deviceAlias: localOverride || d.deviceAlias || ''
      }
    })
  }

  private resolvePeerDisplayName(peerKey: string, fallbackName: string): string {
    const localOverride = this.config.peerAliases[peerKey]?.trim()
    if (localOverride) return localOverride
    const online = this.discovery.getDevices().find((d) => d.peerKey === peerKey)
    if (online?.deviceName) return online.deviceName
    return fallbackName
  }

  private syncActiveSessionPeerNames(): void {
    let changed = false
    for (const session of this.outgoingSessions.values()) {
      const nextName = this.resolvePeerDisplayName(
        session.offer.peerDevice.peerKey,
        session.offer.peerDevice.hostname || session.offer.peerDevice.deviceName
      )
      if (nextName && nextName !== session.offer.peerDevice.deviceName) {
        session.offer.peerDevice = {
          ...session.offer.peerDevice,
          deviceName: nextName
        }
        changed = true
      }
    }
    for (const session of this.incomingSessions.values()) {
      const nextName = this.resolvePeerDisplayName(
        session.offer.peerDevice.peerKey,
        session.offer.peerDevice.hostname || session.offer.peerDevice.deviceName
      )
      if (nextName && nextName !== session.offer.peerDevice.deviceName) {
        session.offer.peerDevice = {
          ...session.offer.peerDevice,
          deviceName: nextName
        }
        changed = true
      }
    }
    if (changed) {
      this.emit('sessions-updated', this.getActiveOffers())
    }
  }

  public getHistory(): MarkShareHistoryRecord[] {
    return this.history.map((rec) => {
      const key = makeMarkSharePeerKey(rec.peerDeviceId, rec.peerAppType)
      return {
        ...rec,
        peerDeviceName: this.resolvePeerDisplayName(key, rec.peerDeviceName)
      }
    })
  }

  public getActiveOffers(): MarkShareOffer[] {
    const list: MarkShareOffer[] = []
    for (const s of this.outgoingSessions.values()) list.push({ ...s.offer })
    for (const s of this.incomingSessions.values()) list.push({ ...s.offer })
    return list.sort((a, b) => b.createdAt - a.createdAt)
  }

  public async setEnabled(nextEnabled: boolean): Promise<MarkShareConfigState> {
    if (nextEnabled === this.enabled) {
      return this.getConfigState()
    }

    if (nextEnabled) {
      await this.startServer()
      this.enabled = true
      this.discovery.broadcastNow()
    } else {
      this.enabled = false
      this.discovery.broadcastOffline()
      await this.abortPendingIncomingOnDisable()
      await this.stopServer()
    }

    this.emit('config-updated', this.getConfigState())
    return this.getConfigState()
  }

  public async setAutoStart(autoStart: boolean): Promise<MarkShareConfigState> {
    this.config.autoStart = Boolean(autoStart)
    await this.saveConfig()
    if (this.config.autoStart && !this.enabled) {
      await this.setEnabled(true)
    } else {
      this.emit('config-updated', this.getConfigState())
    }
    return this.getConfigState()
  }

  public async setDefaultSaveDir(dirPath: string): Promise<MarkShareConfigState> {
    const trimmed = dirPath.trim()
    if (!trimmed) throw new Error(t('markShare.errSaveDirEmpty'))
    this.config.defaultSaveDir = path.resolve(trimmed)
    await this.saveConfig()
    this.emit('config-updated', this.getConfigState())
    return this.getConfigState()
  }

  public async setDeviceAlias(alias: string): Promise<MarkShareConfigState> {
    this.config.deviceAlias = alias.trim().slice(0, 64)
    await this.saveConfig()
    if (this.enabled) {
      this.discovery.broadcastNow()
    }
    this.emit('config-updated', this.getConfigState())
    return this.getConfigState()
  }

  public async setPeerAlias(peerKey: string, alias: string): Promise<MarkShareDevice[]> {
    const clean = alias.trim().slice(0, 64)
    if (clean) {
      this.config.peerAliases[peerKey] = clean
    } else {
      delete this.config.peerAliases[peerKey]
    }
    await this.saveConfig()
    const list = this.getDevices()
    this.emit('devices-updated', list)
    this.syncActiveSessionPeerNames()
    this.emit('history-updated', this.getHistory())
    return list
  }

  public async clearHistory(): Promise<MarkShareHistoryRecord[]> {
    this.history = []
    await this.saveHistory()
    this.emit('history-updated', this.getHistory())
    return []
  }

  /**
   * Sender: initiate 4-phase X25519 encrypted handshake and send OFFER to target device.
   */
  public async sendToDevice(targetPeerKey: string, rawPaths: string[]): Promise<MarkShareOffer> {
    const peer = this.getDevices().find((d) => d.peerKey === targetPeerKey)
    if (!peer) {
      throw new Error(t('markShare.errPeerOffline'))
    }
    if (!rawPaths || rawPaths.length === 0) {
      throw new Error(t('markShare.errSelectAtLeastOne'))
    }

    const scan = await scanPathsToManifest(rawPaths)

    // Phase 1: X25519 Ephemeral Key Exchange (HELLO)
    const keyPair: EphemeralKeyPair = generateEphemeralX25519KeyPair()
    const ownNonceB64 = crypto.randomBytes(16).toString('base64')
    const helloReq: HelloRequestPayload = {
      protocolVersion: MARKSHARE_PROTOCOL_VERSION,
      senderId: this.deviceId,
      senderPeerKey: this.peerKey,
      senderName: this.getEffectiveDeviceName(),
      osType: this.osType,
      appType: this.appType,
      ephemeralPubKeyB64: keyPair.publicKeyDerB64,
      nonceB64: ownNonceB64
    }

    const helloRes = await httpJsonRequest<HelloResponsePayload>({
      host: peer.hostIp,
      port: peer.port,
      path: '/markshare/v1/hello',
      body: helloReq
    })

    const { sessionKey, sasCode } = deriveSessionSecrets({
      ownPrivateKey: keyPair.privateKey,
      peerPublicKeyDerB64: helloRes.ephemeralPubKeyB64,
      ownNonceB64,
      peerNonceB64: helloRes.nonceB64,
      handshakeId: helloRes.handshakeId,
      isInitiator: true
    })

    // Phase 2: Encrypted OFFER
    const offerId = crypto.randomUUID()
    const createdAt = Date.now()
    const offerPayload: OfferDecryptedPayload = {
      offerId,
      rootLabel: scan.rootLabel,
      rootType: scan.rootType,
      items: scan.items,
      totalFiles: scan.totalFiles,
      totalBytes: scan.totalBytes
    }
    const encOffer = encryptJson(sessionKey, offerPayload, `offer:${helloRes.handshakeId}`)

    const offerAckRaw = await httpJsonRequest<EncryptedEnvelope>({
      host: peer.hostIp,
      port: peer.port,
      path: '/markshare/v1/offer',
      body: {
        handshakeId: helloRes.handshakeId,
        envelope: encOffer
      }
    })

    const offerAck = decryptJson<{ acceptedPending: boolean; expiresAt: number }>(
      sessionKey,
      offerAckRaw,
      `offer-ack:${helloRes.handshakeId}:${offerId}`
    )

    const offer: MarkShareOffer = {
      offerId,
      direction: 'send',
      peerDevice: peer,
      sasCode,
      rootLabel: scan.rootLabel,
      rootType: scan.rootType,
      items: scan.items,
      totalFiles: scan.totalFiles,
      totalBytes: scan.totalBytes,
      state: 'pending',
      createdAt,
      expiresAt: offerAck.expiresAt || createdAt + MARKSHARE_CONFIRM_TTL_MS,
      transferredBytes: 0,
      transferredFiles: 0,
      sourcePaths: rawPaths.map((p) => path.resolve(p))
    }

    const session: SenderOfferSession = {
      offer,
      handshakeId: helloRes.handshakeId,
      sessionKey,
      sessionToken: null,
      confirmTimer: null,
      sseReq: null,
      abortController: new AbortController(),
      filePathById: scan.filePathById,
      skippedFileIds: new Set(),
      aborted: false
    }

    this.outgoingSessions.set(offerId, session)

    // Start strict 60s confirmation timer ONLY for pending phase
    const remainingMs = Math.max(1000, offer.expiresAt - Date.now())
    session.confirmTimer = setTimeout(() => {
      void this.handleSenderConfirmExpired(offerId)
    }, remainingMs)

    this.emit('sessions-updated', this.getActiveOffers())

    // Phase 3: Listen on authenticated SSE channel for ACCEPT / REJECT / EXPIRED / STOP
    this.openSenderEventStream(session)

    return { ...offer }
  }

  /**
   * Sender: cancel a pending offer before recipient accepts, or stop an active transfer.
   */
  public async cancelOutgoingOffer(offerId: string): Promise<void> {
    const session = this.outgoingSessions.get(offerId)
    if (!session) return

    if (session.offer.state === 'pending') {
      session.aborted = true
      this.clearConfirmTimer(session)
      try {
        const envelope = encryptJson(
          session.sessionKey,
          { offerId },
          `cancel:${session.handshakeId}:${offerId}`
        )
        await httpJsonRequest({
          host: session.offer.peerDevice.hostIp,
          port: session.offer.peerDevice.port,
          path: '/markshare/v1/cancel',
          body: { handshakeId: session.handshakeId, envelope },
          timeoutMs: 3000
        })
      } catch {
        // peer may already be offline
      }
      await this.finalizeSenderSession(session, 'cancelled')
      return
    }

    if (session.offer.state === 'transferring') {
      await this.stopTransfer(offerId)
    }
  }

  /**
   * Either party: stop an ongoing transfer immediately.
   */
  public async stopTransfer(offerId: string): Promise<void> {
    const outgoing = this.outgoingSessions.get(offerId)
    if (outgoing) {
      outgoing.aborted = true
      this.clearConfirmTimer(outgoing)
      outgoing.abortController.abort()
      try {
        const envelope = encryptJson(
          outgoing.sessionKey,
          { offerId, reason: 'stopped_by_sender' },
          `stop:${outgoing.handshakeId}:${offerId}`
        )
        await httpJsonRequest({
          host: outgoing.offer.peerDevice.hostIp,
          port: outgoing.offer.peerDevice.port,
          path: '/markshare/v1/stop',
          body: { handshakeId: outgoing.handshakeId, envelope },
          timeoutMs: 3000
        })
      } catch {
        // ignore network error during teardown
      }
      await this.finalizeSenderSession(outgoing, 'stopped')
      return
    }

    const incoming = this.incomingSessions.get(offerId)
    if (incoming) {
      incoming.aborted = true
      this.clearConfirmTimer(incoming)
      this.pushSseEvent(incoming, 'stop', { reason: 'stopped_by_receiver' })
      await this.cleanupIncomingPartFiles(incoming)
      const finalState: MarkShareHistoryRecord['state'] =
        incoming.offer.state === 'pending' ? 'rejected' : 'stopped'
      await this.finalizeIncomingSession(incoming, finalState)
    }
  }

  /**
   * Receiver: preview filename collisions and planned folder layout before accepting.
   */
  public previewIncomingConflicts(
    offerId: string,
    saveDir?: string,
    workspaceRoot?: string,
    pathMode: 'preserve' | 'flatten' = 'preserve'
  ): MarkShareConflictPreview {
    const session = this.incomingSessions.get(offerId)
    const chosenDir = saveDir?.trim()
      ? path.resolve(saveDir.trim())
      : this.config.defaultSaveDir
    if (!session) {
      return {
        targetDir: chosenDir,
        totalFiles: 0,
        conflictCount: 0,
        conflictSamples: []
      }
    }

    const plan = buildTransferPlan({
      receiverAppType: this.appType,
      senderAppType: session.offer.peerDevice.appType,
      chosenDir,
      workspaceRoot,
      pathMode,
      items: session.offer.items.map((item) => ({
        id: item.fileId,
        relativePath: item.relativePath,
        name: item.name,
        isDirectory: item.isDirectory
      })),
      conflictStrategy: 'rename'
    })

    return {
      targetDir: chosenDir,
      totalFiles: plan.totalFiles,
      conflictCount: plan.conflictCount,
      conflictSamples: plan.conflictSamples
    }
  }

  /**
   * Receiver: accept an incoming offer within 60s, clear confirmation limit, and prepare disk target.
   */
  public async acceptIncomingOffer(request: MarkShareAcceptRequest): Promise<MarkShareOffer> {
    const session = this.incomingSessions.get(request.offerId)
    if (!session) {
      throw new Error(t('markShare.errOfferExpiredOrMissing'))
    }
    if (session.offer.state !== 'pending') {
      throw new Error(t('markShare.errOfferAlreadyHandled'))
    }

    const chosenDir = request.saveDir?.trim()
      ? path.resolve(request.saveDir.trim())
      : this.config.defaultSaveDir

    await fsPromises.mkdir(chosenDir, { recursive: true })

    if (request.setAsDefaultSaveDir) {
      await this.setDefaultSaveDir(chosenDir)
    }

    // Clear 60s confirmation limit — once accepted, transfer has NO overall time cap!
    this.clearConfirmTimer(session)

    const plan = buildTransferPlan({
      receiverAppType: this.appType,
      senderAppType: session.offer.peerDevice.appType,
      chosenDir,
      workspaceRoot: request.workspaceRoot,
      pathMode: request.pathMode || 'preserve',
      items: session.offer.items.map((item) => ({
        id: item.fileId,
        relativePath: item.relativePath,
        name: item.name,
        isDirectory: item.isDirectory
      })),
      conflictStrategy: request.conflictStrategy || 'rename'
    })

    session.targetRelPathByFileId.clear()
    session.skippedFileIds.clear()
    session.skipMkdir = plan.skipMkdir
    for (const [fileId, decision] of plan.decisions.entries()) {
      if (decision.action === 'skip') {
        session.skippedFileIds.add(fileId)
      } else {
        session.targetRelPathByFileId.set(fileId, decision.targetRelPosix)
      }
    }

    const token = crypto.randomBytes(32).toString('hex')
    session.sessionToken = token
    session.offer.saveDir = chosenDir
    session.offer.state = 'transferring'
    session.offer.expiresAt = 0

    const activeDecisions = Array.from(plan.decisions.values()).filter((d) => d.action !== 'skip')
    const topDirs = new Set(
      activeDecisions
        .filter((d) => d.targetRelPosix.includes('/'))
        .map((d) => d.targetRelPosix.split('/')[0]!)
    )
    const hasTopLevelFlatFiles = activeDecisions.some((d) => !d.targetRelPosix.includes('/'))

    if (session.offer.rootType === 'file' && plan.singleFileAbsPath) {
      session.offer.savedRootPath = plan.singleFileAbsPath
    } else if (!hasTopLevelFlatFiles && topDirs.size === 1) {
      session.offer.savedRootPath = path.join(chosenDir, Array.from(topDirs)[0]!)
    } else {
      session.offer.savedRootPath = chosenDir
    }

    this.pushSseEvent(session, 'accept', {
      sessionToken: token,
      saveDir: chosenDir,
      skippedFileIds: Array.from(session.skippedFileIds),
      skipMkdir: session.skipMkdir
    })
    this.emit('sessions-updated', this.getActiveOffers())

    return { ...session.offer }
  }

  /**
   * Receiver: reject an incoming pending offer.
   */
  public async rejectIncomingOffer(offerId: string): Promise<void> {
    const session = this.incomingSessions.get(offerId)
    if (!session || session.offer.state !== 'pending') return

    session.aborted = true
    this.clearConfirmTimer(session)
    this.pushSseEvent(session, 'reject', { reason: 'rejected_by_user' })
    await this.finalizeIncomingSession(session, 'rejected')
  }

  // ---------------------------------------------------------------------------
  // Sender Streaming & Event Loop
  // ---------------------------------------------------------------------------

  private openSenderEventStream(session: SenderOfferSession): void {
    const peer = session.offer.peerDevice
    const mac = computeAuthMac(
      session.sessionKey,
      `events:${session.handshakeId}:${session.offer.offerId}`
    )
    const query = new URLSearchParams({
      handshakeId: session.handshakeId,
      offerId: session.offer.offerId,
      mac
    }).toString()

    const req = http.request(
      {
        hostname: peer.hostIp,
        port: peer.port,
        path: `/markshare/v1/events?${query}`,
        method: 'GET'
      },
      (res) => {
        res.setEncoding('utf8')
        let buffer = ''
        res.on('data', (chunk: string) => {
          buffer += chunk
          let idx: number
          while ((idx = buffer.indexOf('\n\n')) !== -1) {
            const rawBlock = buffer.slice(0, idx)
            buffer = buffer.slice(idx + 2)
            this.handleSenderSseBlock(session, rawBlock)
          }
        })
        res.on('end', () => {
          if (!session.aborted && session.offer.state === 'pending') {
            void this.finalizeSenderSession(session, 'failed', t('markShare.errPeerDisconnected'))
          }
        })
      }
    )

    req.setTimeout(0)
    req.on('error', (err) => {
      if (!session.aborted && session.offer.state === 'pending') {
        void this.finalizeSenderSession(session, 'failed', err.message)
      }
    })
    req.end()
    session.sseReq = req
  }

  private handleSenderSseBlock(session: SenderOfferSession, rawBlock: string): void {
    const lines = rawBlock.split('\n')
    let eventName = 'message'
    let dataStr = ''
    for (const line of lines) {
      if (line.startsWith(':')) continue
      if (line.startsWith('event:')) eventName = line.slice(6).trim()
      if (line.startsWith('data:')) dataStr += line.slice(5).trim()
    }
    if (!dataStr) return

    try {
      const envelope = JSON.parse(dataStr) as EncryptedEnvelope
      const payload = decryptJson<Record<string, unknown>>(
        session.sessionKey,
        envelope,
        `sse:${session.handshakeId}:${session.offer.offerId}:${eventName}`
      )

      if (eventName === 'accept') {
        if (session.offer.state !== 'pending' || session.aborted) return
        // Accepted! Clear 60s confirmation timeout immediately -> unlimited transfer time
        this.clearConfirmTimer(session)
        session.sessionToken = String(payload.sessionToken || '')
        session.skippedFileIds = new Set(
          Array.isArray(payload.skippedFileIds)
            ? payload.skippedFileIds.map((id) => String(id))
            : []
        )
        session.offer.state = 'transferring'
        session.offer.expiresAt = 0
        this.emit('sessions-updated', this.getActiveOffers())
        void this.streamAllFilesToPeer(session, Boolean(payload.skipMkdir))
      } else if (eventName === 'reject') {
        if (session.aborted) return
        session.aborted = true
        this.clearConfirmTimer(session)
        void this.finalizeSenderSession(session, 'rejected')
      } else if (eventName === 'expired') {
        if (session.aborted) return
        session.aborted = true
        this.clearConfirmTimer(session)
        void this.finalizeSenderSession(session, 'expired')
      } else if (eventName === 'stop') {
        if (session.aborted) return
        session.aborted = true
        this.clearConfirmTimer(session)
        session.abortController.abort()
        void this.finalizeSenderSession(session, 'stopped')
      }
    } catch (err) {
      console.warn('[MarkShare] Failed to parse SSE block:', err)
    }
  }

  private async streamAllFilesToPeer(session: SenderOfferSession, skipMkdir = false): Promise<void> {
    try {
      const emptyDirs = skipMkdir ? [] : session.offer.items.filter((i) => i.isDirectory)
      if (emptyDirs.length > 0 && !session.aborted) {
        const dirEnv = encryptJson(
          session.sessionKey,
          {
            offerId: session.offer.offerId,
            dirs: emptyDirs.map((d) => d.relativePath)
          },
          `mkdir:${session.handshakeId}:${session.offer.offerId}`
        )
        await httpJsonRequest({
          host: session.offer.peerDevice.hostIp,
          port: session.offer.peerDevice.port,
          path: '/markshare/v1/mkdir',
          body: {
            handshakeId: session.handshakeId,
            sessionToken: session.sessionToken,
            envelope: dirEnv
          }
        })
      }

      for (const item of session.offer.items) {
        if (item.isDirectory) continue
        if (session.aborted) return

        if (session.skippedFileIds.has(item.fileId)) {
          session.offer.transferredFiles++
          session.offer.transferredBytes += item.size
          this.emitThrottledProgress(true)
          continue
        }

        const absPath = session.filePathById.get(item.fileId)
        if (!absPath) {
          throw new Error(t('markShare.errLocalFileNotFound', { path: item.relativePath }))
        }

        session.offer.currentFileName = item.name
        this.emitThrottledProgress()

        const actualSha = await this.streamSingleFile(session, item, absPath)
        if (session.aborted) return

        const commitEnv = encryptJson(
          session.sessionKey,
          { offerId: session.offer.offerId, fileId: item.fileId, sha256: actualSha },
          `file-done:${session.handshakeId}:${item.fileId}`
        )
        await httpJsonRequest({
          host: session.offer.peerDevice.hostIp,
          port: session.offer.peerDevice.port,
          path: '/markshare/v1/file-done',
          body: {
            handshakeId: session.handshakeId,
            sessionToken: session.sessionToken,
            envelope: commitEnv
          }
        })

        session.offer.transferredFiles++
        this.emitThrottledProgress(true)
      }

      if (session.aborted) return

      const completeEnv = encryptJson(
        session.sessionKey,
        { offerId: session.offer.offerId },
        `complete:${session.handshakeId}:${session.offer.offerId}`
      )
      await httpJsonRequest({
        host: session.offer.peerDevice.hostIp,
        port: session.offer.peerDevice.port,
        path: '/markshare/v1/complete',
        body: {
          handshakeId: session.handshakeId,
          sessionToken: session.sessionToken,
          envelope: completeEnv
        }
      })

      await this.finalizeSenderSession(session, 'completed')
    } catch (err) {
      if (session.aborted) return
      const message = err instanceof Error ? err.message : String(err)
      await this.finalizeSenderSession(session, 'failed', message)
    }
  }

  private async streamSingleFile(
    session: SenderOfferSession,
    item: MarkShareManifestItem,
    absPath: string
  ): Promise<string> {
    const peer = session.offer.peerDevice
    const query = new URLSearchParams({
      handshakeId: session.handshakeId,
      offerId: session.offer.offerId,
      fileId: item.fileId
    }).toString()

    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256')
      const rs = fs.createReadStream(absPath, { highWaterMark: MARKSHARE_CHUNK_BYTES })
      let settled = false

      const finishErr = (err: Error) => {
        if (settled) return
        settled = true
        rs.destroy()
        reject(err)
      }

      const req = http.request(
        {
          hostname: peer.hostIp,
          port: peer.port,
          path: `/markshare/v1/file?${query}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'x-markshare-token': session.sessionToken || ''
          }
        },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (c: Buffer) => chunks.push(c))
          res.on('end', () => {
            if (settled) return
            if ((res.statusCode || 500) >= 400) {
              settled = true
              reject(new Error(`Upload failed (${res.statusCode}): ${Buffer.concat(chunks).toString('utf8')}`))
              return
            }
            settled = true
            resolve(hash.digest('hex'))
          })
        }
      )

      // No overall transfer timeout once accepted!
      req.setTimeout(0)

      const onAbort = () => {
        req.destroy(new Error('Transfer stopped'))
        finishErr(new Error('Transfer stopped'))
      }
      session.abortController.signal.addEventListener('abort', onAbort, { once: true })

      req.on('error', (err) => {
        session.abortController.signal.removeEventListener('abort', onAbort)
        finishErr(err)
      })

      rs.on('error', (err) => {
        req.destroy(err)
        finishErr(err)
      })

      void (async () => {
        let chunkIndex = 0
        try {
          for await (const rawChunk of rs) {
            if (session.aborted || session.abortController.signal.aborted) {
              req.destroy(new Error('Transfer stopped'))
              return
            }
            const buf = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk)
            hash.update(buf)
            const aad = `${session.offer.offerId}:${item.fileId}:${chunkIndex}`
            chunkIndex++
            const frame = encryptBinaryFrame(session.sessionKey, buf, aad)
            const canContinue = req.write(frame)
            session.offer.transferredBytes += buf.length
            this.emitThrottledProgress()
            if (!canContinue) {
              await new Promise<void>((resDrain) => req.once('drain', resDrain))
            }
          }
          req.end()
        } catch (err) {
          finishErr(err instanceof Error ? err : new Error(String(err)))
        }
      })()
    })
  }

  private async handleSenderConfirmExpired(offerId: string): Promise<void> {
    const session = this.outgoingSessions.get(offerId)
    if (!session || session.offer.state !== 'pending' || session.aborted) return
    session.aborted = true
    session.abortController.abort()
    await this.finalizeSenderSession(session, 'expired')
  }

  private async finalizeSenderSession(
    session: SenderOfferSession,
    state: MarkShareHistoryRecord['state'],
    errorMessage?: string
  ): Promise<void> {
    if (!this.outgoingSessions.has(session.offer.offerId)) return
    this.outgoingSessions.delete(session.offer.offerId)
    this.clearConfirmTimer(session)
    if (session.sseReq) {
      try {
        session.sseReq.destroy()
      } catch {
        // ignore
      }
      session.sseReq = null
    }
    session.offer.state = state
    session.offer.errorMessage = errorMessage
    session.sessionKey.fill(0)
    session.filePathById.clear()

    await this.appendHistory({
      id: session.offer.offerId,
      direction: 'send',
      peerDeviceId: session.offer.peerDevice.deviceId,
      peerDeviceName: session.offer.peerDevice.deviceName,
      peerOsType: session.offer.peerDevice.osType,
      peerAppType: session.offer.peerDevice.appType,
      peerHostIp: session.offer.peerDevice.hostIp,
      rootLabel: session.offer.rootLabel,
      rootType: session.offer.rootType,
      totalFiles: session.offer.totalFiles,
      totalBytes: session.offer.totalBytes,
      state,
      createdAt: session.offer.createdAt,
      finishedAt: Date.now(),
      sourcePaths: session.offer.sourcePaths,
      errorMessage
    })

    this.emit('session-ended', { ...session.offer })
    this.emit('sessions-updated', this.getActiveOffers())
  }

  // ---------------------------------------------------------------------------
  // Receiver HTTP/SSE Server & Handlers
  // ---------------------------------------------------------------------------

  private async startServer(): Promise<void> {
    if (this.server) return

    const preferredPort = this.appType === 'marktextpro' ? 9628 : 9528
    const srv = http.createServer((req, res) => {
      void this.routeHttpRequest(req, res)
    })

    await new Promise<void>((resolve, reject) => {
      const onListening = () => {
        const addr = srv.address()
        if (addr && typeof addr === 'object') {
          this.transferPort = addr.port
        }
        resolve()
      }
      srv.once('error', () => {
        srv.listen(0, '0.0.0.0', onListening)
      })
      srv.listen(preferredPort, '0.0.0.0', onListening)
      setTimeout(() => {
        if (!srv.listening) reject(new Error(t('markShare.errServerStartFailed')))
      }, 5000)
    })

    this.server = srv
  }

  private async stopServer(): Promise<void> {
    this.transferPort = 0
    for (const hs of this.handshakes.values()) {
      if (hs.idleTimer) clearTimeout(hs.idleTimer)
      hs.sessionKey.fill(0)
    }
    this.handshakes.clear()
    for (const ev of this.recentTerminalEvents.values()) {
      clearTimeout(ev.timer)
      ev.sessionKey.fill(0)
    }
    this.recentTerminalEvents.clear()

    if (!this.server) return
    const srv = this.server
    this.server = null
    await new Promise<void>((resolve) => {
      srv.close(() => resolve())
      setTimeout(resolve, 1000)
    })
  }

  private async routeHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1')
    const pathname = reqUrl.pathname

    try {
      if (!this.enabled) {
        this.sendJson(res, 403, { error: 'MarkShare is currently disabled on target device' })
        return
      }

      if (req.method === 'POST' && pathname === '/markshare/v1/hello') {
        await this.handleHello(req, res)
        return
      }
      if (req.method === 'POST' && pathname === '/markshare/v1/offer') {
        await this.handleOffer(req, res)
        return
      }
      if (req.method === 'GET' && pathname === '/markshare/v1/events') {
        this.handleEvents(req, res, reqUrl)
        return
      }
      if (req.method === 'POST' && pathname === '/markshare/v1/cancel') {
        await this.handleCancel(req, res)
        return
      }
      if (req.method === 'POST' && pathname === '/markshare/v1/stop') {
        await this.handleStop(req, res)
        return
      }
      if (req.method === 'POST' && pathname === '/markshare/v1/mkdir') {
        await this.handleMkdir(req, res)
        return
      }
      if (req.method === 'POST' && pathname === '/markshare/v1/file') {
        await this.handleFileStream(req, res, reqUrl)
        return
      }
      if (req.method === 'POST' && pathname === '/markshare/v1/file-done') {
        await this.handleFileDone(req, res)
        return
      }
      if (req.method === 'POST' && pathname === '/markshare/v1/complete') {
        await this.handleComplete(req, res)
        return
      }

      this.sendJson(res, 404, { error: 'Not found' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Internal server error'
      if (!res.headersSent) {
        this.sendJson(res, 400, { error: msg })
      } else {
        res.end()
      }
    }
  }

  private async handleHello(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody<HelloRequestPayload>(req)
    if (body.protocolVersion !== MARKSHARE_PROTOCOL_VERSION || !body.ephemeralPubKeyB64 || !body.nonceB64) {
      this.sendJson(res, 400, { error: 'Incompatible MarkShare protocol version' })
      return
    }

    const handshakeId = crypto.randomUUID()
    const ownKp = generateEphemeralX25519KeyPair()
    const ownNonceB64 = crypto.randomBytes(16).toString('base64')

    const { sessionKey, sasCode } = deriveSessionSecrets({
      ownPrivateKey: ownKp.privateKey,
      peerPublicKeyDerB64: body.ephemeralPubKeyB64,
      ownNonceB64,
      peerNonceB64: body.nonceB64,
      handshakeId,
      isInitiator: false
    })

    const remoteAddr = (req.socket.remoteAddress || '').replace(/^::ffff:/, '') || '127.0.0.1'
    const senderPeerKey =
      body.senderPeerKey || makeMarkSharePeerKey(body.senderId, body.appType || 'marknotepro')
    const localOverrideName = this.config.peerAliases[senderPeerKey]?.trim()
    const ctx: ReceiverHandshakeContext = {
      handshakeId,
      senderId: body.senderId,
      senderPeerKey,
      senderName: localOverrideName || body.senderName || remoteAddr,
      senderOsType: body.osType || 'linux',
      senderAppType: body.appType || 'marknotepro',
      senderHostIp: remoteAddr,
      sessionKey,
      sasCode,
      idleTimer: setTimeout(() => {
        const existing = this.handshakes.get(handshakeId)
        if (existing && !existing.consumed) {
          this.handshakes.delete(handshakeId)
          existing.sessionKey.fill(0)
        }
      }, HANDSHAKE_IDLE_TTL_MS),
      consumed: false
    }

    this.handshakes.set(handshakeId, ctx)

    const reply: HelloResponsePayload = {
      protocolVersion: MARKSHARE_PROTOCOL_VERSION,
      handshakeId,
      receiverId: this.deviceId,
      receiverPeerKey: this.peerKey,
      receiverName: this.getEffectiveDeviceName(),
      osType: this.osType,
      appType: this.appType,
      ephemeralPubKeyB64: ownKp.publicKeyDerB64,
      nonceB64: ownNonceB64
    }
    this.sendJson(res, 200, reply)
  }

  private async handleOffer(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody<{ handshakeId: string; envelope: EncryptedEnvelope }>(req)
    const hs = this.handshakes.get(body.handshakeId)
    if (!hs || hs.consumed) {
      this.sendJson(res, 403, { error: 'Invalid or expired handshakeId' })
      return
    }
    hs.consumed = true
    if (hs.idleTimer) {
      clearTimeout(hs.idleTimer)
      hs.idleTimer = null
    }
    this.handshakes.delete(body.handshakeId)

    const payload = decryptJson<OfferDecryptedPayload>(
      hs.sessionKey,
      body.envelope,
      `offer:${hs.handshakeId}`
    )

    // Strictly validate every path before displaying offer to user
    const checkBase = this.config.defaultSaveDir
    for (const item of payload.items) {
      resolveSafeRelativePath(checkBase, item.relativePath)
    }

    const createdAt = Date.now()
    const expiresAt = createdAt + MARKSHARE_CONFIRM_TTL_MS

    const offer: MarkShareOffer = {
      offerId: payload.offerId,
      direction: 'receive',
      peerDevice: {
        peerKey: hs.senderPeerKey,
        deviceId: hs.senderId,
        deviceName: hs.senderName,
        osType: hs.senderOsType,
        appType: hs.senderAppType,
        hostIp: hs.senderHostIp,
        port: 0,
        lastSeen: createdAt
      },
      sasCode: hs.sasCode,
      rootLabel: payload.rootLabel,
      rootType: payload.rootType,
      items: payload.items,
      totalFiles: payload.totalFiles,
      totalBytes: payload.totalBytes,
      state: 'pending',
      createdAt,
      expiresAt,
      transferredBytes: 0,
      transferredFiles: 0,
      saveDir: this.config.defaultSaveDir
    }

    const session: ReceiverOfferSession = {
      offer,
      handshakeId: hs.handshakeId,
      sessionKey: hs.sessionKey,
      sessionToken: null,
      confirmTimer: null,
      sseRes: null,
      sseKeepaliveTimer: null,
      targetRelPathByFileId: new Map(),
      skippedFileIds: new Set(),
      skipMkdir: false,
      activePartFiles: new Set(),
      activeWriteStreams: new Set(),
      receivedFileShas: new Map(),
      aborted: false
    }

    session.confirmTimer = setTimeout(() => {
      void this.handleReceiverConfirmExpired(offer.offerId)
    }, MARKSHARE_CONFIRM_TTL_MS)

    this.incomingSessions.set(offer.offerId, session)
    this.emit('incoming-offer', { ...offer })
    this.emit('sessions-updated', this.getActiveOffers())

    const ackEnv = encryptJson(
      hs.sessionKey,
      { acceptedPending: true, expiresAt },
      `offer-ack:${hs.handshakeId}:${offer.offerId}`
    )
    this.sendJson(res, 200, ackEnv)
  }

  private handleEvents(req: IncomingMessage, res: ServerResponse, reqUrl: URL): void {
    const handshakeId = reqUrl.searchParams.get('handshakeId') || ''
    const offerId = reqUrl.searchParams.get('offerId') || ''
    const mac = reqUrl.searchParams.get('mac') || ''

    const cached = this.recentTerminalEvents.get(offerId)
    const session = this.incomingSessions.get(offerId)
    const activeHandshakeId = session?.handshakeId || cached?.handshakeId
    const activeKey = session?.sessionKey || cached?.sessionKey

    if (!activeKey || activeHandshakeId !== handshakeId) {
      this.sendJson(res, 404, { error: 'Offer not found' })
      return
    }
    const expectedMac = computeAuthMac(activeKey, `events:${handshakeId}:${offerId}`)
    if (!safeEqualHex(mac, expectedMac)) {
      this.sendJson(res, 403, { error: 'Unauthorized SSE mac' })
      return
    }

    req.setTimeout(0)
    res.setTimeout(0)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    })
    res.write(':connected\n\n')

    if (cached && !session) {
      res.write(`event: ${cached.eventName}\ndata: ${cached.dataLine}\n\n`)
      res.end()
      return
    }
    if (!session) {
      res.end()
      return
    }

    session.sseRes = res
    session.sseKeepaliveTimer = setInterval(() => {
      if (session.sseRes && !session.sseRes.writableEnded) {
        session.sseRes.write(':keepalive\n\n')
      }
    }, 15_000)

    req.on('close', () => {
      if (session.sseKeepaliveTimer) {
        clearInterval(session.sseKeepaliveTimer)
        session.sseKeepaliveTimer = null
      }
      if (session.sseRes === res) {
        session.sseRes = null
      }
    })
  }

  private async handleCancel(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody<{ handshakeId: string; envelope: EncryptedEnvelope }>(req)
    const session = Array.from(this.incomingSessions.values()).find(
      (s) => s.handshakeId === body.handshakeId
    )
    if (!session) {
      this.sendJson(res, 404, { error: 'Session not found' })
      return
    }
    const payload = decryptJson<{ offerId: string }>(
      session.sessionKey,
      body.envelope,
      `cancel:${session.handshakeId}:${session.offer.offerId}`
    )
    if (payload.offerId !== session.offer.offerId) {
      this.sendJson(res, 403, { error: 'Mismatched offerId' })
      return
    }
    if (session.offer.state === 'pending') {
      session.aborted = true
      this.clearConfirmTimer(session)
      await this.finalizeIncomingSession(session, 'cancelled')
    }
    this.sendJson(res, 200, { ok: true })
  }

  private async handleStop(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody<{ handshakeId: string; envelope: EncryptedEnvelope }>(req)
    const session = Array.from(this.incomingSessions.values()).find(
      (s) => s.handshakeId === body.handshakeId
    )
    if (!session) {
      this.sendJson(res, 404, { error: 'Session not found' })
      return
    }
    decryptJson(
      session.sessionKey,
      body.envelope,
      `stop:${session.handshakeId}:${session.offer.offerId}`
    )
    session.aborted = true
    this.clearConfirmTimer(session)
    await this.cleanupIncomingPartFiles(session)
    await this.finalizeIncomingSession(session, 'stopped')
    this.sendJson(res, 200, { ok: true })
  }

  private async handleMkdir(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody<{
      handshakeId: string
      sessionToken: string
      envelope: EncryptedEnvelope
    }>(req)
    const session = this.validateReceiverTransferAuth(body.handshakeId, body.sessionToken)
    const payload = decryptJson<{ offerId: string; dirs: string[] }>(
      session.sessionKey,
      body.envelope,
      `mkdir:${session.handshakeId}:${session.offer.offerId}`
    )
    if (session.skipMkdir) {
      this.sendJson(res, 200, { ok: true })
      return
    }
    const saveDir = session.offer.saveDir!
    for (const rel of payload.dirs) {
      const dest = resolveSafeRelativePath(saveDir, rel)
      await fsPromises.mkdir(dest, { recursive: true })
    }
    this.sendJson(res, 200, { ok: true })
  }

  private async handleFileStream(
    req: IncomingMessage,
    res: ServerResponse,
    reqUrl: URL
  ): Promise<void> {
    const handshakeId = reqUrl.searchParams.get('handshakeId') || ''
    const offerId = reqUrl.searchParams.get('offerId') || ''
    const fileId = reqUrl.searchParams.get('fileId') || ''
    const token = String(req.headers['x-markshare-token'] || '')

    const session = this.validateReceiverTransferAuth(handshakeId, token, offerId)
    const item = session.offer.items.find((i) => i.fileId === fileId && !i.isDirectory)
    if (!item) {
      this.sendJson(res, 404, { error: 'File item not found in manifest' })
      return
    }

    req.setTimeout(0)

    if (session.skippedFileIds.has(fileId)) {
      for await (const _chunk of req) {
        if (session.aborted) break
      }
      session.offer.transferredBytes += item.size
      session.receivedFileShas.set(fileId, 'SKIPPED:::SKIPPED:::SKIPPED')
      this.emitThrottledProgress()
      this.sendJson(res, 200, { ok: true, skipped: true })
      return
    }

    const mappedRel = session.targetRelPathByFileId.get(fileId) || item.relativePath
    const finalPath = resolveSafeRelativePath(session.offer.saveDir!, mappedRel)
    await fsPromises.mkdir(path.dirname(finalPath), { recursive: true })

    const partPath = `${finalPath}.markshare.${crypto.randomBytes(4).toString('hex')}.part`
    session.activePartFiles.add(partPath)

    const ws = fs.createWriteStream(partPath)
    session.activeWriteStreams.add(ws)

    const hash = crypto.createHash('sha256')
    let pendingBuf = Buffer.alloc(0)
    let chunkIndex = 0
    let writtenBytes = 0

    try {
      session.offer.currentFileName = item.name
      this.emitThrottledProgress()

      for await (const raw of req) {
        if (session.aborted || session.offer.state !== 'transferring') {
          throw new Error(t('markShare.errTransferStopped'))
        }
        const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
        pendingBuf = pendingBuf.length > 0 ? Buffer.concat([pendingBuf, chunk]) : chunk

        while (pendingBuf.length >= 4) {
          const encLen = pendingBuf.readUInt32BE(0)
          if (encLen > MAX_FRAME_CIPHER_BYTES) {
            throw new Error('Encrypted frame exceeds safety limit')
          }
          const totalFrameLen = 4 + 12 + 16 + encLen
          if (pendingBuf.length < totalFrameLen) break

          const iv = pendingBuf.subarray(4, 16)
          const tag = pendingBuf.subarray(16, 32)
          const ciphertext = pendingBuf.subarray(32, totalFrameLen)
          pendingBuf = pendingBuf.subarray(totalFrameLen)

          const aad = `${offerId}:${fileId}:${chunkIndex}`
          chunkIndex++
          const plain = decryptBinaryFrame(session.sessionKey, iv, tag, ciphertext, aad)
          hash.update(plain)
          writtenBytes += plain.length
          session.offer.transferredBytes += plain.length
          this.emitThrottledProgress()

          if (!ws.write(plain)) {
            await new Promise<void>((resolveDrain, rejectDrain) => {
              ws.once('drain', resolveDrain)
              ws.once('error', rejectDrain)
            })
          }
        }
      }

      if (pendingBuf.length !== 0) {
        throw new Error('Truncated encrypted frame at stream end')
      }
      if (writtenBytes !== item.size) {
        throw new Error(
          t('markShare.errSizeMismatch', {
            path: item.relativePath,
            actual: writtenBytes,
            expected: item.size
          })
        )
      }

      await new Promise<void>((resolveEnd, rejectEnd) => {
        ws.once('error', rejectEnd)
        ws.end(() => resolveEnd())
      })
      session.activeWriteStreams.delete(ws)
      session.receivedFileShas.set(fileId, `${partPath}:::${finalPath}:::${hash.digest('hex')}`)

      this.sendJson(res, 200, { ok: true })
    } catch (err) {
      session.activeWriteStreams.delete(ws)
      ws.destroy()
      session.activePartFiles.delete(partPath)
      await fsPromises.rm(partPath, { force: true }).catch(() => {})
      throw err
    }
  }

  private async handleFileDone(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody<{
      handshakeId: string
      sessionToken: string
      envelope: EncryptedEnvelope
    }>(req)
    const session = this.validateReceiverTransferAuth(body.handshakeId, body.sessionToken)
    let matched: { partPath: string; finalPath: string; sha: string; fileId: string } | null = null
    for (const [fileId, meta] of session.receivedFileShas.entries()) {
      let shaMismatch = false
      try {
        const parsed = decryptJson<{ offerId: string; fileId: string; sha256: string }>(
          session.sessionKey,
          body.envelope,
          `file-done:${session.handshakeId}:${fileId}`
        )
        const [partPath, finalPath, actualSha] = meta.split(':::')
        if (partPath === 'SKIPPED') {
          matched = { partPath: 'SKIPPED', finalPath: 'SKIPPED', sha: 'SKIPPED', fileId }
          break
        }
        if (parsed.sha256 !== actualSha) {
          shaMismatch = true
          throw new Error(t('markShare.errShaMismatch', { id: fileId }))
        }
        matched = { partPath: partPath!, finalPath: finalPath!, sha: actualSha!, fileId }
        break
      } catch (err) {
        if (shaMismatch) {
          throw err
        }
      }
    }

    if (!matched) {
      this.sendJson(res, 400, { error: 'Unmatched or invalid file-done commit' })
      return
    }

    if (matched.partPath !== 'SKIPPED') {
      await fsPromises.rename(matched.partPath, matched.finalPath)
      session.activePartFiles.delete(matched.partPath)
      if (!session.offer.savedPaths) session.offer.savedPaths = []
      session.offer.savedPaths.push(matched.finalPath)
    }
    session.receivedFileShas.delete(matched.fileId)
    session.offer.transferredFiles++
    this.emitThrottledProgress(true)

    this.sendJson(res, 200, { ok: true })
  }

  private async handleComplete(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody<{
      handshakeId: string
      sessionToken: string
      envelope: EncryptedEnvelope
    }>(req)
    const session = this.validateReceiverTransferAuth(body.handshakeId, body.sessionToken)
    decryptJson(
      session.sessionKey,
      body.envelope,
      `complete:${session.handshakeId}:${session.offer.offerId}`
    )

    const ackEnv = encryptJson(
      session.sessionKey,
      { ok: true },
      `complete-ack:${session.handshakeId}:${session.offer.offerId}`
    )
    this.sendJson(res, 200, ackEnv)
    await this.finalizeIncomingSession(session, 'completed')
  }

  private validateReceiverTransferAuth(
    handshakeId: string,
    token: string,
    offerId?: string
  ): ReceiverOfferSession {
    const session = offerId
      ? this.incomingSessions.get(offerId)
      : Array.from(this.incomingSessions.values()).find((s) => s.handshakeId === handshakeId)
    if (!session || session.handshakeId !== handshakeId) {
      throw new Error('Session not found')
    }
    if (session.aborted || session.offer.state !== 'transferring') {
      throw new Error('Transfer is not active')
    }
    if (!session.sessionToken || !safeEqualHex(token, session.sessionToken)) {
      throw new Error('Invalid sessionToken')
    }
    return session
  }

  private pushSseEvent(
    session: ReceiverOfferSession,
    eventName: string,
    payload: Record<string, unknown>
  ): void {
    const envelope = encryptJson(
      session.sessionKey,
      payload,
      `sse:${session.handshakeId}:${session.offer.offerId}:${eventName}`
    )
    const dataLine = JSON.stringify(envelope)
    if (session.sseRes && !session.sseRes.writableEnded) {
      session.sseRes.write(`event: ${eventName}\ndata: ${dataLine}\n\n`)
      return
    }
    // Buffer briefly if SSE stream hasn't connected yet
    const existing = this.recentTerminalEvents.get(session.offer.offerId)
    if (existing) clearTimeout(existing.timer)
    const keyCopy = Buffer.from(session.sessionKey)
    const timer = setTimeout(() => {
      const entry = this.recentTerminalEvents.get(session.offer.offerId)
      if (entry) {
        entry.sessionKey.fill(0)
        this.recentTerminalEvents.delete(session.offer.offerId)
      }
    }, 30_000)
    this.recentTerminalEvents.set(session.offer.offerId, {
      handshakeId: session.handshakeId,
      sessionKey: keyCopy,
      eventName,
      dataLine,
      timer
    })
  }

  private async handleReceiverConfirmExpired(offerId: string): Promise<void> {
    const session = this.incomingSessions.get(offerId)
    if (!session || session.offer.state !== 'pending' || session.aborted) return
    session.aborted = true
    this.pushSseEvent(session, 'expired', {})
    await this.finalizeIncomingSession(session, 'expired')
  }

  private async abortPendingIncomingOnDisable(): Promise<void> {
    for (const session of Array.from(this.incomingSessions.values())) {
      session.aborted = true
      this.clearConfirmTimer(session)
      if (session.offer.state === 'pending') {
        this.pushSseEvent(session, 'reject', { reason: 'service_disabled' })
        await this.finalizeIncomingSession(session, 'rejected')
      } else {
        this.pushSseEvent(session, 'stop', { reason: 'service_disabled' })
        await this.cleanupIncomingPartFiles(session)
        await this.finalizeIncomingSession(session, 'stopped')
      }
    }
  }

  private async cleanupIncomingPartFiles(session: ReceiverOfferSession): Promise<void> {
    for (const ws of session.activeWriteStreams) {
      try {
        ws.destroy()
      } catch {
        // ignore
      }
    }
    session.activeWriteStreams.clear()
    for (const partPath of session.activePartFiles) {
      await fsPromises.rm(partPath, { force: true }).catch(() => {})
    }
    session.activePartFiles.clear()
    session.receivedFileShas.clear()
  }

  private async finalizeIncomingSession(
    session: ReceiverOfferSession,
    state: MarkShareHistoryRecord['state'],
    errorMessage?: string
  ): Promise<void> {
    if (!this.incomingSessions.has(session.offer.offerId)) return
    this.incomingSessions.delete(session.offer.offerId)
    this.clearConfirmTimer(session)

    if (session.sseKeepaliveTimer) {
      clearInterval(session.sseKeepaliveTimer)
      session.sseKeepaliveTimer = null
    }
    if (session.sseRes && !session.sseRes.writableEnded) {
      try {
        session.sseRes.end()
      } catch {
        // ignore
      }
      session.sseRes = null
    }

    session.offer.state = state
    session.offer.errorMessage = errorMessage

    await this.appendHistory({
      id: session.offer.offerId,
      direction: 'receive',
      peerDeviceId: session.offer.peerDevice.deviceId,
      peerDeviceName: session.offer.peerDevice.deviceName,
      peerOsType: session.offer.peerDevice.osType,
      peerAppType: session.offer.peerDevice.appType,
      peerHostIp: session.offer.peerDevice.hostIp,
      rootLabel: session.offer.rootLabel,
      rootType: session.offer.rootType,
      totalFiles: session.offer.totalFiles,
      totalBytes: session.offer.totalBytes,
      state,
      createdAt: session.offer.createdAt,
      finishedAt: Date.now(),
      saveDir: session.offer.saveDir,
      savedRootPath: session.offer.savedRootPath,
      savedPaths: session.offer.savedPaths,
      errorMessage
    })

    // Zero sensitive session key after encrypting final ACK happens cleanly in next tick if complete
    setTimeout(() => {
      session.sessionKey.fill(0)
    }, 200)

    this.emit('session-ended', { ...session.offer })
    this.emit('sessions-updated', this.getActiveOffers())
  }

  private clearConfirmTimer(session: { confirmTimer: NodeJS.Timeout | null }): void {
    if (session.confirmTimer) {
      clearTimeout(session.confirmTimer)
      session.confirmTimer = null
    }
  }

  private emitThrottledProgress(force = false): void {
    const now = Date.now()
    if (!force && now - this.lastProgressEmitAt < PROGRESS_THROTTLE_MS) return
    this.lastProgressEmitAt = now
    this.emit('sessions-updated', this.getActiveOffers())
  }

  private sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
    const payload = JSON.stringify(data)
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(payload)
    })
    res.end(payload)
  }

  private async loadConfig(): Promise<void> {
    let parsedDeviceId: unknown
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = await fsPromises.readFile(this.configPath, 'utf8')
        const parsed = JSON.parse(raw) as Partial<PersistedConfigFile>
        if (typeof parsed.deviceId === 'string') parsedDeviceId = parsed.deviceId
        if (typeof parsed.autoStart === 'boolean') this.config.autoStart = parsed.autoStart
        if (typeof parsed.defaultSaveDir === 'string' && parsed.defaultSaveDir.trim()) {
          this.config.defaultSaveDir = parsed.defaultSaveDir
        }
        if (typeof parsed.deviceAlias === 'string') {
          this.config.deviceAlias = parsed.deviceAlias.trim()
        }
        if (parsed.peerAliases && typeof parsed.peerAliases === 'object') {
          this.config.peerAliases = { ...parsed.peerAliases }
        }
      }
    } catch (err) {
      console.warn('[MarkShareManager] Failed to load config:', err)
    }

    // Resolve deviceId once per app startup and cache plaintext deviceId in memory:
    // 1. Prefer Ev1:-encrypted value stored in config file (decrypt + verify generation rule)
    // 2. On first launch, missing entry, decryption failure, or rule mismatch -> acquire/generate & overwrite config
    const validStoredDeviceId = resolveMarkShareDeviceIdFromStored(parsedDeviceId)
    if (validStoredDeviceId) {
      this.config.deviceId = (parsedDeviceId as string).trim()
      this.deviceId = validStoredDeviceId
      this.peerKey = makeMarkSharePeerKey(validStoredDeviceId, this.appType)
    } else {
      const freshDeviceId = createMarkShareDeviceId(this.hardwareProbe)
      this.deviceId = freshDeviceId
      this.peerKey = makeMarkSharePeerKey(freshDeviceId, this.appType)
      this.config.deviceId = encryptMarkShareDeviceIdEv1(freshDeviceId)
      await this.saveConfig()
    }
  }

  private async saveConfig(): Promise<void> {
    try {
      await fsPromises.mkdir(path.dirname(this.configPath), { recursive: true })
      await fsPromises.writeFile(this.configPath, JSON.stringify(this.config, null, 2), 'utf8')
    } catch (err) {
      console.warn('[MarkShareManager] Failed to save config:', err)
    }
  }

  private async loadHistory(): Promise<void> {
    try {
      if (!fs.existsSync(this.historyPath)) return
      const raw = await fsPromises.readFile(this.historyPath, 'utf8')
      const parsed = JSON.parse(raw) as MarkShareHistoryRecord[]
      if (Array.isArray(parsed)) {
        this.history = parsed.slice(0, MAX_HISTORY_RECORDS)
      }
    } catch (err) {
      console.warn('[MarkShareManager] Failed to load history:', err)
    }
  }

  private async appendHistory(record: MarkShareHistoryRecord): Promise<void> {
    this.history = [record, ...this.history.filter((r) => r.id !== record.id)].slice(
      0,
      MAX_HISTORY_RECORDS
    )
    await this.saveHistory()
    this.emit('history-updated', this.getHistory())
  }

  private async saveHistory(): Promise<void> {
    try {
      await fsPromises.mkdir(path.dirname(this.historyPath), { recursive: true })
      await fsPromises.writeFile(this.historyPath, JSON.stringify(this.history, null, 2), 'utf8')
    } catch (err) {
      console.warn('[MarkShareManager] Failed to save history:', err)
    }
  }
}

let markShareInstance: MarkShareManager | null = null

export function getMarkShareManager(appType: MarkShareAppType = 'marknotepro'): MarkShareManager {
  if (!markShareInstance) {
    markShareInstance = new MarkShareManager(appType)
  }
  return markShareInstance
}
