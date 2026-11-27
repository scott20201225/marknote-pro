import fs from 'fs'
import fsPromises from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

export type TransferConflictStrategy = 'rename' | 'skip' | 'overwrite'
export type TransferPathMode = 'preserve' | 'flatten'

export interface TransferPlanInputItem {
  id: string
  relativePath: string
  name: string
  isDirectory: boolean
}

export interface PlannedFileDecision {
  id: string
  sourceRelPath: string
  targetRelPosix: string
  destAbsPath: string
  action: 'write' | 'rename' | 'skip' | 'overwrite'
  conflicted: boolean
}

export interface PlannedBatchResult {
  decisions: Map<string, PlannedFileDecision>
  mkdirRelDirs: string[]
  skipMkdir: boolean
  firstTopSegment: string | null
  singleFileAbsPath: string | null
  totalFiles: number
  conflictSamples: string[]
  conflictCount: number
}

export function isSameOrChildDirectory(rootDir: string, targetDir: string): boolean {
  const normRoot = path.resolve(rootDir)
  const normTarget = path.resolve(targetDir)
  if (normRoot === normTarget) return true
  const rel = path.relative(normRoot, normTarget)
  return Boolean(rel && !rel.startsWith('..') && !path.isAbsolute(rel))
}

export function isMarkNoteGroupVisibleSpecialDoc(fileName: string): boolean {
  return /\.(drawio|ggb|smm|kdbx|pdf)$/i.test(fileName)
}

export function allocateUniqueRelativeFilePath(
  baseDir: string,
  relPosix: string,
  reservedRelPaths: Set<string>
): string {
  const cleanRel = relPosix.replace(/\\/g, '/').replace(/^\/+/, '')
  const lastSlash = cleanRel.lastIndexOf('/')
  const dirPart = lastSlash >= 0 ? cleanRel.slice(0, lastSlash) : ''
  const baseName = (lastSlash >= 0 ? cleanRel.slice(lastSlash + 1) : cleanRel) || 'file'
  const ext = path.extname(baseName)
  const stem = baseName.slice(0, baseName.length - ext.length)

  let index = 0
  let fileCandidate = baseName
  let candidateRel = dirPart ? `${dirPart}/${fileCandidate}` : fileCandidate
  while (
    reservedRelPaths.has(candidateRel) ||
    fs.existsSync(path.join(baseDir, ...candidateRel.split('/')))
  ) {
    index++
    fileCandidate = `${stem} (${index})${ext}`
    candidateRel = dirPart ? `${dirPart}/${fileCandidate}` : fileCandidate
  }
  reservedRelPaths.add(candidateRel)
  return candidateRel
}

function getAttachmentsSplitIndex(parts: string[]): number {
  return parts.findIndex((seg, i) => i < parts.length - 1 && seg === 'Attachments')
}

/**
 * Map plain folder segments into MarkNotePro GROUP_ / AREA_ structure:
 * - Folder with only files -> AREA_<name>/...
 * - Folder with only subfolders -> GROUP_<name>/...
 * - Folder with BOTH files and subfolders -> sibling AREA_<name>/ (files) + GROUP_<name>/ (subfolders)
 */
function mapPlainDirSegmentsToMarkNote(dirParts: string[]): string[] {
  if (dirParts.length === 0) return []
  return dirParts.map((seg, idx) => {
    const clean = seg.replace(/^(?:GROUP_|AREA_)+/, '') || seg
    return idx === dirParts.length - 1 ? `AREA_${clean}` : `GROUP_${clean}`
  })
}

export function mapPlainRelPosixToMarkNote(
  relPosix: string,
  rootFallbackAreaRel = 'AREA_Downloads'
): string {
  const parts = relPosix.replace(/\\/g, '/').split('/').filter(Boolean)
  const fileName = parts[parts.length - 1] || 'file'
  const attIdx = getAttachmentsSplitIndex(parts)

  if (attIdx >= 0) {
    const hostDirParts = parts.slice(0, attIdx)
    const attTail = parts.slice(attIdx).join('/')
    const mappedHost = mapPlainDirSegmentsToMarkNote(hostDirParts)
    return mappedHost.length > 0 ? `${mappedHost.join('/')}/${attTail}` : attTail
  }

  const dirParts = parts.slice(0, -1)
  if (dirParts.length === 0) {
    if (isMarkNoteGroupVisibleSpecialDoc(fileName)) return fileName
    const cleanFallback = rootFallbackAreaRel.replace(/^\/+|\/+$/g, '')
    return cleanFallback ? `${cleanFallback}/${fileName}` : fileName
  }

  const mappedDirs = mapPlainDirSegmentsToMarkNote(dirParts)
  return `${mappedDirs.join('/')}/${fileName}`
}

/**
 * Compute per-file relative destination paths and conflict resolution actions
 * uniformly for MarkNotePro, MarkTextPro, lanShare, and MarkShare.
 */
export function buildTransferPlan(options: {
  receiverAppType: 'marknotepro' | 'marktextpro'
  senderAppType?: 'marknotepro' | 'marktextpro'
  chosenDir: string
  workspaceRoot?: string
  items: TransferPlanInputItem[]
  conflictStrategy?: TransferConflictStrategy
  pathMode?: TransferPathMode
}): PlannedBatchResult {
  const {
    receiverAppType,
    senderAppType = 'marktextpro',
    chosenDir,
    workspaceRoot,
    items,
    conflictStrategy = 'rename',
    pathMode = 'preserve'
  } = options

  const chosenBase = path.basename(chosenDir)
  const inMarkNoteWorkspace =
    receiverAppType === 'marknotepro' &&
    (chosenBase.startsWith('AREA_') ||
      chosenBase.startsWith('GROUP_') ||
      Boolean(workspaceRoot && isSameOrChildDirectory(workspaceRoot, chosenDir)))

  const isMarkNoteAreaTarget = inMarkNoteWorkspace && chosenBase.startsWith('AREA_')
  const isMarkNoteGroupOrRootTarget = inMarkNoteWorkspace && !isMarkNoteAreaTarget
  const shouldTransformMarkNoteFolders =
    receiverAppType === 'marknotepro' && senderAppType !== 'marknotepro'

  const fileItems = items.filter((item) => !item.isDirectory)
  const dirItems = items.filter((item) => item.isDirectory)

  let flattenGroupTargetArea = 'AREA_Downloads'
  if (pathMode === 'flatten' && isMarkNoteGroupOrRootTarget) {
    const firstDirFile = fileItems.find((item) => {
      const p = item.relativePath.replace(/\\/g, '/').split('/').filter(Boolean)
      return p.length > 1 && p[0] !== 'Attachments'
    })
    if (firstDirFile) {
      const top = firstDirFile.relativePath.replace(/\\/g, '/').split('/').filter(Boolean)[0]!
      const cleanTop = top.replace(/^(?:GROUP_|AREA_)+/, '') || top
      flattenGroupTargetArea = `AREA_${cleanTop}`
    }
  }

  const rawTargets: Array<{ item: TransferPlanInputItem; desiredRelPosix: string }> = []
  for (const item of fileItems) {
    const parts = item.relativePath.replace(/\\/g, '/').split('/').filter(Boolean)
    const fileName = parts[parts.length - 1] || item.name || 'file'
    const attIdx = getAttachmentsSplitIndex(parts)

    if (pathMode === 'flatten') {
      const attTail = attIdx >= 0 ? parts.slice(attIdx).join('/') : null
      if (isMarkNoteGroupOrRootTarget) {
        rawTargets.push({
          item,
          desiredRelPosix: attTail ? `${flattenGroupTargetArea}/${attTail}` : `${flattenGroupTargetArea}/${fileName}`
        })
      } else {
        rawTargets.push({
          item,
          desiredRelPosix: attTail || fileName
        })
      }
      continue
    }

    if (isMarkNoteAreaTarget) {
      // AREA_ does not support regular subfolders; keep Attachments/<tail> intact and flatten docs
      const attTail = attIdx >= 0 ? parts.slice(attIdx).join('/') : null
      rawTargets.push({
        item,
        desiredRelPosix: attTail || fileName
      })
      continue
    }

    if (isMarkNoteGroupOrRootTarget && shouldTransformMarkNoteFolders) {
      const normalizedRel = parts.join('/') || fileName
      rawTargets.push({
        item,
        desiredRelPosix: mapPlainRelPosixToMarkNote(normalizedRel, 'AREA_Downloads')
      })
      continue
    }

    // Preserve complete relative hierarchy (MarkNote -> MarkNote, MarkTextPro, or outside workspace)
    rawTargets.push({
      item,
      desiredRelPosix: parts.join('/') || fileName
    })
  }

  const reservedRelPaths = new Set<string>()
  const decisions = new Map<string, PlannedFileDecision>()
  const conflictSamples: string[] = []
  let conflictCount = 0
  let firstTopSegment: string | null = null
  let singleFileAbsPath: string | null = null

  for (const { item, desiredRelPosix } of rawTargets) {
    const candidateParts = desiredRelPosix.split('/').filter(Boolean)
    const candidateDiskPath = path.join(chosenDir, ...candidateParts)
    const diskExists = fs.existsSync(candidateDiskPath)
    const inBatchCollision = reservedRelPaths.has(desiredRelPosix)
    const isConflict = diskExists || inBatchCollision

    if (!isConflict) {
      reservedRelPaths.add(desiredRelPosix)
      decisions.set(item.id, {
        id: item.id,
        sourceRelPath: item.relativePath,
        targetRelPosix: desiredRelPosix,
        destAbsPath: candidateDiskPath,
        action: 'write',
        conflicted: false
      })
      if (!firstTopSegment) firstTopSegment = candidateParts[0] || null
      if (rawTargets.length === 1) singleFileAbsPath = candidateDiskPath
      continue
    }

    conflictCount++
    if (conflictSamples.length < 20) {
      conflictSamples.push(desiredRelPosix)
    }

    if (conflictStrategy === 'skip') {
      decisions.set(item.id, {
        id: item.id,
        sourceRelPath: item.relativePath,
        targetRelPosix: desiredRelPosix,
        destAbsPath: candidateDiskPath,
        action: 'skip',
        conflicted: true
      })
      continue
    }

    if (conflictStrategy === 'overwrite' && !inBatchCollision) {
      reservedRelPaths.add(desiredRelPosix)
      decisions.set(item.id, {
        id: item.id,
        sourceRelPath: item.relativePath,
        targetRelPosix: desiredRelPosix,
        destAbsPath: candidateDiskPath,
        action: 'overwrite',
        conflicted: true
      })
      if (!firstTopSegment) firstTopSegment = candidateParts[0] || null
      if (rawTargets.length === 1) singleFileAbsPath = candidateDiskPath
      continue
    }

    // conflictStrategy === 'rename' OR in-batch duplicate during 'overwrite'
    const uniqueRel = allocateUniqueRelativeFilePath(chosenDir, desiredRelPosix, reservedRelPaths)
    const uniqueAbs = path.join(chosenDir, ...uniqueRel.split('/'))
    decisions.set(item.id, {
      id: item.id,
      sourceRelPath: item.relativePath,
      targetRelPosix: uniqueRel,
      destAbsPath: uniqueAbs,
      action: 'rename',
      conflicted: true
    })
    if (!firstTopSegment) firstTopSegment = uniqueRel.split('/')[0] || null
    if (rawTargets.length === 1) singleFileAbsPath = uniqueAbs
  }

  const preserveEmptyDirs =
    pathMode !== 'flatten' &&
    !isMarkNoteAreaTarget &&
    !(isMarkNoteGroupOrRootTarget && shouldTransformMarkNoteFolders)
  const mkdirRelDirs = preserveEmptyDirs
    ? dirItems.map((d) => d.relativePath.replace(/\\/g, '/').split('/').filter(Boolean).join('/')).filter(Boolean)
    : []

  return {
    decisions,
    mkdirRelDirs,
    skipMkdir: !preserveEmptyDirs,
    firstTopSegment,
    singleFileAbsPath,
    totalFiles: rawTargets.length,
    conflictSamples,
    conflictCount
  }
}

export async function copyFileAtomically(srcPath: string, destPath: string): Promise<void> {
  await fsPromises.mkdir(path.dirname(destPath), { recursive: true })
  const partPath = `${destPath}.tmp.${crypto.randomBytes(4).toString('hex')}.part`
  try {
    await fsPromises.copyFile(srcPath, partPath)
    await fsPromises.rename(partPath, destPath)
  } catch (err) {
    await fsPromises.rm(partPath, { force: true }).catch(() => {})
    throw err
  }
}
