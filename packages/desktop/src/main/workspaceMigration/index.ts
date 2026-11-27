import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import fs from 'fs'
import fsPromises from 'fs/promises'
import path from 'path'
import type {
  GitRepositoryCacheEntry,
  WorkspaceInspectResult,
  WorkspaceMigrationOptions,
  WorkspaceMigrationPreview,
  WorkspaceMigrationResult,
  WorkspaceSwitchEntry
} from '../../shared/types/workspaceMigration'
import {
  allocateUniqueRelativeFilePath,
  copyFileAtomically,
  isMarkNoteGroupVisibleSpecialDoc,
  mapPlainRelPosixToMarkNote
} from '../utils/transferConflictResolver'

const IGNORED_NAMES = new Set([
  '.git',
  '.DS_Store',
  'Thumbs.db',
  '.Trash',
  '.Trashes',
  '$RECYCLE.BIN'
])

const getGitReposCachePath = (): string => path.join(app.getPath('userData'), 'git-repositories-cache.json')
const getRecentWorkspacesPath = (): string => path.join(app.getPath('userData'), 'recent-workspaces.json')

let cachedGitRepositories: GitRepositoryCacheEntry[] = []

export const loadCachedGitRepositories = async (): Promise<GitRepositoryCacheEntry[]> => {
  if (cachedGitRepositories.length > 0) return cachedGitRepositories
  try {
    const file = getGitReposCachePath()
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(await fsPromises.readFile(file, 'utf8'))
      if (Array.isArray(parsed)) {
        cachedGitRepositories = parsed
      }
    }
  } catch (err) {
    console.warn('[WorkspaceMigration] Failed to read git repos cache:', err)
  }
  return cachedGitRepositories
}

export const updateCachedGitRepositories = async (repos: GitRepositoryCacheEntry[]): Promise<void> => {
  try {
    const clean = (Array.isArray(repos) ? repos : [])
      .filter((r) => r && typeof r.path === 'string' && r.path.trim().length > 0)
      .map((r) => ({
        id: Number(r.id) || 0,
        name: String(r.name || path.basename(r.path)),
        path: path.normalize(r.path),
        missing: !!r.missing
      }))
    cachedGitRepositories = clean
    const file = getGitReposCachePath()
    await fsPromises.mkdir(path.dirname(file), { recursive: true })
    await fsPromises.writeFile(file, JSON.stringify(clean, null, 2), 'utf8')
  } catch (err) {
    console.warn('[WorkspaceMigration] Failed to save git repos cache:', err)
  }
}

export const loadRecentWorkspaces = async (includeMissing = false): Promise<string[]> => {
  try {
    const file = getRecentWorkspacesPath()
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(await fsPromises.readFile(file, 'utf8'))
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (p) => typeof p === 'string' && p.trim().length > 0 && (includeMissing || fs.existsSync(p))
        )
      }
    }
  } catch (err) {
    console.warn('[WorkspaceMigration] Failed to load recent workspaces:', err)
  }
  return []
}

export const recordRecentWorkspace = async (dirPath: string): Promise<void> => {
  if (!dirPath || typeof dirPath !== 'string') return
  try {
    const normalized = path.normalize(dirPath)
    if (!fs.existsSync(normalized)) return
    const current = await loadRecentWorkspaces(true)
    const next = [normalized, ...current.filter((p) => path.normalize(p) !== normalized)].slice(0, 20)
    const file = getRecentWorkspacesPath()
    await fsPromises.mkdir(path.dirname(file), { recursive: true })
    await fsPromises.writeFile(file, JSON.stringify(next, null, 2), 'utf8')
  } catch (err) {
    console.warn('[WorkspaceMigration] Failed to record recent workspace:', err)
  }
}

export const removeRecentWorkspace = async (dirPath: string): Promise<void> => {
  if (!dirPath || typeof dirPath !== 'string') return
  try {
    const normalizeKey = (p: string): string => {
      const n = path.normalize(p).replace(/[/\\]+$/, '')
      return process.platform === 'win32' ? n.toLowerCase() : n
    }
    const targetKey = normalizeKey(dirPath)
    const current = await loadRecentWorkspaces(true)
    const next = current.filter((p) => normalizeKey(p) !== targetKey)
    const file = getRecentWorkspacesPath()
    await fsPromises.mkdir(path.dirname(file), { recursive: true })
    await fsPromises.writeFile(file, JSON.stringify(next, null, 2), 'utf8')
  } catch (err) {
    console.warn('[WorkspaceMigration] Failed to remove recent workspace:', err)
  }
}

/**
 * 标准 Git 仓库检测：沿目录树向上检测是否存在 .git 目录或 .git 文件
 * 兼容 GitHub、Gitee、Coding、GitLab、私有 Git 服务以及本地 git init 等一切符合 Git 规范的仓库。
 */
export const hasGitInfo = async (dirPath: string): Promise<boolean> => {
  if (!dirPath) return false
  let current = path.resolve(dirPath)
  try {
    const stat = await fsPromises.stat(current)
    if (!stat.isDirectory()) return false
  } catch {
    return false
  }

  while (true) {
    const gitMarker = path.join(current, '.git')
    if (fs.existsSync(gitMarker)) {
      return true
    }
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return false
}

interface ScannedFileEntry {
  sourcePath: string
  relPath: string
  isScattered: boolean
}

const isStructuredMarkNoteRelPath = (relPath: string): boolean => {
  const parts = relPath.split(path.sep).filter(Boolean)
  if (parts.length === 0) return false
  if (parts.length === 1) {
    return isMarkNoteGroupVisibleSpecialDoc(parts[0])
  }
  const top = parts[0]
  if (top === 'Attachments') return true
  if (top.startsWith('AREA_')) {
    return parts.length === 2 || parts[1] === 'Attachments'
  }
  if (top.startsWith('GROUP_')) {
    let idx = 1
    while (idx < parts.length - 1 && parts[idx].startsWith('GROUP_')) {
      idx++
    }
    if (idx === parts.length - 1) {
      return isMarkNoteGroupVisibleSpecialDoc(parts[idx])
    }
    if (parts[idx] === 'Attachments') {
      return true
    }
    if (parts[idx].startsWith('AREA_')) {
      return idx + 1 === parts.length - 1 || parts[idx + 1] === 'Attachments'
    }
  }
  return false
}

const collectTransferableFiles = async (
  rootDir: string,
  isMarkNote: boolean
): Promise<ScannedFileEntry[]> => {
  const results: ScannedFileEntry[] = []
  const resolvedRoot = path.resolve(rootDir)

  const walk = async (currentDir: string): Promise<void> => {
    let entries: fs.Dirent[]
    try {
      entries = await fsPromises.readdir(currentDir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (IGNORED_NAMES.has(entry.name)) continue
      const fullPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (entry.isFile()) {
        const relPath = path.relative(resolvedRoot, fullPath)
        const isScattered = isMarkNote ? !isStructuredMarkNoteRelPath(relPath) : false
        results.push({
          sourcePath: fullPath,
          relPath,
          isScattered
        })
      }
    }
  }

  await walk(resolvedRoot)
  return results
}

const computeTargetRelPath = (
  entry: ScannedFileEntry,
  wrapScatteredInArea: boolean
): string => {
  if (entry.isScattered && wrapScatteredInArea) {
    const relPosix = entry.relPath.split(path.sep).join('/')
    const mapped = mapPlainRelPosixToMarkNote(relPosix, 'GROUP_Migrated/AREA_Imported')
    return path.join(...mapped.split('/'))
  }
  return entry.relPath
}

const isAttachmentRelPath = (relPath: string): boolean => {
  const parts = relPath.split(/[\\/]/).filter(Boolean)
  return parts.slice(0, -1).includes('Attachments')
}

const isSameOrNested = (sourceDir: string, targetDir: string): boolean => {
  const s = path.resolve(sourceDir)
  const t = path.resolve(targetDir)
  if (s === t) return true
  const relTargetInSource = path.relative(s, t)
  if (relTargetInSource && !relTargetInSource.startsWith('..') && !path.isAbsolute(relTargetInSource)) {
    return true
  }
  return false
}

export const inspectWorkspace = async (
  dirPath: string,
  appType: 'marknotepro' | 'marktextpro'
): Promise<WorkspaceInspectResult> => {
  if (!dirPath || !fs.existsSync(dirPath)) {
    return { exists: false, hasGit: false, fileCount: 0, hasScatteredFiles: false }
  }
  const hasGit = await hasGitInfo(dirPath)
  const files = await collectTransferableFiles(dirPath, appType === 'marknotepro')
  const hasScatteredFiles = files.some((f) => f.isScattered)
  return {
    exists: true,
    hasGit,
    fileCount: files.length,
    hasScatteredFiles
  }
}

export const previewWorkspaceMigration = async (
  sourceDir: string,
  targetDir: string,
  appType: 'marknotepro' | 'marktextpro',
  wrapScatteredInArea = true
): Promise<WorkspaceMigrationPreview> => {
  if (!sourceDir || !targetDir) {
    return {
      sourceDir,
      targetDir,
      totalFiles: 0,
      conflictFiles: [],
      hasScatteredFiles: false,
      sameOrNestedError: 'invalid-path'
    }
  }

  if (isSameOrNested(sourceDir, targetDir)) {
    return {
      sourceDir,
      targetDir,
      totalFiles: 0,
      conflictFiles: [],
      hasScatteredFiles: false,
      sameOrNestedError: 'same-or-nested'
    }
  }

  const isMarkNote = appType === 'marknotepro'
  const files = await collectTransferableFiles(sourceDir, isMarkNote)
  const conflictFiles: string[] = []
  const resolvedTarget = path.resolve(targetDir)
  let hasScatteredFiles = false

  for (const entry of files) {
    if (entry.isScattered) hasScatteredFiles = true
    const targetRelPath = computeTargetRelPath(entry, isMarkNote && wrapScatteredInArea)
    // Attachments use <name>-<md5>.ext and are always overwritten directly on merge
    if (isAttachmentRelPath(targetRelPath)) {
      continue
    }
    const destPath = path.join(resolvedTarget, targetRelPath)
    if (fs.existsSync(destPath)) {
      conflictFiles.push(targetRelPath)
    }
  }

  return {
    sourceDir,
    targetDir,
    totalFiles: files.length,
    conflictFiles,
    hasScatteredFiles
  }
}

export const executeWorkspaceMigration = async (
  options: WorkspaceMigrationOptions,
  appType: 'marknotepro' | 'marktextpro'
): Promise<WorkspaceMigrationResult> => {
  if (options.conflictStrategy === 'none') {
    return {
      cancelled: true,
      copiedCount: 0,
      renamedCount: 0,
      overwrittenCount: 0,
      skippedCount: 0,
      totalProcessed: 0
    }
  }

  if (isSameOrNested(options.sourceDir, options.targetDir)) {
    throw new Error('Source and target workspace cannot be the same or nested.')
  }

  const isMarkNote = appType === 'marknotepro'
  const wrapScattered = isMarkNote && options.wrapScatteredInArea !== false
  const files = await collectTransferableFiles(options.sourceDir, isMarkNote)
  const resolvedTarget = path.resolve(options.targetDir)

  await fsPromises.mkdir(resolvedTarget, { recursive: true })

  let copiedCount = 0
  let renamedCount = 0
  let overwrittenCount = 0
  let skippedCount = 0
  const reservedRelPaths = new Set<string>()

  for (const entry of files) {
    const targetRelPath = computeTargetRelPath(entry, wrapScattered)
    const relPosix = targetRelPath.split(path.sep).join('/')
    const destPath = path.join(resolvedTarget, targetRelPath)
    const exists = fs.existsSync(destPath)
    const inBatchCollision = reservedRelPaths.has(relPosix)

    // Attachments carry <name>-<md5>.ext and always overwrite on same filename
    if (isAttachmentRelPath(targetRelPath)) {
      reservedRelPaths.add(relPosix)
      await copyFileAtomically(entry.sourcePath, destPath)
      if (exists || inBatchCollision) {
        overwrittenCount++
      } else {
        copiedCount++
      }
      continue
    }

    if (exists || inBatchCollision) {
      if (options.conflictStrategy === 'skip') {
        skippedCount++
        continue
      }
      if (options.conflictStrategy === 'rename' || inBatchCollision) {
        const uniqueRel = allocateUniqueRelativeFilePath(resolvedTarget, relPosix, reservedRelPaths)
        const renamedDest = path.join(resolvedTarget, ...uniqueRel.split('/'))
        await copyFileAtomically(entry.sourcePath, renamedDest)
        renamedCount++
        continue
      }
      reservedRelPaths.add(relPosix)
      await copyFileAtomically(entry.sourcePath, destPath)
      overwrittenCount++
    } else {
      reservedRelPaths.add(relPosix)
      await copyFileAtomically(entry.sourcePath, destPath)
      copiedCount++
    }
  }

  return {
    cancelled: false,
    copiedCount,
    renamedCount,
    overwrittenCount,
    skippedCount,
    totalProcessed: files.length
  }
}

export const registerWorkspaceMigrationHandlers = (
  appType: 'marknotepro' | 'marktextpro' = 'marknotepro'
): void => {
  void loadCachedGitRepositories()

  ipcMain.handle('mt::workspace-migration:inspect', async (_event, dirPath: string) => {
    return inspectWorkspace(dirPath, appType)
  })

  ipcMain.handle(
    'mt::workspace-migration:preview',
    async (_event, sourceDir: string, targetDir: string, wrapScatteredInArea = true) => {
      return previewWorkspaceMigration(sourceDir, targetDir, appType, wrapScatteredInArea)
    }
  )

  ipcMain.handle('mt::workspace-migration:execute', async (_event, options: WorkspaceMigrationOptions) => {
    return executeWorkspaceMigration(options, appType)
  })

  ipcMain.handle('mt::workspace-migration:get-git-repos', async () => {
    const repos = await loadCachedGitRepositories()
    return repos.filter((r) => !r.missing && fs.existsSync(r.path))
  })

  ipcMain.handle('mt::workspace-migration:get-all-workspaces', async (_event, currentPath?: string) => {
    const [repos, recent] = await Promise.all([
      loadCachedGitRepositories(),
      loadRecentWorkspaces(true)
    ])
    const normalizeKey = (p: string): string => {
      const normalized = path.normalize(p).replace(/[/\\]+$/, '')
      return process.platform === 'win32' ? normalized.toLowerCase() : normalized
    }
    const entryMap = new Map<string, WorkspaceSwitchEntry>()

    for (const r of repos) {
      if (!r.path) continue
      const normalized = path.normalize(r.path)
      const key = normalizeKey(normalized)
      const exists = !r.missing && fs.existsSync(normalized)
      entryMap.set(key, {
        name: r.name || path.basename(normalized),
        path: normalized,
        isGit: true,
        isManagedGitRepo: true,
        exists
      })
    }

    const extraPaths = [...recent]
    if (currentPath && typeof currentPath === 'string') {
      extraPaths.unshift(currentPath)
    }

    for (const dirPath of extraPaths) {
      if (!dirPath) continue
      const normalized = path.normalize(dirPath)
      const key = normalizeKey(normalized)
      if (entryMap.has(key)) continue
      const exists = fs.existsSync(normalized)
      const gitDetected = exists ? await hasGitInfo(normalized) : false
      entryMap.set(key, {
        name: path.basename(normalized) || normalized,
        path: normalized,
        isGit: gitDetected,
        isManagedGitRepo: false,
        exists
      })
    }

    return Array.from(entryMap.values())
  })

  ipcMain.handle('mt::workspace-migration:get-recent-workspaces', async () => {
    return loadRecentWorkspaces()
  })

  ipcMain.handle('mt::workspace-migration:record-recent', async (_event, dirPath: string) => {
    await recordRecentWorkspace(dirPath)
  })

  ipcMain.handle('mt::workspace-migration:remove-recent', async (_event, dirPath: string) => {
    await removeRecentWorkspace(dirPath)
  })

  ipcMain.handle('mt::workspace-migration:select-folder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow()
    const options: Electron.OpenDialogOptions = { properties: ['openDirectory', 'createDirectory'] }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })
}
