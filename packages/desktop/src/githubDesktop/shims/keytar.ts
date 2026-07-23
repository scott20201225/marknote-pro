export const getPassword = (service: string, account: string): Promise<string | null> =>
  window.electron.ipcRenderer.invoke('mt::github-desktop::keytar-get-password', service, account)

export const setPassword = (service: string, account: string, password: string): Promise<boolean> =>
  window.electron.ipcRenderer.invoke('mt::github-desktop::keytar-set-password', service, account, password)

export const deletePassword = (service: string, account: string): Promise<boolean> =>
  window.electron.ipcRenderer.invoke('mt::github-desktop::keytar-delete-password', service, account)
