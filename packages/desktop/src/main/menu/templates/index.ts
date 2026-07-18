import { type MenuItemConstructorOptions } from 'electron'
import edit from './edit'
import prefEdit from './prefEdit'
import file from './file'
import help from './help'
import marknotepro from './marknotepro'
import view from './view'
import window from './window'
import paragraph from './paragraph'
import format from './format'
import language from './language'
import theme from './theme'
import type Keybindings from '../../keyboard/shortcutHandler'
import type Preference from '../../preferences'

export { default as dockMenu } from './dock'

/**
 * Create the setting window menu.
 *
 * @param keybindings The keybindings instance
 */
export const configSettingMenu = (keybindings: Keybindings): MenuItemConstructorOptions[] => {
  return [
    ...(process.platform === 'darwin' ? [marknotepro(keybindings)] : []),
    prefEdit(keybindings),
    help()
  ]
}

/**
 * Create the application menu for the editor window.
 *
 * @param keybindings The keybindings instance.
 * @param preferences The preference instance.
 * @param recentlyUsedFiles The recently used files.
 */
export default function(
  keybindings: Keybindings,
  preferences: Preference,
  recentlyUsedFiles: string[] = []
): MenuItemConstructorOptions[] {
  return [
    ...(process.platform === 'darwin' ? [marknotepro(keybindings)] : []),
    file(keybindings, preferences, recentlyUsedFiles),
    edit(keybindings),
    paragraph(keybindings),
    format(keybindings),
    window(keybindings),
    theme(preferences),
    language(preferences),
    view(keybindings),
    help()
  ]
}
