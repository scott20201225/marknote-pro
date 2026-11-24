export interface LanShareFileItem {
  id: string
  name: string
  relativePath: string
  absolutePath: string
  size: number
  isDirectory: boolean
  extension: string
  updatedAt: number
}

export interface LanShareRecord {
  id: string
  title: string
  rootPath: string
  isFolder: boolean
  files: LanShareFileItem[]
  password: string // empty string means no password
  port: number
  ip: string
  url: string
  status: 'running' | 'stopped'
  createdAt: number
  updatedAt: number
}

export interface DiscoveredLanShare {
  id: string
  title: string
  senderId: string
  deviceName: string
  app: 'marknotepro' | 'marktextpro'
  host: string
  port: number
  url: string
  hasPassword: boolean
  fileCount: number
  fileNames?: string[]
  lastSeen: number
}

export interface RemoteSharedFile {
  id: string
  name: string
  relativePath: string
  size: number
  isDirectory: boolean
  extension: string
}

export interface CreateLanShareOptions {
  title: string
  rootPath: string
  isFolder: boolean
  filePaths: string[] // selected absolute file paths
  password?: string
}
