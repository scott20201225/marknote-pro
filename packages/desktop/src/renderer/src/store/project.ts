import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import {
  addFile,
  unlinkFile,
  addDirectory,
  unlinkDirectory,
  resortTree,
  updateFileMtime
} from './treeCtrl'
import { usePreferencesStore } from './preferences'
import bus from '../bus'
import { create, paste, rename, type FileCreateType, type PasteOptions } from '../util/fileSystem'
import { PATH_SEPARATOR } from '../config'
import notice from '../services/notification'
import { getFileStateFromData } from './help'
import { useLayoutStore } from './layout'
import { useEditorStore } from './editor'
import { debouncedSendBufferedState } from './bufferedState'
import {
  NOTE_ATTACHMENTS_DIRECTORY,
  getNoteDisplayName,
  getNoteNodeKind,
  toStoredNoteName,
  type NoteNodeKind
} from '../util/noteWorkspace'
import type { TreeFileNode, TreeNode } from '../components/sideBar/types'
import type { FileChangeDetail } from '@shared/types/files'

type ProjectTree = TreeNode
type TreeChange = FileChangeDetail
type MoveTargetKind = Extract<NoteNodeKind, 'group' | 'area' | 'document'>

const getFolders = (node: ProjectTree | null | undefined): ProjectTree[] =>
  Array.isArray(node?.folders) ? (node.folders as ProjectTree[]) : []

const getFiles = (node: ProjectTree | null | undefined): TreeFileNode[] =>
  Array.isArray(node?.files) ? (node.files as TreeFileNode[]) : []

const ensureFolderArrays = (node: ProjectTree): void => {
  if (!Array.isArray(node.folders)) {
    node.folders = []
  }
  if (!Array.isArray(node.files)) {
    node.files = []
  }
}

const normalizeProjectRoot = (pathname: string | null | undefined): string => {
  return pathname ? window.path.normalize(pathname) : ''
}

const createProjectRoot = (pathname: string): ProjectTree | null => {
  const normalizedPathname = normalizeProjectRoot(pathname)
  if (!normalizedPathname) return null

  let name = window.path.basename(normalizedPathname)
  if (!name) {
    // Root directory such as "/" or "C:\"
    name = normalizedPathname
  }

  return {
    pathname: normalizedPathname,
    name,
    isDirectory: true,
    isFile: false,
    isMarkdown: false,
    folders: [],
    files: []
  }
}

const isSameOrDescendantPath = (pathname: string, basePath: string): boolean => {
  return (
    window.fileUtils.isSamePathSync(pathname, basePath) ||
    window.fileUtils.isChildOfDirectory(basePath, pathname)
  )
}

const replacePathPrefix = (pathname: string, src: string, dest: string): string => {
  if (!isSameOrDescendantPath(pathname, src)) return pathname
  if (window.fileUtils.isSamePathSync(pathname, src)) return dest
  const relativePath = window.path.relative(src, pathname)
  return window.path.join(dest, relativePath)
}

const getBasename = (pathname: string): string => {
  return window.path.basename(pathname) || pathname
}

interface BufferedProjectState {
  rootDirectory: string
}

const createBufferedProjectState = (state: unknown): BufferedProjectState => {
  const s = (state || {}) as { rootDirectory?: string; projectTree?: { pathname?: string } }
  return {
    rootDirectory: normalizeProjectRoot(s.rootDirectory || s.projectTree?.pathname)
  }
}

interface OpenProjectOptions {
  scheduleBufferUpdate?: boolean
}

interface CreateCacheEntry {
  dirname: string
  type: 'file' | 'directory' | string
}

interface ClipboardEntry {
  type: 'copy' | 'cut' | string
  src: string
  dest?: string
}

interface PendingEvent {
  type: string
  change: TreeChange
}

interface CollapseOptions {
  includeSelf?: boolean
}

interface NoteLikeNameCandidate {
  pathname: string
  name: string
  isDirectory?: boolean
  isFile?: boolean
  isMarkdown?: boolean
}

const findFolderNodeByPath = (
  node: ProjectTree | null | undefined,
  pathname: string
): ProjectTree | null => {
  if (!node) return null
  if (window.fileUtils.isSamePathSync(node.pathname, pathname)) return node

  for (const child of getFolders(node)) {
    const match = findFolderNodeByPath(child as ProjectTree, pathname)
    if (match) return match
  }

  return null
}

const findFileNodeByPath = (
  node: ProjectTree | null | undefined,
  pathname: string
): TreeFileNode | null => {
  if (!node) return null

  const match = getFiles(node).find((child) =>
    window.fileUtils.isSamePathSync(child.pathname, pathname)
  )
  if (match) return match

  for (const child of getFolders(node)) {
    const childMatch = findFileNodeByPath(child as ProjectTree, pathname)
    if (childMatch) return childMatch
  }

  return null
}

const takeFolderNode = (
  node: ProjectTree | null | undefined,
  pathname: string
): ProjectTree | null => {
  if (!node) return null

  const folders = getFolders(node)
  const index = folders.findIndex((child) =>
    window.fileUtils.isSamePathSync(child.pathname, pathname)
  )
  if (index >= 0) {
    return folders.splice(index, 1)[0] as ProjectTree
  }

  for (const child of folders) {
    const match = takeFolderNode(child as ProjectTree, pathname)
    if (match) return match
  }

  return null
}

const takeFileNode = (
  node: ProjectTree | null | undefined,
  pathname: string
): TreeFileNode | null => {
  if (!node) return null

  const files = getFiles(node)
  const index = files.findIndex((child) =>
    window.fileUtils.isSamePathSync(child.pathname, pathname)
  )
  if (index >= 0) {
    return files.splice(index, 1)[0] as TreeFileNode
  }

  for (const child of getFolders(node)) {
    const match = takeFileNode(child as ProjectTree, pathname)
    if (match) return match
  }

  return null
}

const remapFolderNodePaths = (node: ProjectTree, src: string, dest: string): void => {
  ensureFolderArrays(node)
  const nextPath = replacePathPrefix(node.pathname, src, dest)
  if (!window.fileUtils.isSamePathSync(nextPath, node.pathname)) {
    node.pathname = nextPath
    node.name = getBasename(nextPath)
  }

  getFolders(node).forEach((child) => remapFolderNodePaths(child as ProjectTree, src, dest))
  getFiles(node).forEach((child) => {
    const nextFilePath = replacePathPrefix(child.pathname, src, dest)
    if (!window.fileUtils.isSamePathSync(nextFilePath, child.pathname)) {
      child.pathname = nextFilePath
      child.name = getBasename(nextFilePath)
    }
  })
}

const remapFileNodePath = (node: TreeFileNode, src: string, dest: string): void => {
  const nextPath = replacePathPrefix(node.pathname, src, dest)
  if (!window.fileUtils.isSamePathSync(nextPath, node.pathname)) {
    node.pathname = nextPath
    node.name = getBasename(nextPath)
  }
}

const normalizeComparableNoteName = (
  item: NoteLikeNameCandidate,
  rootPath: string | null
): string => {
  return getNoteDisplayName(item, rootPath).trim().toLocaleLowerCase()
}

const createComparableNoteCandidate = (
  rawName: string,
  kind: Extract<NoteNodeKind, 'group' | 'area' | 'document'>
): NoteLikeNameCandidate | null => {
  const storedName = toStoredNoteName(rawName, kind)
  if (!storedName) return null

  if (kind === 'document') {
    return {
      pathname: storedName,
      name: storedName,
      isDirectory: false,
      isFile: true,
      isMarkdown: true
    }
  }

  return {
    pathname: storedName,
    name: storedName,
    isDirectory: true,
    isFile: false,
    isMarkdown: false
  }
}

const hasNoteDisplayNameConflict = (
  parent: ProjectTree | null | undefined,
  candidate: NoteLikeNameCandidate,
  rootPath: string | null,
  excludePath?: string | null
): boolean => {
  if (!parent) return false

  const candidateName = normalizeComparableNoteName(candidate, rootPath)
  if (!candidateName) return false

  const matches = (node: NoteLikeNameCandidate): boolean => {
    if (excludePath && window.fileUtils.isSamePathSync(node.pathname, excludePath)) {
      return false
    }
    return normalizeComparableNoteName(node, rootPath) === candidateName
  }

  return (
    getFolders(parent).some((folder) => matches(folder)) ||
    getFiles(parent).some((file) => file.isMarkdown && matches(file))
  )
}

export const useProjectStore = defineStore('project', () => {
  // Heterogeneous UI state: assigned file nodes, folder nodes, and the empty
  // "no selection" object/null across sidebar components; a single non-`any`
  // union breaks both the assignments and the field reads, so it stays a hatch.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeItem = ref<any>({})
  const createCache = ref<CreateCacheEntry | Record<string, never>>({})
  const newFileNameCache = ref<string>('')
  const renameCache = ref<string | null>(null)
  const clipboard = ref<ClipboardEntry | null>(null)
  const projectTree = ref<ProjectTree | null>(null)
  const pendingTreeEvents = ref<PendingEvent[]>([])
  const selectedNotePath = ref<string | null>(null)
  const moveDialogVisible = ref(false)
  const moveDialogSourcePath = ref<string | null>(null)
  const moveDialogSourceKind = ref<MoveTargetKind | null>(null)

  const preferencesStore = usePreferencesStore()

  const syncPathReferencesAfterMove = (src: string, dest: string): void => {
    const editorStore = useEditorStore()

    if (activeItem.value?.pathname) {
      activeItem.value.pathname = replacePathPrefix(activeItem.value.pathname, src, dest)
      activeItem.value.name = getBasename(activeItem.value.pathname)
    }

    if (selectedNotePath.value) {
      selectedNotePath.value = replacePathPrefix(selectedNotePath.value, src, dest)
    }

    const createCacheValue = createCache.value as CreateCacheEntry
    if (createCacheValue.dirname) {
      createCache.value = {
        ...createCacheValue,
        dirname: replacePathPrefix(createCacheValue.dirname, src, dest)
      }
    }

    if (clipboard.value) {
      clipboard.value = {
        ...clipboard.value,
        src: replacePathPrefix(clipboard.value.src, src, dest),
        dest: clipboard.value.dest ? replacePathPrefix(clipboard.value.dest, src, dest) : undefined
      }
    }

    editorStore.RENAME_IF_NEEDED({ src, dest })
    window.electron.ipcRenderer.send('mt::sidebar-path-renamed', { src, dest })
    debouncedSendBufferedState()
  }

  const isPathAffectedByDelete = (
    pathname: string,
    deletedPath: string,
    isDirectory: boolean
  ): boolean => {
    return isDirectory
      ? isSameOrDescendantPath(pathname, deletedPath)
      : window.fileUtils.isSamePathSync(pathname, deletedPath)
  }

  const removeDeletedPathFromTree = (pathname: string, isDirectory: boolean): boolean => {
    if (!projectTree.value) return false
    return isDirectory
      ? !!takeFolderNode(projectTree.value, pathname)
      : !!takeFileNode(projectTree.value, pathname)
  }

  const hasDeletedPathInTree = (pathname: string, isDirectory: boolean): boolean => {
    if (!projectTree.value) return false
    return isDirectory
      ? !!findFolderNodeByPath(projectTree.value, pathname)
      : !!findFileNodeByPath(projectTree.value, pathname)
  }

  const syncPathReferencesAfterDelete = (pathname: string, isDirectory: boolean): void => {
    const rootPath = projectTree.value?.pathname ?? null

    if (
      activeItem.value?.pathname &&
      isPathAffectedByDelete(activeItem.value.pathname, pathname, isDirectory)
    ) {
      activeItem.value = projectTree.value ?? {}
    }

    if (
      selectedNotePath.value &&
      isPathAffectedByDelete(selectedNotePath.value, pathname, isDirectory)
    ) {
      selectedNotePath.value = rootPath
    }

    const createCacheValue = createCache.value as CreateCacheEntry
    if (
      createCacheValue.dirname &&
      isPathAffectedByDelete(createCacheValue.dirname, pathname, isDirectory)
    ) {
      createCache.value = {}
    }

    if (
      clipboard.value &&
      ((clipboard.value.src &&
        isPathAffectedByDelete(clipboard.value.src, pathname, isDirectory)) ||
        (clipboard.value.dest &&
          isPathAffectedByDelete(clipboard.value.dest, pathname, isDirectory)))
    ) {
      clipboard.value = null
    }

    debouncedSendBufferedState()
  }

  const duplicateActiveDocument = async (): Promise<void> => {
    const rootPath = projectTree.value?.pathname ?? null
    const kind = getNoteNodeKind(activeItem.value, rootPath)
    if (kind !== 'document') return

    const src = String(activeItem.value?.pathname || '')
    if (!src) return

    const dirname = window.path.dirname(src)
    const parsed = window.path.parse(src)
    let index = 1
    let dest = ''

    while (!dest) {
      const candidate = window.path.join(dirname, `${parsed.name}(${index})${parsed.ext}`)
      if (!(await window.fileUtils.pathExists(candidate))) {
        dest = candidate
      } else {
        index += 1
      }
    }

    await window.fileUtils.copy(src, dest)

    const stat = await window.fileUtils.stat(dest)
    addFile(
      projectTree.value!,
      {
        pathname: dest,
        name: getBasename(dest),
        birthTime: stat.mtimeMs ?? Date.now(),
        mtimeMs: stat.mtimeMs ?? Date.now(),
        isDirectory: false,
        isFile: true,
        isMarkdown: true
      },
      String(preferencesStore.fileSortBy),
      String(preferencesStore.fileSortOrder)
    )
  }

  const getMoveSource = (): { kind: MoveTargetKind; pathname: string } | null => {
    const rootPath = projectTree.value?.pathname ?? null
    const kind = getNoteNodeKind(activeItem.value, rootPath)
    if (kind !== 'group' && kind !== 'area' && kind !== 'document') return null

    const pathname = String(activeItem.value?.pathname || '')
    if (!pathname) return null

    return { kind, pathname }
  }

  const openMoveDialog = (): void => {
    const source = getMoveSource()
    if (!source) return

    moveDialogSourceKind.value = source.kind
    moveDialogSourcePath.value = source.pathname
    moveDialogVisible.value = true
  }

  const closeMoveDialog = (): void => {
    moveDialogVisible.value = false
    moveDialogSourcePath.value = null
    moveDialogSourceKind.value = null
  }

  const moveActiveItemTo = async (targetPath: string): Promise<void> => {
    try {
      if (!moveDialogSourcePath.value || !moveDialogSourceKind.value || !projectTree.value) return

      const kind = moveDialogSourceKind.value
      const src = moveDialogSourcePath.value
      const rootPath = projectTree.value.pathname
      const normalizedTarget = normalizeProjectRoot(targetPath)
      if (!normalizedTarget) return

      const sourceNode =
        kind === 'document'
          ? findFileNodeByPath(projectTree.value, src)
          : findFolderNodeByPath(projectTree.value, src)
      if (!sourceNode) {
        notice.notify({
          title: 'Move Forbidden',
          type: 'warning',
          message: 'The selected item no longer exists.'
        })
        return
      }

      const targetKind = getNoteNodeKind(
        findFolderNodeByPath(projectTree.value, normalizedTarget),
        projectTree.value.pathname
      )
      const targetFolder = findFolderNodeByPath(projectTree.value, normalizedTarget)
      const isValidTarget =
        kind === 'document'
          ? targetKind === 'area'
          : kind === 'group'
            ? targetKind === 'root' || targetKind === 'group'
            : targetKind === 'group'

      if (!isValidTarget) {
        notice.notify({
          title: 'Move Forbidden',
          type: 'warning',
          message: 'The selected target is not valid for this item.'
        })
        return
      }

      if (!targetFolder) return

      if ((kind === 'group' || kind === 'area') && isSameOrDescendantPath(normalizedTarget, src)) {
        notice.notify({
          title: 'Move Forbidden',
          type: 'warning',
          message:
            kind === 'group'
              ? 'A group cannot be moved into itself or one of its descendants.'
              : 'An area cannot be moved into itself or one of its descendants.'
        })
        return
      }

      if (hasNoteDisplayNameConflict(targetFolder, sourceNode, projectTree.value.pathname, src)) {
        notice.notify({
          title: 'Move Forbidden',
          type: 'warning',
          message: `A note item named "${getNoteDisplayName(sourceNode, projectTree.value.pathname)}" already exists in the target location.`
        })
        return
      }

      const dest = window.path.join(normalizedTarget, window.path.basename(src))
      if (window.fileUtils.isSamePathSync(src, dest)) {
        closeMoveDialog()
        return
      }

      if (await window.fileUtils.pathExists(dest)) {
        notice.notify({
          title: 'Move Forbidden',
          type: 'warning',
          message: `A node named "${window.path.basename(dest)}" already exists in the target location.`
        })
        return
      }

      await window.fileUtils.move(src, dest)

      if (window.electron.process.platform === 'win32') {
        syncPathReferencesAfterMove(src, dest)
        closeMoveDialog()
        window.electron.ipcRenderer.send('mt::reload-workspace', rootPath)
        return
      }

      if (kind === 'document') {
        const movedFile = takeFileNode(projectTree.value, src)
        if (!movedFile) {
          closeMoveDialog()
          window.electron.ipcRenderer.send('mt::reload-workspace', rootPath)
          return
        }
        remapFileNodePath(movedFile, src, dest)
        ensureFolderArrays(targetFolder)
        targetFolder.files.push(movedFile)
      } else {
        const movedFolder = takeFolderNode(projectTree.value, src)
        if (!movedFolder) {
          closeMoveDialog()
          window.electron.ipcRenderer.send('mt::reload-workspace', rootPath)
          return
        }
        remapFolderNodePaths(movedFolder, src, dest)
        ensureFolderArrays(targetFolder)
        targetFolder.folders.push(movedFolder)
      }

      resortTree(
        projectTree.value,
        String(preferencesStore.fileSortBy),
        String(preferencesStore.fileSortOrder)
      )

      if (preferencesStore.defaultDirectoryToOpen) {
        const nextDefaultDirectory = replacePathPrefix(
          preferencesStore.defaultDirectoryToOpen,
          src,
          dest
        )
        if (
          !window.fileUtils.isSamePathSync(
            nextDefaultDirectory,
            preferencesStore.defaultDirectoryToOpen
          )
        ) {
          preferencesStore.SET_SINGLE_PREFERENCE({
            type: 'defaultDirectoryToOpen',
            value: nextDefaultDirectory
          })
        }
      }

      if (preferencesStore.lastOpenedFolder) {
        const nextLastOpenedFolder = replacePathPrefix(preferencesStore.lastOpenedFolder, src, dest)
        if (
          !window.fileUtils.isSamePathSync(nextLastOpenedFolder, preferencesStore.lastOpenedFolder)
        ) {
          preferencesStore.SET_SINGLE_PREFERENCE({
            type: 'lastOpenedFolder',
            value: nextLastOpenedFolder
          })
        }
      }

      syncPathReferencesAfterMove(src, dest)
      closeMoveDialog()
    } catch (err) {
      notice.notify({
        title: 'Error while moving',
        type: 'error',
        message: err instanceof Error ? err.message : String(err)
      })
    }
  }

  watch(
    [() => preferencesStore.fileSortBy, () => preferencesStore.fileSortOrder],
    ([sortBy, sortOrder]) => {
      if (projectTree.value) {
        resortTree(projectTree.value, String(sortBy), String(sortOrder))
      }
    }
  )

  function OPEN_PROJECT(
    pathname: string,
    { scheduleBufferUpdate = true }: OpenProjectOptions = {}
  ): void {
    const layoutStore = useLayoutStore()
    const tree = createProjectRoot(pathname)
    if (!tree) return

    projectTree.value = tree
    selectedNotePath.value = tree.pathname
    void window.fileUtils.ensureDir(window.path.join(tree.pathname, NOTE_ATTACHMENTS_DIRECTORY))

    const layout = {
      rightColumn: 'files'
    }
    layoutStore.SET_LAYOUT(layout, { scheduleBufferUpdate })
    layoutStore.DISPATCH_LAYOUT_MENU_ITEMS()

    // Process pending events that arrived before projectTree was initialized.
    for (const event of pendingTreeEvents.value) {
      _processTreeEvent(event.type, event.change)
    }
    pendingTreeEvents.value = []

    if (scheduleBufferUpdate) {
      debouncedSendBufferedState()
    }
  }

  function CREATE_BUFFERED_STATE(): BufferedProjectState {
    return createBufferedProjectState({
      projectTree: projectTree.value
    })
  }

  function RESTORE_BUFFERED_STATE(state: unknown): void {
    const { rootDirectory } = createBufferedProjectState(state)
    if (rootDirectory) {
      if (projectTree.value?.pathname === rootDirectory) return
      OPEN_PROJECT(rootDirectory, { scheduleBufferUpdate: false })
    } else {
      projectTree.value = null
      pendingTreeEvents.value = []
      selectedNotePath.value = null
    }
  }

  function LISTEN_FOR_LOAD_PROJECT(): void {
    window.electron.ipcRenderer.on('mt::open-directory', (_e, pathname) => {
      OPEN_PROJECT(String(pathname))
    })
  }

  function LISTEN_FOR_UPDATE_PROJECT(): void {
    window.electron.ipcRenderer.on('mt::update-object-tree', (_e, payload) => {
      const { type, change } = (payload as { type: string; change: TreeChange }) ?? {}
      if (!projectTree.value) {
        pendingTreeEvents.value.push({ type, change })
        return
      }
      _processTreeEvent(type, change)
    })
  }

  function _processTreeEvent(type: string, change: TreeChange): void {
    const editorStore = useEditorStore()
    const fallbackSelectedNotePath = projectTree.value?.pathname ?? null
    switch (type) {
      case 'add': {
        const { pathname, data, isMarkdown } = change
        addFile(
          projectTree.value!,
          change as Parameters<typeof addFile>[1],
          String(preferencesStore.fileSortBy),
          String(preferencesStore.fileSortOrder)
        )
        if (isMarkdown && newFileNameCache.value && pathname === newFileNameCache.value) {
          const fileState = getFileStateFromData(data as Record<string, unknown>)
          editorStore.UPDATE_CURRENT_FILE(fileState)
          newFileNameCache.value = ''
        }
        break
      }
      case 'unlink':
        unlinkFile(projectTree.value!, change)
        editorStore.SET_SAVE_STATUS_WHEN_REMOVE(change)
        if (
          selectedNotePath.value &&
          change?.pathname &&
          window.fileUtils.isSamePathSync(selectedNotePath.value, change.pathname)
        ) {
          selectedNotePath.value = fallbackSelectedNotePath
        }
        break
      case 'addDir':
        addDirectory(projectTree.value!, change)
        break
      case 'unlinkDir':
        unlinkDirectory(projectTree.value!, change)
        if (
          selectedNotePath.value &&
          change?.pathname &&
          isSameOrDescendantPath(selectedNotePath.value, change.pathname)
        ) {
          selectedNotePath.value = fallbackSelectedNotePath
        }
        break
      case 'change':
        if (change?.mtimeMs !== undefined) {
          updateFileMtime(
            projectTree.value!,
            change as Parameters<typeof updateFileMtime>[1],
            String(preferencesStore.fileSortBy),
            String(preferencesStore.fileSortOrder)
          )
        }
        break
      default:
        if (window.electron?.process?.env?.NODE_ENV === 'development') {
          console.log(`Unknown directory watch type: "${type}"`)
        }
        break
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function CHANGE_ACTIVE_ITEM(item: any): void {
    activeItem.value = item
  }

  function SELECT_NOTE_PATH(pathname: string | null): void {
    if (!projectTree.value) {
      selectedNotePath.value = null
      return
    }

    if (!pathname) {
      selectedNotePath.value = projectTree.value.pathname
      return
    }

    if (!isSameOrDescendantPath(pathname, projectTree.value.pathname)) {
      selectedNotePath.value = projectTree.value.pathname
      return
    }

    selectedNotePath.value = pathname
  }

  function CHANGE_CLIPBOARD(data: ClipboardEntry | null): void {
    clipboard.value = data
  }

  function SET_FOLDER_COLLAPSED_RECURSIVELY(
    node: ProjectTree | null | undefined,
    collapsed: boolean,
    { includeSelf = true }: CollapseOptions = {}
  ): void {
    if (!node) return

    if (includeSelf) {
      node.isCollapsed = collapsed
    }

    node.folders.forEach((child) => {
      child.isCollapsed = collapsed
      SET_FOLDER_COLLAPSED_RECURSIVELY(child, collapsed, { includeSelf: false })
    })
  }

  function ASK_FOR_OPEN_PROJECT(): void {
    const defaultPath =
      preferencesStore.defaultDirectoryToOpen ||
      preferencesStore.lastOpenedFolder ||
      projectTree.value?.pathname ||
      ''
    window.electron.ipcRenderer.send('mt::ask-for-open-project-in-sidebar', { defaultPath })
  }

  function LISTEN_FOR_SIDEBAR_CONTEXT_MENU(): void {
    const editorStore = useEditorStore()

    bus.on('SIDEBAR::show-in-folder', () => {
      const { pathname } = activeItem.value
      window.electron.shell.showItemInFolder(pathname)
    })
    bus.on('SIDEBAR::new', (type: unknown) => {
      const { pathname, isDirectory } = activeItem.value
      const dirname = isDirectory ? pathname : window.path.dirname(pathname)
      createCache.value = { dirname, type: String(type) }
      bus.emit('SIDEBAR::show-new-input')
    })
    bus.on('SIDEBAR::remove', () => {
      const { pathname } = activeItem.value
      const isDirectory = !!activeItem.value?.isDirectory
      window.electron.ipcRenderer
        .invoke('mt::fs-trash-item', pathname)
        .then(() => {
          editorStore.CLOSE_TABS_BY_PATH(pathname, { includeDescendants: isDirectory })
          removeDeletedPathFromTree(pathname, isDirectory)
          syncPathReferencesAfterDelete(pathname, isDirectory)
          if (hasDeletedPathInTree(pathname, isDirectory) && projectTree.value?.pathname) {
            window.electron.ipcRenderer.send('mt::reload-workspace', projectTree.value.pathname)
          }
        })
        .catch((err) => {
          notice.notify({
            title: 'Error while deleting',
            type: 'error',
            message: err instanceof Error ? err.message : String(err)
          })
        })
    })
    bus.on('SIDEBAR::copy-cut', (type: unknown) => {
      const rootPath = projectTree.value?.pathname ?? null
      const kind = getNoteNodeKind(activeItem.value, rootPath)

      if (kind === 'document' && String(type) === 'copy') {
        void duplicateActiveDocument().catch((err) => {
          notice.notify({
            title: 'Error while copying',
            type: 'error',
            message: err instanceof Error ? err.message : String(err)
          })
        })
        return
      }

      const { pathname: src } = activeItem.value
      clipboard.value = { type: String(type), src }
    })
    bus.on('SIDEBAR::paste', () => {
      const rootPath = projectTree.value?.pathname ?? null
      const kind = getNoteNodeKind(activeItem.value, rootPath)
      if (kind === 'root' || kind === 'group' || kind === 'area' || kind === 'document') {
        return
      }

      const cb = clipboard.value
      const { pathname, isDirectory } = activeItem.value
      const dirname = isDirectory ? pathname : window.path.dirname(pathname)
      if (cb && cb.src) {
        cb.dest = dirname + PATH_SEPARATOR + window.path.basename(cb.src)

        if (window.path.normalize(cb.src) === window.path.normalize(cb.dest)) {
          notice.notify({
            title: 'Paste Forbidden',
            type: 'warning',
            message: 'Source and destination must not be the same.'
          })
          return
        }

        paste(cb as PasteOptions)
          .then(() => {
            clipboard.value = null
          })
          .catch((err) => {
            notice.notify({
              title: 'Error while pasting',
              type: 'error',
              message: err instanceof Error ? err.message : String(err)
            })
          })
      }
    })
    bus.on('SIDEBAR::move-to', () => {
      openMoveDialog()
    })
    bus.on('SIDEBAR::rename', () => {
      const { pathname } = activeItem.value
      renameCache.value = pathname
      bus.emit('SIDEBAR::show-rename-input')
    })
    bus.on('SIDEBAR::expand-all', () => {
      const rootPath = projectTree.value?.pathname ?? null
      const kind = getNoteNodeKind(activeItem.value, rootPath)
      if (kind !== 'root' && kind !== 'group' && kind !== 'area') return
      SET_FOLDER_COLLAPSED_RECURSIVELY(activeItem.value as ProjectTree, false)
      debouncedSendBufferedState()
    })
    bus.on('SIDEBAR::collapse-all', () => {
      const rootPath = projectTree.value?.pathname ?? null
      const kind = getNoteNodeKind(activeItem.value, rootPath)
      if (kind !== 'root' && kind !== 'group' && kind !== 'area') return
      SET_FOLDER_COLLAPSED_RECURSIVELY(activeItem.value as ProjectTree, true, {
        includeSelf: kind !== 'root'
      })
      debouncedSendBufferedState()
    })
    bus.on('SIDEBAR::reload-workspace', () => {
      const pathname = projectTree.value?.pathname
      if (!pathname) return
      editorStore.CLOSE_ALL_TABS()
      window.electron.ipcRenderer.send('mt::reload-workspace', pathname)
    })
  }

  async function CREATE_FILE_DIRECTORY(name: string): Promise<void> {
    const cache = createCache.value as CreateCacheEntry
    const { dirname, type } = cache
    const rootPath = projectTree.value?.pathname ?? null
    const parentNode = findFolderNodeByPath(projectTree.value, dirname)
    let fileType: FileCreateType = 'directory'
    let storedName = name.trim()

    if (type === 'group') {
      storedName = toStoredNoteName(name, 'group')
    } else if (type === 'area') {
      storedName = toStoredNoteName(name, 'area')
    } else if (type === 'document') {
      storedName = toStoredNoteName(name, 'document')
      fileType = 'file'
    } else if (type === 'file') {
      fileType = 'file'
      storedName = name.trim()
      if (!window.fileUtils.hasMarkdownExtension(storedName)) {
        storedName += '.md'
      }
    } else {
      fileType = 'directory'
    }

    if (!storedName) {
      createCache.value = {}
      return
    }

    if (type === 'group' || type === 'area' || type === 'document') {
      const candidate = createComparableNoteCandidate(name, type)
      if (candidate && hasNoteDisplayNameConflict(parentNode, candidate, rootPath)) {
        createCache.value = {}
        notice.notify({
          title: 'Error in Side Bar',
          type: 'error',
          message: `A note item named "${getNoteDisplayName(candidate, rootPath)}" already exists in this location.`
        })
        return
      }
    }

    const fullName = window.path.join(dirname, storedName)

    // Creating over an existing path would silently overwrite it (outputFile
    // truncates). Refuse instead of destroying the existing file (#1946).
    if (await window.fileUtils.pathExists(fullName)) {
      createCache.value = {}
      notice.notify({
        title: 'Error in Side Bar',
        type: 'error',
        message: `A ${type} named "${storedName}" already exists in this folder.`
      })
      return
    }

    create(fullName, fileType)
      .then(() => {
        createCache.value = {}
        if (fileType === 'file') {
          newFileNameCache.value = fullName
        }
      })
      .catch((err) => {
        notice.notify({
          title: 'Error in Side Bar',
          type: 'error',
          message: err instanceof Error ? err.message : String(err)
        })
      })
  }

  function RENAME_IN_SIDEBAR(name: string): void {
    const src = renameCache.value
    if (!src) return
    const dirname = window.path.dirname(src)
    const rootPath = projectTree.value?.pathname ?? null
    const parentNode = findFolderNodeByPath(projectTree.value, dirname)
    const kind = getNoteNodeKind(activeItem.value, rootPath)
    let storedName = name.trim()
    if (kind === 'group' || kind === 'area' || kind === 'document') {
      const candidate = createComparableNoteCandidate(name, kind)
      if (candidate && hasNoteDisplayNameConflict(parentNode, candidate, rootPath, src)) {
        notice.notify({
          title: 'Rename Forbidden',
          type: 'warning',
          message: `A note item named "${getNoteDisplayName(candidate, rootPath)}" already exists in this location.`
        })
        return
      }
      storedName = toStoredNoteName(name, kind)
    }
    if (!storedName) return
    const dest = dirname + PATH_SEPARATOR + storedName
    rename(src, dest).then(() => {
      if (projectTree.value) {
        remapFolderNodePaths(projectTree.value, src, dest)
      }

      if (preferencesStore.defaultDirectoryToOpen) {
        const nextDefaultDirectory = replacePathPrefix(
          preferencesStore.defaultDirectoryToOpen,
          src,
          dest
        )
        if (
          !window.fileUtils.isSamePathSync(
            nextDefaultDirectory,
            preferencesStore.defaultDirectoryToOpen
          )
        ) {
          preferencesStore.SET_SINGLE_PREFERENCE({
            type: 'defaultDirectoryToOpen',
            value: nextDefaultDirectory
          })
        }
      }

      if (preferencesStore.lastOpenedFolder) {
        const nextLastOpenedFolder = replacePathPrefix(preferencesStore.lastOpenedFolder, src, dest)
        if (
          !window.fileUtils.isSamePathSync(nextLastOpenedFolder, preferencesStore.lastOpenedFolder)
        ) {
          preferencesStore.SET_SINGLE_PREFERENCE({
            type: 'lastOpenedFolder',
            value: nextLastOpenedFolder
          })
        }
      }

      renameCache.value = null
      syncPathReferencesAfterMove(src, dest)
    })
  }

  function OPEN_SETTING_WINDOW(): void {
    window.electron.ipcRenderer.send('mt::open-setting-window')
  }

  return {
    activeItem,
    createCache,
    newFileNameCache,
    renameCache,
    clipboard,
    projectTree,
    selectedNotePath,
    moveDialogVisible,
    moveDialogSourcePath,
    moveDialogSourceKind,
    pendingTreeEvents,
    OPEN_PROJECT,
    CREATE_BUFFERED_STATE,
    RESTORE_BUFFERED_STATE,
    LISTEN_FOR_LOAD_PROJECT,
    LISTEN_FOR_UPDATE_PROJECT,
    CHANGE_ACTIVE_ITEM,
    SELECT_NOTE_PATH,
    CHANGE_CLIPBOARD,
    ASK_FOR_OPEN_PROJECT,
    LISTEN_FOR_SIDEBAR_CONTEXT_MENU,
    CREATE_FILE_DIRECTORY,
    RENAME_IN_SIDEBAR,
    MOVE_ACTIVE_ITEM_TO: moveActiveItemTo,
    CLOSE_MOVE_DIALOG: closeMoveDialog,
    OPEN_SETTING_WINDOW
  }
})
