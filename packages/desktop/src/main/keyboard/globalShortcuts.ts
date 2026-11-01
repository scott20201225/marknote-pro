import { app, globalShortcut } from 'electron'
import log from 'electron-log'
import { getCaptureWindowManager } from '../windows/captureWindow'
import { getClipboardModalWindow } from '../windows/clipboardModal'

export const registerGlobalShortcuts = (): void => {
  const captureManager = getCaptureWindowManager()
  const clipboardModal = getClipboardModalWindow()

  // 1. Screenshot shortcuts: Ctrl+Shift+F1, Cmd+Shift+F1, and number 1 variants for Mac laptops
  const screenshotShortcuts = [
    'Control+Shift+F1',
    'Command+Shift+F1',
    'CommandOrControl+Shift+F1',
    'Control+Shift+1',
    'Command+Shift+1'
  ]

  for (const shortcut of screenshotShortcuts) {
    try {
      if (!globalShortcut.isRegistered(shortcut)) {
        const success = globalShortcut.register(shortcut, () => {
          console.log(`[GlobalShortcut] 🔥 Triggered screen capture via: ${shortcut}`)
          log.info(`[GlobalShortcut] Triggered screen capture via ${shortcut}`)
          captureManager.startCapture()
        })
        console.log(`[GlobalShortcut] Registered capture ${shortcut}: ${success}`)
      }
    } catch (e) {
      console.error(`[GlobalShortcut] Error registering ${shortcut}:`, e)
      log.warn(`[GlobalShortcut] Error registering ${shortcut}:`, e)
    }
  }

  // 2. Clipboard History Modal shortcuts: Ctrl+Shift+F3, Cmd+Shift+F3, and Ctrl+Shift+3
  const clipboardShortcuts = [
    'Control+Shift+F3',
    'Command+Shift+F3',
    'CommandOrControl+Shift+F3',
    'Control+Shift+3'
  ]

  for (const shortcut of clipboardShortcuts) {
    try {
      if (!globalShortcut.isRegistered(shortcut)) {
        const success = globalShortcut.register(shortcut, () => {
          console.log(`[GlobalShortcut] 🔥 Triggered clipboard modal via: ${shortcut}`)
          log.info(`[GlobalShortcut] Triggered clipboard modal via ${shortcut}`)
          clipboardModal.toggle()
        })
        console.log(`[GlobalShortcut] Registered clipboard ${shortcut}: ${success}`)
      }
    } catch (e) {
      console.error(`[GlobalShortcut] Error registering ${shortcut}:`, e)
      log.warn(`[GlobalShortcut] Error registering ${shortcut}:`, e)
    }
  }

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
  })
}
