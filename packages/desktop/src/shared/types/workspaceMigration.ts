export type ConflictResolutionStrategy = 'rename' | 'skip' | 'overwrite' | 'none'

export interface GitRepositoryCacheEntry {
  id: number
  name: string
  path: string
  missing: boolean
}

export interface WorkspaceSwitchEntry {
  name: string
  path: string
  isGit: boolean
  isManagedGitRepo?: boolean
  exists: boolean
}

export interface WorkspaceInspectResult {
  exists: boolean
  hasGit: boolean
  fileCount: number
  hasScatteredFiles: boolean
}

export interface WorkspaceMigrationPreview {
  sourceDir: string
  targetDir: string
  totalFiles: number
  conflictFiles: string[]
  hasScatteredFiles: boolean
  sameOrNestedError?: string
}

export interface WorkspaceMigrationOptions {
  sourceDir: string
  targetDir: string
  conflictStrategy: ConflictResolutionStrategy
  wrapScatteredInArea?: boolean
}

export interface WorkspaceMigrationResult {
  cancelled: boolean
  copiedCount: number
  renamedCount: number
  overwrittenCount: number
  skippedCount: number
  totalProcessed: number
}
