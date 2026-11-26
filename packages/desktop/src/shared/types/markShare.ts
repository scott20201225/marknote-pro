export type MarkShareAppType = 'marknotepro' | 'marktextpro'

export type MarkShareOsType = 'darwin' | 'win32' | 'linux'

export type MarkShareSessionState =
  | 'pending'
  | 'transferring'
  | 'completed'
  | 'rejected'
  | 'expired'
  | 'cancelled'
  | 'stopped'
  | 'failed'

export interface MarkShareDevice {
  /** Canonical unique key: `${deviceId}:${appType}` */
  peerKey: string
  /** Hardware-derived persistent machine identifier */
  deviceId: string
  /** Effective display name (custom alias if set, otherwise OS hostname) */
  deviceName: string
  /** Optional custom alias set on peer */
  deviceAlias?: string
  /** Raw OS hostname */
  hostname?: string
  /** Operating system platform */
  osType: MarkShareOsType
  /** Which application is running MarkShare */
  appType: MarkShareAppType
  /** Reachable LAN IPv4 address */
  hostIp: string
  /** P2P MarkShare HTTP/SSE transfer port */
  port: number
  /** Whether this peer runs on the same physical host (different appType) */
  isSameHost?: boolean
  /** Last heartbeat timestamp in ms */
  lastSeen: number
}

export interface MarkShareManifestItem {
  fileId: string
  /** POSIX-style relative path under root/saveDir */
  relativePath: string
  name: string
  size: number
  isDirectory: boolean
  sha256?: string
}

export interface MarkShareOffer {
  offerId: string
  direction: 'send' | 'receive'
  peerDevice: MarkShareDevice
  /** 4-digit handshake verification code derived from X25519 ECDH shared secret */
  sasCode: string
  rootLabel: string
  rootType: 'file' | 'folder' | 'mixed'
  items: MarkShareManifestItem[]
  totalFiles: number
  totalBytes: number
  state: MarkShareSessionState
  createdAt: number
  /** Only enforced while state === 'pending' (60s); 0 once accepted */
  expiresAt: number
  transferredBytes: number
  transferredFiles: number
  currentFileName?: string
  saveDir?: string
  savedRootPath?: string
  savedPaths?: string[]
  sourcePaths?: string[]
  errorMessage?: string
}

export interface MarkShareHistoryRecord {
  id: string
  direction: 'send' | 'receive'
  peerDeviceId: string
  peerDeviceName: string
  peerOsType: MarkShareOsType
  peerAppType: MarkShareAppType
  peerHostIp: string
  rootLabel: string
  rootType: 'file' | 'folder' | 'mixed'
  totalFiles: number
  totalBytes: number
  state: Exclude<MarkShareSessionState, 'pending' | 'transferring'>
  createdAt: number
  finishedAt: number
  saveDir?: string
  savedRootPath?: string
  savedPaths?: string[]
  sourcePaths?: string[]
  errorMessage?: string
}

export interface MarkShareConfigState {
  enabled: boolean
  autoStart: boolean
  defaultSaveDir: string
  deviceId: string
  peerKey: string
  deviceName: string
  deviceAlias: string
  hostname: string
  osType: MarkShareOsType
  appType: MarkShareAppType
  port: number
  localIps: string[]
}

export interface MarkShareSendRequest {
  targetPeerKey: string
  paths: string[]
}

export interface MarkShareAcceptRequest {
  offerId: string
  saveDir?: string
  setAsDefaultSaveDir?: boolean
}
