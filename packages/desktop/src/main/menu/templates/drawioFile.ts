import { app, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import { isOsx } from '../../config'
import { t } from '../../i18n'
import type Keybindings from '../../keyboard/shortcutHandler'
import { invokeDrawioAction, setDrawioAutosave } from '../../drawio'
import * as fileActions from '../actions/file'
import { userSetting } from '../actions/marknotepro'
import { withTopLevelMenuMnemonic } from './mnemonics'

const invoke = (browserWindow: BrowserWindow | undefined, actionName: string): void => {
  if (browserWindow) invokeDrawioAction(browserWindow, actionName)
}

export default function (keybindings: Keybindings, autoSave: boolean): MenuItemConstructorOptions {
  const exportItems: MenuItemConstructorOptions[] = [
    ['PNG', 'marknoteproExportPng'],
    ['JPEG', 'marknoteproExportJpeg'],
    ['WebP', 'marknoteproExportWebp'],
    ['动画 GIF', 'marknoteproExportGif'],
    ['SVG', 'marknoteproExportSvg'],
    ['PDF', 'marknoteproExportPdf'],
    ['HTML', 'marknoteproExportHtml'],
    ['XML', 'marknoteproExportXml'],
    ['Draw.io', 'marknoteproExportDrawio'],
    ['高级...', 'export']
  ].map(([format, actionName]): MenuItemConstructorOptions => ({
    label: `${t('menu.file.export')} ${format}`,
    click(_menuItem, browserWindow) {
      invoke(browserWindow as BrowserWindow | undefined, actionName)
    }
  }))

  return {
    label: withTopLevelMenuMnemonic('file', t('menu.file.file')),
    submenu: [
      {
        label: t('menu.file.save'),
        accelerator: keybindings.getAccelerator('file.save') ?? undefined,
        click(_menuItem, browserWindow) {
          invoke(browserWindow as BrowserWindow | undefined, 'save')
        }
      },
      {
        label: t('menu.file.autoSave'),
        type: 'checkbox',
        id: 'drawioAutoSaveMenuItem',
        checked: autoSave,
        click(menuItem, browserWindow) {
          const win = browserWindow as BrowserWindow | undefined
          if (win) setDrawioAutosave(win, menuItem.checked)
        }
      },
      { type: 'separator' },
      {
        label: t('menu.file.export'),
        submenu: exportItems
      },
      {
        label: t('menu.file.preview'),
        click(_menuItem, browserWindow) {
          invoke(browserWindow as BrowserWindow | undefined, 'marknoteproPreview')
        }
      },
      {
        label: t('menu.file.print'),
        accelerator: keybindings.getAccelerator('file.print') ?? undefined,
        click(_menuItem, browserWindow) {
          invoke(browserWindow as BrowserWindow | undefined, 'marknoteproPrint')
        }
      },
      { type: 'separator', visible: !isOsx },
      {
        label: t('menu.file.preferences'),
        accelerator: keybindings.getAccelerator('file.preferences') ?? undefined,
        visible: !isOsx,
        click() {
          userSetting()
        }
      },
      { type: 'separator' },
      {
        label: t('menu.file.closeTab'),
        accelerator: keybindings.getAccelerator('file.close-tab') ?? undefined,
        click(_menuItem, browserWindow) {
          fileActions.closeTab(browserWindow as BrowserWindow | undefined)
        }
      },
      {
        label: t('menu.file.closeWindow'),
        accelerator: keybindings.getAccelerator('file.close-window') ?? undefined,
        click(_menuItem, browserWindow) {
          fileActions.closeWindow(browserWindow as BrowserWindow | undefined)
        }
      },
      { type: 'separator', visible: !isOsx },
      {
        label: t('menu.file.quit'),
        accelerator: keybindings.getAccelerator('file.quit') ?? undefined,
        visible: !isOsx,
        click: app.quit
      }
    ]
  }
}
