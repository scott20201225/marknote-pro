import { BrowserWindow } from 'electron'

export const showAboutDialog = (win: BrowserWindow | null | undefined): void => {
  const targetWin = win || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
  if (targetWin && targetWin.webContents) {
    targetWin.webContents.send('mt::about-dialog')
  }
}
