import { getUniqueId } from '../util'
import { PATH_SEPARATOR } from '../config'

// Helper module (NOT a Pinia store): file-tree mutation helpers.

const naturalCompare = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

interface TreeFolder {
  id?: string
  pathname: string
  name: string
  isCollapsed?: boolean
  isDirectory: true
  isFile: false
  isMarkdown: false
  folders: TreeFolder[]
  files: TreeFile[]
}

interface TreeFile {
  id?: string
  pathname: string
  name: string
  birthTime?: number | Date
  mtimeMs?: number
  isDirectory: false
  isFile: true
  isMarkdown: boolean
}

type AddFileInput = Omit<TreeFile, 'id'>

const safeTime = (v: number | undefined): number => (v !== undefined && isFinite(v) ? v : 0)

const isPathMatch = (a: string, b: string): boolean => {
  if (window.fileUtils.isSamePathSync(a, b)) return true
  if (window.electron.process.platform !== 'win32') return false
  return window.path.normalize(a).toLowerCase() === window.path.normalize(b).toLowerCase()
}

const makeFileComparator = (sortBy: string, sortOrder: string) =>
  (a: TreeFile, b: TreeFile): number => {
    let result: number
    if (sortBy === 'created') {
      const aTime = a.birthTime instanceof Date ? a.birthTime.getTime() : safeTime(Number(a.birthTime))
      const bTime = b.birthTime instanceof Date ? b.birthTime.getTime() : safeTime(Number(b.birthTime))
      result = aTime - bTime
    } else if (sortBy === 'modified') {
      result = safeTime(a.mtimeMs) - safeTime(b.mtimeMs)
    } else {
      result = naturalCompare(a.name, b.name)
    }
    const ordered = sortOrder === 'desc' ? -result : result
    if (ordered !== 0) return ordered
    // Stable tie-breaker: natural name, then full pathname
    const byName = naturalCompare(a.name, b.name)
    return byName !== 0 ? byName : a.pathname.localeCompare(b.pathname)
  }

/**
 * Return all sub-directories relative to the root directory.
 */
const getSubdirectoriesFromRoot = (rootPath: string, pathname: string): string[] => {
  if (!window.path.isAbsolute(pathname)) {
    throw new Error('Invalid path!')
  }
  const relativePath = window.path.relative(rootPath, pathname)
  return relativePath ? relativePath.split(PATH_SEPARATOR) : []
}

/**
 * Add a new file to the tree list.
 */
export const addFile = (tree: TreeFolder, file: AddFileInput, sortBy: string = 'title', sortOrder: string = 'asc'): void => {
  const { pathname, name } = file
  const dirname = window.path.dirname(pathname)
  const subDirectories = getSubdirectoriesFromRoot(tree.pathname, dirname)

  let currentPath = tree.pathname
  let currentFolder: TreeFolder = tree
  let currentSubFolders: TreeFolder[] = tree.folders
  for (const directoryName of subDirectories) {
    const nextPath = window.path.join(currentPath, directoryName)
    let childFolder = currentSubFolders.find((f) => isPathMatch(f.pathname, nextPath))
    if (!childFolder) {
      childFolder = {
        id: getUniqueId(),
        pathname: nextPath,
        name: directoryName,
        isCollapsed: true,
        isDirectory: true,
        isFile: false,
        isMarkdown: false,
        folders: [],
        files: []
      }
      const idx = currentSubFolders.findIndex((f) => naturalCompare(f.name, directoryName) > 0)
      if (idx !== -1) {
        currentSubFolders.splice(idx, 0, childFolder)
      } else {
        currentSubFolders.push(childFolder)
      }
    }

    childFolder.pathname = nextPath
    childFolder.name = directoryName
    currentPath = nextPath
    currentFolder = childFolder
    currentSubFolders = childFolder.folders
  }

  // Add file to related directory.
  const existingFile = currentFolder.files.find((f) => isPathMatch(f.pathname, pathname))
  if (existingFile) {
    existingFile.name = name
    existingFile.pathname = pathname
    existingFile.birthTime = file.birthTime
    existingFile.mtimeMs = file.mtimeMs
    existingFile.isMarkdown = file.isMarkdown
  } else {
    // Remove file content from object.
    const fileCopy: TreeFile = {
      id: getUniqueId(),
      birthTime: file.birthTime,
      mtimeMs: file.mtimeMs,
      isDirectory: file.isDirectory,
      isFile: file.isFile,
      isMarkdown: file.isMarkdown,
      name: file.name,
      pathname: file.pathname
    }

    const comparator = makeFileComparator(sortBy, sortOrder)
    const idx = currentFolder.files.findIndex((f) => comparator(f, fileCopy) > 0)
    if (idx !== -1) {
      currentFolder.files.splice(idx, 0, fileCopy)
    } else {
      currentFolder.files.push(fileCopy)
    }
  }
}

/**
 * Add a new directory to the tree list.
 */
export const addDirectory = (tree: TreeFolder, dir: { pathname: string }): void => {
  const subDirectories = getSubdirectoriesFromRoot(tree.pathname, dir.pathname)

  let currentPath = tree.pathname
  let currentSubFolders: TreeFolder[] = tree.folders
  for (const directoryName of subDirectories) {
    const nextPath = window.path.join(currentPath, directoryName)
    let childFolder = currentSubFolders.find((f) => isPathMatch(f.pathname, nextPath))
    if (!childFolder) {
      childFolder = {
        id: getUniqueId(),
        pathname: nextPath,
        name: directoryName,
        isCollapsed: true,
        isDirectory: true,
        isFile: false,
        isMarkdown: false,
        folders: [],
        files: []
      }
      const idx = currentSubFolders.findIndex((f) => naturalCompare(f.name, directoryName) > 0)
      if (idx !== -1) {
        currentSubFolders.splice(idx, 0, childFolder)
      } else {
        currentSubFolders.push(childFolder)
      }
    }

    childFolder.pathname = nextPath
    childFolder.name = directoryName
    currentPath = nextPath
    currentSubFolders = childFolder.folders
  }
}

/**
 * Update a file's mtimeMs and re-insert it at the correct sorted position.
 * Called when a file-change event arrives so modified-time sort stays live.
 */
export const updateFileMtime = (
  tree: TreeFolder,
  file: { pathname: string; mtimeMs: number },
  sortBy: string,
  sortOrder: string
): void => {
  const dirname = window.path.dirname(file.pathname)
  const subDirectories = getSubdirectoriesFromRoot(tree.pathname, dirname)

  let currentFolder: TreeFolder = tree
  let currentSubFolders: TreeFolder[] = tree.folders
  for (const directoryName of subDirectories) {
    const nextPath = window.path.join(currentFolder.pathname, directoryName)
    const childFolder = currentSubFolders.find((f) => isPathMatch(f.pathname, nextPath))
    if (!childFolder) return
    currentFolder = childFolder
    currentSubFolders = childFolder.folders
  }

  const index = currentFolder.files.findIndex((f) => isPathMatch(f.pathname, file.pathname))
  if (index === -1) return

  const entry = currentFolder.files[index]
  entry.mtimeMs = file.mtimeMs

  // Re-insert only if sorting by modified time — avoids unnecessary churn otherwise.
  if (sortBy === 'modified') {
    currentFolder.files.splice(index, 1)
    const comparator = makeFileComparator(sortBy, sortOrder)
    const idx = currentFolder.files.findIndex((f) => comparator(f, entry) > 0)
    if (idx !== -1) {
      currentFolder.files.splice(idx, 0, entry)
    } else {
      currentFolder.files.push(entry)
    }
  }
}

/**
 * Re-sort an already-populated tree in place when the sort preference changes.
 */
export const resortTree = (tree: TreeFolder, sortBy: string, sortOrder: string): void => {
  tree.files.sort(makeFileComparator(sortBy, sortOrder))
  tree.folders.sort((a, b) => naturalCompare(a.name, b.name))
  for (const folder of tree.folders) {
    resortTree(folder, sortBy, sortOrder)
  }
}

/**
 * Remove the given file from the tree list.
 */
export const unlinkFile = (tree: TreeFolder, file: { pathname: string }): void => {
  const { pathname } = file
  const dirname = window.path.dirname(pathname)
  const subDirectories = getSubdirectoriesFromRoot(tree.pathname, dirname)

  let currentFolder: TreeFolder = tree
  let currentSubFolders: TreeFolder[] = tree.folders
  for (const directoryName of subDirectories) {
    const nextPath = window.path.join(currentFolder.pathname, directoryName)
    const childFolder = currentSubFolders.find((f) => isPathMatch(f.pathname, nextPath))
    if (!childFolder) return
    currentFolder = childFolder
    currentSubFolders = childFolder.folders
  }

  const index = currentFolder.files.findIndex((f) => isPathMatch(f.pathname, pathname))
  if (index !== -1) {
    currentFolder.files.splice(index, 1)
  }
}

/**
 * Remove the given directory from the tree list.
 */
export const unlinkDirectory = (tree: TreeFolder, dir: { pathname: string }): void => {
  const { pathname } = dir
  const subDirectories = getSubdirectoriesFromRoot(tree.pathname, pathname)

  subDirectories.pop()
  let currentFolder: TreeFolder[] = tree.folders
  let currentPath = tree.pathname
  for (const directoryName of subDirectories) {
    const nextPath = window.path.join(currentPath, directoryName)
    const childFolder = currentFolder.find((f) => isPathMatch(f.pathname, nextPath))
    if (!childFolder) return
    currentPath = nextPath
    currentFolder = childFolder.folders
  }

  const index = currentFolder.findIndex((f) => isPathMatch(f.pathname, pathname))
  if (index !== -1) {
    currentFolder.splice(index, 1)
  }
}
