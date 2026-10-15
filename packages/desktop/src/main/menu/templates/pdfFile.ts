import { app, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import { isOsx } from '../../config'
import { t } from '../../i18n'
import type Keybindings from '../../keyboard/shortcutHandler'
import * as fileActions from '../actions/file'
import { withTopLevelMenuMnemonic } from './mnemonics'

export default function (keybindings: Keybindings): MenuItemConstructorOptions {
  return {
    label: withTopLevelMenuMnemonic('file', t('menu.file.file')),
    submenu: [
      {
        label: t('menu.file.save'),
        accelerator: keybindings.getAccelerator('file.save') ?? undefined,
        click(_menuItem, browserWindow) {
          fileActions.save(browserWindow as BrowserWindow | undefined)
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
