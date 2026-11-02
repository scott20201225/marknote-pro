import { ipcMain, dialog, nativeImage, clipboard, BrowserWindow, app } from 'electron'
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
        captureManager.close()

        pinManager.createPinWindow({
          id: `pin_${Date.now()}`,
          type: 'image',
          content: dataUrl,
          width: bounds?.width || size.width,
          height: bounds?.height || size.height,
          x: bounds?.x,
          y: bounds?.y,
          title: '屏幕贴图'
        })
      } catch (err) {
        log.error('[Capture] Failed to pin capture:', err)
      }
    }
  )

  ipcMain.on('mt::capture-close', () => {
    captureManager.close()
  })

  ipcMain.handle(
    'mt::capture-slice',
    async (_event, rect: { x: number; y: number; width: number; height: number }) => {
      return captureManager.captureSlice(rect)
    }
  )

  ipcMain.handle(
    'mt::capture-scroll-down',
    async (_event, rect?: { x: number; y: number; width: number; height: number }, pixelDelta?: number) => {
      await captureManager.scrollDown(rect, typeof pixelDelta === 'number' ? pixelDelta : -220)
      return true
    }
  )

  ipcMain.on('mt::capture-set-level', (_event, level: 'normal' | 'floating') => {
    if (captureManager.win && !captureManager.win.isDestroyed()) {
      captureManager.win.setAlwaysOnTop(true, level)
    }
  })

  ipcMain.on('mt::capture-set-ignore-mouse', (_event, ignore: boolean, forward?: boolean) => {
    captureManager.setIgnoreMouseEvents(ignore, forward ?? true)
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
}
