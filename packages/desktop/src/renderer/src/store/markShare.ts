import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  MarkShareConfigState,
  MarkShareConflictPreview,
  MarkShareConflictStrategy,
  MarkShareDevice,
  MarkShareHistoryRecord,
  MarkShareOffer,
  MarkSharePathMode
} from '@shared/types/markShare'
import { t } from '../i18n'

export interface MarkShareDragPayload {
  paths: string[]
  isExternal: boolean
}

export const useMarkShareStore = defineStore('markShare', () => {
  const initialized = ref(false)
  const config = ref<MarkShareConfigState>({
    enabled: false,
    autoStart: false,
    defaultSaveDir: '',
    deviceId: '',
    peerKey: '',
    deviceName: '',
    deviceAlias: '',
    hostname: '',
    osType: 'darwin',
    appType: 'marknotepro',
    port: 0,
    localIps: []
  })
  const devices = ref<MarkShareDevice[]>([])
  const activeOffers = ref<MarkShareOffer[]>([])
  const history = ref<MarkShareHistoryRecord[]>([])

  // Right-click device picker modal state
  const pickerVisible = ref(false)
  const pickerPaths = ref<string[]>([])
  const pickerLabel = ref('')

  // Global / internal drag radar overlay state
  const dragRadarVisible = ref(false)
  const dragRadarPaths = ref<string[]>([])
  const dragRadarIsExternal = ref(false)

  let hideRadarTimer: ReturnType<typeof setTimeout> | null = null

  const pendingIncomingOffers = computed(() =>
    activeOffers.value.filter((o) => o.direction === 'receive' && o.state === 'pending')
  )

  const currentIncomingOffer = computed<MarkShareOffer | null>(
    () => pendingIncomingOffers.value[0] || null
  )

  const activeTransferOffers = computed(() =>
    activeOffers.value.filter(
      (o) => o.state === 'transferring' || (o.direction === 'send' && o.state === 'pending')
    )
  )

  const sendHistory = computed(() => history.value.filter((r) => r.direction === 'send'))
  const receiveHistory = computed(() => history.value.filter((r) => r.direction === 'receive'))

  async function init(): Promise<void> {
    if (initialized.value) return
    initialized.value = true

    const ipc = window.electron.ipcRenderer
    ipc.on('mt::mark-share:config-updated', (_event, nextConfig: unknown) => {
      config.value = nextConfig as MarkShareConfigState
    })
    ipc.on('mt::mark-share:devices-updated', (_event, list: unknown) => {
      devices.value = Array.isArray(list) ? (list as MarkShareDevice[]) : []
    })
    ipc.on('mt::mark-share:sessions-updated', (_event, list: unknown) => {
      activeOffers.value = Array.isArray(list) ? (list as MarkShareOffer[]) : []
    })
    ipc.on('mt::mark-share:history-updated', (_event, list: unknown) => {
      history.value = Array.isArray(list) ? (list as MarkShareHistoryRecord[]) : []
    })
    ipc.on('mt::mark-share:child-drag-enter', () => {
      showDragRadar(dragRadarPaths.value, true)
    })

    try {
      const state = (await ipc.invoke('mt::mark-share:get-state')) as {
        config: MarkShareConfigState
        devices: MarkShareDevice[]
        activeOffers: MarkShareOffer[]
        history: MarkShareHistoryRecord[]
      }
      if (state?.config) config.value = state.config
      if (Array.isArray(state?.devices)) devices.value = state.devices
      if (Array.isArray(state?.activeOffers)) activeOffers.value = state.activeOffers
      if (Array.isArray(state?.history)) history.value = state.history
    } catch (err) {
      console.warn('[MarkShareStore] Failed to load initial state:', err)
    }
  }

  function showNotice(
    type: 'success' | 'warning' | 'error' | 'info',
    message: string
  ): void {
    const clean = String(message || '').trim()
    if (!clean) return
    window.electron.ipcRenderer.send('mt::mark-share:show-notice', {
      type,
      message: clean
    })
  }

  async function setEnabled(enabled: boolean): Promise<void> {
    config.value = (await window.electron.ipcRenderer.invoke(
      'mt::mark-share:set-enabled',
      Boolean(enabled)
    )) as MarkShareConfigState
  }

  async function setAutoStart(autoStart: boolean): Promise<void> {
    config.value = (await window.electron.ipcRenderer.invoke(
      'mt::mark-share:set-auto-start',
      Boolean(autoStart)
    )) as MarkShareConfigState
  }

  async function selectDefaultSaveDir(): Promise<void> {
    const dir = (await window.electron.ipcRenderer.invoke(
      'mt::mark-share:select-directory',
      String(config.value.defaultSaveDir || '')
    )) as string | null
    if (dir) {
      config.value = (await window.electron.ipcRenderer.invoke(
        'mt::mark-share:set-default-save-dir',
        String(dir)
      )) as MarkShareConfigState
    }
  }

  async function selectDirectory(defaultPath?: string): Promise<string | null> {
    return (await window.electron.ipcRenderer.invoke(
      'mt::mark-share:select-directory',
      String(defaultPath || config.value.defaultSaveDir || '')
    )) as string | null
  }

  async function setDeviceAlias(alias: string): Promise<void> {
    config.value = (await window.electron.ipcRenderer.invoke(
      'mt::mark-share:set-device-alias',
      String(alias || '')
    )) as MarkShareConfigState
  }

  async function setPeerAlias(peerKey: string, alias: string): Promise<void> {
    const list = (await window.electron.ipcRenderer.invoke(
      'mt::mark-share:set-peer-alias',
      String(peerKey),
      String(alias || '')
    )) as MarkShareDevice[]
    devices.value = list || []
  }

  async function refreshDevices(): Promise<void> {
    const list = (await window.electron.ipcRenderer.invoke(
      'mt::mark-share:refresh-devices'
    )) as MarkShareDevice[]
    devices.value = list || []
  }

  async function sendToDevice(targetPeerKey: string, paths: string[]): Promise<MarkShareOffer> {
    // Unwrap Vue 3 reactive Proxy arrays so Electron structured clone never throws
    const plainPaths = Array.from(paths, (p) => String(p)).filter(Boolean)
    const offer = (await window.electron.ipcRenderer.invoke('mt::mark-share:send', {
      targetPeerKey: String(targetPeerKey),
      paths: plainPaths
    })) as MarkShareOffer
    return offer
  }

  async function sendToDevices(targetPeerKeys: string[], paths: string[]): Promise<void> {
    const plainKeys = Array.from(targetPeerKeys, (k) => String(k))
    const plainPaths = Array.from(paths, (p) => String(p)).filter(Boolean)
    const results = await Promise.allSettled(
      plainKeys.map((key) => sendToDevice(key, plainPaths))
    )
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (failed.length > 0 && failed.length === results.length) {
      throw failed[0]!.reason
    }
    if (failed.length > 0) {
      showNotice(
        'warning',
        t('markShare.errPartialSendFailed', { failed: failed.length, total: results.length })
      )
    }
  }

  async function cancelOffer(offerId: string): Promise<void> {
    await window.electron.ipcRenderer.invoke('mt::mark-share:cancel', String(offerId))
  }

  async function stopTransfer(offerId: string): Promise<void> {
    await window.electron.ipcRenderer.invoke('mt::mark-share:stop', String(offerId))
  }

  async function previewIncomingConflicts(
    offerId: string,
    saveDir?: string,
    workspaceRoot?: string,
    pathMode: MarkSharePathMode = 'preserve'
  ): Promise<MarkShareConflictPreview> {
    return (await window.electron.ipcRenderer.invoke('mt::mark-share:preview-conflicts', {
      offerId: String(offerId),
      saveDir: saveDir ? String(saveDir) : undefined,
      workspaceRoot: workspaceRoot ? String(workspaceRoot) : undefined,
      pathMode
    })) as MarkShareConflictPreview
  }

  async function acceptOffer(
    offerId: string,
    saveDir?: string,
    setAsDefaultSaveDir = false,
    workspaceRoot?: string,
    conflictStrategy: MarkShareConflictStrategy = 'rename',
    pathMode: MarkSharePathMode = 'preserve'
  ): Promise<void> {
    await window.electron.ipcRenderer.invoke('mt::mark-share:accept', {
      offerId: String(offerId),
      saveDir: saveDir ? String(saveDir) : undefined,
      setAsDefaultSaveDir: Boolean(setAsDefaultSaveDir),
      workspaceRoot: workspaceRoot ? String(workspaceRoot) : undefined,
      pathMode,
      conflictStrategy
    })
  }

  async function rejectOffer(offerId: string): Promise<void> {
    await window.electron.ipcRenderer.invoke('mt::mark-share:reject', String(offerId))
  }

  async function clearHistory(): Promise<void> {
    history.value = (await window.electron.ipcRenderer.invoke(
      'mt::mark-share:clear-history'
    )) as MarkShareHistoryRecord[]
  }

  async function openPath(target: string | string[]): Promise<void> {
    const payload = Array.isArray(target)
      ? { paths: target.map((p) => String(p)).filter(Boolean) }
      : String(target || '')
    const res = await window.electron.ipcRenderer.invoke('mt::mark-share:open-path', payload)
    if (res && typeof res === 'object' && !res.ok) {
      showNotice('warning', res.error || t('markShare.errTargetNotFound'))
    } else if (res === false) {
      showNotice('warning', t('markShare.errTargetNotFound'))
    }
  }

  function openDevicePicker(paths: string[], label?: string): void {
    pickerPaths.value = [...paths]
    pickerLabel.value = label || paths[0] || ''
    pickerVisible.value = true
  }

  function closeDevicePicker(): void {
    pickerVisible.value = false
    pickerPaths.value = []
    pickerLabel.value = ''
  }

  function showDragRadar(paths: string[], isExternal: boolean): void {
    if (hideRadarTimer) {
      clearTimeout(hideRadarTimer)
      hideRadarTimer = null
    }
    dragRadarPaths.value = [...paths]
    dragRadarIsExternal.value = isExternal
    dragRadarVisible.value = true
  }

  function scheduleHideDragRadar(delayMs = 180): void {
    if (hideRadarTimer) clearTimeout(hideRadarTimer)
    hideRadarTimer = setTimeout(() => {
      dragRadarVisible.value = false
      dragRadarPaths.value = []
      dragRadarIsExternal.value = false
      hideRadarTimer = null
    }, delayMs)
  }

  function hideDragRadarNow(): void {
    if (hideRadarTimer) {
      clearTimeout(hideRadarTimer)
      hideRadarTimer = null
    }
    dragRadarVisible.value = false
    dragRadarPaths.value = []
    dragRadarIsExternal.value = false
  }

  return {
    config,
    devices,
    activeOffers,
    history,
    sendHistory,
    receiveHistory,
    currentIncomingOffer,
    activeTransferOffers,
    pickerVisible,
    pickerPaths,
    pickerLabel,
    dragRadarVisible,
    dragRadarPaths,
    dragRadarIsExternal,
    init,
    setEnabled,
    setAutoStart,
    setDeviceAlias,
    setPeerAlias,
    selectDefaultSaveDir,
    selectDirectory,
    refreshDevices,
    sendToDevice,
    sendToDevices,
    cancelOffer,
    stopTransfer,
    previewIncomingConflicts,
    acceptOffer,
    rejectOffer,
    clearHistory,
    openPath,
    openDevicePicker,
    closeDevicePicker,
    showDragRadar,
    scheduleHideDragRadar,
    hideDragRadarNow,
    showNotice
  }
})
