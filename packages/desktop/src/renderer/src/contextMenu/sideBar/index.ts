import {
  SEPARATOR,
  getNewFile,
  getNewDirectory,
  getNewGroup,
  getNewArea,
  getNewDocument,
  getCOPY,
  getCUT,
  getPASTE,
  getMOVE_TO,
  getRENAME,
  getDELETE,
  getShowInFolder,
  getExpandAll,
  getCollapseAll,
  getReloadWorkspace
} from './menuItems'
import { popupContextMenu, type ContextMenuItem } from '../popupMenu'
import { getNoteNodeKind } from '../../util/noteWorkspace'

const normalizeContextItems = (
  contextItems: ContextMenuItem[],
  hasPathCache: boolean
): ContextMenuItem[] => {
  for (const item of contextItems) {
    if (item?.id === 'pasteMenuItem') {
      item.enabled = hasPathCache
    }
  }

  return contextItems.map((item) => {
    if (!item || item.type === 'separator') return item
    const click = item.click
    return {
      ...item,
      click: click ? () => click(null, null) : undefined
    }
  })
}

export const showContextMenu = (
  event: { clientX: number; clientY: number },
  activeItem: {
    pathname: string
    name: string
    isDirectory?: boolean
    isFile?: boolean
    isMarkdown?: boolean
  } | null,
  rootPath: string | null,
  hasPathCache: boolean
): void => {
  const kind = getNoteNodeKind(activeItem, rootPath)
  let contextItems: ContextMenuItem[]

  if (kind === 'root') {
    contextItems = [
      getNewGroup(),
      getRENAME(),
      SEPARATOR,
      getExpandAll(),
      getCollapseAll(),
      SEPARATOR,
      getReloadWorkspace(),
      SEPARATOR,
      getShowInFolder()
    ]
  } else if (kind === 'group') {
    contextItems = [
      getNewGroup(),
      getNewArea(),
      SEPARATOR,
      getExpandAll(),
      getCollapseAll(),
      SEPARATOR,
      getMOVE_TO(),
      SEPARATOR,
      getRENAME(),
      getDELETE(),
      SEPARATOR,
      getShowInFolder()
    ]
  } else if (kind === 'area') {
    contextItems = [
      getNewDocument(),
      SEPARATOR,
      getExpandAll(),
      getCollapseAll(),
      SEPARATOR,
      getMOVE_TO(),
      SEPARATOR,
      getRENAME(),
      getDELETE(),
      SEPARATOR,
      getShowInFolder()
    ]
  } else if (kind === 'document') {
    contextItems = [
      getNewDocument(),
      SEPARATOR,
      getCOPY(),
      getMOVE_TO(),
      SEPARATOR,
      getRENAME(),
      getDELETE(),
      SEPARATOR,
      getShowInFolder()
    ]
  } else {
    contextItems = [
      getNewFile(),
      getNewDirectory(),
      SEPARATOR,
      getCOPY(),
      getCUT(),
      getPASTE(),
      SEPARATOR,
      getRENAME(),
      getDELETE(),
      SEPARATOR,
      getShowInFolder()
    ]
  }

  const items = normalizeContextItems(contextItems, hasPathCache)

  popupContextMenu(items, { x: event.clientX, y: event.clientY })
}
