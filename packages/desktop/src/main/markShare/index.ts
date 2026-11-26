import { app, BrowserWindow, dialog, ipcMain, Notification, shell, type WebContents } from 'electron'
import type {
  MarkShareAcceptRequest,
  MarkShareAppType,
  MarkShareOffer,
  MarkShareSendRequest
} from '../../shared/types/markShare'
import { getMarkShareManager, MarkShareManager } from './markShareManager'
import {
  MarkShareHudOverlay,
  isMarkShareHudWindow,
  type MarkShareHudMeta,
  type MarkShareHudNoticeType
} from './markShareHudOverlay'

const broadcast = (channel: string, payload: unknown): void => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !isMarkShareHudWindow(win)) {
      win.webContents.send(channel, payload)
    }
  }
}

export const registerMarkShareHandlers = (appType: MarkShareAppType = 'marknotepro'): void => {
  const manager = getMarkShareManager(appType)
  const hudOverlay = new MarkShareHudOverlay({
    onCancel: (offerId) => {
      void manager.cancelOutgoingOffer(offerId).catch(() => {})
    },
    onStop: (offerId) => {
      void manager.stopTransfer(offerId).catch(() => {})
    }
  })

  void manager.init().catch((err) => {
    console.error('[MarkShare] Failed to initialize MarkShareManager:', err)
  })

  manager.on('config-updated', (config) => {
    broadcast('mt::mark-share:config-updated', config)
  })

  manager.on('devices-updated', (devices) => {
    broadcast('mt::mark-share:devices-updated', devices)
  })

  manager.on('sessions-updated', (sessions) => {
    broadcast('mt::mark-share:sessions-updated', sessions)
    hudOverlay.updateTransfers(sessions as MarkShareOffer[])
  })

  manager.on('history-updated', (history) => {
    broadcast('mt::mark-share:history-updated', history)
  })

  manager.on('incoming-offer', (offer: MarkShareOffer) => {
    broadcast('mt::mark-share:incoming-offer', offer)

    // Raise a native desktop notification if no app window is currently focused
    const focused = BrowserWindow.getFocusedWindow()
    if (!focused && Notification.isSupported()) {
      const n = new Notification({
        title: `MarkShare 传输请求 · ${offer.peerDevice.deviceName}`,
        body: `向你发送「${offer.rootLabel}」，请在 1 分钟内确认接收`
      })
      n.on('click', () => {
        const win = BrowserWindow.getAllWindows().find(
          (w) => !w.isDestroyed() && !isMarkShareHudWindow(w)
        )
        if (win) {
          if (win.isMinimized()) win.restore()
          win.show()
          win.focus()
        }
      })
      n.show()
    }
  })

  manager.on('session-ended', (offer: MarkShareOffer) => {
    broadcast('mt::mark-share:session-ended', offer)
    hudOverlay.showOutcomeBanner(offer)
  })

  app.on('before-quit', () => {
    hudOverlay.dispose()
    void manager.cleanup()
  })

  ipcMain.on(
    'mt::mark-share:show-notice',
    (_event, payload: { type?: MarkShareHudNoticeType; message?: string }) => {
      if (!payload?.message) return
      hudOverlay.showNotice(payload.type || 'info', String(payload.message))
    }
  )

  ipcMain.on('mt::mark-share:sync-hud-meta', (_event, meta: MarkShareHudMeta) => {
    if (meta && typeof meta === 'object') {
      hudOverlay.syncMeta(meta)
    }
  })

  // Bridge OS/sidebar file drags entering native BrowserViews (Draw.io, GeoGebra, MindMap, PDF, GitHub Desktop)
  // so MarkShareDropRadar surfaces cleanly above ALL views across the entire app.
  const hookedChildWebContents = new WeakSet<WebContents>()
  const childDragForwardScript = `
    (() => {
      if (window.__markShareChildDragHooked) return;
      window.__markShareChildDragHooked = true;
      let lastPing = 0;
      const notifyHost = (e) => {
        try {
          const dt = e.dataTransfer;
          const types = dt && dt.types ? Array.from(dt.types) : [];
          if (!types.includes('Files') && !types.includes('application/x-markshare-paths')) return;
          e.preventDefault();
          const now = Date.now();
          if (now - lastPing < 120) return;
          lastPing = now;
          const ipc = (window.electron && window.electron.ipcRenderer) || (typeof require === 'function' ? require('electron').ipcRenderer : null);
          if (ipc && typeof ipc.send === 'function') {
            ipc.send('mt::mark-share:child-drag-enter');
          }
        } catch (_) {}
      };
      window.addEventListener('dragenter', notifyHost, true);
      window.addEventListener('dragover', notifyHost, true);
    })();
  `

  app.on('web-contents-created', (_event, wc) => {
    wc.on('dom-ready', () => {
      if (wc.isDestroyed()) return
      const owner = BrowserWindow.fromWebContents(wc)
      if (isMarkShareHudWindow(owner)) return
      const wcType = wc.getType()
      if (wcType !== 'browserView' && wcType !== 'webview') return
      if (hookedChildWebContents.has(wc)) return
      hookedChildWebContents.add(wc)
      void wc.executeJavaScript(childDragForwardScript).catch(() => {})
    })
  })

  ipcMain.on('mt::mark-share:child-drag-enter', (event) => {
    const ownerWin =
      BrowserWindow.fromWebContents(event.sender) ||
      BrowserWindow.getFocusedWindow() ||
      BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
    if (ownerWin && !ownerWin.isDestroyed()) {
      ownerWin.webContents.send('mt::mark-share:child-drag-enter')
    }
  })

  ipcMain.handle('mt::mark-share:get-state', async () => ({
    config: manager.getConfigState(),
    devices: manager.getDevices(),
    activeOffers: manager.getActiveOffers(),
    history: manager.getHistory()
  }))

  ipcMain.handle('mt::mark-share:set-enabled', async (_event, enabled: boolean) => {
    return manager.setEnabled(Boolean(enabled))
  })

  ipcMain.handle('mt::mark-share:set-auto-start', async (_event, autoStart: boolean) => {
    return manager.setAutoStart(Boolean(autoStart))
  })

  ipcMain.handle('mt::mark-share:set-default-save-dir', async (_event, dirPath: string) => {
    return manager.setDefaultSaveDir(dirPath)
  })

  ipcMain.handle('mt::mark-share:set-device-alias', async (_event, alias: string) => {
    return manager.setDeviceAlias(alias)
  })

  ipcMain.handle(
    'mt::mark-share:set-peer-alias',
    async (_event, peerKey: string, alias: string) => {
      return manager.setPeerAlias(peerKey, alias)
    }
  )

  ipcMain.handle('mt::mark-share:refresh-devices', async () => {
    return manager.getDevices()
  })

  ipcMain.handle('mt::mark-share:send', async (_event, req: MarkShareSendRequest) => {
    return manager.sendToDevice(req.targetPeerKey, req.paths)
  })

  ipcMain.handle('mt::mark-share:cancel', async (_event, offerId: string) => {
    await manager.cancelOutgoingOffer(offerId)
    return true
  })

  ipcMain.handle('mt::mark-share:stop', async (_event, offerId: string) => {
    await manager.stopTransfer(offerId)
    return true
  })

  ipcMain.handle('mt::mark-share:accept', async (_event, req: MarkShareAcceptRequest) => {
    return manager.acceptIncomingOffer(req)
  })

  ipcMain.handle('mt::mark-share:reject', async (_event, offerId: string) => {
    await manager.rejectIncomingOffer(offerId)
    return true
  })

  ipcMain.handle('mt::mark-share:clear-history', async () => {
    return manager.clearHistory()
  })

  ipcMain.handle('mt::mark-share:open-path', async (_event, targetPath: string) => {
    if (!targetPath) return false
    shell.showItemInFolder(targetPath)
    return true
  })

  ipcMain.handle('mt::mark-share:select-directory', async (event, defaultPath?: string) => {
    const win = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      defaultPath: defaultPath || manager.getConfigState().defaultSaveDir,
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })
}

export { MarkShareManager, getMarkShareManager }
