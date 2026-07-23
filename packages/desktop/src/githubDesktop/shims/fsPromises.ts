export const stat = async(path: string): Promise<{ isDirectory: () => boolean }> => {
  const info = await window.electron.ipcRenderer.invoke('mt::fs::stat', path)
  return {
    isDirectory: () => Boolean(info?.isDirectory)
  }
}
