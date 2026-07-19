import { app, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import * as actions from '../actions/file'
import { userSetting } from '../actions/marknotepro'
import { isOsx } from '../../config'
import { t } from '../../i18n'
import type Keybindings from '../../keyboard/shortcutHandler'
import type Preference from '../../preferences'
import { withTopLevelMenuMnemonic } from './mnemonics'

export default function(
  keybindings: Keybindings,
  userPreference: Preference,
  _recentlyUsedFiles: string[]
): MenuItemConstructorOptions {
  const { autoSave } = userPreference.getAll() as { autoSave?: boolean }
  const submenu: MenuItemConstructorOptions[] = []

  const fileMenu: MenuItemConstructorOptions = {
    label: withTopLevelMenuMnemonic('file', t('menu.file.file')),
    submenu
  }

  submenu.push(
    {
      label: t('menu.file.save'),
      accelerator: keybindings.getAccelerator('file.save') ?? undefined,
      click(_menuItem, browserWindow) {
        actions.save(browserWindow as BrowserWindow | undefined)
      }
    },
    {
      label: t('menu.file.autoSave'),
      type: 'checkbox',
      checked: !!autoSave,
      id: 'autoSaveMenuItem',
      click(menuItem, browserWindow) {
        actions.autoSave(menuItem, browserWindow as BrowserWindow | undefined)
      }
    },
    {
      type: 'separator'
    },
    {
      label: t('menu.file.export'),
      submenu: [
        {
          label: t('menu.file.exportMd'),
          click(_menuItem, browserWindow) {
            actions.exportFile(browserWindow as BrowserWindow | undefined, 'md')
          }
        },
        {
          label: t('menu.file.exportHtml'),
          click(_menuItem, browserWindow) {
            actions.exportFile(browserWindow as BrowserWindow | undefined, 'styledHtml')
          }
        },
        {
          label: t('menu.file.exportWord'),
          click(_menuItem, browserWindow) {
            actions.exportFile(browserWindow as BrowserWindow | undefined, 'docx')
          }
        },
        {
          label: t('menu.file.exportPng'),
          click(_menuItem, browserWindow) {
            actions.exportFile(browserWindow as BrowserWindow | undefined, 'png')
          }
        },
        {
          label: t('menu.file.exportJpeg'),
          click(_menuItem, browserWindow) {
            actions.exportFile(browserWindow as BrowserWindow | undefined, 'jpeg')
          }
        },
        {
          label: t('menu.file.exportPdf'),
          accelerator: keybindings.getAccelerator('file.export-file.pdf') ?? undefined,
          click(_menuItem, browserWindow) {
            actions.exportFile(browserWindow as BrowserWindow | undefined, 'pdf')
          }
        }
      ]
    },
    {
      label: t('menu.file.print'),
      accelerator: keybindings.getAccelerator('file.print') ?? undefined,
      click(_menuItem, browserWindow) {
        actions.printDocument(browserWindow as BrowserWindow | undefined)
      }
    },
    {
      type: 'separator',
      visible: !isOsx
    },
    {
      label: t('menu.file.preferences'),
      accelerator: keybindings.getAccelerator('file.preferences') ?? undefined,
      visible: !isOsx,
      click() {
        userSetting()
      }
    },
    {
      type: 'separator'
    },
    {
      label: t('menu.file.closeTab'),
      accelerator: keybindings.getAccelerator('file.close-tab') ?? undefined,
      click(_menuItem, browserWindow) {
        actions.closeTab(browserWindow as BrowserWindow | undefined)
      }
    },
    {
      label: t('menu.file.closeWindow'),
      accelerator: keybindings.getAccelerator('file.close-window') ?? undefined,
      click(_menuItem, browserWindow) {
        actions.closeWindow(browserWindow as BrowserWindow | undefined)
      }
    },
    {
      type: 'separator',
      visible: !isOsx
    },
    {
      label: t('menu.file.quit'),
      accelerator: keybindings.getAccelerator('file.quit') ?? undefined,
      visible: !isOsx,
      click: app.quit
    }
  )
  return fileMenu
}
