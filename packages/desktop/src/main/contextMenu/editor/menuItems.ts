// NOTE: This are mutable fields that may change at runtime.

import { type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import { t } from '../../i18n'

const LIST_INDENT_ACCELERATOR = process.platform === 'darwin' ? 'Command+]' : 'Ctrl+]'
const LIST_OUTDENT_ACCELERATOR = process.platform === 'darwin' ? 'Command+[' : 'Ctrl+['
const HYPERLINK_ACCELERATOR = process.platform === 'darwin' ? 'Command+L' : 'Ctrl+L'

// Use function form to avoid calling the translation function during module load
export const getCUT = (): MenuItemConstructorOptions => ({
  label: t('contextMenu.cut'),
  id: 'cutMenuItem',
  role: 'cut'
})

export const getCOPY = (): MenuItemConstructorOptions => ({
  label: t('contextMenu.copy'),
  id: 'copyMenuItem',
  role: 'copy'
})

export const getPASTE = (): MenuItemConstructorOptions => ({
  label: t('contextMenu.paste'),
  id: 'pasteMenuItem',
  role: 'paste'
})

export const getCopyAsRich = (): MenuItemConstructorOptions => ({
  label: t('contextMenu.copyAsRich'),
  id: 'copyAsRichMenuItem',
  click(_menuItem, targetWindow) {
    if (targetWindow) {
      ;(targetWindow as BrowserWindow).webContents.send('mt::cm-copy-as-rich')
    }
  }
})

export const getCopyAsHtml = (): MenuItemConstructorOptions => ({
  label: t('contextMenu.copyAsHtml'),
  id: 'copyAsHtmlMenuItem',
  click(_menuItem, targetWindow) {
    if (targetWindow) {
      ;(targetWindow as BrowserWindow).webContents.send('mt::cm-copy-as-html')
    }
  }
})

export const getCopyAsExcel = (): MenuItemConstructorOptions => ({
  label: t('contextMenu.copyAsExcel'),
  id: 'copyAsExcelMenuItem',
  click(_menuItem, targetWindow) {
    if (targetWindow) {
      ;(targetWindow as BrowserWindow).webContents.send('mt::cm-copy-as-excel')
    }
  }
})

export const getTableBatchEdit = (): MenuItemConstructorOptions => ({
  label: t('contextMenu.tableBatchEdit'),
  id: 'tableBatchEditMenuItem',
  click(_menuItem, targetWindow) {
    if (targetWindow) {
      ;(targetWindow as BrowserWindow).webContents.send('mt::cm-table-batch-edit')
    }
  }
})

export const getPasteAsPlainText = (): MenuItemConstructorOptions => ({
  label: t('contextMenu.pasteAsPlainText'),
  id: 'pasteAsPlainTextMenuItem',
  click(_menuItem, targetWindow) {
    if (targetWindow) {
      ;(targetWindow as BrowserWindow).webContents.send('mt::cm-paste-as-plain-text')
    }
  }
})

export const getInsertBefore = (): MenuItemConstructorOptions => ({
  label: t('contextMenu.insertParagraphBefore'),
  id: 'insertParagraphBeforeMenuItem',
  click(_menuItem, targetWindow) {
    if (targetWindow) {
      ;(targetWindow as BrowserWindow).webContents.send('mt::cm-insert-paragraph', 'before')
    }
  }
})

export const getInsertAfter = (): MenuItemConstructorOptions => ({
  label: t('contextMenu.insertParagraphAfter'),
  id: 'insertParagraphAfterMenuItem',
  click(_menuItem, targetWindow) {
    if (targetWindow) {
      ;(targetWindow as BrowserWindow).webContents.send('mt::cm-insert-paragraph', 'after')
    }
  }
})

export const getHyperlink = (): MenuItemConstructorOptions => ({
  label: t('menu.format.hyperlink'),
  id: 'contextHyperlinkMenuItem',
  accelerator: HYPERLINK_ACCELERATOR,
  click(_menuItem, targetWindow) {
    if (targetWindow) {
      ;(targetWindow as BrowserWindow).webContents.send('mt::editor-format-action', {
        type: 'link'
      })
    }
  }
})

export const getOrderedList = (): MenuItemConstructorOptions => ({
  label: t('menu.paragraph.orderedList'),
  id: 'contextOrderListMenuItem',
  click(_menuItem, targetWindow) {
    if (targetWindow) {
      ;(targetWindow as BrowserWindow).webContents.send('mt::editor-paragraph-action', {
        type: 'ol-order'
      })
    }
  }
})

export const getBulletList = (): MenuItemConstructorOptions => ({
  label: t('menu.paragraph.bulletList'),
  id: 'contextBulletListMenuItem',
  click(_menuItem, targetWindow) {
    if (targetWindow) {
      ;(targetWindow as BrowserWindow).webContents.send('mt::editor-paragraph-action', {
        type: 'ul-bullet'
      })
    }
  }
})

export const getTaskList = (): MenuItemConstructorOptions => ({
  label: t('menu.paragraph.taskList'),
  id: 'contextTaskListMenuItem',
  click(_menuItem, targetWindow) {
    if (targetWindow) {
      ;(targetWindow as BrowserWindow).webContents.send('mt::editor-paragraph-action', {
        type: 'ul-task'
      })
    }
  }
})

export const getTaskStatus = (): MenuItemConstructorOptions => ({
  label: t('menu.paragraph.taskStatus'),
  id: 'contextTaskStatusMenuItem',
  submenu: [
    {
      label: t('menu.paragraph.markAsComplete'),
      id: 'contextMarkTaskCompleteMenuItem',
      click(_menuItem, targetWindow) {
        if (targetWindow) {
          ;(targetWindow as BrowserWindow).webContents.send('mt::editor-paragraph-action', {
            type: 'task-status-complete'
          })
        }
      }
    },
    {
      label: t('menu.paragraph.markAsIncomplete'),
      id: 'contextMarkTaskIncompleteMenuItem',
      click(_menuItem, targetWindow) {
        if (targetWindow) {
          ;(targetWindow as BrowserWindow).webContents.send('mt::editor-paragraph-action', {
            type: 'task-status-incomplete'
          })
        }
      }
    }
  ]
})

export const getIndentList = (): MenuItemConstructorOptions => ({
  label: t('menu.paragraph.indent'),
  id: 'contextIndentListMenuItem',
  accelerator: LIST_INDENT_ACCELERATOR,
  click(_menuItem, targetWindow) {
    if (targetWindow) {
      ;(targetWindow as BrowserWindow).webContents.send('mt::editor-paragraph-action', {
        type: 'list-indent'
      })
    }
  }
})

export const getOutdentList = (): MenuItemConstructorOptions => ({
  label: t('menu.paragraph.outdent'),
  id: 'contextOutdentListMenuItem',
  accelerator: LIST_OUTDENT_ACCELERATOR,
  click(_menuItem, targetWindow) {
    if (targetWindow) {
      ;(targetWindow as BrowserWindow).webContents.send('mt::editor-paragraph-action', {
        type: 'list-outdent'
      })
    }
  }
})

// Retained for backward compatibility
export const CUT = getCUT()
export const COPY = getCOPY()
export const PASTE = getPASTE()
export const COPY_AS_RICH = getCopyAsRich()
export const COPY_AS_HTML = getCopyAsHtml()
export const COPY_AS_EXCEL = getCopyAsExcel()
export const PASTE_AS_PLAIN_TEXT = getPasteAsPlainText()
export const INSERT_BEFORE = getInsertBefore()
export const INSERT_AFTER = getInsertAfter()
export const HYPERLINK = getHyperlink()
export const ORDERED_LIST = getOrderedList()
export const BULLET_LIST = getBulletList()
export const TASK_LIST = getTaskList()
export const TASK_STATUS = getTaskStatus()
export const INDENT_LIST = getIndentList()
export const OUTDENT_LIST = getOutdentList()

export const SEPARATOR: MenuItemConstructorOptions = {
  type: 'separator'
}
