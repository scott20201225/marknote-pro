export const NOTE_GROUP_PREFIX = 'GROUP_'
export const NOTE_AREA_PREFIX = 'AREA_'

export type NoteNodeKind =
  | 'root'
  | 'group'
  | 'area'
  | 'document'
  | 'otherFolder'
  | 'otherFile'

interface NoteNodeLike {
  pathname: string
  name: string
  isDirectory?: boolean
  isFile?: boolean
  isMarkdown?: boolean
  folders?: NoteNodeLike[]
  files?: NoteNodeLike[]
}

const stripNotePrefix = (name: string): string => {
  if (name.startsWith(NOTE_GROUP_PREFIX)) return name.slice(NOTE_GROUP_PREFIX.length)
  if (name.startsWith(NOTE_AREA_PREFIX)) return name.slice(NOTE_AREA_PREFIX.length)
  return name
}

const stripMarkdownExtension = (name: string): string => {
  return name.replace(/\.md$/i, '')
}

const getRelativeParts = (rootPath: string, pathname: string): string[] => {
  if (!rootPath) return []
  const relativePath = window.path.relative(rootPath, pathname)
  if (!relativePath || relativePath === '.') return []
  return relativePath.split(window.path.sep).filter(Boolean)
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
    return node.isMarkdown ? 'document' : 'otherFile'
  }

  if (!node.isDirectory) {
    return 'otherFile'
  }

  if (node.name.startsWith(NOTE_GROUP_PREFIX)) return 'group'
  if (node.name.startsWith(NOTE_AREA_PREFIX)) return 'area'

  const relativeParts = getRelativeParts(normalizedRoot, normalizedPath)
  if (relativeParts.length <= 1) return 'group'
  return 'area'
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
      return stripMarkdownExtension(node.name)
    default:
      return node.name
  }
}

export const toStoredNoteName = (
  rawName: string,
  kind: Extract<NoteNodeKind, 'group' | 'area' | 'document'>
): string => {
  const trimmedName = rawName.trim()
  if (!trimmedName) return ''

  const cleanName = stripMarkdownExtension(stripNotePrefix(trimmedName))

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

  return node.folders.filter((child) => child.isDirectory)
}

export const getVisibleNoteFiles = (
  node: NoteNodeLike | null | undefined,
  rootPath: string | null | undefined
): NoteNodeLike[] => {
  if (!node?.files?.length) return []

  const kind = getNoteNodeKind(node, rootPath)
  if (kind === 'root' || kind === 'group') return []

  return node.files.filter((child) => child.isMarkdown)
}
