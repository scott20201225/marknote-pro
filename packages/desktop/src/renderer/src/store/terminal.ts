import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  ITerminalConnectionConfig,
  ITerminalSessionInfo,
  IHardwareStats,
  ISftpTransferProgress
} from '@shared/types/terminal'

export interface ITwoFactorPrompt {
  sessionId: string
  promptId: string
  prompt: string
  instruction?: string
}

export const useTerminalStore = defineStore('terminal', () => {
  const sessions = ref<ITerminalSessionInfo[]>([])
  const activeSessionId = ref<string>('')
  const savedServers = ref<ITerminalConnectionConfig[]>([])
  const sessionStats = ref<Record<string, IHardwareStats>>({})
  const pending2fa = ref<ITwoFactorPrompt | null>(null)
  const is2faDialogOpen = ref(false)

  // Settings
  const fontFamily = ref(localStorage.getItem('mt::term:fontFamily') || 'Menlo, Monaco, Consolas, "Courier New", monospace')
  const fontSize = ref(Number(localStorage.getItem('mt::term:fontSize')) || 13)
  const cursorBlink = ref(localStorage.getItem('mt::term:cursorBlink') !== 'false')
  const scrollback = ref(Number(localStorage.getItem('mt::term:scrollback')) || 5000)
  const selectedThemeName = ref(localStorage.getItem('mt::term:theme') || 'auto')

  // SFTP Drawer state: session-isolated map (sessionId -> boolean)
  const sftpDrawerOpenMap = ref<Record<string, boolean>>({})
  const sftpEverOpenedMap = ref<Record<string, boolean>>({})
  const sftpTransfers = ref<ISftpTransferProgress[]>([])

  function isSftpOpen(sessionId: string): boolean {
    if (!sessionId) return false
    return Boolean(sftpDrawerOpenMap.value[sessionId])
  }

  function hasEverOpenedSftp(sessionId: string): boolean {
    if (!sessionId) return false
    return Boolean(sftpEverOpenedMap.value[sessionId])
  }

  function toggleSftp(sessionId: string): void {
    if (!sessionId) return
    const next = !sftpDrawerOpenMap.value[sessionId]
    sftpDrawerOpenMap.value = {
      ...sftpDrawerOpenMap.value,
      [sessionId]: next
    }
    if (next) {
      sftpEverOpenedMap.value = {
        ...sftpEverOpenedMap.value,
        [sessionId]: true
      }
    }
  }

  function setSftpOpen(sessionId: string, open: boolean): void {
    if (!sessionId) return
    sftpDrawerOpenMap.value = {
      ...sftpDrawerOpenMap.value,
      [sessionId]: open
    }
    if (open) {
      sftpEverOpenedMap.value = {
        ...sftpEverOpenedMap.value,
        [sessionId]: true
      }
    }
  }

  // Data event listeners map: sessionId -> Set<(data: string) => void>
  const dataListeners = new Map<string, Set<(data: string) => void>>()
  const sessionDataBuffers = new Map<string, string[]>()

  let isInitialized = false

  function initIpcListeners(): void {
    if (isInitialized) return
    isInitialized = true

    // Listen for terminal data
    window.electron.ipcRenderer.on('mt::terminal:data', (_event, { sessionId, data }: { sessionId: string; data: string }) => {
      const listeners = dataListeners.get(sessionId)
      if (listeners && listeners.size > 0) {
        listeners.forEach((fn) => fn(data))
      } else {
        if (!sessionDataBuffers.has(sessionId)) {
          sessionDataBuffers.set(sessionId, [])
        }
        sessionDataBuffers.get(sessionId)!.push(data)
      }
    })

    // Listen for session status updates
    window.electron.ipcRenderer.on('mt::terminal:status', (_event, info: ITerminalSessionInfo) => {
      const index = sessions.value.findIndex((s) => s.id === info.id)
      if (index >= 0) {
        sessions.value[index] = { ...sessions.value[index], ...info }
      }
    })

    // Listen for hardware stats
    window.electron.ipcRenderer.on('mt::terminal:stats', (_event, { sessionId, stats }: { sessionId: string; stats: IHardwareStats }) => {
      sessionStats.value[sessionId] = stats
    })

    // Listen for 2FA prompt
    window.electron.ipcRenderer.on('mt::terminal:2fa-prompt', (_event, promptPayload: ITwoFactorPrompt) => {
      pending2fa.value = promptPayload
      is2faDialogOpen.value = true
    })

    // Listen for SFTP progress
    window.electron.ipcRenderer.on('mt::terminal:sftp-progress', (_event, { progress }: { sessionId: string; progress: ISftpTransferProgress }) => {
      const existingIdx = sftpTransfers.value.findIndex((t) => t.id === progress.id)
      if (existingIdx >= 0) {
        sftpTransfers.value[existingIdx] = progress
      } else {
        sftpTransfers.value.push(progress)
      }
    })
  }

  function registerDataListener(sessionId: string, fn: (data: string) => void): () => void {
    if (!dataListeners.has(sessionId)) {
      dataListeners.set(sessionId, new Set())
    }
    dataListeners.get(sessionId)!.add(fn)

    // Replay any buffered chunks
    if (sessionDataBuffers.has(sessionId)) {
      const buffered = sessionDataBuffers.get(sessionId)!
      while (buffered.length > 0) {
        const chunk = buffered.shift()
        if (chunk) fn(chunk)
      }
    }

    return () => {
      dataListeners.get(sessionId)?.delete(fn)
    }
  }

  async function loadSavedServers(): Promise<void> {
    try {
      const list = await window.electron.ipcRenderer.invoke('mt::terminal:get-stored-servers')
      savedServers.value = list || []
    } catch (e) {
      console.error('Failed to load saved servers:', e)
    }
  }

  async function saveServer(config: ITerminalConnectionConfig): Promise<ITerminalConnectionConfig> {
    const cleanConfig = JSON.parse(JSON.stringify(config))
    const saved = await window.electron.ipcRenderer.invoke('mt::terminal:save-stored-server', cleanConfig)
    await loadSavedServers()
    return saved
  }

  async function deleteServer(id: string): Promise<void> {
    await window.electron.ipcRenderer.invoke('mt::terminal:delete-stored-server', id)
    await loadSavedServers()
  }

  async function testLatency(host: string, port = 22): Promise<number> {
    return window.electron.ipcRenderer.invoke('mt::terminal:test-latency', host, port)
  }

  async function connect(config: ITerminalConnectionConfig, cols = 80, rows = 24, existingSessionId?: string): Promise<ITerminalSessionInfo> {
    initIpcListeners()
    const cleanConfig = JSON.parse(JSON.stringify(config))
    const sessionInfo = await window.electron.ipcRenderer.invoke('mt::terminal:connect', cleanConfig, cols, rows, existingSessionId)
    if (existingSessionId) {
      const idx = sessions.value.findIndex((s) => s.id === existingSessionId)
      if (idx >= 0) {
        sessions.value[idx] = { ...sessions.value[idx], ...sessionInfo, status: 'connecting', error: undefined }
      } else {
        sessions.value.push(sessionInfo)
      }
    } else {
      sessions.value.push(sessionInfo)
      activeSessionId.value = sessionInfo.id
    }
    return sessionInfo
  }

  async function reconnect(sessionId: string): Promise<ITerminalSessionInfo | void> {
    const session = sessions.value.find((s) => s.id === sessionId)
    if (!session) return
    session.status = 'connecting'
    session.error = undefined
    return connect(session.config, 80, 24, sessionId)
  }

  function write(sessionId: string, data: string): void {
    window.electron.ipcRenderer.send('mt::terminal:write', { sessionId, data })
  }

  function resize(sessionId: string, cols: number, rows: number): void {
    window.electron.ipcRenderer.send('mt::terminal:resize', { sessionId, cols, rows })
  }

  async function disconnect(sessionId: string): Promise<void> {
    try {
      await window.electron.ipcRenderer.invoke('mt::terminal:disconnect', sessionId)
    } finally {
      const index = sessions.value.findIndex((s) => s.id === sessionId)
      if (index >= 0) {
        sessions.value.splice(index, 1)
      }
      delete sessionStats.value[sessionId]
      dataListeners.delete(sessionId)

      if (activeSessionId.value === sessionId) {
        activeSessionId.value = sessions.value.length > 0 ? sessions.value[sessions.value.length - 1].id : ''
      }
      delete sftpDrawerOpenMap.value[sessionId]
      delete sftpEverOpenedMap.value[sessionId]
    }
  }

  function send2faAnswer(promptId: string, code: string): void {
    window.electron.ipcRenderer.send('mt::terminal:2fa-answer', { promptId, code })
    is2faDialogOpen.value = false
    pending2fa.value = null
  }

  function setPreference(key: 'fontFamily' | 'fontSize' | 'cursorBlink' | 'scrollback' | 'theme', val: any): void {
    if (key === 'fontFamily') {
      fontFamily.value = val
      localStorage.setItem('mt::term:fontFamily', val)
    } else if (key === 'fontSize') {
      fontSize.value = Number(val)
      localStorage.setItem('mt::term:fontSize', String(val))
    } else if (key === 'cursorBlink') {
      cursorBlink.value = !!val
      localStorage.setItem('mt::term:cursorBlink', String(val))
    } else if (key === 'scrollback') {
      scrollback.value = Number(val)
      localStorage.setItem('mt::term:scrollback', String(val))
    } else if (key === 'theme') {
      selectedThemeName.value = val
      localStorage.setItem('mt::term:theme', val)
    }
  }

  const activeSession = computed(() => {
    return sessions.value.find((s) => s.id === activeSessionId.value) || null
  })

  return {
    sessions,
    activeSessionId,
    activeSession,
    savedServers,
    sessionStats,
    pending2fa,
    is2faDialogOpen,
    fontFamily,
    fontSize,
    cursorBlink,
    scrollback,
    selectedThemeName,
    sftpDrawerOpenMap,
    isSftpOpen,
    hasEverOpenedSftp,
    toggleSftp,
    setSftpOpen,
    sftpTransfers,
    initIpcListeners,
    registerDataListener,
    loadSavedServers,
    saveServer,
    deleteServer,
    testLatency,
    connect,
    reconnect,
    write,
    resize,
    disconnect,
    send2faAnswer,
    setPreference
  }
})
