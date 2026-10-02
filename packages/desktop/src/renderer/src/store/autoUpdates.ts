import { defineStore } from 'pinia'
import notice from '../services/notification'
import { usePreferencesStore } from './preferences'

export const useAutoUpdatesStore = defineStore('autoUpdates', () => {
  const preferencesStore = usePreferencesStore()

  const isZh = (): boolean => {
    const lang = preferencesStore.language || ''
    return lang.toLowerCase().startsWith('zh') || !lang
  }

  function LISTEN_FOR_UPDATE(): void {
    window.electron.ipcRenderer.on('mt::CHECKING_FOR_UPDATE', () => {
      notice.notify({
        title: isZh() ? '检查更新' : 'Check for Updates',
        type: 'info',
        time: 3000,
        message: isZh() ? '正在检查更新…' : 'Checking for updates…'
      })
    })

    window.electron.ipcRenderer.on('mt::UPDATE_ERROR', (_e, message) => {
      const msgStr = String(message ?? '')
      notice.notify({
        title: isZh() ? '检查更新' : 'Update',
        type: 'error',
        time: 8000,
        message: isZh()
          ? `检查更新失败: ${msgStr}`
          : `Update check failed: ${msgStr}`
      })
    })

    window.electron.ipcRenderer.on('mt::UPDATE_NOT_AVAILABLE', (_e, message) => {
      notice.notify({
        title: isZh() ? '检查更新' : 'Check for Updates',
        type: 'primary',
        time: 5000,
        message: isZh()
          ? '当前已是最新版本。'
          : (String(message ?? '') || 'Current version is up-to-date.')
      })
    })

    window.electron.ipcRenderer.on('mt::UPDATE_DOWNLOADED', (_e, message) => {
      notice.notify({
        title: isZh() ? '更新已就绪' : 'Update Downloaded',
        type: 'info',
        time: 8000,
        message: isZh()
          ? '新版本已下载完成，应用即将重启以安装更新…'
          : (String(message ?? '') || 'Update downloaded, application will be quit for update...')
      })
    })

    window.electron.ipcRenderer.on('mt::UPDATE_AVAILABLE', (_e, message) => {
      notice
        .notify({
          title: isZh() ? '发现新版本' : 'Update Available',
          type: 'primary',
          message: isZh()
            ? '发现新版本，是否立即下载并安装？'
            : (String(message ?? '') || 'Found an update, do you want download and install now?'),
          showConfirm: true
        })
        .then(() => {
          const needUpdate = true
          window.electron.ipcRenderer.send('mt::NEED_UPDATE', { needUpdate })
        })
        .catch(() => {
          const needUpdate = false
          window.electron.ipcRenderer.send('mt::NEED_UPDATE', { needUpdate })
        })
    })
  }

  return { LISTEN_FOR_UPDATE }
})
