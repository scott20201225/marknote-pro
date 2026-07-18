import path from 'path'
import { shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import { isFile } from 'common/filesystem'
import * as actions from '../actions/help'
import { checkUpdates } from '../actions/marknotepro'
import { t } from '../../i18n'
import { withTopLevelMenuMnemonic } from './mnemonics'

const REPO_URL = 'https://github.com/scott20201225/marknote-pro'
const REPO_BRANCH = 'main'
const END_USER_DOCS_URL = `${REPO_URL}/blob/${REPO_BRANCH}/packages/website/content/docs/end-user`

/// Check whether the package is updatable at runtime.
const isUpdatable = (): boolean => {
  // TODO: If not updatable, allow to check whether there is a new version available.

  const resFile = isFile(path.join(process.resourcesPath, 'app-update.yml'))
  if (!resFile) {
    // No update resource file available.
    return false
  } else if (process.env.APPIMAGE) {
    // We are running as AppImage.
    return true
  } else if (process.platform === 'win32' && isFile(path.join(process.resourcesPath, 'md.ico'))) {
    // Windows is a little but tricky. The update resource file is always available and
    // there is no way to check the target type at runtime (electron-builder#4119).
    // As workaround we check whether "md.ico" exists that is only included in the setup.
    return true
  }

  // Otherwise assume that we cannot perform an auto update (standalone binary, archives,
  // packed for package manager).
  return false
}

export default function(): MenuItemConstructorOptions {
  const submenu: MenuItemConstructorOptions[] = [
    {
      label: t('menu.help.markdownReference'),
      click() {
        shell.openExternal(`${END_USER_DOCS_URL}/MARKDOWN_SYNTAX.md`)
      }
    },
    {
      label: t('menu.help.changelog'),
      click() {
        shell.openExternal(`${REPO_URL}/releases`)
      }
    },
    {
      type: 'separator'
    },
    {
      label: t('menu.help.followUs'),
      click() {
        shell.openExternal('https://github.com/scott20201225')
      }
    },
    {
      label: t('menu.help.support'),
      click() {
        shell.openExternal('https://github.com/scott20201225')
      }
    },
    {
      type: 'separator'
    },
    {
      label: t('menu.help.askQuestion'),
      click() {
        shell.openExternal(`${REPO_URL}/discussions`)
      }
    },
    {
      label: t('menu.help.reportBug'),
      click() {
        shell.openExternal(`${REPO_URL}/issues`)
      }
    },
    {
      label: t('menu.help.viewSource'),
      click() {
        shell.openExternal(REPO_URL)
      }
    },
    {
      type: 'separator'
    },
    {
      label: t('menu.help.license'),
      click() {
        shell.openExternal(`${REPO_URL}/blob/${REPO_BRANCH}/LICENSE`)
      }
    }
  ]

  const helpMenu: MenuItemConstructorOptions = {
    label: withTopLevelMenuMnemonic('help', t('menu.help.help')),
    role: 'help',
    submenu
  }

  if (isUpdatable()) {
    submenu.push(
      {
        type: 'separator'
      },
      {
        label: t('menu.help.checkUpdates'),
        click(_menuItem, browserWindow) {
          checkUpdates((browserWindow as BrowserWindow | undefined) ?? null)
        }
      }
    )
  }

  if (process.platform !== 'darwin') {
    submenu.push(
      {
        type: 'separator'
      },
      {
        label: t('menu.help.about'),
        click(_menuItem, browserWindow) {
          actions.showAboutDialog(browserWindow as BrowserWindow | undefined)
        }
      }
    )
  }
  return helpMenu
}
