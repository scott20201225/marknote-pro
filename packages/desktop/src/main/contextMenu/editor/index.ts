import { Menu, MenuItem, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import {
  getCUT,
  getCOPY,
  getPASTE,
  getCopyAsRich,
  getCopyAsHtml,
  getCopyAsExcel,
  getPasteAsPlainText,
  SEPARATOR,
  getInsertBefore,
  getInsertAfter,
  getHyperlink,
  getOrderedList,
  getBulletList,
  getTaskList,
  getTaskStatus,
  getIndentList,
  getOutdentList
} from './menuItems'
import spellcheckMenuBuilder from './spellcheck'
import { getCopyMenuAvailability, type EditorContextState } from './state'
import { t } from '../../i18n'

// Electron's ContextMenuParams shape we rely on. Kept narrow — the renderer
// supplies the full surface so we only annotate the fields we use.
interface ContextMenuParams {
  isEditable: boolean
  hasImageContents?: boolean
  selectionText: string
  inputFieldType?: string
  editFlags: {
    canCut: boolean
    canCopy: boolean
    canPaste: boolean
    canEditRichly: boolean
  }
  misspelledWord?: string
  dictionarySuggestions?: string[]
  // Coordinates of the context-menu request. Electron names them `x`/`y` on
  // the params (not the event); the renderer passes them through unchanged.
  x: number
  y: number
}

// Electron `webContents.on('context-menu', (event, params) => ...)` provides
// a simple event object with preventDefault — nothing on it is consumed by
// this function, so we keep the type minimal.
type ContextMenuEvent = {
  preventDefault?: () => void
  readonly defaultPrevented?: boolean
}

interface ParagraphContextState {
  canCreateOrderedList: boolean
  canCreateBulletList: boolean
  canCreateTaskList: boolean
  canSetTaskStatus: boolean
  inOrderedList: boolean
  inBulletList: boolean
}

const COPY_RELATED_MENU_IDS = new Set([
  'copyMenuItem',
  'copyAsRichMenuItem',
  'copyAsHtmlMenuItem',
  'copyAsExcelMenuItem'
])
const CUT_RELATED_MENU_IDS = new Set(['cutMenuItem'])

const hasSelectedText = (selectionText: string): boolean => selectionText.trim().length > 0
const hasLineBreak = (selectionText: string): boolean => /[\r\n]/.test(selectionText)

const getEditorContextState = async (win: BrowserWindow): Promise<EditorContextState | null> => {
  try {
    return (await win.webContents.executeJavaScript(
      'window.__MARKTEXTPRO_GET_EDITOR_CONTEXT_STATE__?.() ?? null',
      true
    )) as EditorContextState | null
  } catch {
    return null
  }
}

const getParagraphContextState = (): ParagraphContextState => {
  const appMenu = Menu.getApplicationMenu()
  if (!appMenu) {
    return {
      canCreateOrderedList: false,
      canCreateBulletList: false,
      canCreateTaskList: false,
      canSetTaskStatus: false,
      inOrderedList: false,
      inBulletList: false
    }
  }

  const orderedListMenuItem = appMenu.getMenuItemById('orderListMenuItem')
  const bulletListMenuItem = appMenu.getMenuItemById('bulletListMenuItem')
  const taskListMenuItem = appMenu.getMenuItemById('taskListMenuItem')
  const taskStatusMenuItem = appMenu.getMenuItemById('taskStatusMenuItem')

  return {
    canCreateOrderedList: !!orderedListMenuItem?.enabled,
    canCreateBulletList: !!bulletListMenuItem?.enabled,
    canCreateTaskList: !!taskListMenuItem?.enabled,
    canSetTaskStatus: !!taskStatusMenuItem?.enabled,
    inOrderedList: !!orderedListMenuItem?.checked,
    inBulletList: !!bulletListMenuItem?.checked
  }
}

// Dynamically fetch menu items to ensure correct translation
const getContextItems = (
  selectionText: string,
  editorContextState: EditorContextState | null = null
): MenuItemConstructorOptions[] => {
  const items: MenuItemConstructorOptions[] = [getInsertBefore(), getInsertAfter()]
  const {
    canCreateOrderedList,
    canCreateBulletList,
    canCreateTaskList,
    canSetTaskStatus,
    inOrderedList,
    inBulletList
  } = getParagraphContextState()
  const shouldShowParagraphListActions = hasSelectedText(selectionText)
  const shouldShowLineHyperlinkAction =
    !hasSelectedText(selectionText) && editorContextState?.hasTableSelection !== true
  const shouldShowTaskStatusActions =
    canSetTaskStatus && hasSelectedText(selectionText) && hasLineBreak(selectionText)
  const shouldShowListIndentation =
    (inOrderedList || inBulletList) &&
    (!hasSelectedText(selectionText) || !hasLineBreak(selectionText))
  const shouldShowCopyAsExcel = editorContextState?.hasTableSelection === true

  if (shouldShowLineHyperlinkAction) {
    items.push(getHyperlink())
  }

  if (shouldShowParagraphListActions) {
    const paragraphItems: MenuItemConstructorOptions[] = []
    if (canCreateOrderedList) paragraphItems.push(getOrderedList())
    if (canCreateBulletList) paragraphItems.push(getBulletList())
    if (canCreateTaskList) paragraphItems.push(getTaskList())

    if (paragraphItems.length > 0) {
      items.push(SEPARATOR, ...paragraphItems)
    }
  }

  if (shouldShowTaskStatusActions) {
    items.push(SEPARATOR, getTaskStatus())
  }

  if (shouldShowListIndentation) {
    items.push(SEPARATOR, getIndentList(), getOutdentList())
  }

  items.push(
    SEPARATOR,
    getCUT(),
    getCOPY(),
    getPASTE(),
    SEPARATOR,
    getCopyAsRich(),
    getCopyAsHtml(),
    ...(shouldShowCopyAsExcel ? [getCopyAsExcel()] : []),
    getPasteAsPlainText()
  )

  return items
}

const isInsideEditor = (params: ContextMenuParams): boolean => {
  const { isEditable, editFlags, inputFieldType } = params
  // WORKAROUND for Electron#32102: `params.spellcheckEnabled` is always false. Try to detect the editor container via other information.
  return isEditable && !inputFieldType && !!editFlags.canEditRichly
}

const popupEditorContextMenu = async (
  win: BrowserWindow,
  event: ContextMenuEvent,
  params: ContextMenuParams,
  isSpellcheckerEnabled: boolean
): Promise<void> => {
  const {
    isEditable,
    hasImageContents,
    selectionText,
    editFlags,
    misspelledWord,
    dictionarySuggestions
  } = params

  // NOTE: We have to get the word suggestions from this event because `webFrame.getWordSuggestions` and
  //       `webFrame.isWordMisspelled` doesn't work on Windows (Electron#28684).

  // Make sure that the request comes from a contenteditable inside the editor container.
  if (isInsideEditor(params) && !hasImageContents) {
    const editorContextState = await getEditorContextState(win)
    const copyMenuAvailability = getCopyMenuAvailability(
      {
        selectionText,
        editFlags
      },
      editorContextState
    )
    const isMisspelled = isEditable && !!selectionText && !!misspelledWord

    const menu = new Menu()
    if (isSpellcheckerEnabled) {
      const spellingSubmenu = spellcheckMenuBuilder(
        isMisspelled,
        misspelledWord,
        dictionarySuggestions
      )
      menu.append(
        new MenuItem({
          label: t('contextMenu.spelling'),
          submenu: spellingSubmenu as Electron.MenuItemConstructorOptions[]
        })
      )
      menu.append(new MenuItem(SEPARATOR))
    }

    const contextItems = getContextItems(selectionText, editorContextState)
    contextItems.forEach((item) => {
      if (!item.id) {
        return
      }

      if (CUT_RELATED_MENU_IDS.has(item.id)) {
        item.enabled = copyMenuAvailability.canCut
      } else if (COPY_RELATED_MENU_IDS.has(item.id)) {
        item.enabled = copyMenuAvailability.canCopy
      }
    })
    contextItems.forEach((item) => {
      menu.append(new MenuItem(item))
    })
    // The original JS passes an array literal here, which Electron treats as
    // the options object. Cast to satisfy the typed overload.
    // The original JS passed an array literal — Electron tolerated it. The
    // typed overload wants an options object, so produce one explicitly.
    // `event` is intentionally unused (params carries x/y); the function
    // signature keeps it to mirror the webContents.on('context-menu', ...)
    // (event, params) shape.
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    event
    menu.popup({ window: win, x: params.x, y: params.y })
  }
}

export const showEditorContextMenu = (
  win: BrowserWindow,
  event: ContextMenuEvent,
  params: ContextMenuParams,
  isSpellcheckerEnabled: boolean
): void => {
  void popupEditorContextMenu(win, event, params, isSpellcheckerEnabled)
}
