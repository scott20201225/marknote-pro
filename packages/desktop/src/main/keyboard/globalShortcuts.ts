import { app, globalShortcut } from 'electron'
import fs from 'fs'
import path from 'path'
import os from 'os'
import log from 'electron-log'
import { getCaptureWindowManager } from '../windows/captureWindow'
import { getClipboardModalWindow } from '../windows/clipboardModal'

const PID_DIR = path.join(os.homedir(), '.mark-suite', 'running')
const PID_FILE = path.join(PID_DIR, 'marknotepro.json')

const writePidFile = (): void => {
  try {
    if (!fs.existsSync(PID_DIR)) {
      fs.mkdirSync(PID_DIR, { recursive: true })
    }
    fs.writeFileSync(
      PID_FILE,
      JSON.stringify({
        pid: process.pid,
        app: 'marknotepro',
        startTime: Date.now()
      }),
      'utf-8'
    )
  } catch (err) {
    log.warn('[GlobalShortcuts] Failed to write PID file:', err)
  }
}

const removePidFile = (): void => {
  try {
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE)
    }
  } catch (err) {
    log.warn('[GlobalShortcuts] Failed to remove PID file:', err)
  }
}

const screenshotShortcuts = [
  'Control+Shift+F1',
  'Command+Shift+F1',
  'CommandOrControl+Shift+F1',
  'Control+Shift+1',
  'Command+Shift+1'
]

const clipboardShortcuts = [
  'Control+Shift+F3',
  'Command+Shift+F3',
  'CommandOrControl+Shift+F3',
  'Control+Shift+3'
]

export const registerGlobalShortcuts = (): void => {
  writePidFile()

  const captureManager = getCaptureWindowManager()
  const clipboardModal = getClipboardModalWindow()

  const tryRegister = (): void => {
    // 1. Screenshot shortcuts: Ctrl+Shift+F1, Cmd+Shift+F1, and number 1 variants for Mac laptops
    for (const shortcut of screenshotShortcuts) {
      try {
        if (!globalShortcut.isRegistered(shortcut)) {
          globalShortcut.register(shortcut, () => {
            log.info(`[GlobalShortcut] 🔥 MarkNotePro triggered screen capture via: ${shortcut}`)
            captureManager.startCapture()
          })
        }
      } catch (e) {
        log.warn(`[GlobalShortcut] Error registering ${shortcut}:`, e)
      }
    }

    // 2. Clipboard History Modal shortcuts: Ctrl+Shift+F3, Cmd+Shift+F3, and Ctrl+Shift+3
    for (const shortcut of clipboardShortcuts) {
      try {
        if (!globalShortcut.isRegistered(shortcut)) {
          globalShortcut.register(shortcut, () => {
            log.info(`[GlobalShortcut] 🔥 MarkNotePro triggered clipboard modal via: ${shortcut}`)
            clipboardModal.toggle()
          })
        }
      } catch (e) {
        log.warn(`[GlobalShortcut] Error registering ${shortcut}:`, e)
      }
    }
  }

  // Initial registration
  tryRegister()

  // In case marktext-pro yielded a moment later, ensure all shortcuts are registered
  const retryTimer = setInterval(() => {
    tryRegister()
  }, 2000)

  app.on('will-quit', () => {
    clearInterval(retryTimer)
    removePidFile()
    globalShortcut.unregisterAll()
  })
}
