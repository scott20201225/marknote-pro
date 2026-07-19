import bus from '../../bus'

type MenuItemArg = unknown
type BrowserWindowArg = unknown

export const newFile = (_menuItem?: MenuItemArg, _browserWindow?: BrowserWindowArg): void => {
  bus.emit('SIDEBAR::new', 'file')
}

export const newDirectory = (_menuItem?: MenuItemArg, _browserWindow?: BrowserWindowArg): void => {
  bus.emit('SIDEBAR::new', 'directory')
}

export const newGroup = (_menuItem?: MenuItemArg, _browserWindow?: BrowserWindowArg): void => {
  bus.emit('SIDEBAR::new', 'group')
}

export const newArea = (_menuItem?: MenuItemArg, _browserWindow?: BrowserWindowArg): void => {
  bus.emit('SIDEBAR::new', 'area')
}

export const newDocument = (_menuItem?: MenuItemArg, _browserWindow?: BrowserWindowArg): void => {
  bus.emit('SIDEBAR::new', 'document')
}

export const copy = (_menuItem?: MenuItemArg, _browserWindow?: BrowserWindowArg): void => {
  bus.emit('SIDEBAR::copy-cut', 'copy')
}

export const cut = (_menuItem?: MenuItemArg, _browserWindow?: BrowserWindowArg): void => {
  bus.emit('SIDEBAR::copy-cut', 'cut')
}

export const paste = (_menuItem?: MenuItemArg, _browserWindow?: BrowserWindowArg): void => {
  bus.emit('SIDEBAR::paste')
}

export const rename = (_menuItem?: MenuItemArg, _browserWindow?: BrowserWindowArg): void => {
  bus.emit('SIDEBAR::rename')
}

export const remove = (_menuItem?: MenuItemArg, _browserWindow?: BrowserWindowArg): void => {
  bus.emit('SIDEBAR::remove')
}

export const showInFolder = (_menuItem?: MenuItemArg, _browserWindow?: BrowserWindowArg): void => {
  bus.emit('SIDEBAR::show-in-folder')
}

export const expandAll = (_menuItem?: MenuItemArg, _browserWindow?: BrowserWindowArg): void => {
  bus.emit('SIDEBAR::expand-all')
}

export const collapseAll = (_menuItem?: MenuItemArg, _browserWindow?: BrowserWindowArg): void => {
  bus.emit('SIDEBAR::collapse-all')
}
