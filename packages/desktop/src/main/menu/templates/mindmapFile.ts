import { app, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import { isOsx } from '../../config'
import { invokeMindMapMenuAction, type MindMapMenuAction } from '../../mindmap'
import { t } from '../../i18n'
import type Keybindings from '../../keyboard/shortcutHandler'
import * as fileActions from '../actions/file'
import { withTopLevelMenuMnemonic } from './mnemonics'

const invoke = (browserWindow: BrowserWindow | undefined, action: MindMapMenuAction): void => {
  if (browserWindow) invokeMindMapMenuAction(browserWindow, action)
}

/**
 * MindMap owns its own import and export dialogs, and a dedicated print pipeline.
 * The host menu routes commands into that UI, while saving stays on MarkNotePro's tab state path.
 */
export default function (keybindings: Keybindings, autoSave: boolean): MenuItemConstructorOptions {
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
      {
        label: t('menu.file.autoSave'),
        type: 'checkbox',
        id: 'autoSaveMenuItem',
        checked: autoSave,
        click(menuItem, browserWindow) {
          fileActions.autoSave(menuItem, browserWindow as BrowserWindow | undefined)
        }
      },
      { type: 'separator' },
      {
        label: t('menu.file.import'),
        click(_menuItem, browserWindow) {
          invoke(browserWindow as BrowserWindow | undefined, 'import')
        }
      },
      {
        label: t('menu.file.export'),
        click(_menuItem, browserWindow) {
          invoke(browserWindow as BrowserWindow | undefined, 'export')
        }
      },
      {
        label: t('menu.file.print'),
        accelerator: keybindings.getAccelerator('file.print') ?? undefined,
        click(_menuItem, browserWindow) {
          invoke(browserWindow as BrowserWindow | undefined, 'print')
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
