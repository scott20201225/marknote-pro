import { shell, type BrowserWindow } from 'electron'
import fs from 'fs'
import fsPromises from 'fs/promises'
import path from 'path'
import log from 'electron-log'
import { electronLocalshortcut, isValidElectronAccelerator } from '@hfelix/electron-localshortcut'
import { isFile2 } from 'common/filesystem'
import { isEqualAccelerator } from 'common/keybinding'
import { isLinux, isOsx } from '../config'
import { getKeyboardInfo, keyboardLayoutMonitor, type KeyboardInfo } from '../keyboard'
import keybindingsDarwin from './keybindingsDarwin'
import keybindingsLinux from './keybindingsLinux'
import keybindingsWindows from './keybindingsWindows'
import type { CommandManager } from '../commands'
import type { AppEnvironment } from '../app/env'

type ShortcutCallback = (win: BrowserWindow) => void

class Keybindings {
  configPath: string
  commandManager: CommandManager
  userKeybindings: Map<string, string>
  keys: Map<string, string>
  private terminalWindows = new Set<number>()
  private terminalFocusedWindows = new Set<number>()

  /**
   * @param commandManager The command manager instance.
   * @param appEnvironment The application environment instance.
   */
  constructor(commandManager: CommandManager, appEnvironment: AppEnvironment) {
    const { userDataPath } = appEnvironment.paths
    this.configPath = path.join(userDataPath, 'keybindings.json')
    this.commandManager = commandManager

    this.userKeybindings = new Map()
    this.keys = this.getDefaultKeybindings()
    this._prepareKeyMapper()

    if (appEnvironment.isDevMode) {
      for (const [id, accelerator] of this.keys) {
        if (!commandManager.has(id)) {
          console.error(
            `[DEBUG] Command with id="${id}" isn't available for accelerator="${accelerator}".`
          )
        }
      }
    }

    // Load user-defined keybindings
    this._loadLocalKeybindings()
  }

  getAccelerator(id: string): string | null {
    const name = this.keys.get(id)
    if (!name) {
      return null
    }
    return name
  }

  setTerminalMode(windowId: number, enabled: boolean): void {
    if (enabled) {
      this.terminalWindows.add(windowId)
    } else {
      this.terminalWindows.delete(windowId)
    }
  }

  isTerminalMode(windowId: number): boolean {
    return this.terminalWindows.has(windowId)
  }

  setTerminalFocus(windowId: number, focused: boolean): void {
    if (focused) {
      this.terminalFocusedWindows.add(windowId)
    } else {
      this.terminalFocusedWindows.delete(windowId)
    }
  }

  isTerminalFocused(windowId: number): boolean {
    return this.terminalFocusedWindows.has(windowId)
  }

  isTerminalBypassAccelerator(accelerator: string): boolean {
    const acc = accelerator.replace(/\s+/g, '').toLowerCase()
    const bypassList = [
      'ctrl+c',
      'ctrl+v',
      'ctrl+shift+c',
      'ctrl+shift+v',
      'ctrl+shift+a',
      'ctrl+z',
      'ctrl+shift+z',
      'ctrl+y',
      'ctrl+d',
      'ctrl+shift+d',
      'ctrl+a',
      'ctrl+e',
      'ctrl+k',
      'ctrl+shift+k',
      'ctrl+u',
      'ctrl+shift+u',
      'ctrl+l',
      'ctrl+r',
      'ctrl+shift+r',
      'ctrl+x',
      'ctrl+b',
      'ctrl+f',
      'ctrl+shift+f',
      'ctrl+g',
      'ctrl+shift+g',
      'ctrl+h',
      'ctrl+shift+h',
      'ctrl+j',
      'ctrl+shift+j',
      'ctrl+t',
      'ctrl+shift+t',
      // macOS terminal editing/navigation shortcuts must reach xterm instead of
      // being consumed by the editor's menu accelerators.
      'command+c',
      'command+v',
      'command+a',
      'command+k',
      'command+f',
      'command+x',
      'command+z',
      'command+shift+z',
      'command+shift+c',
      'command+shift+v',
      'command+shift+a'
    ]
    return bypassList.includes(acc)
  }

  registerAccelerator(win: BrowserWindow, accelerator: string, callback: ShortcutCallback): void {
    if (!win || !accelerator || !callback) {
      throw new Error(`addKeyHandler: invalid arguments (accelerator="${accelerator}").`)
    }

    // Register shortcuts on the BrowserWindow instead of using Chromium's native menu.
    // This makes it possible to receive key down events before Chromium/Electron and we
    // can handle reserved Chromium shortcuts. Afterwards prevent the default action of
    // the event so the native menu is not triggered.
    electronLocalshortcut.register(win, accelerator, () => {
      // Only release accelerators when the SSH terminal itself has focus, not
      // merely when a terminal tab is active: shortcuts must still work from
      // the sidebar, dialogs, or any other focused view in the same window.
      if (
        this.isTerminalMode(win.id) &&
        this.isTerminalFocused(win.id) &&
        this.isTerminalBypassAccelerator(accelerator)
      ) {
        return false
      }
      callback(win)
      return true // prevent default action
    })
  }

  unregisterAccelerator(win: BrowserWindow, accelerator: string): void {
    electronLocalshortcut.unregister(win, accelerator)
  }

  registerEditorKeyHandlers(win: BrowserWindow): void {
    for (const [id, accelerator] of this.keys) {
      if (accelerator && accelerator.length > 1) {
        this.registerAccelerator(win, accelerator, () => {
          this.commandManager.execute(id, win)
        })
      }
    }
  }

  openConfigInFileManager(): void {
    const { configPath } = this
    if (!isFile2(configPath)) {
      fs.writeFileSync(configPath, '{\n\n\n}\n', 'utf-8')
    }
    shell.openPath(configPath).catch((err: unknown) => console.error(err))
  }

  getDefaultKeybindings(): Map<string, string> {
    if (isOsx) {
      return keybindingsDarwin
    } else if (isLinux) {
      return keybindingsLinux
    }
    return keybindingsWindows
  }

  /**
   * Returns all user key bindings.
   *
   * @returns User key bindings.
   */
  getUserKeybindings(): Map<string, string> {
    return this.userKeybindings
  }

  /**
   * Sets and saves the given user key bindings on disk.
   *
   * @param userKeybindings New user key bindings.
   */
  async setUserKeybindings(
    userKeybindings: Map<string, string> | Iterable<readonly [string, string]>,
    windows: BrowserWindow[] = []
  ): Promise<boolean> {
    this.userKeybindings = new Map(userKeybindings)
    const saved = await this._saveUserKeybindings()
    this._reloadKeybindings(windows)
    return saved
  }

  /**
   * Rebuilds the active key map from the defaults plus the persisted user
   * keybindings and re-registers shortcuts on the given windows, so a change
   * takes effect without restarting the application.
   */
  _reloadKeybindings(windows: BrowserWindow[]): void {
    const previousAccelerators = [...this.keys.values()].filter(
      (accelerator) => accelerator && accelerator.length > 1
    )

    this.keys = this.getDefaultKeybindings()
    this._loadLocalKeybindings()

    for (const win of windows) {
      if (!win || win.isDestroyed()) {
        continue
      }
      for (const accelerator of previousAccelerators) {
        this.unregisterAccelerator(win, accelerator)
      }
      this.registerEditorKeyHandlers(win)
    }
  }

  // --- private --------------------------------

  _prepareKeyMapper(): void {
    // Update the key mapper to prevent problems on non-US keyboards.
    const { layout, keymap } = getKeyboardInfo()
    electronLocalshortcut.setKeyboardLayout(layout, keymap)

    // Notify key mapper when the keyboard layout was changed.
    keyboardLayoutMonitor.addListener(({ layout, keymap }: KeyboardInfo) => {
      const globalDebug = (globalThis as typeof globalThis & { MARKNOTEPRO_DEBUG?: boolean })
        .MARKNOTEPRO_DEBUG
      if (globalDebug && process.env.MARKNOTEPRO_DEBUG_KEYBOARD) {
        console.log('[DEBUG] Keyboard layout changed:\n', layout)
      }
      electronLocalshortcut.setKeyboardLayout(layout, keymap)
    })
  }

  async _saveUserKeybindings(): Promise<boolean> {
    const { configPath, userKeybindings } = this
    try {
      const userKeybindingJson = JSON.stringify(Object.fromEntries(userKeybindings), null, 2)
      await fsPromises.writeFile(configPath, userKeybindingJson, 'utf8')
      return true
    } catch {
      return false
    }
  }

  _loadLocalKeybindings(): void {
    const safeMode = (globalThis as typeof globalThis & { MARKNOTEPRO_SAFE_MODE?: boolean })
      .MARKNOTEPRO_SAFE_MODE
    if (safeMode || !isFile2(this.configPath)) {
      return
    }

    const rawUserKeybindings = this._loadUserKeybindingsFromDisk()
    if (!rawUserKeybindings) {
      log.warn('Invalid keybinding configuration: failed to load or parse file.')
      return
    }

    // keybindings.json example:
    // {
    //   "file.save": "CmdOrCtrl+S",
    //   "file.save-as": "CmdOrCtrl+Shift+S"
    // }

    const userAccelerators: Map<string, string> = new Map()
    for (const key in rawUserKeybindings) {
      if (this.keys.has(key)) {
        const value = rawUserKeybindings[key]
        if (typeof value === 'string') {
          if (value.length === 0) {
            // Unset key
            userAccelerators.set(key, '')
          } else if (isValidElectronAccelerator(value)) {
            userAccelerators.set(key, value)
          } else {
            console.error(`[WARNING] "${value}" is not a valid accelerator.`)
          }
        }
      }
    }

    // Check for duplicate user shortcuts
    for (const [keyA, valueA] of userAccelerators) {
      for (const [keyB, valueB] of userAccelerators) {
        if (valueA !== '' && keyA !== keyB && isEqualAccelerator(valueA, valueB)) {
          const err = `Invalid keybindings.json configuration: Duplicate value for "${keyA}" and "${keyB}"!`
          console.log(err)
          log.error(err)
          return
        }
      }
    }

    if (userAccelerators.size === 0) {
      return
    }

    // Deep clone shortcuts
    const accelerators = new Map(this.keys)

    // Check for duplicate shortcuts
    for (const [userKey, userValue] of userAccelerators) {
      // Only search for conflicts when the user actually bound a key. Empty means "unbound"
      // and would incorrectly match any other default-empty entry via isEqualAccelerator.
      if (userValue) {
        for (const [key, value] of accelerators) {
          // This is a workaround to unset key bindings that the user used in `keybindings.json` before
          // proper settings. Keep this for now, but add the ID to the users key binding that we show the
          // right bindings in settings.
          if (isEqualAccelerator(value, userValue)) {
            // Unset default key
            accelerators.set(key, '')

            // This entry is actually unset because the user used the accelerator.
            if (userAccelerators.get(key) == null) {
              userAccelerators.set(key, '')
            }

            // A accelerator should only exist once in the default map.
            break
          }
        }
      }
      accelerators.set(userKey, userValue)
    }

    // Update key bindings
    this.keys = accelerators

    // Save user keybindings for settings
    this.userKeybindings = userAccelerators
  }

  _loadUserKeybindingsFromDisk(): Record<string, unknown> | null {
    try {
      const obj = JSON.parse(fs.readFileSync(this.configPath, 'utf8'))
      if (typeof obj !== 'object') {
        return null
      }
      return obj
    } catch {
      return null
    }
  }
}

export default Keybindings
