import fs from 'fs-extra'
import { statSync, constants, type Stats } from 'fs'
import { createHash } from 'crypto'
import { ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { isFile as commonIsFile, isDirectory as commonIsDirectory } from 'common/filesystem'

interface SerializedStat {
  size: number
  mtimeMs: number
  ctimeMs: number
  isFile: boolean
  isDirectory: boolean
  isSymbolicLink: boolean
}

const serializeStat = (stats: Stats): SerializedStat => ({
  size: stats.size,
  mtimeMs: stats.mtimeMs,
  ctimeMs: stats.ctimeMs,
  isFile: stats.isFile(),
  isDirectory: stats.isDirectory(),
  isSymbolicLink: stats.isSymbolicLink()
})

const toBuffer = (data: unknown): unknown => {
  if (data == null) return data
  if (Buffer.isBuffer(data)) return data
  if (data instanceof Uint8Array) return Buffer.from(data)
  if (typeof data === 'string') return data
  if (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: string }).type === 'Buffer' &&
    Array.isArray((data as { data?: unknown }).data)
  ) {
    return Buffer.from((data as { data: number[] }).data)
  }
  return data
}

export const normalizeIpcPath = (value: string): string => {
  if (!value || typeof value !== 'string') {
    throw new Error('Invalid path')
  }

  let pathname = value.trim()
  if (!pathname) {
    throw new Error('Invalid path')
  }

  if (pathname.startsWith('file://')) {
    pathname = fileURLToPath(pathname)
  }

  if (process.platform === 'win32') {
    pathname = pathname.replace(/\//g, '\\')
    pathname = pathname.replace(/^\\([A-Za-z]:\\)/, '$1')
  }

  return path.normalize(pathname)
}

const tryNormalizeIpcPath = (value: string): string | null => {
  try {
    return normalizeIpcPath(value)
  } catch {
    return null
  }
}

const shouldFallbackMove = (err: unknown): boolean => {
  const code = (err as NodeJS.ErrnoException | undefined)?.code
  return code === 'EPERM' || code === 'EACCES' || code === 'EXDEV' || code === 'ENOTEMPTY'
}

const moveWithFallback = async (src: string, dest: string): Promise<void> => {
  const srcPath = normalizeIpcPath(src)
  const destPath = normalizeIpcPath(dest)

  if (await fs.pathExists(destPath)) {
    throw new Error(`Destination already exists: ${destPath}`)
  }

  try {
    await fs.rename(srcPath, destPath)
    return
  } catch (err) {
    if (!shouldFallbackMove(err)) {
      throw err
    }
  }

  try {
    await fs.copy(srcPath, destPath, { overwrite: false, errorOnExist: true })
    await fs.remove(srcPath)
  } catch (err) {
    await fs.remove(destPath).catch(() => undefined)
    throw err
  }
}

export const registerFsHandlers = (): void => {
  ipcMain.handle('mt::fs::is-file', (_e, p: string) => {
    const pathname = tryNormalizeIpcPath(p)
    return pathname ? commonIsFile(pathname) : false
  })
  ipcMain.handle('mt::fs::is-directory', (_e, p: string) => {
    const pathname = tryNormalizeIpcPath(p)
    return pathname ? commonIsDirectory(pathname) : false
  })
  ipcMain.handle('mt::fs::empty-dir', (_e, p: string) => fs.emptyDir(normalizeIpcPath(p)))
  ipcMain.handle('mt::fs::copy', (_e, src: string, dest: string) =>
    fs.copy(normalizeIpcPath(src), normalizeIpcPath(dest))
  )
  ipcMain.handle('mt::fs::ensure-dir', (_e, p: string) => fs.ensureDir(normalizeIpcPath(p)))

  ipcMain.handle('mt::fs::output-file', (_e, p: string, data: unknown) =>
    fs.outputFile(normalizeIpcPath(p), toBuffer(data) as string | NodeJS.ArrayBufferView)
  )
  ipcMain.handle('mt::fs::move', (_e, src: string, dest: string) => moveWithFallback(src, dest))
  ipcMain.handle('mt::fs::stat', async (_e, p: string) =>
    serializeStat(await fs.stat(normalizeIpcPath(p)))
  )

  ipcMain.handle('mt::fs::write-file', (_e, p: string, data: unknown) =>
    fs.writeFile(normalizeIpcPath(p), toBuffer(data) as string | NodeJS.ArrayBufferView)
  )
  ipcMain.handle('mt::fs::read-file', async (_e, p: string, encoding?: BufferEncoding) => {
    const buf = await fs.readFile(normalizeIpcPath(p), encoding)
    return buf
  })
  ipcMain.handle('mt::fs::md5-file', async (_e, p: string) => {
    const buf = await fs.readFile(normalizeIpcPath(p))
    return createHash('md5').update(buf).digest('hex')
  })
  ipcMain.handle('mt::fs::md5-data', (_e, data: unknown) => {
    const buf = toBuffer(data)
    return createHash('md5')
      .update(buf as string | NodeJS.ArrayBufferView)
      .digest('hex')
  })
  ipcMain.handle('mt::fs::path-exists', (_e, p: string) => {
    const pathname = tryNormalizeIpcPath(p)
    return pathname ? fs.pathExists(pathname) : false
  })
  ipcMain.handle('mt::fs::unlink', (_e, p: string) => fs.unlink(normalizeIpcPath(p)))
  ipcMain.handle('mt::fs::readdir', (_e, p: string) => fs.readdir(normalizeIpcPath(p)))
  ipcMain.handle('mt::fs::is-executable', (_e, p: string) => {
    try {
      const stat = statSync(normalizeIpcPath(p))
      if (process.platform === 'win32') return stat.isFile()
      return (
        stat.isFile() &&
        (stat.mode & (constants.S_IXUSR | constants.S_IXGRP | constants.S_IXOTH)) !== 0
      )
    } catch {
      return false
    }
  })
}
