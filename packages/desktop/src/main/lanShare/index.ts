import { ipcMain, BrowserWindow, dialog, app } from 'electron'
import type { CreateLanShareOptions } from '../../shared/types/lanShare'
import { getLanShareManager, LanShareManager } from './lanShareManager'

export const registerLanShareHandlers = (appType: 'marknotepro' | 'marktextpro' = 'marknotepro'): void => {
  const manager = getLanShareManager(appType)

  void manager.init().catch((err) => {
    console.error('[LanShare] Failed to initialize LanShareManager:', err)
  })

  // Broadcast events to all open windows
  manager.on('discovered-updated', (list) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('mt::lan-share:discovered-updated', list)
      }
    }
  })

  manager.on('my-shares-updated', (list) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('mt::lan-share:my-shares-updated', list)
      }
    }
  })

  // Cleanup on app before-quit
  app.on('before-quit', () => {
    void manager.cleanup()
  })

  // IPC Handlers
  ipcMain.handle('mt::lan-share:get-my-shares', async () => {
    return manager.getMyShares()
  })

  ipcMain.handle('mt::lan-share:get-discovered-shares', async () => {
    return manager.getDiscoveredShares()
  })

  ipcMain.handle('mt::lan-share:create', async (_event, options: CreateLanShareOptions) => {
    return manager.createShare(options)
  })

  ipcMain.handle('mt::lan-share:stop', async (_event, id: string) => {
    return manager.stopShare(id)
  })

  ipcMain.handle('mt::lan-share:resume', async (_event, id: string) => {
    return manager.resumeShare(id)
  })

  ipcMain.handle('mt::lan-share:delete', async (_event, id: string) => {
    return manager.deleteShare(id)
  })

  ipcMain.handle('mt::lan-share:scan-folder', async (_event, folderPath: string) => {
    return manager.scanFolderFiles(folderPath)
  })

  ipcMain.handle('mt::lan-share:verify-remote-password', async (_event, remoteUrl: string, password: string) => {
    return manager.verifyRemotePassword(remoteUrl, password)
  })

  ipcMain.handle('mt::lan-share:fetch-remote-files', async (_event, remoteUrl: string, token?: string) => {
    return manager.fetchRemoteFiles(remoteUrl, token)
  })

  ipcMain.handle(
    'mt::lan-share:download-remote-file',
    async (
      _event,
      remoteUrl: string,
      fileId: string,
      destPath: string,
      token?: string,
      password?: string
    ) => {
      return manager.downloadRemoteFile(remoteUrl, fileId, destPath, token, password)
    }
  )

  ipcMain.handle('mt::lan-share:select-destination-folder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win || BrowserWindow.getFocusedWindow()!, {
      title: '选择保存目录',
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })
}

export { LanShareManager, getLanShareManager }
