export const NOTE_GROUP_PREFIX = 'GROUP_'
export const NOTE_AREA_PREFIX = 'AREA_'
export const NOTE_ATTACHMENTS_DIRECTORY = 'Attachments'

export type NoteNodeKind = 'root' | 'group' | 'area' | 'document' | 'otherFolder' | 'otherFile'

interface NoteNodeLike {
  pathname: string
  name: string
  isDirectory?: boolean
  isFile?: boolean
  isMarkdown?: boolean
  isDrawing?: boolean
  isGeoGebra?: boolean
  isMindMap?: boolean
  isKdbx?: boolean
  isPdf?: boolean
  folders?: NoteNodeLike[]
  files?: NoteNodeLike[]
}

export const findNoteFolderByPath = (
  node: NoteNodeLike | null | undefined,
  pathname: string | null | undefined
): NoteNodeLike | null => {
  if (!node || !pathname) return null

  if (window.path.normalize(node.pathname) === window.path.normalize(pathname)) {
    return node
  }

  if (!node.folders?.length) return null

  for (const child of node.folders) {
    const match = findNoteFolderByPath(child, pathname)
    if (match) return match
  }

  return null
}

const isHiddenNoteFolder = (node: NoteNodeLike | null | undefined): boolean => {
  return !!node?.isDirectory && node.name === NOTE_ATTACHMENTS_DIRECTORY
}

const isNoteGroupName = (name: string): boolean => name.startsWith(NOTE_GROUP_PREFIX)

export const isNoteAreaName = (name: string): boolean => name.startsWith(NOTE_AREA_PREFIX)

export const CODE_AND_TEXT_EXTENSIONS_MAP: Readonly<Record<string, string>> = Object.freeze({
  // 文本
  txt: 'text',
  text: 'text',

  // 配置与数据
  json: 'json',
  jsonc: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  toml: 'toml',
  ini: 'ini',
  conf: 'ini',
  cfg: 'ini',
  properties: 'ini',
  env: 'shell',

  // 脚本代码
  sql: 'sql',
  sh: 'shell',
  bash: 'shell',
  bat: 'bat',
  ps1: 'powershell',
  html: 'html',
  htm: 'html',
  css: 'css',
  py: 'python',
  js: 'javascript',
  ts: 'typescript'
})

export const isCodeOrTextFileName = (name: string): boolean => {
  if (!name || typeof name !== 'string') return false
  const lower = name.toLowerCase()
  if (lower === '.env' || lower.endsWith('.env')) return true
  const dotIndex = lower.lastIndexOf('.')
  if (dotIndex === -1) return false
  const ext = lower.slice(dotIndex + 1)
  return ext in CODE_AND_TEXT_EXTENSIONS_MAP
}

export const isCodeOrTextFilePath = (pathname: string | null | undefined): boolean => {
  if (!pathname || typeof pathname !== 'string') return false
  const basename = pathname.split(/[/\\]/).pop() || ''
  return isCodeOrTextFileName(basename)
}

export const getCodeLanguageFromPath = (pathname?: string): string => {
  if (!pathname) return 'text'
  const base = pathname.split(/[/\\]/).pop() || ''
  const lower = base.toLowerCase()
  if (lower === '.env') return 'shell'
  const dotIndex = lower.lastIndexOf('.')
  if (dotIndex === -1) return 'text'
  const ext = lower.slice(dotIndex + 1)
  return CODE_AND_TEXT_EXTENSIONS_MAP[ext] || 'text'
}

const isMarkdownFileName = (name: string): boolean => /\.md$/i.test(name)
const isDrawingFileName = (name: string): boolean => /\.drawio$/i.test(name)
const isGeoGebraFileName = (name: string): boolean => /\.ggb$/i.test(name)
const isMindMapFileName = (name: string): boolean => /\.smm$/i.test(name)
const isKdbxFileName = (name: string): boolean => /\.kdbx$/i.test(name)
const isPdfFileName = (name: string): boolean => /\.pdf$/i.test(name)

const stripNotePrefix = (name: string): string => {
  if (isNoteGroupName(name)) return name.slice(NOTE_GROUP_PREFIX.length)
  if (isNoteAreaName(name)) return name.slice(NOTE_AREA_PREFIX.length)
  return name
}

const stripMarkdownExtension = (name: string): string => {
  return name.replace(/\.md$/i, '')
}

export const stripCodeOrTextExtension = (name: string): string => {
  if (!name || typeof name !== 'string') return ''
  if (name.toLowerCase() === '.env') return name
  const match = name.match(/\.([a-z0-9_-]+)$/i)
  if (match && match[1].toLowerCase() in CODE_AND_TEXT_EXTENSIONS_MAP) {
    const stripped = name.slice(0, match.index)
    return stripped || name
  }
  return name
}

const stripDrawingExtension = (name: string): string => {
  return name.replace(/\.drawio$/i, '')
}

const stripGeoGebraExtension = (name: string): string => name.replace(/\.ggb$/i, '')
const stripMindMapExtension = (name: string): string => name.replace(/\.smm$/i, '')
const stripKdbxExtension = (name: string): string => name.replace(/\.kdbx$/i, '')
const stripPdfExtension = (name: string): string => name.replace(/\.pdf$/i, '')

export const stripDocumentExtension = (name: string): string => {
  return stripPdfExtension(
    stripCodeOrTextExtension(
      stripKdbxExtension(
        stripMindMapExtension(
          stripGeoGebraExtension(
            stripDrawingExtension(
              stripMarkdownExtension(name)
            )
          )
        )
      )
    )
  )
}

const normalizeNotePathPart = (part: string): string => {
  return stripDocumentExtension(stripNotePrefix(part))
}

const getRelativeParts = (rootPath: string, pathname: string): string[] => {
  if (!rootPath) return []
  const relativePath = window.path.relative(rootPath, pathname)
  if (!relativePath || relativePath === '.') return []
  return relativePath.split(window.path.sep).filter(Boolean)
}

export const isValidNoteDirectoryPath = (
  pathname: string | null | undefined,
  rootPath: string | null | undefined
): boolean => {
  if (!pathname || !rootPath) return false

  const normalizedRoot = window.path.normalize(rootPath)
  const normalizedPath = window.path.normalize(pathname)

  if (normalizedPath === normalizedRoot) return true
  const isChild =
    typeof window.fileUtils?.isChildOfDirectory === 'function'
      ? window.fileUtils.isChildOfDirectory(normalizedRoot, normalizedPath)
      : normalizedPath.startsWith(normalizedRoot + (window.path?.sep ?? '/'))
  if (!isChild) return false

  const parts = getRelativeParts(normalizedRoot, normalizedPath)
  let hasArea = false

  for (const part of parts) {
    if (part === NOTE_ATTACHMENTS_DIRECTORY) return false

    if (isNoteAreaName(part)) {
      if (hasArea) return false
      hasArea = true
      continue
    }

    if (isNoteGroupName(part) && !hasArea) {
      continue
    }

    return false
  }

  return parts.length > 0
}

export const isValidNoteFilePath = (
  pathname: string | null | undefined,
  rootPath: string | null | undefined
): boolean => {
  if (!pathname || !rootPath) return false
  const name = window.path.basename(pathname)
  const isDrawing = isDrawingFileName(name)
  const isGeoGebra = isGeoGebraFileName(name)
  const isMindMap = isMindMapFileName(name)
  const isKdbx = isKdbxFileName(name)
  const isPdf = isPdfFileName(name)
  const isDocument = isMarkdownFileName(name) || isCodeOrTextFileName(name)
  if (!isDocument && !isDrawing && !isGeoGebra && !isMindMap && !isKdbx && !isPdf) return false

  const parentPath = window.path.dirname(pathname)
  const parentName = window.path.basename(parentPath)
  if (!isValidNoteDirectoryPath(parentPath, rootPath)) return false
  return isDrawing || isGeoGebra || isMindMap || isKdbx || isPdf || isNoteAreaName(parentName)
}

export const getNoteNodeKind = (
  node: NoteNodeLike | null | undefined,
  rootPath: string | null | undefined
): NoteNodeKind => {
  if (!node) return 'otherFile'

  const normalizedRoot = rootPath ? window.path.normalize(rootPath) : ''
  const normalizedPath = window.path.normalize(node.pathname)

  if (normalizedRoot && normalizedPath === normalizedRoot) {
    return 'root'
  }

  if (node.isFile) {
    return isValidNoteFilePath(node.pathname, rootPath) ? 'document' : 'otherFile'
  }

  if (!node.isDirectory) {
    return 'otherFile'
  }

  if (!isValidNoteDirectoryPath(normalizedPath, normalizedRoot)) return 'otherFolder'

  if (isNoteGroupName(node.name)) return 'group'
  if (isNoteAreaName(node.name)) return 'area'
  return 'otherFolder'
}

export const getNoteDisplayName = (
  node: NoteNodeLike | null | undefined,
  rootPath: string | null | undefined
): string => {
  if (!node) return ''

  const kind = getNoteNodeKind(node, rootPath)
  switch (kind) {
    case 'group':
    case 'area':
      return stripNotePrefix(node.name)
    case 'document':
      return stripDocumentExtension(node.name)
    default:
      return node.name
  }
}

export const getNotePathDisplay = (
  rootPath: string | null | undefined,
  pathname: string | null | undefined
): string => {
  if (!rootPath || !pathname) return ''

  const parts = getRelativeParts(window.path.normalize(rootPath), window.path.normalize(pathname))
    .map(normalizeNotePathPart)
    .filter(Boolean)

  return parts.join(' / ')
}

export const toStoredNoteName = (
  rawName: string,
  kind: Extract<NoteNodeKind, 'group' | 'area' | 'document'>
): string => {
  const trimmedName = rawName.trim()
  if (!trimmedName) return ''

  if (kind === 'document') {
    if (isCodeOrTextFileName(trimmedName)) {
      return stripNotePrefix(trimmedName)
    }
  }

  const cleanName = stripDocumentExtension(stripNotePrefix(trimmedName))

  switch (kind) {
    case 'group':
      return `${NOTE_GROUP_PREFIX}${cleanName}`
    case 'area':
      return `${NOTE_AREA_PREFIX}${cleanName}`
    case 'document':
      return `${cleanName}.md`
    default:
      return trimmedName
  }
}

export const getVisibleNoteFolders = (
  node: NoteNodeLike | null | undefined,
  rootPath: string | null | undefined
): NoteNodeLike[] => {
  if (!node?.folders?.length) return []

  const kind = getNoteNodeKind(node, rootPath)
  if (kind === 'area') return []

  return node.folders.filter((child) => {
    const childKind = getNoteNodeKind(child, rootPath)
    return (
      child.isDirectory &&
      !isHiddenNoteFolder(child) &&
      (childKind === 'group' || childKind === 'area')
    )
  })
}

export const getVisibleNoteFiles = (
  node: NoteNodeLike | null | undefined,
  rootPath: string | null | undefined
): NoteNodeLike[] => {
  if (!node?.files?.length) return []

  const kind = getNoteNodeKind(node, rootPath)
  if (kind === 'root' || kind === 'group') {
    return node.files.filter(
      (child) =>
        (child.isDrawing || child.isGeoGebra || child.isMindMap || child.isKdbx || isDrawingFileName(child.name) || isGeoGebraFileName(child.name) || isMindMapFileName(child.name) || isKdbxFileName(child.name)) &&
        getNoteNodeKind(child, rootPath) === 'document'
    )
  }

  return node.files.filter((child) => getNoteNodeKind(child, rootPath) === 'document')
}
