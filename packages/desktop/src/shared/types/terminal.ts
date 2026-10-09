export type TerminalProtocolType = 'ssh' | 'telnet' | 'serial' | 'rawSocket'
export type TerminalConnectionType = TerminalProtocolType

export interface ITerminalConnectionConfig {
  id: string
  name: string
  type: TerminalProtocolType
  host?: string
  port?: number
  username?: string
  authType?: 'password' | 'privateKey' | 'agent' | 'interactive'
  password?: string
  privateKey?: string
  passphrase?: string
  totpSecret?: string
  jumpHost?: string
  jumpPort?: number
  jumpUsername?: string
  jumpPassword?: string
  keepaliveInterval?: number
  readyTimeout?: number
  serialPort?: string
  portPath?: string
  baudRate?: number
  dataBits?: number
  stopBits?: number
  parity?: 'none' | 'even' | 'odd' | 'mark' | 'space'
  socketProtocol?: 'tcp' | 'udp'
  group?: string
  groupName?: string
  kdbxFilePath?: string
  kdbxEntryId?: string
}

export type TerminalSessionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export interface ITerminalSessionInfo {
  id: string
  title: string
  type: TerminalProtocolType
  name?: string
  status: TerminalSessionStatus
  has2fa?: boolean
  error?: string
  host?: string
  port?: number
  username?: string
  connectedAt?: number
  kdbxEntryId?: string
  config: ITerminalConnectionConfig
}

export interface IHardwareStats {
  cpuUsage: number
  cpuPercent?: number
  memoryPercent: number
  memPercent?: number
  memoryUsed: number
  memUsedBytes?: number
  memoryTotal: number
  memTotalBytes?: number
  memUsedFormatted?: string
  memTotalFormatted?: string
  loadAvg: [number, number, number]
  networkRx: number
  networkTx: number
  rxSpeedBytes?: number
  txSpeedBytes?: number
  rxSpeedFormatted?: string
  txSpeedFormatted?: string
  uptime?: string
  uptimeSeconds?: number
}

export interface ISftpItem {
  name: string
  path: string
  isDirectory: boolean
  isSymlink: boolean
  size: number
  sizeFormatted: string
  modifyTime: number
  permissions: string
}

export type ISftpFileItem = ISftpItem

export interface ISftpTransferProgress {
  id: string
  type: 'upload' | 'download'
  localPath: string
  remotePath: string
  name: string
  fileName?: string
  totalBytes: number
  transferredBytes: number
  percent: number
  speedFormatted: string
  status: 'pending' | 'transferring' | 'completed' | 'error'
  error?: string
}

export interface ITerminal2faPrompt {
  sessionId: string
  promptId: string
  prompt: string
  instruction?: string
}
