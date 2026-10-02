import { autoUpdater } from 'electron-updater'
import { BrowserWindow, Menu, ipcMain, dialog, Notification, app } from 'electron'
import { COMMANDS } from '../../commands'
import type { CommandManager } from '../../commands'
import { isOsx } from '../../config'
import { getCurrentLanguage } from '../../i18n'

let runningUpdate = false
let isManualCheck = false
let win: BrowserWindow | null = null

const isZh = (): boolean => {
  const lang = getCurrentLanguage() || ''
  return lang.toLowerCase().startsWith('zh') || !lang
}

autoUpdater.autoDownload = false

autoUpdater.on('error', (error: Error) => {
  runningUpdate = false
  const err = error as Error | null
  const msg = err === null ? 'Error: unknown' : (err.message || String(err))
  if (isManualCheck && win && !win.isDestroyed()) {
    void dialog.showMessageBox(win, {
      type: 'warning',
      title: isZh() ? '检查更新' : 'Check for Updates',
      message: isZh() ? '检查更新失败' : 'Update Check Failed',
      detail: msg,
      buttons: [isZh() ? '确定' : 'OK']
    })
  }
  isManualCheck = false
  if (win && win.webContents && !win.webContents.isDestroyed()) {
    win.webContents.send('mt::UPDATE_ERROR', msg)
  }
})

autoUpdater.on('update-available', (_info) => {
  runningUpdate = false
  if (win && !win.isDestroyed()) {
    void dialog.showMessageBox(win, {
      type: 'info',
      title: isZh() ? '检查更新' : 'Check for Updates',
      message: isZh() ? '发现新版本' : 'Update Available',
      detail: isZh()
        ? '发现新版本，是否立即下载并安装？'
        : 'Found an update, do you want to download and install now?',
      buttons: [isZh() ? '立即下载' : 'Download Now', isZh() ? '稍后' : 'Later'],
      defaultId: 0,
      cancelId: 1
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.downloadUpdate()
      }
    })
    if (win.webContents && !win.webContents.isDestroyed()) {
      win.webContents.send(
        'mt::UPDATE_AVAILABLE',
        'Found an update, do you want download and install now?'
      )
    }
  }
  isManualCheck = false
})

autoUpdater.on('update-not-available', (_info) => {
  runningUpdate = false
  if (isManualCheck && win && !win.isDestroyed()) {
    void dialog.showMessageBox(win, {
      type: 'info',
      title: isZh() ? '检查更新' : 'Check for Updates',
      message: isZh() ? '当前已是最新版本' : 'Up to Date',
      detail: isZh()
        ? `MarkNotePro ${app.getVersion()} 目前已是最新版本。`
        : `MarkNotePro ${app.getVersion()} is currently the newest version.`,
      buttons: [isZh() ? '确定' : 'OK']
    })
  }
  isManualCheck = false
  if (win && win.webContents && !win.webContents.isDestroyed()) {
    win.webContents.send('mt::UPDATE_NOT_AVAILABLE', 'Current version is up-to-date.')
  }
})

autoUpdater.on('update-downloaded', (_event) => {
  if (win && !win.isDestroyed()) {
    void dialog.showMessageBox(win, {
      type: 'info',
      title: isZh() ? '更新已就绪' : 'Update Downloaded',
      message: isZh() ? '新版本已下载完成' : 'Update Ready',
      detail: isZh()
        ? '新版本已下载完成，应用即将重启以安装更新。'
        : 'Update downloaded, application will restart to install.',
      buttons: [isZh() ? '立即重启' : 'Restart Now', isZh() ? '稍后' : 'Later'],
      defaultId: 0,
      cancelId: 1
    }).then(({ response }) => {
      if (response === 0) {
        setImmediate(() => autoUpdater.quitAndInstall())
      }
    })
    if (win.webContents && !win.webContents.isDestroyed()) {
      win.webContents.send(
        'mt::UPDATE_DOWNLOADED',
        'Update downloaded, application will be quit for update...'
      )
    }
  } else {
    setImmediate(() => autoUpdater.quitAndInstall())
  }
})

ipcMain.on('mt::NEED_UPDATE', (_e, { needUpdate }: { needUpdate: boolean }) => {
  if (needUpdate) {
    autoUpdater.downloadUpdate()
  } else {
    runningUpdate = false
  }
})

ipcMain.on('mt::check-for-update', (e) => {
  const senderWin = BrowserWindow.fromWebContents(e.sender)
  checkUpdates(senderWin)
})

// --------------------------------------------------------

export const userSetting = (): void => {
  ipcMain.emit('app-create-settings-window')
}

export const checkUpdates = (browserWindow: BrowserWindow | null): void => {
  win = browserWindow ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
  isManualCheck = true

  if (!runningUpdate) {
    runningUpdate = true
    if (Notification.isSupported()) {
      new Notification({
        title: 'MarkNotePro',
        body: isZh() ? '正在检查更新…' : 'Checking for updates…'
      }).show()
    }
    if (win && win.webContents && !win.webContents.isDestroyed()) {
      win.webContents.send('mt::CHECKING_FOR_UPDATE')
    }
    const checkPromise = autoUpdater.checkForUpdates()
    if (checkPromise && typeof checkPromise.catch === 'function') {
      checkPromise.catch((err: unknown) => {
        runningUpdate = false
        const msg = err instanceof Error ? err.message : String(err)
        if (isManualCheck && win && !win.isDestroyed()) {
          void dialog.showMessageBox(win, {
            type: 'warning',
            title: isZh() ? '检查更新' : 'Check for Updates',
            message: isZh() ? '检查更新失败' : 'Update Check Failed',
            detail: msg,
            buttons: [isZh() ? '确定' : 'OK']
          })
        }
        isManualCheck = false
        if (win && win.webContents && !win.webContents.isDestroyed()) {
          win.webContents.send('mt::UPDATE_ERROR', msg)
        }
      })
    }
  } else {
    if (Notification.isSupported()) {
      new Notification({
        title: 'MarkNotePro',
        body: isZh() ? '正在检查更新…' : 'Checking for updates…'
      }).show()
    }
    if (win && win.webContents && !win.webContents.isDestroyed()) {
      win.webContents.send('mt::CHECKING_FOR_UPDATE')
    }
  }
}

export const osxHide = (): void => {
  if (isOsx) {
    Menu.sendActionToFirstResponder('hide:')
  }
}

export const osxHideAll = (): void => {
  if (isOsx) {
    Menu.sendActionToFirstResponder('hideOtherApplications:')
  }
}

export const osxShowAll = (): void => {
  if (isOsx) {
    Menu.sendActionToFirstResponder('unhideAllApplications:')
  }
}

// --- Commands -------------------------------------------------------------

export const loadMarkNoteProCommands = (commandManager: CommandManager): void => {
  commandManager.add(COMMANDS.MT_HIDE, osxHide)
  commandManager.add(COMMANDS.MT_HIDE_OTHERS, osxHideAll)
}
