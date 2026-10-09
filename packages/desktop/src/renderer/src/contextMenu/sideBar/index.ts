import {
  SEPARATOR,
  getNewFile,
  getNewDrawing,
  getNewKdbx,
  getNewGeoGebraMenu,
  getNewMindMapMenu,
  getNewDirectory,
  getNewGroup,
  getNewArea,
  getNewDocument,
  getCOPY,
  getCopyPath,
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
      getNewMindMapMenu(),
      getNewDrawing(),
      getNewGeoGebraMenu(),
      getNewKdbx(),
      getNewGroup(),
      getRENAME(),
      SEPARATOR,
      getExpandAll(),
      getCollapseAll(),
      SEPARATOR,
      getReloadWorkspace(),
      SEPARATOR,
      getCopyPath(),
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
      getCopyPath(),
      SEPARATOR,
      getShowInFolder()
    ]
  } else if (kind === 'area') {
    contextItems = [
      getNewDocument(),
      getNewMindMapMenu(),
      getNewDrawing(),
      getNewGeoGebraMenu(),
      getNewKdbx(),
      SEPARATOR,
      getExpandAll(),
      getCollapseAll(),
      SEPARATOR,
      getMOVE_TO(),
      SEPARATOR,
      getRENAME(),
      getDELETE(),
      SEPARATOR,
      getCopyPath(),
      SEPARATOR,
      getShowInFolder()
    ]
  } else if (kind === 'document') {
    contextItems = [
      getNewDocument(),
      getNewMindMapMenu(),
      getNewDrawing(),
      getNewGeoGebraMenu(),
      getNewKdbx(),
      SEPARATOR,
      getCOPY(),
      getMOVE_TO(),
      SEPARATOR,
      getRENAME(),
      getDELETE(),
      SEPARATOR,
      getCopyPath(),
      SEPARATOR,
      getShowInFolder()
    ]
  } else {
    contextItems = [
      getNewFile(),
      getNewMindMapMenu(),
      getNewDrawing(),
      getNewGeoGebraMenu(),
      getNewKdbx(),
      getNewDirectory(),
      SEPARATOR,
      getCOPY(),
      getCUT(),
      getPASTE(),
      SEPARATOR,
      getRENAME(),
      getDELETE(),
      SEPARATOR,
      getCopyPath(),
      SEPARATOR,
      getShowInFolder()
    ]
  }

  const items = normalizeContextItems(contextItems, hasPathCache)

  popupContextMenu(items, { x: event.clientX, y: event.clientY })
}

export const showNoteListContextMenu = (
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
      getNewMindMapMenu(),
      getNewDrawing(),
      getNewGeoGebraMenu(),
      getNewKdbx(),
      getNewGroup(),
      SEPARATOR,
      getRENAME(),
      SEPARATOR,
      getCopyPath(),
      SEPARATOR,
      getShowInFolder()
    ]
  } else if (kind === 'group') {
    contextItems = [
      getNewArea(),
      SEPARATOR,
      getMOVE_TO(),
      SEPARATOR,
      getRENAME(),
      getDELETE(),
      SEPARATOR,
      getCopyPath(),
      SEPARATOR,
      getShowInFolder()
    ]
  } else if (kind === 'area') {
    contextItems = [
      getNewDocument(),
      getNewMindMapMenu(),
      getNewDrawing(),
      getNewGeoGebraMenu(),
      getNewKdbx(),
      SEPARATOR,
      getMOVE_TO(),
      SEPARATOR,
      getRENAME(),
      getDELETE(),
      SEPARATOR,
      getCopyPath(),
      SEPARATOR,
      getShowInFolder()
    ]
  } else if (kind === 'document') {
    contextItems = [
      getNewDocument(),
      getNewMindMapMenu(),
      getNewDrawing(),
      getNewGeoGebraMenu(),
      getNewKdbx(),
      SEPARATOR,
      getMOVE_TO(),
      SEPARATOR,
      getRENAME(),
      getDELETE(),
      SEPARATOR,
      getCopyPath(),
      SEPARATOR,
      getShowInFolder()
    ]
  } else {
    contextItems = [
      getNewDocument(),
      getNewMindMapMenu(),
      getNewDrawing(),
      getNewGeoGebraMenu(),
      getNewKdbx(),
      SEPARATOR,
      getPASTE(),
      getCopyPath()
    ]
  }

  const items = normalizeContextItems(contextItems, hasPathCache)

  popupContextMenu(items, { x: event.clientX, y: event.clientY })
}
