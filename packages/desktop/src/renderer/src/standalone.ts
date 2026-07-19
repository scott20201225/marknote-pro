import pathe from 'pathe'

const STANDALONE_USER_DATA_PATH = '/tmp/marknotepro-standalone'
const STANDALONE_VERSIONS = process.versions as unknown as Record<string, string>

type Listener = (event: unknown, ...args: unknown[]) => void

const createIpcRendererStub = (): ElectronIpcRenderer => {
  const listeners = new Map<string, Set<Listener>>()

  const on = (channel: string, listener: Listener): (() => void) => {
    const set = listeners.get(channel) ?? new Set<Listener>()
    set.add(listener)
    listeners.set(channel, set)
    return () => {
      set.delete(listener)
      if (set.size === 0) listeners.delete(channel)
    }
  }

  const once = (channel: string, listener: Listener): (() => void) => {
    let off: (() => void) | undefined
    off = on(channel, (event, ...args) => {
      off?.()
      listener(event, ...args)
    })
    return off
  }

  return {
    send: () => {},
    sendSync: (channel, ...args) => {
      if (channel === 'mt::boot-info') {
        return {
          platform: 'darwin',
          arch: 'arm64',
          versions: {},
          env: {
            NODE_ENV: 'development',
            MARKNOTEPRO_STANDALONE: '1',
            MARKNOTEPRO_VERSION_STRING:
              typeof MARKNOTEPRO_VERSION_STRING === 'string'
                ? MARKNOTEPRO_VERSION_STRING
                : 'dev'
          },
          paths: {
            resources: '',
            userData: STANDALONE_USER_DATA_PATH,
            cwd: '/',
            ripgrepBinary: ''
          },
          isUpdatable: false,
          MARKDOWN_INCLUSIONS: []
        }
      }

      if (channel === 'mt::paths::is-same-sync') {
        return args[0] === args[1]
      }

      return undefined as never
    },
    invoke: async(channel, ..._args) => {
      switch (channel) {
        case 'mt::clipboard::read-text':
          return ''
        case 'mt::clipboard::guess-file-path':
          return null
        case 'mt::cmd::exists':
        case 'mt::fs::is-directory':
        case 'mt::fs::is-executable':
        case 'mt::fs::is-file':
        case 'mt::fs::path-exists':
        case 'mt::i18n::is-supported':
        case 'mt::paths::is-image':
        case 'mt::win::is-fullscreen':
        case 'mt::win::is-maximized':
          return false
        case 'mt::fonts::list':
        case 'mt::fs::readdir':
        case 'mt::spellchecker-get-available-dictionaries':
        case 'mt::spellchecker-get-custom-dictionary-words':
        case 'mt::i18n::supported':
        case 'mt::ask-for-image-path':
          return []
        case 'mt::fs::read-file':
          return ''
        case 'mt::i18n::load':
          return {}
        case 'mt::rg::start':
          return { searchId: 'standalone-search' }
        case 'mt::keybinding-get-pref-keybindings':
          return { defaultKeybindings: new Map(), userKeybindings: new Map() }
        case 'mt::keybinding-get-keyboard-info':
          return {
            layout: { id: 'standalone', lang: 'en-US', localizedName: 'Standalone' },
            keymap: {}
          }
        case 'mt::shell::open-path':
          return ''
        default:
          return undefined as never
      }
    },
    on: (channel, listener) => on(channel as string, listener as Listener),
    once: (channel, listener) => once(channel as string, listener as Listener),
    removeAllListeners: (channel) => {
      listeners.delete(channel as string)
    }
  }
}

const createPathStub = (): PathAPI => ({
  basename: pathe.basename,
  dirname: pathe.dirname,
  extname: pathe.extname,
  join: pathe.join,
  resolve: pathe.resolve,
  relative: pathe.relative,
  isAbsolute: pathe.isAbsolute,
  normalize: pathe.normalize,
  parse: pathe.parse,
  format: pathe.format,
  sep: '/',
  delimiter: ':'
})

const createFileUtilsStub = (): FileUtilsAPI => ({
  isFile: async() => false,
  isDirectory: async() => false,
  emptyDir: async() => {},
  copy: async() => {},
  ensureDir: async() => {},
  outputFile: async() => {},
  move: async() => {},
  stat: async() =>
    ({
      isFile: () => false,
      isDirectory: () => false
    }) as unknown as FileUtilsAPI['stat'] extends (...args: never[]) => Promise<infer T> ? T : never,
  writeFile: async() => {},
  readFile: async() => '',
  md5File: async() => 'stub-md5',
  md5Data: async() => 'stub-md5',
  pathExists: async() => false,
  unlink: async() => {},
  readdir: async() => [],
  isExecutable: async() => false,
  isChildOfDirectory: (dir, child) => {
    const relative = pathe.relative(dir, child)
    return !!relative && !relative.startsWith('..') && !pathe.isAbsolute(relative)
  },
  hasMarkdownExtension: (filename) => /\.(markdown|mdown|mkdn|md|mkd|mdwn|mdtxt|mdtext|mdx|text|txt)$/i.test(filename),
  isSamePathSync: (a, b) => pathe.normalize(a) === pathe.normalize(b),
  isImageFile: async(p) => /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i.test(p),
  MARKDOWN_INCLUSIONS: []
})

export const installStandaloneBridge = (): void => {
  if (typeof window === 'undefined' || window.electron) return

  const ipcRenderer = createIpcRendererStub()
  const path = createPathStub()

  window.electron = {
    ipcRenderer,
    shell: {
      openExternal: async(url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer')
      },
      showItemInFolder: () => {},
      openPath: async() => ''
    },
    clipboard: {
      writeText: (text: string) => {
        void navigator.clipboard?.writeText?.(text)
      },
      readText: async() => {
        try {
          return await navigator.clipboard?.readText?.()
        } catch {
          return ''
        }
      },
      guessFilePath: async() => null
    },
    webFrame: {
      setZoomFactor: () => {},
      setZoomLevel: () => {}
    },
    webUtils: {
      getPathForFile: (file: File) => file.name
    },
    process: {
      platform: 'darwin',
      arch: 'arm64',
      versions: STANDALONE_VERSIONS,
      env: {
        NODE_ENV: 'development',
        MARKNOTEPRO_STANDALONE: '1',
        MARKNOTEPRO_VERSION_STRING:
          typeof MARKNOTEPRO_VERSION_STRING === 'string' ? MARKNOTEPRO_VERSION_STRING : 'dev'
      },
      resourcesPath: '',
      cwd: '/'
    },
    paths: {
      resources: '',
      userData: STANDALONE_USER_DATA_PATH,
      cwd: '/',
      ripgrepBinary: ''
    },
    isUpdatable: false,
    windowControl: {
      minimize: () => {},
      maximize: () => {},
      unmaximize: () => {},
      toggleMaximize: () => {},
      close: () => {},
      setFullScreen: () => {},
      toggleFullScreen: () => {},
      isMaximized: async() => false,
      isFullScreen: async() => false,
      popupMenu: () => {},
      popupApplicationMenu: () => {}
    }
  }

  window.fileUtils = createFileUtilsStub()
  window.path = path
  window.commandExists = {
    exists: async() => false
  }
  window.i18nUtils = {
    loadTranslations: async() => ({})
  }
  window.ripgrep = {
    start: async() => ({ searchId: 'standalone-search' }),
    cancel: () => {},
    onMatch: () => () => {},
    onProgress: () => () => {},
    onDone: () => () => {},
    onError: () => () => {},
    onCancelled: () => () => {}
  }
  window.uploader = {
    uploadImage: async() => undefined
  }
  window.fonts = {
    list: async() => []
  }
  window.rgPath = ''
  window.process = {
    platform: 'darwin',
    arch: 'arm64',
    versions: STANDALONE_VERSIONS,
    env: window.electron.process.env,
    resourcesPath: '',
    cwd: () => '/',
    nextTick: (fn: (...args: unknown[]) => void, ...args: unknown[]) =>
      window.setTimeout(() => fn(...args), 0)
  } as unknown as Window['process'] & NodeJS.Process
}

export const isStandaloneRenderer = (): boolean =>
  typeof window !== 'undefined' && Boolean(window.marknotepro?.env?.standalone)

installStandaloneBridge()
