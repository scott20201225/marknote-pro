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
  isFolder?: boolean
  rootFolderName?: string
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

export type LanShareConflictStrategy = 'rename' | 'skip' | 'overwrite'
export type LanSharePathMode = 'preserve' | 'flatten'

export interface LanShareDownloadBatchItem {
  id: string
  name: string
  relativePath: string
}

export interface LanShareConflictPreviewRequest {
  targetDir: string
  workspaceRoot?: string
  senderAppType?: 'marknotepro' | 'marktextpro'
  pathMode?: LanSharePathMode
  files: LanShareDownloadBatchItem[]
}

export interface LanShareConflictPreview {
  totalFiles: number
  conflictCount: number
  conflictSamples: string[]
}

export interface LanShareDownloadBatchRequest {
  remoteUrl: string
  targetDir: string
  workspaceRoot?: string
  senderAppType?: 'marknotepro' | 'marktextpro'
  pathMode?: LanSharePathMode
  conflictStrategy: LanShareConflictStrategy
  token?: string
  password?: string
  files: LanShareDownloadBatchItem[]
}

export interface LanShareDownloadBatchResult {
  totalFiles: number
  downloadedCount: number
  renamedCount: number
  overwrittenCount: number
  skippedCount: number
}

export interface CreateLanShareOptions {
  title: string
  rootPath: string
  isFolder: boolean
  filePaths: string[] // selected absolute file paths
  password?: string
}
