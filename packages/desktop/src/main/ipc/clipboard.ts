import { ipcMain, dialog, nativeImage, clipboard, BrowserWindow, app } from 'electron'
import path from 'path'
import fs from 'fs'
import fsPromises from 'fs/promises'
import log from 'electron-log'
import { getClipboardService } from '../clipboard'
import { getClipboardModalWindow } from '../windows/clipboardModal'
import { getCaptureWindowManager } from '../windows/captureWindow'
import { getPinWindowManager } from '../windows/pinWindow'
import type { ClipboardItemRecord } from '@shared/types/clipboard'

export const registerClipboardIpcHandlers = (): void => {
  const clipboardService = getClipboardService()
  const clipboardModal = getClipboardModalWindow()
  const captureManager = getCaptureWindowManager()
  const pinManager = getPinWindowManager()

  // Notify clipboard modal when history updates
  clipboardService.on('history-updated', (history) => {
    if (clipboardModal.win && !clipboardModal.win.isDestroyed()) {
      clipboardModal.win.webContents.send('mt::clipboard-history-updated', history)
    }
  })

  // Trigger from sidebar or UI
  ipcMain.on('mt::trigger-screen-capture', () => {
    captureManager.startCapture()
  })

  ipcMain.on('mt::trigger-clipboard-history', () => {
    clipboardModal.toggle()
  })

  // 1. Clipboard History Modal
  ipcMain.handle('mt::clipboard-get-history', async () => {
    return clipboardService.history
  })

  ipcMain.handle('mt::clipboard-delete-item', async (_event, id: string) => {
    return clipboardService.deleteItem(id)
  })

  ipcMain.handle('mt::clipboard-clear-history', async () => {
    return clipboardService.clearHistory()
  })

  ipcMain.handle('mt::clipboard-copy-item', async (_event, item: ClipboardItemRecord) => {
    try {
      clipboardService.copyToClipboard(item)
      return true
    } catch (err) {
      log.error('[Clipboard] Failed to copy item:', err)
      return false
    }
  })

  ipcMain.handle('mt::clipboard-paste-item', async (_event, item: ClipboardItemRecord) => {
    try {
      clipboardService.pasteItem(item)
      clipboardModal.hide()
      await clipboardService.simulatePaste()
      return true
    } catch (err) {
      log.error('[Clipboard] Failed to paste item:', err)
      return false
    }
  })

  ipcMain.handle('mt::clipboard-pin-item', async (_event, item: ClipboardItemRecord) => {
    try {
      clipboardModal.hide()
      const pinId = `pin_${item.id}_${Date.now()}`
      if (item.type === 'image') {
        const imageContent =
          item.imagePath && fs.existsSync(item.imagePath)
            ? item.imagePath
            : item.imageDataUrl || ''

        pinManager.createPinWindow({
          id: pinId,
          type: 'image',
          content: imageContent,
          width: item.width || 400,
          height: item.height || 300,
          title: item.previewText || '历史截图'
        })
      } else {
        pinManager.createPinWindow({
          id: pinId,
          type: 'text',
          content: item.content || '',
          width: 480,
          height: 280,
          title: item.previewText || '剪贴板文本'
        })
      }
      return true
    } catch (err) {
      log.error('[Clipboard] Failed to pin item:', err)
      return false
    }
  })

  ipcMain.on('mt::clipboard-hide-modal', () => {
    clipboardModal.hide()
  })

  // 2. Screen Capture
  ipcMain.handle('mt::capture-get-data', async () => {
    return captureManager.currentPayload
  })

  ipcMain.handle('mt::capture-copy', async (_event, dataUrl: string) => {
    try {
      const img = nativeImage.createFromDataURL(dataUrl)
      clipboard.writeImage(img)
      const size = img.getSize()
      await clipboardService.addCapturedImage(dataUrl, size.width, size.height)
      return true
    } catch (err) {
      log.error('[Capture] Failed to copy capture:', err)
      return false
    } finally {
      captureManager.close()
    }
  })

  ipcMain.handle('mt::capture-save', async (event, dataUrl: string) => {
    let saved = false
    try {
      const senderWin = BrowserWindow.fromWebContents(event.sender) || undefined
      const { filePath, canceled } = await dialog.showSaveDialog(senderWin!, {
        title: '保存截图',
        defaultPath: `screenshot_${Date.now()}.png`,
        filters: [{ name: 'PNG Image', extensions: ['png'] }]
      })

      if (canceled || !filePath) return null

      const img = nativeImage.createFromDataURL(dataUrl)
      await fsPromises.writeFile(filePath, img.toPNG())
      const size = img.getSize()
      await clipboardService.addCapturedImage(dataUrl, size.width, size.height)
      saved = true
      return filePath
    } catch (err) {
      log.error('[Capture] Failed to save capture:', err)
      return null
    } finally {
      if (saved) {
        captureManager.close()
      }
    }
  })

  ipcMain.handle(
    'mt::capture-pin',
    async (
      _event,
      dataUrl: string,
      bounds?: { x: number; y: number; width: number; height: number }
    ) => {
      try {
        const img = nativeImage.createFromDataURL(dataUrl)
        const size = img.getSize()
        await clipboardService.addCapturedImage(dataUrl, size.width, size.height)

        const pinWin = pinManager.createPinWindow({
          id: `pin_${Date.now()}`,
          type: 'image',
          content: dataUrl,
          width: bounds?.width || size.width,
          height: bounds?.height || size.height,
          x: bounds?.x,
          y: bounds?.y,
          title: '屏幕贴图'
        })

        captureManager.close()
        return !!pinWin
      } catch (err) {
        log.error('[Capture] Failed to pin capture:', err)
        captureManager.close()
        return false
      }
    }
  )

  ipcMain.on('mt::capture-close', () => {
    captureManager.close()
  })

  ipcMain.on('mt::capture-first-frame-ready', () => {
    captureManager.showCaptureWindow()
  })

  ipcMain.on('mt::capture-text-mode', (_event, active: boolean) => {
    captureManager.setTextEditingMode(active)
  })

  // 3. Pin Window Handlers
  ipcMain.handle('mt::pin-window-get-payload', async (event, pinId?: string) => {
    const senderWin = BrowserWindow.fromWebContents(event.sender) || undefined
    return pinManager.getPayload(pinId, senderWin)
  })

  ipcMain.handle('mt::pin-window-copy', async (_event, dataUrl: string) => {
    return pinManager.copyImage(dataUrl)
  })

  ipcMain.handle('mt::pin-window-save', async (event, dataUrl: string) => {
    const senderWin = BrowserWindow.fromWebContents(event.sender) || undefined
    return pinManager.saveImage(dataUrl, senderWin)
  })

  ipcMain.on('mt::pin-window-close', (event, pinId?: string) => {
    const senderWin = BrowserWindow.fromWebContents(event.sender) || undefined
    pinManager.closePin(pinId, senderWin)
  })

  ipcMain.handle('mt::pin-window-get-bounds', (event, pinId?: string) => {
    const senderWin = BrowserWindow.fromWebContents(event.sender) || undefined
    return pinManager.getBounds(pinId, senderWin)
  })

  ipcMain.on(
    'mt::pin-window-resize',
    (
      event,
      payload: {
        bounds: { x: number; y: number; width: number; height: number }
        pinId?: string
      }
    ) => {
      const senderWin = BrowserWindow.fromWebContents(event.sender) || undefined
      pinManager.resizeWindow(payload.bounds, payload.pinId, senderWin)
    }
  )

  ipcMain.on(
    'mt::pin-window-drag',
    (event, payload: { dx: number; dy: number; pinId?: string }) => {
      const senderWin = BrowserWindow.fromWebContents(event.sender) || undefined
      pinManager.dragWindow(payload.dx, payload.dy, payload.pinId, senderWin)
    }
  )

  ipcMain.on(
    'mt::pin-window-set-always-on-top',
    (event, flag: boolean, pinId?: string) => {
      const senderWin = BrowserWindow.fromWebContents(event.sender) || undefined
      pinManager.setAlwaysOnTop(flag, pinId, senderWin)
    }
  )

  ipcMain.on(
    'mt::pin-window-fit-size',
    (
      event,
      payload: {
        pinId?: string
        naturalWidth: number
        naturalHeight: number
        zoom?: number
      }
    ) => {
      const senderWin = BrowserWindow.fromWebContents(event.sender) || undefined
      pinManager.fitSize(
        payload.pinId,
        payload.naturalWidth,
        payload.naturalHeight,
        payload.zoom,
        senderWin
      )
    }
  )

  ipcMain.on('mt::pin-text-mode', (event, arg1: boolean | { active: boolean; pinId?: string }, arg2?: string) => {
    const active = typeof arg1 === 'boolean' ? arg1 : !!arg1?.active
    const pinId = typeof arg1 === 'object' && arg1?.pinId ? arg1.pinId : arg2
    const senderWin = BrowserWindow.fromWebContents(event.sender) || undefined
    pinManager.setTextEditingMode(active, pinId, senderWin)
  })

  ipcMain.on(
    'mt::pin-edit-toolbar-open',
    (_event, data: { pinId: string; bounds?: { x: number; y: number; width: number; height: number } }) => {
      pinManager.openEditToolbar(data.pinId, data.bounds)
    }
  )

  ipcMain.on('mt::pin-edit-toolbar-close', (_event, pinId: string) => {
    pinManager.closeEditToolbar(pinId)
  })

  ipcMain.on('mt::pin-window-focus', (_event, pinId: string) => {
    pinManager.focusPinWindow(pinId)
  })

  ipcMain.on('mt::pin-toolbar-focus', (_event, pinId: string) => {
    pinManager.focusToolbarWindow(pinId)
  })

  ipcMain.on(
    'mt::pin-edit-action',
    (_event, data: { pinId: string; action: string; [key: string]: any }) => {
      const pinWin = pinManager.getPinWindow(data.pinId)
      if (pinWin && !pinWin.isDestroyed()) {
        pinWin.webContents.send('mt::pin-edit-action', data)
      }
    }
  )

  ipcMain.on(
    'mt::pin-edit-state-sync',
    (_event, data: { pinId: string; [key: string]: any }) => {
      const tbWin = pinManager.getToolbarWindow(data.pinId)
      if (tbWin && !tbWin.isDestroyed()) {
        tbWin.webContents.send('mt::pin-edit-state-sync', data)
      }
    }
  )

  ipcMain.on(
    'mt::pin-toolbar-drag',
    (_event, data: { pinId: string; dx: number; dy: number }) => {
      const tbWin = pinManager.getToolbarWindow(data.pinId)
      if (tbWin && !tbWin.isDestroyed()) {
        const [x, y] = tbWin.getPosition()
        tbWin.setPosition(Math.round(x + data.dx), Math.round(y + data.dy))
      }
    }
  )

  ipcMain.handle(
    'mt::pin-create',
    async (
      _event,
      payload: {
        type?: 'image' | 'text'
        content: string
        width?: number
        height?: number
        x?: number
        y?: number
        title?: string
        markdownMeta?: import('@shared/types/clipboard').MarkdownImageMeta
      }
    ) => {
      try {
        const pinWin = pinManager.createPinWindow({
          id: `pin_${Date.now()}`,
          type: payload.type || 'image',
          content: payload.content,
          width: payload.width || 500,
          height: payload.height || 400,
          x: payload.x,
          y: payload.y,
          title: payload.title || '独立展示',
          markdownMeta: payload.markdownMeta
        })
        return !!pinWin
      } catch (err) {
        log.error('[PinWindowManager] Failed to create pin window via mt::pin-create:', err)
        return false
      }
    }
  )

  ipcMain.handle(
    'mt::pin-markdown-update',
    async (
      _event,
      data: {
        markdownMeta: import('@shared/types/clipboard').MarkdownImageMeta
        newContent: string
      }
    ) => {
      const { markdownMeta, newContent } = data
      let localFilePath: string | null = null

      const srcToCheck = markdownMeta.resolvedSrc || markdownMeta.originalSrc || ''
      if (srcToCheck.startsWith('file://')) {
        try {
          const parsedUrl = new URL(srcToCheck)
          localFilePath = decodeURIComponent(parsedUrl.pathname)
        } catch {
          localFilePath = srcToCheck.replace(/^file:\/\//, '')
        }
      } else if (path.isAbsolute(srcToCheck)) {
        localFilePath = srcToCheck
      }

      if (localFilePath && fs.existsSync(localFilePath)) {
        try {
          const base64Data = newContent.replace(/^data:image\/\w+;base64,/, '')
          const buffer = Buffer.from(base64Data, 'base64')
          await fsPromises.writeFile(localFilePath, buffer)
          log.info('[PinWindow] Overwrote local image file on disk:', localFilePath)
        } catch (wErr) {
          log.warn('[PinWindow] Failed to overwrite local image file:', wErr)
        }
      }

      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('mt::pin-image-updated-in-markdown', {
            markdownMeta,
            newContent,
            localFilePath
          })
        }
      }
      return { success: true, localFilePath }
    }
  )
}
