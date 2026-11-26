import { registerBootInfo } from './bootInfo'
import { registerFsHandlers } from './fs'
import { registerPathHandlers } from './paths'
import { registerRipgrepHandlers } from './ripgrep'
import { registerFontsHandlers } from './fonts'
import { registerShellHandlers } from './shell'
import { registerWindowHandlers } from './window'
import { registerCmdHandlers } from './cmd'
import { registerI18nHandlers } from './i18n'
import { registerGitHubDesktopHandlers } from './githubDesktop'
import { registerDrawioHandlers } from '../drawio'
import { registerGeoGebraHandlers } from '../geogebra'
import { registerMindMapHandlers } from '../mindmap'
import { registerKdbxHandlers } from '../kdbx'
import { registerTerminalHandlers } from '../terminal'
import { registerClipboardIpcHandlers } from './clipboard'
import { registerLanShareHandlers } from '../lanShare'
import { registerMarkShareHandlers } from '../markShare'
import { registerWorkspaceMigrationHandlers } from '../workspaceMigration'

export const registerSandboxIpcHandlers = (): void => {
  registerBootInfo()
  registerFsHandlers()
  registerPathHandlers()
  registerRipgrepHandlers()
  registerFontsHandlers()
  registerShellHandlers()
  registerWindowHandlers()
  registerCmdHandlers()
  registerI18nHandlers()
  registerGitHubDesktopHandlers()
  registerDrawioHandlers()
  registerGeoGebraHandlers()
  registerMindMapHandlers()
  registerKdbxHandlers()
  registerTerminalHandlers()
  registerClipboardIpcHandlers()
  registerLanShareHandlers('marknotepro')
  registerMarkShareHandlers('marknotepro')
  registerWorkspaceMigrationHandlers('marknotepro')
}

