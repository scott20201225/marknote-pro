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
import { getNoteNodeKind, toStoredNoteName } from '../util/noteWorkspace'
import type { TreeNode } from '../components/sideBar/types'
import type { FileChangeDetail } from '@shared/types/files'

type ProjectTree = TreeNode
type TreeChange = FileChangeDetail

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
  return window.fileUtils.isSamePathSync(pathname, basePath) ||
    window.fileUtils.isChildOfDirectory(basePath, pathname)
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

  const preferencesStore = usePreferencesStore()

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
        break
      case 'addDir':
        addDirectory(projectTree.value!, change)
        break
      case 'unlinkDir':
        unlinkDirectory(projectTree.value!, change)
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
      window.electron.ipcRenderer.invoke('mt::fs-trash-item', pathname)
        .then(() => {
          editorStore.CLOSE_TABS_BY_PATH(pathname, { includeDescendants: isDirectory })
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
      const { pathname: src } = activeItem.value
      clipboard.value = { type: String(type), src }
    })
    bus.on('SIDEBAR::paste', () => {
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
      SET_FOLDER_COLLAPSED_RECURSIVELY(
        activeItem.value as ProjectTree,
        true,
        { includeSelf: kind !== 'root' }
      )
      debouncedSendBufferedState()
    })
  }

  async function CREATE_FILE_DIRECTORY(name: string): Promise<void> {
    const cache = createCache.value as CreateCacheEntry
    const { dirname, type } = cache
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
    const editorStore = useEditorStore()
    const src = renameCache.value
    if (!src) return
    const dirname = window.path.dirname(src)
    const rootPath = projectTree.value?.pathname ?? null
    const kind = getNoteNodeKind(activeItem.value, rootPath)
    let storedName = name.trim()
    if (kind === 'group' || kind === 'area' || kind === 'document') {
      storedName = toStoredNoteName(name, kind)
    }
    if (!storedName) return
    const dest = dirname + PATH_SEPARATOR + storedName
    rename(src, dest).then(() => {
      if (projectTree.value) {
        const updateTree = (node: ProjectTree): void => {
          const nextPath = replacePathPrefix(node.pathname, src, dest)
          if (!window.fileUtils.isSamePathSync(nextPath, node.pathname)) {
            node.pathname = nextPath
            node.name = getBasename(nextPath)
          }
          node.folders?.forEach((child) => updateTree(child as ProjectTree))
          node.files?.forEach((child) => {
            const nextPath = replacePathPrefix(child.pathname, src, dest)
            if (!window.fileUtils.isSamePathSync(nextPath, child.pathname)) {
              child.pathname = nextPath
              child.name = getBasename(nextPath)
            }
          })
        }
        updateTree(projectTree.value)
      }

      if (activeItem.value?.pathname) {
        activeItem.value.pathname = replacePathPrefix(activeItem.value.pathname, src, dest)
        activeItem.value.name = getBasename(activeItem.value.pathname)
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
          dest: clipboard.value.dest
            ? replacePathPrefix(clipboard.value.dest, src, dest)
            : undefined
        }
      }

      if (preferencesStore.defaultDirectoryToOpen) {
        const nextDefaultDirectory = replacePathPrefix(
          preferencesStore.defaultDirectoryToOpen,
          src,
          dest
        )
        if (!window.fileUtils.isSamePathSync(nextDefaultDirectory, preferencesStore.defaultDirectoryToOpen)) {
          preferencesStore.SET_SINGLE_PREFERENCE({
            type: 'defaultDirectoryToOpen',
            value: nextDefaultDirectory
          })
        }
      }

      if (preferencesStore.lastOpenedFolder) {
        const nextLastOpenedFolder = replacePathPrefix(preferencesStore.lastOpenedFolder, src, dest)
        if (!window.fileUtils.isSamePathSync(nextLastOpenedFolder, preferencesStore.lastOpenedFolder)) {
          preferencesStore.SET_SINGLE_PREFERENCE({
            type: 'lastOpenedFolder',
            value: nextLastOpenedFolder
          })
        }
      }

      editorStore.RENAME_IF_NEEDED({ src, dest })
      renameCache.value = null
      window.electron.ipcRenderer.send('mt::sidebar-path-renamed', { src, dest })
      debouncedSendBufferedState()
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
    pendingTreeEvents,
    OPEN_PROJECT,
    CREATE_BUFFERED_STATE,
    RESTORE_BUFFERED_STATE,
    LISTEN_FOR_LOAD_PROJECT,
    LISTEN_FOR_UPDATE_PROJECT,
    CHANGE_ACTIVE_ITEM,
    CHANGE_CLIPBOARD,
    ASK_FOR_OPEN_PROJECT,
    LISTEN_FOR_SIDEBAR_CONTEXT_MENU,
    CREATE_FILE_DIRECTORY,
    RENAME_IN_SIDEBAR,
    OPEN_SETTING_WINDOW
  }
})
