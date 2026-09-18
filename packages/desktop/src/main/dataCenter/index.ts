import fs from 'fs'
import path from 'path'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import schema from './schema.json'
import Store, { type Schema } from 'electron-store'
import { ensureDirSync } from 'common/filesystem'
import { IMAGE_EXTENSIONS } from 'common/filesystem/paths'

const DATA_CENTER_NAME = 'dataCenter'

interface DataCenterPaths {
  dataCenterPath: string
  userDataPath: string
}

class DataCenter {
  dataCenterPath: string
  userDataPath: string
  hasDataCenterFile: boolean
  store: Store<Record<string, unknown>>

  constructor(paths: DataCenterPaths) {
    const { dataCenterPath, userDataPath } = paths
    this.dataCenterPath = dataCenterPath
    this.userDataPath = userDataPath
    this.hasDataCenterFile = fs.existsSync(
      path.join(this.dataCenterPath, `./${DATA_CENTER_NAME}.json`)
    )
    this.store = new Store<Record<string, unknown>>({
      schema: schema as Schema<Record<string, unknown>>,
      name: DATA_CENTER_NAME
    })

    this.init()
  }

  init(): void {
    const defaultData = {
      screenshotFolderPath: path.join(this.userDataPath, 'screenshot')
    }

    if (!this.hasDataCenterFile) {
      this.store.set(defaultData)
      ensureDirSync(this.store.get('screenshotFolderPath') as string)
    }
    ;['imageFolderPath', 'webImages', 'cloudImages', 'currentUploader', 'cliScript', 'imageBed', 'imageBedAlias']
      .forEach((key) => this.store.delete(key))
    this._listenForIpcMain()
  }

  getItem(key: string): Promise<unknown> {
    return Promise.resolve(this.store.get(key))
  }

  _listenForIpcMain(): void {
    ipcMain.handle('mt::ask-for-image-path', async(e) => {
      const win = BrowserWindow.fromWebContents(e.sender)
      if (!win) return ''
      const { filePaths } = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [
          {
            name: 'Images',
            extensions: [...IMAGE_EXTENSIONS]
          }
        ]
      })

      if (filePaths && filePaths[0]) {
        return filePaths[0]
      } else {
        return ''
      }
    })
  }
}

export default DataCenter
