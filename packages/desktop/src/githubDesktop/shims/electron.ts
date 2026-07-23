export const ipcRenderer = window.electron.ipcRenderer

export const shell = {
  beep: () => undefined,
  openExternal: (url: string) => window.electron.ipcRenderer.invoke('mt::shell::open-external', url),
  openPath: (fullPath: string) => window.electron.ipcRenderer.invoke('mt::shell::open-path', fullPath),
  showItemInFolder: (fullPath: string) => window.electron.ipcRenderer.send('mt::shell::show-item', fullPath)
}

export type IpcRendererEvent = unknown
