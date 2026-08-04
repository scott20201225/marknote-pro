import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { BrowserWindow, dialog, shell, type OpenDialogOptions } from 'electron'
import log from 'electron-log'
import { isFile2 } from 'common/filesystem'
import { isDangerousExecutableFile } from 'common/filesystem/paths'
import { URL_REG, isOsx, isWindows } from '../config'
import { t } from '../i18n'

export interface LocalLinkTarget {
  pathname: string
  line?: number
}

interface LinkOpenWithPreferenceAccessors {
  get(): Record<string, string>
  set(value: Record<string, string>): void
}

let preferenceAccessors: LinkOpenWithPreferenceAccessors | null = null

export const configureLinkOpenWithPreferences = (
  accessors: LinkOpenWithPreferenceAccessors
): void => {
  preferenceAccessors = accessors
}

const getOpenWithKey = (pathname: string): string => {
  const ext = path.extname(pathname).toLowerCase()
  return ext || '__no_extension__'
}

const getOpenWithMap = (): Record<string, string> => {
  const value = preferenceAccessors?.get()
  return value && typeof value === 'object' ? { ...value } : {}
}

const saveOpenWithApplication = (pathname: string, applicationPath: string): void => {
  if (!preferenceAccessors || !applicationPath) return
  const map = getOpenWithMap()
  map[getOpenWithKey(pathname)] = applicationPath
  preferenceAccessors.set(map)
}

const parseLineReference = (value: string): number | undefined => {
  const match = value.match(/^(?:L|line=)?(\d+)$/i)
  if (!match) return undefined
  const line = Number(match[1])
  return Number.isInteger(line) && line > 0 ? line : undefined
}

const splitLineSuffix = (value: string): { value: string; line?: number } => {
  const suffixMatch = value.match(/^(.*):(\d+)(?::\d+)?$/)
  if (!suffixMatch) return { value }

  const line = Number(suffixMatch[2])
  if (!Number.isInteger(line) || line <= 0) return { value }

  return {
    value: suffixMatch[1],
    line
  }
}

const splitLocalPathLineReference = (value: string): { value: string; line?: number } => {
  let parsed = splitHashLineReference(value)
  const hashLine = parsed.line
  parsed = splitQueryLineReference(parsed.value)
  const queryLine = parsed.line
  parsed = splitLineSuffix(parsed.value)

  return {
    value: parsed.value,
    line: hashLine ?? queryLine ?? parsed.line
  }
}

const splitHashLineReference = (value: string): { value: string; line?: number } => {
  const hashIndex = value.indexOf('#')
  if (hashIndex < 0) return { value }

  const line = parseLineReference(value.slice(hashIndex + 1))
  if (!line) return { value }

  return {
    value: value.slice(0, hashIndex),
    line
  }
}

const splitQueryLineReference = (value: string): { value: string; line?: number } => {
  const queryIndex = value.indexOf('?')
  if (queryIndex < 0) return { value }

  const query = new URLSearchParams(value.slice(queryIndex + 1))
  const line = parseLineReference(query.get('line') || query.get('L') || '')
  if (!line) return { value }

  return {
    value: value.slice(0, queryIndex),
    line
  }
}

export const normalizeLinkUrlCandidate = (rawUrl: string): string =>
  rawUrl.replace(/^<(.+)>$/, '$1')

export const resolveLocalLinkTarget = (
  rawUrl: string,
  dirname?: string
): LocalLinkTarget | null => {
  if (!rawUrl) return null

  const urlCandidate = normalizeLinkUrlCandidate(rawUrl)
  if (URL_REG.test(urlCandidate)) return null

  const protocolMatch = urlCandidate.match(/^([a-z][a-z\d+.-]*):\/\//i)
  if (protocolMatch && protocolMatch[1].toLowerCase() !== 'file') return null

  try {
    if (protocolMatch?.[1].toLowerCase() === 'file') {
      const url = new URL(urlCandidate)
      const pathnameWithPossibleLine = fileURLToPath(url)
      const parsed = splitLineSuffix(pathnameWithPossibleLine)
      const line =
        parseLineReference(url.hash.replace(/^#/, '')) ??
        parseLineReference(url.searchParams.get('line') || url.searchParams.get('L') || '') ??
        parsed.line
      return {
        pathname: path.normalize(parsed.value),
        line
      }
    }

    const parsed = splitLocalPathLineReference(urlCandidate)
    let pathname = decodeURIComponent(parsed.value)
    if (dirname && !path.isAbsolute(pathname)) {
      pathname = path.join(dirname, pathname)
    }

    return {
      pathname: path.normalize(pathname),
      line: parsed.line
    }
  } catch (err) {
    log.warn('Failed to resolve local link target:', err)
    return null
  }
}

export const canOpenLocalLinkWithApplication = (
  target: LocalLinkTarget | null
): target is LocalLinkTarget =>
  !!target?.pathname && isFile2(target.pathname)

const getApplicationDialogOptions = (target: LocalLinkTarget): OpenDialogOptions => {
  if (isOsx) {
    return {
      title: t('dialog.selectOpenWithApplication'),
      defaultPath: '/Applications',
      message: path.basename(target.pathname),
      properties: ['openFile'],
      filters: [{ name: 'Applications', extensions: ['app'] }]
    }
  }

  if (isWindows) {
    return {
      title: t('dialog.selectOpenWithApplication'),
      defaultPath: 'C:\\Program Files',
      properties: ['openFile'],
      filters: [{ name: 'Applications', extensions: ['exe', 'cmd', 'bat'] }]
    }
  }

  return {
    title: t('dialog.selectOpenWithApplication'),
    defaultPath: '/usr/bin',
    properties: ['openFile']
  }
}

const chooseApplication = async (
  win: BrowserWindow,
  target: LocalLinkTarget
): Promise<string | null> => {
  const { canceled, filePaths } = await dialog.showOpenDialog(
    win,
    getApplicationDialogOptions(target)
  )
  if (canceled || !filePaths[0]) return null
  return filePaths[0]
}

const findNearestProjectRoot = (pathname: string): string | null => {
  let current = path.dirname(pathname)
  while (current && current !== path.dirname(current)) {
    if (
      fs.existsSync(path.join(current, '.idea')) ||
      fs.existsSync(path.join(current, '.git'))
    ) {
      return current
    }
    current = path.dirname(current)
  }
  return null
}

const getKnownEditorArgs = (applicationPath: string, target: LocalLinkTarget): string[] | null => {
  const name = path.basename(applicationPath).toLowerCase()
  const pathWithLine = `${target.pathname}:${target.line}`

  if (/(visual studio code|code|cursor|windsurf)/.test(name)) {
    return target.line ? ['-g', pathWithLine] : [target.pathname]
  }

  if (/sublime/.test(name)) {
    return [target.line ? pathWithLine : target.pathname]
  }

  if (/(intellij|idea|webstorm|pycharm|goland|rubymine|clion|phpstorm|rider)/.test(name)) {
    const projectRoot = findNearestProjectRoot(target.pathname)
    const args = projectRoot ? [projectRoot] : []
    if (target.line) {
      args.push('--line', String(target.line))
    }
    args.push(target.pathname)
    return args
  }

  return null
}

const spawnDetached = (command: string, args: string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      shell: isWindows && /\.(?:cmd|bat)$/i.test(command)
    })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })

const getMacOSAppExecutable = (applicationPath: string): string | null => {
  if (!isOsx || !applicationPath.toLowerCase().endsWith('.app')) return null

  const appName = path.basename(applicationPath, '.app')
  const candidates = [
    path.join(applicationPath, 'Contents', 'MacOS', appName),
    ...[
      'idea',
      'webstorm',
      'pycharm',
      'goland',
      'clion',
      'phpstorm',
      'rubymine',
      'rider',
      'cursor',
      'Electron'
    ].map(name => path.join(applicationPath, 'Contents', 'MacOS', name))
  ]

  return candidates.find(candidate => fs.existsSync(candidate)) ?? null
}

const openWithApplication = async (
  applicationPath: string,
  target: LocalLinkTarget
): Promise<void> => {
  const knownEditorArgs = getKnownEditorArgs(applicationPath, target)

  if (isOsx && applicationPath.toLowerCase().endsWith('.app')) {
    const executable = getMacOSAppExecutable(applicationPath)
    if (knownEditorArgs && executable) {
      await spawnDetached(executable, knownEditorArgs)
      return
    }

    const args = knownEditorArgs
      ? ['-a', applicationPath, '--args', ...knownEditorArgs]
      : ['-a', applicationPath, target.pathname]
    await spawnDetached('/usr/bin/open', args)
    return
  }

  await spawnDetached(applicationPath, knownEditorArgs ?? [target.pathname])
}

const confirmDangerousLocalLink = async (
  win: BrowserWindow,
  target: LocalLinkTarget
): Promise<boolean> => {
  if (!isDangerousExecutableFile(target.pathname)) return true

  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: [t('dialog.cancel'), t('dialog.openAnyway')],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    title: t('dialog.unsafeFileTitle'),
    message: t('dialog.unsafeFileMessage'),
    detail: t('dialog.unsafeFileDetail', { name: path.basename(target.pathname) })
  })
  return response === 1
}

export const openLocalLinkWithApplication = async (
  win: BrowserWindow,
  target: LocalLinkTarget,
  options: { chooseApplication?: boolean } = {}
): Promise<boolean> => {
  if (!canOpenLocalLinkWithApplication(target)) return false
  if (!(await confirmDangerousLocalLink(win, target))) return true

  const savedApplicationPath = getOpenWithMap()[getOpenWithKey(target.pathname)]
  let applicationPath =
    !options.chooseApplication && savedApplicationPath && fs.existsSync(savedApplicationPath)
      ? savedApplicationPath
      : null

  if (!applicationPath) {
    applicationPath = await chooseApplication(win, target)
    if (!applicationPath) return true
    saveOpenWithApplication(target.pathname, applicationPath)
  }

  try {
    await openWithApplication(applicationPath, target)
    return true
  } catch (err) {
    log.error('Failed to open local link with application:', err)
    await shell.openPath(target.pathname)
    return true
  }
}
