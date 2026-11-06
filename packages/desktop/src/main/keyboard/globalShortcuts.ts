import { app, globalShortcut } from 'electron'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import log from 'electron-log'
import { getCaptureWindowManager } from '../windows/captureWindow'
import { getClipboardModalWindow } from '../windows/clipboardModal'
import { getMacNativeHelper } from '../windows/macNativeHelper'
import { isOsx } from '../config'

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

/**
 * Check whether MarkShotHis standalone app is currently running.
 * Priority rule: If MarkShotHis is active, MarkNotePro yields global shortcuts 1 and 2 to avoid conflicts.
 */
export const isMarkShotHisRunning = (): boolean => {
  // 1. Check PID heartbeat file in ~/.mark-suite/running/markshothis.json
  try {
    const pidFile = path.join(os.homedir(), '.mark-suite', 'running', 'markshothis.json')
    if (fs.existsSync(pidFile)) {
      const info = JSON.parse(fs.readFileSync(pidFile, 'utf-8'))
      if (info && info.pid && info.pid !== process.pid) {
        try {
          process.kill(info.pid, 0)
          return true
        } catch {}
      }
    }
  } catch {}

  // 2. Process table check
  try {
    if (process.platform === 'darwin') {
      const out = execSync('pgrep -x MarkShotHis || pgrep -f "MarkShotHis.app/Contents/MacOS" || pgrep -f "markshothis/out/main"', {
        encoding: 'utf-8',
        timeout: 500,
        stdio: ['ignore', 'pipe', 'ignore']
      })
      const pids = out
        .trim()
        .split('\n')
        .map((p) => parseInt(p.trim(), 10))
        .filter((p) => !isNaN(p) && p !== process.pid)
      return pids.length > 0
    } else if (process.platform === 'win32') {
      const out = execSync('tasklist /FI "IMAGENAME eq markshothis.exe" /NH', {
        encoding: 'utf-8',
        timeout: 800,
        stdio: ['ignore', 'pipe', 'ignore']
      })
      return /markshothis\.exe/i.test(out)
    } else {
      const out = execSync('pgrep -x markshothis || pgrep -f "markshothis"', {
        encoding: 'utf-8',
        timeout: 500,
        stdio: ['ignore', 'pipe', 'ignore']
      })
      const pids = out
        .trim()
        .split('\n')
        .map((p) => parseInt(p.trim(), 10))
        .filter((p) => !isNaN(p) && p !== process.pid)
      return pids.length > 0
    }
  } catch {
    return false
  }
}

// 1. Screenshot Shortcuts: 1 (Ctrl+Shift+1 / Cmd+Shift+1 / F1)
const screenshotShortcuts = [
  'Control+Shift+1',
  'Command+Shift+1',
  'Control+Shift+F1',
  'Command+Shift+F1',
  'CommandOrControl+Shift+1',
  'CommandOrControl+Shift+F1'
]

// 2. Clipboard History / Pin Shortcuts: 2 & 3 (Ctrl+Shift+2 / Cmd+Shift+2 / F2 / Ctrl+Shift+3 / Cmd+Shift+3 / F3)
const clipboardShortcuts = [
  'Control+Shift+2',
  'Command+Shift+2',
  'Control+Shift+F2',
  'Command+Shift+F2',
  'CommandOrControl+Shift+2',
  'CommandOrControl+Shift+F2',
  'Control+Shift+3',
  'Command+Shift+3',
  'Control+Shift+F3',
  'Command+Shift+F3',
  'CommandOrControl+Shift+3',
  'CommandOrControl+Shift+F3'
]

export const registerGlobalShortcuts = (): void => {
  writePidFile()

  if (isOsx) {
    try {
      getMacNativeHelper().ensureRunning()
    } catch (err) {
      log.warn('[GlobalShortcuts] Failed to start macNativeHelper on startup:', err)
    }
  }

  const captureManager = getCaptureWindowManager()
  const clipboardModal = getClipboardModalWindow()

  const tryRegister = (): void => {
    // 1. Screenshot shortcuts: 1 (Ctrl+Shift+1 / Cmd+Shift+1 / F1)
    // On macOS: use native Cocoa mode; On non-macOS: use Electron mode
    // Conflict avoidance rule: If MarkShotHis is running, MarkNotePro yields shortcut 1.
    for (const shortcut of screenshotShortcuts) {
      try {
        if (!globalShortcut.isRegistered(shortcut)) {
          globalShortcut.register(shortcut, () => {
            if (isMarkShotHisRunning()) {
              log.info(`[GlobalShortcut] MarkShotHis is currently active. MarkNotePro yields shortcut 1 (${shortcut}).`)
              return
            }
            log.info(`[GlobalShortcut] 🔥 MarkNotePro triggered screen capture via: ${shortcut} (isOsx=${isOsx})`)
            if (isOsx) {
              getMacNativeHelper().startCapture()
            } else {
              captureManager.startCapture(false)
            }
          })
        }
      } catch (e) {
        log.warn(`[GlobalShortcut] Error registering ${shortcut}:`, e)
      }
    }

    // 2. Clipboard History / Pin shortcuts: 2 & 3 (Ctrl+Shift+2 / Cmd+Shift+2 / F2 / Ctrl+Shift+3)
    // On macOS: use native Cocoa mode; On non-macOS: use Electron mode
    // Conflict avoidance rule: If MarkShotHis is running, MarkNotePro yields shortcut 2.
    for (const shortcut of clipboardShortcuts) {
      try {
        if (!globalShortcut.isRegistered(shortcut)) {
          globalShortcut.register(shortcut, () => {
            if (isMarkShotHisRunning()) {
              log.info(`[GlobalShortcut] MarkShotHis is currently active. MarkNotePro yields shortcut 2 (${shortcut}).`)
              return
            }
            log.info(`[GlobalShortcut] 🔥 MarkNotePro triggered clipboard modal via: ${shortcut} (isOsx=${isOsx})`)
            if (isOsx) {
              getMacNativeHelper().toggleClipboard()
            } else {
              clipboardModal.toggle(false)
            }
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
