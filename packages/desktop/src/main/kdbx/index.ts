import fs from 'fs/promises'
import path from 'path'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { Consts, Kdbx, KdbxCredentials, ProtectedValue } from 'kdbxweb'
import type { KdbxEntry, KdbxGroup } from 'kdbxweb'
import { writeFile } from '../filesystem'
import type {
  KdbxAttachment,
  KdbxEntryDetail,
  KdbxEntryHistoryItem,
  KdbxEntryInput,
  KdbxEntryRevision,
  KdbxEntrySummary,
  KdbxField,
  KdbxGroupSummary,
  KdbxVaultSnapshot
} from '../../shared/types/kdbx'
import { isKdbxPasswordValid } from '../../shared/kdbxPassword'

const KDBX_EXTENSION = '.kdbx'
const KDBXE_EXTENSION = '.kdbxe'
const MAX_ENTRY_HISTORY = 10
const KDBX_PASSWORD_ERROR = '密码必须为 8-16 位，且同时包含大写字母、小写字母和数字'
// Kept only while an entry is in the recycle bin so it can return to its original group.
const ORIGINAL_GROUP_ID_FIELD = 'MarkNotePro.OriginalGroupId'
const ORIGINAL_GROUP_PATH_FIELD = 'MarkNotePro.OriginalGroupPath'
const imageMimeType = (name: string): string | undefined => ({
  avif: 'image/avif',
  gif: 'image/gif',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp'
})[path.extname(name).slice(1).toLowerCase()]

interface VaultSession {
  filePath: string
  vault: Kdbx
  modified: boolean
  isSaving: boolean
  saveChain: Promise<void>
  revision: number
  saveError?: string
}

const sessions = new Map<number, Map<string, VaultSession>>()

const asArrayBuffer = (buffer: Buffer): ArrayBuffer =>
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer


const getId = (value: { toString: () => string }): string => value.toString()

const getWindowSessions = (win: BrowserWindow): Map<string, VaultSession> => {
  let result = sessions.get(win.id)
  if (!result) {
    result = new Map()
    sessions.set(win.id, result)
    win.once('closed', () => sessions.delete(win.id))
  }
  return result
}

const getSession = (win: BrowserWindow, filePath: string): VaultSession => {
  const session = getWindowSessions(win).get(filePath)
  if (!session) throw new Error('请先解锁此密码库')
  return session
}

const isSameOrDescendantPath = (pathname: string, parent: string): boolean => {
  const relative = path.relative(parent, pathname)
  return relative === '' || (!!relative && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

const syncVaultName = (vault: Kdbx, filePath: string): boolean => {
  const expectedName = path.basename(filePath, path.extname(filePath))
  if (!expectedName) return false
  let changed = false
  if (vault.meta.name !== expectedName) {
    vault.meta.name = expectedName
    changed = true
  }
  const defaultGroup = vault.getDefaultGroup()
  if (defaultGroup && defaultGroup.name !== expectedName) {
    defaultGroup.name = expectedName
    defaultGroup.times.update()
    changed = true
  }
  return changed
}

const remapSessionPaths = (win: BrowserWindow, src: string, dest: string): void => {
  const windowSessions = getWindowSessions(win)
  for (const [filePath, session] of [...windowSessions]) {
    if (!isSameOrDescendantPath(filePath, src)) continue
    const nextPath = filePath === src ? dest : path.join(dest, path.relative(src, filePath))
    windowSessions.delete(filePath)
    session.filePath = nextPath
    windowSessions.set(nextPath, session)
    if (syncVaultName(session.vault, nextPath)) {
      markModified(win, session)
      saveSession(win, session)
    } else {
      notifyState(win, session)
    }
  }
}

const getFieldValue = (entry: KdbxEntry, key: string): string => {
  const value = entry.fields.get(key)
  if (!value) return ''
  return value instanceof ProtectedValue ? value.getText() : value
}

const toFields = (entry: KdbxEntry): KdbxField[] =>
  [...entry.fields.entries()].filter(([key]) => key !== ORIGINAL_GROUP_ID_FIELD && key !== ORIGINAL_GROUP_PATH_FIELD).map(([key, value]) => ({
    key,
    value: value instanceof ProtectedValue ? value.getText() : value,
    protected: value instanceof ProtectedValue
  }))

const isInRecycleBin = (entry: KdbxEntry, recycleBinId: string): boolean => {
  let group = entry.parentGroup
  while (group) {
    if (getId(group.uuid) === recycleBinId) return true
    group = group.parentGroup
  }
  return false
}

const groupPath = (entry: KdbxEntry): string[] => {
  const result: string[] = []
  let group = entry.parentGroup
  while (group) {
    result.unshift(group.name || '未命名分组')
    group = group.parentGroup
  }
  return result
}

const binaryValue = (value: unknown): ArrayBuffer | undefined => {
  if (value instanceof ArrayBuffer) return value
  if (value && typeof value === 'object' && 'value' in value) {
    const nested = (value as { value?: unknown }).value
    return nested instanceof ArrayBuffer ? nested : undefined
  }
}

const toAttachments = (entry: KdbxEntry): KdbxAttachment[] =>
  [...entry.binaries.entries()].map(([name, value]) => ({
    name,
    size: binaryValue(value)?.byteLength ?? 0
  }))

const toEntrySummary = (entry: KdbxEntry, recycleBinId = ''): KdbxEntrySummary => ({
  id: getId(entry.uuid),
  groupId: entry.parentGroup ? getId(entry.parentGroup.uuid) : '',
  title: getFieldValue(entry, 'Title'),
  username: getFieldValue(entry, 'UserName'),
  url: getFieldValue(entry, 'URL'),
  notes: getFieldValue(entry, 'Notes'),
  tags: entry.tags || [],
  updatedAt: entry.times.lastModTime?.toISOString() ?? null,
  groupPath: groupPath(entry),
  isRecycleBin: recycleBinId ? isInRecycleBin(entry, recycleBinId) : false,
  urlType: getFieldValue(entry, 'key_url_type') || null
})

const toEntryDetail = (entry: KdbxEntry, recycleBinId = ''): KdbxEntryDetail => ({
  ...toEntrySummary(entry, recycleBinId),
  fields: toFields(entry),
  attachments: toAttachments(entry),
  historyCount: entry.history.length,
  history: entry.history.map((item, index): KdbxEntryHistoryItem => ({
    index,
    title: getFieldValue(item, 'Title'),
    username: getFieldValue(item, 'UserName'),
    updatedAt: item.times.lastModTime?.toISOString() ?? null
  })).sort((left, right) => (right.updatedAt || '').localeCompare(left.updatedAt || '') || right.index - left.index)
})

const toEntryRevision = (entry: KdbxEntry): KdbxEntryRevision => ({
  title: getFieldValue(entry, 'Title'),
  username: getFieldValue(entry, 'UserName'),
  url: getFieldValue(entry, 'URL'),
  notes: getFieldValue(entry, 'Notes'),
  tags: [...(entry.tags || [])],
  fields: toFields(entry),
  attachments: toAttachments(entry),
  updatedAt: entry.times.lastModTime?.toISOString() ?? null
})

const toGroupSummary = (group: KdbxGroup, recycleBinId = '', isRoot = false): KdbxGroupSummary => {
  const groups = group.groups
    .filter((child) => getId(child.uuid) !== recycleBinId)
    .map((child) => toGroupSummary(child, recycleBinId))
  const entries = group.entries.length
  return {
    id: getId(group.uuid),
    name: group.name || '未命名分组',
    isRoot,
    entries,
    totalEntries: entries + groups.reduce((total, child) => total + child.totalEntries, 0),
    groups
  }
}

const allEntries = (groups: KdbxGroup[]): KdbxEntry[] =>
  groups.flatMap((group) => [...group.entries, ...allEntries(group.groups)])

const snapshot = (vault: Kdbx, filePath?: string): KdbxVaultSnapshot => {
  const entries = allEntries(vault.groups)
  const recycleBinId = vault.meta.recycleBinUuid ? getId(vault.meta.recycleBinUuid) : ''
  const recycleBin = recycleBinId ? vault.getGroup(recycleBinId) : undefined
  const expectedName = filePath ? path.basename(filePath, path.extname(filePath)) : ''
  return {
    name: expectedName || vault.meta.name || '密码库',
    groups: vault.groups
      .filter((group) => getId(group.uuid) !== recycleBinId)
      .map((group, index) => toGroupSummary(group, recycleBinId, index === 0)),
    recycleBin: recycleBin ? toGroupSummary(recycleBin, '') : null,
    entries: entries.map((entry) => toEntrySummary(entry, recycleBinId)),
    tags: [...new Set(entries.filter((entry) => !isInRecycleBin(entry, recycleBinId)).flatMap((entry) => entry.tags || []))]
      .sort((a, b) => a.localeCompare(b))
  }
}

const findEntry = (vault: Kdbx, id: string): KdbxEntry | undefined =>
  allEntries(vault.groups).find((entry) => getId(entry.uuid) === id)

const findGroup = (vault: Kdbx, id: string): KdbxGroup | undefined =>
  vault.getGroup(id)

const isSameOrDescendantGroup = (group: KdbxGroup, ancestor: KdbxGroup): boolean => {
  let current: KdbxGroup | undefined = group
  while (current) {
    if (getId(current.uuid) === getId(ancestor.uuid)) return true
    current = current.parentGroup
  }
  return false
}

const groupPathForRestore = (vault: Kdbx, group: KdbxGroup | undefined): string[] => {
  const root = vault.getDefaultGroup()
  const result: string[] = []
  let current = group
  while (current && current !== root) {
    result.unshift(current.name || '未命名分组')
    current = current.parentGroup
  }
  return result
}

const recycleGroupPath = (vault: Kdbx, entry: KdbxEntry): string[] => {
  const binId = recycleBinId(vault)
  const result: string[] = []
  let current = entry.parentGroup
  while (current && getId(current.uuid) !== binId) {
    result.unshift(current.name || '未命名分组')
    current = current.parentGroup
  }
  return result
}

const originalGroupPath = (entry: KdbxEntry): string[] => {
  const raw = getFieldValue(entry, ORIGINAL_GROUP_PATH_FIELD)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.every(item => typeof item === 'string' && item.trim()) ? parsed : []
  } catch {
    return []
  }
}

const rememberOriginalGroup = (vault: Kdbx, entry: KdbxEntry): void => {
  if (!entry.parentGroup) return
  entry.fields.set(ORIGINAL_GROUP_ID_FIELD, getId(entry.parentGroup.uuid))
  entry.fields.set(ORIGINAL_GROUP_PATH_FIELD, JSON.stringify(groupPathForRestore(vault, entry.parentGroup)))
}

const ensureGroupPath = (vault: Kdbx, pathParts: string[]): KdbxGroup => {
  let group = vault.getDefaultGroup()
  for (const name of pathParts) {
    const existing = group.groups.find(child => child.name === name)
    group = existing || vault.createGroup(group, name)
  }
  return group
}

const restoreEntryGroup = (vault: Kdbx, entry: KdbxEntry, restoredGroups = new Map<string, KdbxGroup>()): KdbxGroup => {
  const originalGroupId = getFieldValue(entry, ORIGINAL_GROUP_ID_FIELD)
  const originalPath = originalGroupPath(entry)
  const originalGroup = originalGroupId ? findGroup(vault, originalGroupId) : undefined
  const activeOriginalGroup = originalGroup && !isInRecycleBin({ parentGroup: originalGroup } as KdbxEntry, recycleBinId(vault))
    ? originalGroup
    : undefined
  const targetPath = originalPath.length ? originalPath : activeOriginalGroup ? groupPathForRestore(vault, activeOriginalGroup) : recycleGroupPath(vault, entry)
  const key = originalGroupId ? `id:${originalGroupId}` : `entry:${getId(entry.uuid)}`
  let group = restoredGroups.get(key)
  if (!group) {
    group = activeOriginalGroup || ensureGroupPath(vault, targetPath)
    restoredGroups.set(key, group)
  }
  entry.fields.delete(ORIGINAL_GROUP_ID_FIELD)
  entry.fields.delete(ORIGINAL_GROUP_PATH_FIELD)
  return group
}

const recycleBinId = (vault: Kdbx): string =>
  vault.meta.recycleBinUuid ? getId(vault.meta.recycleBinUuid) : ''

const saveMutation = async(win: BrowserWindow, session: VaultSession): Promise<void> => {
  markModified(win, session)
  await saveSession(win, session)
}

const notifyState = (win: BrowserWindow, session: VaultSession): void => {
  win.webContents.send('mt::kdbx::state', {
    filePath: session.filePath,
    locked: false,
    modified: session.modified,
    isSaved: !session.modified,
    isSaving: session.isSaving,
    ...(session.saveError ? { saveError: session.saveError } : {})
  })
}

const markModified = (win: BrowserWindow, session: VaultSession): void => {
  session.revision += 1
  session.modified = true
  session.saveError = undefined
  notifyState(win, session)
}

const saveSession = async (win: BrowserWindow, session: VaultSession): Promise<void> => {
  const previous = session.saveChain.catch(() => undefined)
  const operation = previous.then(async() => {
    if (!session.modified) return
    session.isSaving = true
    session.saveError = undefined
    notifyState(win, session)
    const revision = session.revision
    try {
      const data = await session.vault.save()
      await writeFile(session.filePath, Buffer.from(data), undefined, undefined)
      // A mutation can arrive while KDBX serialization is in progress. Only
      // mark saved when the persisted bytes cover the latest mutation.
      session.modified = session.revision !== revision
    } catch (error) {
      session.modified = true
      session.saveError = error instanceof Error ? error.message : String(error)
      throw error
    } finally {
      session.isSaving = false
      notifyState(win, session)
    }
  })
  session.saveChain = operation
  return operation
}

const uniqueAttachmentName = (entry: KdbxEntry, name: string): string => {
  const extension = path.extname(name)
  const stem = extension ? name.slice(0, -extension.length) : name
  let uniqueName = name
  let sequence = 2
  while (entry.binaries.has(uniqueName)) uniqueName = `${stem} (${sequence++})${extension}`
  return uniqueName
}

const trimHistory = (entry: KdbxEntry): void => {
  if (entry.history.length > MAX_ENTRY_HISTORY) entry.removeHistory(0, entry.history.length - MAX_ENTRY_HISTORY)
}

const setEntry = async(entry: KdbxEntry, input: KdbxEntryInput, vault: Kdbx, preserveHistory = true): Promise<void> => {
  if (preserveHistory) entry.pushHistory()
  const fields = new Map<string, KdbxField>(
    (input.fields || []).filter((field) => field.key.trim()).map((field) => [field.key.trim(), field])
  )
  const standardFields: KdbxField[] = [
    { key: 'Title', value: input.title, protected: false },
    { key: 'UserName', value: input.username || '', protected: false },
    { key: 'URL', value: input.url || '', protected: false },
    { key: 'Notes', value: input.notes || '', protected: false }
  ]
  for (const field of standardFields) fields.set(field.key, field)
  entry.fields.clear()
  for (const field of fields.values()) {
    entry.fields.set(
      field.key,
      field.protected ? ProtectedValue.fromString(field.value) : field.value
    )
  }
  entry.tags = [...new Set((input.tags || []).map((tag) => tag.trim()).filter(Boolean))]
  const removedAttachments = new Set((input.attachments?.remove || []).filter(Boolean))
  for (const name of removedAttachments) entry.binaries.delete(name)
  for (const attachment of input.attachments?.add || []) {
    const name = attachment.name?.trim()
    if (!name || !(attachment.data instanceof ArrayBuffer)) throw new Error('附件无效')
    entry.binaries.set(uniqueAttachmentName(entry, name), await vault.createBinary(attachment.data))
  }
  if (removedAttachments.size) vault.cleanup({ binaries: true })
  entry.times.update()
  trimHistory(entry)
}

const copyEntryToGroup = async(source: KdbxEntry, targetVault: Kdbx, targetGroup: KdbxGroup): Promise<void> => {
  const target = targetVault.createEntry(targetGroup)
  // Rebuild the entry instead of using KdbxEntry.copyFrom(): copyFrom also
  // copies the UUID, which would create duplicate IDs inside the target vault.
  const attachments = [] as NonNullable<KdbxEntryInput['attachments']>['add']
  for (const [name, value] of source.binaries.entries()) {
    const data = binaryValue(value)
    if (data) attachments.push({ name, data: data.slice(0) })
  }
  await setEntry(target, {
    groupId: getId(targetGroup.uuid),
    title: getFieldValue(source, 'Title'),
    username: getFieldValue(source, 'UserName'),
    url: getFieldValue(source, 'URL'),
    notes: getFieldValue(source, 'Notes'),
    tags: [...(source.tags || [])],
    fields: toFields(source),
    attachments: { add: attachments }
  }, targetVault, false)
}

export const isKdbxFile = (pathname: string): boolean =>
  typeof pathname === 'string' && path.extname(pathname).toLowerCase() === KDBX_EXTENSION

export const openKdbxFile = async (filePath: string, win: BrowserWindow): Promise<void> => {
  if (!isKdbxFile(filePath)) throw new Error(`不是 KDBX 文件: ${filePath}`)
  win.webContents.send('mt::kdbx::opened', { filePath, title: path.basename(filePath) })
}

export const saveKdbxDocuments = async (win: BrowserWindow): Promise<void> => {
  await Promise.all([...getWindowSessions(win).values()].map((session) => saveSession(win, session)))
}

export const registerKdbxHandlers = (): void => {
  ipcMain.handle('mt::kdbx::open', async (event, filePath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('找不到编辑窗口')
    await openKdbxFile(filePath, win)
  })

  ipcMain.handle('mt::kdbx::create', async (event, filePath: string, password: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('找不到编辑窗口')
    if (!isKdbxFile(filePath)) throw new Error('新建密码库必须使用 .kdbx 后缀')
    if (!isKdbxPasswordValid(password)) throw new Error(KDBX_PASSWORD_ERROR)
    const credentials = new KdbxCredentials(ProtectedValue.fromString(password))
    await credentials.ready
    const vault = Kdbx.create(credentials, path.basename(filePath, KDBX_EXTENSION))
    // kdbxweb creates an Argon2 KDF by default but its Node distribution does
    // not bundle an Argon2 implementation. AES-KDF is a standard KDBX choice
    // supported by KeePass, KeePassXC and KeeWeb, and works without a native
    // addon in every MarkNotePro target.
    vault.setKdf(Consts.KdfId.Aes)
    const session: VaultSession = {
      filePath,
      vault,
      modified: true,
      isSaving: false,
      saveChain: Promise.resolve(),
      revision: 1
    }
    getWindowSessions(win).set(filePath, session)
    await saveSession(win, session)
    await openKdbxFile(filePath, win)
    notifyState(win, session)
  })

  ipcMain.handle('mt::kdbx::unlock', async (event, filePath: string, password: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('找不到编辑窗口')
    const credentials = new KdbxCredentials(ProtectedValue.fromString(password))
    await credentials.ready
    const data = await fs.readFile(filePath)
    const vault = await Kdbx.load(asArrayBuffer(data), credentials)
    const needsSave = syncVaultName(vault, filePath)
    const session: VaultSession = {
      filePath,
      vault,
      modified: needsSave,
      isSaving: false,
      saveChain: Promise.resolve(),
      revision: needsSave ? 1 : 0
    }
    getWindowSessions(win).set(filePath, session)
    if (needsSave) {
      await saveSession(win, session)
    }
    notifyState(win, session)
    return snapshot(vault, filePath)
  })

  ipcMain.handle('mt::kdbx::lock', async (event, filePath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    const session = getWindowSessions(win).get(filePath)
    if (session) await saveSession(win, session)
    getWindowSessions(win).delete(filePath)
    win.webContents.send('mt::kdbx::state', {
      filePath,
      locked: true,
      modified: false,
      isSaved: true,
      isSaving: false
    })
  })

  ipcMain.handle('mt::kdbx::reset-password', async (event, filePath: string, currentPassword: string, newPassword: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('找不到编辑窗口')
    if (!isKdbxPasswordValid(newPassword)) throw new Error(KDBX_PASSWORD_ERROR)

    const session = getSession(win, filePath)
    await saveSession(win, session)

    try {
      const currentCredentials = new KdbxCredentials(ProtectedValue.fromString(currentPassword))
      await currentCredentials.ready
      await Kdbx.load(asArrayBuffer(await fs.readFile(filePath)), currentCredentials)
    } catch {
      throw new Error('当前主密码不正确')
    }

    const newCredentials = new KdbxCredentials(ProtectedValue.fromString(newPassword))
    await newCredentials.ready
    session.vault.credentials = newCredentials
    await saveMutation(win, session)

    // Confirm the persisted bytes can be unlocked with the replacement password.
    const verificationCredentials = new KdbxCredentials(ProtectedValue.fromString(newPassword))
    await verificationCredentials.ready
    await Kdbx.load(asArrayBuffer(await fs.readFile(filePath)), verificationCredentials)
  })

  ipcMain.handle('mt::kdbx::snapshot', (event, filePath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('找不到编辑窗口')
    const session = getWindowSessions(win).get(filePath)
    return session ? snapshot(session.vault, session.filePath) : null
  })

  ipcMain.handle('mt::kdbx::entry', (event, filePath: string, entryId: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('找不到编辑窗口')
    const session = getSession(win, filePath)
    const entry = findEntry(session.vault, entryId)
    return entry ? toEntryDetail(entry, recycleBinId(session.vault)) : null
  })

  ipcMain.handle('mt::kdbx::save', async (event, filePath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('找不到编辑窗口')
    await saveSession(win, getSession(win, filePath))
  })

  ipcMain.handle('mt::kdbx::create-group', async(event, filePath: string, parentId: string, name: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('找不到编辑窗口')
    const session = getSession(win, filePath)
    const parent = findGroup(session.vault, parentId) || session.vault.getDefaultGroup()
    if (!name.trim()) throw new Error('分组名称不能为空')
    session.vault.createGroup(parent, name.trim())
    await saveMutation(win, session)
    return snapshot(session.vault, session.filePath)
  })

  ipcMain.handle('mt::kdbx::rename-group', async(event, filePath: string, groupId: string, name: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('找不到编辑窗口')
    const session = getSession(win, filePath)
    const group = findGroup(session.vault, groupId)
    if (!group) throw new Error('找不到此密钥组')
    if (group === session.vault.getDefaultGroup()) throw new Error('不能重命名根密钥组')
    if (!name.trim()) throw new Error('分组名称不能为空')
    group.name = name.trim()
    group.times.update()
    await saveMutation(win, session)
    return snapshot(session.vault, session.filePath)
  })

  ipcMain.handle('mt::kdbx::move-group', async(event, filePath: string, groupId: string, targetGroupId: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('找不到编辑窗口')
    const session = getSession(win, filePath)
    const group = findGroup(session.vault, groupId)
    const target = findGroup(session.vault, targetGroupId)
    if (!group || group === session.vault.getDefaultGroup()) throw new Error('不能移动根密钥组')
    if (!target || isInRecycleBin({ parentGroup: target } as KdbxEntry, recycleBinId(session.vault))) throw new Error('请选择正常密钥组作为目标')
    if (isSameOrDescendantGroup(target, group)) throw new Error('不能移动到当前密钥组或其子密钥组')
    session.vault.move(group, target)
    await saveMutation(win, session)
    return snapshot(session.vault, session.filePath)
  })

  ipcMain.handle('mt::kdbx::delete-group', async(event, filePath: string, groupId: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('找不到编辑窗口')
    const session = getSession(win, filePath)
    const group = findGroup(session.vault, groupId)
    if (!group || group === session.vault.getDefaultGroup()) throw new Error('不能删除根密钥组')
    const binId = recycleBinId(session.vault)
    if (getId(group.uuid) === binId) throw new Error('请使用清空回收站')
    if (isInRecycleBin({ parentGroup: group } as KdbxEntry, binId)) {
      session.vault.move(group, undefined)
      session.vault.cleanup({ binaries: true })
    } else {
      allEntries([group]).forEach(entry => rememberOriginalGroup(session.vault, entry))
      session.vault.remove(group)
    }
    await saveMutation(win, session)
    return snapshot(session.vault, session.filePath)
  })

  ipcMain.handle('mt::kdbx::empty-recycle-bin', async(event, filePath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('找不到编辑窗口')
    const session = getSession(win, filePath)
    const binId = recycleBinId(session.vault)
    const bin = binId ? findGroup(session.vault, binId) : undefined
    if (bin) session.vault.move(bin, undefined)
    session.vault.createRecycleBin()
    session.vault.cleanup({ binaries: true })
    await saveMutation(win, session)
    return snapshot(session.vault, session.filePath)
  })

  ipcMain.handle('mt::kdbx::create-entry', async(event, filePath: string, input: KdbxEntryInput) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('找不到编辑窗口')
    const session = getSession(win, filePath)
    const group = findGroup(session.vault, input.groupId) || session.vault.getDefaultGroup()
    if (isInRecycleBin({ parentGroup: group } as KdbxEntry, recycleBinId(session.vault))) throw new Error('不能在回收站中新建条目')
    const entry = session.vault.createEntry(group)
    await setEntry(entry, input, session.vault, false)
    await saveMutation(win, session)
    return toEntryDetail(entry, recycleBinId(session.vault))
  })

  ipcMain.handle('mt::kdbx::commit-entry', async (event, filePath: string, entryId: string, input: KdbxEntryInput) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('找不到编辑窗口')
    const session = getSession(win, filePath)
    const entry = findEntry(session.vault, entryId)
    if (!entry) throw new Error('找不到此密钥条目')
    await setEntry(entry, input, session.vault)
    await saveMutation(win, session)
    return toEntryDetail(entry, recycleBinId(session.vault))
  })

  ipcMain.handle('mt::kdbx::update-entry', async(event, filePath: string, entryId: string, input: KdbxEntryInput) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('找不到编辑窗口')
    const session = getSession(win, filePath)
    const entry = findEntry(session.vault, entryId)
    if (!entry) throw new Error('找不到此密钥条目')
    await setEntry(entry, input, session.vault)
    markModified(win, session)
    return toEntryDetail(entry)
  })

  ipcMain.handle('mt::kdbx::delete-entry', async(event, filePath: string, entryId: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('找不到编辑窗口')
    const session = getSession(win, filePath)
    const entry = findEntry(session.vault, entryId)
    if (!entry) throw new Error('找不到此密钥条目')
    if (isInRecycleBin(entry, recycleBinId(session.vault))) {
      session.vault.move(entry, undefined)
      session.vault.cleanup({ binaries: true })
    } else {
      rememberOriginalGroup(session.vault, entry)
      session.vault.remove(entry)
    }
    await saveMutation(win, session)
    return snapshot(session.vault, session.filePath)
  })

  ipcMain.handle('mt::kdbx::move-entries', async(event, filePath: string, entryIds: string[], targetGroupId: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('找不到编辑窗口')
    const session = getSession(win, filePath)
    const target = findGroup(session.vault, targetGroupId)
    if (!target || isInRecycleBin({ parentGroup: target } as KdbxEntry, recycleBinId(session.vault))) throw new Error('请选择正常密钥组作为目标')
    const binId = recycleBinId(session.vault)
    const entries = [...new Set(entryIds)]
      .map(entryId => findEntry(session.vault, entryId))
      .filter((entry): entry is KdbxEntry => !!entry && !isInRecycleBin(entry, binId))
    if (entries.length === 0) throw new Error('请选择至少一个正常密钥条目')
    entries.forEach(entry => session.vault.move(entry, target))
    await saveMutation(win, session)
    return snapshot(session.vault, session.filePath)
  })

  ipcMain.handle('mt::kdbx::restore-entry', async(event, filePath: string, entryId: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('找不到编辑窗口')
    const session = getSession(win, filePath)
    const entry = findEntry(session.vault, entryId)
    if (!entry) throw new Error('找不到此密钥条目')
    if (!isInRecycleBin(entry, recycleBinId(session.vault))) throw new Error('此条目不在回收站中')
    session.vault.move(entry, restoreEntryGroup(session.vault, entry))
    await saveMutation(win, session)
    return snapshot(session.vault, session.filePath)
  })

  ipcMain.handle('mt::kdbx::restore-entries', async(event, filePath: string, entryIds: string[]) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('找不到编辑窗口')
    const session = getSession(win, filePath)
    const binId = recycleBinId(session.vault)
    const entries = [...new Set(entryIds)]
      .map(entryId => findEntry(session.vault, entryId))
      .filter((entry): entry is KdbxEntry => !!entry && isInRecycleBin(entry, binId))
    if (entries.length === 0) throw new Error('请选择至少一个回收站密钥条目')
    const restoredGroups = new Map<string, KdbxGroup>()
    entries.forEach(entry => session.vault.move(entry, restoreEntryGroup(session.vault, entry, restoredGroups)))
    await saveMutation(win, session)
    return snapshot(session.vault, session.filePath)
  })

  ipcMain.handle('mt::kdbx::history-entry', (event, filePath: string, entryId: string, historyIndex: number) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('找不到编辑窗口')
    const entry = findEntry(getSession(win, filePath).vault, entryId)
    const historicalEntry = entry?.history[historyIndex]
    if (!historicalEntry) throw new Error('找不到历史版本')
    return toEntryRevision(historicalEntry)
  })

  ipcMain.handle('mt::kdbx::restore-history', async(event, filePath: string, entryId: string, historyIndex: number) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('找不到编辑窗口')
    const session = getSession(win, filePath)
    const entry = findEntry(session.vault, entryId)
    const historicalEntry = entry?.history[historyIndex]
    if (!entry || !historicalEntry) throw new Error('找不到历史版本')
    entry.pushHistory()
    entry.copyFrom(historicalEntry)
    entry.times.update()
    trimHistory(entry)
    await saveMutation(win, session)
    return toEntryDetail(entry, recycleBinId(session.vault))
  })

  ipcMain.handle('mt::kdbx::delete-history', async(event, filePath: string, entryId: string, historyIndex: number) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('找不到编辑窗口')
    const session = getSession(win, filePath)
    const entry = findEntry(session.vault, entryId)
    if (!entry || !entry.history[historyIndex]) throw new Error('找不到历史版本')
    entry.removeHistory(historyIndex)
    entry.times.update()
    await saveMutation(win, session)
    return toEntryDetail(entry, recycleBinId(session.vault))
  })

  ipcMain.handle('mt::kdbx::read-attachment', (event, filePath: string, entryId: string, name: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('找不到编辑窗口')
    const entry = findEntry(getSession(win, filePath).vault, entryId)
    const value = entry?.binaries.get(name)
    const data = binaryValue(value)
    if (!data) throw new Error('无法读取此附件')
    return data.slice(0)
  })

  ipcMain.handle('mt::kdbx::preview-attachment', (event, filePath: string, entryId: string, name: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('找不到编辑窗口')
    const mimeType = imageMimeType(name)
    if (!mimeType) throw new Error('此附件不支持预览')
    const entry = findEntry(getSession(win, filePath).vault, entryId)
    const data = binaryValue(entry?.binaries.get(name))
    if (!data) throw new Error('无法读取此附件')
    return `data:${mimeType};base64,${Buffer.from(data).toString('base64')}`
  })

  ipcMain.handle('mt::kdbx::export-entries', async(event, filePath: string, entryIds: string[], extractionCode: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('找不到编辑窗口')
    if (!isKdbxPasswordValid(extractionCode)) throw new Error(KDBX_PASSWORD_ERROR)
    const session = getSession(win, filePath)
    const binId = recycleBinId(session.vault)
    const ids = [...new Set(entryIds)]
    const entries = ids
      .map((entryId) => findEntry(session.vault, entryId))
      .filter((entry): entry is KdbxEntry => !!entry && !isInRecycleBin(entry, binId))
    if (entries.length === 0) throw new Error('请选择至少一个非回收站密钥条目')
    const result = await dialog.showSaveDialog(win, {
      title: '导出密钥',
      defaultPath: path.join(path.dirname(filePath), `${path.basename(filePath, KDBX_EXTENSION)}-keys${KDBXE_EXTENSION}`),
      filters: [{ name: 'MarkNotePro 密钥导出', extensions: [KDBXE_EXTENSION.slice(1)] }]
    })
    if (result.canceled || !result.filePath) return false
    const credentials = new KdbxCredentials(ProtectedValue.fromString(extractionCode))
    await credentials.ready
    const exportedVault = Kdbx.create(credentials, 'MarkNotePro 导出')
    exportedVault.setKdf(Consts.KdfId.Aes)
    const rootGroup = exportedVault.getDefaultGroup()
    for (const entry of entries) await copyEntryToGroup(entry, exportedVault, rootGroup)
    await writeFile(result.filePath, Buffer.from(await exportedVault.save()), KDBXE_EXTENSION, undefined)
    return true
  })

  ipcMain.handle('mt::kdbx::select-import-file', async(event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('找不到编辑窗口')
    const result = await dialog.showOpenDialog(win, {
      title: '导入密钥',
      properties: ['openFile'],
      filters: [{ name: 'MarkNotePro 密钥导出', extensions: [KDBXE_EXTENSION.slice(1)] }]
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

  ipcMain.handle('mt::kdbx::import-entries', async(event, filePath: string, groupId: string, importFilePath: string, extractionCode: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('找不到编辑窗口')
    if (!importFilePath.toLowerCase().endsWith(KDBXE_EXTENSION)) throw new Error('请选择 .kdbxe 密钥导出文件')
    if (!extractionCode.trim()) throw new Error('请输入提取码')
    const session = getSession(win, filePath)
    const group = findGroup(session.vault, groupId) || session.vault.getDefaultGroup()
    if (isInRecycleBin({ parentGroup: group } as KdbxEntry, recycleBinId(session.vault))) throw new Error('不能导入到回收站')
    let importedVault: Kdbx
    try {
      const credentials = new KdbxCredentials(ProtectedValue.fromString(extractionCode))
      await credentials.ready
      importedVault = await Kdbx.load(asArrayBuffer(await fs.readFile(importFilePath)), credentials)
    } catch {
      throw new Error('提取码错误或密钥导出文件已损坏')
    }
    const importedEntries = allEntries(importedVault.groups)
    if (importedEntries.length === 0) throw new Error('密钥导出文件没有可导入的条目')
    for (const entry of importedEntries) await copyEntryToGroup(entry, session.vault, group)
    await saveMutation(win, session)
    return snapshot(session.vault, session.filePath)
  })

  ipcMain.on('mt::sidebar-path-renamed', (event, payload: { src?: string; dest?: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const { src, dest } = payload ?? {}
    if (win && src && dest && src !== dest) remapSessionPaths(win, src, dest)
  })
}
